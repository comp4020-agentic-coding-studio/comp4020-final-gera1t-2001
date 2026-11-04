// C9 Step 2: one real poker table's server-side rules. Every HTTP route in
// src/server.ts that touches the game calls into here; this is the only
// place that mutates poker_tables/seats/table_state/hand_results, and (with
// src/poker/engine.ts) the only place that imports @pokertools/engine.
import { randomUUID } from "node:crypto";

import { findUserById } from "../accounts.ts";
import { db } from "../db.ts";
import { logEvent } from "../log.ts";
import type { Action, PublicState } from "./engine.ts";
import { PokerEngine } from "./engine.ts";
import {
  AWAY_GRACE_MS,
  AWAY_STAND_MS,
  AWAY_STAND_TIMEOUTS,
  AWAY_TURN_SECONDS,
  BOOT_GRACE_MS,
  SHOWDOWN_PAUSE_MS,
  TURN_TIMEOUT_SECONDS,
} from "./live.ts";
import { STALE_ACTION_MESSAGE, UNKNOWN_MOVE_MESSAGE, playerMessageForEngineError } from "./messages.ts";

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
  // Chips this action put in: the call's size, or the bet/raise-to total
  // (final brief Step 7's "call 20", "raise to 80"). null for fold/check.
  amount: number | null;
  at: string;
}

// Final brief Step 4: who was just stood up, a one-shot hint like lastAction
// so the page can say why a seat emptied. Cleared when the next hand is
// dealt. Brief 2 step 10b added "out_of_chips"; one hand's end can stand up
// both a ghost and a busted player, so the reason is per player. `type`
// stays "stood_up" for both.
export type StandUpReason = "away" | "out_of_chips";
export interface TableNotice {
  type: "stood_up";
  players: { userId: number; displayName: string; reason: StandUpReason }[];
  at: string;
}

export interface TableView {
  table: PokerTable;
  // `away`: no open stream for AWAY_GRACE_MS (final brief Step 4).
  seats: { seatNo: number; userId: number; username: string; displayName: string; stack: number; away: boolean }[];
  // null until the table's first hand is ever dealt.
  hand: PublicState | null;
  turnDeadline: string | null;
  // Final brief Step 7: how long the current turn is (TURN_TIMEOUT_SECONDS,
  // or AWAY_TURN_SECONDS for an away player), so the turn ring's share is
  // time left / this, never a hard-coded number. null when nobody is to act.
  turnSeconds: number | null;
  // Brief 2 Step 10: when the finished hand on the felt gives way to the next
  // one, dealt by the server (scheduleAutoDeal). null while a hand runs, or
  // when no deal is coming (fewer than two present). The page counts down to
  // it from the server's time, as it does for turnDeadline.
  nextHandAt: string | null;
  // table_state.version (0 before the first hand) — what a client or test
  // compares to tell whether anything was written, not only whether the
  // public state happens to look the same.
  version: number;
  // Final brief Step 3: a per-table counter bumped by every notifyTable(),
  // plus an id for this process. A client renders a view only if bootId
  // changed or seq didn't go down, so a slow response can't paint over a
  // newer push. In memory: a restart starts seq again at 0, under a new
  // bootId.
  seq: number;
  bootId: string;
  // Not persisted — purely a "something just happened" hint for the table
  // page to show ("auto-folded"), cleared the moment a new action replaces
  // it. Lost on restart, which is fine: nothing correctness-bearing reads it.
  lastAction: LastAction | null;
  notice: TableNotice | null;
  you: number | null;
  // The viewer's own display name, seated or not — so a page can say who
  // this browser is signed in as (final brief Step 2's banner).
  youDisplayName: string | null;
}

// In-memory, per table_id, for the same reason as `timers` below: it's a
// transient UI hint, not game state, so it doesn't belong in table_state.
const lastActionByTable = new Map<number, LastAction>();
const noticeByTable = new Map<number, TableNotice>();

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

export const BOOT_ID = randomUUID();
const seqByTable = new Map<number, number>();

export function currentSeq(tableId: number): number {
  return seqByTable.get(tableId) ?? 0;
}

// Final brief Step 4: subscribing is also how the table knows who is still
// there. The returned function is safe to call more than once (the SSE route
// calls it both on abort and when its loop ends), so a stream is counted
// out exactly once.
export function subscribeToTable(tableId: number, userId: number, listener: TableListener): () => void {
  let listeners = tableListeners.get(tableId);
  if (!listeners) {
    listeners = new Set();
    tableListeners.set(tableId, listeners);
  }
  listeners.add(listener);
  streamOpened(tableId, userId);
  logEvent("join", {
    table: tableId,
    user: userId,
    name: displayNameFor(userId),
    clients_in_table: listeners.size,
    users_connected: usersConnected(tableId),
  });
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    listeners.delete(listener);
    if (listeners.size === 0) tableListeners.delete(tableId);
    streamClosed(tableId, userId);
    logEvent("disconnect", {
      table: tableId,
      user: userId,
      name: displayNameFor(userId),
      clients_in_table: listeners.size,
      users_connected: usersConnected(tableId),
    });
  };
}

// --- Presence (final brief Step 4) ---------------------------------------
//
// In memory, like the listeners above: who is here isn't game state, and
// after a restart every stream reconnects anyway. A seated player is away
// once they've had no open stream for AWAY_GRACE_MS, measured from when
// their last stream closed or they last posted, whichever is later. Nobody
// has a stream right after a boot, so nobody is away before BOOT_GRACE_MS
// has passed since BOOTED_AT; a seated player with no entry here (seated
// before this process started, and never connected since) counts from
// BOOTED_AT.
//
// What away changes: an away player's turn waits AWAY_TURN_SECONDS, and
// they're stood up once a hand ends (or, between hands, by
// schedulePresenceCheck's timer) after AWAY_STAND_TIMEOUTS timeouts in a row
// or more than AWAY_STAND_MS away.
const BOOTED_AT = Date.now();

interface Presence {
  openStreams: number;
  lastSeenAt: number; // last stream close or POST, ms since epoch
}
const presenceByTable = new Map<number, Map<number, Presence>>();

// Turn timeouts in a row, per table and user. Any real action resets it, and
// so does leaving. In memory: a restart forgets it, which costs at most
// AWAY_STAND_TIMEOUTS - 1 extra short turns; the AWAY_STAND_MS rule still
// stands a ghost up.
const timeoutsInARow = new Map<number, Map<number, number>>();

function presenceFor(tableId: number, userId: number): Presence {
  let table = presenceByTable.get(tableId);
  if (!table) {
    table = new Map();
    presenceByTable.set(tableId, table);
  }
  let presence = table.get(userId);
  if (!presence) {
    presence = { openStreams: 0, lastSeenAt: BOOTED_AT };
    table.set(userId, presence);
  }
  return presence;
}

// When this user became (or will become) away; undefined while a stream is
// open. Away iff this is <= now.
function awaySince(tableId: number, userId: number): number | undefined {
  const presence = presenceByTable.get(tableId)?.get(userId);
  if (presence && presence.openStreams > 0) return undefined;
  const lastSeenAt = presence?.lastSeenAt ?? BOOTED_AT;
  return Math.max(lastSeenAt + AWAY_GRACE_MS, BOOTED_AT + BOOT_GRACE_MS);
}

// For the logs: how many distinct users have at least one open stream.
function usersConnected(tableId: number): number {
  let n = 0;
  for (const presence of presenceByTable.get(tableId)?.values() ?? []) if (presence.openStreams > 0) n++;
  return n;
}

// For the logs only: which seated users have already been logged as away, so
// "away" is logged once when it happens and "back" once when it ends.
const loggedAway = new Map<number, Set<number>>();

function logAwayChanges(tableId: number, now = Date.now()): void {
  let logged = loggedAway.get(tableId);
  if (!logged) {
    logged = new Set();
    loggedAway.set(tableId, logged);
  }
  const seated = new Set(getSeats(tableId).map((s) => s.user_id));
  for (const userId of seated) {
    const away = isAway(tableId, userId, now);
    if (away && !logged.has(userId)) {
      logged.add(userId);
      logEvent("away", { table: tableId, user: userId, name: displayNameFor(userId) });
    } else if (!away && logged.has(userId)) {
      logged.delete(userId);
      logEvent("back", { table: tableId, user: userId, name: displayNameFor(userId) });
    }
  }
  for (const userId of logged) if (!seated.has(userId)) logged.delete(userId);
}

function isAway(tableId: number, userId: number, now = Date.now()): boolean {
  const since = awaySince(tableId, userId);
  return since !== undefined && since <= now;
}

function streamOpened(tableId: number, userId: number): void {
  const wasAway = isAway(tableId, userId);
  presenceFor(tableId, userId).openStreams++;
  presenceChanged(tableId, wasAway);
}

function streamClosed(tableId: number, userId: number): void {
  const presence = presenceFor(tableId, userId);
  presence.openStreams = Math.max(0, presence.openStreams - 1);
  presence.lastSeenAt = Date.now();
  schedulePresenceCheck(tableId);
}

// Any poker POST from a user (src/server.ts) counts as being here, stream
// or not.
export function markPresent(tableId: number, userId: number): void {
  const wasAway = isAway(tableId, userId);
  presenceFor(tableId, userId).lastSeenAt = Date.now();
  presenceChanged(tableId, wasAway);
}

// A seat coming back changes what its `away` flag shows, so the table hears
// about it; becoming away is handled by schedulePresenceCheck's timer.
function presenceChanged(tableId: number, wasAway: boolean): void {
  if (wasAway) {
    logAwayChanges(tableId);
    notifyTable(tableId);
  }
  schedulePresenceCheck(tableId);
}

function seatsToStandUp(tableId: number, now = Date.now()): number[] {
  const counts = timeoutsInARow.get(tableId);
  return getSeats(tableId)
    .filter((s) => {
      if ((counts?.get(s.user_id) ?? 0) >= AWAY_STAND_TIMEOUTS) return true;
      const since = awaySince(tableId, s.user_id);
      return since !== undefined && now - since > AWAY_STAND_MS;
    })
    .map((s) => s.user_id);
}

// Stands up each user through leave(), so the chip rule (the stack goes with
// the seat row) and the notification are the same as any other leave, and
// records who went, and why, for the view's notice. Only ever called with no
// hand in progress. With `addToNotice`, adds to the notice instead of
// replacing it: afterHandEnded stands up busters and ghosts in two calls for
// one event, and both belong in one notice. Any later stand-up (the presence
// timer, minutes on) starts a fresh notice, so old names don't pile up.
function standUp(tableId: number, userIds: number[], reason: StandUpReason, addToNotice = false): void {
  const gone: TableNotice["players"] = [];
  for (const userId of userIds) {
    try {
      const timeouts = timeoutsInARow.get(tableId)?.get(userId) ?? 0;
      leave(tableId, userId);
      gone.push({ userId, displayName: displayNameFor(userId), reason });
      logEvent("stood_up", {
        table: tableId,
        user: userId,
        name: displayNameFor(userId),
        reason: reason === "out_of_chips" ? reason : timeouts >= AWAY_STAND_TIMEOUTS ? "timeouts" : "away",
        timeouts_in_a_row: timeouts,
      });
    } catch (err) {
      // Already gone, or a hand is somehow still running: try the next seat.
      console.error(`poker: couldn't stand up user ${userId} at table ${tableId}`, err);
    }
  }
  if (gone.length === 0) return;
  const earlier = addToNotice ? (noticeByTable.get(tableId)?.players ?? []) : [];
  noticeByTable.set(tableId, { type: "stood_up", players: [...earlier, ...gone], at: new Date().toISOString() });
  notifyTable(tableId);
}

function standUpAway(tableId: number, userIds: number[]): void {
  standUp(tableId, userIds, "away");
}

function handInProgress(tableId: number): boolean {
  const row = getTableState(tableId);
  if (!row) return false;
  const state = restoreEngine(row).state;
  return state.handNumber > 0 && state.winners === null;
}

// One timer per table, armed for the next moment a seated player's presence
// does something on its own: someone crosses into away (their seat shows it,
// and if it's their turn the deadline is pulled in), or, between hands,
// someone has been away more than AWAY_STAND_MS (stood up). Works from the
// seats, not the presence map, since a ghost seated before a restart has no
// entry there. Re-armed whenever anything it depends on changes.
const presenceTimers = new Map<number, NodeJS.Timeout>();

export function schedulePresenceCheck(tableId: number): void {
  const existing = presenceTimers.get(tableId);
  if (existing) clearTimeout(existing);
  presenceTimers.delete(tableId);

  const now = Date.now();
  const running = handInProgress(tableId);
  let next = Infinity;
  for (const seat of getSeats(tableId)) {
    const since = awaySince(tableId, seat.user_id);
    if (since === undefined) continue;
    if (since > now) next = Math.min(next, since);
    else if (!running) next = Math.min(next, since + AWAY_STAND_MS + 1);
  }
  if (next === Infinity) return;
  presenceTimers.set(
    tableId,
    setTimeout(() => runPresenceCheck(tableId), Math.max(0, next - now)),
  );
}

function runPresenceCheck(tableId: number): void {
  presenceTimers.delete(tableId);
  try {
    const now = Date.now();
    // Anyone who became away since the last check: their seat's flag changed.
    logAwayChanges(tableId, now);
    notifyTable(tableId);
    pullInDeadlineIfAway(tableId, now);
    if (!handInProgress(tableId)) standUpAway(tableId, seatsToStandUp(tableId, now));
  } catch (err) {
    console.error(`poker: presence check failed for table ${tableId}`, err);
  }
  schedulePresenceCheck(tableId);
}

// The turn's real deadline, as of `now`: the stored one, or, if the player
// to act has gone away mid-turn, AWAY_TURN_SECONDS from the moment they went
// away, whichever is sooner. A pure function of the row and presence, so it
// doesn't depend on any timer firing on time. Before the ghost-seat flake
// fix (process log, 4 Nov) only pullInDeadlineIfAway's timer moved the
// deadline, and only from when it ran: an event loop busy for a few hundred
// ms (scrypt on a register, a parallel test file) left a window where a view
// said `away: true` beside the full TURN_TIMEOUT_SECONDS deadline. The view,
// the turn ring and the turn timer all read this instead.
function effectiveDeadline(tableId: number, row: TableStateRow, now = Date.now()): number | null {
  if (!row.turn_deadline) return null;
  const stored = new Date(row.turn_deadline).getTime();
  const state = restoreEngine(row).state;
  if (state.winners !== null || state.actionTo === null) return stored;
  const player = state.players[state.actionTo];
  if (!player) return stored;
  const since = awaySince(tableId, Number(player.id));
  if (since === undefined || since > now) return stored;
  // Away since before this turn began counts from the turn's start instead
  // (computeTurnDeadline already gave it the short turn then).
  const turnStart = new Date(row.updated_at).getTime();
  return Math.min(stored, Math.max(since, turnStart) + AWAY_TURN_SECONDS * 1000);
}

// Writes effectiveDeadline back to the row once the player to act has gone
// away, so what's stored matches what every view already shows. Guarded on
// version so it can't land on a turn that moved on, but leaves version as it
// is: only the deadline changes, so an action already validated against this
// version is still valid, and nothing a client compares version for has
// changed. The turn timer stays the only thing that acts.
function pullInDeadlineIfAway(tableId: number, now: number): void {
  const row = getTableState(tableId);
  if (!row || !row.turn_deadline) return;
  const effective = effectiveDeadline(tableId, row, now);
  if (effective === null || effective >= new Date(row.turn_deadline).getTime()) return;
  const result = db
    .prepare("UPDATE table_state SET turn_deadline = ? WHERE table_id = ? AND version = ?")
    .run(new Date(effective).toISOString(), tableId, row.version);
  if (result.changes !== 1) return;
  scheduleTimeoutFor(tableId);
  notifyTable(tableId);
}

function notifyTable(tableId: number): void {
  // Bumped before any listener runs, and every caller has already committed
  // its change, so any view built from here on (by a listener or by the
  // route's own response) reads a seq at least this high.
  seqByTable.set(tableId, currentSeq(tableId) + 1);
  const listeners = tableListeners.get(tableId);
  logEvent("broadcast", { table: tableId, seq: currentSeq(tableId), recipients: listeners?.size ?? 0 });
  if (!listeners) return;
  // One listener throwing shouldn't stop the rest of a table's connections
  // from hearing about the change.
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error(`poker: a table ${tableId} listener threw`, err);
    }
  }
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

  // Read before any table data: everything below is at least as new as this
  // seq, so a view never claims a seq newer than what it shows.
  const seq = currentSeq(tableId);

  const seats = getSeats(tableId).map((s) => {
    const user = findUserById(s.user_id);
    return {
      seatNo: s.seat_no,
      userId: s.user_id,
      username: user?.username ?? "(unknown)",
      displayName: user?.display_name ?? "(unknown)",
      stack: s.stack,
      away: isAway(tableId, s.user_id),
    };
  });

  const stateRow = getTableState(tableId);
  const hand = stateRow
    ? restoreEngine(stateRow).view(viewerUserId !== undefined ? String(viewerUserId) : undefined)
    : null;
  const deadline = stateRow ? effectiveDeadline(tableId, stateRow) : null;

  return {
    table,
    seats,
    hand,
    turnDeadline: deadline !== null ? new Date(deadline).toISOString() : null,
    turnSeconds: stateRow && deadline !== null ? turnSeconds(stateRow, deadline) : null,
    nextHandAt: nextHandAt(tableId),
    version: stateRow?.version ?? 0,
    seq,
    bootId: BOOT_ID,
    lastAction: lastActionByTable.get(tableId) ?? null,
    notice: noticeByTable.get(tableId) ?? null,
    you: viewerUserId ?? null,
    youDisplayName: viewerUserId !== undefined ? (findUserById(viewerUserId)?.display_name ?? null) : null,
  };
}

// Every write that starts a turn sets turn_deadline and updated_at together,
// so the turn's length is the deadline minus updated_at. An away player's
// deadline (effectiveDeadline) moves only the deadline, which makes this turn
// shorter from when it started: the ring keeps going down, it doesn't refill.
// Read from the row rather than kept in memory, so it survives a restart.
function turnSeconds(row: TableStateRow, deadline: number): number {
  const ms = deadline - new Date(row.updated_at).getTime();
  return Math.max(1, Math.round(ms / 1000));
}

export interface HandResult {
  userId: number;
  username: string;
  net: number;
  endedAt: string;
}

// Append-only history, oldest first — added for Step 4's check that a
// hand's results are recorded and stay readable after the request that
// ended it. Nothing before Step 4 needed to read hand_results back over
// HTTP, so there was no route for it until now.
export function getHandResults(tableId: number): HandResult[] {
  requireTable(tableId);
  return db
    .prepare(
      `SELECT hand_results.user_id AS userId, users.username AS username,
              hand_results.net AS net, hand_results.ended_at AS endedAt
       FROM hand_results
       JOIN users ON users.id = hand_results.user_id
       WHERE hand_results.table_id = ?
       ORDER BY hand_results.id ASC`,
    )
    .all(tableId) as HandResult[];
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
  logEvent("sit", { table: tableId, user: userId, name: displayNameFor(userId), seat: seatNo, stack: table.buy_in });
  notifyTable(tableId);
  schedulePresenceCheck(tableId); // a new seat with no stream turns away on its own
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
  logEvent("leave_seat", { table: tableId, user: userId, name: displayNameFor(userId), seat: seat.seat_no });
  timeoutsInARow.get(tableId)?.delete(userId); // sitting down again starts from 0
  // Brief 2 Step 10: a leave (or a stand-up, which comes through here) that
  // leaves fewer than two present cancels a pending auto-deal for good; a
  // newcomer sitting down in the pause doesn't revive it.
  if (presentSeatCount(tableId) < 2) cancelAutoDeal(tableId);
  notifyTable(tableId);
  schedulePresenceCheck(tableId);
}

// Test-only (brief 2 step 10b): sets seated stacks between hands, so a test
// can reach states real play takes dozens of hands to reach (both blinds all
// in). Only src/server.ts's /test-hooks route calls it, and that route is
// only mounted outside production; see there. Refuses mid-hand.
export function setStacksForTest(tableId: number, stacks: Map<number, number>): void {
  requireTable(tableId);
  if (handInProgress(tableId)) throw new PokerError("A hand is in progress.");
  const seated = new Set(getSeats(tableId).map((s) => s.user_id));
  for (const [userId, stack] of stacks) {
    if (!seated.has(userId)) throw new PokerError(`User ${userId} isn't seated.`);
    if (!Number.isInteger(stack) || stack < 0) throw new PokerError("Stacks are whole numbers, 0 or more.");
  }
  for (const [userId, stack] of stacks) {
    db.prepare("UPDATE seats SET stack = ? WHERE table_id = ? AND user_id = ?").run(stack, tableId, userId);
  }
  logEvent("test_hook_stacks", { table: tableId, users: [...stacks.keys()].join(",") });
  notifyTable(tableId);
}

// --- Settling a finished hand --------------------------------------------
//
// Brief 2 step 10b: one path for every way a hand ends. A hand usually ends
// on an action (commitPreparedAction), but it can also end inside deal(),
// when the blinds put every player all in (the engine runs it out and
// settles at once: dist/rules/showdown.js shouldShowdown, reached from
// game-reducer.js's settle loop after DEAL). startHand used to write only
// the snapshot for that, so the stacks and hand_results never moved.

// Writes the finished hand's stacks and hand_results rows. Called inside the
// caller's transaction, after its table_state write, so a hand's end is one
// atomic change. One timestamp for the whole hand, so its rows share an
// ended_at and /results can group them back into a hand (hand_results has no
// hand id). SQLite's 'now' is only fixed within one statement, and this is
// one INSERT per player.
function writeHandSettlement(tableId: number, state: PokerEngine["state"], stacksBeforeHand: Map<string, number>): void {
  const endedAt = new Date().toISOString();
  for (const player of state.players) {
    if (!player) continue;
    const userId = Number(player.id);
    const before = stacksBeforeHand.get(player.id) ?? player.stack;
    db.prepare("UPDATE seats SET stack = ? WHERE table_id = ? AND user_id = ?").run(player.stack, tableId, userId);
    db.prepare("INSERT INTO hand_results (table_id, user_id, net, ended_at) VALUES (?, ?, ?, ?)").run(
      tableId,
      userId,
      player.stack - before,
      endedAt,
    );
  }
}

// After the settlement has committed: stand up ghosts (AWAY_STAND_TIMEOUTS
// timeouts in a row, or away more than AWAY_STAND_MS), then anyone left with
// 0 chips (owner decision, 4 Nov: "<name> is out of chips"; the engine won't
// seat a 0 stack, validation.js validateSitAction, so they couldn't be dealt
// in anyway, and sitting again gives the fixed buy-in through sitDown), then
// arm the auto-deal (brief 2 Step 10) for whoever is left. Never mid-hand.
// The stand-ups broadcast on their own; the caller broadcasts after this.
function afterHandEnded(tableId: number): void {
  // Busters first: a ghost who also lost everything is out of chips, which
  // is the owner's notice for 0 chips at hand end.
  standUpBusted(tableId);
  standUp(tableId, seatsToStandUp(tableId), "away", true);
  // Only if two are still present: a heads-up bust leaves one, and leave()'s
  // rule is that a pause left with fewer than two is over for good (a
  // newcomer sitting down in it doesn't revive it).
  if (presentSeatCount(tableId) >= 2) scheduleAutoDeal(tableId);
  else cancelAutoDeal(tableId);
}

// Anyone seated at 0 chips. Called at every hand end, and by startHand
// before it deals, which catches a 0 seat from any other route (a seat that
// busted before this rule shipped, a crash between a hand's commit and
// afterHandEnded, the test hook): the engine refuses to seat a 0 stack
// (validation.js validateSitAction), so one 0 seat would otherwise fail
// every deal.
function standUpBusted(tableId: number): void {
  standUp(
    tableId,
    getSeats(tableId)
      .filter((s) => s.stack === 0)
      .map((s) => s.user_id),
    "out_of_chips",
    true,
  );
}

// --- Turn deadline persistence -----------------------------------------

// Final brief Step 4: a turn that starts for an away player waits
// AWAY_TURN_SECONDS instead.
function computeTurnDeadline(tableId: number, state: PokerEngine["state"]): string | null {
  if (state.winners !== null || state.actionTo === null) return null;
  const player = state.players[state.actionTo];
  const away = player !== null && player !== undefined && isAway(tableId, Number(player.id));
  return new Date(Date.now() + (away ? AWAY_TURN_SECONDS : TURN_TIMEOUT_SECONDS) * 1000).toISOString();
}

// Used only by startHand: a brand-new hand always replaces whatever
// table_state existed (or creates it, the first time a table is ever
// dealt into) — there's no prior in-progress action to race against here
// (startHand already checked no hand is in progress), so no version guard
// is needed.
function writeFreshTableState(tableId: number, engine: PokerEngine, previousVersion: number): void {
  const version = previousVersion + 1;
  const turnDeadline = computeTurnDeadline(tableId, engine.state);
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
  const turnDeadline = computeTurnDeadline(tableId, engine.state);
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

// `by`: who dealt, for the logs only. "auto" is runAutoDeal (brief 2 Step 10).
export function startHand(tableId: number, by: "manual" | "auto" = "manual"): void {
  const table = requireTable(tableId);
  if (getSeats(tableId).length < 2) throw new PokerError("Need at least 2 players seated to start a hand.");

  const existing = getTableState(tableId);
  if (existing) {
    const current = restoreEngine(existing);
    if (current.state.handNumber > 0 && current.state.winners === null) {
      throw new PokerError("A hand is already in progress.");
    }
  }
  // A 0 seat can't be dealt in; see standUpBusted.
  noticeByTable.delete(tableId); // this deal's stand-ups make the new notice
  standUpBusted(tableId);

  // Final brief Step 4: deal in present players only. On a manual deal, anyone
  // away is stood up first; if that leaves fewer than two, those stand-ups
  // still stand: they were away either way. Brief 2 Step 10: an auto-deal
  // stands nobody up. It would otherwise turn "stood up after 5 timeouts or
  // 5 min away" (owner decision) into "stood up at the next deal", 6 s after
  // any hand ends, for a phone that locked near its end. runAutoDeal only
  // calls this with two present players; away ones sit the hand out.
  if (by === "manual") {
    standUp(
      tableId,
      getSeats(tableId)
        .filter((s) => isAway(tableId, s.user_id))
        .map((s) => s.user_id),
      "away",
      true,
    );
  }
  const seats = getSeats(tableId).filter((s) => by === "manual" || !isAway(tableId, s.user_id));
  if (seats.length < 2) throw new PokerError("Need at least 2 players seated to start a hand.");

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
  // Both blinds all in ends the hand here, before anyone acts (see
  // writeHandSettlement). Tabled the same way as any showdown.
  const endedAtDeal = engine.state.winners !== null;
  if (endedAtDeal) tableShowdownHands(engine);
  const stacksBeforeHand = new Map(seats.map((s) => [String(s.user_id), s.stack]));

  db.transaction(() => {
    writeFreshTableState(tableId, engine, existing?.version ?? 0);
    if (endedAtDeal) writeHandSettlement(tableId, engine.state, stacksBeforeHand);
  })();
  cancelAutoDeal(tableId); // a new hand is on the felt; any pending deal is moot
  logEvent("hand_start", {
    table: tableId,
    hand: engine.state.handNumber,
    players: seats.length,
    to_act: engine.state.actionTo,
    by,
    ended_at_deal: endedAtDeal,
  });
  lastActionByTable.delete(tableId); // a fresh hand has no "last action" yet
  // The notice stays only if this deal stood someone up (busted, or away on a
  // manual deal): it says why their seat just emptied. Otherwise the new hand
  // clears the last one, as before.
  scheduleTimeoutFor(tableId);
  if (endedAtDeal) afterHandEnded(tableId);
  notifyTable(tableId);
  schedulePresenceCheck(tableId);
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
      throw new PokerError(UNKNOWN_MOVE_MESSAGE);
  }
}

// Brief 2 Step 10, owner decision "showdown is for everyone": every hand that
// reaches a showdown is tabled for every viewer alike. The engine's default
// is the opposite: @pokertools/engine 1.0.20 dist/rules/showdown.js,
// determineWinners(), "winners show and losing hands remain mucked by
// default" (losers get shownCards null), and dist/utils/view-masking.js
// getVisibleHand() hides any opponent's hand whose shownCards is null, even
// at SHOWDOWN. So once a hand has ended at a showdown, each live hand (ACTIVE
// or ALL_IN) is shown through the engine's own SHOW action
// (dist/engine/game-reducer.js `case "SHOW"` → handleShow in
// dist/actions/showdown-actions.js, which sets shownCards to every index and
// refuses a FOLDED player or any street but SHOWDOWN), and masking still
// happens only in engine.view(). Folded hands are never shown.
//
// A fold-out isn't a showdown: it leaves one live player, and the engine
// still moves the street to SHOWDOWN (betting.js awardPotToLastPlayer), so
// it's the live-player count, not the street, that tells them apart.
//
// Called from prepareAction only, before commitPreparedAction snapshots the
// engine, so the row that's written already holds the tabled hands. The turn
// timer acts through applyAction → prepareAction too (runTimeout), so a hand
// the timer ends is tabled the same way.
function tableShowdownHands(engine: PokerEngine): void {
  const state = engine.state;
  if (state.winners === null || state.street !== "SHOWDOWN") return;
  const live = state.players.filter((p) => p !== null && (p.status === "ACTIVE" || p.status === "ALL_IN"));
  if (live.length < 2) return;
  for (const player of live) engine.act({ type: "SHOW", playerId: player!.id } as Action);
}

interface PreparedAction {
  tableId: number;
  engine: PokerEngine; // already mutated by engine.act() — holds the new state
  previousVersion: number; // the version this was validated against
  stacksBeforeHand: Map<string, number>;
  handEnded: boolean;
  auto: boolean; // true if this is the turn timer's action, not a real click
  actingSeat: number; // who this action was for — see note at the call site below
  actingUserId: number;
  actionType: string; // the engine's own ActionType string, e.g. "FOLD"
  amount: number | null; // see LastAction.amount
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
  // and illegal actions are both rejected right here, before anything is
  // mutated or written — with a player-readable message for the engine's
  // error code (./messages.ts), never the engine's own message text.
  const result = engine.validate(action);
  if (!result.valid) {
    throw new PokerError(playerMessageForEngineError(result.code, engine.state));
  }

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

  const before = engine.state.players[actingSeat];
  engine.act(action);
  const after = engine.state.players[actingSeat];

  // What the bubble says (LastAction.amount). A call's size is what it added
  // this hand: betThisStreet can already be 0 if the call closed the street.
  // A bet or raise never closes a street, so betThisStreet is its "to" total.
  let chipsIn: number | null = null;
  if (before && after) {
    if (action.type === "CALL") chipsIn = after.totalInvestedThisHand - before.totalInvestedThisHand;
    else if (action.type === "BET" || action.type === "RAISE") chipsIn = after.betThisStreet;
  }

  tableShowdownHands(engine);

  return {
    tableId,
    engine,
    previousVersion: row.version,
    stacksBeforeHand,
    handEnded: engine.state.winners !== null,
    auto,
    actingSeat,
    actingUserId: Number(playerId),
    actionType: action.type,
    amount: chipsIn !== null && chipsIn > 0 ? chipsIn : null,
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
  const {
    tableId,
    engine,
    previousVersion,
    stacksBeforeHand,
    handEnded,
    auto,
    actingSeat,
    actingUserId,
    actionType,
    amount,
  } = prepared;
  const newState = engine.state;

  const applied = db.transaction((): boolean => {
    if (!writeTableStateIfVersionMatches(tableId, engine, previousVersion)) {
      return false;
    }
    // Same transaction as the table_state write above, per the owner's note:
    // a hand ending is one atomic change to the database, not three separate
    // ones that could land only partially if the process died in between —
    // and gated on the same version check.
    if (handEnded) writeHandSettlement(tableId, newState, stacksBeforeHand);
    return true;
  })();

  if (!applied) {
    // Lost a race with another action or the turn timer; nothing was applied.
    logEvent("action_lost_race", { table: tableId, user: actingUserId, type: actionType, auto });
    throw new StaleActionError(STALE_ACTION_MESSAGE);
  }

  logEvent("action_applied", {
    table: tableId,
    user: actingUserId,
    name: displayNameFor(actingUserId),
    seat: actingSeat,
    type: actionType,
    auto,
    street: newState.street,
    next_to_act: newState.actionTo,
    hand_over: handEnded,
  });

  // actingSeat/actionType, not actionHistory's last entry: when a fold ends
  // a hand, the engine appends a further bookkeeping entry
  // (UNCALLED_BET_RETURNED, crediting back the other player's over-bet)
  // after the fold itself, so "the last history entry" is the wrong action
  // on the wrong seat for display purposes. See prepareAction's comment.
  lastActionByTable.set(tableId, {
    seat: actingSeat,
    type: actionType,
    auto,
    amount,
    at: new Date().toISOString(),
  });

  // Final brief Step 4: timeouts in a row, per player. A real action resets
  // the count.
  let counts = timeoutsInARow.get(tableId);
  if (!counts) {
    counts = new Map();
    timeoutsInARow.set(tableId, counts);
  }
  counts.set(actingUserId, auto ? (counts.get(actingUserId) ?? 0) + 1 : 0);

  // Before the broadcast, so the view every page gets for the finished hand
  // already has the right seats and nextHandAt.
  if (handEnded) afterHandEnded(tableId);

  notifyTable(tableId);
  if (handEnded) schedulePresenceCheck(tableId);
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

  const delay = effectiveDeadline(tableId, row)! - Date.now();
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
  if (effectiveDeadline(tableId, row)! > Date.now()) {
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

// --- Auto-deal (brief 2 Step 10) -----------------------------------------
//
// Owner decision, 4 Nov: a finished hand stays on the felt SHOWDOWN_PAUSE_MS,
// then the next hand deals itself if at least two seated players are present
// (not away); otherwise it waits for Deal next hand, as before. A scheduler
// like the turn timer and the presence check: in memory, one per table, armed
// when a hand ends (commitPreparedAction, so a hand the turn timer ends too),
// cancelled by any new deal (startHand) and by a leave or stand-up that
// leaves fewer than two present, and re-armed on boot from table_state.
//
// When the pause ends is the hand-ending write's table_state.updated_at plus
// SHOWDOWN_PAUSE_MS, read from the row rather than kept in memory. Nothing is
// re-armed on boot: for BOOT_GRACE_MS after a boot nobody's presence is known
// (every seat counts as present), so an auto-deal then could deal in seats
// whose owners left before the restart. A deploy mid-pause leaves the table
// waiting for Deal next hand.
interface AutoDeal {
  at: number; // ms since epoch
  timer: NodeJS.Timeout;
}
const autoDeals = new Map<number, AutoDeal>();

// Seated, not away, and with chips to post a blind. A seat that lost
// everything stays seated at 0 until its owner leaves (the engine refuses to
// seat a 0 stack: dist/actions/validation.js validateSitAction, "Stack must
// be positive"), so it can't be dealt in and doesn't count toward the two.
function presentSeatCount(tableId: number): number {
  return getSeats(tableId).filter((s) => s.stack > 0 && !isAway(tableId, s.user_id)).length;
}

// What the view says: the pause's end while a deal is still coming, null
// otherwise. Presence is read now, so a player going away mid-pause takes the
// countdown off every page (their away flag's broadcast carries it).
function nextHandAt(tableId: number): string | null {
  const pending = autoDeals.get(tableId);
  if (!pending || presentSeatCount(tableId) < 2) return null;
  return new Date(pending.at).toISOString();
}

function cancelAutoDeal(tableId: number): void {
  const pending = autoDeals.get(tableId);
  if (!pending) return;
  clearTimeout(pending.timer);
  autoDeals.delete(tableId);
}

function scheduleAutoDeal(tableId: number): void {
  cancelAutoDeal(tableId);
  const row = getTableState(tableId);
  if (!row) return;
  const state = restoreEngine(row).state;
  if (state.handNumber === 0 || state.winners === null) return; // nothing finished on the felt
  const at = new Date(row.updated_at).getTime() + SHOWDOWN_PAUSE_MS;
  const delay = at - Date.now();
  if (delay <= 0) return;
  const version = row.version;
  autoDeals.set(tableId, { at, timer: setTimeout(() => runAutoDeal(tableId, version), delay) });
}

// Deals through startHand, the same function Deal next hand calls, so every
// invariant, log line and broadcast is the same. `version` is the table_state
// version of the finished hand this was armed for: if anything has written
// since (a manual deal, which also cancels this timer), it's a no-op. All of
// this runs synchronously on Node's one thread, so a manual deal and this
// timer can't interleave; whichever runs second finds the version moved (this
// timer) or a hand in progress (startHand's own check), and does nothing.
function runAutoDeal(tableId: number, version: number): void {
  autoDeals.delete(tableId);
  const row = getTableState(tableId);
  if (!row || row.version !== version) return;
  const present = presentSeatCount(tableId);
  if (present < 2) {
    logEvent("auto_deal_skipped", { table: tableId, present });
    notifyTable(tableId); // the countdown comes off the pages
    return;
  }
  try {
    startHand(tableId, "auto");
  } catch (err) {
    // Whatever went wrong, the pages are still counting down to a deal that
    // isn't coming: the broadcast takes "Dealing…" off them.
    if (err instanceof PokerError) logEvent("auto_deal_skipped", { table: tableId, reason: err.message });
    else console.error(`poker: auto-deal failed for table ${tableId}`, err);
    notifyTable(tableId);
  }
}

// Called once at boot (src/server.ts), after migrations run. Covers both
// halves of the brief's requirement: a table whose deadline already passed
// while the process was down gets its auto action immediately (delay <= 0
// inside scheduleTimeoutFor), and every other table's future deadline is
// rescheduled.
export function restoreSchedulersOnBoot(): void {
  logEvent("boot", { boot_id: BOOT_ID });
  const rows = db.prepare("SELECT table_id FROM table_state").all() as { table_id: number }[];
  // Brief 2 Step 10: no auto-deal is re-armed here; see scheduleAutoDeal.
  for (const row of rows) scheduleTimeoutFor(row.table_id);
  // Final brief Step 4: seated players nobody has connected as since the
  // boot become away once BOOT_GRACE_MS is up; this arms the timer for that.
  const seated = db.prepare("SELECT DISTINCT table_id FROM seats").all() as { table_id: number }[];
  for (const row of seated) schedulePresenceCheck(row.table_id);
}
