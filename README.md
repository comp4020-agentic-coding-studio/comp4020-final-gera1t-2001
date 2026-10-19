# House Game

## What this is

A Texas Hold'em table for friends. It suits an offline get-together, or
passing the time together online. Everyone plays from their own device, and
what one person does shows up for everyone else at the table.

## What good means here

For this app, good means a game of Texas Hold'em that plays smoothly.

When it is your turn and you do nothing, the table does not wait forever:
after 30 seconds it checks for you if it can, and folds for you if it can't.
I chose this because it is the rule mainstream poker games use. The options I
considered and what this choice costs are in
[ADR 0003](docs/adr/0003-turn-timeout.md).

## What I read

Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/) (2020).

> Building this app, I figured it out:
> I am the programming equivalent of a home cook.
>
> The exhortation “learn to code” has its foundations in market value. “Learn to code” is suggested as a way up, a way out. “Learn to code” offers economic leverage, professional transformation. “Learn to code” goes on your resume.
>
> But let’s substitute a different phrase: “learn to cook”. People don’t only learn to cook so they can become chefs. Some do! But many more people learn to cook so they can eat better, or more affordably. Because they want to carry on a tradition. Sometimes they learn because they’re bored! Or even because they enjoy spending time with the person who’s teaching them.

One part of this essay surprised me. With AI helping, producing code that
runs (I mean code that runs; how it runs is a separate question) is now much
easier than cooking. That includes the full-stack website I am building now.

But this passage still gave me something. When I first moved from business
to computing, it was only to add one more skill. When it comes to
programming, I am like a home cook.

## Accounts

You need an account to sit at the table. A password on its own is not safe
enough, because if you forget it you cannot reset it, so you also choose two
security questions from a fixed list. Security questions are a classic design
that needs no email address or phone number.

## What I chose not to build

Chip exchange. Every seat gets the same fixed number of chips, and the game
is purely for fun. If chips could be bought or exchanged for anything, at any
rate, the app could risk breaking the law.

## Enforced vs judged

Enforced by checks in `spec/`:

- Before showdown, other players' hole cards are never sent to your browser.
- The total number of chips at the table never changes during a hand.
- There is no way to buy or transfer chips.
- What another player does appears on your screen within a second, without
  reloading.
- If you do nothing on your turn, the table checks or folds for you.
- No two people can have the same username, and your bio is still there when
  you log in again from another device.

Judged by people: whether it is actually fun to play.
