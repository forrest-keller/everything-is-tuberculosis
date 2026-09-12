-- Everything is Tuberculosis: daily challenge + party mode schema
-- Run this once in the Supabase SQL Editor (or `supabase db push` if you link the project).

create extension if not exists pgcrypto;

-- ============ Daily Challenge ============

create table if not exists public.daily_challenges (
  challenge_date date primary key,
  start_title text not null,
  created_at timestamptz not null default now()
);

-- A row is a server-tracked play-through: born "in_progress" the moment a
-- player starts (via a server route, which stamps started_at itself) and
-- only ever advanced to "finished" by that same server, using its own clock
-- and click count. The client never writes clicks/duration/path directly.
create table if not exists public.daily_scores (
  id uuid primary key default gen_random_uuid(),
  challenge_date date not null references public.daily_challenges (challenge_date) on delete cascade,
  player_id uuid not null,
  player_name text not null check (char_length(player_name) between 1 and 32),
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  started_at timestamptz not null default now(),
  clicks integer not null default 0 check (clicks >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  path jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists daily_scores_leaderboard_idx
  on public.daily_scores (challenge_date, clicks asc, duration_ms asc);
create index if not exists daily_scores_in_progress_idx
  on public.daily_scores (challenge_date, player_id, status);

-- ============ Party mode ============

create table if not exists public.party_sessions (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'round_results', 'finished')),
  round_number integer not null default 0,
  current_start_title text,
  host_player_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.party_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.party_sessions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now()
);

create index if not exists party_players_session_idx on public.party_players (session_id);

-- Same server-tracked-attempt shape as daily_scores, keyed per round instead
-- of per challenge_date.
create table if not exists public.party_round_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.party_sessions (id) on delete cascade,
  round_number integer not null,
  player_id uuid not null references public.party_players (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  started_at timestamptz not null default now(),
  clicks integer not null default 0 check (clicks >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  path jsonb not null default '[]'::jsonb,
  finished_at timestamptz not null default now(),
  unique (session_id, round_number, player_id)
);

create index if not exists party_round_results_lookup_idx
  on public.party_round_results (session_id, round_number);

-- ============ Redirect cache (src/lib/wikipedia.ts) ============
-- Caches redirect-title lookups so repeat clicks on the same redirect-titled
-- link skip the free public MediaWiki API.

create table if not exists public.redirect_cache (
  raw_title text primary key,
  canonical_title text not null,
  resolved_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists party_sessions_set_updated_at on public.party_sessions;
create trigger party_sessions_set_updated_at
  before update on public.party_sessions
  for each row execute function public.set_updated_at();

-- ============ Row Level Security ============
-- This is a casual, name-only game with no Supabase Auth, so most policies
-- are intentionally permissive (anyone can read/write game state). Don't put
-- anything sensitive in these tables.
--
-- daily_scores and party_round_results are the exception: those rows are
-- created and updated exclusively by server routes using the service-role
-- key (which bypasses RLS), so the browser gets read-only access to them —
-- otherwise a client could just insert a fabricated score directly.
--
-- redirect_cache is locked down further still: it's server-internal
-- bookkeeping with no legitimate client read or write use, so it gets no
-- public policies at all. A client-writable redirect map could be poisoned
-- to point an arbitrary title at (or away from) the game's target article.

alter table public.daily_challenges enable row level security;
alter table public.daily_scores enable row level security;
alter table public.party_sessions enable row level security;
alter table public.party_players enable row level security;
alter table public.party_round_results enable row level security;
alter table public.redirect_cache enable row level security;

drop policy if exists "public read daily_challenges" on public.daily_challenges;
create policy "public read daily_challenges" on public.daily_challenges for select using (true);
drop policy if exists "public insert daily_challenges" on public.daily_challenges;
create policy "public insert daily_challenges" on public.daily_challenges for insert with check (true);

drop policy if exists "public read daily_scores" on public.daily_scores;
create policy "public read daily_scores" on public.daily_scores for select using (true);

drop policy if exists "public read party_sessions" on public.party_sessions;
create policy "public read party_sessions" on public.party_sessions for select using (true);
drop policy if exists "public insert party_sessions" on public.party_sessions;
create policy "public insert party_sessions" on public.party_sessions for insert with check (true);
drop policy if exists "public update party_sessions" on public.party_sessions;
create policy "public update party_sessions" on public.party_sessions for update using (true) with check (true);

drop policy if exists "public read party_players" on public.party_players;
create policy "public read party_players" on public.party_players for select using (true);
drop policy if exists "public insert party_players" on public.party_players;
create policy "public insert party_players" on public.party_players for insert with check (true);
drop policy if exists "public update party_players" on public.party_players;
create policy "public update party_players" on public.party_players for update using (true) with check (true);

drop policy if exists "public read party_round_results" on public.party_round_results;
create policy "public read party_round_results" on public.party_round_results for select using (true);

-- ============ Realtime ============
-- Lets clients subscribe to live changes for a party session (lobby joins,
-- ready-up toggles, round results, session status transitions).

alter publication supabase_realtime add table public.party_sessions;
alter publication supabase_realtime add table public.party_players;
alter publication supabase_realtime add table public.party_round_results;
