import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Written by vitest.global-setup.ts, which points these at the real local
// Supabase instance it starts. Loaded per-worker since globalSetup runs in
// its own process and doesn't share `process.env` with test workers.
try {
  process.loadEnvFile(".env.test.local");
} catch {
  // Missing entirely means globalSetup didn't run (e.g. `vitest --run` was
  // invoked in a way that skips it) — tests that touch Supabase will fail
  // with a clear "missing env var" error instead of a silent misconfiguration.
}

afterEach(() => {
  cleanup();
});
