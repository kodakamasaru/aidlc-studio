// Derive a human title + meta line for a Question from its kind-discriminated
// payload. Used by the inbox card and the detail headers. ステップ名は平易名で表示。
import type { Question } from "../../lib/api";
import { relativeTime } from "../../lib/format";
import { stepLabel } from "../../lib/step-label";

export function questionTitle(q: Question): string {
  switch (q.payload.kind) {
    case "question":
      return q.payload.prompt || "AI からの質問";
    case "visual_review":
      return `「${stepLabel(q.payload.review.step)}」のできあがり確認`;
    case "device_check":
      return q.payload.instructions || "実機確認の依頼";
    case "decision":
      return q.payload.statement || "決定の確認";
    case "backtrack":
      return `「${stepLabel(q.payload.toStep)}」への手戻り提案`;
    case "stall_retry":
      return "AI の作業が停止しました — 再開の確認";
    // US-08 F-1: 再構成提案カードのタイトル。
    case "reconstruction":
      return q.payload.summary || "工程の再構成提案が届きました";
    default:
      return "依頼";
  }
}

export function questionMeta(q: Question): string {
  const parts: string[] = [];
  if (q.payload.kind === "visual_review") {
    parts.push(stepLabel(q.payload.review.step));
  }
  parts.push(relativeTime(q.createdAt));
  if (q.payload.kind === "visual_review") {
    parts.push(`${q.payload.review.blocks.length} 件の項目`);
  }
  return parts.join(" · ");
}
