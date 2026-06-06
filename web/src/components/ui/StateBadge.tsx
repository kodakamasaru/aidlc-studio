// StateBadge — color + dot + text label (triple-encode for a11y). Variant maps
// to the badge--* classes defined in global.css.
import type { ReactNode } from "react";

type Variant = "running" | "stalled" | "failed" | "done" | "idle" | "q" | "review";

interface StateBadgeProps {
  readonly variant: Variant;
  readonly children: ReactNode;
  /** Hide the leading dot (e.g. inbox-kind badges that lead with an icon). */
  readonly noDot?: boolean;
  /** Pulse the dot (running liveness). */
  readonly pulse?: boolean;
  readonly icon?: ReactNode;
  readonly ariaLabel?: string;
}

export function StateBadge({
  variant,
  children,
  noDot,
  pulse,
  icon,
  ariaLabel,
}: StateBadgeProps) {
  const classes = [
    "badge",
    `badge--${variant}`,
    noDot ? "badge--no-dot" : "",
    pulse ? "badge--pulse" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} aria-label={ariaLabel}>
      {icon}
      {children}
    </span>
  );
}
