// CycleRow — サイクル一覧の 1 枚カード(S3 scr-01.list): バージョン + ゴール + 状態バッジ +
// 進捗(いま「○○」を進行中(N ステップ中 M つ目))+「ステップ構成を見る」リンク + 主アクション。
import { Link } from "react-router-dom";
import type { Cycle } from "../../lib/api";
import {
  cycleDisplayState,
  currentStep,
  STATE_BADGE_CLASS,
  STATE_LABEL,
} from "../../lib/cycle-state";
import { stepLabel } from "../../lib/step-label";
import { ListIcon, PlayIcon, ChevronRightIcon } from "../../components/ui/Icon";

interface CycleRowProps {
  readonly cycle: Cycle;
}

export function CycleRow({ cycle }: CycleRowProps) {
  const state = cycleDisplayState(cycle);
  const total = cycle.phases.length;
  const doneCount = cycle.phases.filter((p) => p.state === "done").length;
  const everStarted = cycle.phases.some((p) => p.runs.length > 0);
  const step = currentStep(cycle);

  const progress =
    state === "done"
      ? "すべてのステップが完了しました"
      : everStarted && step
        ? `いま「${stepLabel(step)}」を進行中(${total} ステップ中 ${doneCount + 1} つ目)`
        : "まだ始めていません";

  return (
    <article className="cycle-card surface-card">
      <div className="cycle-card__head">
        <h2 className="cycle-card__title">
          <span className="cycle-card__version mono">{cycle.version}</span>
          {cycle.title}
        </h2>
        <span
          className={`badge ${STATE_BADGE_CLASS[state]}${state === "running" ? " badge--pulse" : ""}`}
        >
          {STATE_LABEL[state]}
        </span>
      </div>

      <p className="cycle-card__progress">{progress}</p>

      <div className="cycle-card__foot">
        <Link to={`/cycles/${cycle.id}/steps`} className="cycle-card__steps-link">
          <ListIcon size={14} />
          ステップ構成({total} ステップ)を見る
        </Link>
        <Link
          to={`/cycles/${cycle.id}`}
          className={everStarted ? "btn btn--surface" : "btn btn--primary"}
        >
          {everStarted ? (
            <>
              中身を開く <ChevronRightIcon size={14} />
            </>
          ) : (
            <>
              <PlayIcon size={14} /> このサイクルを始める
            </>
          )}
        </Link>
      </div>
    </article>
  );
}
