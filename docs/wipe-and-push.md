# One run: back up production, wipe all accounts, push Steps 7–9

Read `CLAUDE.md` first. This run comes before `docs/final-brief-2.md`;
do not start that brief, and do not commit it, in this run.

## Owner decisions (4 Nov 2026)

- **Wipe every account on production**, with everything that belongs to
  accounts: sessions, security questions, seats, the live hand, hand
  results. The app starts again with no users and an empty table. This is
  the postponed wipe from brief 1's "Next".
- It ships in the same deploy as the 5 local commits that are ahead of
  `origin/main` (brief 1 Steps 7–9).
- **The PROBE gate before the push is waived**: PROBE_A could not log in
  on production (22 Oct), and the wipe removes both PROBE accounts anyway.
  After the deploy, the agent re-registers both from the env credentials
  and runs the post-deploy checks with them (Part 4); the owner also checks
  by hand on a real phone.
- A backup of the production database is taken and downloaded **before**
  anything is pushed. It is kept outside the repo and never committed: it
  holds password hashes.

## Part 1 — Back up production

1. Inside the production machine, take an online backup with
   better-sqlite3's own `backup()`, from `/app` so the module resolves:
   `mise exec -- flyctl ssh console -a comp4020-final-gera1t-2001 -C "sh -c 'cd /app && node -e \"require(\\\"better-sqlite3\\\")(process.env.DB_PATH).backup(\\\"/data/backup-2026-11-04.sqlite3\\\").then(()=>console.log(\\\"ok\\\"))\"'"`
   (Adjust the quoting if the shell needs it. Check from source that
   `backup()` returns a promise before relying on it, per CLAUDE.md.)
2. Download it: `mise exec -- flyctl ssh sftp get -a comp4020-final-gera1t-2001 /data/backup-2026-11-04.sqlite3 ~/house-game-backups/backup-2026-11-04.sqlite3`
   (create `~/house-game-backups/` first; it is outside the repo).
3. Open the downloaded copy locally and report **counts only**: users,
   sessions, security_questions, seats, table_state, hand_results. Do not
   print usernames, display names or hashes.
4. Delete `/data/backup-2026-11-04.sqlite3` from the machine only after the
   local copy opens and its counts are reported.

If any of this fails, stop and report. Nothing below happens without a
backup that opens.

## Part 2 — The wipe migration

- Add `migrations/0005_wipe_accounts.sql`, commented like `0004`: why
  (owner decision, 4 Nov, a clean start before friends are invited and
  before marking), what it removes, that it runs on boot before
  `restoreSchedulersOnBoot()` so no timer is armed for a deleted hand.
- Delete explicitly, child tables first, rather than relying on
  `ON DELETE CASCADE`: `table_state`, `seats`, `hand_results`,
  `security_questions`, `sessions`, then `users`. Leave `poker_tables` and
  `schema_migrations` alone.
- Check locally on a **copy** of `data/dev.sqlite3` (never the file
  itself): boot the app against the copy, confirm every one of those
  tables is empty and `schema_migrations` lists `0005_wipe_accounts.sql`,
  register a new account, sit, deal one hand.
- `pnpm check` and `pnpm check:evidence` green.
- Commit the migration. Log it per CLAUDE.md as `[judgement]`, including
  that a backup was taken and where it lives (path only).

## Part 3 — Stop for the owner's go-ahead

Before pushing, **stop** and report: the backup counts, the local check,
the list of commits about to be pushed (`git log --oneline origin/main..HEAD`).
The owner says "push" or doesn't. A push wipes production; it cannot be
undone except by restoring the backup.

## Part 4 — Push and confirm (after the owner says push)

- Push. Watch CI and the deploy to the end.
- On production: `schema_migrations` lists `0005_wipe_accounts.sql`; the
  six tables above have 0 rows (counts only).
- Before registering anyone, load `/` signed out at 1920×1080 and
  390×844: no Regulars, the table empty.
- Register the two PROBE accounts on production through `/register`, with
  the usernames and passwords from PROBE_A_* and PROBE_B_* (never print,
  log or commit the values; the security answers can be random and
  discarded). Then confirm both **log in** (status codes only). This
  replaces the PROBE_A login that failed on 22 Oct.
- With the two PROBE accounts in two headless browsers (separate cookie
  jars): `/tables/1` at both viewports, both sit, deal, play one hand,
  each action appears on the other page, pill shows Live; both leave.
- The latency probe against production with the PROBE accounts: median,
  p95, max, stream gaps.
- Log the push as `[judgement]`: the waived gate and why (PROBE_A login
  failure, owner checks by hand), the backup, what was and wasn't verified.

## Out of scope

- `docs/final-brief-2.md`: leave it uncommitted.
- Restoring anything from the backup.
- README, PROCESS.md, reflections, ADR Decisions.

## Final report

Per part: what happened, commit hashes, counts, what you verified, what you
didn't.
