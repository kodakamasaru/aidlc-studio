// SCR (US-06 / scope I) — Step 定義カスタム UI. Edit each pipeline step's contracts
// (output profile / verification observations / human gate / escalation) and
// PATCH them to the project. A step that declares verification observations runs
// as a gen→gate→eval generator on its NEXT launch (existing cycles are snapshot
// at creation, so they are unaffected). Reads the current project from context.
import { useState } from "react";
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
import "./step-config.css";

const HUMAN_GATE_MODES: readonly HumanGateMode[] = [
  "visual_review",
  "device_check",
  "none",
];
const ESCALATION_KINDS: readonly EscalationKind[] = ["retry", "backtrack", "human"];

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
        <h1 className="step-config__title">Step 設定</h1>
        <p className="step-config__meta">
          各 Step の契約(出力 / 検証 / 人間ゲート / エスカレーション)を編集します。
          検証観点を設定した Step は次回起動時に gen→gate→eval で実行されます。
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
        <span className="step-card__label">{step.label}</span>
        {runsAsGenerator ? (
          <span className="step-card__badge">gen→gate→eval</span>
        ) : (
          <span className="step-card__badge step-card__badge--legacy">単一 Run</span>
        )}
      </div>

      <label className="field-label" htmlFor={`${step.id}-obs`}>
        検証観点(1 行 1 観点 · evaluator がこれを検証 / 設定すると gen→gate→eval)
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
            成果物プロファイル(taskKind)
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
            人間ゲート
          </label>
          <select
            id={`${step.id}-gate`}
            className="input"
            value={gateMode}
            onChange={(e) => setGateMode(e.target.value as HumanGateMode | "")}
          >
            <option value="">(未設定)</option>
            {HUMAN_GATE_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-stall`}>
            stall 時の対応
          </label>
          <select
            id={`${step.id}-stall`}
            className="input"
            value={onStall}
            onChange={(e) => setOnStall(e.target.value as EscalationKind | "")}
          >
            <option value="">(未設定)</option>
            {ESCALATION_KINDS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        <div className="step-card__field">
          <label className="field-label" htmlFor={`${step.id}-retry`}>
            最大リトライ回数
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

      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="step-card__foot">
        <span className="step-card__saved" aria-live="polite">
          {saved ? "保存しました" : ""}
        </span>
        <button type="submit" className="btn btn--primary" disabled={saving}>
          {saving ? <Spinner size={14} /> : null}
          契約を保存
        </button>
      </div>
    </form>
  );
}
