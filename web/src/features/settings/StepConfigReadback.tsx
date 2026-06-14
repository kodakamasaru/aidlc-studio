// SCR-04 — ステップ設定の確認・修正(全ステップ一覧 / 読み取り専用)
// 入力フォームは持たない(US-06 AC①)。「会話で直す」が唯一の修正導線。
// スコープは入口で決まる: サイクル入口 → そのサイクル + 「既定を編集 →」リンク。
//                         グローバル入口(/settings/steps) → 既定のみ(「このサイクル」タブ無し)。
// 状態: default(US決定後・このサイクル) / global(既定) / pre-us(US未決定) / loading。
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type StepContracts } from "../../lib/api";
import { useProjectContext } from "../../lib/project-context";
import { useAsync } from "../../lib/useAsync";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { stepLabel } from "../../lib/step-label";
import "./step-config-readback.css";

// SCR-04 mock 視覚契約: ステップ表示名は平易・長形(番号でなく名前)。
// step-label.ts の短名(要件/画面…)より一段詳しい表示名。
// ★ 正本ミラー: domain CANONICAL_STEPS.label の補完として維持(step-label.ts 非改変)。
const STEP_LABEL_LONG: Readonly<Record<string, string>> = {
  S1: "要件ヒアリング",
  S2: "画面要素",
  S3: "UIデザイン",
  S4: "技術仕様",
  S5: "作業分割",
  S6: "ドメインモデル",
  S7: "ドメインコード",
  S8: "実装統合",
  S9: "シナリオ検証",
  S10: "受け入れ",
  S11: "振り返り",
  S12: "改善提案",
};

/** 読み返し 1 行分の正規化形(cycle=スナップショット / global=ライブ既定 を共通化)。 */
interface ReadbackStep {
  readonly id: string;
  readonly label: string;
  readonly order: number;
  readonly contracts?: StepContracts | undefined;
}

/** SCR-04 表示名: 長形テーブル → ラベル → stepLabel の優先順 */
function stepDisplayName(step: { readonly id: string; readonly label?: string }): string {
  const defLabel = step.label ?? "";
  // 長形テーブルを優先(モック視覚契約に合わせる)
  return STEP_LABEL_LONG[step.id] ?? (defLabel || stepLabel(step.id));
}

type ScopeMode = "global" | "cycle";

const GATE_LABEL: Record<string, string> = {
  visual_review: "できあがりの確認",
  device_check: "実機で確認",
  none: "確認なし",
};

function stallLabel(onStall: string, maxRetry?: number): string {
  if (onStall === "retry" && maxRetry !== undefined) {
    return `再試行→${maxRetry}回`;
  }
  if (onStall === "retry") return "やり直す";
  if (onStall === "backtrack") return "前のステップへ戻す";
  if (onStall === "human") return "すぐ人間へ";
  return onStall;
}

interface StepConfigReadbackProps {
  /** "global" = /settings/steps (既定のみ). "cycle" = cycle-scoped. */
  readonly scope: ScopeMode;
  /** cycleId when scope="cycle" (used for "会話で直す" nav). */
  readonly cycleId?: string;
  /** Whether requirements (US) have been determined. Controls pre-us lock. */
  readonly usDecided?: boolean;
}

export function StepConfigReadback({
  scope,
  cycleId,
  usDecided = true,
}: StepConfigReadbackProps) {
  const ctx = useProjectContext();
  // Cycle scope renders the cycle's OWN config = the snapshot pinned onto each
  // phase at creation (cycle.phases[].stepDef), NOT the live project.pipelineDef.
  // A cycle is fixed at creation: its step settings are the snapshot of the
  // global defaults taken then — they do NOT track later global edits. (Global
  // scope below edits the live defaults; cycle scope reads the frozen snapshot.)
  const cycleQ = useAsync(
    () =>
      scope === "cycle" && cycleId
        ? api.getCycle(cycleId)
        : Promise.resolve(undefined),
    [scope, cycleId],
  );
  const isLoading =
    scope === "cycle" ? cycleQ.status === "loading" : ctx.status === "loading";
  const isReady =
    scope === "cycle" ? cycleQ.status === "success" : ctx.status === "ready";
  const hasData = scope === "cycle" ? !!cycleQ.data : !!ctx.project;
  const navigate = useNavigate();
  // These hooks MUST precede the conditional early-returns below (isLoading /
  // !hasData). Declaring them here keeps the hook order stable across the
  // loading→ready re-render — otherwise React #310 ("rendered more hooks than
  // during the previous render") blanks the page. [S9 O6 fix / backtrack S8]
  const [hearingLoading, setHearingLoading] = useState(false);
  const [hearingError, setHearingError] = useState<string | null>(null);

  const titleLabel =
    scope === "global" ? "ステップ設定 — 既定" : "ステップ設定";

  useSetTopbar(
    {
      left: <span className="crumb__current">{titleLabel}</span>,
      right: isReady ? (
        <span className="badge badge--done badge--no-dot">設定済み</span>
      ) : undefined,
    },
    [titleLabel, isReady],
  );

  // ── Loading skeleton (SCR-04 loading state) ───────────────
  if (isLoading) {
    return (
      <div className="content-inner cfg-rb" aria-busy="true">
        <div className="cfg-rb__skel-scope" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="cfg-rb__skel-row">
            <div className="skel-line skel-line--short" />
            <div className="skel-line skel-line--med" />
            <div className="skel-line skel-line--xs" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="content-inner">
        <p className="state-msg">
          プロジェクトが未登録です。先にサイクル画面でリポジトリを登録してください。
        </p>
      </div>
    );
  }

  // Cycle scope: build the step list from the cycle's SNAPSHOT (phases[].stepDef)
  // so the readback shows the config frozen at creation. Global scope: the live
  // project pipeline (this IS the defaults editor).
  const steps: readonly ReadbackStep[] =
    scope === "cycle"
      ? [...(cycleQ.data?.phases ?? [])]
          .map((p) => ({
            id: p.step,
            label: p.stepDef?.label ?? p.step,
            order: p.stepDef?.order ?? p.order,
            contracts: p.stepDef?.contracts,
          }))
          .sort((a, b) => a.order - b.order)
      : [...(ctx.project?.pipelineDef ?? [])]
          .map((sd) => ({
            id: sd.id,
            label: sd.label,
            order: sd.order,
            contracts: sd.contracts,
          }))
          .sort((a, b) => a.order - b.order);
  const isCycle = scope === "cycle";
  const isPreUs = isCycle && !usDecided;
  // Empty-value wording: a cycle's step is FROZEN at creation (no live inheritance),
  // so an unconfigured step reads "調整なし". Global scope edits live defaults.
  const inheritLabel = isCycle ? "調整なし(作成時の既定のまま)" : "未設定";

  async function onTalkToFix() {
    setHearingLoading(true);
    setHearingError(null);
    try {
      const hearingScope = isCycle && cycleId ? `cycle:${cycleId}` : "global";
      const result = await api.launchHearing(hearingScope);
      if ("cycleId" in result) {
        // cycle-scope: navigate to the cycle thread in hearing mode
        navigate(`/cycles/${result.cycleId}/thread?hearing=1`);
      } else {
        // global-scope: navigate to the dedicated hearing placeholder page
        navigate("/settings/hearing");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setHearingError(msg);
    } finally {
      setHearingLoading(false);
    }
  }

  return (
    <div className="content-inner cfg-rb">

      {/* ── Scope bar ── */}
      <div className="cfg-rb__scope-bar">
        {isCycle ? (
          <>
            <span className="cfg-rb__scope-tag cfg-rb__scope-tag--cycle">
              このサイクル · 作成時に固定
            </span>
            <Link to="/settings/steps" className="cfg-rb__scope-link">
              既定を編集 →
            </Link>
          </>
        ) : (
          <span className="cfg-rb__scope-tag cfg-rb__scope-tag--global">
            全サイクル共通の既定
          </span>
        )}
      </div>

      {/* ── Hint text ── */}
      <p className="cfg-rb__hint">
        {isPreUs
          ? "要件(US)が決まると、このサイクル向けの調整ができます。それまでは全ステップがグローバル既定のまま動きます。"
          : isCycle
            ? "この設定は、このサイクルを作ったときの既定をそのまま固定したものです(あとでグローバル既定を変えても、このサイクルには反映されません)。各ステップ名をクリックすると AI への指示の全文(原文)を確認できます。"
            : "ここの編集は、これから作るサイクルの既定になります(作成済みのサイクルは固定)。各ステップ名をクリックすると指示の全文(原文)を確認できます。"}
      </p>

      {/* ── Pre-US lock banner (SCR-04 pre-us state) ── */}
      {isPreUs ? (
        <div className="cfg-rb__lock" role="note">
          <span aria-hidden="true">🔒</span>
          <span>
            要件が決まると、このサイクル向けの最適化ができます。それまでは全ステップがグローバル既定のまま動きます。
          </span>
        </div>
      ) : null}

      {/* ── Steps table ── */}
      <div
        className="cfg-rb__table"
        role="table"
        aria-label="ステップ設定一覧"
      >
        {/* Header row */}
        <div className="cfg-rb__row cfg-rb__row--head" role="row">
          <span className="cfg-rb__cell" role="columnheader">
            ステップ
          </span>
          <span className="cfg-rb__cell cfg-rb__cell--vals" role="columnheader">
            {isPreUs
              ? "いまの設定(すべて作成時の既定のまま)"
              : isCycle
                ? "設定(成果物 / 人の確認 / 行き詰まり時)"
                : "既定の設定(成果物 / 人の確認 / 行き詰まり時)"}
          </span>
          <span className="cfg-rb__cell" role="columnheader">
            範囲
          </span>
        </div>

        {/* Data rows */}
        {isPreUs ? (
          // Pre-US: first 3 steps (with contracts if present) + "以降" placeholder
          <>
            {steps.slice(0, 3).map((step) => (
              <StepRow
                key={step.id}
                step={step}
                contracts={step.contracts}
                scope="inherit"
                showContracts
                inheritLabel={inheritLabel}
              />
            ))}
            <div className="cfg-rb__row" role="row">
              <span className="cfg-rb__cell cfg-rb__sname--dim" role="cell">
                以降のステップ
              </span>
              <span className="cfg-rb__cell cfg-rb__cell--vals" role="cell">
                <span className="cfg-rb__kv">すべて作成時の既定のまま</span>
              </span>
              <span className="cfg-rb__cell" role="cell">
                <span className="cfg-rb__badge cfg-rb__badge--inherit">既定</span>
              </span>
            </div>
          </>
        ) : (
          steps.map((step) => {
            const c = step.contracts ?? {};
            // For cycle scope: if there are any configured contracts, treat as override.
            const hasOverride =
              isCycle &&
              (!!c.output?.profileKind ||
                !!c.humanGate?.mode ||
                !!c.escalation?.onStall ||
                (c.verification?.observations?.length ?? 0) > 0);
            return (
              <StepRow
                key={step.id}
                step={step}
                contracts={step.contracts}
                scope={hasOverride ? "override" : "inherit"}
                showContracts
                inheritLabel={inheritLabel}
              />
            );
          })
        )}
      </div>

      {/* ── Footer: "会話で直す" button + US-08 "工程を組み直す" ── */}
      <div className="cfg-rb__foot">
        {hearingError ? (
          <p className="form-error" role="alert" style={{ marginBottom: "0.5rem" }}>
            起動に失敗しました: {hearingError}
          </p>
        ) : null}
        {isPreUs ? (
          <button
            type="button"
            className="btn btn--surface"
            aria-disabled="true"
            disabled
          >
            会話で直す(要件決定後)→
          </button>
        ) : (
          <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void onTalkToFix()}
              disabled={hearingLoading}
            >
              {hearingLoading ? "起動中…" : "会話で直す(再ヒアリング)→"}
            </button>
            {/* US-08: global only — reconstruct pipeline defaults via conversation */}
            {!isCycle ? (
              <button
                type="button"
                className="btn btn--surface"
                onClick={() => navigate("/settings/reconstruction")}
              >
                工程を組み直す →
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ── StepRow ────────────────────────────────────────────────────

interface StepRowProps {
  readonly step: ReadbackStep;
  readonly contracts: StepContracts | undefined;
  readonly scope: "inherit" | "override";
  readonly showContracts: boolean;
  /** Text shown when this step has no pinned contracts (scope-dependent). */
  readonly inheritLabel: string;
}

function StepRow({ step, contracts, scope, showContracts, inheritLabel }: StepRowProps) {
  const c = contracts ?? {};
  const name = stepDisplayName(step);

  return (
    <div className="cfg-rb__row" role="row">
      <span className="cfg-rb__cell" role="cell">
        <Link
          to={`/settings/steps/${step.id}`}
          className="cfg-rb__sname"
          title={`「${name}」の指示・全文を確認`}
        >
          {name}
          <span className="cfg-rb__sname-drill" aria-hidden="true">
            {" "}›
          </span>
        </Link>
      </span>

      <span className="cfg-rb__cell cfg-rb__cell--vals" role="cell">
        {showContracts ? (
          <>
            {c.output?.profileKind ? (
              <span className="cfg-rb__kv">
                <span className="cfg-rb__k">成果物:</span> {c.output.profileKind}
              </span>
            ) : null}
            {c.humanGate?.mode ? (
              <span className="cfg-rb__kv">
                <span className="cfg-rb__k">確認:</span>{" "}
                {GATE_LABEL[c.humanGate.mode] ?? c.humanGate.mode}
              </span>
            ) : null}
            {c.escalation?.onStall ? (
              <span className="cfg-rb__kv">
                <span className="cfg-rb__k">行き詰まり:</span>{" "}
                {stallLabel(c.escalation.onStall, c.escalation.maxRetry)}
              </span>
            ) : null}
            {!c.output?.profileKind &&
              !c.humanGate?.mode &&
              !c.escalation?.onStall ? (
              <span className="cfg-rb__kv cfg-rb__kv--empty">
                {inheritLabel}
              </span>
            ) : null}
          </>
        ) : (
          <span className="cfg-rb__kv cfg-rb__kv--empty">{inheritLabel}</span>
        )}
      </span>

      <span className="cfg-rb__cell" role="cell">
        <span
          className={`cfg-rb__badge${scope === "override" ? " cfg-rb__badge--override" : " cfg-rb__badge--inherit"}`}
        >
          {scope === "override" ? "このサイクルで調整" : "既定"}
        </span>
      </span>
    </div>
  );
}

// ── Standalone page exports ───────────────────────────────────

/** Route: /settings/steps — global defaults view */
export function GlobalStepConfigPage() {
  return <StepConfigReadback scope="global" />;
}

/** Route: /cycles/:cycleId/settings — cycle-scoped readback.
 * pre-us 状態: ?usDecided=false で SCR-04 pre-us view を描画(ハーネス・デモ用)。
 * 本番では cycle API が usDecided を返せるようになったら query param を廃止予定。
 */
export function CycleStepConfigPage() {
  const { cycleId = "" } = useParams();
  const [searchParams] = useSearchParams();
  // ?usDecided=false → pre-us 状態を描画(default: true = US 決定済み)
  const usDecided = searchParams.get("usDecided") !== "false";
  return <StepConfigReadback scope="cycle" cycleId={cycleId} usDecided={usDecided} />;
}
