import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureLocalSupabase, writeEnvFile } from "./ensure-local-supabase.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const devWorkdir = "supabase-dev";

/**
 * `supabase start --workdir` requires an existing `<workdir>/supabase/`
 * project (config.toml + migrations) — the CLI won't create one. Rather than
 * hand-maintain a second copy that can drift from the real project, this
 * derives it from `supabase/` on every run: same config, only `project_id`
 * and every `543xx` port bumped to `553xx`, so the dev stack runs as
 * separate Docker containers/volumes from the test stack (supabase/config.toml)
 * and never shares or wipes its data. Migrations are copied straight over so
 * `db reset`/first boot applies the same schema.
 */
function ensureDevWorkdir(): void {
  const srcDir = join(repoRoot, "supabase");
  const destDir = join(repoRoot, devWorkdir, "supabase");
  mkdirSync(destDir, { recursive: true });

  const config = readFileSync(join(srcDir, "config.toml"), "utf8")
    .replace(
      'project_id = "everything-is-tuberculosis"',
      'project_id = "everything-is-tuberculosis-dev"',
    )
    .replace(/\b543(\d\d)\b/g, "553$1");
  writeFileSync(join(destDir, "config.toml"), config);

  cpSync(join(srcDir, "migrations"), join(destDir, "migrations"), { recursive: true });
}

const reset = process.argv.includes("--reset");

ensureDevWorkdir();
const env = ensureLocalSupabase({ workdir: devWorkdir, reset });
writeEnvFile(env, ".env.development.local");
