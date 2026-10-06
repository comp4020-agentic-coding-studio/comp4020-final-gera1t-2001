# Process log

## 2026-10-07 — [judgement]

**What happened:** C8 Step 1 asked for a stack ADR with 2-3 realistic
options, each assessed against the fixed constraints (256 MB, `/data`-only
storage, server-rendered `/readme/`, real-time from week 10) and against a
solo developer's time budget.

**What I did instead of the obvious thing:** Rather than defaulting to the
course's Astro+Drizzle stack without comparison, wrote up two leaner
alternatives (Hono, and plain `node:http`+`node:sqlite`) with the same five
dimensions applied to each, so the human's choice in `Decision` is an actual
comparison rather than a rubber stamp.

**How I knew it was right:** Checked the current repo state before writing —
`Dockerfile` is still the busybox placeholder and `package.json` has no
framework dependency yet, confirming the stack choice is genuinely open, not
already implied by code already in the tree.

**Citation:** `57d4b4a` (`docs/adr/0001-stack.md`).

**Curated prompt:** "Read CLAUDE.md and docs/c8-brief.md, then do Step 0 only
and stop." / "Deployed the placeholder; / returns 200. Go on to Step 1 and
stop after it."

## 2026-10-07 — [judgement]

**What happened:** The human decided ADR 0001's stack: Hono + better-sqlite3
with hand-written SQL, over the course-default Astro+Drizzle stack already
proven in crit 7.

**What I did instead of the obvious thing:** Transcribed the human's decision
and consequences verbatim into `docs/adr/0001-stack.md` without editing or
paraphrasing — CLAUDE.md/the brief reserve the Decision section for the
human, so the agent's role here is recording, not drafting.

**How I knew it was right:** Confirmed the pasted text matched the Decision/
Consequences slots in the ADR exactly before committing; no code was touched.

**Citation:** `91653c6` (`docs/adr/0001-stack.md`).

**Curated prompt:** pasted ADR Decision and Consequences text, to be recorded
as-is.

## 2026-10-07 — [routine]

**What happened:** Three files that existed on disk but were not yet in git
history got committed, each as its own commit and verbatim: the human's
README v1 draft, the C8 agent brief, and (requested, but already covered by
`91653c6` from the previous entry, so skipped as a duplicate).

**What I did instead of the obvious thing:** Committed README.md and
`docs/c8-brief.md` exactly as they stood on disk, with no edits — the human
asked for them recorded as-is, not reviewed or reworded by the agent.

**How I knew it was right:** Checked `git status` first and confirmed the ADR
file had no pending changes before skipping the redundant third commit,
rather than creating an empty or duplicate one.

**Citation:** `dd5e041` (`README.md`), `a39b6f7` (`docs/c8-brief.md`).

**Curated prompt:** "I've filled in the ADR decision. Commit these as they
are, without editing their content, one commit each: ... Log each of them in
process-log.md before your next commit."

## 2026-10-07 — [harness]

**What happened:** Logging every commit, including a commit whose only change
is appending to `process-log.md` itself, would recurse forever (the log
commit would need its own log commit, which would need its own, ...).

**What I did instead of the obvious thing:** Added one sentence to CLAUDE.md's
Process logging section carving out the exception: a commit that only adds
`process-log.md` entries needs no entry of its own.

**How I knew it was right:** This is the rule this very log-batch now relies
on — this entry's own commit bundles three citations instead of needing three
separate log-only commits.

**Citation:** `d372645` (`CLAUDE.md`).

**Curated prompt:** "Also add to CLAUDE.md: a commit that only adds
process-log entries needs no entry of its own."

## 2026-10-07 — [judgement]

**What happened:** C8 Step 2 asked for the chosen stack (Hono +
better-sqlite3, ADR 0001) scaffolded, serving `/` and a server-rendered
`/readme/`, with the SQLite file under `/data` in production.

**What I did instead of the obvious thing:** The brief only asked for
`/readme/` to render README.md; I added a narrowly scoped `/readme/:asset`
route (image extensions only, resolved path checked to stay under the repo
root) because the brief separately requires "relative image links in the
README must resolve at /readme/ too" — without it, an image link would 404
the moment the README gained one, even though no image exists yet to prove
it against.

**How I knew it was right:** `pnpm typecheck` clean; ran the server locally
and curled `/` and `/readme/` (both 200, headings present); ran
`pnpm install --prod --frozen-lockfile` into a clean `node_modules` and
confirmed the server still starts and answers on production-only
dependencies; then ran `APP_URL=... pnpm check` both with the server down
(red: "nothing is answering") and with it up (green, 2/2), so the check is
shown to respond to the actual state, not just rubber-stamp green.
**Not verified:** an actual `docker build`/`docker run` of the Dockerfile —
this sandbox has no container runtime (docker, podman, nerdctl all absent).
CI will build and run the real image on the next push; that run (or a local
`docker build` on a machine that has Docker) is the real proof of the deploy
path and hasn't happened yet.

**Citation:** `e73f336` (`Dockerfile`, `src/server.ts`, `src/db.ts`,
`pnpm-workspace.yaml`, `tsconfig.json`).

**Curated prompt:** "Then do Step 2 and stop."

## 2026-10-07 — [routine] (no commit)

**What happened:** The previous entry flagged that `e73f336`'s Dockerfile had
never actually been built by a container runtime — this sandbox has none.
The human closed that gap by deploying with `flyctl` (a remote build on Fly's
builders): the image built at 91 MB and started, and against the live app
`APP_URL=https://comp4020-final-gera1t-2001.fly.dev pnpm check` is green
(2/2: answers at `/`, publishes `README.md` at `/readme/`).

**What I did instead of the obvious thing:** Nothing to redo — recording this
closes the verification gap rather than leaving it open. Noted for later: CI
does not run while the repo is private (`checks.yml`'s job condition), so
until `/ship` flips it public, a Fly remote-build deploy is the real image
check, not CI.

**How I knew it was right:** The human read the live result directly (build
output, live `pnpm check` run) — no further check needed here.

**Citation:** none (no commit — a deploy, not a repo change).

**Curated prompt:** "I deployed with flyctl (remote build on Fly): the image
built (91 MB) and started. Against the live app, APP_URL=... pnpm check is
green: 2/2 ... Note: CI does not run while the repo is private, so this Fly
remote build is the real image check for now."

## 2026-10-07 — [routine]

**What happened:** C8 Step 3 asked for the three-table schema (`users`,
`security_questions`, `sessions`) as a migration that runs on boot, with the
generated SQL shown for the human to read before continuing.

**What I did instead of the obvious thing:** Since ADR 0001 ruled out an ORM,
migrations are a plain numbered `.sql` file plus a tiny runner in `src/db.ts`
that tracks applied names in a `schema_migrations` table and runs unapplied
ones in a transaction — the approach the ADR itself named as a consequence of
the Hono/no-ORM choice, implemented now rather than deferred.

**How I knew it was right:** `pnpm typecheck` clean; booted the app twice
against the same db file and confirmed the second boot applies nothing
(idempotent); queried `sqlite_master` on a fresh boot and confirmed the
stored `CREATE TABLE` statements match `migrations/0001_init.sql` exactly;
`APP_URL=... pnpm check` still green (2/2) with the schema applied.

**Citation:** `4433f7e` (`migrations/0001_init.sql`, `src/db.ts`,
`Dockerfile`).

**Curated prompt:** "Then do Step 3 and stop."
