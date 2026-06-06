// HTTP envelope + body-validation helpers shared by every route module and the
// central error handler. Success → {success:true, data}; failure (rendered in
// app.onError) → {success:false, error}. Body validation rejects missing/blank
// required fields with a 400 ServiceError BEFORE a service is touched.
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { fail } from "../../app/services/errors";

type JsonObject = Record<string, unknown>;

/** Render a success envelope. */
export const ok = <T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
): Response => c.json({ success: true, data }, status);

/** Parse a JSON body into an object, or throw 400 on malformed/non-object input. */
export const readJson = async (c: Context): Promise<JsonObject> => {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    throw fail(400, "InvalidJsonBody");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw fail(400, "InvalidJsonBody");
  }
  return parsed as JsonObject;
};

/** Require a non-empty string field; 400 MissingField:<key> otherwise. */
export const asString = (body: JsonObject, key: string): string => {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw fail(400, `MissingField:${key}`);
  }
  return value.trim();
};

/**
 * Optional string field: undefined when absent; 400 if present but wrong type
 * OR present-but-blank. A present key with only whitespace is an explicit but
 * meaningless value (e.g. blank `name`/`modelName`/`reason`); rejecting it here
 * stops it slipping past validation into a service. Returns the trimmed value.
 */
export const asOptionalString = (
  body: JsonObject,
  key: string,
): string | undefined => {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw fail(400, `InvalidField:${key}`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw fail(400, `InvalidField:${key}`);
  return trimmed;
};

/** Optional string-array field (e.g. taskIds). 400 if present but not string[]. */
export const asOptionalStringArray = (
  body: JsonObject,
  key: string,
): readonly string[] | undefined => {
  const value = body[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw fail(400, `InvalidField:${key}`);
  }
  return value as readonly string[];
};
