import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export interface LocalSupabaseEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

/**
 * Starts the local Supabase stack (idempotent — a no-op if it's already
 * running) and resets it to a clean, fully-migrated state, returning its
 * real URL/keys. Requires Docker. Shared by vitest.global-setup.ts and
 * playwright.config.ts so both test suites boot the same way.
 *
 * Uses execSync (always shell-based) rather than execFileSync: on Windows,
 * `npx` resolves to `npx.cmd`, and spawning a `.cmd` file without going
 * through a shell fails with EINVAL.
 */
export function ensureLocalSupabase(): LocalSupabaseEnv {
  try {
    execSync("npx supabase start", { stdio: "inherit" });
  } catch (error) {
    throw new Error(
      "Could not start the local Supabase stack (requires Docker to be running). " +
        "Run `npm run supabase:start` directly to see the full error.",
      { cause: error }
    );
  }

  // Reapplies every migration against a clean database so each full test
  // run starts from the same schema, independent of whatever a previous
  // run's tests left behind.
  execSync("npx supabase db reset", { stdio: "inherit" });

  const output = execSync(
    "npx supabase status -o env " +
      "--override-name api.url=NEXT_PUBLIC_SUPABASE_URL " +
      "--override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "--override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY"
  ).toString();

  const env: Partial<LocalSupabaseEnv> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) env[match[1] as keyof LocalSupabaseEnv] = match[2];
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(`Could not parse Supabase env vars from \`supabase status\` output:\n${output}`);
  }

  return env as LocalSupabaseEnv;
}

/** Writes the env vars to a dotenv file vitest.setup.ts loads per worker. */
export function writeEnvFile(env: LocalSupabaseEnv, path = ".env.test.local"): void {
  const content = Object.entries(env)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
  writeFileSync(path, content + "\n");
}
