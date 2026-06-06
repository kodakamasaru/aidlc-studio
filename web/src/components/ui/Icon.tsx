// Inline SVG glyph set — keeps the brand marks deterministic (no icon-font
// dependency, screenshot-stable). Decorative by default (aria-hidden); pass a
// `title` to make an icon meaningful to assistive tech.
import type { ReactNode } from "react";

interface IconProps {
  readonly size?: number;
  readonly title?: string;
  readonly className?: string;
}

function Svg({
  size = 16,
  title,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const DiamondIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 L21 12 L12 21 L3 12 Z" />
  </Svg>
);

export const SparkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 C12.5 8 16 11.5 21 12 C16 12.5 12.5 16 12 21 C11.5 16 8 12.5 3 12 C8 11.5 11.5 8 12 3 Z" />
  </Svg>
);

export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="8" y1="6" x2="20" y2="6" />
    <line x1="8" y1="12" x2="20" y2="12" />
    <line x1="8" y1="18" x2="20" y2="18" />
    <circle cx="4" cy="6" r="1" />
    <circle cx="4" cy="12" r="1" />
    <circle cx="4" cy="18" r="1" />
  </Svg>
);

export const GridIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <polyline points="9 6 15 12 9 18" />
  </Svg>
);

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
  </Svg>
);

export const RetryIcon = (p: IconProps) => (
  <Svg {...p}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.5 15 A9 9 0 1 0 6 5.3 L1 10" />
  </Svg>
);

export const BacktrackIcon = (p: IconProps) => (
  <Svg {...p}>
    <polyline points="9 14 4 9 9 4" />
    <path d="M20 20 v-7 a4 4 0 0 0 -4 -4 H4" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <polyline points="20 6 9 17 4 12" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </Svg>
);

// PersonIcon — the human-waiting glyph. Distinct from the AI spinner so the
// "blocked on you" state reads visually (not just by color).
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21 a8 8 0 0 1 16 0" />
  </Svg>
);
