// Brief 2 Step 12: Casino Hold'em against the house, the rules alone. Pure:
// no database, no HTML, no clock, so src/solo/game.ts, the renderer and
// spec/ all import the same rules and can't disagree about a settlement.
//
// The only file in this app allowed to import "@pokertools/evaluator", as
// src/poker/engine.ts is for the engine. Pinned to 1.0.20 in package.json.
//
// What the evaluator does, read from its source (node_modules/.pnpm/
// @pokertools+evaluator@1.0.20/.../dist):
//   - index.d.ts, evaluate(): "Evaluates 5, 6, or 7 card integer codes.
//     Returns a strength score (lower is better)." evaluateStrings() parses
//     ['As', 'Kd', ...] and calls it; for 7 cards it scores the best five.
//   - utils/card.js: a card is a rank in "23456789TJQKA" then a suit in
//     "shdc", the same strings the table's engine and render.js use.
//   - models/hand-rank.d.ts: "export declare const enum HandRank {
//     StraightFlush = 0, FourOfAKind = 1, FullHouse = 2, Flush = 3,
//     Straight = 4, ThreeOfAKind = 5, TwoPair = 6, OnePair = 7,
//     HighCard = 8 }". A const enum has no runtime object Node's type
//     stripping can use (the app runs .ts directly), so the numbers are
//     named here and spec/solo.test.ts checks them against the library's
//     own HAND_RANK_DESCRIPTIONS. There is no royal flush category: a royal
//     is a StraightFlush whose score is 1, the best possible (an ace-high
//     straight flush in any suit; a 5-high one scores 10).
//   - index.js, rank(codes): getHandRank(evaluate(codes)); it takes card
//     codes, not strings, so the strings go through getCardCodes first.
import { HAND_RANK_DESCRIPTIONS, evaluateStrings, getCardCodes, rank } from "@pokertools/evaluator";

export { HAND_RANK_DESCRIPTIONS };

export const STRAIGHT_FLUSH = 0;
export const FOUR_OF_A_KIND = 1;
export const FULL_HOUSE = 2;
export const FLUSH = 3;
export const STRAIGHT = 4;
export const THREE_OF_A_KIND = 5;
export const TWO_PAIR = 6;
export const ONE_PAIR = 7;
export const HIGH_CARD = 8;

// The evaluator's score for a royal flush: the best hand there is.
export const ROYAL_FLUSH_SCORE = 1;

// Rule 5: the dealer qualifies with a pair of fours or better, i.e. a score
// at or below the weakest pair of fours. 4-4-5-3-2 has only four distinct
// ranks, so it can't be a straight. Its score is 5745; a pair of threes with
// A-K-Q scores 5746 (doesn't qualify), a pair of fours with 6-3-2 scores 5744.
export const QUALIFYING_HAND = ["4s", "4h", "5d", "3c", "2h"] as const;
export const QUALIFYING_SCORE = evaluateStrings([...QUALIFYING_HAND]);

export const score = (cards: readonly string[]): number => evaluateStrings([...cards]);
export const category = (cards: readonly string[]): number => rank(getCardCodes([...cards]));

// The ante's payout multiple on the player's best five (rule 7).
export function antePaytable(cards: readonly string[]): number {
  const s = score(cards);
  switch (category(cards)) {
    case STRAIGHT_FLUSH:
      return s === ROYAL_FLUSH_SCORE ? 100 : 20;
    case FOUR_OF_A_KIND:
      return 10;
    case FULL_HOUSE:
      return 3;
    case FLUSH:
      return 2;
    default:
      return 1; // straight or less
  }
}

export const dealerQualifies = (dealerSeven: readonly string[]): boolean => score(dealerSeven) <= QUALIFYING_SCORE;

export type Outcome = "fold" | "no_qualify" | "player_wins" | "dealer_wins" | "push";

export interface Settlement {
  outcome: Outcome;
  dealerQualified: boolean | null; // null on a fold: the dealer's hand isn't played
  playerCategory: number | null;
  anteMultiple: number; // what the ante paid, as a multiple; 0 if it lost or pushed
  net: number; // chips won (+) or lost (-) on the whole hand, ante and call
}

// Rules 3 and 6. On a fold the ante is lost; the dealer's cards are not
// compared. On a call both seven-card hands are scored:
//   dealer doesn't qualify: call pushes, ante pays the paytable;
//   dealer qualifies, player stronger: call pays 1:1, ante pays the paytable;
//   dealer qualifies, dealer stronger: ante and call lost;
//   equal: both push.
export function settle(
  ante: number,
  folded: boolean,
  player: readonly string[],
  dealer: readonly string[],
  board: readonly string[],
): Settlement {
  if (folded) {
    return { outcome: "fold", dealerQualified: null, playerCategory: null, anteMultiple: 0, net: -ante };
  }
  const p = [...player, ...board];
  const d = [...dealer, ...board];
  const qualified = dealerQualifies(d);
  const playerCategory = category(p);
  const multiple = antePaytable(p);
  if (!qualified) return { outcome: "no_qualify", dealerQualified: false, playerCategory, anteMultiple: multiple, net: ante * multiple };
  const ps = score(p);
  const ds = score(d);
  if (ps < ds) {
    return { outcome: "player_wins", dealerQualified: true, playerCategory, anteMultiple: multiple, net: ante * multiple + 2 * ante };
  }
  if (ps > ds) return { outcome: "dealer_wins", dealerQualified: true, playerCategory, anteMultiple: 0, net: -3 * ante };
  return { outcome: "push", dealerQualified: true, playerCategory, anteMultiple: 0, net: 0 };
}

// Rule 1: an integer ante, at least 1, with the call (2a) still covered.
export const maxAnte = (stack: number): number => Math.floor(stack / 3);

// A shuffled 52-card deck. `random(n)` returns 0..n-1; Fisher-Yates.
export function shuffledDeck(random: (n: number) => number): string[] {
  const deck: string[] = [];
  for (const r of "23456789TJQKA") for (const s of "shdc") deck.push(r + s);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// The order cards come off the deck: two to the player, two to the dealer,
// three to the board (rule 2), then the turn and the river on a call (rule 4).
export function deal(deck: readonly string[]): { player: string[]; dealer: string[]; flop: string[]; rest: string[] } {
  return { player: deck.slice(0, 2), dealer: deck.slice(2, 4), flop: deck.slice(4, 7), rest: deck.slice(7, 9) };
}
