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
