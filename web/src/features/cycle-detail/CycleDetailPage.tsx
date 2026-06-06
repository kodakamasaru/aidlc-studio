// SCR-02 — Cycle detail + run (/cycles/:cycleId). Shows the phase pipeline and a
// state-dependent run panel; the topbar primary action switches by state
// (idle=起動 / running=生成中 disabled / stalled=retry / done=Inbox review).
// Starting/retrying mutates the cycle then reloads. States: idle/running/stalled/done.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Cycle, type Question } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import {
  activePhase,
  cycleDisplayState,
  humanWaitingForRun,
  latestRunOfPhase,
  STATE_LABEL,
  type DisplayState,
} from "../../lib/cycle-state";
import { errorMessage } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { LoadingMessage, ErrorMessage } from "../../components/ui/StateMessage";
import { PlayIcon, RetryIcon, PersonIcon } from "../../components/ui/Icon";
import { PhasePipeline } from "./PhasePipeline";
import { RunPanel } from "./RunPanel";
import "./cycle-detail.css";

/** How often SCR-02 re-fetches the cycle + its open questions while live. */
const POLL_INTERVAL_MS = 2500;

export function CycleDetailPage() {
  const { cycleId = "" } = useParams();
  const { refreshInbox } = useProjectContext();
  const cycleQ = useAsync(() => api.getCycle(cycleId), [cycleId]);
  // Open questions for THIS cycle — drives the human-waiting surface (#1/#5).
  const inboxQ = useAsync(() => api.getCycleInbox(cycleId), [cycleId]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function mutate(op: () => Promise<Cycle>) {
    setBusy(true);
    setActionError(null);
    try {
      await op();
      cycleQ.reload();
      inboxQ.reload();
      refreshInbox();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const cycle = cycleQ.data;

  // Live poll: while the cycle is still active (not done/paused), re-fetch both
  // the cycle and its open questions so progress (AI → human-waiting → done)
  // appears without a manual reload. Terminal/paused cycles aren't polled; the
  // interval pauses while the tab is hidden and resumes on focus.
  const isLive = cycle?.state === "active";
  const reloadCycle = cycleQ.reload;
  const reloadInbox = inboxQ.reload;
  useEffect(() => {
    if (!isLive) return;
    const tick = () => {
      if (document.hidden) return;
      reloadCycle();
      reloadInbox();
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isLive, reloadCycle, reloadInbox]);

  const phase = cycle ? activePhase(cycle) : undefined;
  // The run the human acts on is the ACTIVE phase's own latest run — NOT the
  // cycle-global latest. After a backtrack the active phase is an earlier one
  // whose latest run is a stale terminal run (or none); keying off the global
  // latest would mislabel the topbar (e.g. show "Inbox でレビュー" for a phase
  // that actually needs re-execution). RunPanel keys off this same run.
  const activeRun = phase ? latestRunOfPhase(phase) : undefined;
  const runState = activeRun?.state;
  const nextStep = cycle ? nextPendingStep(cycle) : undefined;
  const displayState: DisplayState = cycle ? cycleDisplayState(cycle) : "idle";
  // Backtrack rewinds the target phase to domain state "running" WITHOUT adding
  // a fresh run (US-13 pipeline rewind). The rewound phase therefore has either
  // NO run or only a stale terminal `done` run from its earlier completion — that
  // is what distinguishes it from a genuinely live run. A stalled/failed run is
  // a real actionable run (retry), NOT a rewind, so it must not match here.
  // Auto-relaunch is deferred to v0.0.x (ledger S7-C4), so the rewound state is
  // surfaced as a disabled-with-explanation re-run affordance.
  const rewound =
    phase?.state === "running" &&
    (activeRun === undefined || activeRun.state === "done");

  // #1/#5: the active run is "running" but actually blocked on the human (an open
  // Question targets it). Surfaced as a distinct human-waiting state — NOT the
  // "AI 生成中" log — so the screen never misleads while it waits on the Inbox.
  const openQuestions: readonly Question[] = inboxQ.data ?? [];
  const humanWait = rewound
    ? undefined
    : humanWaitingForRun(activeRun, openQuestions);

  const onStart = (step: string) => mutate(() => api.startPhase(cycleId, step));
  const onRetry = (runId: string) => mutate(() => api.retryRun(cycleId, runId));

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to="/" className="crumb">
            Cycles
          </Link>
          <span className="crumb__sep">/</span>
          <span className="crumb__current">{cycle?.version ?? "…"}</span>
        </span>
      ),
      right: cycle ? (
        <TopbarActions
          step={phase?.step}
          runState={runState}
          runId={activeRun?.id}
          rewound={rewound}
          busy={busy}
          stateBadge={
            humanWait ? (
              <StateBadge variant="stalled" icon={<PersonIcon size={13} />}>
                {phase ? `${phase.step} ` : ""}待ち(あなた)
              </StateBadge>
            ) : (
              <StateBadge
                variant={displayState}
                pulse={displayState === "running"}
              >
                {phase ? `${phase.step} ` : ""}
                {STATE_LABEL[displayState]}
              </StateBadge>
            )
          }
          humanWaitId={humanWait?.question.id}
          onStart={onStart}
          onRetry={onRetry}
        />
      ) : undefined,
    },
    [cycle, phase?.step, runState, rewound, busy, displayState, humanWait?.question.id],
  );

  if (cycleQ.status === "loading") {
    return (
      <div className="content-inner">
        <LoadingMessage />
      </div>
    );
  }
  if (cycleQ.status === "error" || !cycle) {
    return (
      <div className="content-inner">
        <ErrorMessage error={cycleQ.error} onRetry={cycleQ.reload} />
      </div>
    );
  }

  const headSub = rewound
    ? `${phase?.step ?? ""} へ差し戻し済み — 再実行が必要です`
    : humanWait
      ? humanWait.mode === "review"
        ? `${phase?.step ?? ""} の成果レビュー待ち — Inbox であなたの確認が必要です`
        : `${phase?.step ?? ""} は回答待ち — Inbox であなたの回答が必要です`
      : runSubtitle(displayState, phase?.step, nextStep);

  return (
    <div className="content-inner cycle-detail">
      <header className="page-head">
        <h1 className="page-title">{cycle.title}</h1>
        <p className="page-sub">{headSub}</p>
      </header>

      {actionError ? (
        <p className="form-error cycle-detail__action-error" role="alert">
          {actionError}
        </p>
      ) : null}

      <PhasePipeline cycle={cycle} humanWaiting={humanWait !== undefined} />

      {phase ? (
        <RunPanel
          cycle={cycle}
          phase={phase}
          run={rewound ? undefined : activeRun}
          rewound={rewound}
          humanWait={humanWait}
          nextStep={nextStep}
          busy={busy}
          onRetry={onRetry}
          onStartNext={onStart}
        />
      ) : null}
    </div>
  );
}

interface TopbarActionsProps {
  readonly step: string | undefined;
  readonly runState: "running" | "stalled" | "done" | "failed" | undefined;
  readonly runId: string | undefined;
  readonly rewound: boolean;
  readonly busy: boolean;
  readonly stateBadge: ReactNode;
  /** When the active run is blocked on the human, the open question's id. */
  readonly humanWaitId: string | undefined;
  readonly onStart: (step: string) => void;
  readonly onRetry: (runId: string) => void;
}

function TopbarActions({
  step,
  runState,
  runId,
  rewound,
  busy,
  stateBadge,
  humanWaitId,
  onStart,
  onRetry,
}: TopbarActionsProps) {
  let action: ReactNode = null;

  if (humanWaitId) {
    // The run is running but waiting on the human — point straight at the card.
    action = (
      <Link
        to={`/questions/${encodeURIComponent(humanWaitId)}`}
        className="btn btn--primary"
      >
        <PersonIcon size={14} /> Inbox で対応する →
      </Link>
    );
  } else if (rewound) {
    // Backtracked phase: domain state is "running" but there is no live run and
    // no domain path to launch one on an already-"running" phase (auto-relaunch
    // deferred to v0.0.x). Surface the affordance disabled-with-explanation so it
    // never looks broken nor mis-fires PhaseAlreadyRunning.
    action = (
      <button
        type="button"
        className="btn btn--primary"
        disabled
        title="差し戻し後の自動再実行は v0.0.x で対応(現状は手動 relaunch 待ち)"
      >
        <PlayIcon size={14} /> 再実行待ち
      </button>
    );
  } else if (runState === "running") {
    action = (
      <button type="button" className="btn btn--surface" disabled>
        <Spinner size={14} /> 生成中
      </button>
    );
  } else if ((runState === "stalled" || runState === "failed") && runId) {
    action = (
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => onRetry(runId)}
        disabled={busy}
      >
        <RetryIcon size={14} /> retry
      </button>
    );
  } else if (step && runState !== "done") {
    action = (
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => onStart(step)}
        disabled={busy}
      >
        <PlayIcon size={14} /> {step} Phase 起動
      </button>
    );
  } else if (runState === "done") {
    action = (
      <Link to="/inbox" className="btn btn--primary">
        Inbox でレビュー →
      </Link>
    );
  }

  return (
    <>
      {stateBadge}
      {action}
    </>
  );
}

/** The step to start next: the first pending phase's step. */
function nextPendingStep(cycle: Cycle): string | undefined {
  return cycle.phases.find((p) => p.state === "pending")?.step;
}

function runSubtitle(
  state: DisplayState,
  step: string | undefined,
  nextStep: string | undefined,
): string {
  switch (state) {
    case "running":
      return `${step ?? ""} を生成中…`;
    case "stalled":
    case "failed":
      return "Run が停止しました";
    case "done":
      return "Cycle 完了";
    default:
      return nextStep ? `次に ${nextStep} を起動できます` : "Phase を起動できます";
  }
}
