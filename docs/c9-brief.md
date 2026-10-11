# C9 brief — "All at once" (real-time home poker table)

Read `CLAUDE.md` first; its rules apply to every step. This brief replaces
`docs/poker-spike-brief.md` (Step 0 below is a shortened version of it).

## Goal for this crit (cutoff in about 14 hours)

One Texas Hold'em table for a handful of friends, built on the existing
accounts system. Several people on their own devices sit down, play a hand,
and **every action reaches every other open session within about a second,
with no reload**. That is the C9 spec's hard requirement.

Owner decisions already made (do not reopen):

- **Play chips only**: chips cannot be bought, transferred or exchanged.
- **Chip model**: fixed buy-in when you sit down, chips reset when you leave,
  each player's net result per hand is recorded.
- **Server is authoritative**: a browser never receives another player's hole
  cards before showdown.
- **No image assets this week**: cards are text (rank + ♠♥♦♣) in CSS boxes,
  the table is a CSS shape. It must work at 1920×1080 and 390×844.
- **Real-time transport**: server-sent events (Hono `streamSSE`), as ADR 0001
  anticipated. Actions go up as normal POST requests.

Out of scope: multiple tables, lobby, chat, tournaments, art, animations.

## Working rules

- One step, report what you verified and what you did not, then **stop**.
- Do not edit `README.md`, `PROCESS.md`, `reflections/`, or the Decision
  section of any ADR.
- The repo is public now, so **every push to `main` deploys**. Push only
  when `pnpm check` is green locally.
- Every new test that creates accounts or plays hands must skip unless
  `APP_URL` is localhost, like `spec/accounts.test.ts`.
- One commit per step; log each commit in `process-log.md` per `CLAUDE.md`.

---

## Step 0 — Engine spike (time-box: 45 minutes)

Compare `@pokertools/engine` and `poker-ts` in a gitignored `spike/`
directory, without touching the app's `package.json`. For each library, run
and show output for:

1. Three players, 1000 chips each, blinds 5/10; A goes all-in short (300),
   B and C keep betting. Main/side pot amounts correct, and total chips
   **exactly 3000** after the hand.
2. Serialise state to a JSON string after the flop, restore into a fresh
   instance, finish the hand. Works or not, and why (quote the source).
3. How we would build player B's view, and proof it holds no other player's
   hole cards before showdown.

Also: license, runtime dependencies, native code (must build on
`node:24-alpine`), shuffle randomness (quote the source).

Write `docs/adr/0002-poker-engine.md` (Context, Options with evidence,
Comparison table; **Decision and Consequences empty**). Commit, log, stop.

## Step 1 — Smallest schema (after the owner fills ADR 0002's Decision)

New migration `0003` (never edit 0001/0002):

- `poker_tables`: id, name, small_blind, big_blind, buy_in, max_seats
  (seed one table, "Home game")
- `seats`: table_id, seat_no, user_id, stack; one user per table, one user per
  seat
- `table_state`: table_id, snapshot (JSON text), version, updated_at
- `hand_results`: id, table_id, user_id, net, ended_at

Show the SQL. Stop.

## Step 2 — Game on the server

- Routes: sit down (fixed buy-in), leave, start hand (2+ seated), act
  (fold / check / call / bet / raise).
- The server validates every action against the engine (out-of-turn and
  illegal actions are rejected with a clear message).
- After **every** action, save the engine snapshot in `table_state` in the
  same transaction as any seat/stack change, bumping `version`. On boot,
  restore tables from their snapshots.
- At hand end, write one `hand_results` row per player.
- One function builds "the view for user X": public table state plus only
  X's own hole cards (others' only after showdown). Every response and every
  pushed event goes through it.
- No endpoint exists to buy, add or transfer chips.

Verify with curl and two sessions (two cookies). Stop.

## Step 3 — Real-time and the table page

- `GET /tables/:id/events`: SSE stream. On connect, send the caller's full
  current view. After any change, push each connected user **their own**
  view. Send a heartbeat comment every ~20 s so Fly's proxy keeps the stream
  open.
- Table page: server-rendered first paint, then a small vanilla JS
  `EventSource` client re-renders seats, community cards, pot, whose turn,
  and your cards. Action buttons POST with `fetch`.
- Text cards in CSS boxes, red for ♥♦, black for ♠♣. Keyboard reachable.
  No horizontal overflow at 390×844.

Verify with two real browser sessions (headless Chromium via CDP, two
separate cookie jars, as in Step 6 of C8): an action in session A appears in
session B **without reload**, and report the measured delay. Stop.

## Step 4 — Our checks (`spec/poker.test.ts`)

Against a localhost app only (skip otherwise):

1. **Real-time:** with user B subscribed to the SSE stream, user A acts;
   B receives an event reflecting that action within 1 second.
2. **Hidden cards:** before showdown, B's view (from the page and from the
   stream) contains none of A's hole cards. Assert on the parsed view, not on
   a raw string.
3. **Chip conservation:** after a played hand, the sum of all stacks equals
   the sum of all buy-ins.
4. Acting out of turn is rejected and changes nothing.
5. Sitting down always gives exactly the fixed buy-in; there is no route to
   add chips (it 404s).
6. A hand's results are recorded and still readable after the request that
   ended it.

Prove tests 1 and 2 are not vacuous: break each on purpose (stop pushing
events; leak one hole card into the view), confirm the expected test goes
red, revert. Report exactly which tests went red. Stop.

## Step 5 — Look at it, then push

At 1920×1080 and 390×844, two sessions side by side: sit, play a hand,
watch it update live. Tab through the action buttons. Report what you saw and
what you did not check. Then push (this deploys) and confirm the live URL
answers. Stop.

## Step 6 — Owner only

ADR 0003 (one decision about how the table behaves with several people in
it), README update, PROCESS.md rewrite, `reflections/crit-9.md`, then `/ship`
before the cutoff.
