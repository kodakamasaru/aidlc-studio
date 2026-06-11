// SCR-01 — サイクル一覧 + 作成 (/)。アクティブな PJ を解決(無ければ repo 登録フォーム)、
// サイクルを一覧し、モーダルで作成。状態: empty / list / create。作成成功で SCR-02 へ遷移。
// 用語は平易な日本語(Cycle/Phase 等の内部語を出さない / S3 視覚契約)。
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Cycle } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import {
  LoadingMessage,
  ErrorMessage,
  EmptyState,
} from "../../components/ui/StateMessage";
import { DiamondIcon, PlusIcon } from "../../components/ui/Icon";
import { CycleRow } from "./CycleRow";
import { CreateCycleModal } from "./CreateCycleModal";
import { RepoSetupForm } from "./RepoSetupForm";
import "./cycles.css";

export function CycleListPage() {
  const { project, status, error, adoptProject } = useProjectContext();
  const [creating, setCreating] = useState(false);

  const newButton = (
    <button
      type="button"
      className="btn btn--primary"
      onClick={() => setCreating(true)}
      disabled={!project}
    >
      <PlusIcon size={15} />
      新規サイクル
    </button>
  );

  useSetTopbar(
    {
      left: <span className="crumb__current">サイクル</span>,
      right: project ? newButton : undefined,
    },
    [project, status],
  );

  if (status === "loading") {
    return (
      <div className="content-inner">
        <LoadingMessage />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="content-inner">
        <ErrorMessage error={error} />
      </div>
    );
  }

  if (status === "empty" || !project) {
    return (
      <div className="content-inner cycles-page">
        <RepoSetupForm onReady={adoptProject} />
      </div>
    );
  }

  return (
    <ResolvedCycleList
      projectId={project.id}
      creating={creating}
      onCloseCreate={() => setCreating(false)}
      onOpenCreate={() => setCreating(true)}
    />
  );
}

interface ResolvedProps {
  readonly projectId: string;
  readonly creating: boolean;
  readonly onCloseCreate: () => void;
  readonly onOpenCreate: () => void;
}

function ResolvedCycleList({
  projectId,
  creating,
  onCloseCreate,
  onOpenCreate,
}: ResolvedProps) {
  const navigate = useNavigate();
  const cyclesQ = useAsync(() => api.listCycles(projectId), [projectId]);

  function handleCreated(cycle: Cycle) {
    onCloseCreate();
    cyclesQ.reload();
    navigate(`/cycles/${cycle.id}`);
  }

  const modal = creating ? (
    <CreateCycleModal
      projectId={projectId}
      onClose={onCloseCreate}
      onCreated={handleCreated}
    />
  ) : null;

  if (cyclesQ.status === "loading") {
    return (
      <div className="content-inner">
        <LoadingMessage />
        {modal}
      </div>
    );
  }

  if (cyclesQ.status === "error") {
    return (
      <div className="content-inner">
        <ErrorMessage error={cyclesQ.error} onRetry={cyclesQ.reload} />
        {modal}
      </div>
    );
  }

  const cycles = cyclesQ.data ?? [];

  if (cycles.length === 0) {
    return (
      <div className="content-inner">
        <EmptyState
          glyph={<DiamondIcon size={26} />}
          title="まだサイクルがありません"
          body="最初のサイクルを作ると、各ステップをこの画面から始められます。あなたは IDE を触らず、受信箱のお知らせに答えるだけで進みます。"
          action={
            <button type="button" className="btn btn--primary" onClick={onOpenCreate}>
              <PlusIcon size={15} />
              最初のサイクルを作る
            </button>
          }
        />
        {modal}
      </div>
    );
  }

  const sorted = [...cycles].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  return (
    <div className="content-inner cycles-page">
      <header className="page-head">
        <h1 className="page-title">サイクル一覧</h1>
        <p className="page-sub">
          1 サイクル = 1 つのバージョンを仕上げる単位です。
        </p>
      </header>

      <section className="cycle-list" aria-label="サイクル一覧">
        {sorted.map((cycle) => (
          <CycleRow key={cycle.id} cycle={cycle} />
        ))}
      </section>
      {modal}
    </div>
  );
}
