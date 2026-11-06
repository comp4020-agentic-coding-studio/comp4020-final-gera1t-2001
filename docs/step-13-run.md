# Step 13 run: back up, walk, push, check production

Read `CLAUDE.md`, then Step 13 of `docs/final-brief-2.md`. This file adds
owner decisions (6 Nov 2026) to Step 13; where they differ, this file wins.
Steps 10–12 and their follow-ups are done; see the end of `process-log.md`.

**If part of this run was already done in an earlier session**, read the
last process-log entries and `git log --oneline origin/main..HEAD`, say
which parts below are already done, and carry on from the first one that
isn't.

## Part 1 — Back up production (before anything is pushed)

This deploy runs migrations 0006 and 0007 on production. Take a backup
first, exactly as `docs/wipe-and-push.md` Part 1 did:

- better-sqlite3's `backup()` inside the machine, from `/app`.
- Download to `~/house-game-backups/backup-<today's date>.sqlite3`. A new
  file name: never overwrite an earlier backup.
- Integrity check on the local copy; report **counts only** for users,
  sessions, security_questions, seats, table_state, hand_results.
- Delete the copy on the machine only after the local one opens.

Stop and report if any of this fails.

## Part 2 — Local walk and checks

As Step 13 says: the full walk as a new visitor at 1920×1080 and 390×844
(home → invite link → Play as a guest → table → a hand to showdown against
a second browser → claim → solo → results → profile → log out), `pnpm check`
and `pnpm check:evidence` green, and the multi-user report's Expected
column updated for (b) and the new scenario (i).

## Part 3 — Stop for the owner's "push"

Report: the backup counts and file name; the walk; both checks; and
`git log --oneline origin/main..HEAD`. Then **stop**. Push only after the
owner replies "push".

## Part 4 — After the owner says push

Everything in Step 13 after "Push", plus:

- **CI**: in the CI run's log, test 5b (the test-only routes return 404)
  **ran and passed**, not skipped. Quote the line.
- **Migrations**: `schema_migrations` on production lists
  `0006_guests.sql` and `0007_solo.sql`.
- **Fly-Client-IP**: find out whether Fly's proxy overwrites a
  `Fly-Client-IP` header that the client sends itself. Send a request with
  a made-up value and see what the app receives (a temporary log line is
  fine if you remove it in the same run; or Fly's own docs, quoted, plus
  one request that agrees with them). If a client can set it, the guest
  rate limit can be dodged: report that and stop rather than fix it
  unasked.
- **One guest on production** through the real button, then claim it or
  leave it, and say which.
- **Run-all Part 1** on production with the PROBE accounts (read them
  through `mise exec`, never print the passwords) and `flyctl logs`
  running: scenarios a–f, h and i. Fill Observed and the summary table in
  `docs/testing/multi-user-test-report.md`. Both accounts leave the table
  at the end.
- **Latency probe** against production: median, p95, max, stream gaps.
- Commit the report and the log entries. Pushing them redeploys, so push
  them only if the owner says so.

## Out of scope

README.md, PROCESS.md, reflections/, any ADR's Decision section, wiping
or restoring accounts.

## Final report

Per part: what happened, commit hashes, what you verified, what you didn't.
Every review finding and what happened to it. Anything left for the owner.
