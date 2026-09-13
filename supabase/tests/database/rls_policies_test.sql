-- Verifies the security posture described in
-- 0001_initial_schema.sql's "Row Level Security" section, directly against
-- Postgres — independent of any application code, since every route in this
-- app talks to the database with the service-role key (which bypasses RLS
-- entirely) and so never exercises these policies itself. Run via
-- `supabase test db` (see https://supabase.com/docs/guides/database/testing).
begin;
select plan(19);

-- ============ Fixtures ============
-- Inserted as the connecting role (postgres), which owns these tables and
-- so bypasses RLS — same as the app's real service-role client would.

insert into public.daily_challenges (challenge_date, start_title)
values ('2020-01-01', 'Test Article');

insert into public.daily_scores (id, challenge_date, player_id, player_name, status, path)
values
  ('a0000000-0000-0000-0000-000000000001', '2020-01-01', gen_random_uuid(), 'Finished Player', 'finished', '[]'),
  ('a0000000-0000-0000-0000-000000000002', '2020-01-01', gen_random_uuid(), 'Ongoing Player', 'in_progress', '[]');

insert into public.party_sessions (id, code, status)
values ('b0000000-0000-0000-0000-000000000001', 'TESTPG', 'lobby');

insert into public.party_players (id, session_id, name)
values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Finished Player'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'Ongoing Player');

insert into public.party_round_results (id, session_id, round_number, player_id, status, path)
values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 1, 'c0000000-0000-0000-0000-000000000001', 'finished', '[]'),
  ('d0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 1, 'c0000000-0000-0000-0000-000000000002', 'in_progress', '[]');

insert into public.redirect_cache (raw_title, canonical_title)
values ('RLS Test Raw Title', 'RLS Test Canonical Title');

-- ============ RLS is actually turned on ============

select ok((select relrowsecurity from pg_class where oid = 'public.daily_challenges'::regclass), 'daily_challenges has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.daily_scores'::regclass), 'daily_scores has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.party_sessions'::regclass), 'party_sessions has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.party_players'::regclass), 'party_players has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.party_round_results'::regclass), 'party_round_results has RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.redirect_cache'::regclass), 'redirect_cache has RLS enabled');

-- ============ Public reads ============
-- This is a casual, name-only game: anyone (the `anon` role, i.e. an
-- unauthenticated PostgREST request) can read game state, but "finished"
-- attempts are filtered so an in-progress attempt's id/player_id can't be
-- read off the leaderboard and used to hijack it through the navigate routes.

set local role anon;

select isnt_empty(
  $$select 1 from public.party_sessions where id = 'b0000000-0000-0000-0000-000000000001'$$,
  'anon can read party_sessions'
);
select isnt_empty(
  $$select 1 from public.party_players where id = 'c0000000-0000-0000-0000-000000000001'$$,
  'anon can read party_players'
);
select isnt_empty(
  $$select 1 from public.daily_challenges where challenge_date = '2020-01-01'$$,
  'anon can read daily_challenges'
);
select results_eq(
  $$select id from public.party_round_results where session_id = 'b0000000-0000-0000-0000-000000000001' order by id$$,
  $$values ('d0000000-0000-0000-0000-000000000001'::uuid)$$,
  'anon only sees finished party_round_results rows, not in-progress ones'
);
select results_eq(
  $$select id from public.daily_scores where challenge_date = '2020-01-01' order by id$$,
  $$values ('a0000000-0000-0000-0000-000000000001'::uuid)$$,
  'anon only sees finished daily_scores rows, not in-progress ones'
);

reset role;

-- ============ Locked-down writes ============
-- Every mutation (creating a session/player, changing ready state,
-- advancing a round, scoring an attempt) happens exclusively through server
-- routes using the service-role key. None of it should be reachable by a
-- direct PostgREST call using the public anon key.

set local role anon;

-- throws_ok's 3-arg form is (sql, expected_message, description) — matching
-- by SQLSTATE instead needs the 4-arg form with a null message pattern.
select throws_ok(
  $$insert into public.party_sessions (code) values ('HACKED')$$,
  '42501',
  null,
  'anon cannot insert into party_sessions'
);
select throws_ok(
  $$insert into public.party_players (session_id, name) values ('b0000000-0000-0000-0000-000000000001', 'Hacker')$$,
  '42501',
  null,
  'anon cannot insert into party_players'
);
select throws_ok(
  $$insert into public.daily_scores (challenge_date, player_id, player_name) values ('2020-01-01', gen_random_uuid(), 'Hacker')$$,
  '42501',
  null,
  'anon cannot insert into daily_scores'
);
select throws_ok(
  $$insert into public.party_round_results (session_id, round_number, player_id) values ('b0000000-0000-0000-0000-000000000001', 99, 'c0000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'anon cannot insert into party_round_results'
);

-- UPDATE isn't like INSERT: with no update policy, RLS filters party_sessions
-- down to zero visible rows for this command rather than raising an error,
-- so an unauthorized update is silently a no-op instead of an exception —
-- verify that directly, as the owning role, once anon's attempt is done.
update public.party_sessions set status = 'finished' where id = 'b0000000-0000-0000-0000-000000000001';

reset role;

select is(
  (select status from public.party_sessions where id = 'b0000000-0000-0000-0000-000000000001'),
  'lobby',
  'anon cannot actually change party_sessions rows (RLS matches zero rows for the update)'
);

-- ============ redirect_cache: fully locked down ============
-- Server-internal bookkeeping with no legitimate client read or write use —
-- a client-writable redirect map could be poisoned to point an arbitrary
-- title at (or away from) the game's target article.

set local role anon;

select is_empty(
  $$select 1 from public.redirect_cache where raw_title = 'RLS Test Raw Title'$$,
  'anon cannot read redirect_cache'
);
select throws_ok(
  $$insert into public.redirect_cache (raw_title, canonical_title) values ('rls-test-write', 'x')$$,
  '42501',
  null,
  'anon cannot insert into redirect_cache'
);

reset role;

-- ============ The one deliberate client-write exception ============
-- daily_challenges allows a public insert so the first request of the day
-- can create it (see getOrCreateTodayChallenge).

set local role anon;

select lives_ok(
  $$insert into public.daily_challenges (challenge_date, start_title) values ('2020-01-02', 'Anon Inserted')$$,
  'anon can insert into daily_challenges (needed for the first-request-of-the-day path)'
);

reset role;

select * from finish();
rollback;
