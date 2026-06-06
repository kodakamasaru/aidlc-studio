// SCR-01 — Cycle list + create (/). Resolves the active project (repo-setup form
// when none), lists its cycles, and offers create via modal. States: empty /
// list / create. On create success → navigate to SCR-02.
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
      新規 Cycle
    </button>
  );

  useSetTopbar(
    {
      left: <span className="crumb__current">Cycles</span>,
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
          title="まだ Cycle がありません"
          body="最初の Cycle を作ると、S1〜S7 の Phase をサイトから起動できます。人間は IDE を触らず Inbox を捌くだけ。"
          action={
            <button type="button" className="btn btn--primary" onClick={onOpenCreate}>
              <PlusIcon size={15} />
              最初の Cycle を作る
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
        <h1 className="page-title">Cycles</h1>
        <p className="page-sub">
          マイルストーン(= サイクル / vX.Y.Z)を作り、Phase を回す起点。
        </p>
      </header>

      <section className="cycle-list surface-card" aria-label="Cycle 一覧">
        {sorted.map((cycle) => (
          <CycleRow key={cycle.id} cycle={cycle} />
        ))}
      </section>
      {modal}
    </div>
  );
}
