// GlobalHearingPage — BU-3 global-scope config-hearing.
// Route: /settings/hearing
//
// Launches a global config-hearing run via the system cycle
// (__global_settings__) and renders the conversation thread in-place.
// Answers written here go to project.pipelineDef (global defaults).
// The "戻る" button navigates back to /settings/steps.
import { useEffect, useState } from "react";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { useProjectContext } from "../../lib/project-context";
import { api } from "../../lib/api";
import { ConversationThread } from "../thread/ConversationThread";
import { Spinner } from "../../components/ui/Spinner";
import "./step-config-readback.css";

type LaunchState =
  | { readonly phase: "idle" }
  | { readonly phase: "launching" }
  | { readonly phase: "ready"; readonly cycleId: string }
  | { readonly phase: "error"; readonly message: string };

export function GlobalHearingPage() {
  const { project } = useProjectContext();
  const [state, setState] = useState<LaunchState>({ phase: "idle" });

  useSetTopbar(
    { left: <span className="crumb__current">ステップ設定ヒアリング(全体)</span> },
    [],
  );

  useEffect(() => {
    // Auto-launch when the project is available and we haven't started yet.
    if (state.phase !== "idle" || !project) return;
    setState({ phase: "launching" });

    api
      .launchHearing("global", project.id)
      .then((result) => {
        setState({ phase: "ready", cycleId: result.cycleId });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setState({ phase: "error", message: msg });
      });
  }, [project, state.phase]);

  if (!project) {
    return (
      <div className="content-inner cfg-rb">
        <div className="cfg-rb__lock" role="note">
          <span aria-hidden="true">ℹ</span>
          <span>プロジェクトが読み込まれていません。しばらく待ってから再試行してください。</span>
        </div>
      </div>
    );
  }

  if (state.phase === "launching") {
    return (
      <div className="content-inner cfg-rb" aria-live="polite">
        <div className="cfg-rb__scope-bar">
          <span className="cfg-rb__scope-tag cfg-rb__scope-tag--global">
            全サイクル共通の既定
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "2rem" }}>
          <Spinner size={18} />
          <span>ヒアリングを起動しています…</span>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="content-inner cfg-rb">
        <div className="cfg-rb__scope-bar">
          <span className="cfg-rb__scope-tag cfg-rb__scope-tag--global">
            全サイクル共通の既定
          </span>
        </div>
        <div className="cfg-rb__lock" role="alert" style={{ marginTop: "1.5rem" }}>
          <span aria-hidden="true">⚠</span>
          <span>
            ヒアリングの起動に失敗しました: {state.message}
          </span>
        </div>
        <div className="cfg-rb__foot">
          <button
            type="button"
            className="btn btn--surface"
            onClick={() => setState({ phase: "idle" })}
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "ready") {
    return (
      <ConversationThread
        cycleId={state.cycleId}
        isHearing
        backTo="/settings/steps"
        backLabel="設定"
      />
    );
  }

  // idle — waiting for project to load (should resolve quickly via useEffect above)
  return (
    <div className="content-inner cfg-rb" aria-live="polite">
      <div className="cfg-rb__scope-bar">
        <span className="cfg-rb__scope-tag cfg-rb__scope-tag--global">
          全サイクル共通の既定
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "2rem" }}>
        <Spinner size={18} />
        <span>読み込み中…</span>
      </div>
    </div>
  );
}
