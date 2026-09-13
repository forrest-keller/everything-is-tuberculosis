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

// jsdom doesn't implement scrollTo (it logs a "Not implemented" console
// error) — stub it so components that scroll the page on navigation don't
// spam test output.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

// jsdom doesn't implement matchMedia — next-themes (ThemeProvider/useTheme)
// calls it unconditionally on mount to detect the OS color scheme.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
