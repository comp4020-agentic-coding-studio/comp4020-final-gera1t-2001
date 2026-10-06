# Your harness

This file is yours. The rules you hold the agent to are part of what gets
marked, so they should be rules you decided on.

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).
What the agent needs to carry from any of it is your call.

---

Everything below this line is carried forward by hand from
`comp4020-crit7-gera1t-2001`'s CLAUDE.md. Rules specific to that week's
prototype (a booking system) have been dropped; what remains is what held true
regardless of what was being built.

## Verifying what you actually shipped

- **`pnpm check` does not prove the page looks right.** Typecheck, build, lint
  and the spec suite all passing does not mean a real render is correct —
  `spec/invariants.test.ts` runs against jsdom, not a browser. A dead black
  band once filled most of a viewport with every automated check green
  ([`c8392bd`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit1-Gera1t-2001/commit/c8392bdf8319d94e85433d576f15c5d19e99ecb7)
  in an earlier repo). Look at the built page at both marking viewports —
  1920×1080 and 390×844 — not at whatever size the dev server window happens
  to be.
- **If the sandbox has no root and no browser**, a Chromium/Playwright shell
  can still be gotten without sudo: `apt-get download <pkg>` then
  `dpkg-deb -x <pkg>.deb .` to unpack the missing shared libs (`libnspr4`,
  `libnss3`, `libasound2t64`) into a local prefix, point `LD_LIBRARY_PATH` at
  it, and run the extracted Chromium headless against `pnpm preview`.
- **Serve over HTTP, never `file://`**, and check which port `pnpm preview`
  actually bound — it silently moves to the next free port when the default is
  taken, including by a preview left running from another week's repo.
- **A red from a harness you wrote ten minutes ago is a claim about the
  harness, not just the code.** Before believing an ad-hoc sensor's red, make
  it report a case you already know is good. The same applies to green: a
  sensor that only ever says what you hoped needs to be shown it responds to a
  *deliberate* change (edit the value, confirm it moves, put it back) — a
  stale or cached read passes a "does it report anything" check perfectly. A
  past instance of this, from `comp4020-crit7-gera1t-2001`: a "doesn't
  duplicate the first booking" test was proven non-vacuous by temporarily
  dropping a unique index in a scratch migration, confirming that exact test
  (and only that test) went red, then reverting.
- **Say plainly what wasn't checked.** If a change was only verified by
  `pnpm check` and not by looking at a real render or hitting the deployed URL,
  say so instead of implying full verification.
- **Verify a library's actual behavior against its source before asserting it,
  not from memory or general reputation.** A past instance, from
  `comp4020-crit7-gera1t-2001`: drizzle's migration-apply decision was first
  described as content-hash-based; the real mechanism
  (`SQLiteSyncDialect.migrate()` in `drizzle-orm/sqlite-core/dialect.cjs`)
  compares only the new migration's journal timestamp against the single
  most-recently-applied row — the stored hash is never read back. Caught and
  corrected before commit, which is worth generalizing: when a claim about a
  dependency's behavior matters to a decision, read the source path that
  actually decides it and quote the lines, rather than asserting from how the
  library is commonly described.

## Assert what a value means, not how it is spelled

A test that compares a URL string, a formatted figure, or a DOM text literal is
asserting a **serialisation**, not a fact. Assert through whatever function
gives the value its meaning — a parsed structure against its expected value,
a computed number with `toBeCloseTo`, the identity of a node rather than a
count of nodes — never the raw spelling. If you're about to write a string,
a number-as-text, or a count into an expectation, stop and ask what function
turns that spelling back into the thing it means; assert on that instead.

## Model choice for delegated work

- **Coding and execution** — writing code, running checks, git operations —
  default to whichever model the main session is already running. Don't spin
  up a subagent with a model override just to make a small edit or run a
  command.
- **Ideas, design discussion, and open-ended brainstorming** — a non-trivial
  choice, an ambiguous trade-off — go to an Opus subagent for a second opinion
  before settling on an approach.
- **Review and verification that calls for real judgement** — code review, or
  looking at a rendered page — also goes to an Opus subagent.

## Process logging (for PROCESS.md / COMP4020)

Chat with the human may happen in any language, but every file committed to
this repo — code, comments, commit messages, this CLAUDE.md, `process-log.md`,
`PROCESS.md`, `reflections/*.md` — must be written in English.

Log **after** the commit it describes, as part of preparing the **next** one —
never before, since a commit's own hash doesn't exist until it exists. In
practice: make commit N; before commit N+1 is created, append N's entry to
`process-log.md` (create it if it doesn't exist yet), citing N's real hash.
One entry per commit, no exceptions, even a trivial one — never judge whether
a commit is "significant enough" to log. Backstop: if a session ends with a
commit that has no log entry yet, or with uncommitted work, or a decision that
never produced a commit at all, write the entry(ies) before ending; mark a
no-commit decision `(no commit)`.

Tag each entry as one of:

- `[routine]` — re-prompted until it passed; nothing structural changed
- `[harness]` — a rule was added to CLAUDE.md, or a check/test was wired in,
  because of a recurring mistake
- `[discarded]` — a plausible-looking output was rejected in favor of a
  different approach
- `[judgement]` — a non-obvious scoping/design call was made

Structure each entry around: **Date/time**, **Tag**, **What happened** (1-2
sentences), **What I did instead of the obvious thing** (1-2 sentences), **How
I knew it was right** (the check run, the viewport looked at), **Citation**
(commit hash/range, CLAUDE.md diff, or a check name that went red → green),
and **Curated prompt (if relevant)** — the human's prompt trimmed to the
essential ask. Don't inflate routine work into a bigger-sounding tag —
`[routine]` is the honest answer when nothing else fits.

Never write directly to PROCESS.md during normal work. Only touch it when
explicitly asked to "update PROCESS.md" or "draft PROCESS.md from the log" —
then pull entries tagged `[harness]`, `[discarded]`, `[judgement]` first,
follow the repo's PROCESS.md template, and verify every citation resolves
(`pnpm check:evidence`) before finishing.
