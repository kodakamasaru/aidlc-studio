// SCR-01 full-spec — ステップの指示・全文(確認のみ)。ステップ設定の「全文を見る」から到達。
// AI がそのステップで受け取る指示(= このプロダクトで実際に AI を駆動する契約)を、要約でなく
// すべて平易に並べる読み取り専用ビュー。元のスキル本文(kit/skills)は別管理で、ここでは
// 画面から編集できる契約の全項目を全文表示する。S3 視覚契約 scr-01.full-spec。
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { stepLabel } from "../../lib/step-label";
import "./step-config.css";

const GATE_TEXT: Record<string, string> = {
  visual_review: "できあがりの確認",
  device_check: "実機での確認",
  none: "確認なし",
};
const ESCALATION_TEXT: Record<string, string> = {
  retry: "やり直す",
  backtrack: "前のステップへ戻す",
  human: "人に相談する",
};

export function StepSpecPage() {
  const { stepId = "" } = useParams();
  const { project, status } = useProjectContext();
  // スキル本文(AI への指示の全文)。対応スキルが無ければ content="" で枠は出さない。
  const skillQ = useAsync(() => api.getStepSkill(stepId), [stepId]);

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to="/settings/steps" className="crumb">
            ステップ設定
          </Link>
          <span className="crumb__sep">/</span>
          <span className="crumb__current">{stepLabel(stepId)} の指示</span>
        </span>
      ),
    },
    [stepId],
  );

  if (status === "loading") {
    return <div className="content-inner"><p className="state-msg">読み込み中…</p></div>;
  }
  const step = project?.pipelineDef.find((s) => s.id === stepId);
  if (!project || !step) {
    return (
      <div className="content-inner">
        <p className="state-msg">このステップは見つかりませんでした。</p>
      </div>
    );
  }

  const c = step.contracts ?? {};
  const observations = c.verification?.observations ?? [];

  return (
    <div className="content-inner step-config">
      <header className="step-config__head">
        <h1 className="step-config__title">「{stepLabel(step.id)}」の指示・全文</h1>
        <p className="step-config__meta">
          このステップで AI が受け取る指示の全文です(確認のみ)。内容を変えるには「ステップ設定」で編集します。
        </p>
      </header>

      <section className="surface-card step-spec">
        <dl className="step-spec__list">
          <dt>ステップ</dt>
          <dd>
            {stepLabel(step.id)} <span className="mono">({step.id})</span>
          </dd>

          <dt>検証の観点(AI がこれを点検)</dt>
          <dd>
            {observations.length > 0 ? (
              <ul className="step-spec__obs">
                {observations.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            ) : (
              <span className="step-spec__empty">未設定(自動チェックなし)</span>
            )}
          </dd>

          <dt>成果物の種類</dt>
          <dd>{c.output?.profileKind ?? <span className="step-spec__empty">未設定</span>}</dd>

          <dt>人の確認</dt>
          <dd>
            {c.humanGate?.mode ? (
              (GATE_TEXT[c.humanGate.mode] ?? c.humanGate.mode)
            ) : (
              <span className="step-spec__empty">未設定</span>
            )}
          </dd>

          <dt>行き詰まり時の対応</dt>
          <dd>
            {c.escalation?.onStall ? (
              <>
                {ESCALATION_TEXT[c.escalation.onStall] ?? c.escalation.onStall}
                {c.escalation.maxRetry !== undefined
                  ? `(最大 ${c.escalation.maxRetry} 回)`
                  : ""}
              </>
            ) : (
              <span className="step-spec__empty">未設定</span>
            )}
          </dd>
        </dl>
        <p className="field-hint step-spec__note">
          ※ 上は画面から設定できる契約の全項目です。下は、このステップで AI が受け取る指示の本文(全文)です。
        </p>
      </section>

      <section className="surface-card step-spec" aria-label="AI への指示(全文)">
        <h2 className="step-spec__prose-title">AI への指示(全文)</h2>
        {skillQ.status === "loading" ? (
          <p className="state-msg">読み込み中…</p>
        ) : skillQ.data && skillQ.data.content ? (
          <pre className="step-spec__prose">{skillQ.data.content}</pre>
        ) : (
          <p className="step-spec__empty">
            このステップに対応する指示本文は登録されていません。
          </p>
        )}
      </section>
    </div>
  );
}
