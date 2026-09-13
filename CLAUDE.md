@AGENTS.md

# Code comments

Write comments that explain _why_, not _what_. Well-named identifiers and
clear code already say what a line does — a comment repeating that adds noise
without adding information.

Before adding a comment, ask whether it does one of these; if not, cut it:

- Explains a non-obvious rationale: a security or RLS decision, a race
  condition or concurrency guard, a legal/licensing requirement.
- Documents a magic number, error code, or config value that isn't
  self-explanatory (e.g. Postgres `23505`, a TTL, a retry budget).
- Calls out a browser, library, or platform quirk that the code works around.
- Flags a deliberate tradeoff a future reader might otherwise "fix" back into
  a bug (e.g. an intentionally narrow `useEffect` dependency array).

Cut a comment when it:

- Restates the next line or block in prose (e.g. a one-line label right above
  an assertion or call whose name already says what it does).
- Duplicates a docstring, type, or file header that already covers it.
- Narrates a test step that's already obvious from the assertion being made.

This repo leans on the first kind of comment throughout (see
`src/lib/wikipedia.ts`, `src/app/api/party/[code]/join/route.ts`, and
`supabase/migrations/0001_initial_schema.sql`) — match that style rather than
adding narration around it.
