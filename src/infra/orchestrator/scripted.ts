// ScriptedOrchestrator — a deterministic OrchestratorPort for tests and the v0
// composition root (S7 D-01/D-06). It models the human-in-the-loop run as a
// per-run state machine; every step emits context-tagged DomainEvents to the
// injected DomainEventSink (it never writes the DB itself). All sink calls are
// awaited so emission ordering is fully deterministic. The live Claude-CLI
// adapter (Phase 5b) implements the same port with the same emission shape.
//
// v0.0.2: when a launch carries role="generator", the run is the gen half of a
// gen→gate→eval step — it emits a typed BriefOut (ResultEmitted + completeness)
// and leaves the gate + evaluator launch to the app EngineService. launchEval
// then emits the evaluator's verdict (addressed) and, per scenario, a descope
// QuestionRaised for a gap. Role-less launches keep the v0.0.1 ask→result flow.
import type {
  OrchestratorPort,
  RunLaunch,
  EvalLaunch,
  ResumeRun,
  RetryLaunch,
  DomainEventSink,
  RunContext,
} from "../../app/ports/orchestrator";
import type { DomainEvent } from "../../domain/events/events";
import type { RunId } from "../../domain/shared/ids";
import type { Requirement } from "../../domain/review/brief";
import { buildRunContext, type LaunchLike } from "./shared";
import { aidlcResultToEvents } from "./live";
import type { AidlcResult } from "../../wire/aidlc-result";
import type { ReconstructionProposal } from "../../wire/aidlc-wire";

export type ScriptedScenario =
  | "happy"
  | "stall-first"
  // gen→gate→eval scenarios (v0.0.2): the generator emits a BriefOut; launchEval
  // emits the evaluator verdict. "complete" addresses every requirement (→ allow
  // done); "descope" leaves one gap WITH a reasoned descope request (→ await-
  // descope); "gap" leaves the SAME gap with NO request (→ auto-rework: the run
  // stalls loud, no human card — Q-02 / 原則#6「理由のない見送りは発生しない」).
  | "gen-eval-complete"
  | "gen-eval-descope"
  | "gen-eval-gap"
  // Unit-04: multi-turn hearing parity (C6). Resume with body on turn 1 emits a
  // FOLLOW-UP QuestionRaised (the AI asks another question) before concluding on
  // turn 2 with a ResultEmitted. Only this scenario does the follow-up; the
  // default "happy" (and gen-eval) scenarios conclude a hearing in ONE turn so
  // the v0 single-turn answer→review flow (loop happy path) stays intact.
  | "multi-turn"
  // BU-2: aidlc-result envelope parity (C6). Each launch builds an AidlcResult
  // and emits via the SAME aidlcResultToEvents mapper the live adapter uses, so
  // scripted and live produce identical events from an envelope (§C7.4).
  | "aidlc-result-done"
  | "aidlc-result-needs-human"
  | "aidlc-result-stalled"
  | "aidlc-result-questions"
  // BU-3: config-hearing scenario (C6 parity / §C7.6). The run emits 2 config
  // questions, each carrying a target:{step, field, scope}. Answering them writes
  // deterministically to StepContracts. After all questions are answered (via the
  // batch resume gate), the run concludes with a ResultEmitted.
  | "config-hearing"
  // S9 visual evidence: missing-context scenario. Same ask→resume flow as "happy"
  // but the ResultEmitted includes a summary block whose body starts with the
  // MISSING_CTX_BODY_PREFIX sentinel ("⚠ missing-context ...") so that
  // ReviewDetail.normaliseMissingContext converts it to a missing-context banner.
  | "missing-context"
  // US-08: pipeline reconstruction proposal scenarios.
  // "reconstruction" — cycle-scoped proposal: S4 deleted + CUSTOM-QA added + S1/S2/S3 kept.
  //   Emits ReconstructionProposalEmitted then concludes with ResultEmitted.
  // "reconstruction-global" — global-scoped proposal: all steps tagged "current".
  //   Emits ReconstructionProposalEmitted (scope:"global") then concludes with ResultEmitted.
  | "reconstruction"
  | "reconstruction-global";

type RunPhase = "asked" | "reviewed" | "stalled" | "done";

export interface ScriptedOptions {
  readonly sink: DomainEventSink;
  readonly scenario?: ScriptedScenario;
}

/**
 * Unit-04: simulated session_id returned from a scripted launch/resume for
 * testing the session-persist and --resume wiring. Exported so tests can
 * assert against it without hard-coding the string in two places.
 */
export const SCRIPTED_SESSION_ID = "scripted-session-id-001";

// Fixed requirement set the scripted gen→gate→eval scenarios reason over.
const SCRIPTED_REQUIREMENTS: readonly Requirement[] = [
  { key: "r1", text: "要件1: 一覧が表示される" },
  { key: "r2", text: "要件2: 空状態が表示される" },
];

const SCRIPTED_BLOCKS = [
  {
    type: "summary" as const,
    title: "直したこと",
    body: "一覧と空状態の両方を表示するようにした。要件の取りこぼしはない。",
  },
  { type: "screenshot" as const, src: "screenshots/x.png", caption: "実際に動いた画面" },
  {
    type: "risk" as const,
    level: "med" as const,
    note: "変わったところ: 一覧の表示処理(空のときの分岐を追加)",
  },
  { type: "video" as const, src: "videos/x.mp4", poster: "screenshots/x.png" },
];

/**
 * BU-3: deterministic config-hearing question ids (exported for test assertions).
 * These are the two config questions the "config-hearing" scenario emits at launch.
 */
export const CONFIG_HEARING_Q1_ID = "config-q1-profileKind";
export const CONFIG_HEARING_Q2_ID = "config-q2-humanGateMode";

/**
 * US-08: deterministic reconstruction proposals for the "reconstruction" and
 * "reconstruction-global" scenarios. Exported so integration tests can assert
 * the exact proposal shape without re-creating it in the test file.
 *
 * "reconstruction" (cycle-scoped):
 *   S1/S2/S3 kept, S4 deleted (今サイクル技術仕様不要), CUSTOM-QA added.
 * "reconstruction-global" (global-scoped):
 *   S1/S2/S3/S4 all tagged "current" (replace project default pipeline wholesale).
 */
export const SCRIPTED_RECONSTRUCTION_PROPOSAL_CYCLE: ReconstructionProposal = {
  scope: "cycle",
  steps: [
    { id: "S1", label: "要件ヒアリング", order: 0, skillRef: "kit/skills/aidlc-s1-requirements", instruction: "S1: 要件を構造化 US に展開する。", diff: "keep" },
    { id: "S2", label: "画面要素", order: 1, skillRef: "kit/skills/aidlc-s2-wireframe", instruction: "S2: ワイヤーフレームを生成する。", diff: "keep" },
    { id: "S3", label: "UIデザイン", order: 2, skillRef: "kit/skills/aidlc-s3-ui-design", instruction: "S3: 本格 UI デザインを生成する。", diff: "keep" },
    { id: "S4", label: "技術仕様", order: 3, skillRef: "kit/skills/aidlc-s4-tech-spec", instruction: "", diff: "delete", reason: "今サイクルは技術仕様工程が不要なため削除する。" },
    { id: "CUSTOM-QA", label: "独自QA工程", order: 4, skillRef: "kit/skills/aidlc-s1-requirements", instruction: "CUSTOM-QA: プロジェクト固有の品質検証チェックリストを実施する。", diff: "add" },
  ],
};

/**
 * US-08 会話で修正: the deterministic REVISED proposal emitted when a human re-proposes
 * with feedback (reconstructionFeedback present). It differs from the initial cycle
 * proposal (CUSTOM-QA renamed + S4 kept instead of deleted) so the web's re-proposal
 * polling detects a change and the e2e can assert the modify→re-propose loop works.
 */
export const SCRIPTED_RECONSTRUCTION_PROPOSAL_CYCLE_REVISED: ReconstructionProposal = {
  scope: "cycle",
  steps: [
    { id: "S1", label: "要件ヒアリング", order: 0, skillRef: "kit/skills/aidlc-s1-requirements", instruction: "S1: 要件を構造化 US に展開する。", diff: "keep" },
    { id: "S2", label: "画面要素", order: 1, skillRef: "kit/skills/aidlc-s2-wireframe", instruction: "S2: ワイヤーフレームを生成する。", diff: "keep" },
    { id: "S3", label: "UIデザイン", order: 2, skillRef: "kit/skills/aidlc-s3-ui-design", instruction: "S3: 本格 UI デザインを生成する。", diff: "keep" },
    { id: "S4", label: "技術仕様", order: 3, skillRef: "kit/skills/aidlc-s4-tech-spec", instruction: "S4: 技術仕様を作成する(再提案で復活)。", diff: "keep" },
    { id: "CUSTOM-QA", label: "独自QA工程(再提案で見直し)", order: 4, skillRef: "kit/skills/aidlc-s1-requirements", instruction: "CUSTOM-QA: 人間の指摘を反映した品質検証。", diff: "add" },
  ],
};

export const SCRIPTED_RECONSTRUCTION_PROPOSAL_GLOBAL: ReconstructionProposal = {
  scope: "global",
  steps: [
    { id: "S1", label: "要件ヒアリング", order: 0, skillRef: "kit/skills/aidlc-s1-requirements", instruction: "S1 グローバルルール更新版。", diff: "current" },
    { id: "S2", label: "画面要素", order: 1, skillRef: "kit/skills/aidlc-s2-wireframe", instruction: "S2 グローバルルール更新版。", diff: "current" },
    { id: "S3", label: "UIデザイン", order: 2, skillRef: "kit/skills/aidlc-s3-ui-design", instruction: "S3 グローバルルール更新版。", diff: "current" },
  ],
};

/**
 * BU-2: build the deterministic AidlcResult for each aidlc-result-* scenario.
 * Fed through the same `aidlcResultToEvents` mapper the live adapter uses, so
 * scripted ↔ live emit identical events from an envelope (C6 parity / §C7.4).
 */
function scriptedAidlcResult(scenario: ScriptedScenario): AidlcResult {
  const completeness = {
    requirements: SCRIPTED_REQUIREMENTS,
    addressed:
      scenario === "aidlc-result-needs-human" ? ["r1"] : ["r1", "r2"],
  };
  const base = {
    artifacts: [] as readonly string[],
    questions: [],
    decisions: [],
    completeness,
  };
  switch (scenario) {
    case "aidlc-result-done":
      return { ...base, status: "done" };
    case "aidlc-result-stalled":
      return { ...base, status: "stalled" };
    case "aidlc-result-questions":
      return {
        ...base,
        status: "needs_human",
        questions: [
          {
            id: "q1",
            prompt: "進め方を選んでください。",
            options: [
              { id: "a", label: "案A", recommended: true },
              { id: "b", label: "案B" },
            ],
            answerKind: "single",
          },
        ],
      };
    default:
      // aidlc-result-needs-human
      return { ...base, status: "needs_human" };
  }
}

export class ScriptedOrchestrator implements OrchestratorPort {
  private readonly sink: DomainEventSink;
  private readonly scenario: ScriptedScenario;
  private readonly states = new Map<string, RunPhase>();
  // Remember each run's context so resume/cancel can rebuild emissions.
  private readonly runs = new Map<string, RunContext>();
  // Unit-04: count of body-present resume calls per run (turn sequence).
  // Turn 1 with body → emit another QuestionRaised (multi-turn parity).
  // Turn 2+ with body → emit ResultEmitted (hearing concludes).
  private readonly resumeCounts = new Map<string, number>();

  constructor(opts: ScriptedOptions) {
    this.sink = opts.sink;
    this.scenario = opts.scenario ?? "happy";
  }

  async launch(cmd: RunLaunch): Promise<void> {
    const ctx = this.ctxFor(cmd, cmd.runId);
    // US-08: a hearingScope of "reconstruction" signals a reconstruction-proposal
    // launch (fired by EngineService.onRolelessResult after S1 done). Route to
    // the cycle-scoped reconstruction scenario regardless of the configured scenario
    // so existing test harnesses (e.g. "happy") don't emit unexpected questions.
    // "reconstruction-global" scenario is only reachable via direct scenario config.
    //
    // Emits RunStateChanged("done") — NOT ResultEmitted — to avoid triggering
    // another onRolelessResult in EngineService (infinite loop guard).
    if (cmd.hearingScope === "reconstruction") {
      // US-08 会話で修正: a re-propose carries the human's feedback → emit the REVISED
      // proposal (differs from the initial one) so the web's re-proposal polling sees a
      // change. The first (auto) launch has no feedback → the initial proposal.
      const proposal =
        this.scenario === "reconstruction-global"
          ? SCRIPTED_RECONSTRUCTION_PROPOSAL_GLOBAL
          : cmd.reconstructionFeedback && cmd.reconstructionFeedback.trim().length > 0
            ? SCRIPTED_RECONSTRUCTION_PROPOSAL_CYCLE_REVISED
            : SCRIPTED_RECONSTRUCTION_PROPOSAL_CYCLE;
      await this.emit(ctx, {
        type: "ReconstructionProposalEmitted",
        runId: cmd.runId,
        proposal,
      });
      // Use RunStateChanged(done) not ResultEmitted — prevents re-triggering
      // onRolelessResult in EngineService (no visual_review card for the proposal run).
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "done",
      });
      this.states.set(cmd.runId, "done");
      return;
    }
    if (this.scenario === "stall-first") {
      await this.emit(ctx, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "stalled",
      });
      this.states.set(cmd.runId, "stalled");
      return;
    }
    // BU-3: config-hearing scenario — emit 2 config questions with targets so
    // the integration test can answer them and assert StepContracts are written.
    // Scope is taken from cmd.hearingScope when present (global launch passes
    // "global"); otherwise defaults to "cycle:{cycleId}" (cycle-scoped launch).
    if (this.scenario === "config-hearing") {
      const targetScope = cmd.hearingScope ?? `cycle:${cmd.cycleId}`;
      await this.emit(ctx, {
        type: "QuestionRaised",
        runId: cmd.runId,
        kind: "question",
        payload: {
          kind: "question",
          prompt: "S1 の output.profileKind を選んでください。",
          options: [
            { id: "briefing", label: "briefing (ヒアリング)", recommended: true },
            { id: "review", label: "review (レビュー)" },
          ],
        },
        target: {
          step: "S1",
          field: "output.profileKind",
          scope: targetScope,
        },
      });
      await this.emit(ctx, {
        type: "QuestionRaised",
        runId: cmd.runId,
        kind: "question",
        payload: {
          kind: "question",
          prompt: "S1 の humanGate.mode を選んでください。",
          options: [
            { id: "visual_review", label: "視覚レビュー", recommended: true },
            { id: "none", label: "ゲートなし" },
          ],
        },
        target: {
          step: "S1",
          field: "humanGate.mode",
          scope: targetScope,
        },
      });
      this.states.set(cmd.runId, "asked");
      return;
    }
    // US-08: reconstruction proposal scenarios.
    // Emit ReconstructionProposalEmitted (cycle or global scope) then conclude
    // with a ResultEmitted so the run moves to "reviewed" (human can approve it).
    if (this.scenario === "reconstruction" || this.scenario === "reconstruction-global") {
      const proposal =
        this.scenario === "reconstruction"
          ? SCRIPTED_RECONSTRUCTION_PROPOSAL_CYCLE
          : SCRIPTED_RECONSTRUCTION_PROPOSAL_GLOBAL;
      await this.emit(ctx, {
        type: "ReconstructionProposalEmitted",
        runId: cmd.runId,
        proposal,
      });
      await this.emit(ctx, {
        type: "ResultEmitted",
        runId: cmd.runId,
        blocks: [
          {
            type: "summary",
            title: "パイプライン再構成提案",
            body:
              this.scenario === "reconstruction"
                ? "サイクル向け再構成提案: S4 削除 + CUSTOM-QA 追加。aidlc-reconstruction ブロックを確認してください。"
                : "グローバルパイプライン再構成提案: 全工程ルール更新版。aidlc-reconstruction ブロックを確認してください。",
          },
        ],
      });
      this.states.set(cmd.runId, "reviewed");
      return;
    }
    // BU-2: aidlc-result envelope scenarios — build the AidlcResult and emit via
    // the SAME mapper the live adapter uses (C6 parity / §C7.4).
    if (this.scenario.startsWith("aidlc-result-")) {
      for (const event of aidlcResultToEvents(
        cmd.runId,
        scriptedAidlcResult(this.scenario),
      )) {
        await this.emit(ctx, event);
      }
      const phaseAfter: RunPhase =
        this.scenario === "aidlc-result-done"
          ? "done"
          : this.scenario === "aidlc-result-stalled"
            ? "stalled"
            : this.scenario === "aidlc-result-questions"
              ? "asked"
              : "reviewed";
      this.states.set(cmd.runId, phaseAfter);
      return;
    }
    // gen→gate→eval: a generator run emits its BriefOut (blocks + completeness with
    // an empty `addressed` — the evaluator fills that). It does NOT advance itself
    // to done; the EngineService runs the deterministic gate, then advances the
    // generator and launches the evaluator.
    if (cmd.role === "generator") {
      await this.emit(ctx, {
        type: "ResultEmitted",
        runId: cmd.runId,
        blocks: SCRIPTED_BLOCKS,
        completeness: { requirements: SCRIPTED_REQUIREMENTS, addressed: [] },
      });
      this.states.set(cmd.runId, "reviewed");
      return;
    }
    await this.emit(ctx, this.askEvent(cmd.runId));
    this.states.set(cmd.runId, "asked");
  }

  async launchEval(cmd: EvalLaunch): Promise<void> {
    const ctx = this.ctxFor(cmd, cmd.runId);
    // "descope"/"gap" both leave r2 unaddressed; "descope" additionally raises a
    // reasoned descope request for r2 (→ app await-descope), while "gap" raises
    // NONE (→ app auto-rework: stall loud, no human card). "complete" (and any
    // other scenario) addresses every requirement → app allow-done.
    const isDescope = this.scenario === "gen-eval-descope";
    const hasGap = isDescope || this.scenario === "gen-eval-gap";
    if (isDescope) {
      await this.emit(ctx, {
        type: "QuestionRaised",
        runId: cmd.runId,
        kind: "descope",
        payload: {
          kind: "descope",
          requirement: "要件2: 空状態が表示される",
          requirementKey: "r2",
          aiReason: "今サイクルでは一覧表示を優先。空状態は次サイクルで対応推奨。",
        },
      });
    }
    await this.emit(ctx, {
      type: "ResultEmitted",
      runId: cmd.runId,
      blocks: SCRIPTED_BLOCKS,
      completeness: {
        requirements: SCRIPTED_REQUIREMENTS,
        addressed: hasGap ? ["r1"] : ["r1", "r2"],
      },
    });
    this.states.set(cmd.runId, "reviewed");
  }

  /**
   * Unit-04 scripted resume — two paths (mirrors live adapter):
   *
   * PATH B (body absent = finalize approval):
   *   "reviewed" phase → emit RunStateChanged done.
   *   Other phases → no-op (idempotent).
   *
   * PATH A (body present = turn continuation, C6 parity):
   *   "asked" phase, scenario "multi-turn", turn 1 → emit another QuestionRaised
   *     (AI asks a follow-up question; the multi-turn round-trip under test).
   *   "asked" phase, all OTHER scenarios (default "happy", gen-eval) OR turn 2+ →
   *     emit ResultEmitted (hearing concludes; run moves to "reviewed"). This
   *     preserves the v0 single-turn answer→review flow (loop happy path).
   *   "reviewed" phase (body present, unexpected) → emit done (finalize).
   *   Other phases → no-op.
   */
  async resume(cmd: ResumeRun): Promise<void> {
    const entry = this.runs.get(cmd.runId);
    const phase = this.states.get(cmd.runId);
    if (!entry || phase === undefined) return; // unknown run → idempotent no-op.

    // PATH B — finalize approval (no body).
    if (cmd.body === undefined) {
      if (phase === "reviewed") {
        await this.emit(entry, {
          type: "RunStateChanged",
          runId: cmd.runId,
          to: "done",
        });
        this.states.set(cmd.runId, "done");
      }
      // "asked" | "stalled" | "done" with no body → no-op.
      return;
    }

    // PATH A — turn continuation (body present).
    if (phase === "asked") {
      const turn = (this.resumeCounts.get(cmd.runId) ?? 0) + 1;
      this.resumeCounts.set(cmd.runId, turn);

      if (this.scenario === "multi-turn" && turn === 1) {
        // Multi-turn scenario only: AI asks a follow-up question after the first
        // answer. Default/gen-eval scenarios fall through to ResultEmitted below
        // so a single answer concludes the hearing (v0 single-turn parity).
        await this.emit(entry, {
          type: "QuestionRaised",
          runId: cmd.runId,
          kind: "question",
          payload: {
            kind: "question",
            prompt: "追加質問: 優先度を教えてください。",
            options: [
              {
                id: "high",
                label: "高い(今サイクル必須)",
                recommended: true,
              },
              {
                id: "low",
                label: "低い(次サイクルで可)",
              },
            ],
          },
        });
        // Run stays "asked" — still awaiting the next answer.
        return;
      }

      // missing-context scenario: emit ResultEmitted with a sentinel body so
      // ReviewDetail.normaliseMissingContext converts it to a warning banner.
      if (this.scenario === "missing-context") {
        await this.emit(entry, {
          type: "ResultEmitted",
          runId: cmd.runId,
          blocks: [
            {
              type: "summary",
              title: "前サイクル参照失敗",
              body: "⚠ missing-context: 前サイクルの成果物が見つかりませんでした。",
            },
          ],
          completeness: { requirements: SCRIPTED_REQUIREMENTS, addressed: [] },
        });
        this.states.set(cmd.runId, "reviewed");
        return;
      }

      // Turn 2+: hearing concludes — emit ResultEmitted.
      await this.emit(entry, {
        type: "ResultEmitted",
        runId: cmd.runId,
        blocks: [
          {
            type: "summary",
            title: "ステップ出力",
            body: "スクリプテッドの確定済み結果です。",
          },
          { type: "ac-map", items: [{ ac: "AC-1", status: "done" }] },
          { type: "mermaid", src: "graph TD; A-->B" },
          {
            type: "screenshot",
            src: "screenshots/x.png",
            caption: "verify-ui スクリーンショット",
          },
        ],
      });
      this.states.set(cmd.runId, "reviewed");
      return;
    }

    if (phase === "reviewed") {
      // Body present but run already has a result → finalize.
      await this.emit(entry, {
        type: "RunStateChanged",
        runId: cmd.runId,
        to: "done",
      });
      this.states.set(cmd.runId, "done");
      return;
    }
    // "stalled" | "done" → no-op.
  }

  async retry(cmd: RetryLaunch): Promise<void> {
    // A retry is a fresh attempt carried by newRunId.
    const ctx = this.ctxFor(cmd, cmd.newRunId);
    await this.emit(ctx, this.askEvent(cmd.newRunId));
    this.states.set(cmd.newRunId, "asked");
  }

  async cancel(cmd: { readonly runId: RunId }): Promise<void> {
    const entry = this.runs.get(cmd.runId);
    if (!entry) return;
    await this.emit(entry, {
      type: "RunStateChanged",
      runId: cmd.runId,
      to: "failed",
    });
    // Internal "done" bucket is the terminal marker: it holds BOTH failed and
    // done runs (no further emissions), so a cancelled run parks here too.
    this.states.set(cmd.runId, "done");
  }

  // ── internals ──────────────────────────────────────────────────
  private ctxFor(cmd: LaunchLike, runId: RunId): RunContext {
    const ctx = buildRunContext(cmd, runId);
    this.runs.set(runId, ctx);
    return ctx;
  }

  private askEvent(runId: RunId): DomainEvent {
    return {
      type: "QuestionRaised",
      runId,
      kind: "question",
      payload: {
        kind: "question",
        prompt: "進め方を選んでください。扱うデータのまとめ方はどちらにしますか?",
        options: [
          {
            id: "by-entity",
            label: "「もの」ごとにまとめる",
            hint: "扱う対象(データ)ごとに整理します",
            recommended: true,
          },
          {
            id: "by-task",
            label: "「やること」ごとにまとめる",
            hint: "機能(操作)ごとに整理します",
          },
        ],
      },
    };
  }

  private async emit(ctx: RunContext, event: DomainEvent): Promise<void> {
    await this.sink({ ctx, event });
  }
}
