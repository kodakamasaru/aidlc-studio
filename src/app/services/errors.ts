// ServiceError — the single domain-error → HTTP-status mapping point. Services
// throw `ServiceError`; the HTTP layer (app.onError) catches it and renders the
// `{success:false, error}` envelope with the carried httpStatus. Keeping the
// mapping here (not scattered in routes) means each domain failure maps to one
// status in one place.

/** HTTP statuses the service layer is allowed to surface. */
export type HttpStatus = 400 | 404 | 409 | 500 | 502;

export class ServiceError extends Error {
  readonly httpStatus: HttpStatus;
  readonly code: string;

  constructor(httpStatus: HttpStatus, code: string) {
    super(code);
    this.name = "ServiceError";
    this.httpStatus = httpStatus;
    this.code = code;
  }
}

/** Throw helper: `throw fail(404, "ProjectNotFound")`. */
export const fail = (status: HttpStatus, code: string): ServiceError =>
  new ServiceError(status, code);

export const isServiceError = (e: unknown): e is ServiceError =>
  e instanceof ServiceError;

/**
 * Concise human-readable text from an unknown thrown value — used to enrich a
 * run's `failureReason` so the UI shows the REAL cause of a launch/retry/dispatch
 * failure instead of a generic "Run が失敗しました。".
 */
export const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);
