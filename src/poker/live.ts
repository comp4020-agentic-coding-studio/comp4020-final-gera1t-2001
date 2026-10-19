// Final brief Step 3: the live-stream timings, in one module that imports
// nothing from the app, so spec/ can read the same numbers the server uses
// (importing src/server.ts would start a server; src/poker/table.ts opens the
// database).

// GET /tables/:id/events sends a named "ping" event this often, pushes or
// not, so a client can tell a quiet table from a dead stream.
export const SSE_HEARTBEAT_MS = 5_000;

// Sent once on connect as the SSE "retry:" field: how long the browser's
// EventSource waits before reconnecting after the stream drops.
export const SSE_RETRY_MS = 2_000;
