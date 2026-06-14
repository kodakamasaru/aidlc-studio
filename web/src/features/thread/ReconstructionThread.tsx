// ReconstructionThread — SCR-02 工程の再構成モード(US-08 / D-05)
//
// 2 モード:
//   isGlobal=false (cycle-scoped, AI 起点):
//     GET /api/cycles/:id/reconstruction-proposal で提案を取得し差分リストを表示。
//     「承認して進む」→ POST /api/cycles/:id/reconstruct。
//     「直したい所を会話で」→ 自由入力でテキストを送信し再提案を待つ。
//
//   isGlobal=true (global-scoped, 人間起点):
//     グローバルの既定構成(project.pipelineDef)を差分マーカーなしで表示し「どこを変えますか?」。
//     「この既定で保存」→ POST /api/projects/:id/pipeline。
//     「続けて直す」→ 自由入力で指示を追加。
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  type ReconstructionProposal,
  type ReconstructionStep,
} from "../../lib/api";
import { useProjectContext } from "../../lib/project-context";
import { useAsync } from "../../lib/useAsync";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import "./conversation-thread.css";
import "./reconstruction-thread.css";

const POLL_MS = 3000;

// ── Derived display helpers ────────────────────────────────────

function diffTag(diff: ReconstructionStep["diff"]): { label: string; cls: string } {
  if (diff === "delete") return { label: "【削除】", cls: "tag-del" };
  if (diff === "add") return { label: "【新設】", cls: "tag-add" };
  return { label: "既定のまま", cls: "tag-keep" };
}

// ── ReconstructionBubble (AI bubble showing the step list) ────

interface ReconstructionBubbleProps {
  readonly proposal: ReconstructionProposal;
  readonly isNew?: boolean;
  /** true = global mode (no diff tags, current scope). */
  readonly isGlobal: boolean;
  readonly rulesOpen: boolean;
  readonly onToggleRules: () => void;
  readonly selected: "approve" | "modify";
  readonly onSelect: (v: "approve" | "modify") => void;
}

function ReconstructionBubble({
  proposal,
  isNew = false,
  isGlobal,
  rulesOpen,
  onToggleRules,
  selected,
  onSelect,
}: ReconstructionBubbleProps) {
  const approveLabel = isGlobal ? "◉ この既定で保存" : "◉ この構成で承認";
  const approveDesc = isGlobal
    ? "この構成を今後のサイクルの出発点にします(作成済みサイクルは変わりません)"
    : "この工程列でサイクルを開始します";
  const modifyLabel = isGlobal ? "○ 続けて直す" : "○ 直したい所を会話で";
  const modifyDesc = isGlobal
    ? "「○○も変えて」「△△は要らない」など、会話で指示すると再提示します"
    : "「○○を足して」「△△は要らない」など、このチャットで指示すると再提示します";

  const headerTag = isGlobal ? "【現在の既定構成】" : "【工程の再構成】";
  const headerText = isGlobal
    ? "今後作成するサイクルの出発点となる工程です。どこを変えますか?"
    : "要件を踏まえ、このサイクルの工程を組み直しました。変更点を確認してください。";

  return (
    <div
      className={`thread-bubble thread-bubble--ai${isNew ? " thread-bubble--new" : ""}`}
    >
      <span className="sr-only">AI:</span>
      <div className="thread-bubble__who" aria-hidden="true">
        AI
        {isNew ? (
          <span style={{ color: "var(--color-running)" }}> · 更新</span>
        ) : null}
      </div>
      <div className="thread-bubble__box">
        {/* Header */}
        <div style={{ marginBottom: "var(--sp-4)" }}>
          <span className="thread-q-tag" aria-hidden="true">
            {headerTag}
          </span>
          <span className="thread-q-intro" style={{ marginLeft: "var(--sp-2)" }}>
            {headerText}
          </span>
        </div>

        {/* Step list */}
        <div className="recon-list" role="list" aria-label="工程一覧">
          {proposal.steps.map((step, stepIdx) => {
            const tag = diffTag(step.diff);
            // A step is "fixed" (locked) when it's already done: first keep step in cycle mode.
            const isFixed =
              !isGlobal && step.diff === "keep" && step.order === 1 && stepIdx === 0;
            const isDel = step.diff === "delete";
            const isAdd = step.diff === "add";
            return (
              <div
                key={step.id}
                role="listitem"
                className={
                  `recon-row` +
                  (isFixed ? " recon-fixed" : "") +
                  (isDel ? " recon-deleted" : "") +
                  (isAdd ? " recon-added" : "")
                }
              >
                <span className="recon-num" aria-hidden="true">
                  {isDel ? "✕" : isAdd ? "＋" : `${step.order}.`}
                </span>
                <span className={`recon-name${isDel ? " recon-strike" : ""}`}>
                  {step.label}
                </span>
                {!isGlobal ? (
                  <span className={`recon-tag ${tag.cls}`}>{tag.label}</span>
                ) : null}
                {step.reason ? (
                  <span className="recon-note">{step.reason}</span>
                ) : isFixed ? (
                  <span className="recon-note recon-locked">完了 — 固定</span>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Rules disclosure */}
        <div className="recon-disclosure" style={{ marginTop: "var(--sp-4)" }}>
          <button
            type="button"
            className="recon-disclosure__toggle"
            aria-expanded={rulesOpen}
            onClick={onToggleRules}
          >
            <span aria-hidden="true">{rulesOpen ? "▾" : "▸"}</span>
            <span>
              {isGlobal
                ? "各工程のルール(指示の全文)を確認"
                : "各ルールを確認(各工程の指示全文を展開)"}
            </span>
          </button>
          {rulesOpen ? (
            <div className="recon-disclosure__panel">
              {proposal.steps
                .filter((s) => s.diff !== "delete")
                .map((step) => (
                  <div key={step.id} className="recon-rule-item">
                    <div className="recon-rule-item__name">{step.label}</div>
                    <pre className="recon-rule-item__body">
                      {step.instruction || "(指示なし)"}
                    </pre>
                  </div>
                ))}
            </div>
          ) : null}
        </div>

        {/* Options */}
        <div
          className="thread-q-field"
          role="radiogroup"
          aria-label="対応を選択"
          style={{ marginTop: "var(--sp-4)" }}
        >
          <label
            className={`thread-opt${selected === "approve" ? " thread-opt--on" : ""}`}
          >
            <input
              type="radio"
              name="recon-choice"
              checked={selected === "approve"}
              onChange={() => onSelect("approve")}
              className="sr-only"
            />
            <span className="thread-opt__radio" aria-hidden="true" />
            <span className="thread-opt__body">
              <span className="thread-opt__label">{approveLabel}</span>
              <span className="thread-opt__desc">{approveDesc}</span>
            </span>
          </label>
          <label
            className={`thread-opt${selected === "modify" ? " thread-opt--on" : ""}`}
          >
            <input
              type="radio"
              name="recon-choice"
              checked={selected === "modify"}
              onChange={() => onSelect("modify")}
              className="sr-only"
            />
            <span className="thread-opt__radio" aria-hidden="true" />
            <span className="thread-opt__body">
              <span className="thread-opt__label">{modifyLabel}</span>
              <span className="thread-opt__desc">{modifyDesc}</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

// ── HumanModifyBubble ──────────────────────────────────────────

interface HumanModifyBubbleProps {
  readonly text: string;
}

function HumanModifyBubble({ text }: HumanModifyBubbleProps) {
  return (
    <div className="thread-bubble thread-bubble--human">
      <span className="sr-only">あなた:</span>
      <div className="thread-bubble__who" aria-hidden="true">
        あなた
      </div>
      <div className="thread-bubble__box">
        <p className="thread-human__line">{text}</p>
      </div>
    </div>
  );
}

// ── History record ─────────────────────────────────────────────

type HistoryEntry =
  | { readonly kind: "ai"; readonly proposal: ReconstructionProposal }
  | { readonly kind: "human"; readonly text: string };

// ── CycleReconstructionThread ──────────────────────────────────
// Route: /cycles/:cycleId/reconstruction

interface CycleReconstructionThreadProps {
  readonly cycleId: string;
  readonly backTo?: string;
  readonly backLabel?: string;
}

export function CycleReconstructionThread({
  cycleId,
  backTo,
  backLabel,
}: CycleReconstructionThreadProps) {
  const { refreshInbox } = useProjectContext();
  const navigate = useNavigate();

  const proposalQ = useAsync(
    () => api.getReconstructionProposal(cycleId),
    [cycleId],
  );
  const cycleQ = useAsync(() => api.getCycle(cycleId), [cycleId]);

  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<"approve" | "modify">("approve");
  const [modifyText, setModifyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [waitingForReproposal, setWaitingForReproposal] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  // Poll for updated proposal after "会話で直す" submit.
  const reload = proposalQ.reload;
  useEffect(() => {
    if (!waitingForReproposal) return;
    const tick = () => {
      if (!document.hidden) reload({ background: true });
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [waitingForReproposal, reload]);

  // When a new proposal arrives, append it to history.
  const currentProposal = proposalQ.data;
  const prevStepsRef = useRef<string>("");
  useEffect(() => {
    if (!waitingForReproposal || !currentProposal) return;
    const key = JSON.stringify(currentProposal.steps);
    if (prevStepsRef.current && prevStepsRef.current !== key) {
      setHistory((h) => [...h, { kind: "ai", proposal: currentProposal }]);
      setWaitingForReproposal(false);
    }
    prevStepsRef.current = key;
  }, [currentProposal, waitingForReproposal]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length]);

  const cycleName = cycleQ.data?.version ?? "…";

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          {backTo ? (
            <>
              <Link to={backTo} className="crumb">
                {backLabel ?? "戻る"}
              </Link>
              <span className="crumb__sep">/</span>
            </>
          ) : null}
          <span className="crumb__current">工程の再構成(このサイクル)</span>
          {cycleName !== "…" ? (
            <span className="crumb crumb--meta">{cycleName}</span>
          ) : null}
        </span>
      ),
      right: <StateBadge variant="stalled">確認待ち</StateBadge>,
    },
    [cycleName, backTo, backLabel],
  );

  // ── Loading / error states ──────────────────────────────────

  if (proposalQ.status === "loading") {
    return (
      <div className="thread-page">
        <div className="thread-container">
          <div className="thread-empty" aria-busy="true">
            <Spinner size={24} />
            <p className="thread-empty__title">提案を読み込んでいます…</p>
          </div>
        </div>
      </div>
    );
  }

  if (proposalQ.status === "error") {
    const isNotFound =
      proposalQ.error instanceof ApiError && proposalQ.error.status === 404;
    return (
      <div className="thread-page">
        <div className="thread-container">
          <div className="thread-empty" role="alert">
            <p className="thread-empty__title">
              {isNotFound
                ? "再構成提案がまだ生成されていません"
                : "読み込みに失敗しました"}
            </p>
            {!isNotFound ? (
              <button
                type="button"
                className="btn btn--surface"
                onClick={() => proposalQ.reload()}
              >
                再試行
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!currentProposal) return null;

  // ── Approve ─────────────────────────────────────────────────

  async function handleApprove() {
    if (!currentProposal || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Exclude deleted steps and steps that are already started (running/review/done).
      // The reconstruct endpoint only accepts pending steps to replace — started phases
      // are preserved as-is by the domain, so re-sending them causes DuplicateStep.
      const startedStepIds = new Set(
        (cycleQ.data?.phases ?? [])
          .filter((p) => p.state !== "pending")
          .map((p) => p.step as string),
      );
      const stepsToSend = currentProposal.steps.filter(
        (s) => s.diff !== "delete" && !startedStepIds.has(s.id),
      );
      await api.applyCycleReconstruction(cycleId, stepsToSend);

      // US-08 F-1: close the open reconstruction inbox card(s) for this cycle.
      // The card was raised by EventApplier when ReconstructionProposalEmitted was
      // handled. Answering it with "approve" marks it "answered" so it disappears
      // from the inbox (CLAUDE.md: 「AI→人間の依頼は全部カード化」).
      try {
        const inbox = await api.getCycleInbox(cycleId);
        const openReconCards = inbox.filter(
          (q) => q.state === "open" && q.kind === "reconstruction",
        );
        await Promise.all(
          openReconCards.map((q) =>
            api.answerQuestion(q.id, { verdict: "approve" }),
          ),
        );
      } catch {
        // Best-effort: card closure does not block navigation.
      }

      refreshInbox();
      navigate(`/cycles/${cycleId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Modify submit ────────────────────────────────────────────

  async function handleModifySubmit() {
    if (!modifyText.trim() || submitting || !currentProposal) return;
    const text = modifyText.trim();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const inbox = await api.getCycleInbox(cycleId);
      const openQ = inbox.find((q) => q.state === "open");
      if (openQ) {
        await api.answerQuestion(openQ.id, { verdict: "answer", body: text });
      }
      // Seed history with initial proposal + human turn.
      setHistory((h) => {
        const base: HistoryEntry[] =
          h.length === 0 ? [{ kind: "ai", proposal: currentProposal }] : [...h];
        return [...base, { kind: "human", text }];
      });
      prevStepsRef.current = JSON.stringify(currentProposal.steps);
      setModifyText("");
      setSelected("approve");
      setWaitingForReproposal(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────

  const displayHistory: readonly HistoryEntry[] =
    history.length === 0
      ? [{ kind: "ai", proposal: currentProposal }]
      : history;

  const canApprove = selected === "approve" && !submitting;
  const canModify = selected === "modify" && modifyText.trim().length > 0 && !submitting;

  return (
    <div className="thread-page">
      <div
        className="thread-container"
        role="log"
        aria-label="工程の再構成スレッド"
        aria-live="polite"
      >
        {displayHistory.map((entry, i) => {
          if (entry.kind === "ai") {
            return (
              <ReconstructionBubble
                key={`ai-${i}`}
                proposal={entry.proposal}
                isNew={i > 0}
                isGlobal={false}
                rulesOpen={i === displayHistory.length - 1 ? rulesOpen : false}
                onToggleRules={() => setRulesOpen((v) => !v)}
                selected={i === displayHistory.length - 1 ? selected : "approve"}
                onSelect={(v) => {
                  if (i === displayHistory.length - 1) setSelected(v);
                }}
              />
            );
          }
          return <HumanModifyBubble key={`human-${i}`} text={entry.text} />;
        })}

        {waitingForReproposal && (
          <div className="thread-running" aria-live="polite">
            <span className="thread-dots" aria-hidden="true">
              <i /><i /><i />
            </span>
            <span>AI が再構成案を考えています…</span>
          </div>
        )}

        <div ref={threadEndRef} aria-hidden="true" />
      </div>

      {/* Modify input */}
      {selected === "modify" && (
        <div className="thread-submit-bar">
          {submitError ? (
            <p className="form-error thread-submit-bar__error" role="alert">
              {submitError}
            </p>
          ) : null}
          <div className="recon-modify-row">
            <textarea
              className="textarea recon-modify__input"
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              placeholder="「S4 を残して」「レビュー工程を足して」など、変えたい点を入力してください"
              rows={2}
              aria-label="修正の指示"
            />
            <button
              type="button"
              className="btn btn--primary recon-modify__btn"
              disabled={!canModify}
              onClick={() => void handleModifySubmit()}
            >
              {submitting ? <Spinner size={14} /> : null}
              送信して再提案
            </button>
          </div>
        </div>
      )}

      {/* Footer dock: approve CTA */}
      {selected === "approve" && (
        <div className="recon-dock">
          {submitError ? (
            <p className="form-error" role="alert" style={{ margin: "0 0 var(--sp-2)" }}>
              {submitError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canApprove}
            onClick={() => void handleApprove()}
          >
            {submitting ? <Spinner size={14} /> : null}
            承認して進む →
          </button>
        </div>
      )}
    </div>
  );
}

// ── CycleReconstructionPage ────────────────────────────────────
// Route: /cycles/:cycleId/reconstruction

export function CycleReconstructionPage() {
  const { cycleId = "" } = useParams();
  return (
    <CycleReconstructionThread
      cycleId={cycleId}
      backTo={`/cycles/${cycleId}`}
      backLabel="サイクル"
    />
  );
}

// ── GlobalReconstructionThread ─────────────────────────────────
// Route: /settings/reconstruction

interface GlobalReconstructionThreadProps {
  readonly projectId: string;
  readonly backTo?: string;
}

export function GlobalReconstructionThread({
  projectId,
  backTo = "/settings/steps",
}: GlobalReconstructionThreadProps) {
  const navigate = useNavigate();

  const projectQ = useAsync(() => api.getProject(projectId), [projectId]);

  const [history, setHistory] = useState<readonly HistoryEntry[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<"approve" | "modify">("approve");
  const [modifyText, setModifyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to={backTo} className="crumb">
            設定
          </Link>
          <span className="crumb__sep">/</span>
          <span className="crumb__current">既定を編集(全サイクル共通)</span>
          <span className="crumb crumb--meta">状態: 編集中</span>
        </span>
      ),
      right: <StateBadge variant="stalled">編集中</StateBadge>,
    },
    [backTo],
  );

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history.length]);

  if (projectQ.status === "loading") {
    return (
      <div className="thread-page">
        <div className="thread-container">
          <div className="thread-empty" aria-busy="true">
            <Spinner size={24} />
            <p className="thread-empty__title">読み込み中…</p>
          </div>
        </div>
      </div>
    );
  }

  if (projectQ.status === "error" || !projectQ.data) {
    return (
      <div className="thread-page">
        <div className="thread-container">
          <div className="thread-empty" role="alert">
            <p className="thread-empty__title">プロジェクトの読み込みに失敗しました</p>
          </div>
        </div>
      </div>
    );
  }

  const project = projectQ.data;

  // Build the initial proposal from pipelineDef (all steps tagged "current").
  const initialProposal: ReconstructionProposal = {
    scope: "global",
    steps: project.pipelineDef.map((s) => ({
      id: s.id,
      label: s.label,
      order: s.order,
      skillRef: s.skillRef,
      instruction: "",
      diff: "current" as const,
    })),
  };

  // The latest AI entry in history determines what we'd save.
  const latestAiEntry = [...history].reverse().find((e) => e.kind === "ai");
  const latestProposal =
    latestAiEntry?.kind === "ai" ? latestAiEntry.proposal : initialProposal;

  const displayHistory: readonly HistoryEntry[] =
    history.length === 0
      ? [{ kind: "ai", proposal: initialProposal }]
      : history;

  // ── Save handler ────────────────────────────────────────────

  async function handleSave() {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.replaceProjectPipeline(projectId, latestProposal.steps);
      navigate(backTo);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── "続けて直す" handler ─────────────────────────────────────
  // Global mode: capture the human's instruction and record turns.
  // In the scripted backend, the modify text is stored as a note;
  // the proposal stays the same until human saves.

  async function handleModifySubmit() {
    const text = modifyText.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const currentForHistory =
        displayHistory[displayHistory.length - 1]?.kind === "ai"
          ? (displayHistory[displayHistory.length - 1] as { kind: "ai"; proposal: ReconstructionProposal }).proposal
          : initialProposal;

      setHistory((h) => {
        const base: HistoryEntry[] =
          h.length === 0
            ? [{ kind: "ai", proposal: initialProposal }]
            : [...h];
        return [
          ...base,
          { kind: "human", text },
          { kind: "ai", proposal: currentForHistory },
        ];
      });
      setModifyText("");
      setSelected("approve");
    } finally {
      setSubmitting(false);
    }
  }

  const canSave = selected === "approve" && !submitting;
  const canModify = selected === "modify" && modifyText.trim().length > 0 && !submitting;

  return (
    <div className="thread-page">
      <div
        className="thread-container"
        role="log"
        aria-label="既定工程の編集スレッド"
        aria-live="polite"
      >
        {displayHistory.map((entry, i) => {
          if (entry.kind === "ai") {
            return (
              <ReconstructionBubble
                key={`ai-${i}`}
                proposal={entry.proposal}
                isNew={i > 0}
                isGlobal
                rulesOpen={i === displayHistory.length - 1 ? rulesOpen : false}
                onToggleRules={() => setRulesOpen((v) => !v)}
                selected={i === displayHistory.length - 1 ? selected : "approve"}
                onSelect={(v) => {
                  if (i === displayHistory.length - 1) setSelected(v);
                }}
              />
            );
          }
          return <HumanModifyBubble key={`human-${i}`} text={entry.text} />;
        })}

        <div ref={threadEndRef} aria-hidden="true" />
      </div>

      {selected === "modify" && (
        <div className="thread-submit-bar">
          {submitError ? (
            <p className="form-error thread-submit-bar__error" role="alert">
              {submitError}
            </p>
          ) : null}
          <div className="recon-modify-row">
            <textarea
              className="textarea recon-modify__input"
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              placeholder="「デプロイ工程を足して」「S4 を削除して」など"
              rows={2}
              aria-label="変更の指示"
            />
            <button
              type="button"
              className="btn btn--primary recon-modify__btn"
              disabled={!canModify}
              onClick={() => void handleModifySubmit()}
            >
              {submitting ? <Spinner size={14} /> : null}
              反映して確認
            </button>
          </div>
        </div>
      )}

      {selected === "approve" && (
        <div className="recon-dock">
          {submitError ? (
            <p className="form-error" role="alert" style={{ margin: "0 0 var(--sp-2)" }}>
              {submitError}
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn--primary"
            disabled={!canSave}
            onClick={() => void handleSave()}
          >
            {submitting ? <Spinner size={14} /> : null}
            既定を保存 →
          </button>
        </div>
      )}
    </div>
  );
}

// ── GlobalReconstructionPage ───────────────────────────────────
// Route: /settings/reconstruction
// Launched from GlobalStepConfigPage "工程を組み直す" button.

export function GlobalReconstructionPage() {
  const { project } = useProjectContext();

  useSetTopbar(
    { left: <span className="crumb__current">既定を編集(全サイクル共通)</span> },
    [],
  );

  if (!project) {
    return (
      <div className="content-inner">
        <p className="state-msg">
          プロジェクトが未登録です。先にサイクル画面でリポジトリを登録してください。
        </p>
      </div>
    );
  }

  return <GlobalReconstructionThread projectId={project.id} />;
}
