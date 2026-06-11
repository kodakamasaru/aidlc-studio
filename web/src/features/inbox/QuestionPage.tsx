// /questions/:questionId — loads the question, then dispatches: visual_review →
// SCR-04 ReviewDetail, otherwise → SCR-05 AnswerView. Loading/error handled here
// so the inner views can assume a resolved question.
import { useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { LoadingMessage, ErrorMessage } from "../../components/ui/StateMessage";
import { isReviewKind } from "./kind-meta";
import { AnswerView } from "./AnswerView";
import { DescopeView } from "./DescopeView";
import { ReviewDetail } from "../review/ReviewDetail";

export function QuestionPage() {
  const { questionId = "" } = useParams();
  const questionQ = useAsync(() => api.getQuestion(questionId), [questionId]);

  if (questionQ.status === "loading") {
    return (
      <div className="content-inner">
        <LoadingMessage />
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
  if (isReviewKind(question.kind)) return <ReviewDetail question={question} />;
  if (question.kind === "descope") return <DescopeView question={question} />;
  return <AnswerView question={question} />;
}
