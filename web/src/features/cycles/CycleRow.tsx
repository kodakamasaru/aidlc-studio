// CycleRow — one clickable list row: state badge (color+dot+label) + title +
// meta (current step / relative created time) + Sn/7 progress + chevron. The
// whole row is a button → SCR-02.
import { useNavigate } from "react-router-dom";
import type { Cycle } from "../../lib/api";
import {
  cycleDisplayState,
  currentStep,
  progressLabel,
  STATE_BADGE_CLASS,
  STATE_LABEL,
} from "../../lib/cycle-state";
import { relativeTime } from "../../lib/format";
import { ChevronRightIcon } from "../../components/ui/Icon";

interface CycleRowProps {
  readonly cycle: Cycle;
}

export function CycleRow({ cycle }: CycleRowProps) {
  const navigate = useNavigate();
  const state = cycleDisplayState(cycle);
  const step = currentStep(cycle);
  const everStarted = cycle.phases.some((p) => p.runs.length > 0);

  const meta =
    state === "done"
      ? "完了"
      : !everStarted
        ? "未起動"
        : step
          ? `現在 ${step}`
          : "未起動";

  return (
    <button
      type="button"
      className="cycle-row"
      onClick={() => navigate(`/cycles/${cycle.id}`)}
    >
      <span
        className={`badge ${STATE_BADGE_CLASS[state]}${state === "running" ? " badge--pulse" : ""}`}
      >
        {STATE_LABEL[state]}
      </span>

      <span className="cycle-row__main">
        <span className="cycle-row__title">
          <span className="cycle-row__version mono">{cycle.version}</span>
          {cycle.title}
        </span>
        <span className="cycle-row__meta">
          {meta}
          <span className="cycle-row__sep">·</span>
          作成 {relativeTime(cycle.createdAt)}
        </span>
      </span>

      <span className="cycle-row__progress mono">{progressLabel(cycle)}</span>
      <span className="cycle-row__chevron" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </button>
  );
}
