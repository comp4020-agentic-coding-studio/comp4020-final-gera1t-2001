# Multi-user test report: House Game

**App:** https://comp4020-final-gera1t-2001.fly.dev, one Texas Hold'em table
(table 1) for a handful of friends. Real-time updates go over server-sent
events (SSE); actions go up as POSTs. State lives in SQLite on the app's one
Fly volume, and the live-update fan-out is in memory in one Node process.

**Test date:** 7 November 2026 (AEDT; 6 Nov 16:43–16:48 UTC in the
excerpts) · **Build:** `386423f` on production (brief 2 Steps 10–13) ·
**Testers:** the coding agent, with two headless Chromium browsers (separate
cookie jars) signed in as the two production test accounts, `probe_a` and
`probe_b`, and `flyctl logs` running. Not run on real phones. Log excerpts
drop the `app[…] syd [info]` prefix and the `machine=82541eb7995158` field.

## How to read the logs

Every server event is one line, `event=<name> key=value … machine=<id>`.
Watch them live with:

```
flyctl logs -a comp4020-final-gera1t-2001
```

| Whiteboard item | Log line |
|---|---|
| User connects / joins room | `event=join table=1 user=… clients_in_table=… users_connected=…` |
| User disconnects / leaves room | `event=disconnect …`; leaving the seat is `event=leave_seat`; stood up for being away is `event=stood_up reason=away\|timeouts` |
| Server receives action | `event=action_received route=sit\|leave\|start\|act type=… amount=…`, then `event=action_applied` when the engine accepts it |
| Server broadcasts update | `event=broadcast table=1 seq=… recipients=…` |
| Server rejects action | `event=action_rejected status=400\|401\|409 reason=…` (`reason` is what the player is told, or `identity_changed`) |
| Snapshot to one user | `event=snapshot via=stream_connect\|view seq=…` |
| Also | `away` / `back` (presence), `hand_start`, `action_lost_race`, `stream_closed reason=session_ended`, `boot` |

## Scenarios

For each one: what we expect from how the app is built, what we saw, and the
log lines that show it.

### a) Two users join

**Expected:** each browser that opens `/tables/1` logs `join`, with
`clients_in_table` rising 1 → 2, and receives a `snapshot via=stream_connect`.
Each player sees the other appear without a reload.

**Observed:** as expected. A sat; B's page showed A's seat without a
reload; B sat; A's page showed B's. Both pills Live.

**Log excerpt:**
```
16:43:19Z event=join table=1 user=1 name=probe_a clients_in_table=1 users_connected=1
16:43:19Z event=snapshot table=1 user=1 name=probe_a seq=0 via=stream_connect
16:43:20Z event=join table=1 user=2 name=probe_b clients_in_table=2 users_connected=2
16:43:20Z event=snapshot table=1 user=2 name=probe_b seq=0 via=stream_connect
16:43:20Z event=sit table=1 user=1 name=probe_a seat=0 stack=1000
16:43:20Z event=broadcast table=1 seq=1 recipients=2
16:43:20Z event=sit table=1 user=2 name=probe_b seat=1 stack=1000
16:43:20Z event=broadcast table=1 seq=2 recipients=2
```

### b) One user's action reaches the others

**Expected:** `action_received` → `action_applied` → `broadcast recipients=N`,
where N is every open table page. Each other screen updates within about a
second (earlier measurement: 16–54 ms). The countdown and the turn marker
move to the next player; a present player's turn is 20 s (it was 30 s before
4 Nov). When an action ends the hand (`action_applied … hand_over=true`), the
result stays on every screen for 6 s with "Next hand in 6 s" counting down,
then the next hand deals itself if two seated players are present:
`hand_start … by=auto`, with no `action_received route=start` before it. A
hand someone deals by pressing the button logs `by=manual`.

**Observed:** as expected.
- **The action reached the other page:** A's call showed on B's page within
  60 ms, measured by polling the DOM, so that is an upper bound. Applied and
  broadcast in the same second.
- **Turn length:** a fresh turn's `turnSeconds` was 20.
- **Auto-deal:** on the server's clock the hand ended at 16:43:25 and
  `by=auto` dealt at 16:43:31, 6 s later (log times are whole seconds),
  with no `route=start` between them. Both pages showed the new hand.
- **The countdown's first label read "Next hand in 7 s",** not 6. The page
  counts down to `nextHandAt` on the browser's own clock, the same way it
  counts down a turn, and rounds up. The test machine's clock was about a
  second behind the server's. Only the first label is off: the deal runs
  on the server's timer.

```
16:43:22Z event=action_received table=1 route=act user=1 name=probe_a type=call amount=-
16:43:22Z event=action_applied table=1 user=1 name=probe_a seat=0 type=CALL auto=false street=PREFLOP next_to_act=1 hand_over=false
16:43:22Z event=broadcast table=1 seq=4 recipients=2
…
16:43:25Z event=action_applied table=1 user=1 name=probe_a seat=0 type=CHECK auto=false street=SHOWDOWN next_to_act=- hand_over=true
16:43:25Z event=broadcast table=1 seq=11 recipients=2
16:43:31Z event=hand_start table=1 hand=1 players=2 to_act=0 by=auto ended_at_deal=false
```

### c) Simultaneous actions (same second)

Try: two players press a button at the same moment, only one of whom is to
act; or the player to act clicks right as their turn timer runs out.

**Expected:** only the player to act is applied. The other gets
`action_rejected status=400 reason="It's not your turn."`. In a click-vs-timer
race, exactly one of the two is applied and the loser logs
`action_lost_race` (the version check on `table_state`). Chip totals stay
the same.

**Observed:** as expected. Both pages sent the same `call` at the same
moment, A being the one to act.
- **One applied, written once:** A's call was applied, and `table_state`'s
  version went up by exactly one (84 → 85).
- **The other refused with a 400:** B's arrived just after, once it was
  B's turn, so it was refused as an illegal move ("Nothing to call. Check
  instead.") rather than as out of turn. Which reason the loser gets
  depends only on which request lands first. Either way it is not applied.
- **No click-vs-timer race** came up in this run, so there is no
  `action_lost_race` line here. Test 8 in `spec/poker.test.ts` covers that
  race ("a real action just before the deadline is not overridden").

```
16:43:57Z event=action_received table=1 route=act user=1 name=probe_a type=call amount=-
16:43:57Z event=action_applied table=1 user=1 name=probe_a seat=0 type=CALL auto=false street=PREFLOP next_to_act=1 hand_over=false
16:43:57Z event=broadcast table=1 seq=15 recipients=2
16:43:57Z event=action_received table=1 route=act user=2 name=probe_b type=call amount=-
16:43:57Z event=action_rejected table=1 route=act user=2 name=probe_b type=call amount=- status=400 reason="Nothing to call. Check instead."
```

### d) Late user joins

A third person opens the table mid-hand.

**Expected:** `join` with `clients_in_table` one higher, and one
`snapshot via=stream_connect` showing the current street, pot and whose turn
it is. They see no one's hole cards. They can sit down for the next hand
(`sit`), but are not dealt into the current one.

**Observed:** as expected. A second browser for B opened `/tables/1` on the
turn of a running hand.
- **It got a snapshot:** `join` with `clients_in_table` one higher (3: A,
  and B in two browsers), and a `snapshot via=stream_connect`.
- **It drew the current hand:** the street (TURN) and the pot (20).
- **A's two cards were backs.** The view's JSON held no A card, only
  nulls.

```
16:45:31Z event=join table=1 user=2 name=probe_b clients_in_table=3 users_connected=2
16:45:31Z event=snapshot table=1 user=2 name=probe_b seq=19 via=stream_connect
```

### e) Leave and return (tab close)

A seated player closes the tab, waits, then reopens it.

**Expected:** `disconnect`; after 10 s with no stream, `away` and an "Away"
tag on their seat; if it's their turn, the table waits 5 s, not 20 s, then
auto-checks or folds (`action_applied auto=true`). Reopening within 5 minutes
logs `join` and `back`; they keep their seat and chips. After 5 timeouts in a
row, or 5 minutes away, they're stood up when the hand ends
(`stood_up`).

**Observed:** as expected for away and return. B's tab was closed with
both seated.
- **Away after 10 s:** A's page showed the "Away" tag on B's seat 10.3 s
  later. The view had `away: true`, with the seat kept.
- **Back in 1.2 s:** B came back about a second after being marked away.
  `back` and `join` were logged, the tag went, and B had the same seat and
  stack (985 before, 985 after).
- **Not seen here:** the 5 s away turn and the stand-ups. No turn fell to
  B while B was away, and nobody stayed away long enough. In
  `spec/poker.test.ts` "ghost seats", test 1 covers the away turn and test
  3 the stand-up after 5 timeouts. The 5-minutes-away stand-up wasn't
  checked here.
- **An earlier `away` for both, at 16:45:41, is not this scenario.** Both
  browsers had been closed for more than 10 s between two script runs, so
  both were marked away, correctly, and came back when the next run opened
  them.

```
16:45:51Z event=disconnect table=1 user=2 name=probe_b clients_in_table=1 users_connected=1
16:46:01Z event=away table=1 user=2 name=probe_b
16:46:02Z event=back table=1 user=2 name=probe_b
16:46:02Z event=join table=1 user=2 name=probe_b clients_in_table=2 users_connected=2
```

### f) Isolated room joins

The app has one room (table 1); `/tables/2` does not exist.

**Expected:** `/tables/2` and `/tables/2/events` return 404, nothing about
table 1 changes, and a POST to table 2 only logs `action_received table=2`
and `action_rejected table=2 status=404`. Within table 1, what is private stays private: each user's
stream carries only their own hole cards before showdown (checked by
`spec/poker.test.ts`).

**Observed:** table 1 stayed isolated, but one detail differs from
Expected.
- **As expected:** `/tables/2` and `/tables/2/events` returned 404, and
  table 1 kept answering unchanged.
- **Not 404:** a signed-in POST to `/tables/2/act` got **400 "No such
  table."**, logged as `action_rejected table=2 status=400`.
- **An extra line:** the same request also logged a
  `broadcast table=2 … recipients=0`.
- **Why both happen:** the act route marks the poster present *before* the
  table is checked (`markPresent`, `src/server.ts`, in place since brief 1
  Step 4). A user never seen at table 2 counts as coming back, which
  broadcasts to table 2's nobody. Then the engine refuses the move as "No
  such table.", which the route answers with its usual 400.
- **Harmless:** nothing reaches table 1 or the database. Left as it is;
  noted for the owner.

```
16:46:06Z event=action_received table=2 route=act user=1 name=probe_a type=check amount=-
16:46:06Z event=broadcast table=2 seq=1 recipients=0
16:46:06Z event=action_rejected table=2 route=act user=1 name=probe_a type=check amount=- status=400 reason="No such table."
```

### g) Two users on different machines (`fly scale count 2`)

**Expected (by design, not run on production):** this would break the table.
Each Fly machine has its own volume, so a second machine would start with an
empty SQLite database: accounts and sessions from machine 1 would not exist
there, and the in-memory fan-out only reaches streams on the same process.
Two players routed to different machines would sit at two different tables
and never see each other. The course's `fly.toml` fixes the app at one
machine and one volume. Supporting two would need a shared database and a
cross-machine broadcast (e.g. Postgres LISTEN/NOTIFY or Redis pub/sub).

**Decision:** not run against the live app, because scaling back down can
destroy a machine and leave data on the wrong volume. _If run on a copy:
observations here, and the `machine=` field on each line shows the split._

### h) Restart the machine mid-session

```
flyctl machine list -a comp4020-final-gera1t-2001
flyctl machine restart <machine-id> -a comp4020-final-gera1t-2001
```

**Expected:** every page's pill goes to Reconnecting, then back to Live once
the app is up (the stream retries every 2 s; the watchdog polls). Logs show
`boot` with a new `boot_id`, then a `join` and a `snapshot` per reconnecting
page. The hand in progress and its turn deadline are restored from
`table_state`. Nobody is marked away in the first 30 s after the boot.

**Observed:** as expected. Both pages were open with a hand running when
`flyctl machine restart 82541eb7995158` ran at 16:47:57.
- **Reconnecting, then Live:** both pills went to Reconnecting within a
  second and were Live again 12.7 s after leaving it.
- **A new boot:** `boot` with a new `boot_id`, then a `join` per page.
- **The hand restored:** the view had a new `bootId`, the **same
  `handId`**, the hand still running on the same street, and the same turn
  deadline.
- **Nobody marked away.**

```
16:47:58Z  INFO Sending signal SIGINT to main child process w/ PID 604
16:47:59Z [  306.744068] reboot: Restarting system
16:48:03Z event=boot boot_id=81961a17-05f1-4f8e-8fdb-95b3bea36a29
16:48:03Z event=join table=1 user=1 name=probe_a clients_in_table=1 users_connected=1
16:48:11Z event=join table=1 user=2 name=probe_b clients_in_table=2 users_connected=2
```

### i) A showdown: every page shows the same tabled hands

Two or three seated players and one signed-in spectator, each on their own
page. Play a hand to showdown with nobody folding (check or call down);
then one where a player folds and the other two reach showdown; then one
everyone else folds.

**Expected:** at a showdown, every hand still live (not folded) is drawn
face up on **every** page, seated or spectating, and they are the same
cards each player sees in their own dock. A folded hand is never drawn
face up on anyone else's page (the folder still sees their own two cards in
their dock). A hand won because everyone else folded is not a showdown:
once it's over, no cards are drawn at the winner's seat on anyone else's
page, not even backs. Every page shows the same result line: "Hand over.
*name* won *N* with *hand*." after a showdown, "*A* and *B* split *N* with
*hand*." for a split pot, or "Hand over. *name* won *N*. Everyone else
folded.", followed by "Next hand in 6 s".

The logs show one `action_applied … street=SHOWDOWN … hand_over=true`, then
a `broadcast recipients=N` carrying the tabled hands to every page at once
(more than one if the hand's end stands someone up: each `stood_up` line
broadcasts too), and 6 s later `hand_start … by=auto`. If fewer than two
seated players are present when the 6 s are up, the log shows
`auto_deal_skipped table=1 present=N` instead and the pages keep showing
*Deal next hand*. An auto-deal leaves away players out of the new hand
(`players=` is smaller) without standing them up. A fold-out logs `street=SHOWDOWN`
too (the engine moves the street there when the hand ends), and the line
names no winner, so the logs alone can't tell the two apart: a hand-ending
`type=FOLD` is usually a fold-out, but with three players a fold can also
close the river and send the other two to showdown. The pages are the
check: whether the faces are drawn. There is no per-viewer line for the
showdown: the hands are tabled once, in the stored state, and each page's
view is cut from it. Note that `hand=` on `hand_start` is always 1 (each
hand runs on a fresh engine), so count hands by `hand_start` lines, not by
that number.

**Observed:** as expected, with two players. Not run with a spectator or
a third player, so the partial-fold case wasn't seen.
- **Check-down to showdown:** each page drew the other's real cards, the
  same as that player's own dock. A held A♣ Q♣ and B held 4♦ 2♥, the same
  on both pages.
- **Identical views:** the two views' JSON held identical hands for every
  seat.
- **The same result line on both pages:** "Hand over. probe_b won 20 with
  two pair."
- **The auto-dealt next hand, folded out:** neither page drew the other's
  cards. `handRank` was null in both views, and both said "Hand over.
  probe_b won 10. Everyone else folded."
- **Each end was followed by `by=auto`** 6 s later.

```
16:46:25Z event=action_applied table=1 user=1 name=probe_a seat=0 type=CHECK auto=false street=SHOWDOWN next_to_act=- hand_over=true
16:46:31Z event=hand_start table=1 hand=1 players=2 to_act=0 by=auto ended_at_deal=false
16:46:31Z event=action_applied table=1 user=1 name=probe_a seat=0 type=FOLD auto=false street=SHOWDOWN next_to_act=- hand_over=true
16:46:37Z event=hand_start table=1 hand=1 players=2 to_act=0 by=auto ended_at_deal=false
```

## Summary

| Scenario | Expected | Observed | Pass? |
|---|---|---|---|
| a) Two users join | Both see each other, 2 × `join` | 2 × `join` (1 → 2), each saw the other sit, no reload | Yes |
| b) Action propagates | Other screens within ~1 s, `broadcast`; 20 s turn; next hand deals itself 6 s after the last (`by=auto`) | ≤ 60 ms to the other page; `turnSeconds` 20; `by=auto` 6 s after the hand ended (server clock); first label "7 s" on a client clock ~1 s behind | Yes |
| c) Simultaneous actions | One applied, other rejected or lost race | One applied, version +1; the other 400 ("Nothing to call") | Yes |
| d) Late join | Snapshot of current hand, no hidden cards | `snapshot via=stream_connect`; street and pot shown; A's cards backs, null in JSON | Yes |
| e) Leave and return | Away after 10 s, 5 s turns, seat kept | Away at 10.3 s, seat and stack kept, `back` on return; 5 s turn not seen | Yes (5 s turn untested here) |
| f) Isolated room | 404 for other tables; private cards stay private | Page and stream 404; POST got **400** "No such table.", plus a `broadcast table=2 recipients=0`; table 1 unaffected | Partly (status differs) |
| g) Different machines | Not supported by design (single volume) | Not run | n/a |
| h) Machine restart | Reconnecting → Live, hand restored | Live again after 12.7 s; new `boot_id`; same hand and deadline; nobody away | Yes |
| i) Showdown for everyone | Same tabled hands on every page; folded hands and a fold-out winner stay hidden | Same faces and result on both pages; fold-out winner hidden, `handRank` null | Yes (two players only) |

## Background: what earlier testing found

Before these logs existed, friends reported lag. Measuring the live site
(18 Oct) showed delivery itself took 16–31 ms; the real causes were a page
whose stream died silently and absent players who still made everyone wait
30 s per turn. Both were fixed (final brief Steps 3 and 4). The evidence is
in `docs/evidence/`.
