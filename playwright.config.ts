import { defineConfig, devices } from "@playwright/test";
import { ensureLocalSupabase } from "./scripts/ensure-local-supabase";

const APP_PORT = 3100;
const FIXTURE_WIKI_PORT = 4310;
const FIXTURE_WIKI_ORIGIN = `http://127.0.0.1:${FIXTURE_WIKI_PORT}`;

// Runs synchronously as the config loads (before any test or webServer
// starts), same as vitest.global-setup.ts — see that file and
// scripts/ensure-local-supabase.ts for why. Daily/party mode both persist
// real state in Supabase, so E2E needs the same real local instance the
// Vitest integration suite uses.
const supabaseEnv = ensureLocalSupabase();

export default defineConfig({
  testDir: "./e2e",
  // The party mode spec drives two browser contexts against one shared
  // session — keeping the whole run single-worker avoids that colliding
  // with another spec file's session/round state on the same DB.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/fixture-wiki-server.mjs",
      url: `${FIXTURE_WIKI_ORIGIN}/__health`,
      env: { FIXTURE_WIKI_PORT: String(FIXTURE_WIKI_PORT) },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
    },
    {
      // next dev, not a production build: NEXT_PUBLIC_* vars get baked into
      // a production build at build time, which would leave a real `next
      // build` output pinned to these fixture values.
      command: `npx next dev -p ${APP_PORT}`,
      url: `http://127.0.0.1:${APP_PORT}`,
      env: {
        ...supabaseEnv,
        WIKI_ORIGIN_OVERRIDE: FIXTURE_WIKI_ORIGIN,
        WME_AUTH_ORIGIN_OVERRIDE: FIXTURE_WIKI_ORIGIN,
        WME_API_ORIGIN_OVERRIDE: FIXTURE_WIKI_ORIGIN,
        WIKIMEDIA_ENTERPRISE_USERNAME: "e2e-test",
        WIKIMEDIA_ENTERPRISE_PASSWORD: "e2e-test",
        WIKI_USER_AGENT_CONTACT_URL: "https://example.com/e2e-test",
        WIKI_USER_AGENT_CONTACT_EMAIL: "e2e-test@example.com",
      },
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      timeout: 60_000,
    },
  ],
});
