import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    globalSetup: ["./vitest.global-setup.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // e2e/** holds Playwright specs (run via `npx playwright test`), which
    // use `test()` from @playwright/test — picking them up here breaks.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    // Tests hit one real, shared local Supabase instance rather than mocks.
    // A few tables have a genuinely global key (daily_challenges is keyed by
    // calendar date, so every file testing "today"'s challenge contends for
    // the same row) — running test files in parallel lets one file's
    // cleanup race another file's fixture setup. Sequential execution trades
    // some wall-clock time for not having to make every test file's use of
    // shared state file-scoped.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/components/ui/**"],
    },
  },
});
