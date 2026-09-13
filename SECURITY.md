# Security Policy

## Supported Versions

This project ships continuously from `main` — there are no maintained
release branches or version tags. Security fixes land on `main` and go out
with the next deploy, so only the latest commit is supported.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately rather than opening a
public issue or PR.

- Preferred: use GitHub's [private vulnerability
  reporting](https://github.com/forrest-keller/everything-is-tuberculosis/security/advisories/new)
  for this repository (Security tab -> Report a vulnerability).
- If that's unavailable, open a regular issue stating that you have a
  security concern and asking for another way to reach the maintainer,
  without including exploit details.

Include as much detail as you can: the affected endpoint or component, steps
to reproduce, and the potential impact. This is a small side project
maintained by one person, so response times are best-effort, but reports
will be acknowledged and addressed as soon as possible.

## Scope

Reports involving the following are especially useful, since they cover
where real user data and trust boundaries live in this app:

- Row Level Security bypass or other issues in the Postgres schema/policies
  ([supabase/migrations](supabase/migrations)).
- Party-code / session handling
  ([src/app/api/party](src/app/api/party)).
- Injection or sanitization issues in fetched Wikipedia article HTML
  ([src/lib/wikipedia.ts](src/lib/wikipedia.ts)).
