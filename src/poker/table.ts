// C9 Step 2: one real poker table's server-side rules. Every HTTP route in
// src/server.ts that touches the game calls into here; this is the only
// place that mutates poker_tables/seats/table_state/hand_results, and (with
// src/poker/engine.ts) the only place that imports @pokertools/engine.
import { findUserById } from "../accounts.ts";
import { db } from "../db.ts";
import type { Action, PublicState } from "./engine.ts";
import { PokerEngine } from "./engine.ts";

// Owner decision (docs/c9-brief.md): when it's your turn and you do nothing
// (or disconnect), the server acts for you after a countdown — check if
// checking is legal, otherwise fold. Overridable so Step 4's tests don't
// have to wait 30 real seconds; the app reads this once at boot, so the env
// var has to be set before the process starts (same pattern as APP_URL in
// spec/global-setup.ts).
export const TURN_TIMEOUT_SECONDS = Number(process.env.TURN_TIMEOUT_SECONDS ?? 30);

// A rejection the caller is meant to see verbatim (out-of-turn, illegal bet,
// table full, ...) — as opposed to a genuine bug, which should not leak its
// message to an HTTP response.
export class PokerError extends Error {}

// Thrown by commitPreparedAction when table_state moved between this
// action's prepare (read + validate) and its commit (write) — see that
// function for exactly what guarantees this, and why. A PokerError subtype,
// so an HTTP route that doesn't care about the distinction still returns it
// as a plain, clear 400.
export class StaleActionError extends PokerError {}

export interface PokerTable {
  id: number;
  name: string;
  small_blind: number;
  big_blind: number;
  buy_in: number;
  max_seats: number;
}

interface SeatRow {
  table_id: number;
  seat_no: number;
  user_id: number;
  stack: number;
}

interface TableStateRow {
  table_id: number;
  snapshot: string;
  version: number;
  turn_deadline: string | null;
  updated_at: string;
}

export interface LastAction {
  seat: number;
  type: string; // the engine's own ActionType string: "FOLD", "CHECK", ...
  auto: boolean; // true if the turn timer took this action, not a real click
  at: string;
}

export interface TableView {
  table: PokerTable;
  seats: { seatNo: number; userId: number; username: string; displayName: string; stack: number }[];
  // null until the table's first hand is ever dealt.
  hand: PublicState | null;
  turnDeadline: string | null;
  // Not persisted — purely a "something just happened" hint for the table
  // page to show ("auto-folded"), cleared the moment a new action replaces
  // it. Lost on restart, which is fine: nothing correctness-bearing reads it.
  lastAction: LastAction | null;
  you: number | null;
}

// In-memory, per table_id, for the same reason as `timers` below: it's a
// transient UI hint, not game state, so it doesn't belong in table_state.
const lastActionByTable = new Map<number, LastAction>();

// --- Live updates (Step 3) ---------------------------------------------
//
// One in-process pub/sub per table: every SSE connection (src/server.ts's
// GET /tables/:id/events) subscribes here, and every function below that
// changes a table's state calls notifyTable() once the change is committed.
// In-memory only — fine, since a dropped connection just reconnects and
// gets a fresh current view; nothing here is itself state that needs to
// survive a restart.
type TableListener = () => void;
const tableListeners = new Map<number, Set<TableListener>>();

export function subscribeToTable(tableId: number, listener: TableListener): () => void {
  let listeners = tableListeners.get(tableId);
  if (!listeners) {
    listeners = new Set();
    tableListeners.set(tableId, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) tableListeners.delete(tableId);
  };
}

function notifyTable(tableId: number): void {
  const listeners = tableListeners.get(tableId);
  if (!listeners) return;
  for (const listener of listeners) listener();
}

function getTable(tableId: number): PokerTable | undefined {
  return db.prepare("SELECT * FROM poker_tables WHERE id = ?").get(tableId) as PokerTable | undefined;
}

function requireTable(tableId: number): PokerTable {
  const table = getTable(tableId);
  if (!table) throw new PokerError("No such table.");
  return table;
}

function getSeats(tableId: number): SeatRow[] {
  return db
    .prepare("SELECT * FROM seats WHERE table_id = ? ORDER BY seat_no ASC")
    .all(tableId) as SeatRow[];
}

function getTableState(tableId: number): TableStateRow | undefined {
  return db.prepare("SELECT * FROM table_state WHERE table_id = ?").get(tableId) as
    | TableStateRow
    | undefined;
}

function restoreEngine(row: TableStateRow): PokerEngine {
  return PokerEngine.restore(JSON.parse(row.snapshot));
}

// The one function that builds "the view for user X" (docs/c9-brief.md, Step
// 2): public table state plus only X's own hole cards. Every response in
// this step, and every pushed SSE event in Step 3, is meant to go through
// this — never through engine.state (the unmasked getter) directly.
export function buildView(tableId: number, viewerUserId: number | undefined): TableView | undefined {
  const table = getTable(tableId);
  if (!table) return undefined;

  const seats = getSeats(tableId).map((s) => {
    const user = findUserById(s.user_id);
    return {
      seatNo: s.seat_no,
      userId: s.user_id,
      username: user?.username ?? "(unknown)",
      displayName: user?.display_name ?? "(unknown)",
      stack: s.stack,
    };
  });

  const stateRow = getTableState(tableId);
  const hand = stateRow
    ? restoreEngine(stateRow).view(viewerUserId !== undefined ? String(viewerUserId) : undefined)
    : null;

  return {
    table,
    seats,
    hand,
    turnDeadline: stateRow?.turn_deadline ?? null,
    lastAction: lastActionByTable.get(tableId) ?? null,
    you: viewerUserId ?? null,
  };
}

// --- Sitting down / leaving -------------------------------------------

// Always the table's fixed buy-in (docs/c9-brief.md owner decision: play
// chips only) — there is no parameter for a caller-chosen amount anywhere in
// this function's signature, which is what makes "no endpoint to add chips"
// true rather than just asserted.
export function sitDown(tableId: number, userId: number): void {
  const table = requireTable(tableId);
  const seats = getSeats(tableId);
  if (seats.some((s) => s.user_id === userId)) {
    throw new PokerError("You're already seated at this table.");
  }
  const taken = new Set(seats.map((s) => s.seat_no));
  let seatNo = -1;
  for (let i = 0; i < table.max_seats; i++) {
    if (!taken.has(i)) {
      seatNo = i;
      break;
    }
  }
  if (seatNo === -1) throw new PokerError("This table is full.");
  db.prepare("INSERT INTO seats (table_id, seat_no, user_id, stack) VALUES (?, ?, ?, ?)").run(
    tableId,
    seatNo,
    userId,
    table.buy_in,
  );
  notifyTable(tableId);
}

// Chips reset when you leave (owner decision): nothing here records or
// transfers the stack you walk away with — it's just dropped with the seat
// row, which is the only ledger it ever lived in.
export function leave(tableId: number, userId: number): void {
  requireTable(tableId);
  const seat = getSeats(tableId).find((s) => s.user_id === userId);
  if (!seat) throw new PokerError("You're not seated at this table.");

  const stateRow = getTableState(tableId);
  if (stateRow) {
    const engine = restoreEngine(stateRow);
    const handInProgress = engine.state.handNumber > 0 && engine.state.winners === null;
    const dealtIn = engine.state.players.some((p) => p && p.id === String(userId));
    // Scope decision for this step: leaving mid-hand is rejected outright
    // rather than folding the player out from under a hand in progress —
    // simpler to reason about and to verify than relying on the engine's
    // own partial-departure handling (STAND mid-hand retains a zero-stack
    // placeholder until the hand settles), and nothing in the brief or
    // Step 4's checks requires leaving mid-hand to work.
    if (handInProgress && dealtIn) {
      throw new PokerError("You can't leave mid-hand — wait for this hand to finish.");
    }
  }
  db.prepare("DELETE FROM seats WHERE table_id = ? AND user_id = ?").run(tableId, userId);
  notifyTable(tableId);
}

// --- Turn deadline persistence -----------------------------------------

function computeTurnDeadline(state: PokerEngine["state"]): string | null {
  if (state.winners !== null || state.actionTo === null) return null;
  return new Date(Date.now() + TURN_TIMEOUT_SECONDS * 1000).toISOString();
}

// Used only by startHand: a brand-new hand always replaces whatever
// table_state existed (or creates it, the first time a table is ever
// dealt into) — there's no prior in-progress action to race against here
// (startHand already checked no hand is in progress), so no version guard
// is needed.
function writeFreshTableState(tableId: number, engine: PokerEngine, previousVersion: number): void {
  const version = previousVersion + 1;
  const turnDeadline = computeTurnDeadline(engine.state);
  db.prepare(
    `INSERT INTO table_state (table_id, snapshot, version, turn_deadline, updated_at)
     VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT (table_id) DO UPDATE SET
       snapshot = excluded.snapshot,
       version = excluded.version,
       turn_deadline = excluded.turn_deadline,
       updated_at = excluded.updated_at`,
  ).run(tableId, JSON.stringify(engine.snapshot), version, turnDeadline);
}

// The guard docs/c9-brief.md asks for, made explicit rather than left to the
// accident of nothing else happening to run in between: this UPDATE only
// lands if table_state is still at exactly `previousVersion` — the version
// this action was read and validated against in prepareAction. SQLite
// evaluates the WHERE clause and applies the change atomically within
// whatever transaction this runs in; `result.changes` tells the caller
// whether it actually happened. If some other write (a real action winning
// a race against this table's timer, or vice versa, or this same timer
// firing twice) already moved the version, this is a no-op — not a partial
// write, not a crash, nothing.
function writeTableStateIfVersionMatches(
  tableId: number,
  engine: PokerEngine,
  previousVersion: number,
): boolean {
  const version = previousVersion + 1;
  const turnDeadline = computeTurnDeadline(engine.state);
  const result = db
    .prepare(
      `UPDATE table_state
       SET snapshot = ?, version = ?, turn_deadline = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE table_id = ? AND version = ?`,
    )
    .run(JSON.stringify(engine.snapshot), version, turnDeadline, tableId, previousVersion);
  return result.changes === 1;
}

// --- Starting a hand -----------------------------------------------------

function displayNameFor(userId: number): string {
  return findUserById(userId)?.display_name ?? `user ${userId}`;
}

export function startHand(tableId: number): void {
  const table = requireTable(tableId);
  const seats = getSeats(tableId);
  if (seats.length < 2) throw new PokerError("Need at least 2 players seated to start a hand.");

  const existing = getTableState(tableId);
  if (existing) {
    const current = restoreEngine(existing);
    if (current.state.handNumber > 0 && current.state.winners === null) {
      throw new PokerError("A hand is already in progress.");
    }
  }

  // A fresh engine each hand, seated from seats.stack — the authoritative
  // chip count between hands, carrying forward winnings/losses for anyone
  // who stayed seated rather than resetting to the table buy-in.
  const engine = new PokerEngine({
    smallBlind: table.small_blind,
    bigBlind: table.big_blind,
    maxPlayers: table.max_seats,
  });
  for (const seat of seats) {
    engine.sit(seat.seat_no, String(seat.user_id), displayNameFor(seat.user_id), seat.stack);
  }
  engine.deal();

  db.transaction(() => {
    writeFreshTableState(tableId, engine, existing?.version ?? 0);
  })();
  lastActionByTable.delete(tableId); // a fresh hand has no "last action" yet
  scheduleTimeoutFor(tableId);
  notifyTable(tableId);
}

// --- Acting ----------------------------------------------------------

function buildAction(rawType: string, playerId: string, amount: number | undefined): Action {
  switch (rawType.toLowerCase()) {
    case "fold":
      return { type: "FOLD", playerId } as Action;
    case "check":
      return { type: "CHECK", playerId } as Action;
    case "call":
      return { type: "CALL", playerId } as Action;
    case "bet":
      if (amount === undefined || !Number.isFinite(amount)) {
        throw new PokerError("A bet needs a numeric amount.");
      }
      return { type: "BET", playerId, amount } as Action;
    case "raise":
      if (amount === undefined || !Number.isFinite(amount)) {
        throw new PokerError("A raise needs a numeric amount.");
      }
      return { type: "RAISE", playerId, amount } as Action;
    default:
      throw new PokerError(`Unknown action: "${rawType}".`);
  }
}

interface PreparedAction {
  tableId: number;
  engine: PokerEngine; // already mutated by engine.act() — holds the new state
  previousVersion: number; // the version this was validated against
  stacksBeforeHand: Map<string, number>;
  handEnded: boolean;
  auto: boolean; // true if this is the turn timer's action, not a real click
  actingSeat: number; // who this action was for — see note at the call site below
  actionType: string; // the engine's own ActionType string, e.g. "FOLD"
}

// Read + validate only — no write. Split out from applyAction so the version
// guard below (commitPreparedAction) is something that can actually be
// demonstrated and tested directly, by preparing an action against one
// version and then trying to commit it after something else has already
// moved the table past that version.
export function prepareAction(
  tableId: number,
  playerId: string,
  rawType: string,
  amount: number | undefined,
  auto = false,
): PreparedAction {
  requireTable(tableId);
  const row = getTableState(tableId);
  if (!row) throw new PokerError("No hand in progress.");

  const engine = restoreEngine(row);
  if (engine.state.winners !== null) throw new PokerError("No hand in progress.");

  const action = buildAction(rawType, playerId, amount);
  // engine.validate() checks whose turn it is as part of ordinary
  // validation (NOT_YOUR_TURN is one of its own error codes) — out-of-turn
  // and illegal actions are both rejected right here, with the engine's own
  // message, before anything is mutated or written.
  const result = engine.validate(action);
  if (!result.valid) throw new PokerError(result.error);

  // actionTo, read here before engine.act() moves it, is exactly the seat
  // that's about to act — i.e. this action's seat. Captured directly rather
  // than read back afterward from actionHistory's last entry, because a
  // fold that ends a hand makes the engine append a further bookkeeping
  // entry (UNCALLED_BET_RETURNED, crediting back whatever the other player
  // over-bet) — found by actually looking at a real render, where the "last
  // action" label was showing the wrong player having done the wrong thing.
  const actingSeat = engine.state.actionTo;
  if (actingSeat === null) throw new PokerError("No one is to act.");

  // Captured before engine.act() mutates anything: seats.stack is still the
  // pre-action value (it's only written at commit time, at hand end), so
  // it's exactly "the stack this hand started from" for the net calculation.
  const stacksBeforeHand = new Map(getSeats(tableId).map((s) => [String(s.user_id), s.stack]));

  engine.act(action);

  return {
    tableId,
    engine,
    previousVersion: row.version,
    stacksBeforeHand,
    handEnded: engine.state.winners !== null,
    auto,
    actingSeat,
    actionType: action.type,
  };
}

// The guard docs/c9-brief.md asks for. Everything in this transaction is
// conditioned on table_state still being at exactly `previousVersion` —
// the version this action was prepared (read and validated) against:
// writeTableStateIfVersionMatches() is tried FIRST, and if it reports the
// row had already moved (some other write — a real action, or this same
// timer firing twice — got there first), the function returns immediately
// without touching seats or hand_results at all, then throws
// StaleActionError. Nothing is ever partially applied: either the
// snapshot, the stack updates and the hand_results rows for a hand ending
// all land together, or none of them do.
export function commitPreparedAction(prepared: PreparedAction): void {
  const { tableId, engine, previousVersion, stacksBeforeHand, handEnded, auto, actingSeat, actionType } = prepared;
  const newState = engine.state;

  const applied = db.transaction((): boolean => {
    if (!writeTableStateIfVersionMatches(tableId, engine, previousVersion)) {
      return false;
    }
    if (handEnded) {
      // Same transaction as the table_state write above, per the owner's
      // note: a hand ending is one atomic change to the database, not
      // three separate ones that could land only partially if the process
      // died in between — and now also gated on the same version check.
      for (const player of newState.players) {
        if (!player) continue;
        const userId = Number(player.id);
        const before = stacksBeforeHand.get(player.id) ?? player.stack;
        const net = player.stack - before;
        db.prepare("UPDATE seats SET stack = ? WHERE table_id = ? AND user_id = ?").run(
          player.stack,
          tableId,
          userId,
        );
        db.prepare("INSERT INTO hand_results (table_id, user_id, net) VALUES (?, ?, ?)").run(
          tableId,
          userId,
          net,
        );
      }
    }
    return true;
  })();

  if (!applied) {
    throw new StaleActionError(
      "This table changed before the action could be saved (lost a race with another action or the turn timer); nothing was applied.",
    );
  }

  // actingSeat/actionType, not actionHistory's last entry: when a fold ends
  // a hand, the engine appends a further bookkeeping entry
  // (UNCALLED_BET_RETURNED, crediting back the other player's over-bet)
  // after the fold itself, so "the last history entry" is the wrong action
  // on the wrong seat for display purposes. See prepareAction's comment.
  lastActionByTable.set(tableId, {
    seat: actingSeat,
    type: actionType,
    auto,
    at: new Date().toISOString(),
  });
  notifyTable(tableId);
}

// The one path every real action AND every auto (timeout) action goes
// through — docs/c9-brief.md Step 2 requires the timer to act "through the
// same action path as a real click", which this is, by construction: there
// is no second function anywhere that calls engine.act().
export function applyAction(
  tableId: number,
  playerId: string,
  rawType: string,
  amount: number | undefined,
  auto = false,
): void {
  commitPreparedAction(prepareAction(tableId, playerId, rawType, amount, auto));
  scheduleTimeoutFor(tableId);
}

// --- Turn timeout scheduler -----------------------------------------

// In-memory only, one live timer per table at most — rebuilt from the
// database on boot (restoreSchedulersOnBoot) rather than relied on to
// survive a restart itself. The deadline it's driven by does survive a
// restart, in table_state.turn_deadline; this map is just "what Node has
// queued up to check it next."
const timers = new Map<number, NodeJS.Timeout>();

// Re-arms (or cancels) table `tableId`'s timer to match the database's
// current turn_deadline. Called after every write to table_state — a real
// action's write reschedules (or clears) the timer exactly like the timer's
// own auto-action does, which is what makes "a real action cancels the
// timer" true: whichever one writes last wins, and the loser's stale timer
// (if any) gets cleared here before it can fire.
export function scheduleTimeoutFor(tableId: number): void {
  const existing = timers.get(tableId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(tableId);
  }
  const row = getTableState(tableId);
  if (!row || !row.turn_deadline) return;

  const delay = new Date(row.turn_deadline).getTime() - Date.now();
  if (delay <= 0) {
    runTimeout(tableId);
    return;
  }
  timers.set(
    tableId,
    setTimeout(() => runTimeout(tableId), delay),
  );
}

function runTimeout(tableId: number): void {
  timers.delete(tableId);

  // Re-read rather than trust anything captured when this was scheduled: if
  // a real action got there first, turn_deadline is already null or later
  // than "now", and this fires for nobody — which is how the timer avoids
  // ever acting twice or for the wrong player.
  const row = getTableState(tableId);
  if (!row || !row.turn_deadline) return;
  if (new Date(row.turn_deadline).getTime() > Date.now()) {
    scheduleTimeoutFor(tableId); // something moved the deadline later; re-arm for it
    return;
  }

  const engine = restoreEngine(row);
  const seat = engine.state.actionTo;
  if (seat === null || engine.state.winners !== null) return;
  const player = engine.state.players[seat];
  if (!player) return;

  const canCheck = engine.validate({ type: "CHECK", playerId: player.id } as Action).valid;
  try {
    applyAction(tableId, player.id, canCheck ? "check" : "fold", undefined, true);
  } catch (err) {
    if (err instanceof StaleActionError) {
      // A real action got there first between this function's read above
      // and applyAction's own write — exactly the race
      // writeTableStateIfVersionMatches exists to make safe. Nothing to do:
      // whoever won already called scheduleTimeoutFor for whatever's next.
      return;
    }
    // Legality was just checked above; this should be unreachable. Never
    // let a timeout's own bug take the whole server down.
    console.error(`poker: timeout auto-action failed for table ${tableId}`, err);
  }
}

// Called once at boot (src/server.ts), after migrations run. Covers both
// halves of the brief's requirement: a table whose deadline already passed
// while the process was down gets its auto action immediately (delay <= 0
// inside scheduleTimeoutFor), and every other table's future deadline is
// rescheduled.
export function restoreSchedulersOnBoot(): void {
  const rows = db.prepare("SELECT table_id FROM table_state").all() as { table_id: number }[];
  for (const row of rows) scheduleTimeoutFor(row.table_id);
}
