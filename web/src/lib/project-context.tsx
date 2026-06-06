// ProjectContext — resolves the single active project (v0 is single-project) and
// tracks the open-inbox count for the nav badge. Screens read the active project
// id; the inbox count is refreshable so answering a card updates the badge.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type Project } from "./api";
import { logError } from "./log";

interface ProjectContextValue {
  readonly project: Project | undefined;
  readonly status: "loading" | "ready" | "empty" | "error";
  readonly error: unknown;
  readonly inboxCount: number;
  readonly reloadProject: () => void;
  readonly refreshInbox: () => void;
  readonly adoptProject: (project: Project) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project | undefined>(undefined);
  const [status, setStatus] = useState<ProjectContextValue["status"]>("loading");
  const [error, setError] = useState<unknown>(undefined);
  const [inboxCount, setInboxCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  const reloadProject = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setError(undefined);
    api
      .listProjects()
      .then((projects) => {
        if (!alive) return;
        const first = projects[0];
        if (first) {
          setProject(first);
          setStatus("ready");
        } else {
          setProject(undefined);
          setStatus("empty");
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err);
        setStatus("error");
      });
    return () => {
      alive = false;
    };
  }, [nonce]);

  const refreshInbox = useCallback(() => {
    if (!project) {
      setInboxCount(0);
      return;
    }
    api
      .listInbox(project.id)
      .then((qs) => setInboxCount(qs.length))
      .catch((err: unknown) => {
        // Badge is best-effort (the Inbox screen surfaces real errors), but the
        // failure should still be observable rather than silently swallowed.
        logError("refreshInbox: badge count failed", err);
      });
  }, [project]);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  const adoptProject = useCallback((p: Project) => {
    setProject(p);
    setStatus("ready");
  }, []);

  const value = useMemo<ProjectContextValue>(
    () => ({
      project,
      status,
      error,
      inboxCount,
      reloadProject,
      refreshInbox,
      adoptProject,
    }),
    [project, status, error, inboxCount, reloadProject, refreshInbox, adoptProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjectContext must be used within ProjectProvider");
  return ctx;
}
