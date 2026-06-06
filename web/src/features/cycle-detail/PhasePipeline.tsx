// PhasePipeline (SCR-02) — the S1..S7 pipeline (8 nodes incl. S2.5). Each node is
// done (green ✓) / current (indigo, or running-spinner / stalled-amber !) /
// upcoming (neutral number). Connectors go green across done spans. Nodes
// re-entered after a backtrack carry a ↩ marker (amber) read by the legend.
import type { ReactNode } from "react";
import type { Cycle, Phase } from "../../lib/api";
import { latestRunOfCycle } from "../../lib/cycle-state";
import { Spinner } from "../../components/ui/Spinner";
import { CheckIcon, BacktrackIcon, PersonIcon } from "../../components/ui/Icon";

type NodeStatus = "done" | "current" | "upcoming";

interface NodeView {
  readonly phase: Phase;
  readonly status: NodeStatus;
  readonly runState: "running" | "stalled" | "failed" | "done" | undefined;
  readonly hasBacktrack: boolean;
  /** The current node is running but blocked on the human (#1/#5). */
  readonly humanWaiting: boolean;
}

function buildNodes(cycle: Cycle, humanWaiting: boolean): NodeView[] {
  const current = cycle.phases.find((p) => p.state !== "done");
  const latest = latestRunOfCycle(cycle);
  return cycle.phases.map((phase) => {
    const status: NodeStatus =
      phase.state === "done"
        ? "done"
        : phase === current
          ? "current"
          : "upcoming";
    const runState =
      status === "current" && latest && latest.phase.id === phase.id
        ? latest.run.state
        : undefined;
    // A phase re-entered after a backtrack has more than one recorded attempt.
    const hasBacktrack = phase.runs.length > 1 && phase.state === "done";
    return {
      phase,
      status,
      runState,
      hasBacktrack,
      humanWaiting: status === "current" && humanWaiting,
    };
  });
}

function nodeNumber(phase: Phase, index: number): string {
  const m = phase.step.match(/^S(\d+(?:\.\d+)?)$/);
  return m?.[1] ?? String(index + 1);
}

interface PhasePipelineProps {
  readonly cycle: Cycle;
  /** The current phase's running run is blocked on the human (#1/#5). */
  readonly humanWaiting?: boolean;
}

export function PhasePipeline({ cycle, humanWaiting = false }: PhasePipelineProps) {
  const nodes = buildNodes(cycle, humanWaiting);
  const anyBacktrack = nodes.some((n) => n.hasBacktrack);

  return (
    <section className="pipeline surface-card" aria-label="Phase パイプライン">
      <ol className="pipeline__track">
        {nodes.map((node, i) => {
          const prevDone = i > 0 && nodes[i - 1]?.status === "done";
          return (
            <li className="pipeline__node-wrap" key={node.phase.id}>
              {i > 0 ? (
                <span
                  className={`pipeline__connector${
                    node.status === "done" || prevDone
                      ? " pipeline__connector--done"
                      : ""
                  }`}
                  aria-hidden="true"
                />
              ) : null}
              <div className="pipeline__node-col">
                <PipelineNode node={node} index={i} />
                <span className="pipeline__step-label">{node.phase.step}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {anyBacktrack ? (
        <p className="pipeline__legend">
          <BacktrackIcon size={13} /> = 手戻り履歴(該当ステップへ一度戻って再開した)
        </p>
      ) : null}
    </section>
  );
}

function PipelineNode({ node, index }: { node: NodeView; index: number }) {
  const { status, runState } = node;
  const ariaCurrent = status === "current" ? "step" : undefined;

  let dotClass = `pipeline__node pipeline__node--${status}`;
  let inner: ReactNode = nodeNumber(node.phase, index);
  let label = `${node.phase.step} `;

  if (status === "done") {
    dotClass = "pipeline__node pipeline__node--done";
    inner = <CheckIcon size={15} />;
    label += "完了";
  } else if (status === "current" && node.humanWaiting) {
    // Running but blocked on the human: amber ring + person glyph, NOT the
    // teal AI spinner — the node reads "waiting on you" at a glance.
    dotClass = "pipeline__node pipeline__node--human";
    inner = <PersonIcon size={15} />;
    label += "あなたの対応待ち";
  } else if (status === "current" && runState === "running") {
    dotClass = "pipeline__node pipeline__node--running";
    inner = <Spinner size={15} />;
    label += "実行中";
  } else if (
    status === "current" &&
    (runState === "stalled" || runState === "failed")
  ) {
    dotClass = "pipeline__node pipeline__node--stalled";
    inner = "!";
    label += "停止";
  } else if (status === "current") {
    label += "現在のステップ";
  } else {
    label += "未着手";
  }

  return (
    <span className={dotClass} aria-current={ariaCurrent} aria-label={label}>
      {inner}
      {node.hasBacktrack ? (
        <span className="pipeline__backtrack-mark" aria-hidden="true">
          <BacktrackIcon size={11} />
        </span>
      ) : null}
    </span>
  );
}
