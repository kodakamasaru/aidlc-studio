// Inbox kind → presentation: badge variant + icon char + Japanese label + the
// per-kind action verb (回答する vs レビュー). Color + icon dual-encode (D-03).
import type { QuestionKind } from "../../lib/api";

export interface KindMeta {
  readonly variant: "q" | "review";
  readonly icon: string;
  readonly label: string;
  readonly action: string;
}

// 平易な日本語の種別ラベル(S3 scr-03 用語: 質問 / できあがりの確認 / 見送りの相談)。
const META: Record<QuestionKind, KindMeta> = {
  question: { variant: "q", icon: "?", label: "質問", action: "回答する" },
  visual_review: {
    variant: "review",
    icon: "◎",
    label: "できあがりの確認",
    action: "確認する",
  },
  device_check: { variant: "q", icon: "▣", label: "実機確認", action: "確認する" },
  decision: { variant: "q", icon: "✓", label: "決定の確認", action: "回答する" },
  backtrack: { variant: "review", icon: "↩", label: "手戻りの確認", action: "確認する" },
  stall_retry: { variant: "q", icon: "↻", label: "再開待ち", action: "確認する" },
  descope: { variant: "q", icon: "⊘", label: "見送りの相談", action: "判断する" },
  // US-08 F-1: 再構成提案カード — 専用画面 /cycles/:id/reconstruction へ誘導。
  reconstruction: { variant: "review", icon: "⇌", label: "工程の再構成", action: "確認する" },
};

export function kindMeta(kind: QuestionKind): KindMeta {
  // Fallback for an unexpected kind from the backend: never return undefined
  // (InboxCard reads meta.variant — an undefined would throw and white-screen the
  // WHOLE inbox, hiding every other card / 原則④: degrade visibly, don't crash).
  return META[kind] ?? { variant: "q", icon: "•", label: String(kind), action: "確認する" };
}

/** Where a kind opens: review detail (SCR-04) vs answer (SCR-05). */
export function isReviewKind(kind: QuestionKind): boolean {
  return kind === "visual_review";
}
