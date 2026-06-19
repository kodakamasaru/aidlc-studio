// PhasePipeline — SCR-05 PhaseGroup 5-band layout (US-07).
//
// Layout change: 12 nodes in a single horizontal track → 5 PhaseGroup bands
// (要件 / 設計 / 実装 / 検証 / 改善). Each band is a card; bands are arranged
// in a horizontal flex row. Steps inside each band are listed vertically.
// Only steps present in cycle.phases are rendered (data-driven, no phantom
// nodes or "省略" labels). Variable step counts are absorbed by each band's
// height; the overall 5-column layout never overflows horizontally.
//
// Node state visuals (done/current/upcoming/stalled/human-waiting/backtrack)
// are preserved unchanged via PipelineNode.

import type { ReactNode } from "react";
import type { Cycle, Phase } from "../../lib/api";
import { latestRunOfCycle } from "../../lib/cycle-state";
import { stepLabel } from "../../lib/step-label";
import { Spinner } from "../../components/ui/Spinner";
import { CheckIcon, BacktrackIcon, PersonIcon } from "../../components/ui/Icon";
import { PHASE_GROUPS, phaseGroupOf } from "./phase-group";
import type { PhaseGroupKey } from "./phase-group";

// ── Node model ────────────────────────────────────────────────

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

// ── Band grouping ─────────────────────────────────────────────

interface BandView {
  readonly key: PhaseGroupKey;
  readonly label: string;
  /** Nodes whose step belongs to this PhaseGroup, in cycle order. */
  readonly nodes: readonly NodeView[];
  /** Aggregate band status derived from contained nodes. */
  readonly bandStatus: "done" | "current" | "upcoming";
}

function deriveBandStatus(nodes: readonly NodeView[]): BandView["bandStatus"] {
  if (nodes.length === 0) return "upcoming";
  if (nodes.some((n) => n.status === "current")) return "current";
  if (nodes.every((n) => n.status === "done")) return "done";
  return "upcoming";
}

function groupIntoBands(nodes: NodeView[]): BandView[] {
  // Build a map from PhaseGroupKey → nodes in cycle order.
  const nodesByGroup = new Map<PhaseGroupKey, NodeView[]>();
  for (const node of nodes) {
    const key = phaseGroupOf(node.phase.step);
    const bucket = nodesByGroup.get(key);
    if (bucket) {
      bucket.push(node);
    } else {
      nodesByGroup.set(key, [node]);
    }
  }

  // Return all 5 bands in canonical order (empty bands included so the
  // 5-column grid never collapses — they just render with no step pills).
  return PHASE_GROUPS.map((meta) => {
    const bandNodes = nodesByGroup.get(meta.key) ?? [];
    return {
      key: meta.key,
      label: meta.label,
      nodes: bandNodes,
      bandStatus: deriveBandStatus(bandNodes),
    };
  });
}

// ── PhasePipeline ─────────────────────────────────────────────

interface PhasePipelineProps {
  readonly cycle: Cycle;
  /** The current phase's running run is blocked on the human (#1/#5). */
  readonly humanWaiting?: boolean;
}

export function PhasePipeline({ cycle, humanWaiting = false }: PhasePipelineProps) {
  const nodes = buildNodes(cycle, humanWaiting);
  const bands = groupIntoBands(nodes);

  return (
    <section className="pipeline surface-card" aria-label="Phase パイプライン">
      <ol className="pipeline__bands" aria-label="工程グループ">
        {bands.map((band, bandIdx) => (
          <li
            key={band.key}
            className={`pipeline__band pipeline__band--${band.bandStatus}`}
          >
            {/* Connector line between adjacent bands */}
            {bandIdx > 0 ? (
              <span
                className={`pipeline__band-connector${
                  bands[bandIdx - 1]?.bandStatus === "done"
                    ? " pipeline__band-connector--done"
                    : ""
                }`}
                aria-hidden="true"
              />
            ) : null}

            {/* Band card: header + step pill list */}
            <div className="pipeline__band-card">
              <div className="pipeline__band-head">
                <BandStatusGlyph
                  bandStatus={band.bandStatus}
                  hasStalledNode={band.nodes.some(
                    (n) =>
                      n.status === "current" &&
                      (n.runState === "stalled" || n.runState === "failed"),
                  )}
                />
                <span className="pipeline__band-name">{band.label}</span>
                <span className="pipeline__band-state">
                  {bandStatusLabel(band.bandStatus, band.nodes)}
                </span>
              </div>

              {band.nodes.length > 0 ? (
                <ol
                  className="pipeline__band-steps"
                  aria-label={`${band.label}のステップ`}
                >
                  {band.nodes.map((node) => (
                    <li key={node.phase.id} className="pipeline__band-step-item">
                      <PipelineNode node={node} />
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="pipeline__legend">
        <span aria-hidden="true">凡例: ✓ 緑 = 完了 / ● 青 = 進行中 / ! オレンジ = 行き詰まり / ○ = 未着手 / ↩ オレンジ = 手戻り。</span>
        <span className="pipeline__legend-sr" aria-hidden="true">各ステップは「AI が作る → 自動でチェック → AI が点検」の順に進みます。</span>
      </p>
      {/* screen-reader accessible version */}
      <p className="sr-only">
        凡例: チェックマーク 緑 = 完了 / 丸 青 = 進行中 / 感嘆符 オレンジ = 行き詰まり / 空丸 = 未着手 / 手戻り矢印 オレンジ = 手戻り。各ステップは AI が作る、自動でチェック、AI が点検の順に進みます。
      </p>
    </section>
  );
}

// ── Band status helpers ───────────────────────────────────────

function bandStatusLabel(
  status: BandView["bandStatus"],
  nodes: readonly NodeView[],
): string {
  if (status === "done") {
    const hasBacktrack = nodes.some((n) => n.hasBacktrack);
    return hasBacktrack ? "完了 ↩" : "完了";
  }
  if (status === "current") {
    // Surface stall at band level
    const hasStalledNode = nodes.some(
      (n) =>
        n.status === "current" &&
        (n.runState === "stalled" || n.runState === "failed"),
    );
    return hasStalledNode ? "行き詰まり" : "進行中";
  }
  return "未着手";
}

interface BandStatusGlyphProps {
  readonly bandStatus: BandView["bandStatus"];
  readonly hasStalledNode: boolean;
}

function BandStatusGlyph({ bandStatus, hasStalledNode }: BandStatusGlyphProps) {
  if (bandStatus === "done") {
    return (
      <span
        className="pipeline__band-glyph pipeline__band-glyph--done"
        aria-hidden="true"
      >
        <CheckIcon size={14} />
      </span>
    );
  }
  if (bandStatus === "current") {
    const cls = hasStalledNode
      ? "pipeline__band-glyph pipeline__band-glyph--stalled"
      : "pipeline__band-glyph pipeline__band-glyph--current";
    return (
      <span className={cls} aria-hidden="true">
        {hasStalledNode ? "!" : "●"}
      </span>
    );
  }
  return (
    <span
      className="pipeline__band-glyph pipeline__band-glyph--upcoming"
      aria-hidden="true"
    >
      ○
    </span>
  );
}

// ── PipelineNode — step pill inside a band ────────────────────
// Preserves all existing status visuals: done / current / running / stalled /
// human-waiting / backtrack. Layout adapts: pill shape with inline label
// (name always visible, no separate label element below node).

function PipelineNode({ node }: { node: NodeView }) {
  const { status, runState } = node;
  const ariaCurrent = status === "current" ? ("step" as const) : undefined;

  let pillClass = `pipeline__pill pipeline__pill--${status}`;
  let glyph: ReactNode = "○";
  let ariaLabel = `${stepLabel(node.phase.step)} `;

  if (status === "done") {
    pillClass = "pipeline__pill pipeline__pill--done";
    glyph = <CheckIcon size={13} />;
    ariaLabel += "完了";
  } else if (status === "current" && node.humanWaiting) {
    pillClass = "pipeline__pill pipeline__pill--human";
    glyph = <PersonIcon size={13} />;
    ariaLabel += "あなたの対応待ち";
  } else if (status === "current" && runState === "running") {
    pillClass = "pipeline__pill pipeline__pill--running";
    glyph = <Spinner size={13} />;
    ariaLabel += "実行中";
  } else if (
    status === "current" &&
    (runState === "stalled" || runState === "failed")
  ) {
    pillClass = "pipeline__pill pipeline__pill--stalled";
    glyph = "!";
    ariaLabel += "停止";
  } else if (status === "current") {
    pillClass = "pipeline__pill pipeline__pill--current";
    glyph = "●";
    ariaLabel += "現在のステップ";
  } else {
    ariaLabel += "未着手";
  }

  return (
    <span
      className={pillClass}
      aria-current={ariaCurrent}
      aria-label={ariaLabel}
    >
      <span className="pipeline__pill-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="pipeline__pill-name">{stepLabel(node.phase.step)}</span>
      {node.hasBacktrack ? (
        <span className="pipeline__backtrack-mark" aria-hidden="true">
          <BacktrackIcon size={11} />
        </span>
      ) : null}
    </span>
  );
}
