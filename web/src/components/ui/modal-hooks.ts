// Focus-trap + Esc handling for Modal. Keeps a stable ref to the latest onClose,
// moves focus into the dialog on mount, cycles Tab within it, and restores focus
// to the previously focused element on unmount.
import { useEffect, useRef, type RefObject } from "react";

/** Stable ref always holding the latest callback (avoids effect churn). */
export function useCallbackRef<T extends (...args: never[]) => void>(
  cb: T,
): RefObject<T> {
  const ref = useRef(cb);
  useEffect(() => {
    ref.current = cb;
  });
  return ref;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement>(
  onCloseRef: RefObject<() => void>,
): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    const first = focusables()[0];
    (first ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const firstItem = items[0]!;
      const lastItem = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onCloseRef]);

  return ref;
}

/**
 * While mounted, mark the app shell (`.app-shell`) inert so background content
 * is removed from tab order and the accessibility tree. The Modal portals its
 * dialog to <body> (outside `.app-shell`), so the dialog stays interactive.
 * Restores the prior state on unmount; ref-counts so stacked modals are safe.
 */
let inertDepth = 0;

export function useAppShellInert(): void {
  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (!shell) return;
    inertDepth += 1;
    shell.setAttribute("inert", "");
    shell.setAttribute("aria-hidden", "true");
    return () => {
      inertDepth -= 1;
      if (inertDepth <= 0) {
        inertDepth = 0;
        shell.removeAttribute("inert");
        shell.removeAttribute("aria-hidden");
      }
    };
  }, []);
}
