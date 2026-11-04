-- Brief 2 Step 12: Casino Hold'em against the house, a game of its own. It
-- never reads or writes seats, table_state or hand_results, and nothing here
-- moves chips to or from the table: the two stacks are separate, the same
-- buy-in amount, never transferable either way. src/solo/game.ts is the only
-- code that writes these tables.

-- The player's solo stack. A row is made with the table's buy_in the first
-- time their solo state is read (or after a cash-out or a bust, which delete
-- it), and only settled hands move it after that.
--   after_hand_id: the newest solo_hands id when this stack started (0 if
--     none). The hands of this session are the ones with a larger id: a
--     session is told by id, never by the clock (a bust's hand and the new
--     stack are written in the same millisecond).
--   busted_hand_id: set on the stack a bust starts, to the hand that busted
--     the last one; the page shows that hand and "You're out" until the next
--     deal clears it. Kept here, not in the response, so a page without
--     JavaScript (a 303, then a GET) shows it too.
CREATE TABLE solo_stacks (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  stack INTEGER NOT NULL CHECK (stack >= 0),
  started_at TEXT NOT NULL,
  after_hand_id INTEGER NOT NULL DEFAULT 0,
  busted_hand_id INTEGER
);

-- The hand in progress, as JSON (the deck order, cards dealt, ante), so a
-- refresh or a redeploy mid-hand resumes it. Deleted when the hand settles.
CREATE TABLE solo_live (
  user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  state TEXT NOT NULL
);

-- Every settled hand, append-only. The cards are stored so the settlement can
-- be recomputed from them (spec/solo.test.ts does). Card lists are
-- space-separated ("As Kd"); board has 3 cards after a fold, 5 after a call.
CREATE TABLE solo_hands (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ante INTEGER NOT NULL CHECK (ante >= 1),
  player_cards TEXT NOT NULL,
  dealer_cards TEXT NOT NULL,
  board TEXT NOT NULL,
  outcome TEXT NOT NULL,
  player_rank INTEGER,
  dealer_qualified INTEGER,
  net INTEGER NOT NULL,
  ended_at TEXT NOT NULL
);
CREATE INDEX solo_hands_user ON solo_hands (user_id, id);

-- One row per finished session: from the stack's start to a cash-out or a
-- bust. net is the stack at the end minus the buy-in it started with.
CREATE TABLE solo_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  net INTEGER NOT NULL
);
