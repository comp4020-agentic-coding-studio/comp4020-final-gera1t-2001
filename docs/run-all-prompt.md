# One run: test report, Steps 7–9, deploy

The owner is away while you work. This file replaces the brief's "stop after
each step" rule for this run only. Everything else in CLAUDE.md and
docs/final-brief.md still holds.

## Before you start

1. `git pull` (main should be at or after `7eef4a6`). Restart any local app
   you start yourself from the new code.
2. Read CLAUDE.md, docs/final-brief.md, the last ~10 entries of
   process-log.md and docs/testing/multi-user-test-report.md.
3. Two production test accounts are in the env: PROBE_A_USER/PROBE_A_PASS
   and PROBE_B_USER/PROBE_B_PASS. Never print, log or commit their values.

## Order of work

Do these in order. Don't stop between them unless a stop rule below
applies. At the start of each part, re-read that part of the brief; your
context may have been compacted since you last read it.

**Part 1: multi-user test report.** Run scenarios a–f and h from
docs/testing/multi-user-test-report.md against production, with two
headless browsers (separate cookie jars, the PROBE accounts) and
`mise exec -- flyctl logs -a comp4020-final-gera1t-2001` running. Skip g;
the report already says why. For h, restart the machine with
`mise exec -- flyctl machine restart`. Fill in each Observed field with what
happened and a short log excerpt, and fill in the summary table. Both
accounts leave the table at the end. Commit and log.

**Part 2: brief Step 7** (the table, from docs/design/table-mockup.html).

**Part 3: brief Step 8** (home and results). Put the Results nav link back.

**Part 4: brief Step 9, except the push.** Do the full walk at both
viewports. Run the latency probe against **local** only for now.

Each part ends the way the brief says a step ends: every check it names, an
Opus subagent review of the diff and of the screenshots, fixes for what the
review finds, `pnpm check` green, then a commit and a process-log entry. Write
down what you did not verify.

## Pushing

Push **once**, after Part 4, and only if all of these hold: `pnpm check` is
green, `pnpm check:evidence` is green, and no review finding is still open.
Then confirm CI and the deploy, run the latency probe against production
with the PROBE accounts, and check / and /tables/1 on the live site at both
viewports.

## Stop and wait for the owner instead of continuing if

- a check stays red after two honest attempts to fix it;
- a review finds something that needs an owner decision (copy, a rule, a
  trade-off the brief doesn't settle);
- anything would delete or change production data beyond test-account play;
- you'd need to edit README.md, PROCESS.md, reflections/ or an ADR's Decision.

## Out of scope for this run

- Wiping accounts. The owner will run that separately and confirm it first.
- README, PROCESS.md, ADR 0004's Decision: the owner writes these.

## Final report

One report at the end, in this shape:
1. Per part: what changed, commit hashes, what you verified, what you didn't.
2. Every review finding and what happened to it.
3. Production after deploy: CI run, probe numbers, what the live pages
   looked like.
4. Anything you stopped on, or chose without the owner.
