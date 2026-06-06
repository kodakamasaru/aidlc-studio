// SCR-05 — Q answer (question kind). Shows the prompt + a paused-worktree note,
// then a mono textarea; submit posts answer {verdict:"answer", body} and returns
// to the inbox. Submit stays disabled until the answer is non-empty.
import { useId, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Question } from "../../lib/api";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage, relativeTime } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { reviewCrumb } from "../review/review-crumb";
import "./answer.css";

interface AnswerViewProps {
  readonly question: Question;
}

export function AnswerView({ question }: AnswerViewProps) {
  const navigate = useNavigate();
  const { refreshInbox } = useProjectContext();
  const answerId = useId();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prompt = promptText(question);
  const canSubmit = body.trim().length > 0 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.answerQuestion(question.id, {
        verdict: "answer",
        body: body.trim(),
      });
      refreshInbox();
      navigate("/inbox");
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  useSetTopbar(
    {
      left: reviewCrumb("Q 回答"),
      right: (
        <StateBadge variant="q" noDot icon={<span aria-hidden="true">?</span>}>
          Q 待ち
        </StateBadge>
      ),
    },
    [],
  );

  return (
    <div className="content-inner answer-view">
      <header className="answer-view__head">
        <h1 className="answer-view__title">AI からの質問</h1>
        <p className="answer-view__meta">回答すると Run が resume します</p>
      </header>

      <section className="answer-card surface-card">
        <div className="answer-card__pause">
          <StateBadge variant="q" noDot icon={<span aria-hidden="true">?</span>}>
            Q 待ち
          </StateBadge>
          <span className="answer-card__pause-note">
            {relativeTime(question.createdAt)} · worktree は回答待ちで一時停止中
          </span>
        </div>
        <p className="answer-card__prompt">{prompt}</p>
      </section>

      <form
        className="answer-form surface-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="field-label" htmlFor={answerId}>
          回答(複数行・コードブロック可)
        </label>
        <textarea
          id={answerId}
          className="textarea mono answer-form__input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="ここに回答を入力(Cmd/Ctrl+Enter で送信)"
          autoFocus
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {submitting ? "回答を送信しています…" : ""}
        </p>
        <div className="answer-form__foot">
          <p className="field-hint">
            送信すると当該 Q カードは Inbox から消え、Run が再開します。
          </p>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {submitting ? <Spinner size={14} /> : null}
            回答を送信して resume →
          </button>
        </div>
      </form>
    </div>
  );
}

function promptText(q: Question): string {
  switch (q.payload.kind) {
    case "question":
      return q.payload.prompt;
    case "device_check":
      return q.payload.instructions;
    case "decision":
      return q.payload.statement;
    case "backtrack":
      return q.payload.proposal;
    case "stall_retry":
      return "Run が停止しました。続行方針を入力してください。";
    default:
      return "回答を入力してください。";
  }
}
