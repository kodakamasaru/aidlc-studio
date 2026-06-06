// TopbarSlot — lets each screen render its own crumb/title + right-aligned
// actions into the fixed topbar without the shell knowing screen specifics.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface TopbarContent {
  readonly left: ReactNode;
  readonly right?: ReactNode;
}

interface TopbarStore {
  readonly content: TopbarContent | null;
  readonly setContent: (c: TopbarContent | null) => void;
}

const TopbarContext = createContext<TopbarStore | null>(null);

export function TopbarProvider({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<TopbarContent | null>(null);
  return (
    <TopbarContext.Provider value={{ content, setContent }}>
      {children}
    </TopbarContext.Provider>
  );
}

function useTopbarStore(): TopbarStore {
  const ctx = useContext(TopbarContext);
  if (!ctx) throw new Error("Topbar used outside provider");
  return ctx;
}

export function useTopbarContent(): TopbarContent | null {
  return useTopbarStore().content;
}

/** Screens call this with their topbar content; cleared on unmount. */
export function useSetTopbar(content: TopbarContent, deps: readonly unknown[]): void {
  const { setContent } = useTopbarStore();
  useEffect(() => {
    setContent(content);
    return () => setContent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
