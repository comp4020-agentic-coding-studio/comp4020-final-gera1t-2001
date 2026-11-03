# Final brief 2 — "House Game": the same showdown for everyone, a guest door, and the house

Read `CLAUDE.md` first; its rules apply to every step. This brief follows
`docs/final-brief.md` ("brief 1") and `docs/run-all-prompt.md`. Brief 1's
Steps 1–9 are done: 1–6 are deployed; 7–9 are committed locally
(`e9f6574`, `283d111`, `1cac630`), held from the 22 Oct push because
production rejected the PROBE_A credentials, then deployed by the
owner's push-only run on 4 Nov, before the account wipe.
Everything brief 1 settled still holds unless the Owner decisions below say
otherwise. Steps here are numbered on from brief 1: **10 to 13**.

## What's in this handoff

- `docs/final-brief-2.md`: this file. Work through it step by step.
- `docs/design/`, `docs/evidence/`: as before.

`docs/wipe-and-push.md` ran before this brief: migration 0005 wiped every
account on production, and Steps 7–9 are deployed. New migrations here start
at 0006.

Commit this file as the first commit, before Step 10 (log it as
`[routine]`).

## Why this brief exists

1. **At the end of a hand, players see different things.** With two or
   three players, the loser sees every hand face up; the winner sees only
   their own. This is the engine's default, not a lost push:
   `@pokertools/engine@1.0.20` `dist/rules/showdown.js`,
   `determineWinners()`: "winners show and losing hands remain mucked by
   default" (winners get `shownCards = [0, 1]`, losers `null`), and
   `dist/utils/view-masking.js` `getVisibleHand()` hides any opponent hand
   whose `shownCards` is null, even at `SHOWDOWN`. `buildView` hands masking
   to `engine.view(playerId)`, so each player gets a different table. Step 7
   saw this ("showdown faces shown only for the hand not mucked", log 22 Oct
   01:50) and recorded it as correct, because it matched the engine. It
   matches the engine; it is not what the owner wants at a home game. Also,
   `winners[].handRank` (the engine's "Two Pair, Kings and Tens") reaches
   the view and is never shown.
2. **Dead time between hands.** Every hand ends on "Hand over. lynx won
   140." and waits for someone to press *Deal next hand*.
3. **A phone that comes back waits for the watchdog.** The
   `visibilitychange` handler calls `fetchView()` but, unlike `online`,
   does not reopen a dead stream; only the 12 s stall check does.
4. **Registration is the door, and it is heavy** for a friend opening an
   invite link: username, a five-rule password and two security questions
   before a seat.
5. **An empty table is a dead site.** With nobody online there is nothing
   to play.
6. **The multi-user report's Observed column (run-all Part 1) is still
   empty.**

## Owner decisions (do not reopen)

Carried from brief 1 unchanged: **House Game**; the night-room visual
direction, brass for "now"; SSE + POST, no WebSocket; ghost-seat numbers
(away after 10 s, away turn 5 s, stood up after 5 timeouts or 5 min, at hand
end); play chips only; fixed buy-in; server authoritative; **no opponent hole
cards before showdown**; Google Fonts (Young Serif, Atkinson Hyperlegible
Next); the one shared renderer `src/poker/render.js` (keep it; extend it).

New or changed, 4 Nov 2026:

- **Showdown is for everyone (Option A).** Every hand that *reaches
  showdown* is tabled: every hand still live then (ACTIVE or ALL_IN) is
  visible to every viewer, seated or spectating, identically. Folded hands
  are never shown to anyone. A hand won because everyone else folded is not
  a showdown: the winner's cards stay hidden. Implement with the engine's
  own `SHOW` action, so masking still happens only in `engine.view()`.
- **Present player's turn: 20 s** (was 30). Away turn stays 5 s.
- **Auto-deal.** A finished hand stays on the felt for **6 s**, then the
  next hand deals itself if at least two seated players are present (not
  away). Otherwise *Deal next hand* as today.
- **The table's look stays as deployed on 4 Nov** (owner played it on
  production and is happy with it): in-house CSS cards, `innerHTML`
  rendering, no new motion. No downloaded artwork, no morphdom. The solo
  page reuses the table's card markup and styles.
- **Guest accounts.** One tap creates a signed-in account with a generated
  name, no password, no questions. Claimable later from the profile.
  Unclaimed guests appear on Results tagged "guest". No cleanup job.
  Draft **ADR 0005** for guest accounts (Context, Options, Consequences:
  recovery versus friction at the door, against C8's security-question
  decision). 0004 is the ghost-seat ADR the owner still owes; if a 0004
  file exists by then, use the next free number. The Decision section is
  the owner's.
- **Solo: Casino Hold'em against the house.** Request/response, no stream.
  Its own stack per user, separate from the table's, same buy-in amount,
  never transferable either way. Its own results, never summed with the
  table's.
- **Chip promises are per game.** "Chips conserved within a hand" is a
  table promise. Solo has its own (Step 12); the house is unbounded.

Out of scope: card artwork, morphdom, animations beyond what the table
already has, multiple tables, lobby, chat, avatars, sounds, solo side bets,
guest cleanup, any change to `fly.toml`.

## Working rules

- One step at a time. After each step, report what you verified and what you
  did not, then **stop** and wait for the owner.
- Each step ends as brief 1's did in the run-all: every check it names, an
  **Opus subagent review** of the diff and the screenshots, fixes for what
  it finds, `pnpm check` green, a commit, a process-log entry.
- Do not edit `README.md`, `PROCESS.md`, `reflections/`, or any ADR's
  Decision.
- **No push before Step 13.** Every push to `main` deploys.
- Tests that create accounts or play hands skip unless `APP_URL` is
  localhost. **Every test that touches table 1 goes in
  `spec/poker.test.ts`**: vitest runs files in parallel, and a second file
  on table 1 turned 13 tests red on 22 Oct. Solo tests, which never touch
  table 1, may have their own file.
- One commit per step (two if red-first). Log every commit per `CLAUDE.md`.
- "Verified" means seen in a real browser at **1920×1080 and 390×844**.
- **Library claims come from source**: `@pokertools/engine`,
  `@pokertools/evaluator`: the file and lines in `node_modules`
  that decide it, quoted in the log.
- Assert meaning, not spelling: parsed DOM, parsed JSON, computed numbers.
- Everything committed is English.

---

## Step 10 — Showdown for everyone, and no dead time (red first)

### Red tests (in `spec/poker.test.ts`)

Three accounts, over HTTP, like the existing tests.

1. **Symmetry.** A hand to showdown, nobody folding. For every seated
   viewer and one logged-in spectator, take `/tables/1/view` and build the
   set of `(seatNo, hand)` where `hand` has no null card. All the sets are
   **equal**. (Today the winner's lacks the losers'.)
2. **Folded stays hidden.** Seat 1 folds preflop; the other two reach
   showdown. In every view seat 1's hand is null or all-null; the other
   two are fully visible to everyone.
3. **A fold-out is not a showdown.** Two fold; in every other viewer's view
   the winner's hand is not visible.
4. **Nothing before showdown.** Test "2. hidden cards: B's view, from the
   page and from the stream, holds none of A's hole cards" still passes,
   unchanged.
5. **The result is in the view.** After a showdown, `view.hand.winners`
   holds `seat`, `amount`, `handRank` for each winner (parsed JSON);
   `handRank` is null after a fold-out.
6. **Auto-deal.** Two present players: a finished hand is followed by a new
   `handNumber` within `SHOWDOWN_PAUSE_MS` plus a margin, with no POST to
   `/start`. One present and one away (close their stream, wait past
   `AWAY_GRACE_MS`): no new hand. A manual deal during the pause starts
   exactly one hand, not two.
7. **Turn length.** A fresh turn's `turnSeconds` equals
   `TURN_TIMEOUT_SECONDS` (read the constant from `src/poker/live.ts`, as the
   spec already does for the heartbeat; never the literal 20).

Shorten the pause through its env override. As `src/poker/live.ts` says, an
override must be set for the running app and for `pnpm check` alike;
document it wherever the existing overrides are documented.

Non-vacuous: disable the `SHOW` dispatch; 1 goes red, 2 and 3 stay green;
restore. Disable the auto-deal scheduler; 6 goes red; restore.

### Fix

- `src/poker/table.ts`: where an action is prepared and `handEnded`
  becomes true (before the engine is snapshotted and
  `commitPreparedAction` writes it), if the engine has `winners !== null`
  and more than one player is ACTIVE or ALL_IN, dispatch `SHOW` for each of
  them, so the snapshot that's written already holds the tabled hands. This
  covers real actions and the turn timer's, since both go through the same
  prepare/commit pair; confirm that and say where. Quote
  `dist/engine/game-reducer.js` (`case "SHOW"`) and
  `dist/actions/showdown-actions.js` (`handleShow`: refuses FOLDED and any
  street but SHOWDOWN). A fold-out has one live player, so the condition
  leaves it alone.
- `src/poker/live.ts`: `TURN_TIMEOUT_SECONDS` default 20. New
  `SHOWDOWN_PAUSE_MS`, default 6000, env-overridable, commented like its
  neighbours.
- Auto-deal is a scheduler like the turn timer and the presence check:
  scheduled when a hand ends; cancelled by a manual deal, by a stand-up or
  leave that leaves fewer than two present; restored on boot in
  `restoreSchedulersOnBoot`. It calls `startHand`, so every invariant, log
  line and broadcast holds. A manual deal and the timer racing must start
  one hand (the existing version check should make the loser a no-op;
  prove it with test 6).
- The view carries `nextHandAt` (ISO or null), counted down in the browser
  from the server's time, as `turnDeadline` is.
- `src/poker/render.js`:
  - the prompt after a showdown: "Hand over. lynx won 140 with two pair,
    kings and tens." (`handRank`, lower-cased after the first word as reads
    naturally; quote the engine's strings to show what they look like); a
    fold-out: "Hand over. lynx won 30. Everyone else folded."; then "Next
    hand in 4 s" from `nextHandAt`.
  - the clock is ticked by the existing timer, not by re-rendering.
- `src/poker/page.ts`: in the `visibilitychange` handler, after
  `fetchView()`, `if (!streamLive) openStream();`, matching `online`.

Two-browser check at both viewports: a hand to showdown (both pages show
the same faces), a fold-out (winner's cards hidden on the other page), the
auto-deal arriving on both pages.

Log the fix as `[judgement]`: the 22 Oct Step 7 entry saw this and called
it correct because it matched the engine; quote that line and the two
engine files. Commit (red, then fix), stop.

## Step 11 — The guest door

- Migration `0006_guests.sql`: `ALTER TABLE users ADD COLUMN is_guest
  INTEGER NOT NULL DEFAULT 0;`.
- `POST /guest` (form post, carries `next`): creates a user with username
  `guest-` + 6 random lowercase base32 characters (retry on collision),
  display name "Guest " + 4 digits, a password hash of 32 random bytes nobody
  knows, no security questions, `is_guest = 1`; signs in; redirects to safe
  `next`, else `DEFAULT_LANDING`. Guest sessions last **30 days**: give
  `createSession` in `src/sessions.ts` a lifetime parameter rather than a
  second constant beside `SESSION_LIFETIME_MS`.
- Rate limit, in memory: **10 guests per IP per hour**, keyed on
  `Fly-Client-IP` when present, else the socket address. Over it: 429,
  re-render the page they came from with "Too many new guests from this
  network. Try again in an hour, or log in." Log
  `event=action_rejected route=guest reason=rate_limited`. Window and count
  env-overridable for tests.
- `/login` and `/register`, under the primary button: a secondary button
  **Play as a guest** (form to `/guest`, keeps `next`), and one line: "No
  password. Your seat lives in this browser; claim the account later from
  your profile if you want to keep it."
- Header, for a guest: the name plus a **Claim account** link to
  `/profile`.
- `/profile`, for a guest: a **Claim this account** panel above the usual
  fields: username, password with the live checklist, the two questions,
  reusing the register page's validation, messages and field-to-message
  mapping (one mapping, as brief 1 Step 6 required). On success `is_guest`
  is 0, username and hash are replaced, questions written, display name kept
  unless changed.
- Log out, for a guest, goes to a server-rendered `GET /logout` page first:
  "You're a guest. If you log out you can't get back into this account."
  with **Claim it first** and **Log out anyway**. No JavaScript `confirm()`.
- Forgot password for a guest username behaves exactly like an unknown
  username (two plausible questions, the generic failure).
- `/results`: unclaimed guests get a small "guest" tag.

Tests (localhost only; anything that sits at table 1 goes in
`spec/poker.test.ts`):

- `POST /guest` signs in, lands on `/tables/1`, and that guest can sit and
  act.
- Two guests in a row get different usernames and display names.
- Over the limit (shortened via env) gets 429.
- Claim with valid details → log out → log in with them → same user id →
  `is_guest` 0 → seat and `hand_results` unchanged.
- Claim with a taken username shows the register page's field error inside
  that field's `aria-describedby` target.

Verify at both viewports: invite link to a seat in two taps; claim; the
logout page by keyboard. Commit, log, stop.

## Step 12 — Solo: Casino Hold'em against the house (red first)

It never touches the table's seats, engine snapshot, streams or presence.
Every move is a POST answered with the new state; the page renders with a
pure renderer (`src/solo/render.js`, the same pattern as
`src/poker/render.js`: imported by the server for the first paint, served
to the browser, applied with `innerHTML`). It imports `cardHtml` from
`src/poker/render.js` rather than copying it, if the served-module setup
allows that; if not, say why and how the two are kept equal. No SSE.

### Rules (standard Casino Hold'em, no side bets)

1. Ante `a`, an integer, `1 ≤ a` and `3a ≤ stack`.
2. Two cards to the player (up), two to the dealer (down), three to the
   board.
3. **Fold** (lose `a`) or **Call** (add `2a`).
4. On a call: turn and river; both hands are best five of seven, scored with
   `@pokertools/evaluator` `evaluateStrings` (lower is stronger; quote the
   doc comment).
5. Dealer **qualifies** with a pair of fours or better: iff
   `evaluateStrings(dealerSeven) <= evaluateStrings(["4s","4h","5d","3c","2h"])`,
   the weakest pair of fours (kickers 5-3-2; only four distinct ranks, so it
   cannot be a straight). Test the boundary: a pair of threes with A-K-Q
   does not qualify; exactly this hand does; a pair of fours with 6-3-2
   does.
6. Settlement:
   - dealer doesn't qualify: call **pushes**; ante pays the paytable;
   - dealer qualifies, player stronger: call pays **1:1**, ante pays the
     paytable;
   - dealer qualifies, dealer stronger: ante and call lost;
   - equal: both push.
7. **Ante paytable** on the player's best five: royal flush 100, straight
   flush 20, four of a kind 10, full house 3, flush 2, straight or less 1.
   Category from the evaluator's `rank()`. Two traps, confirm both in
   `dist/models/hand-rank.d.ts` and quote: `HandRank` is a `const enum`
   (StraightFlush = 0 … HighCard = 8), which Node's type stripping (the app
   runs `.ts` directly) cannot compile, so define named constants for the
   numbers and test them against `HAND_RANK_DESCRIPTIONS`; and there is no
   royal flush category, so a royal is a straight flush topped by an ace
   (test an A-high and a 5-high straight flush). Add `@pokertools/evaluator`
   to `package.json`, pinned to `1.0.20`.
8. **Cash out** between hands records the session and resets the stack to
   the buy-in next time. Under 3 chips (no legal ante): the session is
   recorded and a new stack starts: "You're out. New stack of 1,000 play
   chips." (buy-in read from the table row, as the register page does).

### Storage (`0007_solo.sql`)

- `solo_stacks (user_id PK, stack, started_at)`
- `solo_live (user_id PK, state TEXT)`: the hand in progress, so a refresh
  or a redeploy mid-hand resumes it.
- `solo_hands (id, user_id, ante, player_cards, dealer_cards, board,
  outcome, player_rank, dealer_qualified, net, ended_at)`: append-only;
  cards stored so tests can recompute.
- `solo_sessions (id, user_id, started_at, ended_at, net)`.

### Promises (`spec/solo.test.ts`, localhost only, red first)

- The stack never goes negative; an ante over `stack / 3` is refused with
  a message that states the maximum.
- For every hand, `net` equals the settlement rules recomputed in the test
  from the stored cards with the evaluator (compare numbers).
- The dealer's cards are in no response, JSON or DOM, until the player has
  called or folded.
- No route writes both `seats` and `solo_stacks`; no route adds chips except
  the buy-in reset. List every write to either table in the log.
- Qualification boundary and each paytable category, with a fixed deck
  through a test-only hook unreachable in production (say how it's kept
  unreachable, and prove it with a production-mode request).
- A seated table player loses a solo hand; their table `stack` is
  unchanged.

### Routes and page

`GET /solo` (signed in), `GET /solo/view`, `POST /solo/deal` (`ante`),
`/solo/call`, `/solo/fold`, `/solo/cash-out`. Same room, smaller felt:
dealer's cards top, board middle, yours and the dock below. Dock: ante with
presets **5, 10, 25, 50, Max**, **Deal**; then **Call 2×a** / **Fold**; then
the result line ("Dealer doesn't qualify. Ante pays 1:1. +10" / "Flush
beats two pair. +40" / "Dealer wins. −30") and **Deal again** /
**Cash out**. Stack and session net always visible. The table's card
styles. Keyboard-reachable.

### Results and home

`/results` gets a second section, **Against the house** (per player:
hands, net; last 20 solo hands), under today's, which becomes **Table**.
The two nets are never summed. Guest tags in both. A test like test 17: a
player's solo net on the page equals the sum of their `solo_hands` rows,
parsed from the DOM. Home gets a secondary button **Play the house** →
`/solo`.

Verify at both viewports: presets, a fold, a losing call, a winning call, a
dealer who doesn't qualify, a bust and reset, a cash-out; `/results` shows
both sections. Commit (red, then fix), log, stop.

## Step 13 — Walk, then push

The PROBE accounts were re-registered on production by the wipe run. If
either no longer logs in, stop after the local walk and report.

- Full walk as a new visitor at both viewports: home → invite link →
  **Play as a guest** → table → a hand to showdown against a second browser
  → claim → solo → results → profile → log out.
- `pnpm check`, `pnpm check:evidence` green; no open review finding.
- `docs/testing/multi-user-test-report.md`: update Expected for (b) (20 s
  turn, 6 s auto-deal) and add (i) "a showdown: every page shows the same
  tabled hands", with the log lines to look for.
- Push. Confirm CI and the deploy, `schema_migrations` lists 0006 and 0007,
  `/` and `/tables/1` at both viewports on the live site, one guest created
  on production.
- Run-all Part 1, now on the deployed build: scenarios a–f, h, and the new
  i against production with the PROBE accounts and `flyctl logs` running;
  fill Observed and the summary table. Both accounts leave the table.
- The latency probe against production: median, p95, max, stream gaps.
- Then stop. Owner only: README, ADR 0004 and 0005 Decisions, PROCESS.md,
  the reflection, and the postponed account wipe (now with guests in mind).
