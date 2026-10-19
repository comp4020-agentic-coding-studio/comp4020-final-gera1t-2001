# Multi-user test report: House Game

**App:** https://comp4020-final-gera1t-2001.fly.dev, one Texas Hold'em table
(table 1) for a handful of friends. Real-time updates go over server-sent
events (SSE); actions go up as POSTs. State lives in SQLite on the app's one
Fly volume, and the live-update fan-out is in memory in one Node process.

**Test date:** 19 October 2026 · **Build:** structured logs added
in `b08de89` · **Testers:** _names / devices_

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

**Observed:** _…_

**Log excerpt:**
```
_paste_
```

### b) One user's action reaches the others

**Expected:** `action_received` → `action_applied` → `broadcast recipients=N`,
where N is every open table page. Each other screen updates within about a
second (earlier measurement: 16–54 ms). The countdown and the turn marker
move to the next player.

**Observed:** _…_

### c) Simultaneous actions (same second)

Try: two players press a button at the same moment, only one of whom is to
act; or the player to act clicks right as their turn timer runs out.

**Expected:** only the player to act is applied. The other gets
`action_rejected status=400 reason="It's not your turn."`. In a click-vs-timer
race, exactly one of the two is applied and the loser logs
`action_lost_race` (the version check on `table_state`). Chip totals stay
the same.

**Observed:** _…_

### d) Late user joins

A third person opens the table mid-hand.

**Expected:** `join` with `clients_in_table` one higher, and one
`snapshot via=stream_connect` showing the current street, pot and whose turn
it is. They see no one's hole cards. They can sit down for the next hand
(`sit`), but are not dealt into the current one.

**Observed:** _…_

### e) Leave and return (tab close)

A seated player closes the tab, waits, then reopens it.

**Expected:** `disconnect`; after 10 s with no stream, `away` and an "Away"
tag on their seat; if it's their turn, the table waits 5 s, not 30 s, then
auto-checks or folds (`action_applied auto=true`). Reopening within 5 minutes
logs `join` and `back`; they keep their seat and chips. After 5 timeouts in a
row, or 5 minutes away, they're stood up when the hand ends
(`stood_up`).

**Observed:** _…_

### f) Isolated room joins

The app has one room (table 1); `/tables/2` does not exist.

**Expected:** `/tables/2` and `/tables/2/events` return 404, nothing about
table 1 changes, and a POST to table 2 only logs `action_received table=2`
and `action_rejected table=2 status=404`. Within table 1, what is private stays private: each user's
stream carries only their own hole cards before showdown (checked by
`spec/poker.test.ts`).

**Observed:** _…_

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

**Observed:** _…_

## Summary

| Scenario | Expected | Observed | Pass? |
|---|---|---|---|
| a) Two users join | Both see each other, 2 × `join` | | |
| b) Action propagates | Other screens within ~1 s, `broadcast` | | |
| c) Simultaneous actions | One applied, other rejected or lost race | | |
| d) Late join | Snapshot of current hand, no hidden cards | | |
| e) Leave and return | Away after 10 s, 5 s turns, seat kept | | |
| f) Isolated room | 404 for other tables; private cards stay private | | |
| g) Different machines | Not supported by design (single volume) | Not run | n/a |
| h) Machine restart | Reconnecting → Live, hand restored | | |

## Background: what earlier testing found

Before these logs existed, friends reported lag. Measuring the live site
(18 Oct) showed delivery itself took 16–31 ms; the real causes were a page
whose stream died silently and absent players who still made everyone wait
30 s per turn. Both were fixed (final brief Steps 3 and 4). The evidence is
in `docs/evidence/`.
