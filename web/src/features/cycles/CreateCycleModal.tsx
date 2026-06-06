// CreateCycleModal (SCR-01 create) — minimal form per D-06: Cycle name + an
// optional one-line goal. The vX.Y.Z version the API requires is parsed out of
// the name (the name convention is "vX.Y.Z — goal"); if absent we surface an
// inline hint instead of silently failing.
import { useId, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, ApiError, type Cycle } from "../../lib/api";
import { errorMessage } from "../../lib/format";

const VERSION_RE = /v\d+\.\d+\.\d+/;

interface CreateCycleModalProps {
  readonly projectId: string;
  readonly onClose: () => void;
  readonly onCreated: (cycle: Cycle) => void;
}

export function CreateCycleModal({
  projectId,
  onClose,
  onCreated,
}: CreateCycleModalProps) {
  const titleId = useId();
  const descId = useId();
  const goalId = useId();
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const versionMatch = title.match(VERSION_RE);
  const canSubmit = title.trim().length > 0 && Boolean(versionMatch) && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!versionMatch) {
      setError("Cycle 名に vX.Y.Z を含めてください(例: v0.0.1 — …)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const fullTitle = goal.trim()
        ? `${title.trim()} — ${goal.trim()}`
        : title.trim();
      const cycle = await api.createCycle(projectId, {
        title: fullTitle,
        version: versionMatch[0],
      });
      onCreated(cycle);
    } catch (err) {
      if (err instanceof ApiError && err.code === "DuplicateVersion") {
        setError("同じバージョンの Cycle が既にあります");
      } else {
        setError(errorMessage(err));
      }
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId={titleId} describedById={descId} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id={titleId} className="modal-title">
          新規 Cycle
        </h2>
        <p id={descId} className="modal-desc">
          マイルストーン(= サイクル / vX.Y.Z)を 1 つ作成します。
        </p>

        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor={`${titleId}-name`}>
              Cycle 名
            </label>
            <input
              id={`${titleId}-name`}
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="v0.0.1 — Human Inbox 縦ループ"
              autoFocus
            />
            <p className="field-hint">マイルストーン名(例: vX.Y.Z + 一言ゴール)</p>
          </div>

          <div>
            <label className="field-label" htmlFor={goalId}>
              概要 / ゴール (任意)
            </label>
            <input
              id={goalId}
              className="input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="このサイクルで達成すること(1 行)"
            />
          </div>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
            {submitting ? "作成中…" : "作成して開く"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
