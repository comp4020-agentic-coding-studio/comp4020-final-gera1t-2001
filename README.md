# no name

## Where this stands

I have not decided what this website is going to be yet. So far I have built
a registration page and a profile page.

## What good might mean here

I know registration may not count as the core of this week's crit. But from
my own point of view, it is the core of every website: each person's account
belongs to them alone and cannot be shared. Whatever I end up building, I
think getting registration right first is the best place to start.

## What I read

Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/) (2020).

> [paste your quoted passage here]

One part of this essay surprised me. With AI helping, producing code that
runs (I mean code that runs; how it runs is a separate question) is now much
easier than cooking. That includes the full-stack website I am building now.

But this passage still gave me something. When I first moved from business
to computing, it was only to add one more skill. When it comes to
programming, I am like a home cook.

## What this version does

You can register with a username and password, log in, and set a display
name and a short bio. That is all it does for now, so there is not much more
to say about it.

If you forget your password, you can reset it by answering the two security
questions you wrote when you registered. I chose this on purpose. This is a
small, non-commercial project, and security questions are a classic method
that does not need an email address or a phone number. I use two questions
instead of one so that it is harder for someone else to get into your
account by guessing.

I know security questions are considered weak: answers can be forgotten or
guessed. That is why each answer is stored hashed like a password, all
answers must be right, and repeated wrong guesses are locked out.

## What I chose not to build (yet)

Chat. Once people can register, adding a chat room would be easy. But I am
still working out what this website is for, so I have not built one.

## Enforced vs judged

Enforced by checks in `spec/`:

- No two people can have the same username.
- If you change your bio and then log in again from a different device, it is
  still there. It is stored on the server, not in your browser.
- A wrong answer to any security question does not change your password, and
  the app does not say which answer was wrong.
- After 5 failed recovery attempts, password recovery for that account is
  locked for an hour.
- Resetting your password logs out every device that was logged in before.

Judged by me:

- Whether registering is confusing.
- Whether it is comfortable to use on a phone.
