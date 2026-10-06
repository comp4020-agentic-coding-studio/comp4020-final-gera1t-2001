# ADR 0001: Application stack

## Status

Proposed — decision pending (human).

## Context

The final project's direction is not decided yet (see `README.md`), but this
week's slice (C8) fixes the shape of the app regardless of what it becomes:

- **Memory**: one shared-cpu-1x Fly machine, **256 MB** total, so the runtime,
  the app, and SQLite's working set all have to fit together.
- **Storage**: one volume at `/data`, the only thing that survives a restart
  or redeploy. No separate database server is available — SQLite (or
  anything file-backed) is the only realistic option.
- **`/readme/` must be server-rendered**: `spec/invariants.test.ts` checks the
  HTML the **server** sends, with no client JS involved, so whatever serves
  pages has to render on the server, not ship a client-side-only SPA shell.
- **Real-time is required starting week 10.** Whatever is chosen now has to
  be able to grow an SSE or WebSocket connection later without a rewrite.
- **Auth with hashed passwords** (scrypt, per Step 4) runs on every
  register/login/reset request — needs a stack that gives easy access to
  `node:crypto` and raw request/response handling for cookies.
- **Solo developer, limited time.** The course clock does not stop for
  learning a new framework; whatever is picked has to be productive within
  days, not weeks, and has to still be legible to the one person maintaining
  it under deadline pressure.

## Options considered

### Option A — Astro (Node/SSR adapter) + Drizzle ORM + `better-sqlite3`

The course's default full-stack starter stack; already used for a working
app in `comp4020-crit7-gera1t-2001`.

- **`/readme/`**: an Astro page/endpoint reads `README.md` server-side (e.g.
  via a markdown library) and returns rendered HTML; Astro's default
  rendering is server-side per request with the Node adapter, so no client
  JS is required for this route.
- **Real-time later**: Astro supports plain API route handlers, so an SSE
  endpoint is a normal `GET` handler that streams; a WebSocket needs either a
  custom Node server wrapping Astro's middleware or a separate lightweight
  endpoint — doable, but Astro's routing is not built around long-lived
  connections, so this is the most friction of the three options.
- **Memory fit**: Astro's SSR runtime plus Vite's dev/build tooling is the
  heaviest of the three at the Node-process level; in production (built,
  not dev server) the running footprint is modest, but the image and
  build step carry more weight than the other two.
- **Migrations**: Drizzle Kit generates SQL migration files from a schema
  file; migrations run on boot via a small script, as already proven in
  crit 7. Well-trodden path, lowest risk of surprise.
- **Cost**: already known from crit 7 — lowest learning cost, but brings
  along routing conventions and build tooling the app doesn't strictly need
  for what is currently just a handful of auth routes and a few pages.

### Option B — Hono + `better-sqlite3` (hand-written SQL, no ORM)

A minimal, fast web framework; runs on Node via `@hono/node-server`.

- **`/readme/`**: a plain route handler reads `README.md` from disk, renders
  it with a small markdown library, and returns an HTML string — server-side
  by construction, since Hono has no client-side runtime at all.
- **Real-time later**: Hono has first-class helpers for SSE
  (`hono/streaming`) and can sit behind the same Node HTTP server a
  WebSocket library (e.g. `ws`) attaches to — the most direct path to
  real-time of the three, since there is no routing framework fighting a
  long-lived connection.
- **Memory fit**: smallest runtime footprint of the three — Hono itself is a
  thin routing layer over `node:http`, no build-time SSR framework to carry
  into the running container.
- **Migrations**: no ORM migration tool by default; migrations would be
  hand-written `.sql` files applied in order by a small boot script that
  tracks an `applied_migrations` table — more to write up front than Option
  A, but transparent and easy to reason about for three tables.
- **Cost**: small learning curve (Hono's API is close to Express/Koa); more
  of the plumbing (templating, migration runner) has to be written by hand
  rather than coming from a framework default.

### Option C — Plain Node.js (`node:http`) + `node:sqlite`

No framework at all: a single request handler, manual routing by
`req.url`/`req.method`, Node's built-in `node:sqlite` module (stable since
Node 22) for storage.

- **`/readme/`**: identical approach to Option B — read, render, respond —
  with zero dependencies for the HTTP layer itself.
- **Real-time later**: SSE is a handler that never calls `res.end()` and
  writes `text/event-stream` chunks; a WebSocket needs an external library
  (`ws`) since `node:http` has no upgrade handling built in beyond the raw
  socket — comparable effort to Option B, slightly more manual wiring.
- **Memory fit**: the lightest possible option — no framework dependency at
  all beyond what Node ships with.
- **Migrations**: same hand-written `.sql` + tracking-table approach as
  Option B; `node:sqlite`'s API is lower-level than `better-sqlite3`'s, so a
  little more boilerplate per query.
- **Cost**: the most code has to be hand-rolled (routing, cookie parsing,
  body parsing) since there is no framework providing any of it — slowest to
  get the full auth flow working, even though each individual piece is
  simple.

## Decision

<!-- the human fills this in -->

## Consequences

<!-- the human fills this in -->
