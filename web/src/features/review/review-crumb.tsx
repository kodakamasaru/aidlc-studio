// Shared "Inbox / <current>" topbar crumb for the question detail screens.
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export function reviewCrumb(current: string): ReactNode {
  return (
    <span className="crumb-wrap">
      <Link to="/inbox" className="crumb">
        Inbox
      </Link>
      <span className="crumb__sep">/</span>
      <span className="crumb__current">{current}</span>
    </span>
  );
}
