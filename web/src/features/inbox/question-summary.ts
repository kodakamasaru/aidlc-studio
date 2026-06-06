// Derive a human title + meta line for a Question from its kind-discriminated
// payload. Used by the inbox card and the detail headers.
import type { Question } from "../../lib/api";
import { relativeTime } from "../../lib/format";

export function questionTitle(q: Question): string {
  switch (q.payload.kind) {
    case "question":
      return q.payload.prompt || "AI からの質問";
    case "visual_review":
      return `${q.payload.review.step} 成果の確定レビュー`;
    case "device_check":
      return q.payload.instructions || "実機確認の依頼";
    case "decision":
      return q.payload.statement || "決定の確認";
    case "backtrack":
      return `${q.payload.toStep} への手戻り提案`;
    case "stall_retry":
      return "Run が停止しました — retry 確認";
    default:
      return "依頼";
  }
}

export function questionMeta(q: Question): string {
  const parts: string[] = [];
  if (q.payload.kind === "visual_review") {
    parts.push(q.payload.review.step);
  }
  parts.push(relativeTime(q.createdAt));
  if (q.payload.kind === "visual_review") {
    parts.push(`${q.payload.review.blocks.length} ブロック`);
  }
  return parts.join(" · ");
}
