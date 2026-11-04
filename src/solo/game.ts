// Brief 2 Step 12: Casino Hold'em against the house, the state. The only
// module that writes solo_stacks, solo_live, solo_hands and solo_sessions,
// and it never touches the table's seats, table_state, hand_results, streams
// or presence: it imports nothing from src/poker/ except the card markup the
// renderer shares. Request/response only; no SSE.
//
// Every write, so the promises in spec/solo.test.ts can be checked against
// a short list:
//   solo_stacks  INSERT  ensureStack: a new stack of the table's buy_in, the
//                        only place chips are created (no stack row yet:
//                        first visit, or after a cash-out or bust). After a
//                        bust it also carries busted_hand_id.
//                UPDATE  settleHand: stack += net, in the same transaction
//                        as the hand's solo_hands row. The column's
//                        CHECK (stack >= 0) backs the ante rule.
//                UPDATE  dealHand: busted_hand_id = NULL (the notice has
//                        been seen once a new hand is dealt). Moves no chips.
//                DELETE  endSession: cash-out, or a bust (< 3 chips).
//   solo_live    INSERT  dealHand (one row per user; a second deal while one
//                        is live is refused before the insert).
//                DELETE  settleHand.
//   solo_hands   INSERT  settleHand. Never updated or deleted.
//   solo_sessions INSERT endSession.
import { randomInt } from "node:crypto";

import { db } from "../db.ts";
import { category, deal, maxAnte, settle, shuffledDeck } from "./rules.ts";
import type { Outcome } from "./rules.ts";

export class SoloError extends Error {}

// The table's buy-in, read from the row as the register page does (the same
// amount, a separate stack).
function buyIn(): number {
  return (db.prepare("SELECT buy_in FROM poker_tables WHERE id = 1").get() as { buy_in: number } | undefined)?.buy_in ?? 1000;
}

interface StackRow {
  stack: number;
  started_at: string;
  after_hand_id: number;
  busted_hand_id: number | null;
}

// What's in solo_live: the whole deck order, so a resumed hand deals the
// same turn and river it would have.
interface LiveHand {
  ante: number;
  deck: string[];
}

export interface SoloHandRow {
  id: number;
  ante: number;
  player_cards: string;
  dealer_cards: string;
  board: string;
  outcome: Outcome;
  player_rank: number | null;
  dealer_qualified: number | null;
  net: number;
  ended_at: string;
}

// What the page and GET /solo/view get. The dealer's cards are in it only
// once the hand is over (`last`): never while a hand is live.
export interface SoloView {
  stack: number;
  buyIn: number;
  maxAnte: number;
  sessionNet: number; // this session: stack minus the buy-in it started with
  live: { ante: number; player: string[]; flop: string[] } | null;
  last: {
    ante: number;
    player: string[];
    dealer: string[];
    board: string[];
    outcome: Outcome;
    playerRank: number | null;
    // The dealer's category, for "Flush beats two pair"; null after a fold
    // (the dealer's hand isn't played).
    dealerRank: number | null;
    dealerQualified: boolean | null;
    // What the ante paid, as a multiple (rules.ts settle): 100 for a royal.
    anteMultiple: number;
    net: number;
  } | null;
  // Set when the last session just ended by a bust: the page says so, once.
  newStack: boolean;
}

const now = (): string => new Date().toISOString();

function stackRow(userId: number): StackRow | undefined {
  return db
    .prepare("SELECT stack, started_at, after_hand_id, busted_hand_id FROM solo_stacks WHERE user_id = ?")
    .get(userId) as StackRow | undefined;
}

function newestHandId(userId: number): number {
  return (db.prepare("SELECT MAX(id) AS id FROM solo_hands WHERE user_id = ?").get(userId) as { id: number | null }).id ?? 0;
}

// bustedHandId: the hand that just busted the previous stack, if this new
// stack is starting because of a bust.
function ensureStack(userId: number, bustedHandId: number | null = null): StackRow {
  const row = stackRow(userId);
  if (row) return row;
  const fresh: StackRow = { stack: buyIn(), started_at: now(), after_hand_id: newestHandId(userId), busted_hand_id: bustedHandId };
  db.prepare(
    "INSERT INTO solo_stacks (user_id, stack, started_at, after_hand_id, busted_hand_id) VALUES (?, ?, ?, ?, ?)",
  ).run(userId, fresh.stack, fresh.started_at, fresh.after_hand_id, fresh.busted_hand_id);
  return fresh;
}

function liveHand(userId: number): LiveHand | undefined {
  const row = db.prepare("SELECT state FROM solo_live WHERE user_id = ?").get(userId) as { state: string } | undefined;
  return row ? (JSON.parse(row.state) as LiveHand) : undefined;
}

function handById(userId: number, id: number): SoloHandRow | undefined {
  return db.prepare("SELECT * FROM solo_hands WHERE user_id = ? AND id = ?").get(userId, id) as SoloHandRow | undefined;
}

// The newest hand of this session, if it has one.
function lastHandOf(userId: number, stack: StackRow): SoloHandRow | undefined {
  return db
    .prepare("SELECT * FROM solo_hands WHERE user_id = ? AND id > ? ORDER BY id DESC LIMIT 1")
    .get(userId, stack.after_hand_id) as SoloHandRow | undefined;
}

const split = (s: string): string[] => (s ? s.split(" ") : []);

// The page's state. The felt shows this session's newest hand; on a stack
// that a bust just started, the hand that busted the last one, with the
// notice, until the next deal. A cash-out's new stack starts empty.
export function soloView(userId: number): SoloView {
  const stack = ensureStack(userId);
  const live = liveHand(userId);
  const busted = stack.busted_hand_id !== null ? handById(userId, stack.busted_hand_id) : undefined;
  const lastOnThisStack = live ? undefined : (lastHandOf(userId, stack) ?? busted);
  return {
    stack: stack.stack,
    buyIn: buyIn(),
    maxAnte: maxAnte(stack.stack),
    sessionNet: stack.stack - buyIn(),
    live: live ? { ante: live.ante, player: deal(live.deck).player, flop: deal(live.deck).flop } : null,
    last: lastOnThisStack
      ? {
          ante: lastOnThisStack.ante,
          player: split(lastOnThisStack.player_cards),
          dealer: split(lastOnThisStack.dealer_cards),
          board: split(lastOnThisStack.board),
          outcome: lastOnThisStack.outcome,
          playerRank: lastOnThisStack.player_rank,
          dealerRank:
            lastOnThisStack.outcome === "fold"
              ? null
              : category([...split(lastOnThisStack.dealer_cards), ...split(lastOnThisStack.board)]),
          dealerQualified: lastOnThisStack.dealer_qualified === null ? null : lastOnThisStack.dealer_qualified === 1,
          anteMultiple: settle(
            lastOnThisStack.ante,
            lastOnThisStack.outcome === "fold",
            split(lastOnThisStack.player_cards),
            split(lastOnThisStack.dealer_cards),
            split(lastOnThisStack.board),
          ).anteMultiple,
          net: lastOnThisStack.net,
        }
      : null,
    newStack: !live && busted !== undefined && lastOnThisStack === busted,
  };
}

// Test hooks only: the next deal for each user uses this deck order instead
// of a shuffle. Set only by POST /test-hooks/solo/deck, which src/server.ts
// mounts never in production.
const fixedDecks = new Map<number, string[]>();
export function setNextDeckForTest(userId: number, deck: string[]): void {
  fixedDecks.set(userId, deck);
}

export function dealHand(userId: number, ante: number): void {
  db.transaction(() => {
    const stack = ensureStack(userId);
    if (liveHand(userId)) throw new SoloError("A hand is already in play. Call or fold first.");
    const max = maxAnte(stack.stack);
    if (!Number.isInteger(ante) || ante < 1) throw new SoloError("The ante is a whole number of chips, 1 or more.");
    if (ante > max) {
      throw new SoloError(
        `The most you can ante is ${max.toLocaleString("en-AU")}: the call is twice the ante, and your stack has to cover both.`,
      );
    }
    if (stack.busted_hand_id !== null) {
      db.prepare("UPDATE solo_stacks SET busted_hand_id = NULL WHERE user_id = ?").run(userId);
    }
    const fixed = fixedDecks.get(userId);
    fixedDecks.delete(userId);
    const deck = fixed ?? shuffledDeck(randomInt);
    const state: LiveHand = { ante, deck };
    db.prepare("INSERT INTO solo_live (user_id, state) VALUES (?, ?)").run(userId, JSON.stringify(state));
  })();
}

// Fold or call settles the live hand: one transaction writes the solo_hands
// row, moves the stack by its net and deletes the live hand.
function settleHand(userId: number, folded: boolean): void {
  db.transaction(() => {
    const live = liveHand(userId);
    if (!live) throw new SoloError("There's no hand in play. Deal one first.");
    const stack = ensureStack(userId);
    const { player, dealer, flop, rest } = deal(live.deck);
    const board = folded ? flop : [...flop, ...rest];
    const s = settle(live.ante, folded, player, dealer, board);
    db.prepare(
      `INSERT INTO solo_hands (user_id, ante, player_cards, dealer_cards, board, outcome, player_rank,
         dealer_qualified, net, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      live.ante,
      player.join(" "),
      dealer.join(" "),
      board.join(" "),
      s.outcome,
      s.playerCategory,
      s.dealerQualified === null ? null : Number(s.dealerQualified),
      s.net,
      now(),
    );
    db.prepare("UPDATE solo_stacks SET stack = stack + ? WHERE user_id = ?").run(s.net, userId);
    db.prepare("DELETE FROM solo_live WHERE user_id = ?").run(userId);
    // Never negative: the ante rule (3a <= stack) means a lost call costs at
    // most what's there. If this ever fired, the transaction rolls back.
    if (stack.stack + s.net < 0) throw new Error(`solo: stack would go negative for user ${userId}`);
  })();
}

export const callHand = (userId: number): void => settleHand(userId, false);
export const foldHand = (userId: number): void => settleHand(userId, true);

// Under 3 chips there's no legal ante (rule 8): the session ends by itself.
export const isBust = (stack: number): boolean => maxAnte(stack) < 1;

// Records the session (net = final stack minus the buy-in) and deletes the
// stack, so the next visit starts a fresh one at the buy-in. A stack with no
// hand played on it isn't a session: cashing out of it (twice in a row, or a
// double click) records nothing and just leaves it as it is.
function endSession(userId: number): void {
  const stack = stackRow(userId);
  if (!stack || newestHandId(userId) <= stack.after_hand_id) return;
  db.prepare("INSERT INTO solo_sessions (user_id, started_at, ended_at, net) VALUES (?, ?, ?, ?)").run(
    userId,
    stack.started_at,
    now(),
    stack.stack - buyIn(),
  );
  db.prepare("DELETE FROM solo_stacks WHERE user_id = ?").run(userId);
}

export function cashOut(userId: number): void {
  db.transaction(() => {
    if (liveHand(userId)) throw new SoloError("Finish the hand in play before cashing out.");
    endSession(userId);
  })();
}

// After a hand settles: if the stack can't cover another ante, the session
// ends and a new stack starts on the next view. Returns whether it did.
export function endSessionIfBust(userId: number): boolean {
  return db.transaction(() => {
    const stack = stackRow(userId);
    if (!stack || !isBust(stack.stack) || liveHand(userId)) return false;
    const bustingHand = newestHandId(userId);
    endSession(userId);
    ensureStack(userId, bustingHand); // the new stack, carrying the notice
    return true;
  })();
}

// --- Results (the page's "Against the house" section) -----------------------

export interface SoloLedgerRow {
  userId: number;
  displayName: string;
  isGuest: number;
  hands: number;
  net: number;
}

export function soloLedger(): SoloLedgerRow[] {
  return db
    .prepare(
      `SELECT users.id AS userId, users.display_name AS displayName, users.is_guest AS isGuest,
              COUNT(*) AS hands, SUM(solo_hands.net) AS net
       FROM solo_hands JOIN users ON users.id = solo_hands.user_id
       GROUP BY users.id
       ORDER BY net DESC, hands DESC, users.display_name ASC`,
    )
    .all() as SoloLedgerRow[];
}

export interface RecentSoloHand {
  userId: number;
  displayName: string;
  isGuest: number;
  outcome: Outcome;
  net: number;
  endedAt: string;
}

export function recentSoloHands(limit: number): RecentSoloHand[] {
  return db
    .prepare(
      `SELECT users.id AS userId, users.display_name AS displayName, users.is_guest AS isGuest,
              solo_hands.outcome AS outcome, solo_hands.net AS net, solo_hands.ended_at AS endedAt
       FROM solo_hands JOIN users ON users.id = solo_hands.user_id
       ORDER BY solo_hands.id DESC LIMIT ?`,
    )
    .all(limit) as RecentSoloHand[];
}

// A user's own settled hands, oldest first (GET /solo/hands). Settled hands
// only: the live hand, and so the dealer's cards before a call or fold, is
// never in it. The cards are stored, so anyone can recompute each net.
export function soloHandsFor(userId: number): SoloHandRow[] {
  return db.prepare("SELECT * FROM solo_hands WHERE user_id = ? ORDER BY id ASC").all(userId) as SoloHandRow[];
}
