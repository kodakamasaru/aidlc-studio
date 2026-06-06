// Shared row deserialization helpers. Every repo stores its aggregate as a JSON
// blob in a `data` column and trusts it on read (the row was serialized from a
// valid aggregate). These two helpers collapse the repeated
// `JSON.parse(row.data) as T` / `rows.map(...)` boilerplate.
//
// A row whose `data` is not parseable JSON is corruption (truncated write, manual
// edit, schema drift): rather than throw an opaque SyntaxError deep in a repo, we
// log it and surface a typed ServiceError(500, "CorruptData") so the failure is
// observable and renders through the standard error envelope.
import { fail } from "../../app/services/errors";
import { logError } from "../log";

type DataRow = { readonly data: string };

function parseData<T>(data: string): T {
  try {
    return JSON.parse(data) as T;
  } catch (err) {
    logError("serde: corrupt row data — JSON.parse failed", err);
    throw fail(500, "CorruptData");
  }
}

export function parseRow<T>(row: DataRow | null | undefined): T | undefined {
  return row ? parseData<T>(row.data) : undefined;
}

export function parseRows<T>(rows: readonly DataRow[]): T[] {
  return rows.map((r) => parseData<T>(r.data));
}
