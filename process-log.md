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
