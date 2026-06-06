// Modal — scrim + dialog with focus trap, Esc-to-close, and labelled heading.
// 200ms fade+slide-up enter (compositor-friendly; reduced-motion respected via
// global rule). Used by the create-cycle and backtrack dialogs.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useCallbackRef, useFocusTrap, useAppShellInert } from "./modal-hooks";
import { CloseIcon } from "./Icon";
import "./modal.css";

interface ModalProps {
  readonly titleId: string;
  /** Id of the element describing the dialog (wired to aria-describedby). */
  readonly describedById?: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
}

export function Modal({ titleId, describedById, onClose, children }: ModalProps) {
  const onCloseRef = useCallbackRef(onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(onCloseRef);
  // Remove the app shell behind the modal from tab order + the a11y tree while
  // it is open. The dialog is portaled to <body> (a SIBLING of .app-shell) so
  // inerting the shell does not inert the dialog itself.
  useAppShellInert();

  return createPortal(
    <div className="modal-scrim" onMouseDown={onClose}>
      <div
        className="modal-dialog surface-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...(describedById !== undefined ? { "aria-describedby": describedById } : {})}
        ref={dialogRef}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="modal-close"
          aria-label="閉じる"
          onClick={onClose}
        >
          <CloseIcon size={16} />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}
