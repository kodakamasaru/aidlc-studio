// SCR-05 — 見送りの相談 (kind="descope")。AI が理由つきで要件の見送りを申請。人間は
// ラジオで対応を選び(つくる/見送る/後回し/前のステップからやり直す)、必要なら理由・戻り先を
// 添えて「この内容で進める」。「見送る」は不可逆なので確認ダイアログを挟む。S3 視覚契約 scr-05.descope。
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Question, type Verdict } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage, relativeTime } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { Spinner } from "../../components/ui/Spinner";
import { Modal } from "../../components/ui/Modal";
import { reviewCrumb } from "../review/review-crumb";
import { stepLabel } from "../../lib/step-label";
import "./answer.css";

interface DescopeViewProps {
  readonly question: Question;
}

interface Choice {
  readonly verdict: Verdict;
  readonly label: string;
  readonly hint: string;
}

const CHOICES: readonly Choice[] = [
  { verdict: "rework", label: "やっぱり今回つくってもらう", hint: "見送らず、このステップで作り直します" },
  { verdict: "descope", label: "今回は見送る(次のバージョンへ)", hint: "持ち越しリストに記録します。元には戻せません" },
  { verdict: "defer", label: "後回しにする", hint: "持ち越しリストに後回しで残します" },
  { verdict: "rewind", label: "前のステップからやり直す", hint: "原因が前段にありそうなとき。戻り先のステップを選びます" },
];

export function DescopeView({ question }: DescopeViewProps) {
  const navigate = useNavigate();
  const { refreshInbox } = useProjectContext();
  const confirmTitleId = useId();
  const [choice, setChoice] = useState<Verdict | "">("");
  const [submitting, setSubmitting] = useState<Verdict | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmingDescope, setConfirmingDescope] = useState(false);

  const payload = question.payload.kind === "descope" ? question.payload : undefined;
  const recommendedStep = payload?.recommendedStep;
  const [rewindTo, setRewindTo] = useState(recommendedStep ?? "");
  const cycleQ = useAsync(() => api.getCycle(question.cycleId), [question.cycleId]);
  const stepOptions = cycleQ.data?.phases.map((p) => p.step) ?? [];

  async function decide(verdict: Verdict) {
    if (submitting) return;
    if (verdict === "rewind" && reason.trim().length === 0) {
      setError("「やり直す」には理由を入力してください。");
      return;
    }
    if (verdict === "rewind" && rewindTo.trim().length === 0) {
      setError("「やり直す」には戻り先ステップを選んでください。");
      return;
    }
    setConfirmingDescope(false);
    setSubmitting(verdict);
    setError(null);
    try {
      await api.answerQuestion(question.id, {
        verdict,
        ...(verdict === "rewind" && rewindTo ? { backtrackTo: rewindTo } : {}),
        ...(reason.trim().length > 0 ? { reason: reason.trim() } : {}),
      });
      refreshInbox();
      navigate(`/cycles/${question.cycleId}`);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(null);
    }
  }

  // 「この内容で進める」: 見送る だけは不可逆確認を挟み、他は即実行。
  function proceed() {
    if (choice === "") {
      setError("対応を選んでください。");
      return;
    }
    if (choice === "descope") {
      setConfirmingDescope(true);
      return;
    }
    void decide(choice);
  }

  useSetTopbar(
    {
      left: reviewCrumb("見送りの相談", question.cycleId),
      right: (
        <StateBadge variant="q" noDot icon={<span aria-hidden="true">⊘</span>}>
          見送りの相談
        </StateBadge>
      ),
    },
    [],
  );

  return (
    <div className="content-inner answer-view">
      <header className="answer-view__head">
        <h1 className="answer-view__title">AI からの見送り申請</h1>
        <p className="answer-view__meta">要件を満たせていません。どう扱うか判断してください。</p>
      </header>

      <section className="answer-card surface-card">
        <p className="answer-card__sublabel">
          AI からの相談 · {relativeTime(question.createdAt)} · 判断待ちで停止中
        </p>
        <div className="answer-gapbox answer-gapbox--warn">
          <p className="answer-gapbox__line">
            <strong>見送りたい項目:</strong> {payload?.requirement ?? "(不明)"}
          </p>
          <p className="answer-gapbox__line">
            <strong>AI の理由:</strong> {payload?.aiReason ?? "(不明)"}
          </p>
        </div>
      </section>

      <form className="answer-form surface-card" onSubmit={(e) => e.preventDefault()}>
        <p className="field-label">どうしますか?</p>
        <div className="answer-choices" role="radiogroup" aria-label="見送り判断の選択肢">
          {CHOICES.map((c) => (
            <div key={c.verdict}>
              <label className={`answer-choice${choice === c.verdict ? " answer-choice--on" : ""}`}>
                <input
                  type="radio"
                  name="descope-choice"
                  checked={choice === c.verdict}
                  onChange={() => setChoice(c.verdict)}
                />
                <span className="answer-choice__label">{c.label}</span>
                <span className="answer-choice__hint">{c.hint}</span>
              </label>
              {c.verdict === "rewind" && choice === "rewind" && stepOptions.length > 0 ? (
                <div className="descope-rewind">
                  <label className="field-label" htmlFor="rewind-step">
                    戻り先のステップ
                  </label>
                  <select
                    id="rewind-step"
                    className="select"
                    value={rewindTo}
                    onChange={(e) => setRewindTo(e.target.value)}
                  >
                    {stepOptions.map((s) => (
                      <option key={s} value={s}>
                        {stepLabel(s)}
                        {recommendedStep === s ? "(AI 推奨)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ))}
        </div>

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
        <div className="answer-form__foot">
          <p className="field-hint">「見送る」は元に戻せないため、確認が出ます。</p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={proceed}
            disabled={submitting !== null || choice === ""}
          >
            {submitting ? <Spinner size={14} /> : null}
            この内容で進める →
          </button>
        </div>
      </form>

      {confirmingDescope ? (
        <Modal titleId={confirmTitleId} onClose={() => setConfirmingDescope(false)}>
          <h2 id={confirmTitleId} className="modal-title">
            見送りの確認
          </h2>
          <p className="modal-desc">
            「見送る」と、この要件はこのサイクルでは作られず、見送りリストに残ります。
            <strong>元に戻せません。</strong>よろしいですか?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmingDescope(false)}>
              キャンセル
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void decide("descope")}
              disabled={submitting !== null}
            >
              {submitting === "descope" ? <Spinner size={14} /> : null}
              見送って進める
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
