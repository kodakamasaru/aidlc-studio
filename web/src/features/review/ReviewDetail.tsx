// SCR-03 — Review detail (visual_review kind). Renders the Review block-stream
// with two topbar actions: 承認 (approve → next phase) and 差し戻し (reveal the
// backtrack modal → reject with target step + reason). States: default / backtrack.
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Question, type ReviewBlock } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage } from "../../lib/format";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { StateBadge } from "../../components/ui/StateBadge";
import { CheckIcon, BacktrackIcon } from "../../components/ui/Icon";
import { ReviewBlocks, CompletenessTable } from "./ReviewBlocks";
import { BacktrackModal, type StepOption } from "./BacktrackModal";
import { reviewCrumb } from "./review-crumb";
import { stepLabel } from "../../lib/step-label";
import "./review.css";

interface ReviewDetailProps {
  readonly question: Question;
}

// Detect a "missing-context" sentinel block injected by the orchestrator when
// the prior cycle's artifacts were unavailable. The orchestrator currently
// encodes this as a summary block with a specific title or body prefix.
// We normalise it to a `missing-context` pseudo-block so ReviewBlocks can
// render a clean Japanese warning banner (role="alert") instead of exposing
// the raw developer token "missing-context" in the UI.
const MISSING_CTX_TITLE = "コンテキスト欠損警告";
const MISSING_CTX_BODY_PREFIX = "⚠ missing-context";
const MISSING_CTX_CLEAN_MSG =
  "前サイクルの成果物が見つかりません — コンテキストが不完全な状態で実行されています。差し戻して再実行を検討してください。";

function normaliseMissingContext(blocks: readonly ReviewBlock[]): readonly ReviewBlock[] {
  return blocks.map((b): ReviewBlock => {
    if (b.type !== "summary") return b;
    const s = b as { type: "summary"; title: string; body: string };
    const titleMatch = s.title === MISSING_CTX_TITLE;
    const bodyMatch = typeof s.body === "string" && s.body.startsWith(MISSING_CTX_BODY_PREFIX);
    if (!titleMatch && !bodyMatch) return b;
    // Replace with a missing-context pseudo-block (handled by ReviewBlocks
    // as a clean Japanese alert banner; no developer strings exposed).
    return { type: "missing-context", message: MISSING_CTX_CLEAN_MSG } as unknown as ReviewBlock;
  });
}

export function ReviewDetail({ question }: ReviewDetailProps) {
  const navigate = useNavigate();
  const { refreshInbox } = useProjectContext();
  const [backtracking, setBacktracking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Backtrack targets = every step up to AND INCLUDING the step under review;
  // later steps are dropped. Including the review step lets the human redo THIS
  // phase (domain backtrackTo sets the target phase back to "running"), not only
  // earlier ones. The cycle is ONLY needed to populate these options, so the
  // fetch is deferred until the backtrack modal is actually opened — no waterfall
  // on the common approve path. `null` factory until then keeps useAsync inert.
  const cycleQ = useAsync(
    () => (backtracking ? api.getCycle(question.cycleId) : Promise.resolve(undefined)),
    [backtracking, question.cycleId],
  );
  const review =
    question.payload.kind === "visual_review" ? question.payload.review : null;

  const stepOptions = useMemo<StepOption[]>(() => {
    const phases = cycleQ.data?.phases ?? [];
    const reviewStep = review?.step;
    const upto: StepOption[] = [];
    for (const p of phases) {
      const isCurrent = reviewStep != null && p.step === reviewStep;
      upto.push({
        step: p.step,
        label: isCurrent ? `${p.step}(このフェーズをやり直す)` : p.step,
      });
      if (isCurrent) break;
    }
    return upto.length > 0
      ? upto
      : phases.map((p) => ({ step: p.step, label: p.step }));
  }, [cycleQ.data, review?.step]);

  // navigate (react-router) and refreshInbox (memoized in the provider) are
  // stable identities; question.id is stable for a mounted question. Memoizing
  // keeps the topbar action callbacks fresh without churn, so the topbar deps
  // below genuinely list everything the rendered actions close over.
  const approve = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.answerQuestion(question.id, { verdict: "approve" });
      refreshInbox();
      navigate(`/cycles/${question.cycleId}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }, [question.id, question.cycleId, refreshInbox, navigate]);

  const reject = useCallback(
    async (backtrackTo: string, reason: string) => {
      setBusy(true);
      setError(null);
      try {
        await api.answerQuestion(question.id, {
          verdict: "reject",
          backtrackTo,
          reason,
        });
        refreshInbox();
        navigate(`/cycles/${question.cycleId}`);
      } catch (err) {
        setError(errorMessage(err));
        setBusy(false);
      }
    },
    [question.id, question.cycleId, refreshInbox, navigate],
  );

  useSetTopbar(
    {
      left: reviewCrumb("レビュー詳細", question.cycleId),
      right: (
        <>
          <button
            type="button"
            className="btn btn--surface"
            onClick={() => setBacktracking(true)}
            disabled={busy}
          >
            <BacktrackIcon size={14} /> 差し戻し
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={approve}
            disabled={busy}
          >
            <CheckIcon size={14} /> 承認して次 Phase へ
          </button>
        </>
      ),
    },
    [busy, approve],
  );

  if (!review) {
    return (
      <div className="content-inner">
        <p className="state-msg state-msg--error">
          レビュー内容を読み込めませんでした。
        </p>
      </div>
    );
  }

  // Normalise blocks: convert orchestrator's missing-context sentinel summaries
  // to dedicated missing-context pseudo-blocks (clean Japanese, no dev tokens).
  const normalisedBlocks = normaliseMissingContext(review.blocks);

  return (
    <div className="content-inner review-detail">
      <header className="review-detail__head">
        <StateBadge variant="review" noDot icon={<span aria-hidden="true">◎</span>}>
          レビュー待ち
        </StateBadge>
        <h1 className="review-detail__title">
          「{stepLabel(review.step)}」のできあがり確認
        </h1>
        <p className="review-detail__meta">
          コードを読まずに、できあがりを確認できます。問題なければ「承認」、直しが要るなら「差し戻し」。
        </p>
      </header>

      {error && !backtracking ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {busy ? "送信しています…" : ""}
      </p>

      {review.completeness ? (
        <CompletenessTable completeness={review.completeness} />
      ) : null}

      <ReviewBlocks blocks={normalisedBlocks} />

      {backtracking ? (
        <BacktrackModal
          steps={stepOptions}
          submitting={busy}
          error={error}
          onClose={() => setBacktracking(false)}
          onConfirm={reject}
        />
      ) : null}
    </div>
  );
}
