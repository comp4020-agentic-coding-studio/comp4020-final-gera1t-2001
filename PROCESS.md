# Process overview

## Where this stands

House Game is a Texas Hold'em table for a small group of friends, live at
<https://comp4020-final-gera1t-2001.fly.dev>. Friends sit at one table from
their own devices, and every action reaches every other open page without a
reload: on production, a median of 27 ms and a maximum of 41 ms, with 0 of
20 missed. A friend can join as a guest in one tap, and anyone can play
Casino Hold'em against the house alone. Since crit 9's real-time table, the
work has mostly been finding out why it felt bad to play with real people.

## Stack

**Hono + better-sqlite3, hand-written SQL** (ADR 0001,
[`91653c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/91653c6)).
I gave up the stack that worked in crit 7 because I am not yet familiar with
full-stack work, and this was a chance to try a different architecture. Hono
also serves server-sent events directly, which is how the table goes
real-time.

**A rules engine, not a whole poker app** (ADR 0002). After a time-boxed
spike
([`2f42726`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/2f42726)),
I chose `@pokertools/engine`
([`f98b429`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/f98b429))
because it was the only library that could save and restore a hand. That
paid off: after a production restart mid-hand, both pages were Live again in
12.7 s with the same hand. The cost is that the engine is new and its
defaults are not my game's rules (see below), so it is pinned, imported from
one module, and every claim about it is read from its source.

**SSE + POST, not WebSocket.** When the table felt laggy, a rewrite looked
like the obvious fix, but measuring showed delivery was already fast. The
trade-off is presence in memory on one machine: the app can't run on two,
which is fine for one group of friends.

## How I directed the agent

I plan in a Claude chat, and the agent in WSL builds. Decisions go into a
brief file in `docs/`
([`9b7daa2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/9b7daa2),
[`96b08af`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/96b08af))
with an "Owner decisions (do not reopen)" list; files, because long pastes
into the terminal lost characters. The agent does one step, writes the
failing test first, has an Opus subagent review the diff and screenshots,
logs, and stops for me. It may not edit README, PROCESS, the reflections or
an ADR's Decision, and pushes wait for my word because every push deploys.
This is slow, but every number in the game is one I chose, and each step
left a record I could check.

The stops also caught three mistakes in my briefs (written with the
Claude chat), which the agent corrected from the libraries' source, such as
a qualifying hand that can't be the best five of seven cards
([`5ce1305`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/5ce1305),
[`eefec87`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/eefec87),
[`88e6e8e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/88e6e8e)).

## Moments

### Measure before fixing [harness]

My friends kept saying the table was laggy. I rejected the agent's first
latency probe twice before approving it. Its stream check never waited long
enough to see a single heartbeat, so a dead stream would have read as
healthy, and it could strand its own seats at a table with other players
([`c4412a4`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/c4412a4)).
The working probe showed delivery was fast. The real causes were a page whose
stream died without an error, fixed with a named heartbeat and a watchdog
([`dbf2c4e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/dbf2c4e)),
and players who had left but were still seated (ADR 0004, red in
[`97a4e0d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/97a4e0d),
green in
[`a5a7de6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a5a7de6)).

### Correct for the code, wrong for my friends [judgement]

The first rule stood an absent player up after 2 timeouts or 60 seconds. I
changed it to 5 and 5 minutes before it shipped, because phones drop the
stream in the background and standing up resets chips
([`b31671b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/b31671b)).
The showdown was the same kind of problem. The engine mucks losing hands by
default, so the loser saw every hand and the winner saw only their own. The
22 Oct log called that "correct". It is correct for the engine, but at a home
game everyone turns their cards over. Now every live hand at a showdown is
shown to everyone through the engine's own `SHOW` action, so hiding cards
still happens in one place (red in
[`a7b5187`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a7b5187),
green in
[`5ce1305`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/5ce1305)).

### A flaky test was a real bug [harness]

One ghost-seat test failed about one run in eight. The easy fix was a wider
margin. Instead, the agent reproduced it by delaying one timer by 800 ms, and
found a real bug: a page could show "Away" next to a full turn clock. The
deadline now comes from one function that everything reads, and the suite
then passed 20 full runs in a row
([`c665585`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/c665585),
[`3311c54`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/3311c54)).

### A test that agreed with itself [harness]

The first solo test checked results with the server's own `settle()`, so a
wrong rule would agree with itself. The Opus review caught it; the test now
scores hands with the evaluator directly, against a paytable written in the
test
([`88e6e8e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/88e6e8e)).

### What the checks missed and the screenshots showed [harness]

Before the last big push, every check in the agent's browser walk passed,
but the review of its screenshots showed a guest who had just sat down with
1,000 chips credited with the previous pair's win. That became test 37, red
and then green
([`a5eb70c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a5eb70c),
[`a8a9562`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a8a9562)).
Later, a font check on production found a number that only appears
after 20 hands, which no local run had reached
([`5380df9`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/5380df9)).

## What protects the promises

The README splits its claims into enforced and judged. Each enforced claim
is also a rule in `CLAUDE.md`'s House Game section, and each rule names the
`spec/` test that protects it, so the three say the same thing. Writing that
section showed a gap: until then these rules lived only in the briefs'
owner decisions, which a later session might not read. The key tests were
shown to go red when the thing they protect is broken on purpose.

## The reading

I agree with Robin Sloan that an app can be a home-cooked meal, and with
Shirky that it can lean on the group: no chat, no reports, no kick button.
But I don't lean on the group for the clock, because waiting on a friend, or
telling them to hurry, is the cost my friends complained about. Where I
disagree with Sloan: with an agent, making something that runs is no longer the hard
part, as it still is for cooking. The hard part is knowing what your friends
will put up with: a 30-second wait, losing chips for answering a message, or
a showdown where nobody sees the cards.

## What has not been checked

The only game with friends on real phones was in the week of crit 10, on
an older version (its data went with the 4 Nov wipe; a backup is kept
outside the repo). My friends haven't played the current version yet. No screen reader has
been tried. The 5-minute stand-up has not been timed at
its real length. No hand has been played on production with more than two
players. The app runs on one machine only, by design.
