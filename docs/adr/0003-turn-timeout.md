# ADR 0003: What happens when it is your turn and you do nothing

## Context

At a poker table only one player can act at a time. If that player walks
away, loses their connection or simply stops responding, everyone else is
stuck. C9 asks for one decision about how the app behaves when several people
use it at once; this is the one that matters most at a table of friends.

## Options

- **A. Wait forever.** The table waits until the player comes back. Simplest
  to build, but one absent player blocks the whole table.
- **B. Auto-fold after a countdown.** The table never gets stuck, but a player
  with a bad connection loses hands they could have checked for free.
- **C. Auto-check after a countdown if checking is legal, otherwise
  auto-fold.** The table never gets stuck, and a player who is not facing a
  bet loses nothing by being slow.

## Decision

C, with a 30-second countdown (`TURN_TIMEOUT_SECONDS`, a named constant).

I think C is best because this is the rule used in mainstream poker games.

## Consequences

C costs more than A or B. First, we need a timer. Second, when the timer
runs out, the app has to decide whether the player can check or must fold.
And the timer must be stopped from acting twice.

In practice:

- The deadline is stored in the database (`table_state.turn_deadline`), not
  only in memory, so a countdown still fires after a restart or redeploy.
- The automatic action goes through the same code path as a real click, and
  is committed only if the table's `version` is still the one it was
  scheduled against (`UPDATE ... WHERE version = ?`). If a real action got
  there first, the timer does nothing.
- `spec/poker.test.ts` checks both outcomes live: auto-check when checking is
  legal, auto-fold when facing a bet, and that every other open session
  receives the change in real time.
