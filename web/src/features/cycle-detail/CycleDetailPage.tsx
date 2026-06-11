// SCR-02 — サイクル詳細 + 実行 (/cycles/:cycleId)。ステップのパイプラインと状態依存の
// ランパネルを表示。トップバーの主アクションは状態で切替(未起動=始める / 進行中=作成中
// disabled / 停止=やり直す / 完了=受信箱で確認)。起動/やり直しはサイクルを更新→再読込。
// 用語は平易な日本語(Cycle/Phase/Run/retry/Inbox 等の内部語を出さない)。
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
import { stepLabel } from "../../lib/step-label";
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
  // the cycle and its open questions so progress appears without a manual reload.
  const isLive = cycle?.state === "active";
  const reloadCycle = cycleQ.reload;
  const reloadInbox = inboxQ.reload;
  useEffect(() => {
    if (!isLive) return;
    const tick = () => {
      if (document.hidden) return;
      reloadCycle({ background: true });
      reloadInbox({ background: true });
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
  const activeRun = phase ? latestRunOfPhase(phase) : undefined;
  const runState = activeRun?.state;
  const nextStep = cycle ? nextPendingStep(cycle) : undefined;
  const displayState: DisplayState = cycle ? cycleDisplayState(cycle) : "idle";
  const rewound =
    phase?.state === "running" &&
    (activeRun === undefined || activeRun.state === "done");

  const openQuestions: readonly Question[] = inboxQ.data ?? [];
  const humanWait = rewound
    ? undefined
    : humanWaitingForRun(activeRun, openQuestions);

  const onStart = (step: string) => mutate(() => api.startPhase(cycleId, step));
  const onRetry = (runId: string) => mutate(() => api.retryRun(cycleId, runId));
  const onRelaunch = (step: string) =>
    mutate(() => api.relaunchPhase(cycleId, step));

  const stepName = phase ? stepLabel(phase.step) : "";

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to="/" className="crumb">
            サイクル
          </Link>
          <span className="crumb__sep">/</span>
          <span className="crumb__current">{cycle?.version ?? "…"}</span>
        </span>
      ),
      right: cycle ? (
        <TopbarActions
          cycleId={cycleId}
          step={phase?.step}
          runState={runState}
          runId={activeRun?.id}
          rewound={rewound}
          busy={busy}
          stateBadge={
            humanWait ? (
              <StateBadge variant="stalled" icon={<PersonIcon size={13} />}>
                {phase ? `${stepName} ` : ""}待ち(あなた)
              </StateBadge>
            ) : (
              <StateBadge
                variant={displayState}
                pulse={displayState === "running"}
              >
                {phase ? `${stepName} ` : ""}
                {STATE_LABEL[displayState]}
              </StateBadge>
            )
          }
          humanWaitId={humanWait?.question.id}
          onStart={onStart}
          onRetry={onRetry}
          onRelaunch={onRelaunch}
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
    ? `「${stepName}」へ差し戻し済み — 再実行が必要です`
    : humanWait
      ? humanWait.mode === "review"
        ? `「${stepName}」の成果を確認待ち — 受信箱であなたの確認が必要です`
        : `「${stepName}」は回答待ち — 受信箱であなたの回答が必要です`
      : runSubtitle(displayState, phase?.step, nextStep);

  return (
    <div className="content-inner cycle-detail">
      <header className="page-head">
        <h1 className="page-title">{cycle.title}</h1>
        <p className="page-sub">{headSub}</p>
        <Link to={`/cycles/${cycleId}/steps`} className="page-head__link">
          ステップ構成を見る →
        </Link>
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
          onRelaunch={onRelaunch}
        />
      ) : null}
    </div>
  );
}

interface TopbarActionsProps {
  readonly cycleId: string;
  readonly step: string | undefined;
  readonly runState: "running" | "stalled" | "done" | "failed" | undefined;
  readonly runId: string | undefined;
  readonly rewound: boolean;
  readonly busy: boolean;
  readonly stateBadge: ReactNode;
  readonly humanWaitId: string | undefined;
  readonly onStart: (step: string) => void;
  readonly onRetry: (runId: string) => void;
  readonly onRelaunch: (step: string) => void;
}

function TopbarActions({
  cycleId,
  step,
  runState,
  runId,
  rewound,
  busy,
  stateBadge,
  humanWaitId,
  onStart,
  onRetry,
  onRelaunch,
}: TopbarActionsProps) {
  let action: ReactNode = null;
  const name = step ? stepLabel(step) : "";

  if (humanWaitId) {
    action = (
      <Link
        to={`/cycles/${encodeURIComponent(cycleId)}/q/${encodeURIComponent(humanWaitId)}`}
        className="btn btn--primary"
      >
        <PersonIcon size={14} /> 対応する →
      </Link>
    );
  } else if (rewound && step) {
    action = (
      <button
        type="button"
        className="btn btn--primary"
        onClick={() => onRelaunch(step)}
        disabled={busy}
      >
        <PlayIcon size={14} /> 「{name}」を再実行
      </button>
    );
  } else if (runState === "running") {
    action = (
      <button type="button" className="btn btn--surface" disabled>
        <Spinner size={14} /> 作成中
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
        <RetryIcon size={14} /> やり直す
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
        <PlayIcon size={14} /> 「{name}」を始める
      </button>
    );
  } else if (runState === "done") {
    action = (
      <Link to="/inbox" className="btn btn--primary">
        受信箱で確認 →
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
      return `「${stepLabel(step ?? "")}」を作成中…`;
    case "stalled":
    case "failed":
      return "AI の作業が停止しました";
    case "done":
      return "サイクル完了";
    default:
      return nextStep
        ? `次に「${stepLabel(nextStep)}」を始められます`
        : "ステップを始められます";
  }
}
