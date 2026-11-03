// @ts-check
// Final brief Step 7: the table's one renderer. The server imports it for the
// first paint (page.ts) and serves this same file to the browser
// (/assets/table-render.js), whose live client imports it to re-render from
// each pushed view. One function, so the first paint and every live render
// produce the same markup by construction, not by keeping two copies in step.
//
// It has to run in both places, so it is plain JavaScript (type-checked from
// the JSDoc, via tsconfig's checkJs) with no imports, and it is pure: the
// clock comes in as `now`, so the server and the browser agree on the turn
// ring for the same view and the same moment. The client's ticking timer
// only updates the ring, the seconds and the next hand's countdown; it never
// re-renders.

/** @import { TableView } from "./table.ts" */

/** @param {unknown} s */
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** @type {Record<string, { symbol: string; name: string; red: boolean }>} */
const SUITS = {
  s: { symbol: "♠", name: "spades", red: false },
  h: { symbol: "♥", name: "hearts", red: true },
  d: { symbol: "♦", name: "diamonds", red: true },
  c: { symbol: "♣", name: "clubs", red: false },
};

/** @type {Record<string, { label: string; name: string }>} */
const RANKS = {
  A: { label: "A", name: "Ace" },
  K: { label: "K", name: "King" },
  Q: { label: "Q", name: "Queen" },
  J: { label: "J", name: "Jack" },
  T: { label: "10", name: "10" },
  9: { label: "9", name: "9" },
  8: { label: "8", name: "8" },
  7: { label: "7", name: "7" },
  6: { label: "6", name: "6" },
  5: { label: "5", name: "5" },
  4: { label: "4", name: "4" },
  3: { label: "3", name: "3" },
  2: { label: "2", name: "2" },
};

const STREETS = /** @type {Record<string, string>} */ ({
  PREFLOP: "Preflop",
  FLOP: "Flop",
  TURN: "Turn",
  RIVER: "River",
  SHOWDOWN: "Showdown",
});

/** @param {number} n */
function chips(n) {
  // en-AU, fixed, so the server's locale and the browser's can't disagree.
  return n.toLocaleString("en-AU");
}

// A card is a face ("Qd"), a face-down card (null), or a slot where a board
// card hasn't come yet. size: "" (board), "sm" (on a seat), "lg" (your dock).
/**
 * @param {string | null} code
 * @param {"" | "sm" | "lg"} size
 */
export function cardHtml(code, size = "") {
  const cls = size ? ` ${size}` : "";
  const rank = code ? RANKS[code[0]] : undefined;
  const suit = code ? SUITS[code[1]] : undefined;
  if (!rank || !suit) return `<div class="card back${cls}" role="img" aria-label="face-down card"></div>`;
  return (
    `<div class="card${suit.red ? " red" : ""}${cls}" role="img" aria-label="${rank.name} of ${suit.name}">` +
    `<div class="idx" aria-hidden="true">${rank.label}<span>${suit.symbol}</span></div>` +
    `<div class="pip" aria-hidden="true">${suit.symbol}</div></div>`
  );
}

// What each seat has put in this street. The engine's view holds a Map on
// the server, which serialises to a plain {seat: amount} object, so the
// browser's copy of the same view has an object: read both the same way.
/** @param {NonNullable<TableView["hand"]>} hand */
function betsInFront(hand) {
  /** @type {unknown} */
  const bets = hand.currentBets;
  if (bets instanceof Map) return [...bets.values()];
  return Object.values(/** @type {Record<string, number>} */ (bets ?? {}));
}

const SLOT_CARD = `<div class="card slot" aria-hidden="true"></div>`;

// "call 20", "raise to 80", "auto-fold": what the last action's bubble says.
/** @param {NonNullable<TableView["lastAction"]>} a */
function actionLabel(a) {
  const type = a.type.toLowerCase();
  if (a.auto) return `auto-${type}`;
  if (a.amount === null) return type;
  if (type === "raise") return `raise to ${chips(a.amount)}`;
  if (type === "bet") return `bet ${chips(a.amount)}`;
  return `${type} ${chips(a.amount)}`;
}

// Everything the table and the dock need to know about the viewer's own
// position in this view, worked out once.
/** @param {TableView} view */
function viewerState(view) {
  const hand = view.hand;
  const running = hand !== null && hand.winners === null;
  const mySeat = view.seats.find((s) => s.userId === view.you) ?? null;
  const me = mySeat && hand ? (hand.players[mySeat.seatNo] ?? null) : null;
  const myTurn = running && mySeat !== null && hand.actionTo === mySeat.seatNo;
  // The price to call, as the engine works it out (rules/current-bet.js):
  // the highest bet in front, but never under the big blind preflop, so a
  // big blind who is short all-in doesn't make calling look cheaper.
  const bets = hand ? betsInFront(hand) : [];
  let highest = bets.length ? Math.max(...bets) : 0;
  if (hand && hand.street === "PREFLOP") highest = Math.max(highest, view.table.big_blind);
  const myBet = me ? me.betThisStreet : 0;
  const toCall = me ? Math.min(highest - myBet, me.stack) : 0;
  // Raising is reopened to you unless you've already acted this street and
  // the raise since then was short of a full one (validation.js's
  // validateRaiseRights, TDA rule 47).
  const actedThisStreet =
    hand !== null && mySeat !== null &&
    hand.actionHistory.some(
      (r) => r.street === hand.street && r.seat === mySeat.seatNo &&
        ["CHECK", "CALL", "BET", "RAISE"].includes(r.action.type),
    );
  const raiseReopened = !actedThisStreet || hand === null || highest - myBet >= hand.lastRaiseAmount;
  return { hand, running, mySeat, me, myTurn, highest, myBet, toCall, raiseReopened };
}

// Seconds left on the current turn, and the share of the turn ring that is
// still brass (0..1), from the server's deadline and the turn's own length.
/**
 * @param {TableView} view
 * @param {number} now
 */
export function turnClock(view, now) {
  if (!view.turnDeadline || !view.turnSeconds) return null;
  const msLeft = Math.max(0, new Date(view.turnDeadline).getTime() - now);
  const total = view.turnSeconds * 1000;
  return { seconds: Math.ceil(msLeft / 1000), share: Math.min(1, msLeft / total) };
}

/**
 * @param {TableView} view
 * @param {number} now
 */
function seatsHtml(view, now) {
  const { hand, running, mySeat } = viewerState(view);
  const max = view.table.max_seats;
  // You always sit at the bottom (slot 0). Spectators see seat 0 there.
  const offset = mySeat ? mySeat.seatNo : 0;
  const seatByNo = new Map(view.seats.map((s) => [s.seatNo, s]));
  const clock = turnClock(view, now);
  let out = "";
  for (let seatNo = 0; seatNo < max; seatNo++) {
    const slot = (seatNo - offset + max) % max;
    const seat = seatByNo.get(seatNo);
    if (!seat) {
      out += `<div class="seat s${slot} empty" data-seat="${seatNo}"><div class="avatar">Open</div></div>`;
      continue;
    }
    const player = hand ? (hand.players[seatNo] ?? null) : null;
    const isYou = seat.userId === view.you;
    const isTurn = running && hand !== null && hand.actionTo === seatNo;
    const folded = running && player !== null && player.status === "FOLDED";
    const stack = player && running ? player.stack : seat.stack;
    const classes = ["seat", `s${slot}`];
    if (isYou) classes.push("you");
    if (isTurn) classes.push("turn");
    if (folded) classes.push("folded");

    // Hole cards while dealt in: backs, or faces where the view has them
    // (yours, or anyone's shown at showdown). Not once they've folded.
    let hole = "";
    if (player && player.hand && !folded) {
      hole = `<div class="hole">${player.hand.map((c) => cardHtml(c, "sm")).join("")}</div>`;
    } else if (player && running && !folded) {
      hole = `<div class="hole">${cardHtml(null, "sm")}${cardHtml(null, "sm")}</div>`;
    }

    const said =
      view.lastAction && view.lastAction.seat === seatNo && running
        ? `<div class="said${view.lastAction.auto ? " auto" : ""}">${escapeHtml(actionLabel(view.lastAction))}</div>`
        : "";
    const ring = isTurn && clock ? ` style="--p:${clock.share.toFixed(3)}"` : "";
    const dealer = hand && hand.buttonSeat === seatNo ? `<span class="dealer" role="img" aria-label="dealer">D</span>` : "";
    const bet = running && player && player.betThisStreet > 0 ? `<div class="bet">${chips(player.betThisStreet)}</div>` : "";
    const initial = escapeHtml(Array.from(seat.displayName.trim())[0]?.toUpperCase() ?? "?");

    out +=
      `<div class="${classes.join(" ")}" data-seat="${seatNo}"${isTurn ? " data-turn" : ""}>` +
      said +
      hole +
      `<div class="avatar"${ring}><span aria-hidden="true">${initial}</span>${dealer}</div>` +
      `<div class="plate"><div class="name">${escapeHtml(seat.displayName)}${isYou ? `<span class="you-tag"> (you)</span>` : ""}</div>` +
      `<div class="stack">${chips(stack)}</div>` +
      (seat.away ? `<div class="away-tag">Away</div>` : "") +
      `</div>` +
      bet +
      `</div>`;
  }
  return out;
}

/** @param {TableView} view */
function centreHtml(view) {
  const hand = shownHand(view);
  if (!hand) {
    // No pot line before a hand: "Pot 0" in Young Serif reads as "Pot O".
    return `<div class="center"><div class="street">No hand yet</div><div class="board">${SLOT_CARD.repeat(5)}</div></div>`;
  }
  // Pot = settled pots plus what is in front of players this street, so the
  // blinds count before the first street closes.
  // Once a hand is over the pots have been paid out, so show what was won
  // rather than a pot of 0.
  const settled = hand.pots.reduce((sum, p) => sum + p.amount, 0);
  const inFront = betsInFront(hand).reduce((a, b) => a + b, 0);
  const won = hand.winners ? hand.winners.reduce((sum, w) => sum + w.amount, 0) : 0;
  const pot = hand.winners ? won : settled + inFront;
  const board = hand.board.map((c) => cardHtml(c)).join("") + SLOT_CARD.repeat(Math.max(0, 5 - hand.board.length));
  return (
    `<div class="center"><div class="street">${escapeHtml(streetLabel(hand))}</div>` +
    `<div class="board" aria-label="Board">${board}</div>` +
    `<div class="pot">Pot <strong data-pot="${pot}">${chips(pot)}</strong></div></div>`
  );
}

// The engine moves to SHOWDOWN when a fold ends the hand too, so a hand won
// before the river says "Hand over" rather than "Showdown" over a short board.
/** @param {NonNullable<TableView["hand"]>} hand */
function streetLabel(hand) {
  if (hand.winners && hand.board.length < 5) return "Hand over";
  return STREETS[hand.street] ?? hand.street;
}

// The hand to show. A finished hand stays on the felt so players see how it
// ended, but once everyone has stood up it belongs to nobody at the table,
// so a newcomer sees an empty table rather than strangers' last showdown.
/** @param {TableView} view */
function shownHand(view) {
  const hand = view.hand;
  if (hand && hand.winners !== null && view.seats.length === 0) return null;
  return hand;
}

// The engine's winners[].handRank is the evaluator's category name and
// nothing more: dist/rules/showdown.js evaluatePot() sets description to
// rankDescription(rank(cardCodes)), i.e. one of HAND_RANK_DESCRIPTIONS in
// @pokertools/evaluator dist/models/hand-rank.js ("Straight Flush", "Four of
// a Kind", "Full House", "Flush", "Straight", "Three of a Kind", "Two Pair",
// "One Pair", "High Card"). A pot only one live player can win (a side pot
// above an all-in) says "Uncontested" (showdown.js evaluatePot, one eligible
// player), and a fold-out's winners say null (dist/actions/betting.js
// awardPotToLastPlayer). This is how each category reads after "with";
// anything else is lower-cased as is.
/** @type {Record<string, string>} */
const HAND_RANK_PHRASES = {
  "Straight Flush": "a straight flush",
  "Four of a Kind": "four of a kind",
  "Full House": "a full house",
  Flush: "a flush",
  Straight: "a straight",
  "Three of a Kind": "three of a kind",
  "Two Pair": "two pair",
  "One Pair": "a pair",
  "High Card": "high card",
};

/** @param {string} handRank */
export function handRankPhrase(handRank) {
  return HAND_RANK_PHRASES[handRank] ?? handRank.toLowerCase();
}

/** @param {string | null | undefined} handRank */
function isShowdownRank(handRank) {
  return typeof handRank === "string" && handRank !== "Uncontested";
}

// "Hand over. lynx won 140 with two pair." / "lynx and aaa split 140 with a
// flush." / "lynx won 30. Everyone else folded." With side pots, one clause
// per winner: "lynx won 100; aaa won 60 with a pair."
/** @param {TableView} view */
function winnersText(view) {
  const hand = view.hand;
  if (!hand || !hand.winners || hand.winners.length === 0) return "Hand over.";
  /** @param {number} seatNo */
  const nameOf = (seatNo) => {
    const seat = view.seats.find((s) => s.seatNo === seatNo);
    return escapeHtml(seat ? seat.displayName : hand.players[seatNo]?.name ?? `seat ${seatNo + 1}`);
  };
  /** @param {string} handRank */
  const withRank = (handRank) =>
    ` with <span data-hand-rank="${escapeHtml(handRank)}">${escapeHtml(handRankPhrase(handRank))}</span>`;

  // A fold-out: one winner, no ranks at all.
  if (hand.winners.every((w) => w.handRank === null)) {
    const total = hand.winners.reduce((sum, w) => sum + w.amount, 0);
    return `Hand over. ${nameOf(hand.winners[0].seat)} won ${chips(total)}. Everyone else folded.`;
  }

  // Per seat: what it won in all, and the hand it won the contested pot(s)
  // with ("Uncontested" side pots name no hand).
  /** @type {Map<number, { amount: number; rank: string | null }>} */
  const bySeat = new Map();
  for (const w of hand.winners) {
    const entry = bySeat.get(w.seat) ?? { amount: 0, rank: null };
    entry.amount += w.amount;
    if (isShowdownRank(w.handRank)) entry.rank = w.handRank;
    bySeat.set(w.seat, entry);
  }
  const entries = [...bySeat.entries()];
  if (entries.length === 1) {
    const [seatNo, { amount, rank }] = entries[0];
    return `Hand over. ${nameOf(seatNo)} won ${chips(amount)}${rank ? withRank(rank) : ""}.`;
  }
  // One pot shared equally (amounts within the odd chip) with the same hand:
  // a split.
  const amounts = entries.map(([, e]) => e.amount);
  const ranks = new Set(entries.map(([, e]) => e.rank));
  const oneRank = ranks.size === 1 ? entries[0][1].rank : null;
  if (oneRank && Math.max(...amounts) - Math.min(...amounts) <= 1) {
    const names = entries.map(([seatNo]) => nameOf(seatNo));
    const who = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    const total = amounts.reduce((a, b) => a + b, 0);
    return `Hand over. ${who} split ${chips(total)}${withRank(oneRank)}.`;
  }
  // Otherwise side pots went different ways: one clause each.
  const clauses = entries.map(
    ([seatNo, { amount, rank }]) => `${nameOf(seatNo)} won ${chips(amount)}${rank ? withRank(rank) : ""}`,
  );
  return `Hand over. ${clauses.join("; ")}.`;
}

// "Next hand in 4 s", counted down to the server's nextHandAt (brief 2 Step
// 10); null when no deal is coming. The client's ticking timer calls this
// too, so a tick and a fresh render say the same thing.
/**
 * @param {TableView} view
 * @param {number} now
 */
export function nextHandLabel(view, now) {
  if (!view.nextHandAt || !view.hand || view.hand.winners === null) return null;
  const seconds = Math.ceil((new Date(view.nextHandAt).getTime() - now) / 1000);
  return seconds > 0 ? `Next hand in ${seconds} s` : "Dealing…";
}

/**
 * @param {TableView} view
 * @param {number} now
 */
function promptHtml(view, now) {
  const { hand, running, myTurn } = viewerState(view);
  const clock = turnClock(view, now);
  const clockHtml = clock ? `<span class="clock" data-clock>${clock.seconds}s</span>` : "";
  if (!hand || !shownHand(view)) return view.seats.length < 2 ? "Waiting for players. Two seated can deal." : "No hand yet. Deal when ready.";
  if (!running) {
    const next = nextHandLabel(view, now);
    return winnersText(view) + (next ? ` <span class="next-hand" data-next-hand>${next}</span>` : "");
  }
  if (myTurn) {
    const last = view.lastAction;
    let lastText = "";
    if (last && last.seat !== hand.actionTo) {
      const who = view.seats.find((s) => s.seatNo === last.seat)?.displayName ?? `seat ${last.seat + 1}`;
      lastText = ` ${escapeHtml(who)} ${escapeHtml(actionLabel(last))}.`;
    }
    return `<strong>Your turn.</strong>${lastText}${clockHtml}`;
  }
  if (hand.actionTo === null) return "Waiting for the next card…";
  const actor = view.seats.find((s) => s.seatNo === hand.actionTo);
  const waitClock = clock ? ` (<span class="clock-plain" data-clock>${clock.seconds}s</span>)` : "";
  return `Waiting for ${escapeHtml(actor ? actor.displayName : `seat ${hand.actionTo + 1}`)}${waitClock}`;
}

// The dock's buttons, built from the engine's legal options for you. Hidden
// controls stay in the markup with `hidden` (and CSS that really hides them,
// the C9 bug guard), so their order and ids don't move between renders.
/** @param {TableView} view */
function controlsHtml(view) {
  const { hand, running, mySeat, me, myTurn, highest, myBet, toCall, raiseReopened } = viewerState(view);
  const canAct = myTurn && me !== null;
  const stack = me ? me.stack : 0;
  const maxTo = myBet + stack; // everything you have, as a "to" total
  const isBet = highest === 0;
  // The engine's own minimum, as a "to" total (validation.js reads RAISE
  // amounts as raise-to totals; minRaise is one), or the big blind for an
  // opening bet. All in is always allowed, so it never exceeds your stack.
  const minTo = hand ? Math.min(isBet ? view.table.big_blind : hand.minRaise, maxTo) : 0;
  // A raise is only possible if you'd still have chips after calling.
  const canRaise = canAct && stack > toCall && raiseReopened;

  const verb = isBet ? "Bet" : "Raise to";
  const actions =
    `<form id="action-form" class="actions"${canAct ? "" : " hidden"}>` +
    `<button class="btn fold" type="submit" name="type" value="fold" formnovalidate>Fold</button>` +
    (toCall > 0
      ? `<button class="btn call" type="submit" name="type" value="call" data-amount="${toCall}" formnovalidate>Call ${chips(toCall)}</button>`
      : `<button class="btn call" type="submit" name="type" value="check" formnovalidate>Check</button>`) +
    `<div class="raise-box"${canRaise ? "" : " hidden"}>` +
    `<label class="visually-hidden" for="amount">${verb}</label>` +
    `<input id="amount" name="amount" type="number" inputmode="numeric" min="${minTo}" max="${maxTo}" step="1" value="${minTo}" />` +
    `<button class="btn raise" type="submit" name="type" value="${isBet ? "bet" : "raise"}" data-verb="${verb}">${verb} ${chips(minTo)}</button>` +
    `<button class="chip-btn" type="button" data-preset="min" data-amount="${minTo}">Min</button>` +
    `<button class="chip-btn" type="button" data-preset="half" data-amount="${presetTo(view, 0.5, minTo, maxTo)}">½ pot</button>` +
    `<button class="chip-btn" type="button" data-preset="pot" data-amount="${presetTo(view, 1, minTo, maxTo)}">Pot</button>` +
    `<button class="chip-btn" type="button" data-preset="all" data-amount="${maxTo}">All in</button>` +
    `</div></form>`;

  const openSeat = view.seats.length < view.table.max_seats;
  const canSit = !mySeat && openSeat;
  const canLeave = mySeat !== null && !running;
  const canDeal = view.seats.length >= 2 && !running;
  const table =
    `<div class="table-controls">` +
    `<form id="sit-form"${canSit ? "" : " hidden"}><button class="btn raise" type="submit">Sit down (${chips(view.table.buy_in)} chips)</button></form>` +
    `<form id="start-form"${canDeal ? "" : " hidden"}><button class="btn call" type="submit">Deal next hand</button></form>` +
    `<form id="leave-form"${canLeave ? "" : " hidden"}><button class="btn fold" type="submit">Leave table</button></form>` +
    `</div>`;
  return actions + table;
}

// A pot-sized raise (to): call first, then raise by the pot after the call.
// share 0.5 is half that. Clamped to what's legal for you.
/**
 * @param {TableView} view
 * @param {number} share
 * @param {number} minTo
 * @param {number} maxTo
 */
function presetTo(view, share, minTo, maxTo) {
  const { hand, highest, toCall } = viewerState(view);
  if (!hand) return minTo;
  const settled = hand.pots.reduce((sum, p) => sum + p.amount, 0);
  const inFront = betsInFront(hand).reduce((a, b) => a + b, 0);
  const potAfterCall = settled + inFront + toCall;
  const to = highest + Math.round(potAfterCall * share);
  return Math.max(minTo, Math.min(maxTo, to));
}

/** @param {TableView} view */
function mineHtml(view) {
  const { me, mySeat } = viewerState(view);
  if (!mySeat) return `<div class="mine" aria-label="Your cards"><p class="watching">Watching</p></div>`;
  const cards = me && me.hand ? me.hand.map((c) => cardHtml(c, "lg")).join("") : "";
  return `<div class="mine" aria-label="Your cards">${cards}</div>`;
}

/** @param {TableView} view */
function noticeHtml(view) {
  if (view.notice?.type !== "left_away") return "";
  const names = view.notice.players.map((p) => p.displayName).join(", ");
  return `<p class="table-notice">${escapeHtml(names)} left the table (away).</p>`;
}

// The whole of #table-root: the table, then the dock.
/**
 * @param {TableView} view
 * @param {number} now ms since epoch; the turn ring and seconds left use it
 */
export function renderTable(view, now) {
  return (
    noticeHtml(view) +
    `<div class="stage"><section class="table" aria-label="${escapeHtml(view.table.name)} table">` +
    centreHtml(view) +
    seatsHtml(view, now) +
    `</section></div>` +
    `<section class="dock" aria-label="Your move">` +
    mineHtml(view) +
    `<p class="prompt" data-prompt>${promptHtml(view, now)}</p>` +
    controlsHtml(view) +
    `</section>`
  );
}
