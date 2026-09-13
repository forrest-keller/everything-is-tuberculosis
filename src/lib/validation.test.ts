import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  parseJsonBody,
  parseQuery,
  requiredBoolean,
  requiredNumber,
  requiredString,
  requiredTrimmedString,
} from "./validation";

describe("requiredString", () => {
  const schema = requiredString("name is required");

  it("accepts a non-empty string", () => {
    expect(schema.parse("Alice")).toBe("Alice");
  });

  it("rejects an empty string with the given message", () => {
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("name is required");
  });

  it("rejects a missing/wrong-typed value with the same message", () => {
    const result = schema.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("name is required");
  });
});

describe("requiredTrimmedString", () => {
  const schema = requiredTrimmedString("bad name", 5);

  it("trims surrounding whitespace", () => {
    expect(schema.parse("  Bob  ")).toBe("Bob");
  });

  it("rejects a string that's empty after trimming", () => {
    const result = schema.safeParse("   ");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("bad name");
  });

  it("rejects a string longer than maxLength", () => {
    const result = schema.safeParse("Alexandria");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("bad name");
  });
});

describe("requiredNumber", () => {
  it("accepts a number and rejects a non-number", () => {
    const schema = requiredNumber("must be a number");
    expect(schema.parse(3)).toBe(3);
    const result = schema.safeParse("3");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("must be a number");
  });
});

describe("requiredBoolean", () => {
  it("accepts a boolean and rejects a non-boolean", () => {
    const schema = requiredBoolean("must be a boolean");
    expect(schema.parse(true)).toBe(true);
    const result = schema.safeParse("true");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("must be a boolean");
  });
});

describe("parseJsonBody", () => {
  const schema = z.object({ name: requiredString("name is required") });

  it("returns the parsed data for a valid body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "Alice" }),
    });
    const result = await parseJsonBody(request, schema);
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({ name: "Alice" });
  });

  it("returns a 400 response describing the first failure for an invalid body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ name: "" }),
    });
    const result = await parseJsonBody(request, schema);
    expect(result.data).toBeUndefined();
    expect(result.error?.status).toBe(400);
    const body = await result.error?.json();
    expect(body).toEqual({ error: "name is required" });
  });

  it("treats an unparseable body as {} rather than throwing", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "not json",
    });
    const result = await parseJsonBody(request, schema);
    expect(result.error?.status).toBe(400);
  });
});

describe("parseQuery", () => {
  const schema = z.object({ title: requiredString("title is required") });

  it("returns the parsed data for valid query params", () => {
    const result = parseQuery(new URLSearchParams({ title: "Tuberculosis" }), schema);
    expect(result.data).toEqual({ title: "Tuberculosis" });
  });

  it("returns a 400 response when a required param is missing", async () => {
    const result = parseQuery(new URLSearchParams(), schema);
    expect(result.data).toBeUndefined();
    expect(result.error?.status).toBe(400);
    const body = await result.error?.json();
    expect(body).toEqual({ error: "title is required" });
  });
});
