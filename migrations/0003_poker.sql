-- C9: one real-time poker table. Play chips only (owner decision, see
-- docs/c9-brief.md) — there is deliberately no column or table anywhere
-- here that lets chips be bought, added or transferred; `seats.stack` and
-- `poker_tables.buy_in` only ever move through sitting down, playing hands,
-- and leaving.

CREATE TABLE poker_tables (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  small_blind INTEGER NOT NULL,
  big_blind INTEGER NOT NULL,
  buy_in INTEGER NOT NULL,
  max_seats INTEGER NOT NULL
);

-- Who is currently sat at which table. `stack` is the authoritative chip
-- count between hands (set to buy_in on sit-down, moved by hand_results as
-- hands complete); the live, mid-hand stack lives in table_state.snapshot
-- instead, same as every other engine-owned number while a hand is in
-- progress. One row per occupied seat; a seat and a seated user are both
-- unique per table, matching "one user per table, one user per seat".
CREATE TABLE seats (
  table_id INTEGER NOT NULL REFERENCES poker_tables (id) ON DELETE CASCADE,
  seat_no INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  stack INTEGER NOT NULL,
  PRIMARY KEY (table_id, seat_no),
  UNIQUE (table_id, user_id)
);

-- The engine's own serialized state (src/poker/engine.ts's `snapshot`
-- getter / `restore`), one row per table, so a hand survives a restart or
-- redeploy (Step 2) instead of vanishing with the process. `version` is
-- bumped on every write and exists so a client reconnecting via SSE (Step
-- 3) can tell whether the view it already has is stale.
CREATE TABLE table_state (
  table_id INTEGER PRIMARY KEY REFERENCES poker_tables (id) ON DELETE CASCADE,
  snapshot TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per player per finished hand. Append-only history; a player's
-- net result is signed (can be negative), and nothing here is ever updated
-- or deleted by normal play.
CREATE TABLE hand_results (
  id INTEGER PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES poker_tables (id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  net INTEGER NOT NULL,
  ended_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Seed table. Numbers are a plain home-game default (5/10 blinds match the
-- ADR 0002 spike; 1000 chip buy-in and 6 seats are a reasonable "handful of
-- friends" table) — not an owner decision recorded anywhere, so they're
-- fine to revisit later without touching this migration (never edit an
-- applied one; a later migration would change the row instead).
INSERT INTO poker_tables (name, small_blind, big_blind, buy_in, max_seats)
VALUES ('Home game', 5, 10, 1000, 6);
