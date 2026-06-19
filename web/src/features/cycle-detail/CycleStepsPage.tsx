// SCR-01 cycle-steps — サイクルのステップ構成(確認のみ)。各ステップを 番号 + 平易名 +
// 説明 + 状態バッジ のカードで縦に並べ、進行中は変更不可の注意を出す。末尾に現ステップの
// 「指示(要約)」(契約)+ 全文リンク。S3 視覚契約 scr-01.cycle-steps。
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { useProjectContext } from "../../lib/project-context";
import { useSetTopbar } from "../../components/shell/topbar-context";
import { LoadingMessage, ErrorMessage } from "../../components/ui/StateMessage";
import { CheckIcon } from "../../components/ui/Icon";
import { stepLabel, stepDesc } from "../../lib/step-label";
import { stepsGuidance } from "../../lib/cycle-state";
import "./cycle-detail.css";

const STATE_TEXT: Record<string, string> = {
  done: "完了",
  running: "進行中",
  review: "確認待ち",
  pending: "未着手",
};
const GATE_TEXT: Record<string, string> = {
  visual_review: "できあがりの確認",
  device_check: "実機での確認",
  none: "確認なし",
};

function stepNumber(step: string): string {
  const m = step.match(/^S(\d+(?:\.\d+)?)$/);
  return m?.[1] ?? step;
}

export function CycleStepsPage() {
  const { cycleId = "" } = useParams();
  const cycleQ = useAsync(() => api.getCycle(cycleId), [cycleId]);
  // F-14: per-cycle の工程調整は「要件(S1)確定直後の組み直し提案」で行う。提案が存在するなら
  // 本来の調整点なので導線を出す。未生成は 404 → null(エラー扱いにしない / 黙って落とさない)。
  const proposalQ = useAsync(async () => {
    try {
      return await api.getReconstructionProposal(cycleId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, [cycleId]);
  const { project } = useProjectContext();
  const cycle = cycleQ.data;

  useSetTopbar(
    {
      left: (
        <span className="crumb-wrap">
          <Link to={`/cycles/${cycleId}`} className="crumb">
            サイクル
          </Link>
          <span className="crumb__sep">/</span>
          <span className="crumb__current">ステップ構成</span>
        </span>
      ),
    },
    [cycleId],
  );

  if (cycleQ.status === "loading") {
    return <div className="content-inner"><LoadingMessage /></div>;
  }
  if (cycleQ.status === "error" || !cycle) {
    return (
      <div className="content-inner">
        <ErrorMessage error={cycleQ.error} onRetry={cycleQ.reload} />
      </div>
    );
  }

  const active = cycle.phases.find((p) => p.state !== "done");
  // F-14: この画面は「閲覧専用」。per-cycle の工程調整は要件(S1)確定直後の組み直し提案で行う
  // ので、案内文は状態に応じて実態を述べ(旧『始める前にだけ調整できる』は実態と真逆で削除)、
  // 提案があれば本来の調整点へ導く。
  const guidance = stepsGuidance(cycle, proposalQ.data != null);
  // 現ステップの契約(指示の要約に使う)。project が未取得なら要約は出さない。
  const activeDef = project?.pipelineDef.find((s) => s.id === active?.step);
  const c = activeDef?.contracts ?? {};
  const observations = c.verification?.observations ?? [];

  return (
    <div className="content-inner cycle-detail">
      <Link to={`/cycles/${cycleId}`} className="page-head__link">
        ← サイクル詳細に戻る
      </Link>
      <header className="page-head">
        <h1 className="page-title">{cycle.version} のステップ構成</h1>
        {/* P25: 詳細設定(各ステップの成果物・人の確認・行き詰まり時)への導線。
            これが無いと CycleStepConfigPage(/cycles/:id/settings)が orphan route
            になる(どこからもリンクされず人間が到達できない)。 */}
        <Link to={`/cycles/${cycleId}/settings`} className="page-head__link">
          各ステップの設定(成果物・人の確認・行き詰まり時)を見る →
        </Link>
      </header>

      {guidance === "reconstruction-available" ? (
        <p className="cycle-steps-note cycle-steps-note--action" role="note">
          要件が固まったので、AI がこのサイクル向けの工程の組み直しを提案しています。{" "}
          <Link to={`/cycles/${cycleId}/reconstruction`} className="page-head__link">
            → 工程の組み直しを確認する
          </Link>
        </p>
      ) : guidance === "pre-requirements" ? (
        <p className="cycle-steps-note" role="note">
          工程はまず既定のまま動きます。要件(「{stepLabel("S1")}」)が固まると、AI
          がこのサイクル向けに工程の組み直しを提案します。ここは現在の工程を確認する画面です。
        </p>
      ) : (
        <p className="cycle-steps-note" role="note">
          進行中のため工程構成は変更できません。工程の組み直しは、要件が固まった直後にのみ行います。
        </p>
      )}

      <ol className="cycle-steps-cards">
        {cycle.phases.map((phase) => {
          const isActive = active && phase.id === active.id;
          const isDone = phase.state === "done";
          return (
            <li
              key={phase.id}
              className={`step-card-row surface-card${isActive ? " step-card-row--active" : ""}`}
            >
              <span
                className={`step-card-row__num${isDone ? " step-card-row__num--done" : ""}${isActive ? " step-card-row__num--active" : ""}`}
                aria-hidden="true"
              >
                {isDone ? <CheckIcon size={14} /> : stepNumber(phase.step)}
              </span>
              <span className="step-card-row__main">
                <span className="step-card-row__name">{stepLabel(phase.step)}</span>
                <span className="step-card-row__desc">{stepDesc(phase.step)}</span>
              </span>
              <span className={`badge step-card-row__state step-card-row__state--${phase.state}`}>
                {STATE_TEXT[phase.state] ?? phase.state}
              </span>
            </li>
          );
        })}
      </ol>

      {active ? (
        <section className="surface-card step-summary" aria-label="現ステップの指示の要約">
          <header className="step-summary__head">
            <h2 className="step-summary__title">
              「{stepLabel(active.step)}」の指示(要約)
            </h2>
            <Link to={`/settings/steps/${active.step}`} className="page-head__link">
              ↗ AI 実行用の全文を見る
            </Link>
          </header>
          <dl className="step-summary__list">
            <dt>このステップでやること</dt>
            <dd>{stepDesc(active.step) || "(説明なし)"}</dd>
            <dt>検証の観点(AI がこれを点検)</dt>
            <dd>
              {observations.length > 0 ? (
                <ul className="step-summary__obs">
                  {observations.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
              ) : (
                <span className="step-summary__empty">未設定</span>
              )}
            </dd>
            <dt>成果物の種類</dt>
            <dd>{c.output?.profileKind ?? <span className="step-summary__empty">未設定</span>}</dd>
            <dt>人の確認</dt>
            <dd>
              {c.humanGate?.mode ? (
                GATE_TEXT[c.humanGate.mode] ?? c.humanGate.mode
              ) : (
                <span className="step-summary__empty">未設定</span>
              )}
            </dd>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
