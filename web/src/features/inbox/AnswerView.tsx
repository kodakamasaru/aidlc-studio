// SCR-05 — 質問への回答 (question kind)。ステップ名タイトル +「質問 N/M」+ 質問の gap-box +
// 「回答を選ぶ」(選択肢: ラジオ + AI のおすすめ + その他自由入力 / 無ければ自由入力のみ)。
// 送信で answer {verdict:"answer", body} を投げてサイクル画面へ戻る。S3 視覚契約 scr-05.question。
import { useId, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Question, type QuestionOption } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { reviewCrumb } from "../review/review-crumb";
import { stepLabel } from "../../lib/step-label";
import "./answer.css";

const OTHER = "__other__";

interface AnswerViewProps {
  readonly question: Question;
}

export function AnswerView({ question }: AnswerViewProps) {
  const navigate = useNavigate();
  const { refreshInbox } = useProjectContext();
  const answerId = useId();
  const [body, setBody] = useState("");
  const [choiceId, setChoiceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ステップ名(タイトル)と「質問 N/M」のため cycle と同サイクルの未回答質問を取得。
  const cycleQ = useAsync(() => api.getCycle(question.cycleId), [question.cycleId]);
  const inboxQ = useAsync(() => api.getCycleInbox(question.cycleId), [question.cycleId]);
  const activeStep = cycleQ.data?.phases.find((p) => p.state !== "done")?.step;
  const stepName = activeStep ? stepLabel(activeStep) : "";
  const siblings = (inboxQ.data ?? [])
    .filter((q) => q.kind === "question")
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const total = Math.max(1, siblings.length);
  const idx = Math.max(0, siblings.findIndex((q) => q.id === question.id)) + 1;

  const prompt = promptText(question);
  const options =
    question.payload.kind === "question" ? question.payload.options : undefined;
  const hasOptions = !!options && options.length > 0;
  const isOther = choiceId === OTHER;

  const needsFreeText = !hasOptions || isOther;
  const chosenLabel = hasOptions
    ? options.find((o) => o.id === choiceId)?.label ?? ""
    : "";
  const canSubmit =
    !submitting &&
    (needsFreeText ? body.trim().length > 0 : chosenLabel.length > 0);

  async function submit() {
    if (!canSubmit) return;
    const answer = needsFreeText ? body.trim() : chosenLabel;
    setSubmitting(true);
    setError(null);
    try {
      await api.answerQuestion(question.id, { verdict: "answer", body: answer });
      refreshInbox();
      navigate(`/cycles/${question.cycleId}`);
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
      left: reviewCrumb("質問への回答", question.cycleId),
      right: (
        <StateBadge variant="q" noDot icon={<span aria-hidden="true">?</span>}>
          回答待ち
        </StateBadge>
      ),
    },
    [],
  );

  return (
    <div className="content-inner answer-view">
      <header className="answer-view__head">
        <div className="answer-view__head-row">
          <h1 className="answer-view__title">
            {stepName ? `「${stepName}」の確認` : "AI からの質問"}
          </h1>
          <span className="answer-view__progress">
            質問 {idx} / {total}
          </span>
        </div>
        <p className="answer-view__meta">
          このステップで AI から {total} 件の質問が来ています(1 件ずつ答えます)。回答すると AI が続きを進めます。
        </p>
      </header>

      <section className="answer-card surface-card">
        <p className="answer-card__sublabel">AI からの質問</p>
        <div className="answer-gapbox">{prompt}</div>
      </section>

      <form
        className="answer-form surface-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {hasOptions ? (
          <>
            <p className="field-label">回答を選ぶ</p>
            <div className="answer-choices" role="radiogroup" aria-label="回答の選択肢">
              {options.map((o) => (
                <Choice
                  key={o.id}
                  option={o}
                  checked={choiceId === o.id}
                  onSelect={() => setChoiceId(o.id)}
                />
              ))}
              <label className={`answer-choice${isOther ? " answer-choice--on" : ""}`}>
                <input
                  type="radio"
                  name="answer-choice"
                  checked={isOther}
                  onChange={() => setChoiceId(OTHER)}
                />
                <span className="answer-choice__label">その他(自由に回答する)</span>
                <span className="answer-choice__hint">
                  上のどれでもないときは、自分の言葉で答えます
                </span>
              </label>
            </div>
          </>
        ) : null}

        {needsFreeText ? (
          <>
            <label className="field-label" htmlFor={answerId}>
              {hasOptions ? "回答(自由入力)" : "回答(複数行・コードブロック可)"}
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
          </>
        ) : null}

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
            送信すると、このお知らせは受信箱から消え、AI が作業を再開します。
          </p>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {submitting ? <Spinner size={14} /> : null}
            回答を送信して再開 →
          </button>
        </div>
      </form>
    </div>
  );
}

function Choice({
  option,
  checked,
  onSelect,
}: {
  readonly option: QuestionOption;
  readonly checked: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <label className={`answer-choice${checked ? " answer-choice--on" : ""}`}>
      <input type="radio" name="answer-choice" checked={checked} onChange={onSelect} />
      <span className="answer-choice__label">
        {option.label}
        {option.recommended ? (
          <span className="answer-choice__rec">AI のおすすめ</span>
        ) : null}
      </span>
      {option.hint ? (
        <span className="answer-choice__hint">{option.hint}</span>
      ) : null}
    </label>
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
      return "AI の作業が停止しました。続行方針を入力してください。";
    default:
      return "回答を入力してください。";
  }
}
