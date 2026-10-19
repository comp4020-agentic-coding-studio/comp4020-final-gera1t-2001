// Final brief Steps 3 and 4: the live-table timings, in one module that
// imports nothing from the app, so spec/ can read the same numbers the server
// uses (importing src/server.ts would start a server; src/poker/table.ts opens
// the database). The env overrides are read once at boot, so a test run that
// shortens one has to set it for the app and for `pnpm check` alike.

// GET /tables/:id/events sends a named "ping" event this often, pushes or
// not, so a client can tell a quiet table from a dead stream.
export const SSE_HEARTBEAT_MS = 5_000;

// Sent once on connect as the SSE "retry:" field: how long the browser's
// EventSource waits before reconnecting after the stream drops.
export const SSE_RETRY_MS = 2_000;

// Owner decision (docs/c9-brief.md): when it's your turn and you do nothing,
// the server acts for you after this long: check if checking is legal,
// otherwise fold.
export const TURN_TIMEOUT_SECONDS = Number(process.env.TURN_TIMEOUT_SECONDS ?? 30);

// --- Presence and ghost seats (owner decision, 18 Oct; final brief Step 4) --
// The owner may tune these after a real game.

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
export const AWAY_STAND_TIMEOUTS = Number(process.env.AWAY_STAND_TIMEOUTS ?? 2);

// ...or once they've been away for longer than this.
export const AWAY_STAND_MS = Number(process.env.AWAY_STAND_MS ?? 60_000);
