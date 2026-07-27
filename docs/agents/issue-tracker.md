# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only — the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

### Local fallback (historical — `gh` is now installed)

**No longer the active path.** `gh` was installed and confirmed working (`gh --version`, `origin` resolves to `brentn/Streams`) as of 2026-07-27 — don't reach for this fallback on new wayfinding work; use the GitHub-native operations above instead. `gh auth login` may still be needed before write operations (`gh issue create`, etc.) will succeed — check `gh auth status` first, and if it reports not logged in, ask the user to run `gh auth login` (interactive) rather than attempting to authenticate a token yourself.

This section is kept for two reasons: (1) existing local artifacts (`.scratch/streams-app/issues/01`–`08`, and any wayfinder map whose `Tracker:` line still says "local fallback") were written against it and remain valid until someone migrates them by hand — see Migrating below; (2) it documents the convention in case `gh` ever becomes unavailable again.

- **Map**: `.scratch/wayfinder/<map-slug>/map.md`, body exactly per the wayfinder map spec (Destination / Notes / Decisions so far / Not yet specified / Out of scope).
- **Child ticket**: `.scratch/wayfinder/<map-slug>/tickets/<nn>-<slug>.md`, numbered sequentially. Header fields in place of GitHub labels/assignee:
  ```markdown
  # <nn> — <title>

  **Type:** wayfinder:<research|prototype|grilling|task>
  **Status:** open | claimed | closed
  **Claimed by:** <none, until claimed>
  **Blocked by:** <none | ticket numbers>

  ## Question

  <the decision or investigation this ticket resolves>

  ## Resolution

  <filled in on close>
  ```
- **Blocking**: the `Blocked by:` line, by ticket number. A ticket is unblocked when every listed blocker's file has `Status: closed`.
- **Frontier query**: list ticket files in `tickets/`, drop any with a `Blocked by:` entry not yet closed or a non-empty `Claimed by:`; first by filename order wins.
- **Claim**: edit the ticket file, set `Status: claimed` and `Claimed by: <session/dev>` — the session's first write.
- **Resolve**: fill in `## Resolution`, set `Status: closed`, then append a context pointer (gist + relative path) to the map's Decisions-so-far.
- **Migrating to GitHub later**: once `gh` is installed, recreate the map and any still-open tickets as real GitHub issues (map gets `wayfinder:map`, tickets get `wayfinder:<type>` + native blocking edges); closed tickets can stay local as history or be copied over as closed issues — no automatic migration exists, so do this by hand.
