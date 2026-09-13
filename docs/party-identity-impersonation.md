# Party mode: player/host impersonation via unauthenticated playerId

Every mutating Party-mode route
([src/app/api/party/[code]/ready/route.ts](../src/app/api/party/[code]/ready/route.ts),
[.../advance/route.ts](../src/app/api/party/[code]/advance/route.ts),
[.../attempt/route.ts](../src/app/api/party/[code]/attempt/route.ts),
[.../attempt/navigate/route.ts](../src/app/api/party/[code]/attempt/navigate/route.ts))
trusts a client-supplied `playerId` in the JSON body as proof of identity, with
no cookie, token, or other possession check behind it. Combined with the read
policies below, this lets anyone with a room code act as any player in that
room, including the host. This documents the hole and the options for closing
it — not a decision made yet.

## Current state

- `playerId` is a `crypto.randomUUID()` generated client-side and stored in
  `localStorage` ([src/lib/player-identity.ts](../src/lib/player-identity.ts)).
  It never leaves the browser except as a plain value in request bodies —
  there is nothing tying a given HTTP request to the browser that originally
  created that id.
- `party_sessions` and `party_players` are both fully public-read
  (`for select using (true)` in
  [supabase/migrations/0001_initial_schema.sql:146-154](../supabase/migrations/0001_initial_schema.sql#L146-L154)),
  and [src/lib/party.ts](../src/lib/party.ts) fetches them with `select("*")`
  directly from the browser via the anon key — `fetchPartySessionByCode`
  (exposes `host_player_id`) and `fetchPartyPlayers` (exposes every
  `party_players.id`) run before a visitor has even joined the room.
- The game's win condition ("navigate to Tuberculosis") is public knowledge —
  printed in the rules UI ([src/lib/rules.ts:30](../src/lib/rules.ts#L30)) —
  so an attacker doesn't need to discover a secret target to forge a winning
  move.
- `join`'s route comment already flags this model explicitly and defends the
  one case it can — an upsert-by-id would let a client's join request
  reassign an existing player row out from under its real owner, so `join`
  does an update-then-insert instead
  ([src/app/api/party/[code]/join/route.ts:36-43](../src/app/api/party/[code]/join/route.ts#L36-L43)).
  No equivalent guard exists on `ready`, `advance`, `attempt`, or
  `attempt/navigate`, because there's no secret to check them against.

## Attack scenarios

All of these require only the room code (shared for legitimate play) and one
read of the public `party_players`/`party_sessions` data — no credentials,
no timing, no race:

1. **Ready-state griefing.** `POST /ready` with another player's id flips
   their ready state, e.g. forcing an early round-advance vote or stalling
   one indefinitely.
2. **Attempt hijack / forced finish.** `POST /attempt/navigate` with another
   player's id and `title: "Tuberculosis"` stamps a fake, premature
   `duration_ms` onto their in-progress attempt
   ([attempt/navigate/route.ts:52-58](../src/app/api/party/[code]/attempt/navigate/route.ts#L52-L58)),
   corrupting their leaderboard result or forcing a "win" they didn't play.
3. **Host impersonation.** `advance`'s only host check is
   `session.host_player_id !== playerId`
   ([advance/route.ts:30-33](../src/app/api/party/[code]/advance/route.ts#L30-L33)).
   Since `host_player_id` is readable by anyone who loads the room, any
   visitor can start the game or force the next round without being — or
   ever having been — the host.

## Why this is broken access control, not just "no accounts"

The app's design deliberately has no real accounts, and that's a reasonable
choice for a casual, name-only game — see the RLS comment block in
[0001_initial_schema.sql:103-129](../supabase/migrations/0001_initial_schema.sql#L103-L129).
The gap isn't the absence of accounts; it's that the _existing_ identity
concept (`playerId`) is asserted by the caller and independently readable by
every other caller, so it authenticates nothing. A party member should be
able to prove "I am the browser that joined as this player" without the app
needing to know who they are in any durable sense.

## Options

### A. Per-player session secret (cookie)

On `join`, generate a random secret server-side, store it alongside the
player row (a new `party_players.session_secret` column, never exposed by
the public `select` policy), and set it as an `HttpOnly`, `SameSite=Lax`
cookie scoped to `/party/[code]`. Every mutating route then reads the secret
from the cookie and checks it against the row for the `playerId` in the
body, instead of trusting `playerId` alone.

- No new dependency; fits the existing service-role-route pattern.
- `playerId` stays as the public row identifier (used for display, realtime
  diffing); the secret is the new, unexposed possession proof.
- Requires a migration (new column, still excluded from the public `select`
  policy) and touches every mutating route's request handling.
- Cookies mean the browser handles attachment automatically — no client-side
  plumbing beyond what already exists.

### B. Bearer token returned from join, held in memory/localStorage

Same secret concept as A, but returned in `join`'s JSON response and sent
back as `Authorization: Bearer <token>` (or a body field) on subsequent
calls instead of a cookie.

- Same server-side shape as A (new column, per-route check).
- Avoids cookie scoping/SameSite considerations, at the cost of the client
  needing to thread the token through every one of
  [src/lib/party.ts](../src/lib/party.ts)'s fetch calls explicitly.
- `localStorage` storage means the token survives a refresh the same way
  `playerId` already does today.

### C. Restrict the public read policies instead

Stop returning `host_player_id` and other players' `id`s to anyone who
hasn't joined, and/or move those reads behind a service-role route that can
apply its own authorization. This narrows _reconnaissance_ but doesn't fix
the underlying problem: once a player has legitimately joined (which
requires no proof of anything either), they still learn every other
player's id and the host's id through normal gameplay (the player list and
realtime feed are core UI), so impersonation among people already in the
room is untouched. Worth doing regardless of A/B, as defense in depth, not
as a standalone fix.

## Recommendation

Option A (HttpOnly cookie) is the more robust fix — it can't be read or
exfiltrated by client-side JS, and it matches the "server routes are
authoritative" pattern already used for writes throughout this schema (see
the RLS comment block). Option B is simpler to reason about if cookie
scoping across `/party/[code]` for many rooms turns out to be awkward, at
the cost of explicit token plumbing on the client. Option C should happen
alongside whichever of A/B is chosen, not instead of it.

## Open decisions

- **Is this worth fixing before the app sees real traffic?** The impact is
  griefing within a casual, accountless game — no PII or payment data is at
  risk — but it is a complete authorization bypass, and the fix is
  self-contained to Party mode's routes and one migration.
- **Cookie vs. bearer token** — depends on how much client-side plumbing
  (option B) is acceptable versus adding cookie-scoping logic per room code
  (option A).
- **Daily mode has a narrower version of the same shape** (`playerId` in
  [src/app/api/daily/attempt/[id]/navigate/route.ts](../src/app/api/daily/attempt/[id]/navigate/route.ts)
  is also caller-asserted), but the blast radius is smaller — an attacker
  needs both the per-attempt `id` (a UUID never listed publicly, since
  `daily_scores`' read policy only exposes `status = 'finished'` rows) and
  the matching `playerId`. Worth the same fix for consistency, but lower
  priority than Party mode.
