// Minimal client-side error logging. logError writes recovered/best-effort
// anomalies (a swallowed fetch error, a malformed response) to the browser
// console so they are observable in devtools instead of silently discarded.
// This is operational error logging, not debug console.log.
export function logError(context: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.error(`[aidlc-studio] ${context}:`, err);
}
