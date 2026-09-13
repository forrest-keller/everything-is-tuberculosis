import { ensureLocalSupabase, writeEnvFile } from "./scripts/ensure-local-supabase";

/**
 * Runs once before the whole Vitest run (see vitest.config.mts). Boots the
 * local Supabase stack and writes out its URL/keys so every test worker can
 * point the real `getSupabaseServiceClient()` / `getSupabaseClient()` at it
 * — see src/test/db.ts. Requires Docker; see README/AGENTS for local setup.
 */
export default function setup() {
  const env = ensureLocalSupabase();

  // Written to disk (rather than just set on this process's env) because
  // globalSetup runs in its own process — each test worker loads this file
  // itself in vitest.setup.ts.
  writeEnvFile(env);
}
