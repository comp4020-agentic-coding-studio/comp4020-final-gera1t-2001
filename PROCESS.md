# Process overview

## Where this stands

The app is live at <https://comp4020-final-gera1t-2001.fly.dev>. You can
register, log in, edit your display name and bio, and reset a forgotten
password with two security questions. Your bio is still there when you log in
again from another device.

This week I only built an account system, because I have not yet worked out
what this website is going to be.

## Stack: Hono + better-sqlite3, hand-written SQL

The agent laid out three options in ADR 0001
([`57d4b4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/57d4b4a)),
and I made the decision myself
([`91653c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/91653c6)):
it prepares for week 10's real-time requirement, and the SQL stays visible.

I gave up the stack that already worked in crit 7 because I do not consider
myself familiar with full-stack work yet, and this was a chance to try a
different stack and architecture. Every full-stack project starts over when
you choose a stack. A path that worked before does not make the next one
easier, because what you build is never the same, even with a similar stack.

## How I directed the agent

Before any code, I gave the agent a step-by-step brief
([`a39b6f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a39b6f7)).
After each step it reports what it verified and what it did not, then stops
and waits for me. It may not edit README.md, PROCESS.md, the reflections or
the ADR decision. Deploys and the Fly token stay with me.

I made it stop after every step because the AI is very capable: in auto mode
it would probably do everything in one go, and that would leave a lot of work
I had no way to check.

## Moments

### A logging rule that never ended [harness]

`CLAUDE.md` said every commit needs a process-log entry. To log
[`57d4b4a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/57d4b4a),
the agent made a log-only commit,
[`e391481`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/e391481),
which by the same rule needed its own entry, and so on forever. The fix went
into the harness rather than a retry: a commit that only adds log entries
needs no entry of its own
([`d372645`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/d372645)).

I did not notice this myself. It was pointed out by the Claude chat I use for
planning, and I had the agent add the rule. I think it happened because my harness is less
complete than in earlier crits: this time I only carried part of crit 7's
`CLAUDE.md` over, and that left gaps like this one.

### Changes that only came from using it myself [judgement]

Before I tried the app by hand, it had an 8-character minimum password and
security questions you wrote yourself. After using it, I felt both would go
wrong too easily, based on my own experience of registering and logging in on
all kinds of websites. So I asked for a password with an uppercase letter, a
lowercase letter, a digit and a punctuation mark, and for questions picked
from a fixed list
([`a44a916`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/a44a916)).
Tests for both went into `spec/accounts.test.ts`
([`d3624c2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/d3624c2)),
and the agent proved the core "your bio persists" test was not vacuous by
breaking bio saving on purpose: exactly the two expected tests went red, then
it reverted.

### The README stopped matching the app [judgement]

My README is the contract for this app, but after the step 4b changes the
committed README still said you write your own security questions
([`38a1d41`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/38a1d41)
only added the quote). This was mainly on me: I did not update the README in
time, and I did not tell the agent. No test could have caught it. I found it
while reviewing the process log before shipping.

## The reading

AI makes it easy to write code that runs, which means anyone can do
full-stack development now. But that is not enough to do full-stack
development well.

## What has not been checked

CI does not run while the repo is private, so until `/ship` the image was
checked by Fly's remote build plus `pnpm check` against the live URL (2/2;
the 13 account tests deliberately skip against the live URL so they never
write to it). Keyboard focus visibility was judged from one screenshot and my
own eyes, not tested.
