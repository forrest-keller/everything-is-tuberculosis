# Everything is Tuberculosis

A Wikipedia link-clicking race game: you land on a random article, and the goal
is always the same — click your way to the **Tuberculosis** article in as few
clicks (and as little time) as possible.

## Modes

- **Solo** (`/solo`) — jump straight into a random article, no name required.
- **Daily Challenge** (`/daily`) — everyone gets the same start article each
  UTC day and competes on a shared leaderboard (fewest clicks wins, time
  breaks ties).
- **Party** (`/party`) — create or join a session with friends; the host
  advances rounds and everyone races from the same start article each round,
  synced live via Supabase Realtime.

## How it works

- Articles are fetched from Wikipedia's REST API
  (`/api/rest_v1/page/html/:title`), then sanitized server-side
  ([src/lib/wikipedia.ts](src/lib/wikipedia.ts)): navboxes, edit links, and
  similar clutter are stripped, and only genuine article links stay
  clickable — citations, external links, and non-article namespaces
  (categories, files, templates, etc.) are disabled.
- A click is a "win" once the fetched article's _canonical_ title (after
  redirects) matches `Tuberculosis`.
- The daily challenge and party mode both persist state in Supabase
  (Postgres + Realtime); schema and RLS policies live in
  [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql).
- Game modes share one core race hook,
  [`useWikiRace`](src/hooks/use-wiki-race.ts), which tracks the current
  article, click count, path, and elapsed time; each mode only differs in how
  the first article is loaded and what happens on a win.

## Tech stack

Next.js (App Router) · React · TypeScript · Tailwind CSS · Supabase
(Postgres, Realtime) · cheerio + sanitize-html for article processing.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Set up Supabase:
   - Create a project at [supabase.com](https://supabase.com).
   - Run [supabase/migrations/0001_initial_schema.sql](supabase/migrations/0001_initial_schema.sql)
     in the Supabase SQL Editor (or `supabase db push` if you've linked the
     project).
   - Create a `.env.local` file with your project's values:

     ```bash
     NEXT_PUBLIC_SUPABASE_URL=your-project-url
     NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
     ```

3. Run the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to play.

## Testing

Tests run against a real local Supabase instance (Postgres + PostgREST +
Realtime) rather than a mocked client, so assertions exercise the same RLS
policies, foreign keys, and constraints production traffic does. This
requires [Docker](https://www.docker.com/products/docker-desktop/) to be
installed and running.

```bash
npm test              # everything: Vitest, then pgTAP, then the Playwright E2E suite
npm run test:unit     # just the Vitest suite (integration tests against Supabase, no browser)
npm run test:watch    # Vitest in watch mode
npm run test:coverage # Vitest once, with a coverage report written to coverage/
```

The first run pulls Supabase's Docker images, which takes a minute; after
that, `vitest.global-setup.ts` reuses the already-running stack. If you'd
rather manage it yourself:

```bash
npm run supabase:start  # boots the local stack (idempotent)
npm run supabase:stop   # tears it down
```

There's also a [pgTAP](https://pgtap.org/) suite
([supabase/tests/database](supabase/tests/database)) that checks the
database's Row Level Security policies directly — the one thing the
service-role-backed Vitest tests above can't cover, since the service role
bypasses RLS entirely. Run it (with the local stack already up) via:

```bash
npm run test:db
```

### End-to-end tests

[Playwright](https://playwright.dev) drives a real Chromium browser against
`next dev`, the same real local Supabase instance, and a small fixture
"Wikipedia" server ([e2e/fixture-wiki-server.mjs](e2e/fixture-wiki-server.mjs))
that serves a fixed, three-article link graph — since the real Wikipedia
hands out a genuinely random start article, a browser test can't reliably
click its way to Tuberculosis otherwise. `WIKI_ORIGIN_OVERRIDE` /
`WME_AUTH_ORIGIN_OVERRIDE` / `WME_API_ORIGIN_OVERRIDE` (see
[playwright.config.ts](playwright.config.ts)) point the server at it instead
of the real Wikipedia/Wikimedia Enterprise APIs.

```bash
npm run test:e2e     # installs browsers once via `npx playwright install chromium`
npm run test:e2e:ui  # same, with Playwright's interactive UI mode
```

Covers full solo/daily/party journeys (party mode drives two browser
contexts to exercise real-time sync between two "players") plus a few
component-focused checks (HowToPlayDialog, GameHeader, ThemeToggle).

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
