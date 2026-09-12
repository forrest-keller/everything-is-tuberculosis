-- Server-authoritative attempt tracking for daily & party scoring.
-- Run this once in the Supabase SQL Editor (or `supabase db push`), after 0001.
--
-- Previously the client submitted a finished score (clicks/duration/path) directly
-- to Supabase with no server validation. Now each play-through is a row that's born
-- "in_progress" the moment a player starts (via a server route) and is only ever
-- advanced to "finished" by that same server, using its own clock and click count.

alter table public.daily_scores
  add column if not exists status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  add column if not exists started_at timestamptz not null default now(),
  alter column clicks set default 0,
  alter column duration_ms set default 0;

alter table public.party_round_results
  add column if not exists status text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  add column if not exists started_at timestamptz not null default now(),
  alter column clicks set default 0,
  alter column duration_ms set default 0;

create index if not exists daily_scores_in_progress_idx
  on public.daily_scores (challenge_date, player_id, status);

-- The browser no longer writes these tables directly — only the server (via the
-- service role key, which bypasses RLS) creates and updates attempt rows. Public
-- read access is untouched so leaderboards still load client-side.
drop policy if exists "public insert daily_scores" on public.daily_scores;
drop policy if exists "public insert party_round_results" on public.party_round_results;
