// StateMessage — centered loading / error / empty block so no fetch ever leaves
// a silent blank screen. Empty variant accepts a glyph + CTA (designed empty
// states for SCR-01 / SCR-03).
import type { ReactNode } from "react";
import { Spinner } from "./Spinner";
import { errorMessage } from "../../lib/format";
import "./state-message.css";

export function LoadingMessage({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="state-msg" role="status" aria-live="polite">
      <Spinner size={20} />
      <p className="state-msg__text">{label}</p>
    </div>
  );
}

interface ErrorMessageProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="state-msg" role="alert">
      <p className="state-msg__text state-msg--error">{errorMessage(error)}</p>
      {onRetry ? (
        <button type="button" className="btn btn--surface" onClick={onRetry}>
          再読み込み
        </button>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  readonly glyph: ReactNode;
  readonly title: string;
  readonly body: ReactNode;
  readonly action?: ReactNode;
}

export function EmptyState({ glyph, title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__glyph" aria-hidden="true">
        {glyph}
      </div>
      <h2 className="empty-state__title">{title}</h2>
      <p className="empty-state__body">{body}</p>
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
