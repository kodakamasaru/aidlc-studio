// RepoSetupForm — first-run inline form shown when no project exists yet. The
// repo is the project (D-06), so we only ask for its path; POST /projects then
// the app continues into the cycle list.
import { useId, useState, type FormEvent } from "react";
import { api, type Project } from "../../lib/api";
import { errorMessage } from "../../lib/format";

interface RepoSetupFormProps {
  readonly onReady: (project: Project) => void;
}

export function RepoSetupForm({ onReady }: RepoSetupFormProps) {
  const pathId = useId();
  const [repoPath, setRepoPath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!repoPath.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject({ repoPath: repoPath.trim() });
      onReady(project);
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="repo-setup surface-card" aria-labelledby="repo-setup-title">
      <h2 id="repo-setup-title" className="repo-setup__title">
        リポジトリ設定
      </h2>
      <p className="repo-setup__body">
        対象リポジトリ(= プロジェクト)を 1 つ登録すると、サイクルを作って各ステップを進められます。
      </p>
      <form onSubmit={handleSubmit} className="repo-setup__form">
        <div>
          <label className="field-label" htmlFor={pathId}>
            リポジトリパス
          </label>
          <input
            id={pathId}
            className="input mono"
            value={repoPath}
            onChange={(e) => setRepoPath(e.target.value)}
            placeholder="/path/to/repo"
            autoFocus
          />
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="repo-setup__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!repoPath.trim() || submitting}
          >
            {submitting ? "登録中…" : "リポジトリを登録"}
          </button>
        </div>
      </form>
    </section>
  );
}
