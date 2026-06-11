// CreateCycleModal (SCR-01 create) — the human types only the cycle's goal; the
// version is auto-assigned by the server (previous patch +1, or v0.0.1 for the
// first cycle). An optional version field lets the human override for a minor /
// major bump. If they type one it must match vX.Y.Z; if blank it is omitted and
// the server derives it.
import { useId, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";
import { api, ApiError, type Cycle } from "../../lib/api";
import { errorMessage } from "../../lib/format";

const VERSION_RE = /^v\d+\.\d+\.\d+$/;

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
  const versionId = useId();
  const [goal, setGoal] = useState("");
  const [version, setVersion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedVersion = version.trim();
  const versionValid =
    trimmedVersion.length === 0 || VERSION_RE.test(trimmedVersion);
  const canSubmit = goal.trim().length > 0 && versionValid && !submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (trimmedVersion.length > 0 && !VERSION_RE.test(trimmedVersion)) {
      setError("vX.Y.Z 形式で入力してください");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const cycle = await api.createCycle(projectId, {
        title: goal.trim(),
        ...(trimmedVersion.length > 0 ? { version: trimmedVersion } : {}),
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
          マイルストーン(= サイクル)を 1 つ作成します。バージョンは自動採番されます。
        </p>

        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor={`${titleId}-goal`}>
              サイクル名(ゴール)
            </label>
            <input
              id={`${titleId}-goal`}
              className="input"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Human Inbox 縦ループ"
              autoFocus
            />
            <p className="field-hint">このサイクルで達成すること(1 行)</p>
          </div>

          <div>
            <label className="field-label" htmlFor={versionId}>
              バージョン (任意)
            </label>
            <input
              id={versionId}
              className="input mono"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v0.1.0"
              aria-invalid={!versionValid}
            />
            <p className="field-hint">未入力なら自動採番(前回の patch +1)</p>
            {!versionValid ? (
              <p className="form-error" role="alert">
                vX.Y.Z 形式で入力してください
              </p>
            ) : null}
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
