// Final brief Step 2: the one place an engine rejection becomes something a
// player can read. Keyed on the engine's own error `code` (what
// engine.validate() returns alongside its message — see
// @pokertools/engine's actions/validation.js), never on its message text,
// which names players by internal id ("Player 2 attempted to act, but
// action is on seat 0") and could be reworded by any patch release.
//
// Imports nothing from the app, so spec/ can import it to assert a route
// returned the message for a given code rather than a copied string.

export const UNKNOWN_MOVE_MESSAGE = "That move isn't allowed right now.";

export const STALE_ACTION_MESSAGE = "The table moved on before your move landed. Nothing changed; try again.";

// What the engine checked the amount against, for the messages that need a
// number. Both read off engine.state, the same fields validation.js reads.
export interface AmountRules {
  bigBlind: number;
  minRaise: number;
}

export const PLAYER_MESSAGES = {
  NOT_YOUR_TURN: () => "It's not your turn.",
  NOTHING_TO_CALL: () => "Nothing to call. Check instead.",
  CANNOT_CHECK: () => "There's a bet to you, so you can't check. Call, raise or fold.",
  CANNOT_RAISE: () => "There's no bet to raise yet. Bet instead.",
  CANNOT_RERAISE: () => "Nobody has raised since you acted, so you can't raise again. Call or fold.",
  BET_TOO_SMALL: (r: AmountRules) => `That bet is too small. Bet at least ${r.bigBlind}.`,
  RAISE_TOO_SMALL: (r: AmountRules) => `That raise is too small. Raise to at least ${r.minRaise}.`,
  INVALID_AMOUNT: () => "Enter a whole number of chips, 0 or more.",
  NO_CHIPS: () => "You have no chips left to bet. Check or fold.",
  PLAYER_NOT_ACTIVE: () => "You're out of this hand (folded or all in).",
  PLAYER_NOT_FOUND: () => "You're not dealt into this hand.",
} satisfies Record<string, (rules: AmountRules) => string>;

export function playerMessageForEngineError(code: string | undefined, rules: AmountRules): string {
  const message = code !== undefined ? PLAYER_MESSAGES[code as keyof typeof PLAYER_MESSAGES] : undefined;
  return message ? message(rules) : UNKNOWN_MOVE_MESSAGE;
}
