// SCR (US-06 / scope I) — ステップ定義カスタム UI。各ステップの設定(成果物の種類 /
// 検証の観点 / 人の確認 / 行き詰まり時の対応)を編集し、プロジェクトへ PATCH する。検証の
// 観点を宣言したステップは次回起動時に「作る→自動チェック→AI が点検」で動く(既存サイクルは
// 作成時スナップショットなので影響なし)。用語は平易な日本語(内部語を出さない)。
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type Project,
  type StepDef,
  type StepContracts,
  type HumanGateMode,
  type EscalationKind,
} from "../../lib/api";
import { useProjectContext } from "../../lib/project-context";
import { errorMessage } from "../../lib/format";
import { Spinner } from "../../components/ui/Spinner";
import { stepLabel } from "../../lib/step-label";
import "./step-config.css";

const HUMAN_GATE_MODES: readonly HumanGateMode[] = [
  "visual_review",
  "device_check",
  "none",
];
const ESCALATION_KINDS: readonly EscalationKind[] = ["retry", "backtrack", "human"];

// 内部の enum 値 → 平易な選択肢ラベル(値は API へそのまま送る)。
const GATE_LABEL: Record<HumanGateMode, string> = {
  visual_review: "できあがりの確認",
  device_check: "実機での確認",
  none: "確認なし",
};
const ESCALATION_LABEL: Record<EscalationKind, string> = {
  retry: "やり直す",
  backtrack: "前のステップへ戻す",
  human: "人に相談する",
};

export function StepConfigPage() {
  const { project, status, adoptProject } = useProjectContext();

  if (status === "loading") {
    return <div className="content-inner"><p className="state-msg">読み込み中…</p></div>;
  }
  if (!project) {
    return (
      <div className="content-inner">
        <p className="state-msg">
          プロジェクトが未登録です。先にサイクル画面でリポジトリを登録してください。
        </p>
      </div>
    );
  }

  const steps = [...project.pipelineDef].sort((a, b) => a.order - b.order);
  return (
    <div className="content-inner step-config">
      <header className="step-config__head">
        <h1 className="step-config__title">ステップ設定</h1>
        <p className="step-config__meta">
          各ステップの設定(成果物の種類 / 検証の観点 / 人の確認 / 行き詰まり時の対応)を編集します。
          検証の観点を設定したステップは、次回から「作る → 自動チェック → AI が点検」の順で実行されます。
        </p>
        {/* US-02 / S3 scr-02: snapshot の意味を画面で明示(作成時点に固定される)。
            折り返しは文の境界(。)でのみ起こし、語中(「サイクル」等)で割れないよう
            各文を nowrap、文間に <wbr> を置く。 */}
        <p className="step-config__snapshot-note" role="note">
          <span className="step-config__snapshot-icon" aria-hidden="true">ⓘ</span>
          <span className="step-config__snapshot-text">
            <span className="step-config__snapshot-line">
              ここでの編集は“これから作る”サイクルに反映されます。
            </span>
            <wbr />
            <span className="step-config__snapshot-line">
              作成済みのサイクルは作成時点の構成に固定です。
            </span>
          </span>
        </p>
      </header>
      <div className="step-config__list">
        {steps.map((step) => (
          <StepCard
            key={step.id}
            projectId={project.id}
            step={step}
            onSaved={adoptProject}
          />
        ))}
      </div>
    </div>
  );
}

interface StepCardProps {
  readonly projectId: string;
  readonly step: StepDef;
  readonly onSaved: (project: Project) => void;
}

function StepCard({ projectId, step, onSaved }: StepCardProps) {
  const c = step.contracts ?? {};
  const [profileKind, setProfileKind] = useState(c.output?.profileKind ?? "");
  const [observations, setObservations] = useState(
    (c.verification?.observations ?? []).join("\n"),
  );
  const [gateMode, setGateMode] = useState<HumanGateMode | "">(c.humanGate?.mode ?? "");
  const [onStall, setOnStall] = useState<EscalationKind | "">(c.escalation?.onStall ?? "");
  const [maxRetry, setMaxRetry] = useState(
    c.escalation?.maxRetry !== undefined ? String(c.escalation.maxRetry) : "",
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // US-06 対話式編集: 要望 → AI 提案 → 差分プレビュー → 承認して適用。
  const [requestText, setRequestText] = useState("");
  const [proposing, setProposing] = useState(false);
  const [proposal, setProposal] = useState<{
    readonly current: StepContracts;
    readonly proposed: StepContracts;
  } | null>(null);

  function build(): StepContracts {
    const obs = observations
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const retry = Number.parseInt(maxRetry, 10);
    return {
      ...(profileKind.trim() ? { output: { profileKind: profileKind.trim() } } : {}),
      ...(obs.length > 0 ? { verification: { observations: obs } } : {}),
      ...(gateMode ? { humanGate: { mode: gateMode } } : {}),
      ...(onStall
        ? {
            escalation: {
              onStall,
              ...(Number.isInteger(retry) && retry > 0 ? { maxRetry: retry } : {}),
            },
          }
        : {}),
    };
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateStepContracts(projectId, step.id, build());
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function propose() {
    if (!requestText.trim() || proposing) return;
    setProposing(true);
    setError(null);
    try {
      setProposal(await api.proposeStepContracts(projectId, step.id, requestText.trim()));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProposing(false);
    }
  }

  async function applyProposal() {
    if (!proposal || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api.updateStepContracts(projectId, step.id, proposal.proposed);
      onSaved(updated);
      // 適用後はフォームにも反映し、提案・要望をクリア。
      setObservations((proposal.proposed.verification?.observations ?? []).join("\n"));
      setProposal(null);
      setRequestText("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const proposedObs = proposal?.proposed.verification?.observations ?? [];
  const currentObsSet = new Set(
    (proposal?.current.verification?.observations ?? []).map((o) => o as string),
  );

  const runsAsGenerator = observations.trim().length > 0;

  return (
    <form
      className="step-card surface-card"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="step-card__head">
        <h2 className="step-card__id mono">{step.id}</h2>
        <span className="step-card__label">{stepLabel(step.id)}</span>
        {runsAsGenerator ? (
          <span className="step-card__badge">自動チェックあり</span>
        ) : (
          <span className="step-card__badge step-card__badge--legacy">単一実行</span>
        )}
        <Link to={`/settings/steps/${step.id}`} className="step-card__spec-link">
          全文を見る →
        </Link>
      </div>

      <label className="field-label" htmlFor={`${step.id}-obs`}>
        検証の観点(1 行に 1 つ · AI がこれを点検 / 設定すると自動チェックが付きます)
      </label>
      <textarea
        id={`${step.id}-obs`}
        className="textarea mono step-card__obs"
        value={observations}
        onChange={(e) => setObservations(e.target.value)}
        placeholder="例: 一覧が表示される&#10;空状態が表示される"
      />

      <div className="step-card__grid">
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-profile`}>
            成果物の種類
          </label>
          <input
            id={`${step.id}-profile`}
            className="input"
            value={profileKind}
            onChange={(e) => setProfileKind(e.target.value)}
            placeholder="例: bugfix"
          />
        </div>
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-gate`}>
            人の確認
          </label>
          <select
            id={`${step.id}-gate`}
            className="input"
            value={gateMode}
            onChange={(e) => setGateMode(e.target.value as HumanGateMode | "")}
          >
            <option value="">(未設定)</option>
            {HUMAN_GATE_MODES.map((m) => (
              <option key={m} value={m}>{GATE_LABEL[m]}</option>
            ))}
          </select>
        </div>
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-stall`}>
            行き詰まり時の対応
          </label>
          <select
            id={`${step.id}-stall`}
            className="input"
            value={onStall}
            onChange={(e) => setOnStall(e.target.value as EscalationKind | "")}
          >
            <option value="">(未設定)</option>
            {ESCALATION_KINDS.map((k) => (
              <option key={k} value={k}>{ESCALATION_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-retry`}>
            最大やり直し回数
          </label>
          <input
            id={`${step.id}-retry`}
            className="input"
            type="number"
            min={1}
            value={maxRetry}
            onChange={(e) => setMaxRetry(e.target.value)}
            placeholder="既定: プロジェクト設定"
          />
        </div>
      </div>

      <div className="step-dialog">
        <label className="field-label" htmlFor={`${step.id}-req`}>
          AI に相談して調整(やりたいことを書くと、検証の観点の変更案を提案します)
        </label>
        <div className="step-dialog__row">
          <textarea
            id={`${step.id}-req`}
            className="textarea step-dialog__input"
            value={requestText}
            onChange={(e) => setRequestText(e.target.value)}
            placeholder="例: 並び順が正しいことも確認したい"
          />
          <button
            type="button"
            className="btn btn--surface"
            onClick={() => void propose()}
            disabled={proposing || requestText.trim().length === 0}
          >
            {proposing ? <Spinner size={14} /> : null}
            提案を見る
          </button>
        </div>
        {proposal ? (
          <div
            className="step-proposal"
            role="group"
            aria-label="AI からの変更案"
          >
            <p className="step-proposal__title">AI からの変更案 — 検証の観点</p>
            <ul className="step-proposal__list">
              {proposedObs.map((o, i) => {
                const isNew = !currentObsSet.has(o as string);
                return (
                  <li key={i} className={isNew ? "step-proposal__add" : ""}>
                    {o}
                    {isNew ? <span className="step-proposal__tag">追加</span> : null}
                  </li>
                );
              })}
            </ul>
            <div className="step-proposal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setProposal(null)}
              >
                やめる
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => void applyProposal()}
                disabled={saving}
              >
                {saving ? <Spinner size={14} /> : null}
                この内容で適用
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="step-card__foot">
        <span className="step-card__saved" aria-live="polite">
          {saved ? "保存しました" : ""}
        </span>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <Spinner size={14} /> : null}
          設定を保存
        </button>
      </div>
    </form>
  );
}
