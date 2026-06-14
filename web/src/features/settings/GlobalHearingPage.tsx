// GlobalHearingPage — BU-3 global-scope config-hearing placeholder.
// Route: /settings/hearing
//
// Global hearing has no cycle context, so a cycle-less hearing run is not yet
// supported (the Question/Run aggregates require a cycleId). This page explains
// the situation clearly and gives the user a path forward:
//   → open the settings page to edit global defaults directly via PATCH
//   → or create / open a cycle and use the cycle-scoped "会話で直す" from there
//
// Remaining work for full global hearing:
//   - Add a "hearing cycle" concept (a synthetic or virtual cycleId for global runs)
//   - OR extend QuestionRaised / Run to allow a null cycleId for global scope
//   - Wire the /api/hearing/launch global response to launch such a run and
//     return a threadable context the web can poll
import { Link } from "react-router-dom";
import { useSetTopbar } from "../../components/shell/topbar-context";
import "./step-config-readback.css";

export function GlobalHearingPage() {
  useSetTopbar(
    { left: <span className="crumb__current">ステップ設定ヒアリング(全体)</span> },
    [],
  );

  return (
    <div className="content-inner cfg-rb">
      <div className="cfg-rb__scope-bar">
        <span className="cfg-rb__scope-tag cfg-rb__scope-tag--global">
          全サイクル共通の既定
        </span>
      </div>

      <div className="cfg-rb__lock" role="note" style={{ marginTop: "1.5rem" }}>
        <span aria-hidden="true">ℹ</span>
        <span>
          全体設定の会話ヒアリングは、サイクルと紐づく形で動きます。
          サイクルを開いて「会話で直す」を使うと、そのサイクル向けの設定を会話で調整できます。
          全サイクル共通の既定だけを変えたい場合は、下の「設定一覧に戻る」から直接編集してください。
        </span>
      </div>

      <div className="cfg-rb__foot">
        <Link to="/settings/steps" className="btn btn--primary">
          設定一覧に戻る →
        </Link>
      </div>
    </div>
  );
}
