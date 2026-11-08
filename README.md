# House Game

## What this is

A Texas Hold'em table for a small group of friends, in one room or online.
Everyone plays from their own phone or laptop, and sees every move as it
happens. Alone, you can play against the house.

## What good means here

Good means a home game that keeps moving and is fair to the people at it.

- **Nobody waits on someone who isn't there.** You have 20 seconds to act,
  then the table checks for you if it can and folds if it can't
  ([ADR 0003](docs/adr/0003-turn-timeout.md)). A player who has closed the
  page gets 5 seconds, and is stood up after 5 timeouts in a row or 5 minutes
  away, only when the hand ends ([ADR 0004](docs/adr/0004-ghost-seats.md)),
  because answering one message on a phone shouldn't cost a friend's chips.
- **Everyone sees the same table.** At a showdown, every hand still in is
  turned face up for everyone, as at a real table. Folded hands stay hidden.
  The next hand deals itself 6 seconds later.
- **Getting in takes one tap.** A friend who opens the link can press *Play
  as a guest* and sit down as something like "Wombat 27", then claim the
  account later ([ADR 0005](docs/adr/0005-guest-accounts.md)).
- **There is something to do alone.** *Play the house* is Casino Hold'em
  against the dealer, with its own chips and results.

## What I read

Robin Sloan's ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/)
(2020) is about an app for his family only: "I am the programming equivalent
of a home cook." Clay Shirky's
["Situated Software"](https://gwern.net/doc/technology/2004-03-30-shirky-situatedsoftware.html)
(2004) says the same from the builder's side: software for a group you know
can lean on the group's own habits instead of building machinery for
strangers. Maggie Appleton's
["Home-Cooked Software and Barefoot Developers"](https://maggieappleton.com/home-cooked-software)
(2024) adds that language models now let people outside the profession,
like me coming from business, build such software for their own circle.

## Accounts

A registered account has a password and two security questions from a fixed
list, so a password can be reset with no email or phone. A guest has
neither: it lives only in the browser it was made in. To come back tomorrow,
register.

## What I chose not to build

The median poker site is a lobby full of strangers, with chips you can buy,
chat, and buttons to report or kick players. House Game leans on the friends
instead, as Shirky suggests: one table, no chat because we talk in the room,
no kick button. No chip exchange either: every seat gets the same fixed
chips, and if chips could be bought or exchanged for anything, the app could
risk breaking the law. The house's chips never move to the table, or back.

The clock is the one thing I don't leave to the group: telling a friend to
hurry up, or kicking them, is the social cost a home game should avoid.

## Enforced vs judged

Enforced by checks in `spec/`:

- Before showdown, other players' hole cards are never sent to your browser.
  At a showdown, every viewer gets the same hands.
- Table chips never change in total during a hand, can't be bought or
  transferred, and are never touched by a hand against the house.
- Another player's action reaches your screen within a second.
- The 20-second check-or-fold, and the absent player's 5-second turn and
  stand-up.

Judged by people: whether it is fun, and whether it feels quick on phones.
In the week of crit 10 I played on the live site with a few friends, mostly
on phones, and everyone said it felt laggy. The cause was not the network
but dead connections and players who had left yet stayed seated
([evidence, 18 Oct](docs/evidence/production-timeline-2026-10-18.json)).
That game led to the away rules and the 20-second turn. The guests, the
house and the shared showdown came later; so far only I have tried them.
