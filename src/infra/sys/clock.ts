// SystemClock — production Clock backed by the wall clock. Returns a valid
// ISO-8601 Instant via the domain `instant` factory (guarantees the brand
// invariant rather than blindly casting). S7 D-05.
import type { Clock } from "../../app/ports/sys";
import type { Instant } from "../../domain/shared/primitives";
import { instant } from "../../domain/shared/primitives";

export class SystemClock implements Clock {
  now(): Instant {
    const iso = new Date().toISOString();
    const r = instant(iso);
    // toISOString always yields a valid ISO-8601 string; the branch is a guard
    // against an impossible state, not expected control flow.
    if (!r.ok) throw new Error(`SystemClock produced invalid instant: ${iso}`);
    return r.value;
  }
}
