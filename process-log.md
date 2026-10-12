# Process log

## 2026-10-07 — [harness]

**Logged retroactively** during a later audit ("make sure every commit so
far has a log entry") — this predates `process-log.md`'s own existence, so
there was nowhere to log it at the time.

**What happened:** Before any C8 step began, `CLAUDE.md` carried forward the
general (non-week-specific) harness rules from `comp4020-crit7-gera1t-2001`'s
CLAUDE.md: the verification-discipline notes, "assert what a value means, not
how it's spelled," the model-choice policy for delegated work, and the
process-logging convention itself (the rules this very log follows).

**What I did instead of the obvious thing:** Rather than copying crit7's
CLAUDE.md wholesale, dropped everything specific to that week's prototype (a
booking system) and kept only what held true regardless of what was being
built; cited commits from crit7's own repo were rewritten as cross-repo links
rather than left as bare hashes that would look like they belonged to this
repo's history.

**How I knew it was right:** Read crit7's CLAUDE.md in full first and
sorted its content into "general" vs. "booking-system-specific" before
writing anything, rather than carrying over anything that merely looked
reusable at a glance.

**Citation:** `d2cd67c` (`CLAUDE.md`).

**Curated prompt:** "你能不能阅读cirt7里面的claude.md，看看有什么东西可以转移过来的" /
"通用内容先整理进来，然后push上去"

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

## 2026-10-07 — [judgement]

**What happened:** C8 Step 4 asked for register/login/logout/profile-edit and
password recovery, plus two specific review notes: default an empty
`display_name` to the username, and show exactly how a failed recovery
attempt avoids revealing which answer was wrong and how the 5-attempt lock
is counted.

**What I did instead of the obvious thing:** Added a password minimum (8
characters) even though the brief's Limits bullet names only
username/display-name/bio — leaving password length completely unconstrained
seemed like an oversight rather than a deliberate choice, so I made the call
rather than shipping a 1-character password as valid. Also applied the
empty-display-name default on profile *edits*, not just registration, for
the same NOT-NULL reason the human flagged for registration. For the
recovery mechanism specifically: every submitted answer is checked with
`.map` (not `.every`, which short-circuits) so a wrong first answer costs the
same time as a wrong second one; a nonexistent username spends the same
scrypt cost via `spendDummyVerify` instead of returning early; and exactly
one `recovery_failed_attempts` increment happens per submission regardless
of how many of the answers were wrong, with the lock set only when that
counter reaches 5 — the error text is identical ("One or more answers were
incorrect.") whether the username doesn't exist, one answer was wrong, or
all were.

**How I knew it was right:** Manually drove the running app with curl
through: registration (empty display name -> username, duplicate username,
bad username/password, overlong display name, all rejected with the
expected message); login (right password, wrong password, unknown username —
last two give the identical "Invalid username or password"); logout; a
`<script>`/`onerror` payload in display name and bio coming back
HTML-escaped on the home page; the recovery path end to end — a known
username shows its real questions, an unknown one shows generically-labelled
placeholders of the same shape; one wrong answer (other one right) leaves
the old password working and shows only the generic error; four more wrong
attempts (five total) locked the account, confirmed directly in the `users`
row (`recovery_failed_attempts: 5`, `recovery_locked_until` set an hour
out); a sixth attempt with the *correct* answers was still refused while
locked; and, on a separate unlocked account, a correct full reset
invalidated that session immediately and the old password stopped working
while the new one logged in. `APP_URL=... pnpm check` stayed green (2/2)
throughout.

**Citation:** `761b6a5` (`src/crypto.ts`, `src/accounts.ts`,
`src/sessions.ts`, `src/html.ts`, `src/server.ts`).

**Curated prompt:** "Do Step 4 and stop. Two things to watch: display_name
is NOT NULL with no default: at registration, default it to the username if
the user leaves it empty. In your report, show exactly how a failed recovery
attempt avoids revealing which answer was wrong, and how the 5-attempt lock
is counted."

## 2026-10-07 — [judgement]

**What happened:** Hands-on testing of step 4 turned up two gaps before step
5: the password rule had no complexity requirement beyond length, and free-
text security questions meant a fake account's placeholder question
("Security question 1") was visibly different in kind from a real user's own
wording — a sign the username didn't exist, undermining the step 4 recovery
work. The human specified both fixes plus a live data wipe before step 5's
tests start creating accounts.

**What I did instead of the obvious thing:** For the question catalog, rather
than just storing real question text server-side for everyone and leaving
the "unknown username" placeholder generic, I made the placeholder draw two
*real* catalog questions deterministically from a hash of the username —
once every question comes from the same public six-item list, a fake pair
looks exactly like a real pair, closing the gap this step was meant to close
rather than just relabelling it. For the live data wipe, the first version
of the command used `eval(Buffer.from(base64,'base64').toString())` to dodge
nested-quoting pain, and Claude Code's auto-mode classifier correctly refused
it as a "Blind Apply" (opaque code, unreviewable from the command text
alone). Rewrote it as plain nested-quoted `node -e "..."` with no encoding or
eval — same logic, fully readable in the command itself — which ran without
being blocked.

**How I knew it was right:** `pnpm typecheck` clean; registered through the
new `<select>`-based form; a password missing each of the four character
classes was rejected with the specific missing-part message; two identical
questions and an out-of-catalog key were both rejected server-side (not just
blocked by the `<select>`, since a crafted request bypasses that); the same
unknown username returned the identical two placeholder questions on repeat
requests while a different unknown username got a different pair; migration
0002 applied cleanly to a fresh db (`sqlite_master` shows `question_key TEXT
NOT NULL` plus the new unique index); `APP_URL=... pnpm check` stayed green.
For the wipe: the live app's machine was stopped (auto_stop_machines), so a
plain GET woke it before the ssh console command could reach it; the command
checks each table exists before deleting (the live deploy's schema version
wasn't known for certain in advance) and reported exact counts:
`{"sessions":0,"security_questions":2,"users":1}`.

**Citation:** `a44a916` (`src/security-questions.ts`, `src/accounts.ts`,
`src/server.ts`, `migrations/0002_security_question_keys.sql`); live data
wipe via `flyctl ssh console` (no commit — a run against the deployed app's
volume, not a repo change).

**Curated prompt:** "Before Step 5, do a Step 4b from my own hands-on
testing (log it as [judgement])... Password rule: at least 8 characters,
with at least one uppercase letter, one lowercase letter, one digit and one
punctuation mark... Security questions: no more free text... Wipe all test
users... Show me the exact command before running it, never print the token
or env, and report how many rows were deleted."

## 2026-10-07 — [judgement]

**What happened:** C8 Step 5 asked for `spec/accounts.test.ts` per the
brief's 7 checks, plus two more from this session's step 4b (password
character-class rejection, duplicate/invalid security-question rejection),
guarded so the tests never write to the live app, and proof that test 1
isn't vacuous.

**What I did instead of the obvious thing:** Used `redirect: "manual"` on
every `fetch` that might set the session cookie (register, login) — Node's
`fetch` discards a redirect response's own headers once it follows the
redirect automatically, so capturing `Set-Cookie` requires *not* following it
and reading `res.headers.getSetCookie()` from the 303 directly, then
building subsequent requests' `Cookie` header by hand. For "names no
answer," asserted the exact, single `<li>` text inside the error list via
JSDOM rather than checking for the absence of revealing substrings — a
positive assertion on the full error content is strictly stronger than
trying to prove a negative.

**How I knew it was right:** All 15 tests (2 invariants + 13 accounts) pass
against a locally running instance. Confirmed the live-app guard by pointing
`APP_URL` at `http://0.0.0.0:8099` (a reachable but non-localhost hostname)
and seeing all 13 accounts tests report skipped while the 2 invariants tests
still ran. Proved test 1 non-vacuous: temporarily made `createUser` ignore
its `bio` argument, reran, and got exactly 2 failures — "trace persists" and
"editing a profile without a valid session..." (which also depends on a
registered bio surviving unchanged) — with the other 13 passing; reverted
(`git diff` on `src/accounts.ts` came back empty) and reran green.

**Citation:** `d3624c2` (`spec/accounts.test.ts`).

**Curated prompt:** "Step 5 (spec/accounts.test.ts), as in the brief, plus: a
password missing any one of the four character types is rejected;
registering with two identical questions, or a question not in the list, is
rejected. These tests create accounts, so they must never write to the live
app: skip them unless APP_URL points to localhost... Prove test 1 is not
vacuous (break it on purpose, confirm only the expected tests go red,
revert)."

## 2026-10-07 — [routine]

**What happened:** The human updated `README.md` to match step 4b's rules
(filled in the Robin Sloan quote, per the diff) and asked for it committed
verbatim, with an exact commit message, and logged.

**What I did instead of the obvious thing:** Nothing — committed the file
exactly as the human left it, per CLAUDE.md/the brief's rule that README.md
is the human's to write, not the agent's.

**How I knew it was right:** Read the diff before committing (just the
quoted passage filled in) to confirm there was nothing unexpected to flag,
then committed unchanged.

**Citation:** `38a1d41` (`README.md`).

**Curated prompt:** "I updated README.md to match Step 4b. Commit it as-is
(\"Update README to match Step 4b rules (human-written)\"), log it, then do
Step 6 and stop."

## 2026-10-07 — [judgement] (no commit)

**What happened:** C8 Step 6 asked to open the built app at 1920×1080 and
390×844 and do a Tab-key pass through register → profile, reporting what was
seen and what wasn't checked.

**What I did instead of the obvious thing:** This sandbox has no browser
install and no root, so rather than fall back to reading the HTML and
reasoning about tab order from source, used the already-extracted headless
Chromium from a previous session's workaround (`~/.cache/ms-playwright`,
libs under `~/.local/chrome-libs`) and drove it for real over the Chrome
DevTools Protocol (raw WebSocket, no new project dependency): registered a
throwaway account via a plain `fetch`/curl first (far more reliable than
simulating every keystroke for form submission), then used the real browser
only for what actually needs one — rendering and keyboard focus order.
First attempt used `Input.dispatchKeyEvent`-driven Enter to submit the
register form directly in-browser, which hung indefinitely (the synthetic
key event didn't reliably trigger the button's default action); dropped that
in favour of the fetch-then-inject-cookie approach instead of debugging
synthetic form submission further, since the brief only asked to observe tab
order and rendering, not to prove keyboard-driven submission works.

**How I knew it was right — what I saw:** At both viewports, Tab order on
`/register` is Home → Log in → Register (nav) → username → password →
display_name → bio → question_1 → answer_1 → question_2 → answer_2 → Register
button → wraps to body, with no skipped or unreachable field; `/profile`'s
order is Home → My profile → Log out → display_name → bio → Save, also
complete. A mid-tab screenshot on `username` showed a visible default focus
outline (no CSS strips it — the app has no stylesheet at all). Screenshots at
both viewports render correctly: labels visible, nothing cut off or
overlapping.

**What I did not check, and what I found instead:** Did not visually inspect
every intermediate focus state (only confirmed order programmatically plus
one focus-ring screenshot) — would need a human's eyes to assess whether
focus visibility reads clearly against the current unstyled form overall.
Separately, while measuring the mobile layout I found a real issue: the two
security-question `<select>` elements have no width constraint, and their
intrinsic width is set by the longest catalog question
("What was the name of the street you lived on when you were eight?", ~479px)
— wider than the 390px viewport. With no CSS anywhere in the app to cap it,
this measurably pushed the *whole page's* effective layout viewport out to
487px instead of 390px (confirmed via `window.innerWidth`/`scrollWidth`,
both 487), so the phone view renders slightly zoomed out/smaller than
intended rather than cleanly filling 390px — not a crash, but a real,
measured mobile-layout defect, left unfixed since step 6 is a look-and-report
step, not a fix step.

**Citation:** none (no commit — a visual/behavioural check, not a repo
change). Screenshots and the throwaway CDP driver live outside the repo
under `/tmp` (per CLAUDE.md: scripts written to drive this check are kept
separate from the deliverable, not committed).

**Curated prompt:** "Open the built app (served over HTTP) at 1920×1080 and
390×844; do a Tab-key pass through register → profile. Report what you saw
and anything you did not check."

## 2026-10-07 — [harness]

**What happened:** Fixed the mobile overflow step 6 found: a `<select>`
sizes to its longest `<option>` by default, and the security-question
catalog's longest entry pushed `/register`'s whole layout viewport past
390px on a 390px screen.

**What I did instead of the obvious thing:** Added exactly one CSS rule
(`max-width: 100%; box-sizing: border-box` on all form controls, plus
`text-overflow: ellipsis` on `select`) to the shared `page()` shell in
`src/html.ts` — the app's first and only CSS — rather than touching the
`<select>` markup itself or adding a stylesheet file; the bug was generic to
any wide form control, not specific to this one `<select>`, so the fix is
too.

**How I knew it was right:** Re-ran the exact same CDP measurement method
from the step 6 log entry, before and after, by `git stash`-ing the fix to
get a clean baseline and popping it back for the fixed numbers (at 390×844):

| page                          | before (innerWidth/scrollWidth) | after    |
|-------------------------------|----------------------------------|----------|
| `/register`                   | 487 / 487                        | 390 / 390 |
| `/forgot-password` reset form | 390 / 390 (already fine)         | 390 / 390 |
| `/profile`                    | 390 / 390 (already fine)         | 390 / 390 |

A screenshot with the longest question selected shows it truncated with a
visible ellipsis ("What was the name of the street you lived on whe…"),
satisfying "readable (wrap or truncate visibly)" rather than silently
clipping. `pnpm typecheck` clean; `APP_URL=... pnpm check` still green
(15/15) — the fix is pure CSS, nothing it could break functionally.

**Citation:** `04fe4a0` (`src/html.ts`).

**Curated prompt:** "Fix the mobile overflow you found: constrain form
controls so nothing is wider than the viewport (a minimal CSS rule; no
redesign, no framework). Then re-measure with the same CDP method: at
390×844, scrollWidth must equal 390 on /register, /profile and
/reset-password, and the long question text must still be readable (wrap or
truncate visibly). Show the before/after numbers, commit, log it, and stop."

## 2026-10-07 — [routine] (no commit)

**What happened:** The human deployed `04fe4a0` and tested the live app on
their own phone: registered, closed the tab, came back later, logged in, the
bio was still there, and there was no horizontal scroll.

**What I did instead of the obvious thing:** Nothing to redo — this is the
real-device confirmation of two things only a live phone can actually prove:
that the trace genuinely persists across a closed tab and a new visit (not
just a fresh `fetch` in a test), and that the step 6/mobile-overflow fix
(`04fe4a0`) holds on an actual device, not just in headless Chromium's
emulation.

**How I knew it was right:** The human read it directly off their own phone
against the deployed app — nothing left for me to independently verify here.

**Citation:** none (no commit — a manual check against the live deployment,
not a repo change).

**Curated prompt:** "Phone test on the live app: registered, closed the tab,
came back, logged in, bio still there, no horizontal scroll. Log it and
stop."

## 2026-10-07 — [routine]

**What happened:** `38a1d41` only filled in README.md's quoted passage and
missed step 4b's rules (the stronger password rule and catalog-only security
questions), so the human replaced it with a corrected version.

**What I did instead of the obvious thing:** Nothing — committed the file
exactly as the human left it, per CLAUDE.md/the brief's rule that README.md
is the human's to write, not the agent's.

**How I knew it was right:** Read the diff before committing: it adds the
two step 4b rules to the "What this version does" and "Enforced vs judged"
sections, and nothing else — consistent with what `38a1d41` should have
included the first time.

**Citation:** `35ae340` (`README.md`).

**Curated prompt:** "README.md in the repo was missing the Step 4b changes
(38a1d41 only added the quote). I replaced it with the correct version.
Commit it as-is (\"Fix README: add Step 4b rules missing from 38a1d41
(human-written)\"), log it, then stop."

## 2026-10-07 — [routine]

**What happened:** The human wrote `PROCESS.md` (replacing the template
placeholder) and `reflections/crit-8.md`, and asked for both committed as-is
alongside README.md (which turned out to already be up to date from
`35ae340`, so there was nothing new to stage for it).

**What I did instead of the obvious thing:** Read both files in full before
committing — per CLAUDE.md's rule that this file is the human's to write —
and committed them unedited.

**How I knew it was right:** Confirmed `git status` showed only `PROCESS.md`
and `reflections/crit-8.md` as pending changes (README.md had none), so the
commit only contains what the human actually wrote.

**Citation:** `6b5085e` (`PROCESS.md`, `reflections/crit-8.md`).

**Curated prompt:** "Commit README.md, PROCESS.md and reflections/crit-8.md
as-is (human-written), log them, then run pnpm check and pnpm check:evidence
and show me the output. Stop."

## 2026-10-11 — [judgement]

**What happened:** Ran C9 Step 0 (engine spike) in `spike/` (gitignored):
compared `@pokertools/engine` and `poker-ts` against the brief's three
scenarios (side pots + chip conservation, snapshot/restore, per-player view
masking), quoting source for every behavioral claim rather than trusting
either README. Wrote `docs/adr/0002-poker-engine.md` with Context, Options
and a comparison table; Decision and Consequences left empty for the owner.

**What I did instead of the obvious thing:** The brief's Scenario 1 ("1000
chips each" + "A goes all-in short (300)") can't be literally true in one
hand — if all three buy in at 1000 and A shoves on her first action, her
all-in is for 1000, not 300. Rather than silently pick a reading or ask and
stall the spike, I read it as "the short stack's all-in is 300" (A buys in
for 300, B and C for 1000 each) and said so plainly in both the spike output
and the ADR, checking conservation against the real starting total (2300)
instead of the brief's literal 3000. Separately, discovered a plain
`npm install @pokertools/engine` silently resolves to 1.0.20, not the latest
2.0.4 (which needs npm >=12.2.0, unmet here) — ran every scenario against the
version that actually installs, and flagged 2.0.4/node:24-alpine
compatibility as unverified rather than assumed.

**How I knew it was right:** Every claim in the ADR traces to a spike script
run in `spike/pokertools.cjs` / `spike/poker-ts.cjs` with asserted,
printed output (pot amounts, eligible seats, final stacks, restored-state
equality, masked-view contents) — not to either library's README. The
`poker-ts` snapshot-restore failure was isolated to its actual cause (no
real `#private` fields — confirmed by grep — but a lost prototype chain
through internal, non-exported classes) by reading `dist/facade/poker.js`
and `dist/lib/table.js` directly, not asserted from general reputation.

**Citation:** `2f42726` (`docs/adr/0002-poker-engine.md`, `.gitignore`,
`docs/c9-brief.md`).

**Curated prompt:** "Read CLAUDE.md and docs/c9-brief.md, then do Step 0
only and stop."

## 2026-10-11 — [routine]

**What happened:** The human decided ADR 0002: `@pokertools/engine`, pinned
to 1.0.20 (the version the spike actually ran against). They gave the exact
Decision and Consequences text to write in.

**What I did instead of the obvious thing:** Pasted the human's text into
the ADR's Decision and Consequences sections verbatim and committed it
unedited — per CLAUDE.md's rule that a human-authored decision is recorded
as given, not rephrased.

**How I knew it was right:** `git diff` before committing showed only the
two placeholder lines (`*(left for the owner)*`) replaced by exactly the
text the human supplied, nothing else in the file touched.

**Citation:** `f98b429` (`docs/adr/0002-poker-engine.md`).

**Curated prompt:** "I chose @pokertools/engine. You may write ADR 0002's
Decision and Consequences this time, using exactly this text (it is my
decision; do not reword it): [Decision/Consequences text]. Commit it as
\"Record ADR 0002 decision (human decision)\", log it."

## 2026-10-11 — [routine]

**What happened:** Pinned `@pokertools/engine` to `1.0.20` exactly (no `^`)
per ADR 0002's decision, added `src/poker/engine.ts` as the one module
allowed to import it, and wrote C9's Step 1 schema (`migrations/0003_poker.sql`:
`poker_tables` seeded with one "Home game" row, `seats`, `table_state`,
`hand_results`).

**What I did instead of the obvious thing:** The brief doesn't specify the
seed table's blinds/buy-in/seat count, so rather than leave them as an
unexplained guess I picked plain defaults (5/10 blinds matching the ADR
0002 spike numbers, 1000 buy-in, 6 seats) and said in the migration's own
comment that they're not an owner decision and are fine to revisit in a
later migration.

**How I knew it was right:** Applied the migration against a scratch SQLite
database (`DB_PATH` pointed at `/tmp`, discarded after) and read back
`sqlite_master` and the seeded row; ran `pnpm typecheck` (clean); smoke-ran
`src/poker/engine.ts` directly (`sit`/`deal`, reached `PREFLOP`); grepped
`src/` to confirm no file besides the wrapper imports `@pokertools/engine`.

**Citation:** `22d02c9` (`package.json`, `pnpm-lock.yaml`,
`migrations/0003_poker.sql`, `src/poker/engine.ts`).

**Curated prompt:** "install the library pinned to that exact version (no
^, no latest), make sure it is only imported from src/poker/engine.ts, and
do Step 1. Stop after Step 1 and show me the SQL."

## 2026-10-11 — [routine]

**What happened:** `docs/c9-brief.md` had been replaced by the human with
the owner's turn-timeout decision (check-if-legal-else-fold after
`TURN_TIMEOUT_SECONDS`, env-overridable), but the first attempt to read the
new version showed the file byte-identical to what was already committed —
the save hadn't actually landed yet. Asked the human rather than guess or
proceed on stale content; they re-saved it, and the re-read showed the real
diff (turn-timeout owner decision, Step 1's `turn_deadline` column, Step 2/3
behavior, two new Step 4 checks, Step 6's ADR 0003 scope).

**What I did instead of the obvious thing:** Did not fabricate or infer
what the "current version" might say from the task description alone;
verified the file's actual content and mtime first, and when it matched the
old version exactly, said so and asked rather than writing a schema change
against a decision I hadn't actually seen in the repo.

**How I knew it was right:** `git diff docs/c9-brief.md` against the
previously committed version, after the human's re-save, showed exactly the
turn-timeout additions described in their message and nothing else.

**Citation:** `a4d4973` (`docs/c9-brief.md`).

**Curated prompt:** "The repo's docs/c9-brief.md was outdated; I've
replaced it with the current version. Re-read it: it adds my C9 decision
(turn timeout: auto-check if legal, else auto-fold, TURN_TIMEOUT_SECONDS =
30, overridable by env for tests) and a turn_deadline column in
table_state."

## 2026-10-11 — [routine]

**What happened:** Added `turn_deadline` (nullable `TEXT`) to `table_state`
in migration `0003_poker.sql`, per the updated brief's turn-timeout decision.

**What I did instead of the obvious thing:** Checked `origin/main` first
rather than assume: 0003 hadn't been pushed (`git fetch` + `git log
origin/main` still showed `0180bb9`, the commit before any C9 work), so it
was amended directly rather than adding a 0004, per the brief's explicit
rule for this case.

**How I knew it was right:** Re-applied the amended migration against a
fresh scratch database and read `PRAGMA table_info(table_state)` back:
`turn_deadline` is present with `notnull=0` (nullable) and every other
column and the seed row are unchanged. `pnpm typecheck` stayed clean.

**Citation:** `895e48d` (`migrations/0003_poker.sql`).

**Curated prompt:** "Add turn_deadline (nullable) to table_state. If
migration 0003 has not been pushed yet, amend 0003; if it has been pushed,
add a new migration 0004 instead and never edit 0003. [...] Show me the new
SQL, log it, then do Step 2 and stop."

## 2026-10-11 — [judgement]

**What happened:** Implemented Step 2 — `src/poker/table.ts` (sit/leave/
start/act, the masked "view for user X", turn-timeout scheduling) and five
routes in `src/server.ts` on top of it.

**What I did instead of the obvious thing:** `ActionType` is a `const enum`
from `@pokertools/types`; this repo's `verbatimModuleSyntax: true` makes
importing it as a *value* a compile error (confirmed by probing a throwaway
file: `TS2748: Cannot access ambient const enums`). Rather than loosen
`tsconfig.json` for the whole repo to accommodate one dependency, actions
are built as plain object literals with string `type` fields, cast `as
Action` (a `type`-only import) at the one call site — scoped entirely to
`src/poker/table.ts`. Separately, leaving mid-hand is rejected outright
rather than exercising the engine's own `stand()` partial-departure handling
(which retains a zero-stack placeholder until settlement) — simpler to
verify correctly under the time available, and nothing in the brief or Step
4's planned checks needs it to work.

**How I knew it was right:** Ran a real server against a scratch database
and drove it with curl and two cookie jars end to end: masked views (each
user's `GET /tables/1` showed only their own hole cards), out-of-turn and
illegal-action rejection (the engine's own messages, unmutated state),
a full hand played to SHOWDOWN with `seats.stack`/`hand_results` updated
atomically and total chips conserved (2000 before and after), sitting
twice/leaving mid-hand/an under-minimum raise all rejected, and
`POST .../add-chips` 404ing. Separately re-ran with `TURN_TIMEOUT_SECONDS=3`
and let a turn actually expire: the player was auto-folded (couldn't
legally check) through `applyAction()` — not a parallel code path — with
the same atomic DB update as a real fold. `pnpm typecheck` stayed clean
throughout.

**Citation:** `9b6082b` (`src/poker/table.ts`, `src/server.ts`).

**Curated prompt:** "[...] Also note for Step 2: when a hand ends, updating
seats.stack and writing hand_results must happen in the same transaction.
Show me the new SQL, log it, then do Step 2 and stop."

## 2026-10-11 — [harness]

**What happened:** Asked to show the exact guard against the timer acting
twice or for the wrong player. Traced my own earlier claim ("whichever
writes last wins") against the real code and found the write itself
(`saveTableState`'s unconditional upsert) had no version check at all — the
only real guarantee was the implicit, unstated fact that better-sqlite3 is
synchronous and `applyAction` has no `await`, so nothing could interleave
between its read and its write. True today, but nothing in the code said
so or would catch it if that stopped being true.

**What I did instead of the obvious thing:** Rather than argue the race
was already unreachable and leave it at that, split `applyAction` into
`prepareAction` (read + validate) and `commitPreparedAction` (an explicit
`UPDATE ... WHERE version = ?`, checked via `.changes`), so the invariant
is enforced by the database itself, not by an assumption about the
runtime. Also chose a direct function-level proof over trying to win a
real OS-level timing race with curl — explained in the commit why a curl
race wouldn't actually exercise this code path (no await inside
`applyAction`, so the race is only ever between two separate top-level
calls, and the loser's own `prepareAction` already rejects it via ordinary
`engine.validate()` in the common case).

**How I knew it was right:** Prepared a fold against one version, let a
different real call for the same player land and succeed first, then
committed the stale prepared fold — it threw `StaleActionError`, and
`table_state.version`, `seats.stack` and `hand_results` were all
confirmed unchanged by that attempt (a direct DB check, not just "it threw
something"). Also hit a real bug while proving it: the proof script set
`process.env.DB_PATH` at the top of the file, but ES module imports
execute before the importing module's own top-level code regardless of
source order, so `src/db.ts` read the unset env var first and the test
silently wrote into the repo's real local dev database
(`data/dev.sqlite3`) instead of the intended scratch path. Caught via the
`UNIQUE constraint failed: users.id` error on a second run, cleaned up the
polluted file (gitignored, pure scratch), and fixed the script to set
`DB_PATH` in the environment before starting node. Re-ran the Step 2 curl
smoke test afterward (sit, start, legal actions, and a full hand driven
entirely by repeated timeouts to SHOWDOWN) to confirm the refactor didn't
change ordinary behavior; chip conservation held.

**Citation:** `59438af` (`src/poker/table.ts`).

**Curated prompt:** "Before Step 3: you said \"whichever one writes last
wins the race\" for the timer vs a real click. [...] Show me the exact
guard [...] If not, add that guard now, prove it with a run where a real
action lands just before the deadline (the timer must then do nothing),
commit, log."

## 2026-10-12 — [harness]

**What happened:** Implemented Step 3 (SSE push + the table page) and
verified it the way the brief asks — two real headless-Chromium sessions,
separate profiles and cookies, over CDP — rather than trusting the markup
or a curl-only check. That verification caught two real bugs.

**What I did instead of the obvious thing:** First bug: a "hidden" form
still rendered visibly, because my own `.actions { display: flex }` rule
and the browser's default `[hidden] { display: none }` tie on specificity
and mine came later in the cascade — invisible to `pnpm check` (jsdom-based,
per CLAUDE.md's own warning) and only caught by looking at an actual
screenshot. Fixed with an `[hidden]`-qualified override rather than
reordering rules (which would've been fragile against the next edit).
Second bug: the "auto-fold" label showed the wrong player doing the wrong
thing, because a fold that ends a hand makes the engine append a further
bookkeeping entry (`UNCALLED_BET_RETURNED`) after the fold in
`actionHistory`, so "the last entry" wasn't the action that was actually
just taken. Fixed by capturing the acting seat and action type directly in
`prepareAction` (from `actionTo`, read before `engine.act()` moves it and
from the action object already in hand) instead of reading them back from
history — removes the possibility of this class of bug entirely, not just
this one instance of it.

**How I knew it was right:** Re-ran the full two-browser flow after each
fix and confirmed the specific symptom was gone (screenshot showing the
form actually hidden; screenshot showing "auto-fold" on the seat that
actually folded) before moving on, rather than assuming either fix worked
from reading the diff alone.

**Citation:** `810ed72` (`src/poker/page.ts`, `src/poker/table.ts`,
`src/server.ts`).

**Curated prompt:** "Then do Step 3 (SSE + table page) and stop. Do not
push yet."

## 2026-10-12 — [harness]

**What happened:** Wrote Step 4 (`spec/poker.test.ts`, the brief's 8
checks) and spent most of the session's remaining time getting tests 7 and
8 (the turn-timeout checks) reliably green against the real 30s default
timeout, per the explicit instruction not to assume CI overrides it.

**What I did instead of the obvious thing:** First version held each SSE
connection open for the whole ~30-45s wait and was flaky under the real
default specifically — investigated rather than just adding a timeout
bump: ruled out the app itself four independent ways (direct `curl -N`
held 38+ seconds fine; two real Chromium sessions pushed at ~20ms latency
over much longer spans; the server's own timer logs fire within 10ms of
schedule every time; the drop reproduced identically over raw `node:http`,
ruling out the fetch client) before concluding it was this sandbox's
handling of a long-lived connection on a process that's already made many
prior requests — root cause unidentified despite that, but the symptom
fully characterized. Flagged this to the human rather than silently
papering over it with a polling fallback, which would have made the test
vacuous (the server-side auto-action happens regardless of whether the
*push* works, so polling succeeds even with push fully broken — confirmed
this concretely before discarding the approach). Per their direction,
restructured test 7 so the SSE connection is short-lived by design
(opened ~3s before the deadline, not for the whole wait) rather than
trying harder to keep a long-lived one alive, and lowered the heartbeat to
10s to cheaply rule out an idle-connection cutoff. Kept `retry: 2` as a
second, honest layer on top — verified it doesn't mask a real regression
by breaking push and watching all 3 attempts fail identically, not just
one.

**How I knew it was right:** Full suite (23 tests) green against the real
default 30s timeout, twice in a row, no retries consumed either time.
Re-proved tests 1, 2 and 7 are not vacuous against the *final* restructured
code (not just an earlier version): disabling the table's push entirely
turned exactly 1 and 7 red; separately, returning the engine's unmasked
`.state` instead of `.view(...)` from `buildView` turned exactly 2 red,
with the leaked cards printed in the failure. `git diff` was clean after
reverting each breakage, confirmed before moving on.

**Citation:** `2bd935e` (`spec/poker.test.ts`, `src/poker/table.ts`,
`src/server.ts`).

**Curated prompt:** "Do Step 4 (spec/poker.test.ts)... Prove tests 1, 2
and 7 are not vacuous... Commit, log." Then, after reporting test 7's
flakiness honestly and asking how to proceed: "Don't accept a test that
fails... Time-box this to 15 minutes: 1. Lower the SSE heartbeat from 20s
to 10s... 2. Restructure test 7 so it doesn't need a long-lived
connection... Re-prove that by breaking push once."

## 2026-10-12 — [routine]

**What happened:** The human wrote README.md, PROCESS.md,
`reflections/crit-9.md` and `docs/adr/0003-turn-timeout.md`, and asked for
them committed as-is apart from two placeholders in PROCESS.md.

**What I did instead of the obvious thing:** Read all four files in full
before committing — per CLAUDE.md's rule that these are the human's to
write — and touched only what was explicitly asked: PROCESS.md's two
`TODO-SHA` placeholders (matched each to the right commit by reading the
surrounding paragraph: the version-guard one against "`UPDATE ... WHERE
version = ?`", the browser-bugs one against "a form that should have been
hidden" and "the auto-fold label named the wrong player") and its
top-of-file reminder comment. Nothing else in any of the four files.

**How I knew it was right:** `grep -n "TODO-SHA"` after editing returned
nothing; `git diff` showed only the two hash substitutions and the comment
deletion against PROCESS.md, with README.md/reflections/the ADR appearing
in the diff purely as the human's own new content, untouched by me.

**Citation:** `582744a` (`README.md`, `PROCESS.md`,
`reflections/crit-9.md`, `docs/adr/0003-turn-timeout.md`).

**Curated prompt:** "I added README.md, PROCESS.md, reflections/crit-9.md
and docs/adr/0003-turn-timeout.md (human-written). In PROCESS.md, replace
the two TODO-SHA placeholders with the real short hashes... Also delete
the HTML comment at the top of PROCESS.md. Change nothing else in these
files. Commit them, log, run pnpm check and pnpm check:evidence..."

## 2026-10-12 — [judgement]

**What happened:** A visitor had no way to find the poker table: the nav
never linked to it and the home page still read its pre-table copy. Added
a "Table" nav link, replaced the home page's intro, and a post-login/
register redirect back to wherever a logged-out visitor was headed.

**What I did instead of the obvious thing:** The redirect needed a `next`
destination to survive a visitor switching between /login and /register
mid-flow (e.g. landing on /login via the redirect, then realising they
need to register instead) — not just a one-hop query param. Threaded it
through as a hidden form field on both forms (including validation-error
re-renders, which also needed to keep it) and appended it to nav()'s own
Log in/Register links, so the two pages can hand it back and forth without
it ever only living in a URL that gets left behind by a POST. Wrote
`safeNextPath()` to accept only a root-relative path, rather than trusting
a visitor-supplied value as-is — this is a redirect driven directly by
user input, the shape of thing that becomes an open-redirect vector if
left unchecked.

**How I knew it was right:** Drove the real flow in headless Chromium as a
brand-new visitor, starting from the home page: Join the table -> redirected
to /login?next=... -> switched to Register from there (confirming nav()'s
carried-through link) -> registered -> landed on the real table page, not
/profile or home. Repeated at 390x844 on a separate fresh browser profile
(a logged-in leftover session from the first run would have skipped the
redirect entirely) with no horizontal overflow at any step. Separately
confirmed via direct requests that `//evil.com`, `https://evil.com`,
`javascript:alert(1)`, and the `/\evil.com` backslash variant are all
rejected (redirect falls back to `/profile`), not just a same-site path
accepted. pnpm check: 4 files, 24/24 tests green, including the new
`spec/home.test.ts`, which asserts on the parsed DOM and a resolved URL
rather than a substring match.

**Citation:** `7f2aa78` (`src/server.ts`, `spec/home.test.ts`).

**Curated prompt:** "A visitor can't find the poker table: the home page
and nav have no link to /tables/1... Add 'Table' to the nav... Replace the
home page's intro line... send them back to /tables/1 instead of the home
page. Only allow same-site paths for this redirect. Add a spec check...
Verify in a real browser from the home page, as a new visitor... pnpm
check green, commit, log, push, confirm CI and deploy pass."
