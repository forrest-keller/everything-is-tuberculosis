import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export interface LocalSupabaseEnv {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export interface EnsureLocalSupabaseOptions {
  /** Path to a directory containing its own `supabase/` project (config.toml
   * + migrations), passed as the CLI's `--workdir`. Omit to use the
   * project's default `supabase/` at the repo root. A distinct workdir with
   * its own project_id/ports runs as a fully separate set of containers, so
   * e.g. the dev stack and the test stack never share (or wipe) each
   * other's data. */
  workdir?: string;
  /** Reapply every migration against a clean database. Right for tests,
   * which need every run to start from the same schema regardless of what a
   * previous run left behind; wrong for dev, which should keep whatever the
   * developer has built up locally. Defaults to true. */
  reset?: boolean;
}

/**
 * Starts a local Supabase stack (idempotent — a no-op if it's already
 * running), returning its real URL/keys. Requires Docker. Shared by
 * vitest.global-setup.ts, playwright.config.ts, and
 * ensure-local-dev-supabase.mts so dev and both test suites boot the same
 * way, against whichever stack `options.workdir` points at.
 *
 * Uses execSync (always shell-based) rather than execFileSync: on Windows,
 * `npx` resolves to `npx.cmd`, and spawning a `.cmd` file without going
 * through a shell fails with EINVAL.
 */
export function ensureLocalSupabase(options: EnsureLocalSupabaseOptions = {}): LocalSupabaseEnv {
  const { workdir, reset = true } = options;
  const workdirFlag = workdir ? ` --workdir ${workdir}` : "";

  try {
    execSync(`npx supabase start${workdirFlag}`, { stdio: "inherit" });
  } catch (error) {
    throw new Error(
      "Could not start the local Supabase stack (requires Docker to be running). " +
        `Run \`npx supabase start${workdirFlag}\` directly to see the full error.`,
      { cause: error },
    );
  }

  if (reset) {
    execSync(`npx supabase db reset${workdirFlag}`, { stdio: "inherit" });
  }

  const output = execSync(
    `npx supabase status${workdirFlag} -o env ` +
      "--override-name api.url=NEXT_PUBLIC_SUPABASE_URL " +
      "--override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "--override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY",
  ).toString();

  const env: Partial<LocalSupabaseEnv> = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^([A-Z_]+)="(.*)"$/);
    if (match) env[match[1] as keyof LocalSupabaseEnv] = match[2];
  }
  if (
    !env.NEXT_PUBLIC_SUPABASE_URL ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      `Could not parse Supabase env vars from \`supabase status\` output:\n${output}`,
    );
  }

  return env as LocalSupabaseEnv;
}

/** Writes the env vars to a dotenv file. Defaults to the path vitest.setup.ts
 * loads per worker; ensure-local-dev-supabase.mts passes ".env.development.local"
 * instead, which `next dev` loads directly. */
export function writeEnvFile(env: LocalSupabaseEnv, path = ".env.test.local"): void {
  const content = Object.entries(env)
    .map(([key, value]) => `${key}="${value}"`)
    .join("\n");
  writeFileSync(path, content + "\n");
}
