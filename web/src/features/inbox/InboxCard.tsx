// InboxCard (SCR-03) — one open question as a row: kind badge (color + icon +
// label) + title + meta (cycle/step/relative time) + per-kind action link +
// chevron. Whole row links to the question detail; the action verb predicts the
// next move (回答する vs レビュー).
import { Link } from "react-router-dom";
import type { Question } from "../../lib/api";
import { StateBadge } from "../../components/ui/StateBadge";
import { ChevronRightIcon } from "../../components/ui/Icon";
import { kindMeta } from "./kind-meta";
import { questionTitle, questionMeta } from "./question-summary";

interface InboxCardProps {
  readonly question: Question;
}

export function InboxCard({ question }: InboxCardProps) {
  const meta = kindMeta(question.kind);
  // US-08 F-1: reconstruction カードは専用の再構成画面へ直接遷移。
  // 他の kind は通常の question detail ルートへ。
  const href =
    question.kind === "reconstruction"
      ? `/cycles/${question.cycleId}/reconstruction`
      : `/cycles/${question.cycleId}/q/${question.id}`;

  return (
    <article className="inbox-card" role="listitem">
      <Link to={href} className="inbox-card__link">
        <StateBadge
          variant={meta.variant}
          noDot
          icon={
            <span className="inbox-card__kind-icon" aria-hidden="true">
              {meta.icon}
            </span>
          }
          ariaLabel={meta.label}
        >
          {meta.label}
        </StateBadge>

        <span className="inbox-card__main">
          <span className="inbox-card__title">{questionTitle(question)}</span>
          <span className="inbox-card__meta">{questionMeta(question)}</span>
        </span>
        {/* Fold the action verb into the single card link's accessible name so
            a screen reader announces "…— レビュー"; the visible button below is
            a non-interactive affordance (aria-hidden) to avoid a second tab
            stop / duplicate announcement to the same href. */}
        <span className="sr-only">— {meta.action}</span>
      </Link>

      <span className="btn btn--surface inbox-card__action" aria-hidden="true">
        {meta.action}
      </span>
      <span className="inbox-card__chevron" aria-hidden="true">
        <ChevronRightIcon />
      </span>
    </article>
  );
}
