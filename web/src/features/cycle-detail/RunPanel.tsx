// RunPanel (SCR-02) — the state-dependent body below the pipeline. idle: a
// "現在 Run / 未起動" card prompting the next phase. running: a mono Run-log panel
// (role=log, live caret). stalled: amber reason card + retry. done: output card
// with review + next-phase links. Retry is enabled ONLY when stalled/failed.
import { Link } from "react-router-dom";
import type { Cycle, Phase, Run } from "../../lib/api";
import type { HumanWait } from "../../lib/cycle-state";
import { StateBadge } from "../../components/ui/StateBadge";
import { RetryIcon, PlayIcon, PersonIcon } from "../../components/ui/Icon";

interface RunPanelProps {
  readonly cycle: Cycle;
  readonly phase: Phase;
  readonly run: Run | undefined;
  readonly nextStep: string | undefined;
  readonly busy: boolean;
  readonly onRetry: (runId: string) => void;
  readonly onStartNext: (step: string) => void;
  /** Re-run a backtrack-rewound phase (appends a fresh run + launches). */
  readonly onRelaunch: (step: string) => void;
  /** Phase is "running" via a backtrack rewind but has no live run (US-13). */
  readonly rewound?: boolean;
  /** Set when the running run is blocked on the human (#1/#5). */
  readonly humanWait?: HumanWait | undefined;
}

export function RunPanel(props: RunPanelProps) {
  const { run, rewound, humanWait } = props;
  const state = run?.state;

  if (rewound) return <RewoundPanel {...props} />;
  if (!run || state === undefined) return <IdlePanel {...props} />;
  // A running run that is actually waiting on the human gets its OWN panel — the
  // "AI 実行中" log only renders for a running run with no open question.
  if (state === "running" && humanWait)
    return <HumanWaitPanel {...props} run={run} humanWait={humanWait} />;
  if (state === "running") return <RunningPanel {...props} run={run} />;
  if (state === "stalled" || state === "failed")
    return <StalledPanel {...props} run={run} />;
  return <DonePanel {...props} run={run} />;
}

function HumanWaitPanel({
  phase,
  run,
  humanWait,
}: RunPanelProps & { run: Run; humanWait: HumanWait }) {
  const isReview = humanWait.mode === "review";
  const verb = isReview ? "レビュー" : "回答";
  return (
    <section
      className="run-card run-card--human surface-card"
      aria-label="あなたの対応待ち"
    >
      <header className="run-card__head">
        <h2 className="run-card__title">あなたの対応待ち</h2>
        <StateBadge variant="stalled" icon={<PersonIcon size={13} />}>
          {phase.step} 待ち · attempt {run.attempt}
        </StateBadge>
      </header>
      <p className="run-card__body">
        <span aria-hidden="true">🧑 </span>
        <strong>AI はあなたの{verb}を待っています。</strong> {verb}
        すると Run が再開します。
      </p>
      <div className="run-card__actions">
        <Link
          className="btn btn--primary"
          to={`/cycles/${encodeURIComponent(humanWait.question.cycleId)}/q/${encodeURIComponent(humanWait.question.id)}`}
        >
          <PersonIcon size={14} /> {verb}する
        </Link>
        <Link className="btn btn--ghost" to="/inbox">
          Inbox を開く
        </Link>
      </div>
    </section>
  );
}

function IdlePanel({ phase, busy, onStartNext }: RunPanelProps) {
  return (
    <section className="run-card surface-card" aria-label="現在の Run">
      <header className="run-card__head">
        <h2 className="run-card__title">現在 Run</h2>
        <StateBadge variant="idle">未起動</StateBadge>
      </header>
      <p className="run-card__body">
        <strong>{phase.step} Phase 起動</strong> で AI が headless
        で成果物を生成します。判断が必要になれば Inbox にカードが届きます。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onStartNext(phase.step)}
          disabled={busy}
        >
          <PlayIcon size={14} />
          {phase.step} Phase 起動
        </button>
      </div>
    </section>
  );
}

function RewoundPanel({ phase, busy, onRelaunch }: RunPanelProps) {
  // US-13 backtrack: the pipeline rewound this phase to "running" and recorded a
  // Fact, but did NOT create a new run (backtrackTo leaves only terminal runs in
  // history). Relaunch appends a fresh run on this phase and launches it — so the
  // re-execute button drives the rewound phase back into a live run.
  return (
    <section
      className="run-card surface-card"
      aria-label={`${phase.step} 要再実行`}
    >
      <header className="run-card__head">
        <h2 className="run-card__title">{phase.step} 要再実行</h2>
        <StateBadge variant="stalled">running(run なし)</StateBadge>
      </header>
      <p className="run-card__body">
        差し戻しでこの Phase まで巻き戻りました(理由は Decision / ledger
        に記録済み)。<strong>{phase.step} を再実行</strong>{" "}
        すると新しい run を起動して再生成します。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onRelaunch(phase.step)}
          disabled={busy}
        >
          <PlayIcon size={14} />
          {phase.step} を再実行
        </button>
      </div>
    </section>
  );
}

function RunningPanel({ phase, run }: RunPanelProps & { run: Run }) {
  return (
    <section className="run-card surface-card" aria-label="Run ログ">
      <header className="run-card__head">
        <h2 className="run-card__title">Run ログ</h2>
        <StateBadge variant="running" pulse>
          running · attempt {run.attempt}
        </StateBadge>
      </header>
      <div className="run-log mono" role="log" aria-live="polite">
        <p className="run-log__line">
          <span className="run-log__ts">[{shortTime(run.startedAt)}]</span> phase{" "}
          {phase.step} started · agent sdk headless
        </p>
        <p className="run-log__line">
          <span className="run-log__ts">[{shortTime(run.startedAt)}]</span> AI が
          headless で生成中…
        </p>
        <p className="run-log__line run-log__line--tail">
          <span className="run-log__caret" aria-hidden="true" />
          waiting for next output
        </p>
      </div>
    </section>
  );
}

function StalledPanel({ run, busy, onRetry }: RunPanelProps & { run: Run }) {
  const failed = run.state === "failed";
  return (
    <section
      className="run-card run-card--stalled surface-card"
      aria-label="停止理由"
    >
      <header className="run-card__head">
        <h2 className="run-card__title">停止理由</h2>
        <StateBadge variant={failed ? "failed" : "stalled"}>
          {failed ? "failed" : "stalled"} · attempt {run.attempt}
        </StateBadge>
      </header>
      <p className="run-card__body">
        {run.failureReason
          ? run.failureReason
          : failed
            ? "Run が失敗しました。"
            : "エージェントが一定時間 無出力のため stall 検知しました。"}{" "}
        <strong>retry</strong> で同じ worktree から再開します。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onRetry(run.id)}
          disabled={busy}
        >
          <RetryIcon size={14} />
          retry
        </button>
      </div>
    </section>
  );
}

function DonePanel({
  phase,
  nextStep,
  busy,
  onStartNext,
}: RunPanelProps & { run: Run }) {
  return (
    <section className="run-card surface-card" aria-label={`${phase.step} 出力`}>
      <header className="run-card__head">
        <h2 className="run-card__title">{phase.step} 出力</h2>
        <StateBadge variant="done">done</StateBadge>
      </header>
      <p className="run-card__body">
        {phase.step} が完了しました。レビュー待ちカードを Inbox に生成済み。承認すると
        {nextStep ? ` ${nextStep} へ進みます。` : " Cycle が完了します。"}
      </p>
      <div className="run-card__actions">
        <Link className="btn btn--primary" to="/inbox">
          Inbox でレビュー
        </Link>
        {nextStep ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onStartNext(nextStep)}
            disabled={busy}
          >
            <PlayIcon size={13} />
            {nextStep} を先に起動
          </button>
        ) : null}
      </div>
    </section>
  );
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toTimeString().slice(0, 8);
}
