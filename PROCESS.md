# Process overview

## Where this stands

The app is a real-time Texas Hold'em table for friends, live at
<https://comp4020-final-gera1t-2001.fly.dev>. Players register, sit down with
a fixed stack of play chips, and play hands; every action reaches every other
open session within about a second, without a reload. In crit 8 it was only an
account system, because I had not decided what to build. This week I decided:
a poker table for friends, built on the account system I already had.

## Stack

**Hono + better-sqlite3, hand-written SQL** (ADR 0001,
[`91653c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/91653c6)).
I gave up the stack that already worked in crit 7 because I do not consider
myself familiar with full-stack work yet, and this was a chance to try a
different stack and architecture. Every full-stack project starts over when
you choose a stack; what you build is never the same, even with a similar
stack. It also prepared for this week: Hono serves server-sent events directly,
which is how the table goes real-time.

**A rules engine, not a whole poker app.** I did not want to write poker rules
myself, and the open-source poker apps I found came with their own stacks
(and in one case a GPL licence). The agent ran a time-boxed spike comparing two
libraries on the same scenarios: side pots and chip conservation, saving a
hand to JSON and restoring it, and hiding other players' cards
([`2f42726`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/2f42726)).
I chose `@pokertools/engine`
([`f98b429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/f98b429))
because it was the only one that could save and restore a hand, which the app
needs so a hand and its countdown survive a restart. It is new, so it is
pinned to the exact version tested and only imported from one module.

## How I directed the agent

Before any code, the agent gets a step-by-step brief. After each step it
reports what it verified and what it did not, then stops and waits for me. It
may not edit README.md, PROCESS.md, the reflections or an ADR's decision.
I made it stop after every step because the AI is very capable: in auto mode
it would probably do everything in one go, and that would leave a lot of work
I had no way to check. The decisions in the brief are mine: play chips only,
a fixed buy-in, and the turn-timeout rule in
[ADR 0003](docs/adr/0003-turn-timeout.md).

## Moments

### The brief I changed never reached the repo [judgement]

After I added the turn-timeout decision to the brief, I told the agent to
carry on. It compared the file's hash and modification time against the last
commit, found the brief unchanged, and stopped to ask me instead of guessing
what the decision said. The updated brief was then committed
([`a4d4973`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a4d4973))
and the missing `turn_deadline` column added
([`895e48d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/895e48d)).
This showed I had not finished my own part. Next time I should double-check
it myself before handing over.

### The timer could act on a stale table [harness]

The agent first said that if a real click and the timer collided, "whichever
one writes last wins". The AI caught this, not me: the Claude chat I plan
with questioned that phrase, and the agent then traced it and admitted the only
protection was that better-sqlite3 happens to be synchronous, which nothing
enforced. It split the action into prepare and commit, and the commit now
only applies if the table's version is unchanged (`UPDATE ... WHERE version
= ?`), proven by letting a real action land first and watching the stale
timer action get rejected
([`59438af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/59438af)).

### Green checks, wrong page [harness]

All checks passed, but driving two real headless-Chromium sessions found two
bugs: a form that should have been hidden was still visible (a CSS rule beat
the browser's `[hidden]` style), and the auto-fold label named the wrong
player
([`810ed72`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/810ed72)).
Tests passing is not enough; it still needs a real browser.

## What protects the promises

`spec/poker.test.ts`
([`2bd935e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/2bd935e))
checks real-time delivery, hidden cards, chip conservation, out-of-turn
actions, the fixed buy-in and both timeout outcomes. The agent proved the
key tests are not vacuous: turning off the push made exactly the two
real-time tests fail, and leaking one hole card made exactly the hidden-cards
test fail. When one timeout test kept failing for reasons outside the app, the
agent stopped and reported it instead of weakening the test; I gave it a
15-minute time box, and restructuring the test fixed it without making it
weaker.

## The reading

AI makes it easy to write code that runs, which means anyone can do full-stack
development now. But that is not enough to do full-stack development well.

## What has not been checked

No hand has been played with more than two people seated. Reconnecting relies
on the browser's built-in EventSource retry and was not tested by killing the
server mid-hand. Whether the game is fun has not been judged by anyone but me.
