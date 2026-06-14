// SCR-01 — 対応待ち一覧 / Inbox (/inbox)。アクティブな PJ の未対応 Question を
// 時系列カード一覧で表示(質問待ち + レビュー待ち混在)。
// 状態: loading(スケルトン3枚) / empty(✓ + コピー) / default(カード一覧)。
// S3 視覚契約に準拠。用語は平易な日本語(内部語・英語・テンプレート文字列を出さない)。
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { ErrorMessage } from "../../components/ui/StateMessage";
import { InboxCard } from "./InboxCard";
import "./inbox.css";

// ── スケルトンカード ─────────────────────────────────────────────
// loading 状態: 3 枚のカード骨格を表示。スピナーは使わない(S3 視覚契約)。
function InboxSkeletonCard() {
  return (
    <div className="inbox-card inbox-card--skel" aria-hidden="true">
      <div className="inbox-skel__icon" />
      <div className="inbox-skel__main">
        <div className="inbox-skel-line inbox-skel-line--med" />
        <div className="inbox-skel-line inbox-skel-line--short" />
      </div>
      <div className="inbox-skel__action inbox-skel-line inbox-skel-line--xs" />
    </div>
  );
}

export function InboxPage() {
  const { project, status: projStatus } = useProjectContext();
  const projectId = project?.id ?? "";
  const inboxQ = useAsync(
    () => (projectId ? api.listInbox(projectId) : Promise.resolve([])),
    [projectId],
  );

  const isLoading = projStatus === "loading" || inboxQ.status === "loading";
  // loading 中はデータ未確定なので件数は表示しない(右カウンターもスケルトン)
  const count = isLoading ? null : (inboxQ.data?.length ?? 0);

  useSetTopbar(
    {
      left: <span className="crumb__current">対応待ち (Inbox)</span>,
      right: isLoading ? (
        <span className="inbox-count inbox-count--skel" aria-hidden="true" />
      ) : count !== null && count > 0 ? (
        <span className="inbox-count">未対応 {count} 件</span>
      ) : (
        <span className="inbox-count inbox-count--muted">未対応 0 件</span>
      ),
    },
    [isLoading, count],
  );

  // ── loading ────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="content-inner inbox-page">
        <div className="inbox-section-bar">
          <span className="inbox-section-heading">AI → あなたへの依頼</span>
        </div>
        <section
          className="inbox-list"
          role="list"
          aria-label="対応待ち一覧"
          aria-busy="true"
        >
          <InboxSkeletonCard />
          <InboxSkeletonCard />
          <InboxSkeletonCard />
        </section>
      </div>
    );
  }

  // ── error ──────────────────────────────────────────────────────
  if (inboxQ.status === "error") {
    return (
      <div className="content-inner">
        <ErrorMessage error={inboxQ.error} onRetry={inboxQ.reload} />
      </div>
    );
  }

  const questions = inboxQ.data ?? [];

  // ── empty ──────────────────────────────────────────────────────
  if (questions.length === 0) {
    return (
      <div className="content-inner inbox-page">
        <div className="inbox-section-bar">
          <span className="inbox-section-heading">AI → あなたへの依頼</span>
          <span className="inbox-count inbox-count--muted">未対応 0 件</span>
        </div>
        <div className="inbox-empty" role="status" aria-live="polite">
          <span className="inbox-empty__check" aria-hidden="true">✓</span>
          <p className="inbox-empty__title">対応待ちはありません</p>
          <p className="inbox-empty__body">AI が質問・確認を出すとここに並びます。</p>
        </div>
      </div>
    );
  }

  // ── default (カード一覧) ────────────────────────────────────────
  const sorted = [...questions].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <div className="content-inner inbox-page">
      <div className="inbox-section-bar">
        <span className="inbox-section-heading">AI → あなたへの依頼</span>
        <span className="inbox-count">未対応 {sorted.length} 件</span>
      </div>
      <section className="inbox-list" role="list" aria-label="対応待ち一覧">
        {sorted.map((question) => (
          <InboxCard key={question.id} question={question} />
        ))}
      </section>
    </div>
  );
}
