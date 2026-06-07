// AppShell — fixed left sidebar (workspace nav) + topbar slot + scrollable
// content (router <Outlet/>). Inbox nav item carries the open-question count.
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { useProjectContext } from "../../lib/project-context";
import { useTopbarContent } from "./topbar-context";
import { DiamondIcon, SparkIcon, ListIcon, GridIcon } from "../ui/Icon";
import "./app-shell.css";

interface NavItemProps {
  readonly to: string;
  readonly icon: ReactNode;
  readonly label: string;
  readonly count?: number;
  readonly end?: boolean;
}

function NavItem({ to, icon, label, count, end }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={end ?? false}
      className={({ isActive }) =>
        `nav-item${isActive ? " nav-item--active" : ""}`
      }
    >
      <span className="nav-item__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-item__label">{label}</span>
      {typeof count === "number" && count > 0 ? (
        <span className="nav-item__count" aria-label={`未処理 ${count} 件`}>
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

export function AppShell() {
  const { inboxCount } = useProjectContext();
  const topbar = useTopbarContent();
  const { pathname } = useLocation();
  const mainRef = useRef<HTMLElement>(null);

  // On route change, move focus into the page so keyboard/SR users land on the
  // new content (instead of leaving focus on the just-clicked nav link). We
  // focus <main> (focusable via tabIndex=-1, reliable across browsers); its
  // first child is the page <h1>, so screen readers announce from the heading.
  // Skipped on initial mount so we don't steal focus from the skip link.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    mainRef.current?.focus();
  }, [pathname]);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        本文へスキップ
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            A
          </span>
          <span className="brand__name">aidlc-studio</span>
        </div>
        <nav className="nav" aria-label="ワークスペース">
          <p className="nav__heading">Workspace</p>
          <NavItem to="/" end icon={<DiamondIcon />} label="サイクル" />
          <NavItem
            to="/inbox"
            icon={<SparkIcon />}
            label="Inbox"
            count={inboxCount}
          />
          {/* Artifacts / Wiki are framed for v0.0.x (sidebar placeholders). */}
          <span className="nav-item nav-item--disabled" aria-disabled="true">
            <span className="nav-item__icon" aria-hidden="true">
              <ListIcon />
            </span>
            <span className="nav-item__label">Artifacts</span>
          </span>
          <span className="nav-item nav-item--disabled" aria-disabled="true">
            <span className="nav-item__icon" aria-hidden="true">
              <GridIcon />
            </span>
            <span className="nav-item__label">Wiki</span>
          </span>
        </nav>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <div className="topbar__inner">
            <div className="topbar__left">{topbar?.left}</div>
            <div className="topbar__right">{topbar?.right}</div>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1} ref={mainRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
