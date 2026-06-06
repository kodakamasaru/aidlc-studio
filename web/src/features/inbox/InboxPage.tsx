// SCR-03 — Human Inbox (/inbox). Lists the active project's open questions as a
// time-ordered card list (Q-wait + review-wait mixed). States: empty / list. The
// topbar shows the wait count; the nav badge mirrors it.
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import {
  LoadingMessage,
  ErrorMessage,
  EmptyState,
} from "../../components/ui/StateMessage";
import { SparkIcon, DiamondIcon } from "../../components/ui/Icon";
import { InboxCard } from "./InboxCard";
import "./inbox.css";

export function InboxPage() {
  const { project, status: projStatus } = useProjectContext();
  const projectId = project?.id ?? "";
  const inboxQ = useAsync(
    () => (projectId ? api.listInbox(projectId) : Promise.resolve([])),
    [projectId],
  );

  const count = inboxQ.data?.length ?? 0;

  useSetTopbar(
    {
      left: <span className="crumb__current">Inbox</span>,
      right:
        count > 0 ? (
          <span className="inbox-count">{count} 件 待ち</span>
        ) : (
          <span className="inbox-count inbox-count--muted">0 件</span>
        ),
    },
    [count],
  );

  if (projStatus === "loading" || inboxQ.status === "loading") {
    return (
      <div className="content-inner">
        <LoadingMessage />
      </div>
    );
  }

  if (inboxQ.status === "error") {
    return (
      <div className="content-inner">
        <ErrorMessage error={inboxQ.error} onRetry={inboxQ.reload} />
      </div>
    );
  }

  const questions = inboxQ.data ?? [];

  if (questions.length === 0) {
    return (
      <div className="content-inner">
        <EmptyState
          glyph={<SparkIcon size={26} />}
          title="いま捌くものはありません"
          body="AI が判断を求めると、Q 回答 / レビュー待ち / 実機確認 がここにカードで届きます。Cycle を進めて Phase を起動しましょう。"
          action={
            <Link to="/" className="btn btn--surface">
              <DiamondIcon size={15} />
              Cycles を見る
            </Link>
          }
        />
      </div>
    );
  }

  const sorted = [...questions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <div className="content-inner inbox-page">
      <header className="page-head">
        <h1 className="page-title">Human Inbox</h1>
        <p className="page-sub">
          AI → 人間 の依頼が全部カードになる。Q 待ちは回答へ、レビュー待ちは詳細へ。
        </p>
      </header>

      <section className="inbox-list surface-card" role="list" aria-label="Inbox">
        {sorted.map((question) => (
          <InboxCard key={question.id} question={question} />
        ))}
      </section>
    </div>
  );
}
