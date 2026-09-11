# locmotos

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `fprado-dev/locmotos`, driven by the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root.
See `docs/agents/domain.md`.

### Design

The visual spec for Frota and Locatários — tokens, layout, states, component
anatomy — is `docs/design/frota-locatarios.md`, with the prototypes beside it.
Read it before touching a screen. It is a base to adjust, not a contract.

**Every UI component comes from shadcn/ui** (`components/ui/`, Base UI
underneath). What shadcn lacks is composed from its primitives — never written
raw. No hand-styled `<button>`, `<select>` or `<div>` dialog; `pnpm dlx
shadcn@latest add <component>` first. See `docs/adr/0008`.

Colors that carry meaning — green available, red overdue, amber expiring, gray
out of service — are product tokens in `globals.css`. The brand orange lives in
`--primary` and never means a state.

## Supabase

Every change to the Supabase project goes through the **Supabase MCP server**,
never through the CLI: `mcp__supabase__apply_migration` for DDL,
`mcp__supabase__execute_sql` for reads and one-off data fixes. This is
pre-authorized — apply the migration, do not stop to ask.

The CLI is not linked in this clone, so `supabase db push` fails; the MCP also
records the migration version in the remote history, which the CLI would
otherwise leave out of sync.

Two things follow from applying migrations this way:

- The remote picks its own timestamp. Read it back with
  `mcp__supabase__list_migrations` and name the local file in
  `supabase/migrations/` with that exact version, or the next push tries to
  re-apply it.
- The database moves ahead of `main`, before the PR merges. Say so when handing
  the work back, with the SQL that undoes it if the PR is dropped.

After DDL, run `mcp__supabase__get_advisors` with `security` and report
anything new.

## Handing work back

When an issue is closed or code is pushed, end the reply with a **manual test
walkthrough**: the path a person takes to watch the work run, in the browser or
the terminal.

- Exact commands, in run order, including whatever has to be running already.
- What to type and where: the URL, and every field of every form it passes
  through, each with a value ready to paste.
- The expected result at each step, in words that can be checked against the
  screen.
- One failure path: how to make the system refuse, and the message that should
  come back.
- Wherever the automated checks could not reach, so the human eye goes there.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
