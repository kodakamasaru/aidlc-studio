// SCR — descope decision (kind="descope"). The evaluator raised a reasoned
// request to drop a requirement; the human decides among the 4 AI-DLC choices:
//   つくる(rework) / 見送る(descope) / 後回し(defer) / 前のステップからやり直す(rewind).
// "見送る/後回し" route the requirement to the backlog (proposeTask→acceptProposal);
// "やり直す" rewinds to the recommended step (needs a reason); "つくる" re-generates.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Question, type Verdict } from "../../lib/api";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage, relativeTime } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { reviewCrumb } from "../review/review-crumb";
import "./answer.css";

interface DescopeViewProps {
  readonly question: Question;
}

interface Choice {
  readonly verdict: Verdict;
  readonly label: string;
  readonly hint: string;
  readonly variant: "primary" | "ghost" | "danger";
}

const CHOICES: readonly Choice[] = [
  { verdict: "rework", label: "つくる", hint: "差し戻して作り直す", variant: "primary" },
  { verdict: "descope", label: "見送る", hint: "Backlog に残す(不可逆)", variant: "ghost" },
  { verdict: "defer", label: "後回し", hint: "Backlog に後回しで残す", variant: "ghost" },
  { verdict: "rewind", label: "前のステップからやり直す", hint: "推奨ステップへ手戻り", variant: "danger" },
];

export function DescopeView({ question }: DescopeViewProps) {
  const navigate = useNavigate();
  const { refreshInbox } = useProjectContext();
  const [submitting, setSubmitting] = useState<Verdict | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const payload = question.payload.kind === "descope" ? question.payload : undefined;
  const recommendedStep = payload?.recommendedStep;

  async function decide(verdict: Verdict) {
    if (submitting) return;
    // 前のステップからやり直す は手戻り = 戻り先 + 理由が必須(ドメイン INV-3)。
    if (verdict === "rewind" && reason.trim().length === 0) {
      setError("「やり直す」には理由を入力してください。");
      return;
    }
    setSubmitting(verdict);
    setError(null);
    try {
      await api.answerQuestion(question.id, {
        verdict,
        ...(verdict === "rewind" && recommendedStep
          ? { backtrackTo: recommendedStep }
          : {}),
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      });
      refreshInbox();
      navigate(`/cycles/${question.cycleId}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(null);
    }
  }

  useSetTopbar(
    {
      left: reviewCrumb("見送り判断", question.cycleId),
      right: (
        <StateBadge variant="q" noDot icon={<span aria-hidden="true">⊘</span>}>
          見送り判断
        </StateBadge>
      ),
    },
    [],
  );

  return (
    <div className="content-inner answer-view">
      <header className="answer-view__head">
        <h1 className="answer-view__title">AI からの見送り申請</h1>
        <p className="answer-view__meta">
          要件を満たせていません。どう扱うか判断してください。
        </p>
      </header>

      <section className="answer-card surface-card">
        <div className="answer-card__pause">
          <StateBadge variant="q" noDot icon={<span aria-hidden="true">⊘</span>}>
            見送り判断
          </StateBadge>
          <span className="answer-card__pause-note">
            {relativeTime(question.createdAt)} · Run は判断待ちで停止中
          </span>
        </div>
        <p className="answer-card__prompt">
          <strong>要件:</strong> {payload?.requirement ?? "(不明)"}
        </p>
        <p className="answer-card__prompt">
          <strong>AI の理由:</strong> {payload?.aiReason ?? "(不明)"}
        </p>
        {recommendedStep ? (
          <p className="field-hint">推奨やり直しステップ: {recommendedStep}</p>
        ) : null}
      </section>

      <form
        className="answer-form surface-card"
        onSubmit={(e) => e.preventDefault()}
      >
        <label className="field-label" htmlFor="descope-reason">
          理由(「やり直す」では必須 / 「見送る」の証跡にも残ります)
        </label>
        <textarea
          id="descope-reason"
          className="textarea mono answer-form__input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="判断理由(任意。やり直す場合は必須)"
        />
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {submitting ? "判断を送信しています…" : ""}
        </p>
        <div className="descope-choices" role="group" aria-label="見送り判断の選択肢">
          {CHOICES.map((c) => (
            <button
              key={c.verdict}
              type="button"
              className={`btn btn--${c.variant} descope-choice`}
              disabled={submitting !== null}
              onClick={() => void decide(c.verdict)}
            >
              {submitting === c.verdict ? <Spinner size={14} /> : null}
              <span className="descope-choice__label">{c.label}</span>
              <span className="descope-choice__hint">{c.hint}</span>
            </button>
          ))}
        </div>
      </form>
    </div>
  );
}
