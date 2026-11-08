# ADR 0004: Players who have left but are still seated

## Status

Accepted (owner, 18 Oct 2026; numbers changed 19 Oct, before the first
deploy).

## Context

A seat stays taken until its player presses Leave. Players who close the
browser or lock their phone never press it, so they stay seated. Each time
their turn came, the whole table waited the full turn timeout before the
auto-fold. On production on 18 Oct, two empty seats cost 30 s each in the
same hand (`docs/evidence/production-timeline-2026-10-18.json`). Reproduced
locally with three closed browsers and one live page
(`docs/evidence/repro-ghost-seats.mjs`). Nothing in the app knew whether a
seated player was still there.

Phones make this harder. A phone drops the live stream whenever the browser
goes to the background, for example to answer a message. And standing up
resets your chips to the fixed buy-in, so standing someone up costs them
their stack.

## Options

- **A. Keep waiting the full turn for everyone** (as before). Nobody loses
  chips by accident, but every turn of an empty seat costs the table the
  whole timeout, every hand.
- **B. Stand a player up as soon as their connection drops.** No waiting at
  all, but a refresh, a short network drop or a phone going to the
  background loses the seat and the stack.
- **C. Notice who is away, and act on it in steps.** A seated player with no
  open connection for a short grace period is *away*. An away player's turn
  is short. After repeated timeouts or a long absence they are stood up, but
  only when the hand ends.
- **D. Let the players decide**, with a "sit out" or "kick" button. Nothing
  happens unless someone notices and presses it, and among friends, pressing
  "kick" has its own cost.

## Decision

C. Away after 10 s with no connection, a 5 s turn while away, and stood up
after 5 timeouts in a row or 5 minutes away, when the hand ends. The seat
shows "Away" meanwhile. All of these are named constants in
`src/poker/live.ts`.

The first numbers I agreed to were 2 timeouts and 60 seconds. I changed them
before the first deploy ([`b31671b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/b31671b)),
because my friends play on their phones. With 60 seconds, answering one
message could stand a friend up and reset their chips. That is not fair at a
table of friends. Five minutes is long enough for a message, and short
enough that the table doesn't wait for someone who has gone home.

The deploy that shipped this also cleared everyone left seated at the live
table from testing, once (migration 0004). Results history was kept.

## Consequences

- **An away player still costs a little time:** 5 s per turn, up to 5 turns,
  instead of the full turn each time.
- **A hand never loses a seat in the middle.** Stand-ups happen at hand end,
  or between hands by a timer, so the chip count of a hand in progress never
  changes.
- **Someone away for more than 5 minutes loses their stack**, because
  standing up resets chips. That is the cost of not keeping a seat forever.
- **Presence lives in memory, not in the database.** After a restart nobody
  has a connection yet, so for the first 30 s everyone seated counts as
  present. Otherwise a deploy would stand the whole table up. It also means
  the app can only run on one machine (scenario g in
  `docs/testing/multi-user-test-report.md`).
- **The auto-deal deals present players only, and stands nobody up**
  ([`5ce1305`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/5ce1305)).
  Otherwise "stood up after 5 timeouts or 5 minutes" would have become
  "stood up 6 s after any hand".
- **A timing bug hid here.** For a moment a page could show "Away" next to a
  full turn clock, which also made one test flaky. The deadline is now
  computed by one function that every caller reads
  ([`3311c54`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/3311c54)).
- **Tested:** the short turn for an away player, the full turn for a present
  one, the stand-up after exactly 5 timeouts (not 4, not 6), and a quick
  reconnect not counting as away (red in
  [`97a4e0d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/97a4e0d),
  green in [`a5a7de6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a5a7de6)).
  **Not tested:** the 5-minute stand-up at its real length.
