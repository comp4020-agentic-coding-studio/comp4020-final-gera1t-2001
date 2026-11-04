// Final brief Steps 3 and 4: the live-table timings, in one module that
// imports nothing from the app, so spec/ can read the same numbers the server
// uses (importing src/server.ts would start a server; src/poker/table.ts opens
// the database). The env overrides are read once at boot, so a test run that
// shortens one has to set it for the app and for `pnpm check` alike:
//
//   TURN_TIMEOUT_SECONDS, SHOWDOWN_PAUSE_MS, AWAY_GRACE_MS, BOOT_GRACE_MS,
//   AWAY_TURN_SECONDS, AWAY_STAND_TIMEOUTS, AWAY_STAND_MS
//
// e.g. `SHOWDOWN_PAUSE_MS=2000 node src/server.ts` in one shell and
// `SHOWDOWN_PAUSE_MS=2000 pnpm check` in the other. CI sets none of them.
//
// The guest door's rate limit (brief 2 Step 11) is set the same way, and
// lives with the other account rules in src/account-messages.ts:
//
//   GUEST_LIMIT, GUEST_LIMIT_WINDOW_MS
//
// Not a timing but set the same way: TEST_HOOKS=1 (brief 2 step 10b) mounts
// the /test-hooks routes (src/server.ts; never with NODE_ENV=production, so
// never in the Docker image) and tells the spec they must be there. Without
// it, the tests that need them skip, and vitest's summary counts them.

// GET /tables/:id/events sends a named "ping" event this often, pushes or
// not, so a client can tell a quiet table from a dead stream.
export const SSE_HEARTBEAT_MS = 5_000;

// Sent once on connect as the SSE "retry:" field: how long the browser's
// EventSource waits before reconnecting after the stream drops.
export const SSE_RETRY_MS = 2_000;

// Owner decision (docs/c9-brief.md): when it's your turn and you do nothing,
// the server acts for you after this long: check if checking is legal,
// otherwise fold. 30 s until docs/final-brief-2.md (4 Nov) made it 20.
export const TURN_TIMEOUT_SECONDS = Number(process.env.TURN_TIMEOUT_SECONDS ?? 20);

// Owner decision (docs/final-brief-2.md, 4 Nov): a finished hand stays on the
// felt this long, then the next hand deals itself if at least two seated
// players are present (not away). Otherwise someone presses Deal next hand.
export const SHOWDOWN_PAUSE_MS = Number(process.env.SHOWDOWN_PAUSE_MS ?? 6_000);

// --- Presence and ghost seats (owner decision, 18 Oct; final brief Step 4) --
// The owner may tune these after a real game. The two stand-up numbers were
// raised before the first deploy (19 Oct): phones drop the stream whenever
// the app goes to the background, and standing up resets chips, so they have
// to be long enough that answering a message doesn't cost anyone their stack.

// A seated player with no open stream for this long is away. Long enough that
// a refresh or a short reconnect doesn't count.
export const AWAY_GRACE_MS = Number(process.env.AWAY_GRACE_MS ?? 10_000);

// Nobody has a stream right after a boot, so every seated player counts as
// present for this long after the process starts; a deploy doesn't stand the
// whole table up.
export const BOOT_GRACE_MS = Number(process.env.BOOT_GRACE_MS ?? 30_000);

// An away player's turn waits this long instead of TURN_TIMEOUT_SECONDS.
export const AWAY_TURN_SECONDS = Number(process.env.AWAY_TURN_SECONDS ?? 5);

// Stood up when the current hand ends (or, between hands, by a timer) after
// this many timeouts in a row...
export const AWAY_STAND_TIMEOUTS = Number(process.env.AWAY_STAND_TIMEOUTS ?? 5);

// ...or once they've been away for longer than this.
export const AWAY_STAND_MS = Number(process.env.AWAY_STAND_MS ?? 5 * 60_000);
