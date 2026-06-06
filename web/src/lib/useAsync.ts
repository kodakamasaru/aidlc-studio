// useAsync — run an async factory, exposing {status,data,error,reload}. Keeps a
// monotonic request id so a stale resolve can't clobber a newer one. Re-runs
// when any dep changes. Used by every screen for fetch loading/error states.
//
// Closure contract: the effect intentionally re-runs ONLY on the caller-provided
// `deps` (plus the internal reload nonce), NOT on `factory` identity — callers
// pass an inline arrow each render, so keying on it would loop. Instead the
// latest `factory` is held in a ref and invoked from the effect, so a re-run
// always calls the freshest closure while staying gated by `deps`. Callers MUST
// therefore list every value the factory closes over in `deps`.
import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncStatus = "loading" | "success" | "error";

export interface AsyncResult<T> {
  readonly status: AsyncStatus;
  readonly data: T | undefined;
  readonly error: unknown;
  readonly reload: () => void;
}

export function useAsync<T>(
  factory: () => Promise<T>,
  deps: readonly unknown[],
): AsyncResult<T> {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const reqRef = useRef(0);
  const [nonce, setNonce] = useState(0);

  // Always invoke the freshest factory from the effect without making it a dep
  // (see closure contract above): re-runs are gated by `deps` + `nonce` only.
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const reqId = ++reqRef.current;
    setStatus("loading");
    setError(undefined);
    factoryRef
      .current()
      .then((value) => {
        if (reqRef.current !== reqId) return;
        setData(value);
        setStatus("success");
      })
      .catch((err: unknown) => {
        if (reqRef.current !== reqId) return;
        setError(err);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { status, data, error, reload };
}
