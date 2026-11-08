# Good agentic practice is a human closing the negative-feedback loop

## Position

Coding agents have made code that runs cheap. They have not shortened the
distance between code that runs and code that is right. My position is that
good agentic practice puts the human's effort on the two loops the agent
cannot close by itself. The first is negative feedback: telling the agent it
is wrong through tests and rules, with each correction kept in the harness
rather than re-prompted away. The second is judgement about value: deciding
what "right" means, which neither the code nor the agent can do for you.

## Why "it runs" is not enough

In early 2025, METR ran a randomised controlled trial with 16 experienced
open-source developers working on 246 real tasks in mature repositories they
already knew. With AI tools allowed, tasks took 19% longer on average. The
developers had predicted they would be 24% faster, and afterwards still
believed they had been about 20% faster (Becker et al., 2025). The study is usually
cited as "AI slows people down", and METR itself warns against reading it
that broadly: early-2025 tools, expert developers, very large codebases. I
think its sharper finding is the perception gap. If developers cannot judge
the speed of their own work with an agent, they should not trust their
feeling about its quality either. That is a case for checks that do not
depend on how the work feels.

## What practitioners agree on

Practitioner writing reaches the same place from experience. Simon Willison
separates vibe coding, which means accepting code without reviewing it, from
responsible AI-assisted programming, and his rule is that he will not commit
code he could not explain to someone else (Willison, 2025). Kent Beck draws
the same line under the name augmented coding: unlike vibe coding, "you care
about the code, its complexity, the tests, & their coverage" (Beck, 2025).
The course's own framing goes one step further, treating most of harness
engineering as giving the agent good negative feedback: guides before it
generates, sensors after.

## Where they stop

All three stop at whether the code is correct. My final project, a poker
table for friends, shows a second layer. Its most important faults were not
bugs. The rules engine hid losing hands at a showdown, as poker rules allow,
and the agent's log called that correct. The first rule for absent players
stood them up after 60 seconds. The turn lasted 30 seconds, as mainstream
poker apps do. Each was tested, explainable and green, so each passes
Willison's and Beck's standard, and each was wrong for friends playing on
phones in one room. They were found by imagining those friends at the table,
and fixed by writing my decision into the brief and then into a failing
test. Schön (1983) describes practice as a conversation with the situation,
in which the situation talks back. In agentic work the agent can hold the
conversation with the code. Only the person who knows the users can hold the
one with the situation.

## The counter-case

The first objection is that small, low-stakes software doesn't need any of
this. Willison says low-stakes projects can simply be vibe coded, and Sloan
(2020) describes an app for his family as a home-cooked meal. But low stakes
is not no stakes. Losing your chips for answering a message, or a showdown
where nobody sees the cards, is exactly what decides whether a game for
friends is any good. How much is at stake depends on whether the app is fair
to the people who use it, not on how many of them there are.

The second objection is cost. My workflow stopped after every step, wrote a
failing test first and sent each diff to a second model for review. That is
slow, and METR's result could be read as evidence that adding a human to the
loop makes things slower still. But the same study shows that the speed a
developer feels is unreliable. If the feeling cannot be trusted, then
slowness that buys a checkable record is worth paying for. In my project,
three errors in my own briefs were caught by the agent at exactly those
stops, by reading the libraries' source.

## Limits

My evidence is one person's project, and METR studied early tools and expert
developers. I do not claim this workflow is the fastest everywhere. My claim
is narrower: once code that runs is cheap, the human's value lies in negative
feedback and in judgement about what is right, and good practice is the
practice that leaves a record of both.

## References

- Beck, K. (2025, 25 June). *Augmented coding: Beyond the vibes.*
  https://tidyfirst.substack.com/p/augmented-coding-beyond-the-vibes
- Becker, J., Rush, N., Barnes, E., & Rein, D. (2025). *Measuring the impact
  of early-2025 AI on experienced open-source developer productivity.* METR.
  arXiv:2507.09089. https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/
- Schön, D. A. (1983). *The reflective practitioner: How professionals think
  in action.* Basic Books.
- Sloan, R. (2020). *An app can be a home-cooked meal.*
  https://www.robinsloan.com/notes/home-cooked-app/
- Swift, B. (2026). COMP4020/COMP8020 Agentic Coding Studio, "Backpressure"
  topic. https://doi.org/10.5281/zenodo.21395760
- Willison, S. (2025, 19 March). *Not all AI-assisted programming is vibe
  coding (but vibe coding rocks).*
  https://simonwillison.net/2025/Mar/19/vibe-coding/
