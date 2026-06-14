// SCR-06 — ステップの指示・全文(確認のみ)。SCR-04 からドリルイン。
// AI がそのステップで受け取る指示(= このプロダクトで実際に AI を駆動する契約)を、要約でなく
// すべて平易に並べる読み取り専用ビュー。S3 視覚契約 scr-06-step-spec。
// 状態: default(契約あり + 指示本文あり) / loading(スケルトン) / no-instruction(指示未登録)。
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

/** 平易表示名: StepDef.label → stepLabel の順(未知ステップは label が正確) */
function resolveStepName(stepId: string, defLabel?: string): string {
  const fromTable = stepLabel(stepId);
  // stepLabel が ID をそのまま返す場合(未知 step)は pipelineDef の label を優先。
  if (fromTable === stepId && defLabel && defLabel !== stepId) return defLabel;
  return fromTable;
}

export function StepSpecPage() {
  const { stepId = "" } = useParams();
  const { project, status } = useProjectContext();
  // スキル本文(AI への指示の全文)。対応スキルが無ければ content="" で枠は出さない。
  const skillQ = useAsync(() => api.getStepSkill(stepId), [stepId]);

  const isLoading = status === "loading";
  // step は loading 中は undefined。
  const step = !isLoading ? project?.pipelineDef.find((s) => s.id === stepId) : undefined;
  const displayName = step ? resolveStepName(step.id, step.label) : stepLabel(stepId);

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to="/settings/steps" className="crumb">
            ‹ ステップ設定
          </Link>
          <span className="crumb__sep" aria-hidden="true"> </span>
          {!isLoading && step ? (
            <span className="crumb__current">「{displayName}」の指示・全文</span>
          ) : (
            <span className="crumb__current">指示・全文</span>
          )}
        </span>
      ),
      right: !isLoading && step ? (
        <Link to="/settings/steps" className="cfg-rb__scope-link">
          ステップ設定で編集 →
        </Link>
      ) : undefined,
    },
    [stepId, isLoading, !!step],
  );

  // ── Loading skeleton (SCR-06 loading state) ───────────────────
  if (isLoading) {
    return (
      <div className="content-inner step-config" aria-busy="true">
        <section className="surface-card step-spec">
          <h2 className="step-spec__prose-title">設定の全項目</h2>
          <div className="step-spec__skel-block">
            <div className="skel-line skel-line--long" />
            <div className="skel-line skel-line--full" />
            <div className="skel-line skel-line--med" />
          </div>
        </section>
        <section className="surface-card step-spec">
          <h2 className="step-spec__prose-title">AI への指示(全文)</h2>
          <div className="step-spec__skel-block">
            <div className="skel-line skel-line--full" />
            <div className="skel-line skel-line--full" />
            <div className="skel-line skel-line--long" />
          </div>
        </section>
      </div>
    );
  }

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
        <p className="step-config__meta">
          このステップで AI が受け取る指示の全文です(確認のみ)。内容を変えるには「ステップ設定」で会話して直します。
        </p>
      </header>

      {/* ── 設定の全項目 ── */}
      <section className="surface-card step-spec" aria-labelledby="spec-contracts-h">
        <h2 id="spec-contracts-h" className="step-spec__prose-title">設定の全項目</h2>
        <dl className="step-spec__list">
          <dt>ステップ</dt>
          <dd>{displayName}</dd>

          {observations.length > 0 ? (
            <>
              <dt>検証の観点(AI がこれを点検)</dt>
              <dd>
                <ul className="step-spec__obs">
                  {observations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}

          {c.output?.profileKind ? (
            <>
              <dt>成果物の種類</dt>
              <dd>{c.output.profileKind}</dd>
            </>
          ) : null}

          {c.humanGate?.mode ? (
            <>
              <dt>人の確認</dt>
              <dd>{GATE_TEXT[c.humanGate.mode] ?? c.humanGate.mode}</dd>
            </>
          ) : null}

          {c.escalation?.onStall ? (
            <>
              <dt>行き詰まり時の対応</dt>
              <dd>
                {ESCALATION_TEXT[c.escalation.onStall] ?? c.escalation.onStall}
                {c.escalation.maxRetry !== undefined
                  ? `(最大 ${c.escalation.maxRetry} 回)`
                  : ""}
              </dd>
            </>
          ) : null}
        </dl>
        <p className="field-hint step-spec__note">
          ※ 上は画面から設定できる契約の全項目です。下は、このステップで AI が受け取る指示の本文(全文)です。
        </p>
      </section>

      {/* ── AI への指示(全文) ── */}
      <section className="surface-card step-spec" aria-labelledby="spec-prose-h">
        <h2 id="spec-prose-h" className="step-spec__prose-title">AI への指示(全文)</h2>
        {skillQ.status === "loading" ? (
          <div className="step-spec__skel-block" aria-busy="true">
            <div className="skel-line skel-line--full" />
            <div className="skel-line skel-line--full" />
            <div className="skel-line skel-line--long" />
          </div>
        ) : skillQ.data && skillQ.data.content ? (
          <pre className="step-spec__prose">{skillQ.data.content}</pre>
        ) : (
          <p className="step-spec__empty step-spec__no-instruction">
            このステップには指示の本文がまだ登録されていません。
          </p>
        )}
      </section>
    </div>
  );
}
