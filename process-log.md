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

## 2026-10-12 — [routine]

**What happened:** The previous commit's new home page copy ("A Texas
Hold'em table for friends. Join the table.") replaced the old intro
paragraph, which was also the site's only link to `/readme/`. The README
became unreachable from the UI.

**What I did instead of the obvious thing:** Rather than putting the link
back into the home page paragraph (which the prior fix had deliberately
shortened per the brief), added a permanent "About" link to `nav()`,
pointing at `/readme/`, in both the logged-in and logged-out branches — so
it survives future rewrites of the home page copy.

**How I knew it was right:** Started the app on a fresh scratch DB with no
`TURN_TIMEOUT_SECONDS` override (mirroring CI) and ran `pnpm check` against
it: 4 files, 24/24 tests green. Also fetched `/` directly and confirmed the
rendered `<nav>` contains `<a href="/readme/">About</a>` for a logged-out
visitor.

**Citation:** `713d30d` (`src/server.ts`).

**Curated prompt:** "The home page lost its link to the README. Add
'About' to the nav, linking to /readme/, for everyone. pnpm check green,
commit, log, push, confirm deploy. Stop."

## 2026-10-19 — [routine]

**What happened:** Added the final-project handoff — `docs/final-brief.md`,
`docs/design/` (table, login and register mockups with 1920/390
screenshots, shared `auth.css`) and `docs/evidence/` (pre-brief production
timeline, two repro scripts, before screenshots) — as a single commit, per
the brief's own instruction to commit all three before starting Step 1.

**What I did instead of the obvious thing:** Nothing non-obvious here —
committed exactly the files the brief named, unmodified, with no attempt
to act on their contents yet.

**How I knew it was right:** `git status` before committing showed only
these three paths as untracked against an otherwise clean tree; `git show
--stat` after confirmed all 17 files (16 under docs/design and
docs/evidence plus final-brief.md) landed in one commit with no other
changes mixed in.

**Citation:** `9b7daa2` (`docs/final-brief.md`, `docs/design/*`,
`docs/evidence/*`).

**Curated prompt:** "Read CLAUDE.md, docs/final-brief.md and the latest
entries in process-log.md. First commit docs/final-brief.md, docs/design/
and docs/evidence/ as the brief says, then do Step 1 only."

## 2026-10-19 — [routine]

**What happened:** Built `scripts/latency-probe.ts` (`pnpm probe:latency`),
final brief Step 1's harness: two sessions with separate cookie jars (A and
B), B's SSE stream watched while A acts N times (check/call, or starts a
new hand once one ends), reporting per-action delivery time
(median/p95/max) and the gap between every message on B's stream
(heartbeats included), plus a count of any action with no event within
5 s. It reads `PROBE_A_USER`/`PASS`/`PROBE_B_USER`/`PASS` from env and
never registers accounts, so it's safe to point at production once the
owner supplies real credentials there.

**What I did instead of the obvious thing:** `leave()` (`src/poker/table.ts`)
rejects a seat still dealt into a hand in progress, which the first version
of the probe hit: it called `leave()` for both sessions right after its
last timed action, even when that action had left a hand mid-street, so
both sessions missed the error silently (`.catch(() => undefined)`) and
stayed seated — confirmed by querying `data/dev.sqlite3` directly after a
run and finding both probe seats still occupied. Added
`finishAnyHandInProgress()`, mirroring `spec/poker.test.ts`'s own
`cleanupTable()`: fold whoever's turn it is down to a finished hand before
either session tries to leave, so "it leaves both seats at the end"
(the brief's own requirement) is actually true rather than only true when
the last action happened to end the hand.

**How I knew it was right:** Ran `pnpm probe:latency` against a local app
(`TURN_TIMEOUT_SECONDS=30`, two freshly-registered local-only accounts,
`PROBE_ACTIONS=15`) and queried `seats` directly before and after: occupied
beforehand (from the prior buggy run), empty immediately after this run.
Delivery was 2-10ms per action (median 4ms, p95 10ms, max 10ms) and stream
gaps 5-22ms, all heartbeats and pushes, 0/15 missed. Proved the probe isn't
vacuous per the brief: temporarily made `notifyTable()` (`src/poker/table.ts`)
return immediately, re-ran the probe (3 actions), confirmed all 3 reported
"NO EVENT within 5000ms" with no other effect, then reverted — confirmed by
`git diff` showing no residual change to `src/poker/table.ts`. `pnpm check`
green (4 files, 24/24 tests) against the same running local app afterward.

**Not yet run:** against production — that needs the owner's real
credentials, which this script deliberately never generates or stores
itself; the exact command to hand the owner is `APP_URL=<production URL>
PROBE_A_USER=... PROBE_A_PASS=... PROBE_B_USER=... PROBE_B_PASS=...
pnpm probe:latency`.

**Citation:** `2698608` (`scripts/latency-probe.ts`, `package.json`).

**Curated prompt:** "Read CLAUDE.md, docs/final-brief.md and the latest
entries in process-log.md. First commit docs/final-brief.md, docs/design/
and docs/evidence/ as the brief says, then do Step 1 only. Report what you
verified and what you didn't, then stop and wait for me."

## 2026-10-19 — [harness]

**What happened:** The owner reviewed Step 1's probe (`2698608`) and
rejected it twice over before approving: (1) the stream-health check never
ran long enough to see a single heartbeat, so a genuinely dead stream
would have reported "healthy" by default; (2) `leave()` rejects a seat
still dealt into a hand, and with other real players seated a hand only
ends once every one of them has acted — not something the probe's own two
accounts can force — so a run on a table with other players would silently
strand both probe seats forever.

**What I did instead of the obvious thing:** For (1), rather than just
lengthening the existing action-loop's incidental gap measurements, added
a dedicated phase: fold down to a finished hand, *then* hold B's stream
idle for `max(25s, HEARTBEAT_MS * 2.5)` and report the max gap, flagging
`STALL` above 1.5x the heartbeat. Getting the ordering right took two
tries: the first version held the idle window before confirming the hand
had ended, and a real in-progress street transition (not a heartbeat)
landed inside it — caught with `PROBE_DEBUG=1` logging `actionTo`/`street`
per message, which showed two "idle" messages 4ms apart quoting FLOP/TURN,
not two heartbeat comments ~10s apart. Separately, the SSE reader itself
had to be rebuilt as a continuously-running background pump (mirroring
`spec/poker.test.ts`'s own `connectSse`, not invented fresh) rather than
the lazily-pulled async generator it started as: the generator only read
off the socket while something was actively calling `.next()` on it, so
holding the stream "idle" on purpose left real messages sitting unread
and gave them a late, bunched-up timestamp whenever the generator was
next resumed — caught the same way, seeing several heartbeats logged
back-to-back with ~0ms gaps right after what should have been a clean
10s-spaced idle window.

For (2), added `waitUntilNoHandRunning()`: polls (up to 120s) folding only
A's and B's own turns (never acting for a seat the probe doesn't own —
that resolves only via the server's own timer) until no hand is running,
then leaves both. Prints the count of other seated players up front with
a timing-inflation warning, and now treats "still seated after cleanup"
as a loud, `process.exitCode = 1` failure rather than a silently swallowed
`.catch(() => undefined)` the way the first version of `leave()` did.

**How I knew it was right:** Non-vacuousness, both fixes, against a local
app (`TURN_TIMEOUT_SECONDS=30`):
- Heartbeat: ran clean (`PROBE_ACTIONS=10`) — idle hold saw 6 messages
  over 25s, max gap 10001ms against a 10000ms heartbeat, no STALL. Then
  temporarily made `src/server.ts`'s heartbeat write a no-op
  (`if (false && !dirty) ...`), re-ran (`PROBE_ACTIONS=3`) — idle hold saw
  0 messages, correctly reported `STALL`, then reverted (`git diff
  src/server.ts` empty before committing).
- Leave-with-others: registered a third local account (`probe_c`), sat it
  down, and ran the probe with A and B joining it. It reported "1 other
  player(s) already seated" up front, ran 6 timed actions (median 5ms),
  and both A and B left successfully afterward (`seats` in
  `data/dev.sqlite3` showed only `probe_c` remaining, confirmed via direct
  SQL query before and after). `probe_c` was then left manually via a
  direct POST.
- `pnpm check` green (4 files, 24/24 tests) against the same local app
  throughout.

**Citation:** `c4412a4` (`scripts/latency-probe.ts`).

**Curated prompt:** "Before I approve Step 1, two fixes to the probe, same
step: 1. Stream health didn't measure anything... hold B's stream idle
for at least 25s... Flag any gap over 1.5x the heartbeat as STALL. Prove
it... 2. Leaving can fail when other players are at the table... wait
(poll the view, up to 120s) until no hand is running, then leave. If
either account is still seated at the end, print it loudly and exit
non-zero... Run both against the local app again, plus one run with a
third local account seated and never acting... Commit, log, then push
(this step is approved once these pass). Stop."

## 2026-10-19 — [routine]

**What happened:** Committed final brief Step 2's red test first:
`spec/poker.test.ts` test 9 (localhost only) reproduces cause 1 over HTTP.
One cookie jar opens A's SSE stream and sits A, logs out, registers and
sits B, and deals until A is to act. A POST to `/act` claiming `as=<A>` but
carrying B's cookie must get a 409 `identity_changed` with `nowSignedInAs`,
and must leave `table_state.version` unchanged.

**What I did instead of the obvious thing:** The first red run failed on a
precondition: `version` wasn't in the view yet, so the test failed before it
ever reached the claim under test. I moved the `typeof before.version ===
"number"` check after the 409 assertions, so the red shows the real bug,
and kept it so `undefined === undefined` can't pass the version comparison
later.

**How I knew it was right:** Red for the right reason, against a local app:
`expected 400 to be 409` (the engine's out-of-turn rejection, because B's
cookie acted as B). The other 24 tests stayed green in `pnpm check`, and
`seats` in `data/dev.sqlite3` was empty after the run (the cleanup logs A
back in to get a live cookie for A's seat).

**Citation:** `bb338e0` (`spec/poker.test.ts`).

**Curated prompt:** "Read CLAUDE.md, docs/final-brief.md and the latest
entries in process-log.md. Do Step 2 only. Report what you verified and
what you didn't, then stop and wait for me."

## 2026-10-19 — [judgement]

**What happened:** Fixed final brief Step 2 (test 9 red → green). All four
poker POST routes now refuse an `as` that doesn't match the cookie with a
409 `identity_changed`. The page sends `as`, shows a banner and stops on
that 409 or on a view whose `you` changed. The SSE stream ends itself once
its session is gone. Engine rejections become plain messages
(`src/poker/messages.ts`), and the status line survives renders.

**What I did instead of the obvious thing:** `messages.ts` keys on the
engine's error `code` (`engine.validate()` returns it:
`@pokertools/engine/dist/engine/poker-engine.js` `return { valid: false,
error: message, code }`), not on regexes over the message text. The text
embeds internal ids ("Player 2 attempted to act, but action is on seat 0")
and could change in any patch release. Raise/bet minimums read
`state.minRaise`/`state.bigBlind`, the same fields `actions/validation.js`
checks. The first browser run of the evidence repro also showed that
"banner on 409" alone isn't enough: B's sit push wakes A's stream, the new
session check ends it, and A's page sits stale through Chromium's ~3 s
reconnect. The reconnect itself (now with B's cookie) delivers a view whose
`you` differs, so the view path is what catches it when A never clicks.
Both paths were then checked separately. After an Opus review, three more
changes: the window stops painting views once its identity is lost
(otherwise A's window showed B's hole cards under a banner saying "playing
as A"); the 409 text no longer names the claimed account (a signed-out POST
with `as=1..N` would otherwise read every display name); and a stale
"reconnecting..." line is cleared when the banner appears.

**How I knew it was right:**
- `pnpm check` green, 4 files and 25/25 tests, against a local app;
  test 9 had been red as `expected 400 to be 409` at `bb338e0`.
- Real headless Chromium, one shared browser context (the evidence repro's
  setup), at 1920×1080 and 390×844. *post path:* A's Leave sent `as=<A>`
  and got a 409, `version` unchanged (e.g. 352 → 352). *push path:* B sat
  and dealt, and the banner appeared once A's stream reconnected.
  *signed-out path:* the "now signed out" banner appeared. In all six runs
  every table control was disabled, Reload worked and the window became B,
  and `scrollWidth - innerWidth` was 0. Screenshots inspected.
- A status message ("There's a bet to you, so you can't check…") survived
  a push (a third player sitting) and cleared on the next action (Call).
- SSE close: a stream whose session was logged out ended at 10.0 s (the
  next heartbeat). A control run with no logout stayed open past 22 s, with
  heartbeats at 10 s and 20 s.
- Messages over HTTP: out of turn → "It's not your turn."; call with
  nothing owed → "Nothing to call. Check instead."; an unknown type falls
  back; `as` equal to the cookie's user still acts (200).
- Hono's second `parseBody` call reuses the cache:
  `hono/dist/utils/body.js` `if (!isRawRequest(request) &&
  request.bodyCache.formData) return convertFormDataToBodyData(await
  request.bodyCache.formData, options);`.

**Not checked:** production (not pushed; the brief pushes only after owner
approval). Two real separate browser profiles were not tried, only one
shared context, which is the case this step is about. Keyboard tab order
through the banner was not checked.

**Citation:** `d5a09d8` (`src/poker/messages.ts`, `src/poker/page.ts`,
`src/poker/table.ts`, `src/server.ts`); `spec/poker.test.ts` test 9 red at
`bb338e0` → green at `d5a09d8`.

**Curated prompt:** "Do Step 2 only. Report what you verified and what you
didn't, then stop and wait for me."

## 2026-10-19 — [routine] (no commit)

**What happened:** The owner's approval checks for Step 2 (`d5a09d8`) before
pushing: the normal two-player case with `as=` set, the Step 1 probe as a
regression check, and keyboard access to the banner. All passed with no
code change.

**What I did instead of the obvious thing:** The first 390×844 run of the
two-player check stalled with "nobody to act". Rather than reading that as
an app bug, I checked `seats` and `table_state`. A player left over from my
own earlier aborted run (its `leave` had returned 400 mid-hand) was still in
seat 0, so the hand was 3-handed and waiting on a seat my script doesn't
control. I stood that seat up and re-ran on an empty table.

**How I knew it was right:**
- Two separate Chromium contexts (separate cookie jars), real buttons, at
  1920×1080 and 390×844. Both sat, one hand was played to showdown (winner
  shown, both hands revealed) and one to a fold, then both left. 15 POSTs
  per run, all 200 and all carrying `as=`. Every action reached the other
  page in 23–54 ms. No banner and no status message on either side;
  `scrollWidth - innerWidth` was 0.
- `pnpm probe:latency` against the local app (`PROBE_ACTIONS=20`): delivery
  median 3 ms, p95 5 ms, max 6 ms, 0/20 missed. Idle-hold max gap 10010 ms
  against a 10000 ms heartbeat, no STALL. Step 1's were median 4–5 ms,
  max 10001 ms. Both seats left; exit 0.
- At 390×844 the banner was triggered by keyboard only (Enter on a focused
  Leave). Tab order was Home → Reload, then it wrapped, skipping the
  disabled controls. Reload showed a visible focus ring in the screenshot,
  and Enter on it reloaded the window as the new account with no banner.

**Citation:** `d5a09d8` (unchanged); `scripts/latency-probe.ts`.

**Curated prompt:** "Step 2 is approved once these pass, then push: 1. Two
separate browser contexts... sit both, deal, play one hand to showdown and
one to a fold. No 409, no banner, every action shows on the other side.
2. Run the Step 1 probe against the local app... 3. Tab through the banner
and its Reload button at 390x844."

## 2026-10-19 — [judgement]

**What happened:** Final brief Step 3. The heartbeat is now a named `ping`
event every 5 s. Views carry `seq`/`bootId`, and the page renders only
views at least as new as the last one painted. A 12 s watchdog plus
1.5 s polling recovers a silent or dead stream without a reload. A
connection pill (Live / Reconnecting… / Offline) sits outside the
re-rendered markup. The raise amount and focus survive re-renders.

**What I did instead of the obvious thing:**
- **Pill states.** The first version showed Offline whenever a poll
  failed. During the brief's own kill-the-server check, that flipped to
  Offline within 0.1 s and stayed there, never showing Reconnecting.
  Flagged by an Opus review, confirmed in the browser log. Offline now
  means the browser reports no network, or nothing has answered for 30 s.
  A server restart reads as Reconnecting.
- **Polls time out after 4 s.** A hung server (simulated with SIGSTOP:
  sockets stay open but nothing arrives, the production failure mode)
  can't leave a poll pending forever.
- **Session check on every write.** The SSE loop, rewritten around a
  fixed ping schedule, had moved Step 2's session check to ping time only.
  It now runs before every write, push or ping.
- **Raise amount scoped to one decision.** Keeping it "across renders"
  would otherwise carry a typed 50 into the player's next turn.
- **Ping data is the table's `seq`,** not a per-connection counter, so a
  page can tell it missed a view and fetch it.
- **Timings in `src/poker/live.ts`.** It imports nothing, so the spec can
  import `SSE_HEARTBEAT_MS` without starting the server or opening the DB.

**How I knew it was right:**
- `pnpm check` green: 4 files, 27/27 tests (new tests 10 and 11).
- Non-vacuous (ping): with the ping temporarily written as a comment
  again, test 10 went red ("timed out after 6000ms waiting for any SSE
  event") and test 11 stayed green; reverted.
- Non-vacuous (seq gate, in a real browser): a POST response rewritten to
  an older view (2 seated) arriving after a newer push (3 seated) left the
  page at 3. With the gate disabled it painted 2; reverted.
- Raw stream: `retry: 2000` first, pings at +5.0 s and +10.0 s carrying
  the table seq, both headers present. A logged-out stream ends at the
  next ping (5.0 s), or within 6 ms if a push arrives first, with no
  further view sent.
- Watchdog, headless Chromium at 1920×1080 and 390×844:
  - **Server killed for 20 s:** Live → Reconnecting… within 0.1 s, held
    through the outage, Live 0.6 s after restart. B's new deal then
    showed on A's page with no reload (1 navigation entry).
  - **Server SIGSTOPped for 20 s:** the pill stayed Live until the
    watchdog fired at 12 s, then Reconnecting, then Live on resume.
  - **Longer outage (35 s):** Offline at 30 s, recovered on restart.
  - **Browser `setOffline`:** Offline at once, Live within 0.1 s of
    coming back online.
  - No horizontal scroll at either size.
- Re-renders: a typed raise amount ("60") kept its value and focus across
  a push, and typing continued in the field ("605"). Focus on Call
  survived a push. The amount cleared once the turn moved on.
- The Step 2 banner paths (post, push, signed out) re-run at 390×844,
  all still correct.

**Probe (local, `PROBE_ACTIONS=20`), next to Step 1's:**

| | Step 1 | Step 3 |
|---|---|---|
| Delivery median | 4–5 ms | 3 ms |
| Delivery p95 | 10 ms | 6 ms |
| Delivery max | 10 ms | 9 ms |
| Missed | 0 | 0/20 |
| Idle-hold max gap | 10001 ms | 5006 ms (heartbeat now 5 s), no STALL |

**Not checked:**
- Production: not pushed; the brief pushes only after owner approval.
- A real proxy (Fly's) killing or buffering the stream. The local
  kill/SIGSTOP stand in for it.
- `visibilitychange`/`pageshow` re-fetch was not exercised in the browser
  (only read).
- Pill colours copy the mockup tokens as literals until Step 5's token
  stylesheet exists.

**Citation:** `dbf2c4e` (`src/poker/live.ts`, `src/poker/page.ts`,
`src/poker/table.ts`, `src/server.ts`, `spec/poker.test.ts`,
`scripts/latency-probe.ts`).

**Curated prompt:** "Do Step 3 only. Report what you verified and what you
didn't, then stop."

## 2026-10-19 — [judgement]

**What happened:** Final brief Step 4, red commit. Four failing tests for
ghost seats, plus the named constants they read (`src/poker/live.ts`;
`TURN_TIMEOUT_SECONDS` moved there so the spec can import it without
opening the database). No behaviour changed.

**What I did instead of the obvious thing:**
- **Test 3 also asserts the away deadline.** The brief says that with
  presence forced to "always present", tests 1 and 3 must go red and
  nothing else. But "times out twice, then stood up at hand end" doesn't
  depend on presence: two timeouts stand a player up either way. As
  written, test 3 would have stayed green, or gone red only by running out
  of time. So test 3 also checks that every ghost turn after the first
  has a parsed `turnDeadline` − now ≤ `AWAY_TURN_SECONDS` + 1 s. An Opus
  second opinion agreed. This partly overlaps test 1.
- **Held streams for the existing two-player tests.** After this step, a
  player with no stream is away and gets a 5 s turn, but tests 7 and 8
  wait out a full 30 s turn. Both players in that block now hold a
  stream for the whole test (`connectSse` already reconnects on a drop).
- **Test 3 pins who acts first.** A fresh engine puts the button on the
  lowest occupied seat (`moveButton` in `@pokertools/engine`'s
  `actions/dealing.js`), so the first player to sit acts first preflop.
  If the ghost acted first, their first timeout would fold and end the
  hand, so two timeouts in a row could never happen. The test asserts
  that order rather than assuming it.

**How I knew it was right:** Ran against a scratch server built from this
tree (`TURN_TIMEOUT_SECONDS=12`, 3 s graces, `AWAY_TURN_SECONDS=3`): 4
failed, 11 passed. Tests 1 and 3 failed on the deadline ("expected 11998
to be less than or equal to 4000"). Tests 2 and 4 failed because
`seats[].away` didn't exist yet.

**Citation:** `97a4e0d` (`spec/poker.test.ts`, `src/poker/live.ts`).

**Curated prompt:** "Do Step 4 only. Commit the red tests first, then the
fix. Test migration 0004 on a copy of a database that has seats and a
hand in progress, not only on a fresh one."

## 2026-10-19 — [judgement]

**What happened:** Final brief Step 4, green commit. In-memory presence
per table; away players get a 5 s turn, or have their turn pulled in to
5 s if they go away mid-turn. Ghosts are stood up at hand end, before a
deal, and between hands by a timer. The view carries `seats[].away` and a
one-shot `notice`. Migration 0004 clears table 1 once.

**What I did instead of the obvious thing:**
- **The pull-in doesn't bump `version`.** It's a version-guarded UPDATE
  of `turn_deadline` only. Tests 4 and 9 assert `version` is unchanged,
  and their players hold no stream, so a bump landing between their two
  reads would make them flaky. A shorter deadline also doesn't invalidate
  an action already validated against that version. `seq` still bumps,
  so pages re-render. (From the Opus review.)
- **The 60 s counts from when the player became away**, i.e.
  `max(last seen + AWAY_GRACE_MS, boot + BOOT_GRACE_MS)`, not from when
  their stream closed. Counting from the close would stand people up
  after about 50 s away.
- **The presence timer works from `seats`, not the presence map, and is
  armed at boot.** A ghost seated before a restart has no map entry; it's
  exactly the seat the boot-grace rule has to catch.
- **The SSE route unsubscribes in a `finally`, and unsubscribe can run
  twice safely.** Without that, a write throwing on a closed socket would
  skip the unsubscribe and leave the user counted as present forever,
  which is the bug this step fixes.
- **Timeout counts are in memory, keyed by user, and cleared on leave.**
  A restart forgets them; the 60 s rule is the backstop.
- **The page shows "Away" and the notice.** The owner decision says the
  seat shows "Away" meanwhile, and the brief's checks don't cover that, so
  I added a minimal label to the current page (Step 7 rebuilds it).

**How I knew it was right:**
- `pnpm check` at default timings (30 s turn, 10 s grace, 30 s boot
  grace), scratch server on a fresh DB: typecheck + 31/31. Also 31/31
  with short timings.
- Non-vacuous: with `awaySince()` temporarily returning "never away",
  exactly tests 1 and 3 went red ("expected 11999 to be less than or equal
  to 4000") and 29 passed. Reverted; `grep` confirms no trace remains.
- **Migration 0004 on a copy with seats and a hand in progress:** I
  backed up `data/dev.sqlite3`. The pre-fix code (`97a4e0d`, in a scratch
  worktree) ran on the copy: 3 seats (one a ghost left from my "before"
  probe), a hand dealt, one call made (PREFLOP, seat 1 to act, deadline
  set, version 717). Then I killed it with `kill -9`. The fixed code
  booted on that file:
  - 0004 was recorded in `schema_migrations`; table 1 had 0 `seats` and
    0 `table_state` rows. `hand_results` (394), `users` (461) and
    `poker_tables` were unchanged. No timer error in the log.
  - It dealt normally from no `table_state` row: view version 0, then
    1 after start, fresh 1000 stacks, a 30 s deadline. A fold ended the
    hand and wrote 2 `hand_results` rows (396). The line that makes a
    missing row version 0 is `src/poker/table.ts:610`,
    `writeFreshTableState(tableId, engine, existing?.version ?? 0);`.
  - A second boot on the same file didn't re-apply 0004: one
    `schema_migrations` row, and the seats and hand from the first boot
    were still there.
- **Boot grace and the between-hands timer**, timed from process start
  with default numbers, 2 seated users with no streams: present until
  boot+30.4 s, then away; stood up with the `left_away` notice at
  boot+90.2 s.
- **Probe, with one extra seated account whose stream is never opened**
  (8 actions, default timings; 8080 for "before", a scratch server for
  "after"):

  | | Before (Step 3 code) | After, ghost away at deal | After, ghost dealt in, then away |
  |---|---|---|---|
  | Hand 1 | 30.2 s | 0.03 s (stood up at deal) | 15.0 s (30 s turn pulled in to 5 s once away) |
  | Hand 2 | 29.5 s | 0.01 s | 0.01 s (stood up at next deal) |
  | Delivery median / max | 5 / 6 ms | 3 / 5 ms | 3 / 4 ms |
  | Missed | 0/8 | 0/8 | 0/8 |

- Browser (headless Chromium, 1920×1080 and 390×844): the ghost's seat
  showed "Away" 10.0 s after they sat, with no reload (1 navigation).
  Start hand stood them up and showed "… left the table (away)."
  Horizontal overflow 0 at both sizes; I looked at the screenshots.

**Not checked:**
- Production: not pushed. The brief pushes only after owner approval,
  and the deploy runs 0004 against the live table.
- A real CI run (Docker image, `--tmpfs /data`). The local runs used
  `node src/server.ts`, with the same defaults CI uses.
- The "2 timeouts in a row" path in a real browser (covered only by
  test 3), and the mid-turn pull-in in a browser (only via the probe and
  test 1).
- Mid-turn pull-in racing a real action in the same millisecond. Read
  from the code: the guarded UPDATE no-ops if the version moved.
- ADR 0004 is not drafted (the owner's to write).

**Citation:** `a5a7de6` (`src/poker/table.ts`, `src/server.ts`,
`src/poker/page.ts`, `migrations/0004_clear_table_1.sql`); `97a4e0d`
(tests).

**Curated prompt:** "Do Step 4 only. Commit the red tests first, then the
fix. Test migration 0004 on a copy of a database that has seats and a
hand in progress... Report what you verified and what you didn't, then
stop and wait for me. Don't push until I approve."

## 2026-10-19 — [judgement]

**What happened:** Before the Step 4 push, the owner raised two numbers:
`AWAY_STAND_MS` from 60 s to 5 minutes, and the stand-up rule from 2 to 5
timeouts in a row. Phones drop the stream whenever the app goes to the
background, and standing up resets chips. The 5 s away turn and the 10 s
grace stay. I updated the constants, test 3, and the brief's Owner
decisions and Step 4 text.

**What I did instead of the obvious thing:**
- **Test 3 rebuilt rather than renumbered.** Changing "2" to "5" in the
  old test would have passed for the wrong reason. Hand 1 now stops the
  ghost at exactly 4 timeouts and asserts they're still seated, so a rule
  that fires early goes red. The ghost's stream then reopens for the next
  deal (the phone back in the foreground, since a deal only deals in
  present players). Hand 2 ends at exactly the 5th timeout: alice
  min-raises first, so the ghost faces a wager and the timeout is a fold.
  That makes a rule that fires late go red too. The raise amount is a
  raise-to total; I checked `handleRaise` and the "RAISE amounts are
  raise-to totals" comment in `@pokertools/engine`'s `actions/` before
  relying on it.
- **Why hand 2 needed the raise.** I measured it first: with only a bet,
  hand 2 ended at 6 timeouts. `startHand` builds a fresh engine each hand,
  so heads-up the button is always the lower seat. The ghost is big blind
  again, so they get the option (5th) and then act first on the flop (6th).
- **Correction to the previous entry's non-vacuous result.** Re-running
  "always present" for this change, test 3 at first stayed green. A trace
  showed every ghost turn reporting `away false` with 3.6–3.9 s left.
  `waitUntilAway` gives up after its cap (about 8 s here), which ate the
  12 s turn down to under the 4 s limit, so "time left ≤ 4 s" passed by
  coincidence. The same weakness was in `97a4e0d`'s test 3. Its earlier
  red under sabotage came from the first ghost turn, which had no wait
  before it. Each ghost turn now also asserts `away === true` from the
  view. Two discarded runs along the way: one where a curl check left a
  stray player seated (4 red tests, all from the extra seat), and two
  where `-t` matched "3. chip conservation" instead of test 3.

**How I knew it was right:**
- Scratch server, short timings (`TURN_TIMEOUT_SECONDS=12`, 3 s graces,
  `AWAY_TURN_SECONDS=3`, constants at their new defaults), full spec:
  - control (real code): 31/31.
  - presence forced to "always present": exactly tests 1 and 3 red ("expected
    11998 to be less than or equal to 4000"; "expected false to be true").
  - server threshold 2 (spec reads 5): only test 3 red ("expected undefined
    to be defined": the ghost was gone after hand 1).
  - server threshold 6: only test 3 red (the ghost's seat was still there
    after the 5th timeout).
  All reverted; `grep` finds no trace.
- `pnpm check` at the real defaults against a fresh scratch server:
  typecheck + 31/31 in 181 s. The server log was clean.

**Not checked:** No browser look at this change; the page reads `away`
and `notice`, and neither changed. The 5-minute rule wasn't timed end to
end at its real length. The 60 s version was (boot+90.2 s, previous
entry), and only the constant changed.

**Citation:** `b31671b` (`src/poker/live.ts`, `spec/poker.test.ts`,
`docs/final-brief.md`).

**Curated prompt:** "the owner is changing two Step 4 numbers:
AWAY_STAND_MS from 60 s to 5 minutes, and the '2 consecutive timeouts'
stand-up rule raised to 5... Update the constants, the tests that depend
on them (keep them non-vacuous), and the brief's 'Owner decisions' line
to match. pnpm check green, commit, log, push, confirm CI and deploy."

## 2026-10-19 — [judgement]

**What happened:** Step 5. `src/html.ts` is now the one layout. `page(title,
body, { user, current, next })` renders "<title> · House Game" (just
"House Game" on home), the font links, `/assets/site.css`, `/favicon.svg`
and the header with `aria-current`. `nav()` in `server.ts` is gone.
Forgot/reset password and profile moved onto the paper panel with their
wording and fields unchanged. `/readme/` is a 70ch column on the room
colour.

**What I did instead of the obvious thing:**
- **Stylesheet freshness:** the URL is `site.css?v=<12-hex sha256 of the
  file>`, computed once at boot. The current hash is served `immutable`;
  any other `v` (or none) gets `no-cache`. So an old page linking an old
  hash revalidates instead of being pinned to a stale copy.
- **Form styles scoped to `.panel`.** `auth.css` styles bare `input`,
  `select` and `fieldset`. Copying it verbatim would have restyled the
  table page's raise input and the not-yet-rebuilt login and register
  forms (Step 6's job). Tokens are verbatim; only the selectors gained
  `.panel`.
- **The table's connection pill moved into the header nav** (a `navExtra`
  slot the layout only places), as in the mockup. It stays outside
  `#table-root`, so Step 3's "a render can't wipe it" still holds.
- **`errorList` keeps `role="alert"` and its `li`s** inside the new
  `.summary` box, because `spec/accounts.test.ts` reads errors through
  `[role="alert"] li`. Step 6 replaces it.
- **Discarded:** the first render had no side gutter on login and
  register (content flush at x=0 at both sizes), found by an Opus review
  of the screenshots. Fixed with a default `main` gutter that the page
  classes override.

**How I knew it was right:**
- Headless Chromium against a scratch server on a copy of the dev DB, at
  1920×1080 and 390×844. Pages: home (signed out and in), about, login,
  register, forgot, reset, reset with errors, profile, profile with errors,
  table.
  - `scrollWidth - innerWidth` was 0 on all 22.
  - The sensor isn't vacuous: on forgot at 390 it read 0, then 146 with a
    500px element injected, then 0 after removing it.
  - Titles and `aria-current` were correct, the stylesheet was linked,
    both Google fonts loaded, and the table pill reached `live` from the
    header nav.
- Tab order on login, register, forgot, reset, profile and table runs
  wordmark → nav → fields → submit at both sizes. Every stop showed the
  brass focus ring, or on panel inputs the mockup's brass glow.
- `/assets/site.css` without a hash gave `no-cache`; with the current
  hash, `immutable`.
- `pnpm check` against the scratch server: typecheck plus 31/31
  (`home.test.ts` and the README check included), before and after the
  gutter fix.

**Not checked:**
- Production (not pushed) and the Docker image.
- Keyboard focus was read from computed styles in headless Chromium, not
  tabbed by a person.
- `/results` is linked in the nav but doesn't exist until Step 8 (404
  today).
- About's h1 reads "no name". That comes from README.md, which is the
  owner's to edit.

**Citation:** `083bf33` (`src/html.ts`, `src/assets/site.css`,
`src/assets/favicon.svg`, `src/server.ts`, `src/poker/page.ts`).

**Curated prompt:** "Do Step 5 only. Report what you verified and what you
didn't, then stop and wait for me."

## 2026-10-19 — [routine]

**What happened:** The owner's crit 10 reflection went in as
`reflections/crit-10.md`, copied from their Windows folder with `cp`,
not retyped. Earlier, the text pasted into chat had ended mid-sentence,
so I didn't commit it then.

**What I did instead of the obvious thing:** Before copying, I checked the
source file's last line was "That retest found the real causes." (as the
owner asked) and that it had no CRLF line endings. After copying, `cmp`
against the source reported identical. It was committed alone.

**How I knew it was right:** `cmp` showed the file byte-identical to the
owner's copy. `git status` showed only that file staged.

**Citation:** `67ca27b` (`reflections/crit-10.md`).

**Curated prompt:** "Copy the reflection from my Windows folder, don't
retype it... Check it ends with 'That retest found the real causes.'
Commit it alone, no edits."

## 2026-10-19 — [routine]

**What happened:** On approving Step 5, the owner asked for two changes:
hide the Results nav link until Step 8 builds `/results` (it was a 404),
and change README.md's first line from "# no name" to "# House Game".
The rest of README is untouched.

**What I did instead of the obvious thing:** I removed the link, not just
hid it with CSS. A hidden link would still be in the DOM and could be
tabbed to by some screen readers. A comment where it goes says Step 8
restores it. The `"results"` `NavItem` stays, for Step 8.

**How I knew it was right:**
- Headless Chromium on a scratch server at 1920×1080 and 390×844. The
  nav reads Table / About / Log in / Register signed out, and
  Table / About / Profile / Log out signed in.
- `scrollWidth - innerWidth` was 0 on all 22 page and viewport pairs,
  and the table pill reached `live`.
- `/readme/`'s h1 is "House Game".
- `pnpm check`: 31/31.

**Citation:** `bae2ef8` (`src/html.ts`, `README.md`).

**Curated prompt:** "Hide the Results nav link until Step 8 builds
/results. Owner-approved README edit: change only the first line from
'# no name' to '# House Game'."

## 2026-10-19 — [judgement]

**What happened:** Step 6: log in, register, forgot and reset password were
rebuilt from the mockups. Every rule and message now lives in
`src/account-messages.ts`; `src/account-pages.ts` only lays them out.
Both log-in and register now land on `/tables/1` by default.

**What I did instead of the obvious thing:**
- The checklist's five rules are data (a regex source per rule) that the
  server and the page script both read, instead of the script carrying its
  own copy of the rules.
- The generic wrong-login message sits under the password field, not the
  username. The first version put it on the username; I moved it after
  seeing the render, because the password is the box the person has to retype.
- `normaliseAnswer()` (`src/accounts.ts`) is
  `answer.trim().toLowerCase().replace(/\s+/g, " ")`, so the register page's
  "Capitals and extra spaces don't matter" is true.

**How I knew it was right:**
- `pnpm check`: typecheck clean, 38/38 tests.
- Non-vacuous: I removed the error id from `aria-describedby`. 7 tests went
  red (the five per-rule password tests, the failed-register DOM test and the
  select-exclusion test). I reverted and confirmed with `diff`.
- Headless Chromium at 1920×1080 and 390×844, over HTTP:
  - `scrollWidth - innerWidth` was 0 on login, register, their error
    states, forgot and reset.
  - Tab order was header, then fields in order, then Show/Hide, then submit.
  - Show/Hide toggled with Enter and with Space.
  - The checklist ticked 00000 → 11111 as the password was typed.
  - Each select disabled the other's choice.
  - A failed submit focused the summary, showed inline errors with
    `aria-invalid`, and kept typed values except the password.
- Not checked in a browser: the lock-out `<time>` converted to the visitor's
  zone; a successful reset landing on the log-in page with its note (covered
  only by `spec/accounts.test.ts`); the profile page; the log-in and register
  *success* redirects to `/tables/1` (covered only by the spec).
- A mid-run slip: `pkill -f "node src/server.ts"` matched my own shell and
  killed it with the sabotage still in the file. I confirmed the file was
  still sabotaged, ran the red check, reverted, and diffed to confirm.

**Citation:** `7d3eb2f` (`src/account-messages.ts`, `src/account-pages.ts`,
`src/server.ts`, `src/assets/site.css`, `spec/accounts.test.ts`). Check name
that went red → green: "a failed register shows the field's error inside
that field's aria-describedby target".

**Curated prompt:** "Do Step 6 only. Report what you verified and what you
didn't, then stop and wait for me. Don't push."

## 2026-10-19 — [harness]

**What happened:** The owner asked, before approving Step 6, to show that a
failed login for an unknown username and one for a wrong password return
identical HTML, error placement included. I added that as a test.

**What I did instead of the obvious thing:** I did not string-compare the two
HTML bodies after a `sed` of the username. The test parses both responses,
blanks the echoed `#username` value through the DOM, and compares status,
`Set-Cookie` and the whole serialised document. It also asserts the page
contains the mismatch message, so two empty pages can't pass.

**How I knew it was right:**
- Green on the real code.
- Proved non-vacuous: I made the server put the error on `username` for
  unknown users only. That test, and only that test, went red. I reverted
  and it went green again.
- By hand with curl: both responses were `400` with identical headers apart
  from `Date`, and the bodies differed only on the echoed `value=` line.

**Citation:** `38d4174` (`spec/accounts.test.ts`). Check name that went
red → green: "a failed login looks the same for an unknown username and a
wrong password".

**Curated prompt:** "Show that a failed login with an unknown username and
one with a wrong password return identical HTML, error placement included,
apart from the echoed username. Add a test for it, and prove the test isn't
vacuous."

## 2026-10-19 — [routine]

**What happened:** The Opus review of `7d3eb2f` found two defects that this
commit introduced. Both are fixed here.
- A failed register submit marked each select's own chosen question
  `disabled` when the same question was picked twice, so the next POST sent
  no question at all and the person saw "Choose question N to continue".
- The recovery question count was defined in two places
  (`accounts.ts` and `account-messages.ts`).

**What I did instead of the obvious thing:** I reproduced the first one in
headless Chromium before changing code: both selects held a disabled selected
option and `FormData` listed no `question_*` keys. The fix is in the server
render and in the client-side exclusion: a select never disables the option it
currently holds. I deleted the duplicate constant from `accounts.ts`; nothing
else imported it. I did not touch the older weaknesses the review reported,
because the brief says to keep today's protections as they are (listed in the
report to the owner).

**How I knew it was right:**
- New test, red before the fix and green after.
- Proved non-vacuous: I restored the old server rule, that test alone went
  red, and I reverted.
- Browser: the same-question-twice re-render now submits both
  `question_1` and `question_2`, and the live exclusion still behaves at both
  viewports.
- `pnpm check`: typecheck clean, 39/39.

**Citation:** `08a2d3e` (`src/account-pages.ts`, `src/accounts.ts`,
`spec/accounts.test.ts`). Check name that went red → green: "a re-rendered
register form hides each question from the other select but never disables its
own choice".

**Curated prompt:** "Run the Opus subagent review the brief requires for
Step 6... Commit any fixes with log entries. Don't push."

## 2026-10-19 16:10 — [harness]

**What happened:** The week-11 class exercise ("Multi-user testing with Fly
logs") asks for logs that show a user connecting, disconnecting, an action
arriving, a broadcast, a rejection and a snapshot sent to one user. The app
logged almost nothing (only errors and "listening on"), so `flyctl logs` could
not show any of it. The owner was in class on a laptop, away from the WSL
repo, so this commit was made from the Claude chat session and pushed from
the laptop.

**What I did instead of the obvious thing:** Rather than scatter
`console.log` calls through the routes, one `logEvent()` helper
(`src/log.ts`) writes a single key=value line per event, and every line
carries `machine=` (Fly's `FLY_MACHINE_ID`), because the scale-out scenario
is only readable if each line says which machine it came from. Received and
rejected actions are logged in one Hono middleware around the four poker
POST routes, so no route can forget to log, and the rejection line carries
the same reason the player sees (or `identity_changed` for the 409).

**How I knew it was right:**
- `pnpm typecheck` clean; `pnpm test` against a local app: 4 files, 39/39.
- That run's server log held 610 event lines covering every event type: join,
  disconnect, action_received, action_rejected (an out-of-turn 400, the
  identity 409, a leave by someone not seated), action_applied, broadcast,
  snapshot (via stream and via GET /view), sit, leave_seat, hand_start, away,
  back, stood_up (reason=timeouts, 5 in a row), stream_closed and boot.
- Not checked: production output (needs the deploy), and no browser look,
  since nothing visible changed.

**Citation:** `b08de89` (`src/log.ts`, `src/poker/table.ts`, `src/server.ts`).

**Curated prompt:** "Class requirement: multi-user testing with Fly logs.
Make sure the system logs user connects/leaves, action received, broadcast,
rejection and a snapshot sent to one user; deploy it."

## 2026-10-19 16:20 — [judgement]

**What happened:** The class exercise asks for
`docs/testing/multi-user-test-report.md` with expected behaviour and
observations for eight scenarios, including (g) scaling to two machines.

**What I did instead of the obvious thing:** I wrote the expected behaviour
for each scenario from how the app is actually built, before the live test,
so the observations are checked against a prediction rather than written to
fit. Scenario (g) is reasoned and not run on production: each Fly machine has
its own volume and the live-update fan-out is in one process's memory, so a
second machine would mean a second, empty table, and scaling back down risks
leaving data on the wrong volume. The course's `fly.toml` also fixes the app
at one machine.

**How I knew it was right:** Every log line the report names was seen in the
local test run for `b08de89`, and the /tables/2 behaviour follows from
`buildView` returning undefined for an unknown table. Observations are not
filled in yet.

**Citation:** `045e515` (`docs/testing/multi-user-test-report.md`).

**Curated prompt:** "Class requirement: docs/testing/multi-user-test-report.md,
document expected behaviour and observations from the test."

## 2026-10-22 00:40 — [routine]

**What happened:** The owner left `docs/run-all-prompt.md`, one run covering
the multi-user test report, brief Steps 7–9 and the deploy, and asked for it
to be committed on its own first.

**What I did instead of the obvious thing:** Nothing beyond the ask; the file
was committed unedited.

**How I knew it was right:** `git show --stat f7857d3` lists only that file.

**Citation:** `f7857d3` (`docs/run-all-prompt.md`).

**Curated prompt:** "Read docs/run-all-prompt.md and follow it. Commit that
file first, on its own, with a log entry."

## 2026-10-22 00:50 — [judgement] (no commit)

**What happened:** Part 1 (run the multi-user scenarios against production
with the two PROBE accounts) could not start: production's `/login` rejects
PROBE_A's credentials (HTTP 400, the "don't match" page) while PROBE_B logs
in (303). Both env vars are set; the values were never printed.

**What I did instead of the obvious thing:** Rather than stop the whole run
or guess at the credentials, I notified the owner and moved on to Steps 7–9,
which are local. Part 1 and the push stay blocked on working credentials.
The run's order puts Part 1 first, but it describes the deployed build, so
doing it after Step 9 is not a loss as long as it happens before the push.

**How I knew it was right:** Two separate login attempts for A, one for B, each
by HTTP status code only.

**Citation:** (no commit); the run's stop rule on blocked checks.

## 2026-10-22 01:50 — [judgement]

**What happened:** Step 7 ports the table mockup onto the live view. The
brief says first paint and live renders must produce the same markup, and
asks which way that was done.

**What I did instead of the obvious thing:** Rather than keep the old two
renderers (TypeScript for the server, a hand-copied JS string for the
browser) and grow both, one renderer, `src/poker/render.js`, is imported by
the server and served verbatim to the browser's module client. An Opus
second opinion weighed this against server-rendered HTML fragments (an
extra round trip per push, in a brief about lag) and a parity test over two
renderers (detects drift after the fact). `checkJs` type-checks the file;
it is pure, taking `now` as an argument. Typechecking it found one real
divergence before any test: `currentBets` is a Map on the server and a
plain object after JSON, so the first paint's pot would have missed the
blinds. Other judgement calls, each checked against engine source rather
than memory: raise amounts are raise-to totals (`validation.js:120`, "RAISE
amounts are raise-to totals"), so the client sends the box's number as is;
the price to call mirrors `rules/current-bet.js` (never under the big blind
preflop); the raise box hides when `validateRaiseRights` would refuse.
`bare 0` in the mockup's `--bx: 0` makes `calc(-50% + 0)` invalid, which
dropped the bet marker's transform on the top and bottom slots; measured
(computed transform `none`), fixed with `0rem`.

**How I knew it was right:**
- Two Playwright contexts (separate cookie jars) at 1920×1080 and 390×844:
  sat, dealt, a hand to a fold and one to showdown by clicking. Every action
  appeared on the other page in 23–58 ms (median 43–44 ms, 14 actions per
  run), no console errors, `scrollWidth - innerWidth` 0, showdown faces
  shown only for the hand not mucked.
- Tab order at both viewports: wordmark, nav, Fold, Check/Call, amount,
  Raise, Min, ½ pot, Pot, All in, each with the brass ring
  (`rgb(226,178,79)`). A first sensor reported a non-brass ring; it was
  reading the element after the dock, so it was rewritten to read each
  control in turn before believing it.
- Same-browser scenario (Step 2): banner shown, every control disabled, at
  both viewports.
- Bet markers measured against name plates at both viewports: no overlap.
- Tests 12–16 (pot counts blinds; Call N = what you owe and raise-to accepted
  as is; first paint = served renderer's output; you are slot 0 with the real
  `data-seat`; Sit/Leave/Deal legality). Each was turned red by breaking its
  behaviour on purpose, and only its own test went red. Test 14 cannot see a
  `window` branch inside render.js (it runs the module in Node): proved on a
  served-file drift instead, and the limit is written in the test.
- First full run with the new tests in their own file went 13 red: vitest
  runs files in parallel and every test plays on table 1. Moved them into
  `spec/poker.test.ts`, which owns that table. `pnpm check`: 44/44.
- Opus review of diff and screenshots found 3 real defects (Fold/Call blocked
  by the raise box's min/max validation; your bet marker on your own hole
  cards at 1920; 390 screenshots older than the code), 3 smaller ones (Call N
  vs the engine's preflop price, a dead Raise after an incomplete raise, no
  screen-reader turn announcement) and tests 12–13 asserting label text. All
  fixed; re-review confirmed each. Typed 15 below the minimum, then Call, in
  a real browser: it sent.
- Not verified: a real phone; screen-reader output (only the live region's
  text was read back); the font file itself (Google Fonts was unreachable
  from curl here, though the browser rendered Young Serif).

**Citation:** `e9f6574` (`src/poker/render.js`, `src/poker/page.ts`,
`src/poker/table.ts`, `src/server.ts`, `tsconfig.json`, `spec/poker.test.ts`).

**Curated prompt:** "Part 2: brief Step 7 (the table, from
docs/design/table-mockup.html)."

## 2026-10-22 02:20 — [judgement]

**What happened:** Step 8 adds the home hero and `/results`. The ledger is
simple; the "last 20 hands" list is not, because `hand_results` has one row
per player per hand and no hand id.

**What I did instead of the obvious thing:** Rather than group rows by exact
`ended_at` (which works on fresh data) or add a migration with a hand id,
the hand's end is now stamped once in JS and passed to every row of that
hand, and older rows are clustered by time. The Opus review found the old
rows split: SQLite's `'now'` is fixed per statement and the commit runs one
INSERT per player, so the dev database's 394 rows grouped into 205 "hands",
24 of them one-player. A first 50 ms window then merged four scripted hands
into one 8-player group on a 6-seat table, which disproved my own comment
that two hands can't end that close. Measured the gaps instead: rows of one
hand were 0–3 ms apart; the closest separate hands, 29 ms. Window set to
10 ms. The `--red` token is 2.67:1 on the room colour, so negative nets use
a lifted red (6.04:1, computed) and keep the minus sign.

**How I knew it was right:**
- On a copy of `data/dev.sqlite3`: 193 hands of 2–3 players, every hand's
  nets summing to 0 (chip conservation, so each group is one real hand),
  versus 24 unbalanced groups by exact `ended_at`. The live dev file was
  never written; the scratch server ran on copies.
- Test 17 (ledger net = sum of that player's `hand_results` rows, both as
  `data-net` and as the visible signed text parsed back; sorted best first)
  went red for SUM→MAX, for the sort flipped, and for a dropped minus sign.
  Test 18: `/results` signed out redirects to `/login`.
- Headless Chromium, 1920×1080 and 390×844: home signed out, seated
  ("Back to the table") and signed in but not seated ("Take a seat"); results
  on fresh and legacy data. `scrollWidth - innerWidth` 0 on all; Results nav
  link present with `aria-current` on its page.
- `pnpm check`: 46/46.
- Not verified: the hero does not update live (it is the state at page
  load); Google Fonts was intermittently unreachable, so some shots show the
  fallback fonts.

**Citation:** `283d111` (`src/results.ts`, `src/server.ts`, `src/html.ts`,
`src/assets/site.css`, `src/poker/table.ts`, `spec/poker.test.ts`).

**Curated prompt:** "Part 3: brief Step 8 (home and results). Put the
Results nav link back."

## 2026-10-22 02:45 — [judgement]

**What happened:** Step 9's walk (minus the push): a brand-new visitor at
both viewports, clicking home → register → table → sit, deal, play a hand
out against a second browser → results → about → profile → log out, then
the latency probe against local.

**What I did instead of the obvious thing:** The run says to push once
after this part if every gate is green. The local gates are (`pnpm check`
47/47, `check:evidence` green, no open review finding that I can fix
without the owner), but the push was **held**: the run also requires,
before and after the deploy, the multi-user test against production and
the production probe, both with the PROBE accounts, and production rejects
PROBE_A's login (HTTP 400 on three tries, 00:50 to 02:20). Deploying
Steps 7–8 with no way to check them afterwards with the owner's accounts
fits the stop rule "a check stays red after two honest attempts". The Opus
review of the walk found nothing broken and three cheap fixes (a stale
finished hand on an emptied table, "Pot 0" reading as "Pot O" in Young
Serif, a bubble left after showdown), which were made. Three findings are
the owner's: duplicate display names in Regulars and the ledger, phone
seat names truncated as in the mockup, and the hero/Regulars alignment and
copy.

**How I knew it was right:**
- Walk at 1920×1080 and 390×844, by clicking: every step reached the
  expected URL with the title "<Page> · House Game", `scrollWidth -
  innerWidth` 0, no console errors; registering lands on `/tables/1`; nav
  after logout reads Table/Results/About/Log in/Register.
- Test 19 (an emptied table shows no stale board, bubble or pot) went red
  with the fix disabled, green with it.
- Probe against local (two local throwaway accounts, 30 actions): delivery
  median 4 ms, p95 7 ms, max 11 ms, 0/30 missed; idle stream max gap
  5005 ms against a 5 s heartbeat; both seats left at the end.
- Not verified: production (no push), a real phone, screen readers.

**Citation:** `1cac630` (`src/poker/render.js`, `spec/poker.test.ts`).

**Curated prompt:** "Part 4: brief Step 9, except the push. Do the full walk
at both viewports. Run the latency probe against local only for now."

## 2026-11-04 01:38 — [judgement] (no commit)

**What happened:** Pushed the five commits the 2026-10-22 run had held
(`f7857d3`..`d8795ad`, Steps 7–9 and their log entries), CI built and
deployed them, and / and /tables/1 were loaded on the live site at both
viewports.

**What I did instead of the obvious thing:** The run's push gate also
requires the latency probe and multi-user checks against production with the
PROBE accounts. Production still rejects those accounts, which is why the push
was held on 2026-10-22. The owner waived that gate for this push and will check
production by hand, so I pushed on the local gates alone and did not run
the production probe. I pushed exactly `d8795ad` (`git push origin
d8795ad:refs/heads/main`), so nothing else in the working tree could go
with it. `docs/final-brief-2.md` and `docs/wipe-and-push.md` stay untracked.

**How I knew it was right:**
- The local app was started the way it was for Step 9 (`run-scratch/serve.sh`,
  port 8090, a throwaway DB). `APP_URL=http://localhost:8090 pnpm check`
  passed 47/47, and `pnpm check:evidence` passed (8 cited commits resolve).
- Push `7eef4a6..d8795ad`. CI run 41654690228: check passed (spec against the
  Docker image, evidence, both secret scans), then deploy passed, including
  "Verify the deployed site is online" (14:32–14:37 UTC).
- Headless Chromium against https://comp4020-final-gera1t-2001.fly.dev,
  signed out, at 1920×1080 and 390×844. `/` returned 200 with the hero ("Table's
  open, 6 seats free", Take a seat) and Regulars. `/tables/1` redirected to
  `/login` as designed. `scrollWidth - innerWidth` was 0 and there were no console
  errors on all four.
- Not verified: the live table when signed in (no working production
  account), the production latency probe, the multi-user checks on production,
  a real phone. All of this is waived to the owner's hand check.

**Citation:** `f7857d3`..`d8795ad` on origin/main; GitHub Actions run
41654690228.

**Curated prompt:** "Push the 5 local commits that are ahead of origin/main,
nothing else. Run pnpm check and pnpm check:evidence; push only if both are
green. The PROBE production gate is waived by the owner for this push. Watch
CI and the deploy, then load / and /tables/1 on the live site at 1920x1080
and 390x844. Do not commit docs/final-brief-2.md."

## 2026-11-04 01:41 — [routine]

**What happened:** The owner left `docs/wipe-and-push.md`, one run covering
a production backup, a migration that wipes every account, and the push,
and asked for it to be committed on its own first.

**What I did instead of the obvious thing:** Nothing beyond the ask. The file
was committed unedited and `docs/final-brief-2.md` stays untracked. One
mismatch was noted for Part 3's stop: the file assumes Steps 7–9 go out in
the same deploy as the wipe, but they were pushed in the previous entry, so
the wipe will deploy on its own.

**How I knew it was right:** `git show --stat fffd55c` lists only that file.

**Citation:** `fffd55c` (`docs/wipe-and-push.md`).

**Curated prompt:** "docs/wipe-and-push.md is mine, I just updated it. Read
it and follow it. Commit that file first, on its own, with a log entry.
Leave docs/final-brief-2.md uncommitted."

## 2026-11-04 01:52 — [judgement]

**What happened:** Parts 1–2 of `docs/wipe-and-push.md`. I backed up the
production database and downloaded it, then added `0005_wipe_accounts.sql`,
which deletes every account and everything that belongs to accounts on the
next boot. Not pushed: Part 3 stops for the owner.

**What I did instead of the obvious thing:**
- On the machine, `/data/app.sqlite3` is 4 KB and nearly all the data sits in
  the 1.5 MB `-wal` file. Copying the main file over sftp would have given a
  near-empty "backup". The run's online `backup()` reads through a connection,
  so it includes the WAL. Before relying on its promise, I checked
  better-sqlite3 13.0.3's source (the same version on the machine):
  `lib/methods/backup.js:8` is an `async function`, and lines 40–47 resolve
  only when `remainingPages` is 0. It printed
  `{"totalPages":25,"remainingPages":0}`.
- To confirm the downloaded file really is the data, I counted the same
  tables in the live database (read-only). I didn't just trust that the
  file opens.
- The local test copy of `data/dev.sqlite3` was also made with `backup()`
  from a read-only handle, so the real dev file was never opened for
  writing (its sha1 was taken after the test).
- The migration lists the six tables explicitly, child tables first,
  instead of relying on `ON DELETE CASCADE`, as the run asks. The backup's
  `sqlite_master` was checked first: there are no other tables, views or
  triggers, and no `AUTOINCREMENT`, so no `sqlite_sequence` either.

**How I knew it was right:**
- Backup: kept at `~/house-game-backups/backup-2026-11-04.sqlite3` (mode
  600, outside the repo). `integrity_check` ok. Counts: users 6, sessions 7,
  security_questions 12, seats 2, table_state 1, hand_results 14. They are
  identical to the live database. The copy on the machine was deleted only
  after that.
- Local, on the copy (461 users, 598 sessions, 922 security_questions,
  1 seat, 1 table_state, 394 hand_results before boot): after booting, all
  six tables are at 0, `poker_tables` is 1, and `schema_migrations` lists
  `0004_clear_table_1.sql` and `0005_wipe_accounts.sql`. Two new accounts
  then registered, sat, dealt and folded a hand out (all 200), and both left.
- `pnpm check` 47/47 against a fresh scratch app (which applies 0005);
  `pnpm check:evidence` green.
- Not verified: the migration on production (needs the push); the
  "missing table_state is version 0" claim was checked by reading
  `src/poker/table.ts:691` and by the hand dealt above, not by a new test.

**Citation:** `e1986c6` (`migrations/0005_wipe_accounts.sql`).

**Curated prompt:** "docs/wipe-and-push.md is mine, I just updated it. Read
it and follow it."

## 2026-11-04 02:10 — [judgement] (no commit)

**What happened:** On the owner's "push" (Part 3 of `docs/wipe-and-push.md`),
pushed `fffd55c`..`df8c82b`. CI and the deploy passed, and migration 0005 wiped
production on boot. Part 4 stopped partway: the PROBE_A/PROBE_B credentials
are not in this session's environment (neither the shell nor `mise exec`), so
the PROBE accounts were not re-registered and the checks that need them did
not run.

**What I did instead of the obvious thing:**
- The PROBE gate before the push was waived by the owner. PROBE_A could not
  log in on production on 22 Oct, the wipe removes both PROBE accounts anyway,
  and the owner checks by hand on a real phone. The backup taken in Part 1 is
  the only way back.
- When the credentials turned out to be missing, I did not register stand-in
  accounts on production. That would have put made-up users into a database
  the owner had just wiped for a clean start, and the run names the PROBE
  credentials specifically. I stopped and reported instead.
- I pushed exactly `df8c82b` by hash, and `docs/final-brief-2.md` stays
  untracked. Steps 7–9 had already been deployed in `d8795ad`, so this deploy
  carried only the run file, the migration and log entries.

**How I knew it was right:**
- CI run 41658639459: check passed (spec against the Docker image, evidence,
  both secret scans), then deploy passed, including "Verify the deployed site
  is online".
- Production, read-only, counts only: users 0, sessions 0,
  security_questions 0, seats 0, table_state 0, hand_results 0;
  poker_tables 1. `schema_migrations` lists `0005_wipe_accounts.sql`, applied
  2026-11-03T15:01:22Z.
- Before anyone registered, headless Chromium loaded `/` signed out at
  1920×1080 and 390×844. Both returned 200, Regulars read "No one has
  registered yet.", the hero read "Table's open, 6 seats free",
  `scrollWidth - innerWidth` was 0 and there were no console errors.
- Backup: `~/house-game-backups/backup-2026-11-04.sqlite3`, sha256
  `7ed59469…bb8485e5`.
- Not verified: the PROBE registration and login, `/tables/1` signed in at
  both viewports, the two-browser hand with Live pill, the production latency
  probe, a real phone. All of these wait on the credentials or the owner.

**Citation:** `fffd55c`..`df8c82b` on origin/main; GitHub Actions run
41658639459.

**Curated prompt:** "push"

## 2026-11-04 02:40 — [judgement] (no commit)

**What happened:** Finished Part 4 of `docs/wipe-and-push.md` once the owner
added the PROBE credentials to `mise.local.toml`. Both PROBE accounts were
re-registered on the wiped production, and both log in. The two-browser
hand passed at both viewports, and so did the latency probe against
production. This replaces the PROBE_A login that failed on 22 Oct.

**What I did instead of the obvious thing:**
- Before registering, I ran both credential pairs through the app's own
  `registerErrors()` locally, printing pass/fail only. That way a rejection on
  production couldn't be confused with a bad credential. Both passed.
- I showed that the login check can go red. One deliberate wrong-password
  login for A got 400 and no session cookie, and the right passwords got 303
  and a session. The code has no lockout on login (only on recovery
  questions), so the bad try cost nothing.
- In the browsers, both accounts logged in through the real `/login` form,
  not by injecting cookies, so the form path on production is covered.
- Screenshots of the hand show the PROBE usernames. They were written into
  the repo directory by a relative path, found as untracked in
  `git status`, and moved to `~/run-scratch/prod-shots/` before anything was
  staged. Usernames are kept out of this entry and every other committed file.
- An untracked editor backup next to `mise.local.toml` turned out to hold the
  PROBE credentials, and `.gitignore` doesn't cover it. I left it untouched
  and flagged it to the owner. I only stage files by explicit path.

**How I knew it was right:**
- Register: A 303 → `/tables/1`, B 303 → `/tables/1`, both with a session
  cookie. Login: A and B 303 → `/tables/1` with a session cookie. Wrong
  password: 400, no cookie.
- Two headless Chromium contexts (separate cookie jars) at 1920×1080 and
  390×844: login form → `/tables/1`, pill Live. Both sit, A deals, and one
  hand is played by clicking (call, then checks) to showdown. Every action
  showed on the other page: median 58 ms / max 69 ms at 1920, median 61 ms /
  max 66 ms at 390, 13 actions each. Both pages read "Hand over", the pill
  stayed Live, `scrollWidth - innerWidth` was 0, no console errors, and both
  left. In the screenshots, each player sees only their own hole cards before
  showdown, and the winner's cards show at showdown.
- `pnpm probe:latency` against production, 30 actions: delivery median
  25 ms, p95 31 ms, max 33 ms, 0/30 missed. Stream gaps during actions:
  median 36 ms, max 45 ms. Idle hold: 13 messages, max gap 5005 ms against a
  5 s heartbeat. Both left.
- Production afterwards, read-only counts: users 2, seats 0, table_state 1,
  hand_results 16, security_questions 4, sessions 10.
- Not verified: a real phone (the owner's hand check), more than two players
  on production, screen readers.

**Citation:** `fffd55c`..`df8c82b` deployed by GitHub Actions run
41658639459; this entry follows `88e7318`.

**Curated prompt:** "I've added PROBE_A_USER, PROBE_A_PASS, PROBE_B_USER and
PROBE_B_PASS to mise.local.toml. Read them through mise exec, never print the
passwords. Carry on with Part 4 from registering the two PROBE accounts."

## 2026-11-04 02:50 — [harness]

**What happened:** During Part 4, an untracked `mise.local.toml.save` (an
editor's save-on-exit backup) turned up in the repo root holding all four
PROBE credentials, passwords included. `.gitignore` ignored only the exact
name `mise.local.toml`, so a `git add -A` or `git add .` would have committed
the passwords. The owner deleted both backups and asked for the ignore rule to
be widened.

**What I did instead of the obvious thing:** I changed the one existing line
to `mise.local.toml*` rather than adding a second line for `.save`. The glob
also covers `.save.1`, `~` and any other suffix an editor picks, and still
leaves the tracked `mise.toml` alone. The change was committed on its own.

**How I knew it was right:**
- Red, before the change: `git check-ignore` reported the real
  `mise.local.toml.save` as **not ignored** (02:22, Part 4).
- Green, after the change: `git check-ignore --no-index` reports
  `mise.local.toml`, `.save`, `.save.1` and `~` as ignored, and `mise.toml` as
  not ignored.
- `git status` shows only `docs/final-brief-2.md` untracked.
- Not verified: the pattern doesn't catch backups an editor writes to another
  directory, or names like `.mise.local.toml.swp` (vim's swap prefix).

**Citation:** `fc740d2` (`.gitignore`).

**Curated prompt:** "Change the .gitignore line mise.local.toml to
mise.local.toml* so editor backups of it are ignored too, commit that on its
own, log it as [harness]. Don't push."

## 2026-11-04 03:03 — [routine]

**What happened:** The owner handed over `docs/final-brief-2.md` (Steps
10–13: showdown for everyone, auto-deal, guest accounts, solo Casino
Hold'em) and asked for it to be committed first, on its own.

**What I did instead of the obvious thing:** Nothing beyond the ask: staged
only that one file by path, read it in full first.

**How I knew it was right:** `git status` showed it as the only untracked
file; `git show --stat 96b08af` lists only `docs/final-brief-2.md`.

**Citation:** `96b08af`.

**Curated prompt:** "Read CLAUDE.md, then docs/final-brief-2.md. Commit the
brief first, then do Step 10 only and stop."

## 2026-11-04 03:39 — [harness]

**What happened:** Step 10's red tests. Eight tests (20–27) in
`spec/poker.test.ts` for the brief's red tests 1–7: symmetric showdown
views for three seated players and a spectator, a preflop folder hidden,
a fold-out winner hidden, `winners[]` carrying seat/amount/handRank,
auto-deal (two present; one away; manual deal during the pause), and the
turn length read from `TURN_TIMEOUT_SECONDS`. Red on the unfixed build: 20,
21, 23, 24, 26.

**What I did instead of the obvious thing:**
- Test 20 first passed once in a full run on the unfixed build. Instead of
  taking that as noise, I looked at the hand in the database: nets `0,0,0`,
  a three-way split, where the engine shows every winner anyway. Tests 20
  and 21 now deal again when every live hand is a winner, so a split can't
  make them pass without the fix.
- Every hand is dealt on a fresh engine (`startHand`), so
  `state.handNumber` is always 1 (engine `dealing.js:241`, `handNumber:
  state.handNumber + 1` on a new engine's 0). "A new handNumber" in the
  brief can't be observed; the tests compare `handId` instead
  (`dealing.js:242`, `` handId: `hand-${action.timestamp}-…` ``).
- `cleanupTable` now retries a leave that's refused because the auto-deal
  dealt a hand while it ran. Without it, the fix would turn every later
  test red through leftover seats.
- `TURN_TIMEOUT_SECONDS` stayed 30 in this commit. Test 27 compares against
  the constant the server also reads, so it can't be red-first by a
  default change. Its sensor is proved after the fix instead.
- Process slip: this commit was made before `96b08af`'s log entry was
  written, against `CLAUDE.md`'s "before commit N+1, append N's entry".
  Both entries are written here, before the next commit.

**How I knew it was right:**
- Scratch server with short timings (`SHOWDOWN_PAUSE_MS=2500
  TURN_TIMEOUT_SECONDS=8`, 3 s graces, `AWAY_TURN_SECONDS=3`), a fresh
  database, the same env for `pnpm check`. Step 10 block run twice: the
  same five red (20, 21, 23, 24, 26) both times. Test 20 alone, six runs:
  red every time.
- The rest of the suite stayed green with the new `cleanupTable` (51/55,
  the four reds all Step 10's own; test 20 was the split-pot pass).

**Citation:** `a7b5187` (`spec/poker.test.ts`, `src/poker/live.ts`).

**Curated prompt:** (as above, Step 10 of `docs/final-brief-2.md`)

## 2026-11-04 05:15 — [judgement]

**What happened:** Step 10's fix. At a showdown with two or three players,
the loser saw every hand and the winner saw only their own. The 22 Oct
Step 7 entry saw exactly this and called it correct: "showdown faces shown
only for the hand not mucked" (log, 2026-10-22 01:50). It matched the
engine, not what the owner wants at a home game.

**What I did instead of the obvious thing:**
- No masking of my own. Once a hand ends at a showdown with more than one
  live hand, `tableShowdownHands` dispatches the engine's own `SHOW` for
  each, in `prepareAction`, before `commitPreparedAction` snapshots it. The
  engine source that decides it:
  - `dist/rules/showdown.js` `determineWinners()`: "All live hands are
    tabled when betting ends with an all-in. Otherwise, winners show and
    losing hands remain mucked by default." (winners get `shownCards`
    every index, losers `null`).
  - `dist/utils/view-masking.js` `getVisibleHand()`: at `SHOWDOWN`, an
    ACTIVE/ALL_IN opponent with `shownCards === null` → `return null;`.
  - `dist/engine/game-reducer.js:87`, `case "SHOW"` → `handleShow`.
    `dist/actions/showdown-actions.js:15-23` throws "Can only show cards at
    showdown" off `SHOWDOWN` and "Cannot show cards after folding" for a
    FOLDED player.
  - A fold-out also ends on street `SHOWDOWN` (`betting.js`
    `awardPotToLastPlayer`), so the live-player count, not the street,
    tells them apart.
  - Real actions and the turn timer both reach it: `engine.act` is called
    only in `prepareAction`, and `runTimeout` → `applyAction` →
    `prepareAction`.
- `handRank` isn't "Two Pair, Kings and Tens" as the brief says. It's the
  category alone: `showdown.js:137-138`, `rankDescription(rank(cardCodes))`,
  one of nine strings in evaluator `dist/models/hand-rank.js:21-31`. The
  prompt says "won 140 with two pair". Kickers would need
  `winners[].hand`, the owner's call.
- The Opus review found 11 things. Acted on:
  - An auto-deal that failed with a non-`PokerError` (a busted seat: the
    engine won't seat a 0 stack, `validation.js:193`, "Stack must be
    positive") left "Dealing…" on every page. Now every failure
    broadcasts, and the two needed must have chips.
  - The auto-deal went through `startHand`'s stand-up-the-away step, which
    turned "stood up after 5 timeouts or 5 min" into "stood up 6 s after
    any hand ends". The auto-deal now deals present players and stands
    nobody up; a manual deal still does, as Step 4 set.
  - Side pots: the engine names a one-player pot "Uncontested", which made
    "birch and ash split 160" out of two separate pots. Now one clause per
    winner. Checked with real engine-shaped winners in a scratch render:
    "birch won 100; ash won 60 with two pair."
  - Test 26 couldn't catch a stale timer dealing early; it now has a part
    that does.
  - Also: `nextHandAt` armed after stand-ups; no auto-deal re-armed on boot
    (presence unknown in the boot grace); `cleanupTable` throws instead of
    leaving seats; stale "30 s" comments; the countdown's wrap indent.
- Not acted on, flagged to the owner: a hand that ends inside `deal()`
  (both blinds all-in) is never settled in `startHand`, and busted seats
  stay seated at 0. Both predate this step. `README.md:14` still says "30
  seconds"; README is the owner's.

**How I knew it was right:**
- `pnpm check` 55/55: twice with short timings (`SHOWDOWN_PAUSE_MS=2500`,
  `TURN_TIMEOUT_SECONDS=8`, 3 s graces), once with CI's defaults (20 s, 6 s;
  185 s run), and again after the last render-only change.
- Deliberate breaks, each restored and `cmp`'d against a good copy:
  - `SHOW` off → only 20 and 21 red.
  - Scheduler off → only 24 and 26 red.
  - `startHand`'s cancel and `runAutoDeal`'s version check both off → 26 red.
  - Presence check and the auto-deal's away filter both off → 25 red.
    Either one alone stays green, by design.
  - App at `TURN_TIMEOUT_SECONDS=9`, spec at 8 → 27 red ("expected 9 to
    be 8").
- Two Playwright contexts at 1920×1080 and 390×844, CI timings:
  - After a showdown, each page draws the other's dock cards exactly.
  - After a fold-out, neither page draws the winner's faces.
  - The countdown ticks "6 s" → "5 s", and the auto-dealt hand arrived on
    both pages about 6.6 s after the hand ended.
  - No overflow, no console errors.
  - A real split pot came up: "split 20 with a pair". I looked at the
    screenshots.
- Not verified: a real phone backgrounding the tab (the visibilitychange
  change is read, not exercised); production. One full run before the
  review fixes had ghost-seat test 3 red ("4964 to be ≤ 4000"): a window
  between `away` turning true and the presence timer pulling the deadline
  in. That code is unchanged since `a7b5187`; 1 in 8 full runs since. Not
  fixed here, flagged.

**Citation:** `a7b5187` (red) → `5ce1305` (green): tests 20, 21, 23, 24, 26
red → green.

**Curated prompt:** "Read CLAUDE.md, then docs/final-brief-2.md. Commit the
brief first, then do Step 10 only and stop."

## 2026-11-04 11:20 — [harness]

**What happened:** The owner asked for one small step before Step 11, red
first: settle a hand that ends at the deal, stand up a player with 0 chips
at hand end ("<name> is out of chips"), and fix the flaky ghost-seat test.
Tests 28–30 were added and committed red.

**What I did instead of the obvious thing:**
- Reaching "both blinds all in" by play takes dozens of hands (at most 20
  chips change hands per hand from 1000-chip stacks). Rather than a test
  that plays 100 hands, a test-only route sets stacks between hands:
  `POST /test-hooks/tables/:id/stacks`. It's mounted only when
  `TEST_HOOKS=1` and `NODE_ENV !== "production"`. The Dockerfile sets
  `ENV NODE_ENV=production`, so the image CI tests and Fly runs never has
  it, and test 28 skips there.
- The hook went into the red commit, so test 28 fails for the real
  reason, not for a missing route.
- Tests 29–30 need no hook: all-in hands bust someone in one or two deals.
- Engine facts the tests rest on (scratch script against 1.0.20): stacks
  5 and 10 at blinds 5/10 end at `SHOWDOWN` straight out of `deal()`, with
  stacks 0/15, sum conserved; the loser is left at 0 with status ALL_IN.

**How I knew it was right:**
- Red against a scratch server (`TEST_HOOKS=1`, short timings), each for
  its own reason: 28 "expected [] to deeply equal [1, 2]" (no
  `hand_results` rows); 29 the busted player still seated; 30 the sit
  refused (still seated).
- The flake's red evidence is not a committed test: an 800 ms delay
  injected into the presence timer (scratch edit, never committed) made
  ghost test 3 fail 3/3 with "expected 4968–4974 to be ≤ 4000", the same
  signature as the original "4964".

**Citation:** `c665585` (`spec/poker.test.ts`, `src/server.ts`,
`src/poker/table.ts`).

**Curated prompt:** "Before Step 11, one small step, red first. (1) A hand
that ends straight from the deal must record results and stacks like any
other … (2) Owner decision: a player with 0 chips at hand end is stood up
automatically, with a notice "<name> is out of chips" … (3) Find the root
cause of the flaky ghost-seat test and fix it; show it passing 20 full runs
in a row. Commit, log, and stop."

## 2026-11-04 13:01 — [judgement]

**What happened:** The fix for the small step before Step 11: a hand that
ends at the deal settles like any other, a player at 0 chips is stood up
("<name> is out of chips"), and the root cause of the flaky ghost-seat
test is found and fixed.

**What I did instead of the obvious thing:**
- **Flake root cause, proven before fixing.** The obvious move was a wider
  margin in ghost test 3. Instead I tested a hypothesis first:
  - `buildView` computed `away` from `Date.now()`, but the turn deadline
    moved to `AWAY_TURN_SECONDS` only when `pullInDeadlineIfAway`'s
    `setTimeout` fired.
  - `scryptSync` on every register (`src/crypto.ts`) and parallel test
    files block the event loop, so that timer can run late. A view in the
    gap says `away: true` beside the full deadline.
  - An 800 ms delay injected into that timer (scratch edit, never
    committed) reproduced it 3/3: "expected 4968–4974 to be ≤ 4000",
    against the original "4964".
  - It was a product bug too: a page could show "Away" beside a full turn
    ring.
- **The flake fix: no timing changes.** `effectiveDeadline()` is a pure
  function: the stored deadline, or `max(awaySince, turnStart) +
  AWAY_TURN_SECONDS` once the actor is away. `buildView`, `turnSeconds`,
  `scheduleTimeoutFor`, `runTimeout` and `pullInDeadlineIfAway` all read
  it. With the same 800 ms lag, test 3 passed 3/3.
- **One settle path, not a copy.** `writeHandSettlement` and
  `afterHandEnded` are shared by `commitPreparedAction` and `startHand`'s
  new at-deal branch.
  - That matters because test 28 needs the test hook and so can't run in
    CI. The at-deal branch's only new code is the call into the shared
    path, which CI covers through tests 3, 6 and 17.
- **The Opus review found 1 bug and 3 should-fixes in my first fix.**
  - Confirmed by two new tests, red on that fix and green now:
    - 31: a seat already at 0 failed every deal ("start failed: Something
      went wrong."; the engine refuses a 0 stack, `validation.js:193`).
    - 32: after a heads-up bust, a newcomer got a hand dealt without
      pressing Deal.
  - Also fixed:
    - busters are stood up before ghosts, so a busted ghost reads "out
      of chips";
    - notices no longer pile up across separate stand-ups;
    - the hook takes JSON only and refuses unseated users;
    - test 29 builds the expected name from the notice. Proved by
      rendering a wrong name, which turned it red.
    - test 28 now fails, rather than skips, when `TEST_HOOKS=1` is set and
      the hook is missing. CI also runs on localhost, so "fail if local"
      would have broken CI. `TEST_HOOKS` is documented with the other
      overrides in `src/poker/live.ts`.
  - Not acted on: the turn ring can briefly refill if the presence timer
    is late and the player reconnects before it fires. It's the same rare
    window, and the reviewer judged it acceptable.
- **The busted-ghost reorder isn't shown going red to green.** A scratch
  run against the real `table.ts` (`/tmp/s10c/ghostbust.ts`) gives a
  busted ghost "out_of_chips". The previous fix did too in my runs: one
  hand never reaches 5 timeouts or 5 minutes away, so the ghost was never
  due for an away stand-up. The reorder rests on reading the code.

**How I knew it was right:**
- **20 full `pnpm check` runs in a row on the final code:** 60/60 each, run
  with `TEST_HOOKS=1`, so tests 28 and 31 ran rather than skipped.
  Checksums of the five changed files matched before and after the loop
  (`/tmp/s10/run20b.log`).
  - An earlier set of 20, also all green (58/58), was on code the review
    then changed, so it isn't counted.
- **CI-shaped run** (default timings, no `TEST_HOOKS`, fresh DB): 58
  passed, 2 skipped (28 and 31), the skips visible in vitest's summary.
- **Deliberate breaks, each restored and `cmp`'d:**
  - no settlement at the deal → only 28 red;
  - no bust stand-up → 29 and 30 red.
- **Production gate:** a server with `NODE_ENV=production TEST_HOOKS=1`
  answered the hook with 404 and printed no "test hooks are ON". The dev
  server with the hook answered 200.
- **Two Playwright contexts at 1920×1080 and 390×844:**
  - after all-ins, both pages read "<name> is out of chips." and the
    busted player is no longer seated;
  - sitting again shows 1,000;
  - no overflow, no console errors. I looked at the screenshots.
- **Not verified:** production, a real phone, and any 0-stack seats
  already on production (a deal now stands them up on the first deploy).

**Citation:** `c665585` (red) → `3311c54` (green): tests 28, 29, 30 red →
green; 31, 32 red on the first fix → green; ghost-seat test 3 red 3/3 →
green 3/3 under an injected 800 ms timer lag.

**Curated prompt:** "Before Step 11, one small step, red first. (1) A hand
that ends straight from the deal must record results and stacks like any
other … (2) Owner decision: a player with 0 chips at hand end is stood up
automatically … (3) Find the root cause of the flaky ghost-seat test and
fix it; show it passing 20 full runs in a row. Commit, log, and stop."

## 2026-11-04 14:48 — [harness]

**What happened:** The owner kept the test-only stacks route and the
local-only test 28. They asked for a test that runs in CI and proves the
route returns 404 there, next to test 5's "no route to add chips", plus
`TEST_HOOKS=1` documented in `spec/README.md`.

**What I did instead of the obvious thing:**
- **A request that only a missing route can answer with 404.** The obvious
  version POSTs an empty body and expects 404. Against a mounted route,
  an empty or non-JSON body gets 415 or 400, so a test checking for "not
  200" would pass whether the route existed or not. Test 5b sends what the
  route accepts (JSON, a seated user, a legal stack), so a mounted route
  answers 200 and only an absent one answers 404.
- **Gated on the spec's own flag.** "Is this CI?" can't be told from
  `APP_URL`: CI also runs on localhost. So 5b skips only when the spec is
  given `TEST_HOOKS=1`, and runs everywhere else, CI included.

**How I knew it was right:**
- **No Docker in this sandbox,** so I ran the app the way the image runs
  it: `NODE_ENV=production`, with `TEST_HOOKS=1` set too, to show the gate
  holds even then. The server printed no "test hooks are ON", and 5b
  passed.
- **Non-vacuous:** against a dev server with the route mounted and the
  spec not told, 5b went red, "expected 200 to be 404". With the spec told
  `TEST_HOOKS=1`, 5b skipped.
- **CI-shaped full run** (`NODE_ENV=production`, default timings, no
  flag): 59 passed, 2 skipped (28 and 31, which need the route).
- **Local with hooks:** 60 passed, 1 skipped (5b).
- **Not verified:** a real CI run on GitHub. The repo isn't pushed before
  Step 13.

**Citation:** `57a12c9` (`spec/poker.test.ts` test 5b, `spec/README.md`).

**Curated prompt:** "Keep the test-only route and the local-only test.
Add a test that runs in CI and asserts the test-only route returns 404
there, next to test 5's 'no route to add chips'. Document TEST_HOOKS=1 in
spec/README.md. Commit, log, stop."

## 2026-11-04 21:37 — [judgement]

**What happened:** Step 11, the guest door. One tap makes a signed-in
guest; the profile's Claim this account turns it into a registered account
with the same id; a guest's Log out warns first; forgot password treats a
guest like an unknown username; Results tags guests. ADR 0005 drafted with
the Decision left to the owner. The Opus review of my first version found
two must-fix holes, both reproduced before fixing.

**What I did instead of the obvious thing:**
- **One claim form, not a second copy of registration.** The register
  page's "Your login" and "If you forget your password" fieldsets became
  functions (`loginFieldset`, `recoveryFieldset` in
  `src/account-pages.ts`). Both `/register` and the claim panel use them,
  and both are checked by `registerErrors`. So a field's error lands in the
  same `aria-describedby` target on both pages, as brief 1 Step 6 required.
- **Claiming keeps the user id.** It updates `username`, `password_hash`
  and `is_guest` in place `WHERE is_guest = 1`, and writes the questions in
  the same transaction. Seat, stack and `hand_results` stay without being
  touched. A username taken between the check and the write hits the unique
  constraint, and the page shows the same "taken" message on the same field.
- **Review fix M1, cross-site POSTs.** The cookie is `SameSite=Lax`, so a
  cross-site form POST to `/guest` arrives signed out. It made a new guest
  whose `Set-Cookie` replaced the visitor's, and `/logout` deleted it. For a
  guest that is permanent loss. Fixed with one middleware that refuses any
  POST whose `Sec-Fetch-Site` is present and isn't `same-origin` or `none`.
  - Not hono's `csrf()`. Its source (`hono/dist/middleware/csrf/index.js`,
    as the reviewer read it) refuses a form POST that has neither header,
    which would break the spec's fetches. It also compares `Origin` with
    `c.req.url`, which is `http://` behind Fly's TLS.
- **Review fix M2, `safeNextPath`.** `next=/\t/evil.example/x` passed
  (starts with `/`, not `//`), and browsers drop the tab and follow
  `//evil.example`. `next=/\n/evil` gave a 500 after the guest was created.
  - It now refuses any control character or backslash, then parses the
    value against a fixed base and requires the origin to be unchanged.
    `/login` and `/register` share the function, so they're fixed too.
- **Should-fixes taken:**
  - A double-tapped claim re-reads the user after the body is parsed, so it
    doesn't report "username taken" for its own success.
  - IPv6 is keyed by /64.
  - The limiter's sweep runs at most once a minute.
  - A malformed `GUEST_LIMIT` fails the boot instead of becoming NaN, which
    would turn the limit off.
  - Home's Regulars leaves unclaimed guests out.
  - The header's guest name reads as a label ("as Guest 0412"), grouped
    with Claim account and Log out.
- **The brief's "no second constant".** My first version added
  `GUEST_SESSION_LIFETIME_MS` beside the parameter. The reviewer flagged it
  as the very second constant the brief warns against. Removed: POST /guest
  passes `SESSION_LIFETIME_MS` explicitly.
- **Not acted on:**
  - The seat plate truncating to "Guest …" on a phone (S4). The brief says
    the table's look stays as deployed. It's the owner's call, and noted
    here.
  - A sliding guest session (S1). The brief says 30 days, so the ADR now
    says plainly that a guest's session ends at day 30, used or not.
- **Rate-limit test via a per-test `Fly-Client-IP`, not a shortened limit.**
  The default 10 is used, so the limit test also runs in CI. Every other
  guest test sends its own made-up address, so tests never share localhost's
  budget. The window-expiry test needs a short `GUEST_LIMIT_WINDOW_MS`, and
  skips without one.

**How I knew it was right:**
- **`pnpm check` with short overrides and `TEST_HOOKS=1`, fresh DB:** 75
  passed, 1 skipped (5b, by design).
- **CI-shaped run** (`NODE_ENV=production`, no overrides, fresh DB): 73
  passed, 3 skipped (28 and 31 need hooks; the window-expiry test needs a
  short window). The server log shows `event=action_rejected route=guest
  status=429 reason=rate_limited`.
- **Red before green for the review fixes.** Against the unfixed server:
  - the control-character test got "expected 'http://evil.example' to be
    'http://localhost:8112'";
  - the cross-site test got "/guest: expected 303 to be 403".
  - Both are green after the fix.
  - An earlier red of the first test came from my own test (a `JSON.parse`
    of a literal tab) and was fixed before I counted it.
- **Deliberate breaks, each restored and `cmp`'d:**
  - guests treated as recoverable → only the forgot-password test red;
  - rate limit off → only the two limit tests red;
  - claim leaving `is_guest = 1` → test 34 red;
  - no Results tag → test 34 red.
- **Real-browser cross-site check** (`/tmp/csrf11.mjs`): a page on
  127.0.0.1:8199 auto-submits to `/guest` and `/logout`. With the guard,
  both get 403 and the guest's session is kept. With the guard disabled (a
  scratch edit, restored and `cmp`'d), both get 303 and the session is lost.
- **Two-viewport walk, headless Chromium at 1920×1080 and 390×844**
  (`/tmp/s11walk/walk.mjs`). 19 DOM checks pass at each size, with no
  console errors and no horizontal overflow:
  - invite link to a seat in two taps;
  - claim with the live checklist ticking all five rules;
  - display name kept, still seated after claiming;
  - the logout page reached and used by keyboard only, tab order "Claim it
    first" then "Log out anyway";
  - the 429 message focused on the register page.
  - I looked at the screenshots.
  - Two harness problems were found and fixed along the way, neither of
    them app bugs. The made-up IP header was being sent to Google Fonts,
    which failed CORS. And 401s came from a table page whose cookie my
    loop had cleared; I confirmed the URL before calling it noise.
- **Not verified:**
  - production;
  - a real phone;
  - whether Fly's proxy replaces a `Fly-Client-IP` the client sends (the
    ADR says so; checkable in Step 13);
  - the double-tap claim race, which is reasoned from the code, not
    reproduced.

**Citation:** `d724e3a`. Tests "a next with control characters…" and "a
cross-site POST to /guest or /logout…" red → green.

**Curated prompt:** "Read CLAUDE.md, then docs/final-brief-2.md. Step 10
and its follow-ups are done. Do Step 11 only and stop."

## 2026-11-04 22:47 — [judgement]

**What happened:** Two owner decisions on Step 11. (1) Guest display names
are an animal plus two digits ("Wombat 27"), with each avatar letter coming
from the animal and two guests at one table told apart at 390 px. (2) Guest
sessions slide: on any request, under 15 days left extends to 30 days from
now. ADR 0005's Consequences updated to match.

**What I did instead of the obvious thing:**
- **Letters, not just names.** The obvious version picks a random animal.
  Two guests could then both be "Koala", with the same "K" avatar. Instead:
  - every one of the 24 animals starts with a different letter;
  - a new guest gets an animal whose letter no seated player's avatar
    already shows.
  - Animals are six letters at most, to fit the phone's plate.
  - The limit, recorded in the code comment and the ADR: it holds for the
    table as it is when the guest is made. Two guests made before either
    sits can share an animal, and differ only in their digits.
- **Slide in one statement.** `slideGuestSession` is a single `UPDATE …
  WHERE expires_at > now AND expires_at < now + 15 days AND user is a
  guest`, so the check and the write can't be split by a second request. It
  runs in a middleware before every route, and re-sends the cookie with the
  new expiry and the same token.
  - Read from source (`node_modules/hono/dist/context.js`, `set res`):
    Set-Cookie headers set before the route are kept and appended to on the
    route's response. So a route that logs out or signs in afterwards adds
    its own cookie, and that one comes last.
- **A second test-only route, under the same gate.** Reaching "under 15
  days left" inside a test needs a moved expiry. `POST /test-hooks/session`
  sits beside the stacks route under the same rule (`TEST_HOOKS=1` and not
  production). Test 5b now proves both routes are absent in CI, and
  `spec/README.md` lists both.
- **Not changed: the seat plate's width.** At 390 px a six-letter animal
  plus digits ("Wombat 98") is cut to "Womba…" by the deployed 4.9 rem seat,
  and at 1920 px the " (you)" tag can cut a name, as before. I didn't change
  it, because brief 2 keeps the table's look as deployed. The owner's
  criterion still holds, and the browser check asserts exactly that: the two
  avatars differ, and the plates start differently.

**How I knew it was right:**
- **`pnpm check` with short overrides and `TEST_HOOKS=1`, fresh DB:** 83
  passed, 1 skipped (5b, by design).
- **CI-shaped run** (`NODE_ENV=production`, the app also given
  `TEST_HOOKS=1` to show the gate holds, the spec not told): 76 passed, 8
  skipped. The skips are the 5 sliding tests, 28 and 31 (need hooks), and
  the window-expiry test. The server printed no "test hooks are ON".
- **Deliberate breaks, each restored and `cmp`'d:**
  - no slide → only "under 15 days … extended" red;
  - slide for registered accounts too → "registered … doesn't slide" and
    "claimed … stops sliding" red;
  - always the first animal (inside `guestDisplayName`) → the pure picker
    test and test 35 red ("expected 1 to be 3");
  - the old "Guest NNNN" name → the name-format test and test 35 red.
- **One break that first stayed green, and why.** My first letter break
  only replaced the first pick. The retry loop still called the real picker
  with the taken letters, so test 35 passed. That was a break that didn't
  break anything, not a weak test. I moved the break inside the picker and
  it went red.
  - While checking it, a manual rerun hit the previous break's server,
    still running. That is the stale-read trap in `CLAUDE.md`; I noticed it
    from the error ("to include 'Guest'") and reran properly.
- **Two guests at one table, headless Chromium, 390×844 and 1920×1080**
  (`/tmp/two11.mjs`), read from each page's DOM:
  - both pages show two seats whose avatar letters differ and each equal
    their animal's first letter;
  - the plates start differently.
  - I looked at the 390 screenshot (W and I avatars, "Womba…" and "Ibis
    97").
  - One 1920 run logged `ERR_CONNECTION_CLOSED`. Traced with
    `requestfailed`, it was the Google Fonts stylesheet, an external blip in
    1 of 3 runs; the other two were clean.
- **Not verified:** production, a real phone, and a slide happening across
  a real fortnight (the test moves the stored expiry instead).

**Citation:** `bccbc3b`. Tests: "guest display names" (2, pure), "guest
sessions slide" (5), test 35, test 5b extended.

**Curated prompt:** "(1) Guest display names: pick from a short list of
animal names plus two digits, like 'Wombat 27' … check at 390 px that two
guests at one table are told apart, and that each avatar letter comes from
the animal. (2) Guest sessions slide: … under 15 days left, extend it to 30
days from now. Update ADR 0005's Consequences to match. Tests for both.
Commit, log, stop."

## 2026-11-04 23:28 — [routine]

**What happened:** Step 12's red commit. `spec/solo.test.ts` states the
solo promises against routes that don't exist yet, and `src/solo/rules.ts`
is the pure rules module (on `@pokertools/evaluator`, added and pinned to
1.0.20) the tests recompute settlements with.

**What I did instead of the obvious thing:**
- **Library claims read from source first** (`node_modules/.pnpm/
  @pokertools+evaluator@1.0.20/.../dist`):
  - `index.d.ts`, `evaluate`: "Returns a strength score (lower is better)."
  - `models/hand-rank.d.ts:5`: "export declare const enum HandRank {
    StraightFlush = 0, … HighCard = 8 }". No royal category.
  - `index.js:55`: `rank(codes)` takes card codes, so strings go through
    `getCardCodes` first.
  - Probed: 4-4-5-3-2 scores 5745; 3-3-A-K-Q 5746 (doesn't qualify);
    4-4-6-3-2 5744; a royal 1 (the best score); a 5-high straight flush 10.
- **The brief's boundary hands are five-card hands.** As seven-card dealer
  hands they can't happen exactly, because two more cards pair up or
  improve them. So the three exact hands are pure tests, and the
  fixed-deck tests use the nearest real seven-card cases: 3-3 with A-K-Q
  high (5746, doesn't qualify) and the weakest pair of fours, 4-4-8-7-6
  (5726, qualifies). Every fixture deck was run through the evaluator
  before I relied on it.
- **No hook where none is needed.** The net-recompute test reads the stored
  cards from a signed-in `GET /solo/hands` (your own settled hands only),
  and the bust test reaches a bust with maximum-ante calls. Both run in CI.
  Only the fixed deck needs a test-only route.

**How I knew it was right:** against the current build, the 24 HTTP tests
fail, each for a missing route (grouped: 404s from `/solo/view`, `/solo`,
the deck hook). The 5 pure tests pass. The `SyntaxError` one test showed was
a 404 body parsed as JSON; the helper now reports the status instead.

**Citation:** `eefec87`.

**Curated prompt:** "Do Step 12 only and stop."

## 2026-11-05 00:37 — [judgement]

**What happened:** Step 12's fix. Casino Hold'em against the house: its own
stack, storage, page, routes and Results section; home gets Play the house.
The Opus review of my first version found three must-fix problems. All were
real, and all are fixed with tests that go red on the reviewed code.

**What I did instead of the obvious thing:**
- **One card renderer across two pages, by import, not a copy.**
  `src/solo/render.js` imports `cardHtml` from `../poker/render.js`. The
  browser can't resolve that path against `/assets/`, so `src/solo/page.ts`
  rewrites that one import line, when serving, to the table renderer's own
  versioned URL. Boot fails if the line isn't there exactly once.
  - The card and dock CSS became named pieces of `TABLE_STYLE` instead of
    copies. I proved `TABLE_STYLE` byte-identical to the committed one with
    `cmp`, after a first hash comparison showed a difference that turned out
    to come from how I'd captured the "before" (a dropped trailing newline).
- **A session is told by hand id, not by the clock** (review M1). My first
  version showed the last hand if `ended_at >= stack.started_at`. A bust
  writes the busting hand and the new stack in the same millisecond, so:
  - the busting hand showed on the fresh stack after a reload;
  - the response itself hid it;
  - without JavaScript, "You're out" never appeared.
  - Now: `solo_stacks.after_hand_id` marks where a session starts, and
    `busted_hand_id` keeps the notice and the busting hand on the felt
    until the next deal, in the database, so the 303-then-GET flow shows it
    too.
- **The net recompute is independent** (review S1). It used the server's
  own `settle()`, so a wrong rule would agree with itself. The test now
  scores with `evaluateStrings`/`rank` directly against a paytable written
  out in the test, as the brief says ("recomputed in the test … with the
  evaluator").
- **The table-stack test moved to `spec/poker.test.ts`** (review M2, as
  test 36). It sits at table 1, and the working rule exists because a
  second file on table 1 turned 13 tests red on 22 Oct.
- **Also from the review:**
  - cashing out of an untouched stack records no session;
  - a same-kind win reads "Your pair beats the dealer's pair";
  - a royal is named;
  - the result is announced through a live region that stays in the page;
  - a stale second tab re-fetches the view on a 400;
  - the no-JS error has a parameter instead of a string replace;
  - Call/Fold fill their columns on a phone;
  - the phone's recent-hands table drops its date column.

**Corrections to the red entry (`eefec87`):**
- The weakest seven-card pair of fours is 4-4-8-7-5-3-2, score **5727**,
  not 4-4-8-7-6 (5726). The reviewer found it and I confirmed it by
  brute force. The fixture is fixed.
- The const enum: `HandRank` does exist at runtime (`hand-rank.js` builds
  it; `node` prints `HandRank.Flush = 3`). The obstacle is tsc with this
  repo's `verbatimModuleSyntax`: "TS2748: Cannot access ambient const
  enums when 'verbatimModuleSyntax' is enabled", reproduced. The
  `rules.ts` header now says so.
- The quoted doc comment was `evaluate`'s. `evaluateStrings`' own is
  "Evaluates an array of card strings (e.g. ['As', 'Kd', ...]). Slightly
  slower than `evaluate` due to parsing overhead."

**Every write to `seats` and `solo_stacks`** (grep of INSERT/UPDATE/DELETE):
- `seats`, only in `src/poker/table.ts`:
  - sit, INSERT at the buy-in (:586);
  - leave, DELETE (:620);
  - the test-only stacks hook, UPDATE (:644, never in production);
  - hand settlement, UPDATE (:671);
  - plus migrations 0004/0005's one-off deletes.
- `solo_stacks`, only in `src/solo/game.ts`:
  - `ensureStack`, INSERT at the buy-in, the only place solo chips are
    created;
  - `settleHand`, UPDATE `stack + net`;
  - `dealHand`, UPDATE `busted_hand_id = NULL` (no chips);
  - `endSession`, DELETE.
- No file writes both. `game.ts` mentions `seats` only in a comment.

**How I knew it was right:**
- **`pnpm check` with short overrides and `TEST_HOOKS=1`, fresh DB:** 116
  passed, 2 skipped (5b and the deck-hook-absent test, by design).
- **CI-shaped run** (`NODE_ENV=production`; the app also given
  `TEST_HOOKS=1`, and printed no "hooks are ON"): 98 passed, 20 skipped.
  The deck-hook-absent test ran: 404 for a valid deck request.
- **The review's M1 reproduced, then the new tests red on it.** I rebuilt
  the reviewed code from its saved diff in a scratch worktree (removed
  after) and ran the new tests against it: "expected undefined to be -999"
  (busting hand missing) and "expected null to be 'You're out…'" (no-JS
  notice).
- **Deliberate breaks, each restored and `cmp`'d:**
  - no ante cap → only the ante test red (never-negative stays green: the
    CHECK and the settle guard still hold);
  - no royal → the pure and fixed-deck royal tests red;
  - `<` for `<=` in qualifying → the boundary test red;
  - dealer cards in `live` → the leak test red ("Td leaked");
  - call paying 1:1 short → four tests red;
  - solo writing `seats` → the table-stack test red.
- **Headless Chromium at 1920×1080 and 390×844**
  (`/tmp/s12walk/walk.mjs`): 29 DOM checks pass at each size, with no
  console errors (only the walk's deliberate 400 excused) and no
  horizontal overflow. They cover:
  - presets 25 and Max, a fold, a losing call ("Dealer wins. −30"), a
    winning call ("Four of a kind beats a pair. +120"), and a dealer who
    doesn't qualify ("Ante pays 2:1. +20");
  - a bust, with the busting hand, the notice announced and kept after a
    reload;
  - a cash-out, keyboard-only Deal, and the over-maximum message;
  - `/results` showing Table then Against the house.
  - I looked at the screenshots.
  - My walk's first red run was the harness, not the app: its "wait for the
    HTML to change" missed renders that landed before its snapshot. A
    direct trace showed the page working; the wait now counts renders.
- **Not verified:** production, a real phone, and a real screen reader
  reading the live region.

**Citation:** `eefec87` (red) → `88e6e8e` (green): the 24 HTTP solo tests
red → green; the two bust tests red on the reviewed code → green.

**Curated prompt:** "Do Step 12 only and stop."

## 2026-11-06 23:48 — [routine]

**What happened:** Committed the owner's Step 13 run file,
`docs/step-13-run.md`, on its own before starting it. It adds a production
backup before the push, a CI check that test 5b ran, a `Fly-Client-IP`
spoofing check and one production guest to Step 13 of
`docs/final-brief-2.md`.

**What I did instead of the obvious thing:** The owner asked to push
first, then follow the file. The file's Part 1 says production is backed
up before anything is pushed, because this deploy runs migrations 0006 and
0007. So I kept the backup ahead of the push. When the backup command was
refused in this session, I pushed nothing and stopped for the owner.

**How I knew it was right:** `git show --stat f4af94e` shows a single
added file, `docs/step-13-run.md`. `git log origin/main..HEAD` still shows
the 24 unpushed commits plus this one, so nothing was deployed.

**Citation:** `f4af94e`.

**Curated prompt:** "Push everything, then read docs/step-13-run.md and
follow it. Commit that file first, on its own, with a log entry."

## 2026-11-07 02:09 — [routine]

**What happened:** Step 13's red commit. Test 37 in `spec/poker.test.ts`
(beside test 19, since it plays on table 1): one pair play a hand to a
fold-out and both leave; a new pair sit down; the table page must show no
pot, no board cards, no "Hand over", and neither new name.

**What I did instead of the obvious thing:** The bug came from the Opus
review of Part 2, which found it in my walk's screenshots, not from a test.
My 48 DOM checks per viewport all passed. In `03-two-seated-1920.png`,
"Crane 93", who had just sat down with 1,000, was shown as having won the
previous pair's fold-out. I confirmed it in the screenshot and in
`render.js` before writing a test for it.

**How I knew it was right:** against a fresh server on the unfixed code,
test 37 fails ("expected HTMLElement{} to be null" on `[data-pot]`); test
19 passes.

**Citation:** `a5eb70c`.

**Curated prompt:** "Keep the order in docs/step-13-run.md: backup, then
the local walk and checks, then stop and wait for my push."

## 2026-11-07 02:10 — [judgement]

**What happened:** Step 13, Parts 1 and 2 of `docs/step-13-run.md`, up to
the stop before the push.
- **Part 1, production backup:** taken with better-sqlite3's online
  `backup()` inside the machine. `backup()` is an `async function`
  (`lib/methods/backup.js:8`), so `.then` runs once it has finished.
  Downloaded to `~/house-game-backups/backup-2026-11-07.sqlite3`, a new
  name; the 4 Nov file is untouched. Mode set to 600: sftp wrote it 644,
  and it holds password hashes. Integrity check `ok`. Counts: users 2,
  sessions 10, security_questions 4, seats 0, table_state 1, hand_results
  16; schema_migrations 5. The copy on the machine was deleted after the
  local one opened. The machine was stopped (Fly's idle stop), so the first
  `ssh` said "no started VMs"; one GET to `/` woke it.
- **Part 2, the fix:** the review's bug, which went red in `a5eb70c`.
  `shownHand` (`render.js`) now keeps a finished hand on the felt only
  while one of its players is still seated. It matches the engine's
  `PublicPlayer.id` (`@pokertools/types` `dist/player.d.ts:27`, `readonly
  id: string`) against the seated user ids, which are the same thing
  (`table.ts` `startHand`: `engine.sit(seat.seat_no,
  String(seat.user_id), …)`). `viewerState` now goes through `shownHand`
  too, so the seats, prompt and dock can't disagree with the centre.
- **Part 2, the report:** `docs/testing/multi-user-test-report.md`
  Expected for (b): a 20 s turn, and a 6 s pause, then `hand_start …
  by=auto`. (e)'s "not 30 s" is now "not 20 s"; it was stale after
  Step 10. New scenario (i), and its summary row.

**What I did instead of the obvious thing:**
- **The owner's first message said "push first".** The run file says to
  back up before anything is pushed, so I didn't push. The owner then
  confirmed the run file's order.
- **I fixed a bug older than this step instead of reporting it and
  pushing.** Step 13 asks for "no open review finding", and the bug shows
  a stranger a win they didn't play on the first deploy friends see.
- **The report's log lines come from a real server log, not the source.**
  That caught two things the source suggested wrongly:
  - A fold-out logs `street=SHOWDOWN` too. The engine's
    `awardPotToLastPlayer` (`dist/actions/betting.js:240`, doc comment at
    :235: "Award pots to remaining eligible players when hand ends by
    folds") returns `street: "SHOWDOWN"` (:332). So the report says the
    logs alone can't tell a fold-out from a showdown, and why.
  - `hand=` on `hand_start` is always 1: a fresh engine per hand, as Step
    10 found (this log, 4 Nov). The report tells testers not to count
    hands by it.
- **Fixed from the Opus review, all checked against `render.js` first:**
  - the (i) text said a fold-out winner's cards "stay face down". Once
    the hand is over, `seatsHtml` draws nothing at that seat, not backs;
  - "a folded hand is never drawn face up on anyone's page" is now
    "anyone else's": the folder's dock still shows their own two cards;
  - (i) now names split pots, `auto_deal_skipped … present=N`, and the
    extra broadcast a stand-up at hand end sends;
  - the walk: an ungrouped `|split` alternation that made its prompt
    check always pass is fixed; overflow is now also measured on page B.
- **Left for the owner, from the review:** Young Serif's old-style
  figures make "Pot 10" read as "Pot IO" and "990" as "99o". This is the
  same thing the `centreHtml` comment notes for "Pot 0". It's a font
  choice the owner made and is happy with on production, so I haven't
  changed it.

**How I knew it was right:**
- **Walk** (`/tmp/s13walk/walk.mjs`, headless Chromium, a fresh server
  with the shipped timings): 41 DOM checks pass at each of 1920×1080 and
  390×844, with no console errors and no horizontal overflow. It covers
  the brief's route in order:
  - home signed out;
  - the invite link lands on `/login?next=/tables/1`;
  - Play as a guest, then Sit, is two taps;
  - a check-down showdown against a second browser, where each page draws
    the other's real faces and both say the same result line;
  - "Next hand in 6 s" ticks to 5, the auto-deal arrives on both pages
    with no Deal pressed, and the fresh turn clock reads 20s;
  - a fold-out with neither page showing faces;
  - claim (live checklist 5/5, display name kept);
  - solo from Play the house: dealer cards are backs until the fold, and
    a fold at ante 10 nets −10;
  - `/results`: Table then Against the house; the claimed player has no
    guest tag, the unclaimed one has it;
  - profile, then log out; the guest's Log out goes to the warning page.
  - I looked at the screenshots.
- **Deliberate breaks, each restored and checked absent with `grep -c
  DELIBERATE`:**
  - `SHOW` dispatch skipped in `tableShowdownHands`: the walk's "A's page
    draws B's real faces" goes red. Only the winner's hand was drawn.
  - The old `shownHand` rule put back: only test 37 of 42 in
    `spec/poker.test.ts` goes red. The walk's new check goes red too,
    reproducing the bug as "Moose 79 won 10. Everyone else folded." for a
    guest who had just sat down.
- **`pnpm check` on the fixed code, fresh DBs:**
  - hooks on, shipped timings: 116 passed, 3 skipped (5b, the
    deck-hook-absent test, the guest-window test);
  - CI-shaped (`NODE_ENV=production`, the app given `TEST_HOOKS=1`, no
    "hooks are ON"): 99 passed, 20 skipped. 5b and the deck-hook-absent
    test ran and passed;
  - the guest-window test, on the pre-fix code, run alone with
    `GUEST_LIMIT=3 GUEST_LIMIT_WINDOW_MS=3000`: accounts file 41/41.
- **`pnpm check:evidence`:** green.
- **Not verified:** production (Part 4 is after the owner's push), a real
  phone, and a real screen reader.

**Citation:** `a5eb70c` (red) → `a8a9562` (green): test 37 red → green.
Backup: `~/house-game-backups/backup-2026-11-07.sqlite3` (path only;
never committed).

**Curated prompt:** "Keep the order in docs/step-13-run.md: backup, then
the local walk and checks, then stop and wait for my push."
