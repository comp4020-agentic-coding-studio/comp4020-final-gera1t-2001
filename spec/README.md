# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## `TEST_HOOKS=1`: the test-only route

A few states take dozens of real hands to reach, such as both blinds all in
from the deal. For those, the app has a test-only route,
`POST /test-hooks/tables/:id/stacks`, which sets seated players' stacks
between hands. It is mounted only when **both** of these hold when the app
starts:

- `TEST_HOOKS=1` is set, and
- `NODE_ENV` is not `production`.

The `Dockerfile` sets `NODE_ENV=production`. So the image CI tests and Fly
runs never has the route, whatever else is set.

Set `TEST_HOOKS=1` for **both** the app and `pnpm check`, as with the timing
overrides listed in `src/poker/live.ts`:

```sh
TEST_HOOKS=1 node src/server.ts    # one shell
TEST_HOOKS=1 pnpm check            # another
```

| Run | Tests that need the route | Test 5b (route returns 404) |
|---|---|---|
| `TEST_HOOKS=1` on both | run; a missing route is a failure, not a skip | skipped |
| Without it, locally or in CI | skipped, and counted as skipped in vitest's summary | runs and must pass |

So CI proves on every push that the shipped build has no such route, and a
local run with the flag covers the tests that need it.
