// /cycles/:cycleId/q/:questionId and /questions/:questionId
// Loads the question, then dispatches:
//   visual_review → ReviewDetail (SCR-03)
//   descope       → DescopeView
//   question      → redirect to /cycles/:cycleId/thread (SCR-02 ConversationThread, Unit-06)
//   others        → AnswerView (fallback for device_check / decision / stall_retry)
import { Navigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { ErrorMessage } from "../../components/ui/StateMessage";
import { isReviewKind } from "./kind-meta";
import { AnswerView } from "./AnswerView";
import { DescopeView } from "./DescopeView";
import { ReviewDetail } from "../review/ReviewDetail";
import { ReviewBlocksSkeleton } from "../review/ReviewBlocks";
import "../review/review.css";

export function QuestionPage() {
  const { questionId = "", cycleId: routeCycleId } = useParams();
  const questionQ = useAsync(() => api.getQuestion(questionId), [questionId]);

  if (questionQ.status === "loading") {
    // Show skeleton block cards while loading (SCR-03 loading state).
    // We don't know the kind yet, but review is the dominant use case for
    // this route, so the block skeleton is preferable to a centered spinner.
    return (
      <div className="content-inner review-detail">
        <ReviewBlocksSkeleton />
      </div>
    );
  }

  if (questionQ.status === "error" || !questionQ.data) {
    return (
      <div className="content-inner">
        <ErrorMessage error={questionQ.error} onRetry={questionQ.reload} />
      </div>
    );
  }

  const question = questionQ.data;
  const cId = routeCycleId ?? question.cycleId;

  if (isReviewKind(question.kind)) return <ReviewDetail question={question} />;
  if (question.kind === "descope") return <DescopeView question={question} />;
  // "question" kind: redirect to the cycle thread (SCR-02 / Unit-06).
  // All QA for this cycle now lives on the single thread screen.
  if (question.kind === "question") {
    return <Navigate to={`/cycles/${cId}/thread`} replace />;
  }
  // Fallback for device_check / decision / stall_retry (not yet in thread).
  return <AnswerView question={question} />;
}
