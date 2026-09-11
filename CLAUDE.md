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
