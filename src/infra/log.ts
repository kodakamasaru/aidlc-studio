// Minimal server-side error logging. logError writes anomalies to stderr so
// dropped-but-recovered conditions (a missing cycle on a late emission, a bad
// docPath, an unexpected 500) are observable in the resident server's logs.
// This is operational error logging, not debug console.log.
export function logError(context: string, err: unknown): void {
  console.error(`[aidlc-studio] ${context}:`, err);
}

/** Operational info (e.g. startup recovery counts). Not debug console.log. */
export function logInfo(context: string, detail?: unknown): void {
  if (detail === undefined) console.info(`[aidlc-studio] ${context}`);
  else console.info(`[aidlc-studio] ${context}:`, detail);
}
