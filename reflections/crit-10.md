# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was measuring before fixing. My friends and I kept saying
the table was laggy, and I assumed the network was slow. When we measured the
live site, a move reached the other players in under 40 milliseconds. The lag
came from two other places. One was a page whose live connection had stopped
without any error, so it kept showing an old table. In one hand my own seat
was folded for me, because my page never showed that it was my turn. The
other was players who had closed their browsers but were still sitting at the
table, so everyone waited 30 seconds on each of their turns. Once we could see
the real causes, each fix had a clear target and a test that could prove it.

## What did this work change about who I want to be as a software developer?

Two things.

First, I want to make decisions from the player's side, not only the code's.
The first rule I agreed to stood an absent player up after 60 seconds. But my
friends play on their phones: answer one message, and they would lose all
their chips. So I changed it to five minutes.

Second, I want to trust what I see when I use the app myself. The AI said the
lag came from two accounts sharing one browser. That did not match what I had
seen at the table, so I said it was wrong and asked for a retest with two
separate browsers. That retest found the real causes.
