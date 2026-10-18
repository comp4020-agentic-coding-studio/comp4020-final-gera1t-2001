# Final brief — "House Game": a table that keeps up, and a site that looks like one

Read `CLAUDE.md` first; its rules apply to every step. This brief follows
`docs/c9-brief.md`; everything that brief settled still holds unless a step
below says otherwise.

## What's in this handoff

- `docs/final-brief.md`: this file. Work through it step by step.
- `docs/design/`: the visual targets. `table-mockup.html`,
  `login-mockup.html` and `register-mockup.html` (the last two share
  `auth.css`), each with screenshots at 1920 and 390. Open the HTML over
  HTTP to see it with real fonts.
- `docs/evidence/`: what was measured and reproduced before this brief
  (production timeline, two repro scripts, before screenshots). See its
  README. Cite it in the log where a step fixes something it shows.

Commit these three as the first commit, before Step 1 (log it as
`[routine]`).

## Why this brief exists

Playtesting with friends found two problems.

1. **The table feels laggy.** Players report that another player's action can
   take many seconds, sometimes 30, to show up. Findings so far (owner's
   session, 18 Oct, with Claude in chat):
   - On a healthy connection, delivery is fast. Against the live app, an
     action reached an open SSE stream in **16–31 ms**, and the 10 s heartbeat
     arrived on time (10.045 s, 20.042 s, 30.040 s), so Fly's proxy is not
     buffering the stream. Locally, three separate headless Chromium sessions
     saw every one of 38 actions within 0.3 s.
   - **Reproduced cause 1: two accounts in one browser profile.** Window A logs
     in as A and sits down; window B (same browser, so the same cookie jar)
     logs out, logs in as B and sits down. Window A still *shows* "A, your
     turn", because its SSE stream was opened as A. But every POST it sends
     now carries B's cookie, so Call is rejected with the engine's raw message
     "Player 2 attempted to act, but action is on seat 0". The hand stalls
     until the 30 s timer acts for A. The error line is wiped by the next
     render, so nobody sees why.
   - **Confirmed on production: the page's own stream goes silent.** Live
     table, 18 Oct, 12:35 UTC. The table page's `EventSource` rendered the
     12:35:26 push, then stopped delivering. It never errored, so it never
     reconnected. At 12:35:56 the turn timer auto-folded soundwave. A second
     stream opened *in the same page* received that push in under 1 s, and so
     did a third one opened later. The page itself kept showing "soundwave to
     act (0s)" at 12:43:36, seven minutes after the hand had ended. Meanwhile
     the owner's own seat, whose page never showed it was their turn, was
     auto-folded at 12:36:26. So the server and the network delivered; the
     page's long-lived stream died silently and nothing noticed. (The exact
     trigger is unknown: proxy, network or browser. The fix in Step 3 doesn't
     depend on knowing it.) The client today can't notice a dead or stalled
     stream: the heartbeat is an SSE *comment*, which JavaScript never sees;
     `EventSource` has no timeout; nothing re-syncs on tab focus or network
     change; and the "disconnected" message is wiped by the next render.
   - **Confirmed on production: ghost seats make everyone wait.** Players
     who closed their browser stay seated forever. Each time it's their turn,
     the table waits the full 30 s before the auto-fold. In the same hand,
     soundwave (12:35:26 → 12:35:56) and lynx (12:36:26 → 12:36:56) each
     cost 30 s, and nobody was at either seat. Reproduced locally too: three
     closed browsers and one live page, and every ghost turn takes the whole
     timeout. Nothing in the app knows whether a seated player is still
     there.
   - **UI that hides change.** Another player's action changes one line of
     small text ("aaa to act" becomes "lynx to act"). The pot shows only
     settled pots, so it reads "Pot: 0" preflop while 15 chips of blinds sit
     on the table. Nothing says what you owe to call. A push can arrive and
     still look like nothing happened.
2. **The site is bare.** Only the table has any styling, and even that is a
   green rectangle. There is no name, no shared layout, and every form uses
   browser defaults.

## Owner decisions (do not reopen)

- The app is called **House Game** (poker slang for a game among friends).
  The header wordmark and the `<title>` of every page use it. (README is the
  owner's to update.)
- Visual direction: **a friends' home game at night.** A dark room, one lamp
  over an oval felt table with a walnut rail, real-looking playing cards.
  Brass is reserved for "now": whose turn it is, the dealer button, and your
  seat. The reference is `docs/design/table-mockup.html` with screenshots
  `docs/design/table-mockup-1920.png` and `-390.png`. Port its tokens and
  structure; do not invent a second palette. Log in and register follow
  `docs/design/login-mockup.html` and `register-mockup.html`, which share
  `docs/design/auth.css`.
- Real-time transport stays **SSE plus POST**. No WebSocket rewrite.
- **Ghost seats (owner's decision, 18 Oct):** the deploy that ships Step 4
  also clears the live table once (migration 0004), removing everyone left
  seated from testing. After that: a seated player with no open
  connection is **away**. When an away player's turn comes, the table waits
  **5 s**, not 30 s. After **2 timeouts in a row**, or once they have been
  away **over 60 s**, they are stood up automatically **when the current hand
  ends** (never mid-hand). Their chips reset, as with any leave. Their seat
  shows "Away" meanwhile.
- All artwork is made in-house (CSS and inline SVG). No downloaded images,
  icon packs or card sprites. Fonts come from Google Fonts (Young Serif,
  Atkinson Hyperlegible Next), with the fallback stacks given in the mockup.
- Everything from C9 stays: play chips only, fixed buy-in, server
  authoritative, other players' hole cards never sent before showdown, the
  30 s auto-check-else-fold.

Out of scope: multiple tables, lobby, chat, animations beyond the turn ring,
sounds, avatars or uploads.

## Working rules

- One step at a time. After each step, report what you verified and what you
  did not, then **stop** and wait for the owner.
- Do not edit `README.md`, `PROCESS.md`, `reflections/`, or the Decision
  section of any ADR.
- Every push to `main` deploys. Push only when `pnpm check` is green locally,
  and only at the end of a step the owner has approved.
- New tests that create accounts or play hands must skip unless `APP_URL` is
  localhost, like `spec/accounts.test.ts`.
- One commit per step (two if a step is red-first: the red test, then the
  fix). Log every commit in `process-log.md` per `CLAUDE.md`.
- "Verified" means seen in a real browser at **1920×1080 and 390×844**, not
  only `pnpm check` (CLAUDE.md, "pnpm check does not prove the page looks
  right").

---

## Step 1 — A latency probe we keep (harness)

Before changing anything, build the instrument that will show whether each
later step helped.

- `scripts/latency-probe.ts` (run with `pnpm probe:latency`). It needs two
  sessions with **separate cookie jars**. It reads `APP_URL` and two existing
  accounts' credentials from env (`PROBE_A_USER`, `PROBE_A_PASS`,
  `PROBE_B_USER`, `PROBE_B_PASS`). It never registers accounts, so it is safe
  to point at production. It logs both in, sits both down (if the table has
  room and no hand is running), opens B's SSE stream, has A act N times
  (check/call, or start a new hand when one ends), and prints, per action,
  the ms from A's POST to the matching event on B's stream. Report the
  median, p95, max and any action with no event within 5 s. It leaves both
  seats at the end.
- It must also report **stream health**: the gap between consecutive
  messages on B's stream, heartbeats included. A gap well over the heartbeat
  interval is a stall even if no action was missed.
- Run it against your local app. Then hand the owner the exact command for
  production (the owner supplies the credentials; never commit them).
- Prove the probe isn't vacuous: temporarily stop `notifyTable()` from
  notifying, confirm the probe reports every action as missed, then revert.

Commit, log, stop.

## Step 2 — One browser, two accounts: say so, don't stall (red first)

Reproduce cause 1 as a failing test, then fix it.

- `spec/poker.test.ts`, new test (localhost only): user A opens the SSE
  stream and sits down. The same cookie jar is then logged out, logs in as B,
  and B sits down. A hand starts with A to act. A POST to `/act` that claims
  to come from A's page (see below), but carries B's cookie, must get a
  **409** with a JSON body `{ error, code: "identity_changed", nowSignedInAs }`
  and must change nothing (same `table_state.version`). Commit the red test
  first.
- Fix:
  - The table page embeds the viewer's user id (`data-viewer-id` on `<body>`).
    Every POST from the page sends it as `as=<id>`.
  - Every poker POST route: if `as` is present and differs from the cookie's
    user, return the 409 above. Do not act.
  - The client, on that 409 *or* whenever a view arrives whose `you` differs
    from `data-viewer-id`, shows a banner above the table: "This window is
    playing as **A**, but this browser is now signed in as **B** (another tab
    or window). Reload to play as B." with a **Reload** button. It disables
    the action buttons until reload.
  - The SSE stream also closes itself when its session token is no longer
    valid: check the session on each heartbeat, and end the stream if it is
    gone (for example, after a logout in another tab).
- Error messages players can read. Map the engine's messages to plain ones in
  one place (`src/poker/messages.ts`): out-of-turn becomes "It's not your
  turn.", "nothing to call" becomes "Nothing to call. Check instead.", and so
  on. Unknown messages fall back to "That move isn't allowed right now." The
  status line keeps its message until the player's next action, not the next
  render.

Prove the new test isn't vacuous (it is red before the fix, by definition;
show it). Two commits, log, stop.

## Step 3 — A stream the page can trust

Make the client notice a dead or stalled stream and recover by itself, and
stop older views from overwriting newer ones.

Server (`GET /tables/:id/events`):

- The heartbeat becomes a named event `ping` with data `{"seq":N}`, every
  **5 s** (`SSE_HEARTBEAT_MS`). Keep a named constant.
- Send `retry: 2000` once on connect.
- Response headers: `Cache-Control: no-cache, no-transform` and
  `X-Accel-Buffering: no` (both disable buffering in proxies and antivirus
  HTTPS scanners that respect them; cheap insurance).
- Every view carries `seq`: a per-table counter in memory, bumped inside
  `notifyTable()`, plus `bootId` (random per process start). `buildView`
  reads the current value, so a view built later never has a lower `seq`.

Client (`src/poker/page.ts`):

- Track `lastMessageAt` (any `view` or `ping`). If nothing arrives for **12 s**:
  close the `EventSource`, open a new one, and until the new stream delivers,
  poll `GET /tables/:id/view` **every 1.5 s**.
- Render a view only if `bootId` changed or `seq >= lastRenderedSeq`. This
  covers both the SSE stream and POST responses, so a slow response can no
  longer paint over a newer push.
- On `visibilitychange` (to visible), `online`, and `pageshow`, fetch the
  view once.
- A connection pill in the header: **Live** (green dot), **Reconnecting…**
  (brass), **Offline: showing the last table I saw** (red). It is not part
  of the re-rendered table markup, so a render can't wipe it.
- Re-rendering must not destroy what the player is doing: keep the raise
  amount input's value and focus across renders.

Tests (localhost only):

- B's stream receives a `ping` within `SSE_HEARTBEAT_MS + 1 s`.
- Views carry a `seq` that strictly increases across A's sit, start and act.
- Non-vacuous: set the heartbeat to a comment again and watch the ping test
  go red; revert.

Then run the Step 1 probe locally again, and report the numbers next to
Step 1's. Verify the watchdog in a real browser: open the table, kill the
local server for 20 s, restart it. The pill must go to Reconnecting, then
back to Live with the current table, with no reload. Commit, log, stop.

## Step 4 — Ghost seats: stop waiting for people who've gone (red first)

The owner's rule is in "Owner decisions" above. This step implements it.

Presence (server, in memory; it isn't game state):

- `subscribeToTable` takes the user id. Keep a per-table map
  `userId -> { openStreams, awaySince }`. A user becomes **away** when their
  open stream count has been 0 for **10 s** (`AWAY_GRACE_MS`), so a refresh
  or a short reconnect doesn't count. Back to present on any new stream or
  any POST from them.
- On boot, nobody has a stream yet. Treat every seated player as present for
  the first 30 s (`BOOT_GRACE_MS`), so a deploy doesn't stand the whole table
  up.

Turn deadline:

- When a new player is to act and they are away, set `turn_deadline` to
  now + `AWAY_TURN_SECONDS` (5) instead of `TURN_TIMEOUT_SECONDS`.
- If the player to act goes away mid-turn, pull the deadline in to
  min(current, now + 5 s) through the same write-and-reschedule path, so
  the timer stays the only thing that acts.
- Count consecutive timeouts per seat. Any real action from that player
  resets the count to 0.

Standing up:

- When a hand ends (where `hand_results` are written), stand up every seat
  with 2+ consecutive timeouts or away for more than 60 s
  (`AWAY_STAND_MS`). Use the existing `leave()` path so the chip rule and
  the notification come for free.
- Between hands, a seat that has been away more than 60 s is stood up by a
  timer too, so a table with nobody playing doesn't keep ghosts.
- The view gains `seats[].away` (boolean). It also gains a one-shot notice
  like `lastAction`, "lynx left the table (away)", so the page can say why a
  seat emptied.
- **Deal next hand** only deals in present players: stand up the away ones
  first.

Tests (localhost only, short timeouts via env as test 7 does). Commit the red
ones first:

1. A seated player whose stream is closed (and past the grace period) gets a
   deadline at most `AWAY_TURN_SECONDS` + 1 s away when their turn comes.
   Assert on the parsed `turnDeadline` minus now.
2. A present player (stream open) still gets the full timeout.
3. A player who times out twice in a row is no longer seated after that hand
   ends, and their seat row is gone.
4. Closing and reopening a stream within the grace period does **not** mark
   the player away.
5. Non-vacuous: make presence always "present". Tests 1 and 3 must go red,
   and nothing else. Revert.

Then run the Step 1 probe with one extra seated account whose stream is
never opened. Report how long a hand takes before and after this step.

One-off cleanup of today's ghosts (owner's decision, 18 Oct): add
migration `migrations/0004_clear_table_1.sql`. It deletes every row in
`seats` and `table_state` for table 1, so the moment this step deploys,
nobody is left sitting at the live table from testing. Everyone sits down
again with a fresh buy-in. `hand_results` is untouched, so history stays.
It runs once, on the first boot after deploy, before
`restoreSchedulersOnBoot()`, so no stale timer can fire for a deleted hand.
Check that the app boots and deals normally with no `table_state` row
(`startHand` already treats a missing row as version 0; quote the line).
Do it on a copy of a database that has seats and a hand in progress, not
only on a fresh one. Never edit 0001–0003.

The rule numbers (5 s, 2 timeouts, 60 s, 10 s grace) are named constants.
The owner may tune them after a real game. ADR 0004 (presence and ghost
seats) is the owner's to write. Leave its Decision empty if you draft
Context and Options. Two commits (red, then green), log, stop.

## Step 5 — The shell: one layout for every page

`src/html.ts` grows into the site's single layout. Nothing page-specific
lives here.

- `page(title, body, { user, current, next })` renders: `<title>` as
  "`<title>` · House Game" (or just "House Game" on the home page), the font
  links, the token stylesheet (below), and the header: wordmark "House Game"
  linking to `/`; nav Table, Results, About, then Profile and Log out when
  signed in, or Log in and Register when signed out. `aria-current="page"`
  goes on the current item. The `nav()` helper in `server.ts` goes away.
- Serve the stylesheet as a static file, `GET /assets/site.css`, with a
  content hash in the URL or `Cache-Control: no-cache`, so a deploy never
  serves a stale stylesheet. It holds the tokens from the mockup verbatim
  (`--room`, `--room-2`, `--line`, `--text`, `--muted`, `--felt`, `--felt-lit`,
  `--rail`, `--rail-hi`, `--card`, `--ink`, `--red`, `--brass`, `--brass-ink`,
  `--ok`, `--serif`, `--sans`, plus `--ink-2` and `--rule` from
  `docs/design/auth.css`) and base styles: body on `--room`, visible
  `:focus-visible` in brass, tabular numbers.
- The paper-panel form styles from `docs/design/auth.css` (panel, field,
  hint, field error, error summary, primary button) go into `site.css` now,
  so every form can use them. Step 6 rewrites the log-in and register pages
  themselves; this step only restyles forgot/reset password and profile onto
  the panel, without changing their wording or fields.
- A favicon: an inline SVG at `/favicon.svg` (a brass dealer button with a
  "D"), linked from the layout.
- `/readme/` uses the same layout, with the markdown in a readable column
  (max 70ch) on the room colour.
- `spec/home.test.ts` still passes, and `spec/invariants.test.ts`'s README
  check still passes.

Verify every page at both viewports: no horizontal scroll (measure
`scrollWidth - innerWidth`, it must be 0), and tab through each form. Commit,
log, stop.

## Step 6 — Log in and register, written for someone who has never been here

The current forms work but explain nothing: the username rule hides in a
label, the password rule is one long sentence you only learn you broke after
submitting, the security questions arrive with no reason given, errors only
appear as a list at the top, and both forms drop you on `/profile` instead of
the table. Rebuild both pages from `docs/design/login-mockup.html` and
`docs/design/register-mockup.html` (screenshots beside them, at 1920 and 390).
**The wording below is the owner's copy: use it as written.** Keep every
existing server-side rule; this step changes presentation, copy, order and
redirects, not what is accepted.

### Log in (`/login`)

- Heading "Log in". Lede: "Log in to take your seat at the table."
- Fields: **Username** (`autocapitalize="none"`, `spellcheck="false"`,
  `autocomplete="username"`), **Password** with a **Show / Hide** toggle
  button (`aria-pressed`, `aria-controls`; switches the input type; works
  without the mouse).
- Primary button: "Log in". Under it: "Forgot your password?" and "New here?
  **Create an account**" (the link keeps `next`).
- Wrong details: keep the one generic message (never say which part was
  wrong), now worded "That username and password don't match. Check both and
  try again." shown in the error summary, with the username kept and the
  password cleared.
- After logging in, go to `next` if it is safe (today's rule), otherwise to
  **`/tables/1`**, not `/profile`.

### Register (`/register`)

- Heading "Create an account". Lede: "One account per person. Every seat
  starts with {buy_in} play chips; nothing here is real money." Read
  `{buy_in}` from the table row; don't hard-code 1,000.
- Three fieldsets, in this order, each with a legend:
  1. **Your login**
     - Username. Hint (always visible, linked by `aria-describedby`):
       "3–20 characters: lowercase letters, numbers and _. You log in with
       this."
     - Password with Show/Hide. Below it a **live checklist** of the five
       rules, ticking as you type: "8 or more characters", "An uppercase
       letter", "A lowercase letter", "A number", "A symbol, like ! or ?".
       The list is `aria-live="polite"`. The client-side check is only a
       guide; the server's `passwordErrors()` stays the authority, and its
       messages are reworded to match the checklist's words.
  2. **At the table**
     - Display name *(optional)*. Hint: "What other players see on your
       seat. Leave it blank to use your username."
     - **Bio leaves the register form**; it stays editable on the profile
       page. (One less thing between a new friend and the table.)
  3. **If you forget your password**
     - Explanation paragraph: "There's no email reset here. Pick two
       questions only you can answer; you'll answer them to set a new
       password. Capitals and extra spaces don't matter." (True:
       `normaliseAnswer()` trims, lower-cases and collapses spaces. Quote
       those lines in the log to confirm.)
     - Question 1 / Question 2, each a select plus its answer input. Whatever
       is chosen in one select is **disabled in the other**, so the
       "choose two different questions" error can't happen from the page
       (the server check stays). The second select's placeholder reads
       "Choose a different question".
- Primary button: "Create account and go to the table". Under it: "Already
  have an account? **Log in**" (keeps `next`).
- After registering, go to `next` if safe, otherwise **`/tables/1`**.

### Errors on both pages

- Each error appears **twice**: inline under its own field (red, with the
  field outlined in red, `aria-invalid="true"`, and the message in the
  field's `aria-describedby`), and in an **error summary** at the top of the
  panel: "Fix N thing(s) to continue", a list where each item is a link that
  moves focus to its field. On a failed submit, focus moves to the summary.
- Rewrite every message to say what to do, not only what is wrong. Examples:
  "That username is already taken. Try another." / "Usernames use only
  lowercase letters, numbers and _ (3–20 characters)." / "Answer question 2
  to continue."
- Values the person typed survive a failed submit (as now), except
  passwords.
- Put the field-to-message mapping in one place so the server, the page and
  the tests agree on it.

### Forgot password (`/forgot-password` → reset)

- Same panel. Lede on the first screen: "Enter your username. We'll ask
  your two security questions." On the second: show both questions as
  labels, then New password (with Show/Hide and the same live checklist) and
  Confirm password.
- Keep today's protections exactly: unknown usernames still get two
  plausible questions; the generic failure message; the lockout after 5
  failed tries. Reword the lockout message to say when they can try again
  ("Too many tries. You can try again after 11:40 pm."). The server runs in
  UTC on Fly, so render the time as `<time datetime="…ISO…">` and format it
  in the browser's own time zone, with the ISO text as the no-JS fallback.
- After a successful reset, go to the log-in page with a success note above
  the form: "Password changed. Log in with your new password."

### Tests (`spec/accounts.test.ts`, localhost only)

- Registering without `next` redirects to `/tables/1`; logging in without
  `next` redirects to `/tables/1`; an unsafe `next` still falls back to
  `/tables/1`.
- A failed register re-renders with the field's error **inside that field's
  `aria-describedby` target** and the field `aria-invalid="true"`. Assert
  on the parsed DOM: find the input, follow `aria-describedby`, read that
  node's text. Don't string-match the HTML.
- The register form no longer has a bio field, and a POST that includes
  `bio` still works (the profile is where it's set).
- Non-vacuous: break the `aria-describedby` wiring on purpose, watch the
  test go red, revert.

Verify at both viewports with a real browser: tab through each form in
order; check that Show/Hide works by keyboard; that the checklist ticks as
you type; that the two selects exclude each other; that a deliberately
failed submit shows inline errors plus the summary and moves focus to it;
and `scrollWidth - innerWidth` is 0 at 390 px. Commit, log, stop.

## Step 7 — The table, rebuilt from the mockup

Port `docs/design/table-mockup.html` into `src/poker/page.ts`. The mockup is
static; this step wires it to the live `TableView`.

Layout and seats:

- The oval table, rail and lamp gradient as in the mockup. On ≤640 px the
  oval stands up (`aspect-ratio: 0.7 / 1`) and the six slot positions switch
  to the phone set.
- **You always sit at the bottom.** Map each real `seatNo` to a visual slot
  `(seatNo - yourSeatNo + max_seats) % max_seats`. Spectators (not seated)
  see seat 0 at the bottom. Keep `data-seat` as the real seat number for
  tests.
- Each seat: avatar disc with the display name's first letter in Young Serif;
  a name plate with display name and stack (stack from the hand's player
  entry while a hand runs, else `seats.stack`); two small card backs while
  dealt in (faces at showdown, from `shownCards`/`hand`); an **Away** tag on
  the plate when `away` is true; a **dealer button**
  on `buttonSeat`; a bet marker toward the centre with `betThisStreet` when
  above 0; folded seats at 45% opacity; empty seats as dashed "Open" discs.
- The player to act gets the **brass turn ring**: a conic gradient whose
  filled share is time left divided by this turn's length, computed from
  `turnDeadline` as today (never from page load). A turn can now be 30 s or
  5 s (Step 4), so the view carries `turnSeconds`, the length of the current
  turn, and the client never hard-codes 30.
- The last action shows as a small bubble above that seat ("call 20",
  "raise to 80", "fold"). Auto actions use the brass variant and say
  "auto-check" / "auto-fold".

Centre of the table:

- Street name (Preflop, Flop, Turn, River, Showdown), five card positions
  (dashed outlines where a card hasn't come yet), and **Pot = sum of `pots` +
  sum of `currentBets`**, so blinds and bets in front of players count.
- Cards are CSS: a white card with a rank and suit index top-left and a
  large centre pip; red for ♥♦, ink for ♠♣. Card backs are the mockup's
  red cross-hatch. Every card has an accessible name ("Queen of diamonds";
  "face-down card").

The dock (below the table):

- Your two cards, large. A prompt line: when it's your turn, "**Your turn.**"
  plus what happened last, plus the seconds left in brass; otherwise "Waiting
  for lynx (19s)" or "Hand over. lynx won 140." with the winner from
  `winners`.
- Buttons are built from the engine's legal options. **Fold**. **Check** when
  nothing is owed, otherwise **Call N**, where N = the highest `currentBets`
  minus yours, capped at your stack. **Bet** (when no bet yet this street) or
  **Raise to** (when there is one), with a number input defaulting to
  `minRaise` and preset chips **Min**, **½ pot**, **Pot**, **All in**.
  Presets only fill the input; they never act on their own.
- Keep the C9 action routes. `amount` still means what the engine expects;
  convert "raise to" in the client if the engine wants the increment, and add
  a test for whichever the engine actually uses (read its source and quote
  the lines, per CLAUDE.md).
- **Sit down**, **Leave table** and **Deal next hand** move into the dock,
  each shown only when legal (sit when you aren't seated and a seat is open;
  leave when seated and not mid-hand; deal when 2+ are seated and no hand is
  running).
- Keyboard: every control is reachable by Tab in reading order, with the
  brass focus ring. Optional shortcuts are fine, but buttons come first.

Also:

- The C9 bug guard stays: `.actions[hidden]` and friends must really hide.
- The first paint (server) and live renders (client) must produce the same
  markup. If keeping two renderers in sync gets painful, render on the
  server only and have the client fetch HTML fragments. Report which way
  you went and why.

Verify with **two real browsers with separate cookie jars** (two Playwright
contexts, or Chromium plus a second profile) side by side at both viewports:
sit, deal, play a hand to showdown and one to a fold, watch every action
appear on the other side, tab through the dock, and confirm no horizontal
scroll at 390 px. Also repeat the Step 2 same-browser scenario and screenshot
the banner. Commit with the screenshots described in the log, stop.

## Step 8 — Home and Results

- **Home (`/`)**: the hero is the live table in miniature: "N seated, hand in
  progress" or "Table's open, 2 seats free", with one primary button, **Take a
  seat** (or **Back to the table** when you're already seated). Below it,
  **Regulars**: members with display name and bio, as today.
- **Results (`/results`)**: a ledger from `hand_results`: per player, hands
  played and net chips (signed; play chips), sorted by net, and the last 20
  hands. Plain HTML table, right-aligned tabular numbers, negative nets in
  red. A one-line note: "Play chips only. Nothing here is
  money." Signed-in only, like the table.
- `spec/`: the results page lists a player's net that matches the sum of
  their `hand_results` rows (parsed from the DOM, not string-matched).

Commit, log, stop.

## Step 9 — Look at it, then push

- Full walk as a brand-new visitor at both viewports: home, register, table,
  play, results, about, profile, log out.
- The Step 1 probe against **production** (owner runs it with the
  credentials). Report median, p95, max and stream gaps before and after the
  deploy.
- Push (this deploys), confirm the live URL answers and the pill shows Live.
  If Step 4 hadn't been deployed yet, confirm migration 0004 ran: the live
  table is empty until people sit down again.
- Then stop. Owner only: README (name, what "good" means now, the
  enforced/judged list), ADR for the identity guard if wanted, PROCESS.md,
  the reflection.

## Live measurement (owner's session, 18 Oct, production)

- Healthy stream: own action to push 16, 31, 16 and 31 ms (4 runs);
  heartbeats on time at 10.045, 20.042 and 30.040 s.
- Two browsers with separate cookies, 4 seated (testaccount1, lynx, aaa,
  soundwave). Clock offset to the server is known within ±0.22 s, from the
  HTTP `Date` header.
  - 12:35:24 / 12:35:26: sit and deal pushes reach both the recorder stream
    and the page.
  - 12:35:56: soundwave auto-folded (absent player, full 30 s). The recorder
    stream got it at once. **The table page never rendered it.**
  - 12:36:26: testaccount1 auto-folded. Their page still showed soundwave
    to act, so they never saw their own turn.
  - 12:36:56: lynx auto-folded (absent player, full 30 s). Hand over.
  - A fresh `EventSource` opened in the stale page at 12:37:00 got the
    current state at once. The page's original stream never recovered or
    reconnected: at 12:43:36 it still showed "soundwave to act (0s)".
  - Raw data: `docs/evidence/production-timeline-2026-10-18.json`.
- Takeaway: the push path is fast. The two problems are a page stream that
  dies silently (Step 3) and absent players who cost 30 s per turn (Step 4).
