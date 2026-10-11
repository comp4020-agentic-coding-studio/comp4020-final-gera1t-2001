# ADR 0002: Poker engine library

## Status

Proposed — decision pending (human).

## Context

C9 adds one real Texas Hold'em table on top of the existing accounts system
(see `docs/c9-brief.md`). The engine that runs the hand has to satisfy
constraints that come directly from the rest of the stack, not just "deals
cards correctly":

- **Server is authoritative; no leaks.** A browser must never receive another
  player's hole cards before showdown — not in an HTTP response, not in an SSE
  event. Whatever builds "the view for user X" has to be trustworthy by
  construction, because every response and every pushed event goes through it
  (Step 2 of the brief).
- **Chip conservation is a hard invariant**, including side pots when a
  player is short-stacked. "Play chips only" and a fixed buy-in (owner
  decisions already made) mean a library that gets side-pot math wrong is a
  real bug, not a cosmetic one.
- **Crash recovery via snapshots.** Step 1's `table_state` table stores the
  engine's state as a JSON blob and restores it on boot. Whatever library we
  pick either has to serialize/deserialize its own state, or we're on the
  hook for doing it by hand.
- **Must build on `node:24-alpine`** (ADR 0001's Fly image, 256 MB total) —
  no native addons, modest dependency weight.
- **Solo developer, ~14 hours to the cutoff.** The library's own test
  coverage and documentation quality matter more this week than they would
  with time to spare: if something's wrong, there's no slack to debug someone
  else's side-pot code from scratch.

Spike time-box: 45 minutes (spent closer to that on exploration and
verification than on code — see the spike scripts for exactly what was run).
All spike code lives in `spike/` (gitignored, not part of the app's
`package.json`); nothing here touches the real dependency tree.

## Options considered

### Option A — `@pokertools/engine`

**Version actually installed: 1.0.20, not npm's "latest" tag (2.0.4).** A
plain `npm install @pokertools/engine` with no version pin resolved 1.0.20
here, silently, with no `EBADENGINE` warning. The reason: 2.0.4 declares
`engines: { npm: ">=12.2.0", node: "^24.15.0 || >=26.0.0" }`; this sandbox has
node 24.21.0 (satisfies the node range) but npm 11.19.0 (fails the npm range).
Pinning `@pokertools/engine@2.0.4` explicitly *does* install it, with an
`EBADENGINE` warning. **Whether `node:24-alpine`'s bundled npm satisfies
`>=12.2.0` is unverified** — no Docker available in this sandbox to check. If
2.0.4 is wanted, that has to be confirmed (or the npm version pinned up) before
relying on it in CI/Fly; everything below was run against 1.0.20, the version
that actually installs today without any extra step.

Also worth the owner's attention before trusting this package: version 2.0.0
was published 2026-10-04 and 2.0.1 through 2.0.4 followed within the next two
days (one major bump and four patches in 48 hours) — a rapid-patch pattern
worth being a little cautious about picking up immediately for a one-week
build, independent of the npm/node engine question above. The README also
carries some inconsistent-sounding marketing copy (a badge claiming "391
tests passed" against body text saying "397 tests across 42 suites") — not a
functional problem, just a reason the claims below were checked against the
actual installed source rather than taken from the README.

**1. Side pots and chip conservation** (`spike/pokertools.cjs`, Scenario 1).
Reading "1000 chips each" and "A goes all-in short (300)" literally together
is impossible in one hand (if everyone buys in at 1000 and A shoves on her
very first action, her all-in is for 1000, not 300). Read as "the short
stack's all-in is 300": Alice buys in for 300, Bob and Charlie for 1000 each,
Alice shoves preflop, Bob and Charlie keep betting past her. Result, read
straight from `engine.state`:

```
pots = [
  { amount: 900, eligibleSeats: [0,1,2], type: "MAIN" },
  { amount: 600, eligibleSeats: [1,2],   type: "SIDE" }
]
```

Main pot correctly excludes no one (all three covered the first 300); side
pot correctly excludes Alice (seat 0). After the hand finishes, final
stacks + pots summed to exactly 2300 — the real starting total (300 + 1000 +
1000), not a hard-coded 3000. (One rough edge: `state.winners` after this hand
listed four entries for two actual winners, which I didn't fully decode —
flagged as unverified rather than asserted on.)

**2. Serialize → restore → finish.** `engine.snapshot` / `PokerEngine.restore`
is a first-class, documented API. Reached the flop, took `JSON.stringify
(engine.snapshot)` (6.5 KB for a 2-player hand), parsed it back,
`PokerEngine.restore(...)`'d a *new* instance, and finished the hand on the
restored instance to a real winner. Board and hole cards matched before and
after. This worked exactly as documented, first try.

**3. Player B's view.** `engine.view(playerId)` is a library-owned masking
function (`createPublicView` in `dist/utils/view-masking.js`) — not something
we write ourselves. Read the source directly rather than trust the README:
it returns `{ ...state, deck: [], players: maskedPlayers, ... }` where each
player's `hand` is `null` for everyone except `viewerId` (and, after
showdown, whoever's `shownCards` says to reveal). It hides the deck
unconditionally too. Confirmed empirically: Bob's view had `hand: null` for
Alice's seat, `deck: []`, and Alice's actual two cards did not appear
anywhere in `JSON.stringify(bobView)`.

**License / deps / native code**: MIT. Two runtime deps,
`@pokertools/evaluator` and `@pokertools/types` (which pulls in `zod`), all
MIT, all pure JS/TS — `find node_modules -iname '*.node'` found nothing, and
none of the three packages declares an `install`/`postinstall` script. ~1.5
MB installed.

**Randomness**: `dist/utils/deck.js`'s `getSecureRandom()` uses
`crypto.randomBytes` and is explicitly "fail-closed" — it throws rather than
falling back to `Math.random()` if no secure source is available — and the
shuffle function takes an injectable `rng`, which is also how the library
suggests writing deterministic tests (`createSeededRandom(seed)` in its own
docs). Quoted directly from source, not from the README's claims.

### Option B — `poker-ts`

Version 1.5.0 is the only major line on npm (`npm view poker-ts dist-tags`
agrees with what installs unpinned — no engine surprise like Option A's).

**1. Side pots and chip conservation** (`spike/poker-ts.cjs`, Scenario 1). Same
setup (Alice 300, Bob/Charlie 1000 each, Alice shoves, Bob and Charlie keep
betting). Result from `table.pots()`:

```
pots = [
  { size: 900, eligiblePlayers: [0,1,2] },
  { size: 600, eligiblePlayers: [1,2] }
]
```

Identical numbers to Option A. Final stacks summed to 2300 after showdown —
correct. One difference worth noting: `table.pots()` asserts the hand is
still in progress and *throws* once `showdown()` has ended it, so the
chip-conservation check has to read final stacks only, not stacks-plus-pots —
a minor API-shape difference from Option A, not a correctness problem.

**2. Serialize → restore → finish — does not work.** `poker-ts` has no
documented snapshot/restore API (nothing in its README or `dist/index.d.ts`).
The obvious fallback, `JSON.stringify(table)`, actually succeeds and captures
everything, hole cards included (3.4 KB for a 2-player hand) — I checked
first whether this was blocked by real private `#fields` (it has none
anywhere under `dist/lib/`, confirmed by grep; TypeScript's `private` is
compile-time-only and erased at runtime, so every field is a plain,
enumerable `_foo` property). The data survives the round-trip; the *behavior*
doesn't. Quoting `dist/facade/poker.js`: the public `Table` class is a thin
facade whose methods all delegate to `this._table.<method>()`, where
`_table` is an instance of the internal (not exported from the package root)
`lib/table.js` class, which itself nests further internal class instances
(`Dealer`, `BettingRound`, `PotManager`, `Deck`, `CommunityCards`, `Player`,
...). `JSON.parse` rebuilds the right *data* but none of those classes'
prototypes, so a naive restore fails immediately: `this._table.playerToAct
is not a function`. A real fix would mean either (a) a hand-written deep
reviver that reconstructs every internal class and re-attaches its prototype
at each nesting level — reachable today only via an undocumented deep
require (`poker-ts/dist/lib/table`) that the package doesn't export from its
root and isn't part of its contract, so a patch release could break it with
no semver signal — or (b) replaying a full action history into a fresh
table, which the library doesn't record for us either. Neither is "this just
works," and Step 1's `table_state` design (snapshot in, snapshot out) assumes
it does.

**3. Player B's view — has to be hand-built.** `table.holeCards()` returns
*every* seated player's cards unconditionally; there is no `view(playerId)`
equivalent. I wrote a 6-line wrapper (`buildViewForSeat` in the spike) that
masks everyone except the viewer before anything is returned, and confirmed
it worked the same way as Option A's. It's not hard to write once — the risk
is that it has to be written *correctly, once, and called everywhere* a
response or SSE event is built; nothing in the library stops a future change
from accidentally calling `holeCards()` directly and shipping it. Option A
rules the equivalent mistake out by giving the masked view its own name and
making the raw `state` getter visibly the "danger" one.

**License / deps / native code**: MIT. Zero runtime dependencies at all — no
transitive packages to vet. ~330 KB installed. No native code, no
install/postinstall scripts.

**Randomness**: `dist/util/array.js`'s `shuffle()` uses `crypto.randomInt`
directly (cryptographically secure, Fisher-Yates) — solid, but **not
injectable**: there's no config option or parameter to supply a seeded RNG,
unlike Option A. Deterministic tests of exact card outcomes aren't possible
without monkey-patching `node:crypto` itself.

## Comparison table

| | `@pokertools/engine` (1.0.20 installed) | `poker-ts` 1.5.0 |
|---|---|---|
| License | MIT | MIT |
| Runtime deps | 2 (`@pokertools/evaluator`, `@pokertools/types` → `zod`), all MIT, all pure JS | 0 |
| Installed size | ~1.5 MB | ~330 KB |
| Native code | None found | None found |
| `node:24-alpine` fit | Yes, at 1.0.20. Latest (2.0.4) needs npm ≥12.2.0 — unverified against alpine's bundled npm | Yes, no caveats found |
| Side pots / chip conservation | Correct in spike (900/600 split, 2300 conserved) | Correct in spike (900/600 split, 2300 conserved) |
| Snapshot → restore | Works as documented, first try | **Does not work** out of the box; would need an unsupported deep-require hack or action replay |
| Per-player masked view | Library-owned (`engine.view`/`createPublicView`), reads clean from source | Not provided; must hand-write and remember to call it everywhere |
| RNG | `crypto.randomBytes`, fail-closed, injectable (seedable for tests) | `crypto.randomInt`, not injectable |
| Maintenance signal | 5 releases (one major) in the last 8 days as of today; evidence not yet checked beyond that | Single stable 1.x line, no recent-churn signal found |

## Decision

@pokertools/engine, pinned to the exact version tested in the spike.

It is the only option that can save a hand to the database and restore it, which the app needs for two promises: a hand survives a restart or redeploy, and the turn countdown still fires after one. Its built-in view masking also means other players' hole cards are hidden by the library, not by code we must remember to call.

## Consequences

- The library is new and changes quickly, so it is pinned and wrapped in one module (src/poker/engine.ts); swapping it later means changing one file.
- Our own checks (chip conservation, hidden cards) guard against bugs in it.
- Its latest version needs a newer npm than we have, so upgrading is a deliberate step, not automatic.
