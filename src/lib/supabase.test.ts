import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each function memoizes its client in a module-level variable, so every test
// that cares about the "missing env var" path needs a fresh module instance —
// otherwise an earlier test's successfully-created client would just be
// returned again without re-checking env vars.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSupabaseClient", () => {
  it("throws when the URL/key env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const { getSupabaseClient } = await import("./supabase");
    expect(() => getSupabaseClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("returns the same memoized client on repeated calls", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-key");
    const { getSupabaseClient } = await import("./supabase");
    expect(getSupabaseClient()).toBe(getSupabaseClient());
  });
});

describe("getSupabaseServiceClient", () => {
  it("throws when the URL/service-role-key env vars are missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { getSupabaseServiceClient } = await import("./supabase");
    expect(() => getSupabaseServiceClient()).toThrow(/Missing NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("returns the same memoized client on repeated calls", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    const { getSupabaseServiceClient } = await import("./supabase");
    expect(getSupabaseServiceClient()).toBe(getSupabaseServiceClient());
  });
});
