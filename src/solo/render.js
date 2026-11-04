// @ts-check
// Brief 2 Step 12: the solo page's one renderer, the same pattern as
// src/poker/render.js. The server imports it for the first paint
// (src/solo/page.ts) and serves this same file to the browser
// (/assets/solo-render.js), whose client re-renders from each POST's answer
// with innerHTML. Pure: no clock, no DOM.
//
// The card markup is the table's own: cardHtml is imported from the table
// renderer, not copied. On the server that's the relative import below; the
// browser can't resolve "../poker/render.js" against /assets/, so
// src/solo/page.ts rewrites this one import line, when it serves the file,
// to the table renderer's own versioned URL. Same file either way.
import { cardHtml, escapeHtml } from "../poker/render.js";

/** @import { SoloView } from "./game.ts" */

/** @param {number} n */
const chips = (n) => n.toLocaleString("en-AU");

/** @param {number} n */
function signed(n) {
  if (n > 0) return `+${chips(n)}`;
  if (n < 0) return `−${chips(Math.abs(n))}`;
  return "0";
}

// The evaluator's category names (HAND_RANK_DESCRIPTIONS), lower-cased for a
// sentence; indexed by the category number. A royal is a straight flush.
const RANK_WORDS = [
  "a straight flush",
  "four of a kind",
  "a full house",
  "a flush",
  "a straight",
  "three of a kind",
  "two pair",
  "a pair",
  "high card",
];

/** @param {number | null} r */
const rankWords = (r) => (r === null ? "" : (RANK_WORDS[r] ?? ""));

/** @param {string} s */
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The player's hand in words: a royal (the ante paid 100) is named as one.
/** @param {NonNullable<SoloView["last"]>} last */
const playerWords = (last) => (last.anteMultiple === 100 ? "a royal flush" : rankWords(last.playerRank));

// The result line, in the brief's words: "Dealer doesn't qualify. Ante pays
// 1:1. +10" / "Flush beats two pair. +40" / "Dealer wins. −30". When both
// hands are the same kind, whose is whose: "Your pair beats the dealer's pair."
/** @param {NonNullable<SoloView["last"]>} last */
export function resultLine(last) {
  const net = signed(last.net);
  switch (last.outcome) {
    case "fold":
      return `You folded. ${net}`;
    case "no_qualify":
      return `Dealer doesn't qualify. Ante pays ${last.anteMultiple}:1. ${net}`;
    case "player_wins": {
      if (last.playerRank === last.dealerRank) {
        const kind = rankWords(last.playerRank).replace(/^an? /, "");
        return `Your ${kind} beats the dealer's ${kind}. ${net}`;
      }
      return `${cap(playerWords(last))} beats ${rankWords(last.dealerRank)}. ${net}`;
    }
    case "dealer_wins":
      return `Dealer wins. ${net}`;
    default:
      return `A tie: both bets push. ${net}`;
  }
}

/** @param {string[]} cards @param {number} slots @param {"" | "lg"} size */
function row(cards, slots, size = "") {
  let out = cards.map((c) => cardHtml(c, size)).join("");
  for (let i = cards.length; i < slots; i++) out += `<div class="card slot" aria-hidden="true"></div>`;
  return out;
}

// The dock: ante with presets and Deal; Call / Fold while a hand is live;
// the result and Deal again / Cash out after one.
/** @param {SoloView} view */
function dock(view) {
  const ante = view.live?.ante ?? view.last?.ante ?? Math.min(10, view.maxAnte);
  const presets = [5, 10, 25, 50]
    .map(
      (n) =>
        `<button type="button" class="chip-btn" data-ante-preset="${n}" data-value="${n}"${n > view.maxAnte ? " disabled" : ""}>${n}</button>`,
    )
    .join("");
  const max = `<button type="button" class="chip-btn" data-ante-preset="max" data-value="${view.maxAnte}">Max</button>`;
  /** @param {string} label */
  const dealForm = (label) =>
    `<form class="solo-deal" method="post" action="/solo/deal">
      <label for="ante">Ante</label>
      <input id="ante" name="ante" type="number" inputmode="numeric" min="1" max="${view.maxAnte}" step="1" required value="${Math.max(1, Math.min(ante, view.maxAnte))}" aria-describedby="ante-hint" />
      <div class="presets" role="group" aria-label="Ante presets">${presets}${max}</div>
      <span class="hint-room" id="ante-hint">Up to ${chips(view.maxAnte)}: a call costs twice the ante.</span>
      <button class="btn raise" type="submit">${label}</button>
    </form>`;

  if (view.live) {
    return `<p class="prompt">Your ante: <strong>${chips(view.live.ante)}</strong>. Call to see the turn and river, or fold.</p>
      <div class="actions">
        <form method="post" action="/solo/call"><button class="btn call" type="submit">Call ${chips(2 * view.live.ante)}</button></form>
        <form method="post" action="/solo/fold"><button class="btn fold" type="submit">Fold</button></form>
      </div>`;
  }
  const cashOut = `<form method="post" action="/solo/cash-out"><button class="btn fold" type="submit">Cash out</button></form>`;
  if (view.last) {
    return `${dealForm("Deal again")}<div class="actions">${cashOut}</div>`;
  }
  return dealForm("Deal");
}

/** @param {SoloView} view */
export function renderSolo(view) {
  const live = view.live;
  const last = live ? null : view.last;
  const dealerCards = live
    ? `${cardHtml(null, "")}${cardHtml(null, "")}`
    : last
      ? row(last.dealer, 2)
      : row([], 2);
  const board = live ? row(live.flop, 5) : last ? row(last.board, 5) : row([], 5);
  const mine = live ? row(live.player, 2, "lg") : last ? row(last.player, 2, "lg") : row([], 2, "lg");
  const result = last
    ? `<p class="solo-result${last.net < 0 ? " neg" : last.net > 0 ? " pos" : ""}" data-result data-net="${last.net}">${escapeHtml(
        resultLine(last),
      )}</p>`
    : "";
  const notice = view.newStack
    ? `<p class="solo-notice" data-new-stack>You're out. New stack of ${chips(view.buyIn)} play chips.</p>`
    : "";
  return `<div class="solo-felt">
      <div class="solo-side" data-dealer><span class="solo-label">Dealer</span><div class="solo-cards">${dealerCards}</div></div>
      <div class="solo-side" data-board><span class="visually-hidden">Board</span><div class="solo-cards board">${board}</div></div>
      <div class="solo-side" data-mine><span class="solo-label">You</span><div class="solo-cards">${mine}</div></div>
    </div>
    <div class="dock solo-dock">
      <p class="solo-money"><span>Stack <strong data-stack="${view.stack}">${chips(view.stack)}</strong></span>
        <span>Session <strong data-session-net="${view.sessionNet}" class="${view.sessionNet < 0 ? "neg" : ""}">${signed(view.sessionNet)}</strong></span></p>
      ${notice}
      ${result}
      ${dock(view)}
    </div>`;
}
