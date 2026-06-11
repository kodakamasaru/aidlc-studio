// SCR-03 — 受信箱 (/inbox)。アクティブな PJ の未対応 Question を時系列カード一覧で
// 表示(質問待ち + レビュー待ち混在)。状態: empty / list。トップバーに待ち件数、
// ナビバッジも同数。用語は平易な日本語(内部語を出さない / S3 視覚契約)。
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
      left: <span className="crumb__current">受信箱</span>,
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
          title="いまはお知らせはありません"
          body="AI があなたの対応を必要としたとき、ここに「質問」「できあがりの確認」「見送りの相談」が並びます。"
          action={
            <Link to="/" className="btn btn--surface">
              <DiamondIcon size={15} />
              サイクルを見る
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
        <h1 className="page-title">受信箱</h1>
        <p className="page-sub">
          AI からのお知らせ一覧です。クリックすると、そのサイクルの画面で対応できます(判断はサイクル側で行います)。
        </p>
      </header>

      <section className="inbox-list surface-card" role="list" aria-label="受信箱">
        {sorted.map((question) => (
          <InboxCard key={question.id} question={question} />
        ))}
      </section>
    </div>
  );
}
