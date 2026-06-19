// RunPanel (SCR-02) — パイプライン下の状態依存ボディ。idle: 「現在のステップ / 未起動」
// カードで次ステップを促す。running: 作業ログパネル(role=log)。stalled: 停止理由 +
// やり直し。done: 成果カード + 次ステップ導線。やり直しは stalled/failed のときだけ。
// 用語は平易な日本語(Run/attempt/worktree/Phase/Inbox 等の内部語を出さない)。
import { Link } from "react-router-dom";
import type { Cycle, Phase, Run } from "../../lib/api";
import type { HumanWait } from "../../lib/cycle-state";
import { StateBadge } from "../../components/ui/StateBadge";
import { RetryIcon, PlayIcon, PersonIcon } from "../../components/ui/Icon";
import { stepLabel } from "../../lib/step-label";

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
  // 作業ログ only renders for a running run with no open question.
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
  const verb = isReview ? "確認" : "回答";
  return (
    <section
      className="run-card run-card--human surface-card"
      aria-label="あなたの対応待ち"
    >
      <header className="run-card__head">
        <h2 className="run-card__title">あなたの対応待ち</h2>
        <StateBadge variant="stalled" icon={<PersonIcon size={13} />}>
          {stepLabel(phase.step)} 待ち · {run.attempt}回目
        </StateBadge>
      </header>
      <p className="run-card__body">
        <span aria-hidden="true">🧑 </span>
        <strong>AI はあなたの{verb}を待っています。</strong>
        {verb}すると AI が作業を再開します。
      </p>
      <div className="run-card__actions">
        <Link
          className="btn btn--primary"
          to={`/cycles/${encodeURIComponent(humanWait.question.cycleId)}/q/${encodeURIComponent(humanWait.question.id)}`}
        >
          <PersonIcon size={14} /> {verb}する
        </Link>
        <Link className="btn btn--ghost" to="/inbox">
          受信箱を開く
        </Link>
      </div>
    </section>
  );
}

function IdlePanel({ phase, busy, onStartNext }: RunPanelProps) {
  const name = stepLabel(phase.step);
  return (
    <section className="run-card surface-card" aria-label="現在のステップ">
      <header className="run-card__head">
        <h2 className="run-card__title">現在のステップ</h2>
        <StateBadge variant="idle">未起動</StateBadge>
      </header>
      <p className="run-card__body">
        <strong>「{name}」を始める</strong>と、AI
        がバックグラウンドで成果物を作ります。判断が必要になれば受信箱にお知らせが届きます。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onStartNext(phase.step)}
          disabled={busy}
        >
          <PlayIcon size={14} />
          「{name}」を始める
        </button>
      </div>
    </section>
  );
}

function RewoundPanel({ phase, busy, onRelaunch }: RunPanelProps) {
  // US-13 backtrack: the pipeline rewound this phase to "running" and recorded a
  // Fact, but did NOT create a new run. Relaunch appends a fresh run and launches.
  const name = stepLabel(phase.step);
  return (
    <section
      className="run-card surface-card"
      aria-label={`「${name}」の再実行が必要`}
    >
      <header className="run-card__head">
        <h2 className="run-card__title">「{name}」の再実行が必要</h2>
        <StateBadge variant="stalled">停止中(やり直し待ち)</StateBadge>
      </header>
      <p className="run-card__body">
        差し戻しでこのステップまで巻き戻りました(理由は決定メモに記録済み)。
        <strong>「{name}」を再実行</strong>すると、もう一度作り直します。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onRelaunch(phase.step)}
          disabled={busy}
        >
          <PlayIcon size={14} />
          「{name}」を再実行
        </button>
      </div>
    </section>
  );
}

function RunningPanel({ phase, run }: RunPanelProps & { run: Run }) {
  const name = stepLabel(phase.step);
  // S6 run-role: evaluator = 検証中(中身を点検)/ generator(or 無) = 進行中(作る)。
  const isEval = run.role === "evaluator";
  const stateWord = isEval ? "検証中" : "進行中";
  return (
    <section className="run-card surface-card" aria-label={stateWord}>
      <header className="run-card__head">
        <h2 className="run-card__title">{stateWord}</h2>
        <StateBadge variant="running" pulse>
          {stateWord} · {run.attempt}回目
        </StateBadge>
      </header>
      <div className="run-log mono" role="log" aria-live="polite">
        <p className="run-log__line">
          「{name}」を{isEval ? "点検" : "作成"}しています
        </p>
        <p className="run-log__line run-log__line--tail">
          <span className="run-log__caret" aria-hidden="true" />
          {isEval ? "成果の中身を確認中…" : "AI がバックグラウンドで作成中…"}
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
          {failed ? "失敗" : "停止"} · {run.attempt}回目
        </StateBadge>
      </header>
      <p className="run-card__body">
        {run.failureReason
          ? run.failureReason
          : failed
            ? "AI の作業が失敗しました。"
            : "AI が一定時間 反応しなかったため停止しました。"}{" "}
        <strong>「やり直す」</strong>で同じ作業環境から再開します。
      </p>
      <div className="run-card__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onRetry(run.id)}
          disabled={busy}
        >
          <RetryIcon size={14} />
          やり直す
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
  const name = stepLabel(phase.step);
  return (
    <section className="run-card surface-card" aria-label={`「${name}」の成果`}>
      <header className="run-card__head">
        <h2 className="run-card__title">「{name}」の成果</h2>
        <StateBadge variant="done">完了</StateBadge>
      </header>
      <p className="run-card__body">
        「{name}」が完了しました。確認待ちのお知らせを受信箱に用意しています。承認すると
        {nextStep ? `「${stepLabel(nextStep)}」へ進みます。` : "サイクルが完了します。"}
      </p>
      <div className="run-card__actions">
        <Link className="btn btn--primary" to="/inbox">
          受信箱で確認
        </Link>
        {nextStep ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => onStartNext(nextStep)}
            disabled={busy}
          >
            <PlayIcon size={13} />
            「{stepLabel(nextStep)}」を先に始める
          </button>
        ) : null}
      </div>
    </section>
  );
}

