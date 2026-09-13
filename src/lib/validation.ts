import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";

/**
 * A required string field that reports the same message whether the value is
 * missing, empty, or the wrong type — matching the old
 * `typeof x === "string" ? x : ""` + falsy-check pattern this replaces.
 */
export function requiredString(message: string): z.ZodString {
  return z.string({ error: message }).min(1, message);
}

/** Like requiredString, but trims surrounding whitespace before checking length. */
export function requiredTrimmedString(message: string, maxLength: number): z.ZodString {
  return z.string({ error: message }).trim().min(1, message).max(maxLength, message);
}

/**
 * Like requiredString, but also requires the value to be a valid UUID —
 * for fields (playerId, hostPlayerId) backed by a Postgres `uuid` column,
 * so a malformed id is rejected as a 400 here instead of reaching Postgres
 * and surfacing as a raw 500.
 */
export function requiredUuid(message: string): z.ZodUUID {
  return z.uuid({ error: message });
}

export function requiredNumber(message: string): z.ZodNumber {
  return z.number({ error: message });
}

export function requiredBoolean(message: string): z.ZodBoolean {
  return z.boolean({ error: message });
}

type ParsedBody<T> = { data: T; error?: undefined } | { data?: undefined; error: NextResponse };

/**
 * Parses a request's JSON body against `schema`, returning either the typed
 * data or a ready-to-return 400 response describing the first validation
 * failure. A missing or unparseable body is treated as `{}` so required-field
 * checks produce the usual 400 rather than throwing.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ParsedBody<T>> {
  const body = await request.json().catch(() => ({}));
  return toParsedBody(schema.safeParse(body));
}

/** Same as parseJsonBody, for a URLSearchParams-derived query string (GET routes). */
export function parseQuery<T>(searchParams: URLSearchParams, schema: ZodType<T>): ParsedBody<T> {
  return toParsedBody(schema.safeParse(Object.fromEntries(searchParams)));
}

function toParsedBody<T>(result: ReturnType<ZodType<T>["safeParse"]>): ParsedBody<T> {
  if (!result.success) {
    return { error: NextResponse.json({ error: result.error.issues[0].message }, { status: 400 }) };
  }
  return { data: result.data };
}
