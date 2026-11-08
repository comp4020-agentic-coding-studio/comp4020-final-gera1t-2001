# ADR 0005: Guest accounts

## Status

Accepted (owner, 7 Nov 2026). Built in Step 11 of brief 2; the Decision
below is the owner's.

## Context

The door to the table is registration: a username, a password that must meet
five rules, and two security questions with answers. For a friend opening an
invite link on a phone, that is a lot to fill in before seeing a single card.
Several friends at a home game might give up at that form.

The security questions are an owner decision from C8 (`docs/c8-brief.md`):
"A user who forgot their password can reset it by answering the security
questions they set at registration (no email, no phone number). This is a
deliberate, owner-made choice: do not replace it with another recovery
method or argue it away; …" They are the only way back into an account whose password is lost.
Any lighter door has to live with that: an account without questions has no
recovery at all.

The stakes are low. Chips are play chips with a fixed buy-in, and a lost
account loses only its name, its seat and its line on Results. But Results
is the one place a player's history is kept, and an account nobody can get
back into still shows there.

Brief 2 (4 Nov 2026) asks for guest accounts and for this ADR. As built in
Step 11:

- **Play as a guest** on `/login` and `/register` (`POST /guest`) makes a
  signed-in account in one tap: username `guest-` plus 6 random lowercase
  base32 characters, a password hash of 32 random bytes nobody knows, no
  security questions, `users.is_guest = 1` (migration 0006). The session
  lasts 30 days, and slides (below).
- The display name is an animal and two digits, like "Wombat 27" (owner
  decision, 4 Nov 2026, after Step 11; it was "Guest 4821"). Each of the 24
  animals starts with a different letter, and a new guest gets one whose
  letter no seated player's avatar already shows, so guests at one table
  are told apart by the avatar as well as the name.
- A guest session slides (owner decision, same day): on any request, a
  guest session with under 15 days left is extended to 30 days from now.
- At most 10 guests per IP per hour (an IPv6 address counts by its /64),
  counted in memory.
- Form POSTs that a browser marks as cross-site (`Sec-Fetch-Site`) are
  refused, so another site can't replace or delete a guest's cookie.
- The header shows a guest's name and **Claim account**. The profile's
  **Claim this account** panel takes the register page's username, password
  and question fields, checked by the same `registerErrors`. Claiming keeps
  the user id, so seat, stack and `hand_results` stay, and sets `is_guest`
  to 0.
- Log out for a guest goes to a warning page first: "You're a guest. If you
  log out you can't get back into this account."
- Forgot password treats a guest username exactly like an unknown one.
- Unclaimed guests show on Results tagged "guest". There is no cleanup job.

## Options

- **A. No guests (as before Step 11).** Every player registers in full.
  Every account can be recovered with its questions. The friction at the
  door stays where it is.
- **B. Guests with a claim path (as built).** One tap to a seat. Recovery is
  given up only for accounts that never claim. Anyone who wants recovery
  gets it by claiming, under the same rules as registering. The C8 decision
  still holds for every account with a password.
- **C. A lighter registration for everyone**, e.g. username and password
  with the questions optional, or a weaker password rule. Less friction for
  everyone, but it changes the C8 recovery decision for every account, not
  just for people who choose to skip it. The brief's Owner decisions don't
  allow that.
- **D. A shared link token instead of accounts** (anyone with the invite
  link plays as a named seat). No account at all, so no Results history, no
  profile, and anyone the link reaches can take the seat.

## Decision

B, guests with a claim path.

A friend who opens the link at a home game should be at the table in one
tap. They should not have to fill in a password with five rules and two
security questions before they see a single card. But I did not want to give
up my C8 decision: every account with a password can still be recovered with
its questions. B keeps that for everyone who registers or claims. Only a
guest who never claims goes without recovery, and the app tells them so
before they log out. C would weaken recovery for everyone, and D would give
up history on Results and let anyone the link reaches take a seat.

Two details are my decisions too (4 Nov 2026). A guest is named after an
animal, like "Wombat 27", so two guests at one table can be told apart by
their avatars. And a guest session slides, so a friend who plays every week
doesn't lose the account at day 30 ([`bccbc3b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/bccbc3b)).

## Consequences

What B costs, against what it buys:

- **Recovery versus friction at the door.** A guest who loses the cookie
  (cleared site data, a private window, another device, logging out anyway)
  loses the account for good. The app offers no way to restore it: the
  password hash has no password behind it, there are no questions, and
  recovery for a guest username behaves like an unknown username on purpose,
  so it reveals nothing. Only someone with access to the database could
  bring it back, by hand. The warning page and the header's Claim account
  link are the only protection. In return, the C8 rule is untouched for
  everyone who claims or registers.
- **A guest's session ends only after 15 to 30 days without a visit.** Any
  request with under 15 days left on a guest session extends it to 30 days
  from now (`slideGuestSession` in `src/sessions.ts`, one `UPDATE` that
  checks and writes together), and the browser gets the cookie again with
  the new expiry. So a guest who plays at least once a fortnight never loses
  the account to the clock; one who stays away longer than that loses it
  somewhere between day 15 and day 30 after their last visit, depending on
  where in the cycle they left. Costs:
  - An abandoned guest's account, and its line on Results, can no longer be
    assumed dead after 30 days: a browser that still holds the cookie can
    keep it alive indefinitely. That matters to any later cleanup (the
    owner's postponed wipe), which can't tell "abandoned" from the
    expiry date alone.
  - A stolen guest cookie stays useful for as long as the thief keeps using
    it. For a registered account it would expire at 30 days; a guest has no
    password to change, so claiming (which ends the guest session) is the
    only way to cut it off.
  - Registered sessions still don't slide: a registered player logs in
    again after 30 days. The two kinds of account behave differently here
    on purpose, because only the guest has no other way back in.
  - At most one database write per guest per fortnight; every other
    request's check finds nothing to change.
- **Orphaned guests pile up.** No cleanup job (out of scope in brief 2), so
  every abandoned guest stays in `users` and on Results with its tag (the
  home page's Regulars leaves unclaimed guests out). The rate limit bounds
  how fast one address adds them: 10 per IP (or IPv6 /64) per hour, 240 a
  day; someone with many addresses gets that many budgets. It is in memory, so a restart resets it. Behind a
  shared network (a dorm, a phone carrier's NAT), friends share one budget.
  Brief 2 asked that the owner's postponed account wipe consider guests.
- **A seated guest who disappears** is handled like anyone else: away after
  10 s, stood up by the ghost-seat rules. Their seat is not held for them.
- **The rate limit trusts `Fly-Client-IP`.** On Fly the proxy sets it. Off
  Fly (localhost, CI), any client can set it, which is how the spec gives
  each test its own budget. If the app ever ran somewhere without Fly's
  proxy in front, the limit would be trivial to step around. On production,
  Fly's proxy does replace a `Fly-Client-IP` the client sends: checked on
  7 Nov with a temporary log line ([`d58fe5f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/d58fe5f), removed in
  [`386423f`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-gera1t-2001/commit/386423f)).
- **Claiming reuses registration**, so the two can't drift apart: the same
  rules, messages and field mapping (`registerErrors`, `MESSAGES`) and the
  same fieldsets in `src/account-pages.ts`.
