# Everything is Tuberculosis

A Wikipedia link-clicking race game: you land on a random article, and the goal
is always the same — click your way to the **Tuberculosis** article in as few
clicks (and as little time) as possible.

## Modes

- **Solo** (`/game`) — jump straight into a random article, no name required.
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
- A click is a "win" once the fetched article's *canonical* title (after
  redirects) matches `Tuberculosis`.
- The daily challenge and party mode both persist state in Supabase
  (Postgres + Realtime); schema and RLS policies live in
  [supabase/migrations/0001_daily_and_party.sql](supabase/migrations/0001_daily_and_party.sql).
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
   - Run [supabase/migrations/0001_daily_and_party.sql](supabase/migrations/0001_daily_and_party.sql)
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

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
