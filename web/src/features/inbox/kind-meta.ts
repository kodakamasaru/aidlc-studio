// Inbox kind → presentation: badge variant + icon char + Japanese label + the
// per-kind action verb (回答する vs レビュー). Color + icon dual-encode (D-03).
import type { QuestionKind } from "../../lib/api";

export interface KindMeta {
  readonly variant: "q" | "review";
  readonly icon: string;
  readonly label: string;
  readonly action: string;
}

const META: Record<QuestionKind, KindMeta> = {
  question: { variant: "q", icon: "?", label: "Q 待ち", action: "回答する" },
  visual_review: {
    variant: "review",
    icon: "◎",
    label: "レビュー待ち",
    action: "レビュー",
  },
  device_check: { variant: "q", icon: "▣", label: "実機確認", action: "確認する" },
  decision: { variant: "q", icon: "✓", label: "決定待ち", action: "回答する" },
  backtrack: { variant: "review", icon: "↩", label: "手戻り確認", action: "レビュー" },
  stall_retry: { variant: "q", icon: "↻", label: "stall retry", action: "確認する" },
};

export function kindMeta(kind: QuestionKind): KindMeta {
  return META[kind];
}

/** Where a kind opens: review detail (SCR-04) vs answer (SCR-05). */
export function isReviewKind(kind: QuestionKind): boolean {
  return kind === "visual_review";
}
