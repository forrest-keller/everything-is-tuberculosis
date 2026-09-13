import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role client talking directly to the real local Supabase instance
 * that vitest.global-setup.ts starts and migrates. Route/lib tests exercise
 * `@/lib/supabase`'s own client (which reads the same env vars), so this is
 * only for arranging fixtures and asserting on DB state — never a
 * replacement for the app's own client in the code under test.
 */
export function getTestServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing local Supabase env vars. Run `npm run supabase:start` (requires Docker) " +
        "or just `npm test`, which starts it automatically via vitest.global-setup.ts.",
    );
  }
  client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return client;
}

type Cleanup = () => Promise<unknown>;
const pendingCleanups: Cleanup[] = [];

function registerCleanup(fn: Cleanup): void {
  pendingCleanups.push(fn);
}

/** For rows created by the route handler under test itself (rather than
 * through one of the insert* fixtures below), e.g. after asserting on a
 * POST /api/party/create response. Deletes `column = value` from `table`. */
export function trackRowForCleanup(table: string, column: string, value: string): void {
  registerCleanup(async () => {
    await getTestServiceClient().from(table).delete().eq(column, value);
  });
}

/** Call from `afterEach` in any test file that uses the fixture helpers below. */
export async function cleanupFixtures(): Promise<void> {
  const fns = pendingCleanups.splice(0, pendingCleanups.length).reverse();
  for (const fn of fns) await fn();
}

function shortCode(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
}

export interface PartySessionRow {
  id: string;
  code: string;
  status: string;
  round_number: number;
  current_start_title: string | null;
  host_player_id: string | null;
}

/** Inserts a party_sessions row directly (bypassing the create-session route,
 * since most route tests want to start from an already-existing session). */
export async function insertPartySession(
  overrides: Partial<Omit<PartySessionRow, "id">> = {},
): Promise<PartySessionRow> {
  const db = getTestServiceClient();
  const { data, error } = await db
    .from("party_sessions")
    .insert({
      code: overrides.code ?? shortCode(),
      status: overrides.status ?? "lobby",
      round_number: overrides.round_number ?? 0,
      current_start_title: overrides.current_start_title ?? null,
      host_player_id: overrides.host_player_id ?? crypto.randomUUID(),
    })
    .select()
    .single<PartySessionRow>();
  if (error) throw error;
  // Cascades to party_players and party_round_results for this session.
  registerCleanup(async () => {
    await db.from("party_sessions").delete().eq("id", data.id);
  });
  return data;
}

export interface PartyPlayerRow {
  id: string;
  session_id: string;
  name: string;
  is_ready: boolean;
}

export async function insertPartyPlayer(
  sessionId: string,
  overrides: Partial<Omit<PartyPlayerRow, "session_id">> = {},
): Promise<PartyPlayerRow> {
  const db = getTestServiceClient();
  const { data, error } = await db
    .from("party_players")
    .insert({
      id: overrides.id ?? crypto.randomUUID(),
      session_id: sessionId,
      name: overrides.name ?? "Test Player",
      is_ready: overrides.is_ready ?? false,
    })
    .select()
    .single<PartyPlayerRow>();
  if (error) throw error;
  // No separate cleanup: deleted by the owning session's cascade.
  return data;
}

export interface PartyRoundResultRow {
  id: string;
  session_id: string;
  round_number: number;
  player_id: string;
  status: string;
  started_at: string;
  clicks: number;
  duration_ms: number;
  path: string[];
}

export async function insertPartyRoundResult(overrides: {
  sessionId: string;
  roundNumber: number;
  playerId: string;
  status?: string;
  clicks?: number;
  durationMs?: number;
  path?: string[];
  startedAt?: string;
}): Promise<PartyRoundResultRow> {
  const db = getTestServiceClient();
  const { data, error } = await db
    .from("party_round_results")
    .insert({
      session_id: overrides.sessionId,
      round_number: overrides.roundNumber,
      player_id: overrides.playerId,
      status: overrides.status ?? "in_progress",
      clicks: overrides.clicks ?? 0,
      duration_ms: overrides.durationMs ?? 0,
      path: overrides.path ?? [],
      started_at: overrides.startedAt ?? new Date(Date.now() - 5_000).toISOString(),
    })
    .select()
    .single<PartyRoundResultRow>();
  if (error) throw error;
  // No separate cleanup: deleted by the owning session's cascade.
  return data;
}

export interface DailyChallengeRow {
  challenge_date: string;
  start_title: string;
  created_at: string;
}

/** Defaults to today (UTC), matching `getOrCreateTodayChallenge`'s notion of
 * "today" — upserted so repeated calls within a test don't collide. */
export async function insertDailyChallenge(
  overrides: Partial<DailyChallengeRow> = {},
): Promise<DailyChallengeRow> {
  const db = getTestServiceClient();
  const challengeDate = overrides.challenge_date ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await db
    .from("daily_challenges")
    .upsert({ challenge_date: challengeDate, start_title: overrides.start_title ?? "Bacteria" })
    .select()
    .single<DailyChallengeRow>();
  if (error) throw error;
  // Cascades to daily_scores for this date.
  registerCleanup(async () => {
    await db.from("daily_challenges").delete().eq("challenge_date", challengeDate);
  });
  return data;
}

export interface DailyScoreRow {
  id: string;
  challenge_date: string;
  player_id: string;
  player_name: string;
  status: string;
  started_at: string;
  clicks: number;
  duration_ms: number;
  path: string[];
}

export async function insertDailyScore(overrides: {
  challengeDate: string;
  playerId?: string;
  playerName?: string;
  status?: string;
  clicks?: number;
  durationMs?: number;
  path?: string[];
  startedAt?: string;
}): Promise<DailyScoreRow> {
  const db = getTestServiceClient();
  const { data, error } = await db
    .from("daily_scores")
    .insert({
      challenge_date: overrides.challengeDate,
      player_id: overrides.playerId ?? crypto.randomUUID(),
      player_name: overrides.playerName ?? "Test Player",
      status: overrides.status ?? "in_progress",
      clicks: overrides.clicks ?? 0,
      duration_ms: overrides.durationMs ?? 0,
      path: overrides.path ?? [],
      started_at: overrides.startedAt ?? new Date(Date.now() - 5_000).toISOString(),
    })
    .select()
    .single<DailyScoreRow>();
  if (error) throw error;
  // No separate cleanup: deleted by the owning challenge's cascade.
  return data;
}

/**
 * Deletes every row from redirect_cache. Some production code paths write to
 * this table fire-and-forget (never awaited, since cache writes are a pure
 * optimization — see wikipedia.ts), so their rows can still land after the
 * test that triggered them has already run its own cleanup. Tests that need
 * the table's exact contents (e.g. a random-row fallback) should call this
 * first rather than trust it's empty.
 */
export async function clearRedirectCache(): Promise<void> {
  const db = getTestServiceClient();
  await db.from("redirect_cache").delete().not("raw_title", "is", null);
}

/** Seeds a redirect_cache row for wikipedia.ts's cache-hit tests. */
export async function insertRedirectCache(
  rawTitle: string,
  canonicalTitle: string,
  resolvedAt: string = new Date().toISOString(),
): Promise<void> {
  const db = getTestServiceClient();
  const { error } = await db
    .from("redirect_cache")
    .upsert({ raw_title: rawTitle, canonical_title: canonicalTitle, resolved_at: resolvedAt });
  if (error) throw error;
  registerCleanup(async () => {
    await db.from("redirect_cache").delete().eq("raw_title", rawTitle);
  });
}
