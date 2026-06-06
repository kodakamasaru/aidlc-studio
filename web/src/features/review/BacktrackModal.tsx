// BacktrackModal (SCR-04 backtrack) — two-step guard: pick a past step + a
// required reason, then POST answer {verdict:"reject", backtrackTo, reason}. The
// reason becomes a ledger/Decision record, so confirm stays disabled until it is
// non-empty.
import { useEffect, useId, useState, type FormEvent } from "react";
import { Modal } from "../../components/ui/Modal";

export interface StepOption {
  readonly step: string;
  readonly label: string;
}

interface BacktrackModalProps {
  readonly steps: readonly StepOption[];
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (backtrackTo: string, reason: string) => void;
}

export function BacktrackModal({
  steps,
  submitting,
  error,
  onClose,
  onConfirm,
}: BacktrackModalProps) {
  const titleId = useId();
  const descId = useId();
  const stepId = useId();
  const reasonId = useId();
  const [backtrackTo, setBacktrackTo] = useState(steps[0]?.step ?? "");
  const [reason, setReason] = useState("");

  // The cycle (and thus its step options) is fetched lazily once the modal
  // opens, so the modal usually mounts with steps=[] → backtrackTo="". When the
  // steps arrive, seed the selection from the first option so 確定 (confirm)
  // becomes reachable; once a value is set, the user's choice is preserved.
  useEffect(() => {
    if (!backtrackTo && steps.length > 0) {
      setBacktrackTo(steps[0]!.step);
    }
  }, [steps, backtrackTo]);

  const canConfirm = backtrackTo !== "" && reason.trim().length > 0 && !submitting;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm(backtrackTo, reason.trim());
  }

  return (
    <Modal titleId={titleId} describedById={descId} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <h2 id={titleId} className="modal-title">
          差し戻し — 手戻り先を選ぶ
        </h2>
        <p id={descId} className="modal-desc">
          任意の過去ステップへ戻せます。理由は Decision / ledger
          に残ります(監査可能性)。
        </p>

        <div className="modal-body">
          <div>
            <label className="field-label" htmlFor={stepId}>
              戻り先ステップ
            </label>
            <select
              id={stepId}
              className="select"
              value={backtrackTo}
              onChange={(e) => setBacktrackTo(e.target.value)}
            >
              {steps.map((s) => (
                <option key={s.step} value={s.step}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label" htmlFor={reasonId}>
              差し戻し理由
            </label>
            <textarea
              id={reasonId}
              className="textarea mono"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="なぜ戻すのか / 何を直してから再生成するか"
            />
            {reason.trim().length === 0 ? (
              <p className="field-hint">理由は必須です(監査記録に残ります)。</p>
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
          <button type="submit" className="btn btn--danger" disabled={!canConfirm}>
            {submitting ? "処理中…" : `${backtrackTo} から再開する`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
