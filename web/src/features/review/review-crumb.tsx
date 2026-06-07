// Shared "サイクル / <current>" topbar crumb for the question detail screens.
// The question lives UNDER its cycle, so the crumb returns to the cycle screen.
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function reviewCrumb(current: string, cycleId: string): ReactNode {
  return (
    <span className="crumb-wrap">
      <Link to={`/cycles/${cycleId}`} className="crumb">
        サイクル
      </Link>
      <span className="crumb__sep">/</span>
      <span className="crumb__current">{current}</span>
    </span>
  );
}
