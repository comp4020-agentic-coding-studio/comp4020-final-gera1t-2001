import { randomBytes } from "node:crypto";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";

import {
  AWAY_GRACE_MS,
  AWAY_STAND_TIMEOUTS,
  AWAY_TURN_SECONDS,
  BOOT_GRACE_MS,
  SHOWDOWN_PAUSE_MS,
  SSE_HEARTBEAT_MS,
  TURN_TIMEOUT_SECONDS,
} from "../src/poker/live.ts";
import { GUEST_ANIMALS, avatarLetter } from "../src/guest-names.ts";

// These tests sit real users at the one seeded table ("Home game", id 1) and
// play real hands, so — like spec/accounts.test.ts — they only run locally,
// never against the live deployment.
const baseUrl = inject("baseUrl");
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
const TABLE_ID = 1;

// Tests 7 and 8 wait past a real turn_deadline. CI starts the app with no
// TURN_TIMEOUT_SECONDS override, so that deadline is the real default (20s
// since docs/final-brief-2.md; 30s before); each of those two tests gets a
// per-test timeout well past that. Run locally with a short
// TURN_TIMEOUT_SECONDS to iterate faster, but the deadline itself is always
// read from the view, never assumed — these tests pass at 20s or at 1s
// without caring which. Every override is listed in src/poker/live.ts.
//
// The per-test timeout has to cover the wait past the deadline itself PLUS
// the budget given afterward for the push to actually land — not half of a
// single combined number (an earlier version of this file set both from one
// 45s constant, split in half, which comfortably covered a short local
// timeout but left only ~15s of the 45s for the SSE wait after a real 30s
// deadline, and timed out the whole test under the default). Test 8 waits
// past a deadline TWICE (once per part), so it gets its own, larger budget
// rather than sharing test 7's.
const TURN_TEST_TIMEOUT_MS = 60_000; // test 7: one deadline wait + the SSE wait budget
const TWO_TIMEOUTS_TEST_TIMEOUT_MS = 90_000; // test 8: two sequential deadline waits

// Investigating a failure here (see connectSse's own comment for the full
// account) found that a long-lived SSE connection in *this specific test
// harness* — a plain fetch() from a Node process that's already made many
// prior requests to the same server — occasionally has its underlying
// stream end on its own for reasons unrelated to this app: reproduced
// identically with node:http instead of fetch, and ruled out as a product
// bug by three independent checks that all passed cleanly — a raw `curl -N`
// held the identical connection open 38+ seconds and got its push on time;
// two real headless-Chromium sessions (Step 3's own verification) received
// pushes with ~20ms latency over much longer sessions; and this app's own
// turn-timer logs show it firing within 10ms of its scheduled deadline
// every time, including every time this exact test's underlying stream
// happened to drop. connectSse already reconnects on an unexpected drop
// (the way a real browser's EventSource does), which recovers most of the
// time; retry is a second, honest layer on top for the rest: a real
// regression in the push path fails every retry, since nothing about a
// retry changes what's actually being asserted.
const SSE_FLAKE_RETRIES = 2;

const VALID_PASSWORD = "Correct1!Horse";

function randomUsername(): string {
  return `poker_${randomBytes(6).toString("hex")}`;
}

function sessionCookieFrom(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
}

interface Player {
  username: string;
  userId: number;
  cookie: string;
  seatNo: number;
}

interface SeatView {
  seatNo: number;
  userId: number;
  username: string;
  displayName: string;
  stack: number;
  away?: boolean; // final brief Step 4
}

interface HandPlayer {
  id: string;
  seat: number;
  stack: number;
  betThisStreet: number;
  hand: [string, string] | [null, null] | null;
}

interface Winner {
  seat: number;
  amount: number;
  handRank: string | null;
}

interface HandView {
  handId: string;
  street: string;
  actionTo: number | null;
  winners: Winner[] | null;
  players: (HandPlayer | null)[];
  pots: { amount: number }[];
  currentBets: Record<string, number>; // final brief Step 7: bets in front, by seat
  minRaise: number;
}

interface LastAction {
  seat: number;
  type: string;
  auto: boolean;
  at: string;
}

interface TableView {
  table: { id: number; name: string; big_blind: number; buy_in: number; max_seats: number };
  seats: SeatView[];
  hand: HandView | null;
  turnDeadline: string | null;
  lastAction: LastAction | null;
  turnSeconds?: number | null;
  // Brief 2 Step 10: when the next hand deals itself, or null.
  nextHandAt?: string | null;
  // Final brief Step 4: who was just stood up for being away, so the page
  // can say why a seat emptied.
  // Brief 2 step 10b: each player carries why they were stood up.
  notice?: { type: string; players: { userId: number; displayName: string; reason?: string }[] } | null;
  you: number | null;
  version: number;
  seq: number;
  bootId: string;
}

async function register(username: string): Promise<string> {
  const body = new URLSearchParams({
    username,
    password: VALID_PASSWORD,
    display_name: username,
    bio: "",
    question_1: "first_dish",
    answer_1: "pasta",
    question_2: "childhood_nickname",
    answer_2: "rex",
  });
  const res = await fetch(new URL("/register", baseUrl), { method: "POST", body, redirect: "manual" });
  const cookie = sessionCookieFrom(res);
  if (!cookie) throw new Error(`register failed for ${username}: ${res.status}`);
  return cookie;
}

async function logIn(username: string): Promise<string> {
  const body = new URLSearchParams({ username, password: VALID_PASSWORD });
  const res = await fetch(new URL("/login", baseUrl), { method: "POST", body, redirect: "manual" });
  const cookie = sessionCookieFrom(res);
  if (!cookie) throw new Error(`log in failed for ${username}: ${res.status}`);
  return cookie;
}

async function registerAndSit(): Promise<Player> {
  const username = randomUsername();
  const cookie = await register(username);

  const sitRes = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie } });
  const view = (await sitRes.json()) as TableView & { error?: string };
  if (!sitRes.ok) throw new Error(`sit failed for ${username}: ${view.error}`);

  const seat = view.seats.find((s) => s.userId === view.you);
  if (!seat) throw new Error(`${username} sat down but isn't in their own view's seats`);
  return { username, userId: view.you!, cookie, seatNo: seat.seatNo };
}

async function getView(cookie: string): Promise<TableView> {
  const res = await fetch(new URL(`/tables/${TABLE_ID}/view`, baseUrl), { headers: { cookie } });
  if (!res.ok) throw new Error(`GET view failed: ${res.status}`);
  return res.json();
}

async function leaveTable(cookie: string): Promise<void> {
  await fetch(new URL(`/tables/${TABLE_ID}/leave`, baseUrl), { method: "POST", headers: { cookie } }).catch(
    () => undefined,
  );
}

async function startHand(cookie: string): Promise<TableView> {
  const res = await fetch(new URL(`/tables/${TABLE_ID}/start`, baseUrl), { method: "POST", headers: { cookie } });
  const view = (await res.json()) as TableView & { error?: string };
  if (!res.ok) throw new Error(`start failed: ${view.error}`);
  return view;
}

// Throws on a rejected action (out-of-turn, illegal, stale) — callers that
// specifically expect rejection use fetch directly instead, so a genuine
// rejection elsewhere in a test fails loudly rather than silently.
async function act(cookie: string, type: string, amount?: number): Promise<TableView> {
  const body = new URLSearchParams({ type });
  if (amount !== undefined) body.set("amount", String(amount));
  const res = await fetch(new URL(`/tables/${TABLE_ID}/act`, baseUrl), { method: "POST", headers: { cookie }, body });
  const view = (await res.json()) as TableView & { error?: string };
  if (!res.ok) throw new Error(`act(${type}) failed: ${view.error}`);
  return view;
}

// Folds whoever's left in a hand down to a finish (irrespective of what a
// test did or didn't do), then empties every seat — leaves the shared table
// ready for the next test regardless of how the current one ended. Since
// brief 2 Step 10 a finished hand deals the next one by itself after
// SHOWDOWN_PAUSE_MS, so a leave can land on a hand that was dealt while this
// ran ("can't leave mid-hand"); then it folds that one down too and retries.
async function cleanupTable(players: Player[]): Promise<void> {
  for (let round = 0; round < 5; round++) {
    for (let guard = 0; guard < 10; guard++) {
      const view = await getView(players[0].cookie).catch(() => undefined);
      if (!view?.hand || view.hand.winners !== null || view.hand.actionTo === null) break;
      const actor = players.find((p) => p.seatNo === view.hand!.actionTo);
      if (!actor) break;
      await act(actor.cookie, "fold").catch(() => undefined);
    }
    let allGone = true;
    for (const p of players) {
      const res = await fetch(new URL(`/tables/${TABLE_ID}/leave`, baseUrl), {
        method: "POST",
        headers: { cookie: p.cookie },
      }).catch(() => undefined);
      if (res && !res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!/not seated/i.test(body.error ?? "")) allGone = false;
      }
    }
    if (allGone) return;
  }
  // Leftover seats would turn later tests red far from here; fail here.
  throw new Error("cleanupTable: couldn't empty the table after 5 rounds");
}

interface SseEvent {
  event: string;
  data: string;
}

interface SseConnection {
  // The next event of any name (view, ping, ...), with when it arrived.
  nextEvent(timeoutMs: number): Promise<SseEvent & { at: number }>;
  // Reads events (skipping ones that don't match) until `predicate` matches
  // or `timeoutMs` elapses. Returns the matching view and how long the wait
  // took, measured from the moment this call started.
  nextView(predicate: (view: TableView) => boolean, timeoutMs: number): Promise<{ view: TableView; elapsedMs: number }>;
  close(): void;
}

// A background pump, not a lazily-pulled generator: it keeps calling
// reader.read() continuously from the moment the connection opens, queuing
// every parsed event, regardless of whether anything is currently waiting
// on nextView(). An earlier version only ever called read() from inside
// nextView() itself, so a long gap between calls (tests 7 and 8 both do
// real work, then wait ~30s past a deadline, before calling nextView again)
// left the stream unread for that whole gap.
//
// It also reconnects on any unexpected end, the way a real browser's
// EventSource does (per the spec, it auto-reconnects on every non-204
// close, not just some): investigating a failure here, the underlying
// fetch's stream was observed to end on its own well before the 20s
// heartbeat or anything in this test closed it — client library and
// timeout-independent (reproduced with node:http too), and specific to a
// connection opened after several prior requests on the same server
// process, which strongly suggests a Node/undici keep-alive-socket
// mechanic rather than anything about the app's SSE route itself (verified
// separately: a plain `curl -N` held the identical connection open and
// correctly delivered a push 38 seconds in). Reconnecting is the same fix
// a real browser already relies on for exactly this class of problem, and
// it's free here too: a fresh connection's "current view on connect" (see
// src/server.ts's GET /tables/:id/events) always catches up on whatever
// was missed, since every view is a full current snapshot, never a diff.
function connectSse(cookie: string): SseConnection {
  let closedByUser = false;
  let currentAbort: AbortController | undefined;
  const queue: (SseEvent & { at: number })[] = [];
  const waiters: (() => void)[] = [];

  function wakeAll(): void {
    while (waiters.length > 0) waiters.shift()!();
  }

  // Runs one connection attempt to completion (it ends when the stream
  // closes, for any reason) and reports whether that was this function's
  // own doing.
  async function pumpOnce(): Promise<void> {
    const controller = new AbortController();
    currentAbort = controller;
    try {
      const res = await fetch(new URL(`/tables/${TABLE_ID}/events`, baseUrl), {
        headers: { cookie },
        signal: controller.signal,
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const raw = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            // ":" comment lines and "retry:" carry no data — ignored
          }
          if (dataLines.length > 0) {
            queue.push({ event: eventName, data: dataLines.join("\n"), at: Date.now() });
            wakeAll();
          }
        }
      }
    } catch {
      // Reconnect loop below decides what happens next; an abort from our
      // own close() just ends the loop on the next check.
    }
  }

  (async () => {
    while (!closedByUser) {
      await pumpOnce();
      if (!closedByUser) await new Promise((resolve) => setTimeout(resolve, 100)); // brief backoff, then reconnect
    }
  })();

  return {
    async nextEvent(timeoutMs) {
      const start = Date.now();
      while (queue.length === 0) {
        const remaining = timeoutMs - (Date.now() - start);
        if (remaining <= 0) throw new Error(`timed out after ${timeoutMs}ms waiting for any SSE event`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Math.min(remaining, 1000));
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      return queue.shift()!;
    },
    async nextView(predicate, timeoutMs) {
      const start = Date.now();
      while (true) {
        while (queue.length > 0) {
          const event = queue.shift()!;
          if (event.event !== "view") continue; // pings carry no view
          const view = JSON.parse(event.data) as TableView;
          if (predicate(view)) return { view, elapsedMs: Date.now() - start };
        }
        const remaining = timeoutMs - (Date.now() - start);
        if (remaining <= 0) throw new Error(`timed out after ${timeoutMs}ms waiting for a matching SSE view`);
        await new Promise<void>((resolve) => {
          // Also re-checked periodically regardless of an explicit wake —
          // belt-and-braces against a reconnect's wake-up getting missed.
          const timer = setTimeout(resolve, Math.min(remaining, 1000));
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    close() {
      closedByUser = true;
      currentAbort?.abort();
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function waitPastDeadline(turnDeadline: string | null, bufferMs = 500): Promise<void> {
  if (!turnDeadline) throw new Error("no turn_deadline to wait past");
  const waitMs = new Date(turnDeadline).getTime() - Date.now() + bufferMs;
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

describe.skipIf(!isLocal)("poker (writes test data — local only)", () => {
  let alice: Player;
  let bob: Player;
  // Final brief Step 4: a seated player with no open stream goes away after
  // AWAY_GRACE_MS, and an away player's turn is cut to AWAY_TURN_SECONDS.
  // These tests model two players at their screens (7 and 8 wait out a full
  // TURN_TIMEOUT_SECONDS), so each holds a stream for the whole test,
  // separate from any stream a test opens to watch for pushes.
  let presence: SseConnection[] = [];

  beforeEach(async () => {
    alice = await registerAndSit();
    bob = await registerAndSit();
    presence = [connectSse(alice.cookie), connectSse(bob.cookie)];
  });

  afterEach(async () => {
    for (const s of presence) s.close();
    await cleanupTable([alice, bob]);
  });

  it("1. real-time: B receives A's action within 1 second", async () => {
    const before = await startHand(alice.cookie);
    const actor = before.hand!.actionTo === alice.seatNo ? alice : bob;
    const watcher = actor === alice ? bob : alice;

    const sse = connectSse(watcher.cookie);
    try {
      await sse.nextView(() => true, 2000); // the initial "current view" on connect

      const t0 = Date.now();
      // Heads-up preflop, the first actor always faces the big blind, so
      // "call" is always legal here regardless of who's the button.
      await act(actor.cookie, "call");
      const { view, elapsedMs } = await sse.nextView(
        (v) => v.hand !== null && v.hand.actionTo !== before.hand!.actionTo,
        1000,
      );
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(elapsedMs).toBeLessThan(1000);
      expect(view.hand!.actionTo).not.toBe(before.hand!.actionTo);
    } finally {
      sse.close();
    }
  });

  it("2. hidden cards: B's view, from the page and from the stream, holds none of A's hole cards", async () => {
    await startHand(alice.cookie);
    const aliceOwnView = await getView(alice.cookie);
    const aliceCards = aliceOwnView.hand!.players[alice.seatNo]!.hand;
    expect(aliceCards).not.toBeNull();
    expect(aliceCards).toHaveLength(2);

    // From the page's own JSON endpoint.
    const bobView = await getView(bob.cookie);
    expect(bobView.hand!.players[alice.seatNo]!.hand).toBeNull(); // parsed assertion, not a string search

    // From the SSE stream.
    const sse = connectSse(bob.cookie);
    try {
      const { view: streamedView } = await sse.nextView((v) => v.hand !== null, 2000);
      expect(streamedView.hand!.players[alice.seatNo]!.hand).toBeNull();

      // Belt-and-braces: the raw bytes don't contain the literal card
      // strings either, so there's no leak sitting in some other field.
      const raw = JSON.stringify(streamedView);
      for (const card of aliceCards!) expect(raw).not.toContain(JSON.stringify(card));
    } finally {
      sse.close();
    }
  });

  it("3. chip conservation: stacks sum to the sum of buy-ins after a played hand", async () => {
    const before = await getView(alice.cookie);
    const buyIn = before.table.buy_in;

    const dealt = await startHand(alice.cookie);
    const actor = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
    const after = await act(actor.cookie, "fold"); // heads-up fold ends the hand immediately

    expect(after.hand!.winners).not.toBeNull();
    const stacksSum = after.seats.reduce((sum, s) => sum + s.stack, 0);
    expect(stacksSum).toBe(buyIn * 2);
  });

  it("4. acting out of turn is rejected and changes nothing", async () => {
    const before = await startHand(alice.cookie);
    const notActing = before.hand!.actionTo === alice.seatNo ? bob : alice;

    const res = await fetch(new URL(`/tables/${TABLE_ID}/act`, baseUrl), {
      method: "POST",
      headers: { cookie: notActing.cookie },
      body: new URLSearchParams({ type: "call" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();

    const after = await getView(alice.cookie);
    expect(after.hand).toEqual(before.hand); // the parsed state is byte-for-byte unchanged
  });

  it("5. sitting down always gives exactly the fixed buy-in; there is no route to add chips", async () => {
    const view = await getView(alice.cookie);
    const seat = view.seats.find((s) => s.userId === view.you);
    expect(seat?.stack).toBe(view.table.buy_in);

    const res = await fetch(new URL(`/tables/${TABLE_ID}/add-chips`, baseUrl), {
      method: "POST",
      headers: { cookie: alice.cookie },
    });
    expect(res.status).toBe(404);
  });

  // Brief 2 step 10b: the test-only route that sets stacks
  // (POST /test-hooks/tables/:id/stacks) must not exist in the build that
  // ships. CI runs the Docker image, which sets NODE_ENV=production, so the
  // route is never mounted there; this runs in CI to prove it. It runs
  // whenever the spec isn't told TEST_HOOKS=1 (see spec/README.md), and skips
  // only on a local run that asked for the route. The request is otherwise
  // valid (JSON, a seated user, a legal stack), so a mounted route would
  // answer 200, not 404: the 404 can only mean the route isn't there.
  it.skipIf(process.env.TEST_HOOKS === "1")(
    "5b. the test-only route that sets stacks doesn't exist in this build",
    async () => {
      const res = await fetch(new URL(`/test-hooks/tables/${TABLE_ID}/stacks`, baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", cookie: alice.cookie },
        body: JSON.stringify({ [alice.userId]: 1000 }),
      });
      expect(res.status).toBe(404);
      // The session hook (owner decision after Step 11) likewise: a JSON
      // body with a session cookie would get 200 from a mounted route.
      const session = await fetch(new URL("/test-hooks/session", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json", cookie: alice.cookie },
        body: "{}",
      });
      expect(session.status).toBe(404);
    },
  );

  it("6. a hand's results are recorded and still readable after the request that ended it", async () => {
    const dealt = await startHand(alice.cookie);
    const actor = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
    const endingResponse = await act(actor.cookie, "fold");
    expect(endingResponse.hand!.winners).not.toBeNull();

    // "Still readable" means a separate, later request — not the response
    // to the ending action itself.
    const res = await fetch(new URL(`/tables/${TABLE_ID}/results`, baseUrl), { headers: { cookie: alice.cookie } });
    expect(res.status).toBe(200);
    const results = (await res.json()) as { userId: number; net: number }[];

    const aliceResult = results.find((r) => r.userId === alice.userId);
    const bobResult = results.find((r) => r.userId === bob.userId);
    expect(aliceResult).toBeDefined();
    expect(bobResult).toBeDefined();
    expect(aliceResult!.net + bobResult!.net).toBe(0); // one hand, play chips only: zero-sum
  });

  it(
    "7. timeout, check legal: auto-checked, and a subscribed peer receives it in real time",
    { timeout: TURN_TEST_TIMEOUT_MS, retry: SSE_FLAKE_RETRIES },
    async () => {
      const dealt = await startHand(alice.cookie);
      const firstActor = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
      // The second actor — whoever that turns out to be — is who this test
      // lets time out; known immediately, before anyone's acted.
      const toAct = firstActor === alice ? bob : alice;
      const watcher = firstActor; // the only other seat, so "another subscribed player"

      // Heads-up: the first preflop actor (the button) always faces the big
      // blind, so call it — the big blind still gets their "option" right
      // there in preflop (the betting round isn't over just because the
      // bet's matched), facing no further bet. Check is legal for them,
      // which is the case this test needs; no need for the flop.
      const postCall = await act(firstActor.cookie, "call");
      expect(postCall.hand!.street).toBe("PREFLOP");
      expect(postCall.hand!.actionTo).toBe(toAct.seatNo);
      expect(postCall.turnDeadline).not.toBeNull();

      // Deliberately a SHORT-lived SSE connection: open it only ~3s before
      // the deadline, not right after the call. An earlier version held the
      // connection open for the entire wait (up to the full default timeout)
      // and was observed, investigated at length, to have its underlying
      // stream end on its own well before the deadline for reasons traced
      // to this sandbox's handling of a long-lived connection on a process
      // that's already made several prior requests — not a product bug
      // (ruled out four independent ways: a plain `curl -N` held the
      // identical connection open 38+ seconds and got its push on time; two
      // real headless-Chromium sessions received pushes at ~20ms latency
      // over much longer sessions; the server's turn-timer logs confirmed
      // it firing within 10ms of schedule every time; and the drop
      // reproduced identically over raw node:http, ruling out the fetch
      // client specifically). A connection this short-lived never reaches
      // the window where that drop was observed to happen.
      const deadlineTime = new Date(postCall.turnDeadline!).getTime();
      const shortlyBeforeDeadlineMs = deadlineTime - Date.now() - 3000;
      if (shortlyBeforeDeadlineMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, shortlyBeforeDeadlineMs));
      }

      const sse = connectSse(watcher.cookie);
      try {
        // The first event (sent unconditionally on connect) must still show
        // toAct waiting, not yet auto-acted — otherwise the second
        // assertion below would be trivially satisfied by a stale/early
        // state rather than by an actual live push.
        const { view: beforeAuto } = await sse.nextView(() => true, 3000);
        expect(beforeAuto.hand!.actionTo).toBe(toAct.seatNo);
        expect(beforeAuto.lastAction?.seat).not.toBe(toAct.seatNo);

        // Do nothing as toAct; the auto-action must arrive as a live push
        // within ~1s of the deadline — still non-vacuous: if push is
        // broken, this next call has nothing else to fall back on and
        // genuinely times out (re-proved below by breaking push once more).
        const { view } = await sse.nextView(
          (v) => v.lastAction !== null && v.lastAction.seat === toAct.seatNo,
          5000,
        );
        expect(view.lastAction).toMatchObject({ seat: toAct.seatNo, type: "CHECK", auto: true });
        // "within ~1s of the deadline", measured against the deadline
        // itself — not against when this nextView call happened to start,
        // which (deliberately, see above) can be up to ~3s earlier.
        const receivedAtDelta = Date.now() - deadlineTime;
        expect(receivedAtDelta).toBeGreaterThanOrEqual(-500); // didn't fire early
        expect(receivedAtDelta).toBeLessThan(2000); // arrived promptly after
      } finally {
        sse.close();
      }
    },
  );

  it(
    "8. timeout facing a bet: auto-folded; a real action just before the deadline is not overridden",
    { timeout: TWO_TIMEOUTS_TEST_TIMEOUT_MS, retry: SSE_FLAKE_RETRIES },
    async () => {
      // Part A: facing a live bet (preflop, first action), doing nothing
      // gets you auto-folded, not auto-checked.
      const dealt = await startHand(alice.cookie);
      const firstActor = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
      await waitPastDeadline(dealt.turnDeadline);

      const afterTimeout = await getView(alice.cookie);
      expect(afterTimeout.lastAction).toMatchObject({ seat: firstActor.seatNo, type: "FOLD", auto: true });
      expect(afterTimeout.hand!.winners).not.toBeNull(); // heads-up fold ends the hand right away

      // Part B: a real action landing just before the deadline must not be
      // overridden by the timer. A fresh hand, same table.
      const dealt2 = await startHand(alice.cookie);
      const actor2 = dealt2.hand!.actionTo === alice.seatNo ? alice : bob;
      const deadline2 = new Date(dealt2.turnDeadline!).getTime();

      // Act with ~300ms of the deadline left. If the version guard
      // (src/poker/table.ts's writeTableStateIfVersionMatches) didn't hold,
      // a timer winning this race would make this call land on a stale
      // version and get rejected — act() throws on any non-2xx response, so
      // that failure mode fails this test right here, not silently.
      const msLeft = deadline2 - Date.now();
      if (msLeft > 300) await new Promise((resolve) => setTimeout(resolve, msLeft - 300));
      const result = await act(actor2.cookie, "call");

      expect(result.lastAction).toMatchObject({ seat: actor2.seatNo, type: "CALL", auto: false });
    },
  );
});

// docs/final-brief.md Step 2, cause 1: one browser profile (one cookie jar),
// two accounts. Kept outside the describe above so its beforeEach doesn't
// seat two extra players at the table this test needs to itself.
describe.skipIf(!isLocal)("one browser, two accounts (writes test data — local only)", () => {
  const seated: Player[] = [];

  afterEach(async () => {
    if (seated.length > 0) await cleanupTable(seated);
    seated.length = 0;
  });

  it("9. a POST from A's page carrying B's cookie gets a 409 identity_changed and changes nothing", async () => {
    const usernameA = randomUsername();
    const usernameB = randomUsername();

    // The jar's one session cookie, as it changes over the scenario.
    let jar = await register(usernameA);
    const sse = connectSse(jar);
    try {
      const { view: aFirstView } = await sse.nextView(() => true, 2000);
      const userIdA = aFirstView.you!;
      const sitA = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie: jar } });
      expect(sitA.status).toBe(200);
      const seatA = ((await sitA.json()) as TableView).seats.find((s) => s.userId === userIdA)!.seatNo;

      // Another window in the same browser: log out, register B (which signs
      // the jar in as B), sit B down.
      await fetch(new URL("/logout", baseUrl), { method: "POST", headers: { cookie: jar }, redirect: "manual" });
      jar = await register(usernameB);
      const sitB = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie: jar } });
      expect(sitB.status).toBe(200);
      const sitBView = (await sitB.json()) as TableView;
      const userIdB = sitBView.you!;
      const seatB = sitBView.seats.find((s) => s.userId === userIdB)!.seatNo;

      // Cleanup needs a live cookie for each seat; A's was ended by the logout.
      seated.push(
        { username: usernameA, userId: userIdA, cookie: await logIn(usernameA), seatNo: seatA },
        { username: usernameB, userId: userIdB, cookie: jar, seatNo: seatB },
      );

      // Get to A to act. Heads-up preflop, if B (the button) acts first, B's
      // call hands the action to A's big-blind option.
      let before = await startHand(jar);
      if (before.hand!.actionTo === seatB) before = await act(jar, "call");
      expect(before.hand!.actionTo).toBe(seatA);

      // A's page acts: it says it's A (as=), but the jar now holds B's cookie.
      const res = await fetch(new URL(`/tables/${TABLE_ID}/act`, baseUrl), {
        method: "POST",
        headers: { cookie: jar },
        body: new URLSearchParams({ type: "check", as: String(userIdA) }),
      });
      expect(res.status).toBe(409);
      const body = (await res.json()) as {
        error?: string;
        code?: string;
        nowSignedInAs?: { userId: number; displayName: string };
      };
      expect(body.code).toBe("identity_changed");
      expect(body.error).toBeTruthy();
      expect(body.nowSignedInAs?.userId).toBe(userIdB);

      // A number on both sides, so undefined === undefined can't pass this.
      const after = await getView(jar);
      expect(typeof before.version).toBe("number");
      expect(after.version).toBe(before.version);
      expect(after.hand).toEqual(before.hand);
    } finally {
      sse.close();
    }
  });
});

// Final brief Step 3: a stream the page can trust.
describe.skipIf(!isLocal)("a stream the page can trust (writes test data — local only)", () => {
  let alice: Player;
  let bob: Player;

  beforeEach(async () => {
    alice = await registerAndSit();
    bob = await registerAndSit();
  });

  afterEach(async () => {
    await cleanupTable([alice, bob]);
  });

  // The wait itself can legitimately run to SSE_HEARTBEAT_MS + 1 s, past
  // vitest's 5 s default, so the test's own timeout sits above that.
  it("10. B's stream receives a named ping within SSE_HEARTBEAT_MS + 1 s", { timeout: SSE_HEARTBEAT_MS + 5000 }, async () => {
    const sse = connectSse(bob.cookie);
    try {
      const first = await sse.nextEvent(2000);
      expect(first.event).toBe("view"); // the current view on connect
      const openedAt = first.at;
      let event = await sse.nextEvent(SSE_HEARTBEAT_MS + 1000);
      while (event.event !== "ping") event = await sse.nextEvent(openedAt + SSE_HEARTBEAT_MS + 1000 - Date.now());
      expect(event.at - openedAt).toBeLessThanOrEqual(SSE_HEARTBEAT_MS + 1000);
      const data = JSON.parse(event.data) as { seq: number };
      expect(Number.isInteger(data.seq)).toBe(true);
    } finally {
      sse.close();
    }
  });

  it("11. views carry a seq that strictly increases across A's sit, start and act", async () => {
    // registerAndSit already sat both; stand A up to take the sit again here.
    await leaveTable(alice.cookie);
    const seqs: number[] = [];
    const bootIds = new Set<string>();
    const record = (v: TableView): TableView => {
      seqs.push(v.seq);
      bootIds.add(v.bootId);
      return v;
    };

    record(await getView(alice.cookie));
    const sitRes = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie: alice.cookie } });
    const sat = record((await sitRes.json()) as TableView);
    alice.seatNo = sat.seats.find((s) => s.userId === alice.userId)!.seatNo;
    const dealt = record(await startHand(alice.cookie));
    const actor = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
    record(await act(actor.cookie, "call"));

    expect(seqs.every(Number.isInteger)).toBe(true);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
    expect(bootIds.size).toBe(1); // one process throughout, so seq order is meaningful
  });
});

// Final brief Step 4: ghost seats. A seated player with no open stream for
// AWAY_GRACE_MS is away; an away player's turn waits AWAY_TURN_SECONDS, not
// TURN_TIMEOUT_SECONDS; AWAY_STAND_TIMEOUTS timeouts in a row stand them up
// when the hand ends. Every deadline here is read from the view and measured
// against the clock, never assumed. The numbers come from src/poker/live.ts,
// so a run that shortens one through env has to set it for the app and for
// `pnpm check` alike.
//
// Who gets the button is the engine's choice, not this file's, so each test
// branches on the view's actionTo rather than on seat numbers.
describe.skipIf(!isLocal)("ghost seats (writes test data — local only)", () => {
  const seated: Player[] = [];
  const streams: SseConnection[] = [];

  // A user's away state also counts BOOT_GRACE_MS from the app's start, which
  // this file can't see. Waiting for the view to say `away` (rather than a
  // fixed sleep) covers both graces; the cap lets a build without presence
  // carry on to the assertion that names what's wrong, instead of failing on
  // a wait.
  const AWAY_WAIT_CAP_MS = AWAY_GRACE_MS + BOOT_GRACE_MS + 2000;
  const AWAY_DEADLINE_MAX_MS = AWAY_TURN_SECONDS * 1000 + 1000;
  // Generous enough for a build without presence, where every ghost turn
  // runs the full TURN_TIMEOUT_SECONDS before the assertion can fail.
  const GHOST_TEST_TIMEOUT_MS = AWAY_WAIT_CAP_MS + 4 * TURN_TIMEOUT_SECONDS * 1000 + 20_000;
  // Test 3 plays two hands. Each of the ghost's turns can wait for them to go
  // away and then for a short turn, or, on a build without presence, run the
  // full TURN_TIMEOUT_SECONDS.
  const GHOST_TAKES_N_TIMEOUTS_MS =
    2 * AWAY_STAND_TIMEOUTS * (AWAY_WAIT_CAP_MS + TURN_TIMEOUT_SECONDS * 1000) + 30_000;

  function holdStream(p: Player): SseConnection {
    const s = connectSse(p.cookie);
    streams.push(s);
    return s;
  }

  async function sitNew(): Promise<Player> {
    const p = await registerAndSit();
    seated.push(p);
    return p;
  }

  function seatOf(view: TableView, p: Player): SeatView | undefined {
    return view.seats.find((s) => s.userId === p.userId);
  }

  async function waitUntilAway(watcher: Player, ghost: Player): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < AWAY_WAIT_CAP_MS) {
      if (seatOf(await getView(watcher.cookie), ghost)?.away === true) return;
      await sleep(250);
    }
  }

  // Waits for the server's turn timer to act for whoever is to act now.
  async function waitForTimeout(watcher: Player, view: TableView): Promise<TableView> {
    const version = view.version;
    await waitPastDeadline(view.turnDeadline, 300);
    for (let i = 0; i < 40; i++) {
      const now = await getView(watcher.cookie);
      if (now.version !== version) return now;
      await sleep(250);
    }
    throw new Error("the turn timer didn't act");
  }

  function msUntil(deadline: string | null): number {
    if (!deadline) throw new Error("no turn_deadline");
    return new Date(deadline).getTime() - Date.now();
  }

  // A stranger's POST starts the hand, so no seated player's presence comes
  // from having just posted.
  async function startAsStranger(): Promise<TableView> {
    return startHand(await register(randomUsername()));
  }

  beforeAll(() => {
    // The tests below can't tell an away deadline from a full one otherwise.
    expect(TURN_TIMEOUT_SECONDS).toBeGreaterThan(AWAY_TURN_SECONDS + 1);
  });

  afterEach(async () => {
    for (const s of streams) s.close();
    streams.length = 0;
    if (seated.length > 0) await cleanupTable(seated);
    seated.length = 0;
  });

  it(
    "1. a seated player whose stream is closed gets a deadline at most AWAY_TURN_SECONDS + 1 s away",
    { timeout: GHOST_TEST_TIMEOUT_MS },
    async () => {
      const alice = await sitNew();
      const ghost = await sitNew(); // never opens a stream
      holdStream(alice);

      const dealt = await startHand(alice.cookie);
      await waitUntilAway(alice, ghost);

      let ghostTurn: TableView;
      if (dealt.hand!.actionTo === ghost.seatNo) {
        // The turn began while the ghost was still present (they'd just sat
        // down); going away mid-turn pulls the deadline in.
        ghostTurn = await getView(alice.cookie);
      } else {
        // Heads-up preflop, the first actor faces the big blind, so call is
        // legal; it hands the action to the ghost.
        ghostTurn = await act(alice.cookie, "call");
      }
      expect(ghostTurn.hand!.actionTo).toBe(ghost.seatNo);
      expect(msUntil(ghostTurn.turnDeadline)).toBeLessThanOrEqual(AWAY_DEADLINE_MAX_MS);
      expect(seatOf(ghostTurn, ghost)?.away).toBe(true);
    },
  );

  it(
    "2. a present player (stream open) still gets the full timeout",
    { timeout: AWAY_GRACE_MS + 15_000 },
    async () => {
      const alice = await sitNew();
      const bob = await sitNew();
      holdStream(alice);
      holdStream(bob);
      // Past the grace since either last posted, so only the streams keep
      // them present.
      await sleep(AWAY_GRACE_MS + 1000);

      const dealt = await startAsStranger();
      const first = dealt.hand!.actionTo === alice.seatNo ? alice : bob;
      expect(msUntil(dealt.turnDeadline)).toBeGreaterThan(TURN_TIMEOUT_SECONDS * 1000 - 1000);
      expect(seatOf(dealt, first)?.away).toBe(false);
      expect(seatOf(dealt, first === alice ? bob : alice)?.away).toBe(false);
    },
  );

  it(
    "3. a player who times out AWAY_STAND_TIMEOUTS times in a row is no longer seated after that hand ends",
    { timeout: GHOST_TAKES_N_TIMEOUTS_MS },
    async () => {
      const alice = await sitNew();
      const ghost = await sitNew();
      holdStream(alice);

      // Plays the current hand with the ghost only ever timing out, until
      // they have exactly `target` timeouts in a row. Before the last one,
      // alice puts chips in (a raise if she owes, a bet if not), so the
      // ghost faces a wager and that timeout is a fold that ends the hand.
      // If a timeout hands alice the action at `target`, she folds.
      let timeouts = 0;
      async function playUntil(start: TableView, target: number): Promise<TableView> {
        let view = start;
        for (let guard = 0; guard < 12 && view.hand!.winners === null; guard++) {
          if (view.hand!.actionTo === ghost.seatNo) {
            // Once the ghost is away, their turn is short, however it began.
            // `away` is asserted, not only the time left: waitUntilAway gives
            // up after a cap, and on a build without presence that wait alone
            // can eat a full turn down to "under AWAY_TURN_SECONDS left".
            await waitUntilAway(alice, ghost);
            const turn = await getView(alice.cookie);
            expect(turn.hand!.actionTo).toBe(ghost.seatNo);
            expect(seatOf(turn, ghost)?.away).toBe(true);
            expect(msUntil(turn.turnDeadline)).toBeLessThanOrEqual(AWAY_DEADLINE_MAX_MS);
            view = await waitForTimeout(alice, turn);
            expect(view.lastAction).toMatchObject({ seat: ghost.seatNo, auto: true });
            timeouts++;
            continue;
          }
          const me = view.hand!.players[alice.seatNo]!;
          const owed = Math.max(...view.hand!.players.map((p) => p?.betThisStreet ?? 0)) - me.betThisStreet;
          const bigBlind = view.table.big_blind;
          if (timeouts >= target) view = await act(alice.cookie, "fold");
          else if (timeouts === target - 1 && owed > 0)
            view = await act(alice.cookie, "raise", me.betThisStreet + owed + bigBlind);
          else if (timeouts === target - 1) view = await act(alice.cookie, "bet", bigBlind);
          else if (owed > 0) view = await act(alice.cookie, "call");
          else view = await act(alice.cookie, "check");
        }
        expect(view.hand!.winners).not.toBeNull();
        return view;
      }

      // A fresh engine per hand puts the button on the lowest occupied seat
      // (@pokertools/engine's moveButton), and alice sat first at an empty
      // table, so she acts first preflop and the ghost, as big blind, gets
      // the option and then acts first on every later street. If the ghost
      // were first preflop, their first timeout would be a fold that ends
      // the hand after one.
      const dealt = await startHand(alice.cookie);
      expect(dealt.hand!.actionTo).toBe(alice.seatNo);

      // One short of the rule: the hand ends with the ghost still seated.
      // This is what keeps the threshold honest. A rule that stood players
      // up any earlier goes red here.
      await playUntil(dealt, AWAY_STAND_TIMEOUTS - 1);
      expect(timeouts).toBe(AWAY_STAND_TIMEOUTS - 1);
      expect(seatOf(await getView(alice.cookie), ghost)).toBeDefined();

      // The phone comes back to the foreground for the deal (a deal only
      // deals in present players), then goes to the background again. The
      // count carries over: none of those were real actions.
      const back = connectSse(ghost.cookie);
      await back.nextView(() => true, 2000);
      const dealt2 = await startHand(alice.cookie);
      back.close();
      expect(seatOf(dealt2, ghost)).toBeDefined();
      // Exactly: so a rule that waited for one more timeout goes red here.
      await playUntil(dealt2, AWAY_STAND_TIMEOUTS);
      expect(timeouts).toBe(AWAY_STAND_TIMEOUTS);

      const after = await getView(alice.cookie);
      expect(after.hand!.winners).not.toBeNull();
      expect(seatOf(after, ghost)).toBeUndefined();
      expect(after.notice?.players.map((p) => p.userId)).toContain(ghost.userId);
    },
  );

  it(
    "4. closing and reopening a stream within the grace period doesn't mark the player away",
    { timeout: AWAY_GRACE_MS * 2 + 15_000 },
    async () => {
      const alice = await sitNew();
      const bob = await sitNew();
      holdStream(alice);

      const first = connectSse(bob.cookie);
      await first.nextView(() => true, 2000);
      first.close();
      const closedAt = Date.now();
      await sleep(AWAY_GRACE_MS / 2);
      const second = holdStream(bob);
      await second.nextView(() => true, 2000);
      // Past the grace measured from the close, so a reopen that didn't count
      // would show here.
      await sleep(closedAt + AWAY_GRACE_MS + 1500 - Date.now());

      const before = await getView(alice.cookie);
      expect(seatOf(before, bob)?.away).toBe(false);

      // bob's own turn still gets the full timeout.
      let bobTurn = await startAsStranger();
      if (bobTurn.hand!.actionTo !== bob.seatNo) bobTurn = await act(alice.cookie, "call");
      expect(bobTurn.hand!.actionTo).toBe(bob.seatNo);
      expect(msUntil(bobTurn.turnDeadline)).toBeGreaterThan(TURN_TIMEOUT_SECONDS * 1000 - 1000);
    },
  );
});

// Final brief Step 7: the table page, rebuilt from the mockup. These read the
// page the way a player would, from the parsed DOM of GET /tables/1, and check
// what it means against the JSON view the same server returns. They live in
// this file, not their own, because vitest runs test files in parallel and
// every test that plays a hand shares table 1.
describe.skipIf(!isLocal)("table page (writes test data — local only)", () => {
  let players: Player[] = [];

  afterEach(async () => {
    await cleanupTable(players);
    players = [];
  });

  async function tablePage(cookie: string): Promise<Document> {
    const res = await fetch(new URL(`/tables/${TABLE_ID}`, baseUrl), { headers: { cookie } });
    return new JSDOM(await res.text()).window.document;
  }

  const potOf = (view: TableView): number =>
    view.hand!.pots.reduce((sum, p) => sum + p.amount, 0) +
    Object.values(view.hand!.currentBets).reduce((sum, n) => sum + n, 0);

  it("12. the pot shown preflop counts the blinds in front of players", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const view = await startHand(players[0].cookie);
    const doc = await tablePage(players[0].cookie);
    const shown = Number(doc.querySelector("[data-pot]")!.getAttribute("data-pot"));
    expect(potOf(view)).toBeGreaterThan(0); // the blinds are posted, none settled yet
    expect(shown).toBe(potOf(view));
  });

  it("13. Call N is what you owe, and the amount the dock offers is a raise-to the engine accepts as-is", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const started = await startHand(players[0].cookie);
    const actor = players.find((p) => p.seatNo === started.hand!.actionTo)!;
    const doc = await tablePage(actor.cookie);

    // What you owe, from the view: the highest bet in front minus yours.
    const me = started.hand!.players[actor.seatNo]!;
    const owed = Math.max(...Object.values(started.hand!.currentBets)) - me.betThisStreet;
    const call = doc.querySelector<HTMLButtonElement>('#action-form button[value="call"]')!;
    expect(Number(call.dataset.amount)).toBe(owed);
    // Fold and Check/Call submit without the browser checking the amount box's
    // min/max, so a half-typed raise can't block them.
    for (const value of ["fold", "call"]) {
      expect(doc.querySelector<HTMLButtonElement>(`#action-form button[value="${value}"]`)!.formNoValidate).toBe(true);
    }

    // The engine reads RAISE amounts as raise-to totals
    // (@pokertools/engine actions/validation.js: "RAISE amounts are raise-to
    // totals"), and its minRaise is one. The page posts the box's number
    // unchanged, so sending that number must leave this player's bet at
    // exactly it, not at it plus what they owed.
    const offered = Number(doc.querySelector<HTMLInputElement>("#action-form input[name=amount]")!.value);
    expect(offered).toBe(started.hand!.minRaise);
    const after = await act(actor.cookie, "raise", offered);
    expect(after.hand!.players[actor.seatNo]!.betThisStreet).toBe(offered);
  });

  it("14. the first paint is the served renderer's output for the same view", async () => {
    // One renderer for both (src/poker/render.js): the server's first paint
    // and what the served module renders from the embedded view must match,
    // so the file the browser imports can't drift from the one the server
    // runs. It runs that module in Node, so it can't see a branch inside it
    // on `window`; render.js stays pure (no environment reads) for that.
    players = [await registerAndSit(), await registerAndSit()];
    await startHand(players[0].cookie);
    const doc = await tablePage(players[0].cookie);
    const view = JSON.parse(doc.getElementById("table-view")!.textContent!);
    const src = doc.querySelector('script[type="module"]')!.textContent!;
    const rendererPath = /from "([^"]+)"/.exec(src)![1];
    const rendererJs = await (await fetch(new URL(rendererPath, baseUrl))).text();
    const { renderTable } = await import(`data:text/javascript,${encodeURIComponent(rendererJs)}`);

    // Compare as parsed DOM, with the clocks (the only time-dependent parts)
    // taken out: the ring's share, the seconds left and the next hand's
    // countdown move between the server's render and this one.
    const normalise = (root: Element): string => {
      root.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
      root.querySelectorAll("[data-clock], [data-next-hand]").forEach((el) => (el.textContent = ""));
      return root.innerHTML;
    };
    const fresh = new JSDOM(`<div id="r">${renderTable(view, Date.now())}</div>`).window.document.getElementById("r")!;
    expect(normalise(fresh)).toBe(normalise(doc.getElementById("table-root")!));
  });

  it("15. you sit in the bottom slot, and data-seat stays your real seat", async () => {
    players = [await registerAndSit(), await registerAndSit(), await registerAndSit()];
    for (const p of players) {
      const doc = await tablePage(p.cookie);
      const mine = doc.querySelector(".seat.you")!;
      expect(mine.classList.contains("s0")).toBe(true);
      expect(Number(mine.getAttribute("data-seat"))).toBe(p.seatNo);
      // Every real seat appears once, each in a different slot.
      const slots = [...doc.querySelectorAll(".seat")].map((el) => [...el.classList].find((c) => /^s\d$/.test(c)));
      expect(new Set(slots).size).toBe(slots.length);
    }
  });

  it("16. Sit, Leave and Deal are offered only when legal", async () => {
    const shownForms = (doc: Document): string[] =>
      ["sit-form", "leave-form", "start-form"].filter((id) => !doc.getElementById(id)!.hasAttribute("hidden"));

    const alice = await registerAndSit();
    players = [alice];
    expect(shownForms(await tablePage(alice.cookie))).toEqual(["leave-form"]); // alone: can't deal

    const bob = await registerAndSit();
    players = [alice, bob];
    expect(shownForms(await tablePage(alice.cookie))).toEqual(["leave-form", "start-form"]);

    await startHand(alice.cookie);
    expect(shownForms(await tablePage(alice.cookie))).toEqual([]); // mid-hand: no leave, no deal

    // A watcher (signed in, not seated) can sit while a seat is open.
    const watcher = await register(randomUsername());
    expect(shownForms(await tablePage(watcher))).toContain("sit-form");
  });

  it("17. Results lists each player's net as the sum of their hand_results rows", async () => {
    const alice = await registerAndSit();
    const bob = await registerAndSit();
    players = [alice, bob];
    // Two hands that end in a fold, so both players have rows that differ.
    for (let hand = 0; hand < 2; hand++) {
      const view = await startHand(alice.cookie);
      const actor = players.find((p) => p.seatNo === view.hand!.actionTo)!;
      await act(actor.cookie, "fold");
    }

    const rows = (await (
      await fetch(new URL(`/tables/${TABLE_ID}/results`, baseUrl), { headers: { cookie: alice.cookie } })
    ).json()) as { userId: number; net: number }[];
    const res = await fetch(new URL("/results", baseUrl), { headers: { cookie: alice.cookie } });
    expect(res.status).toBe(200);
    const doc = new JSDOM(await res.text()).window.document;

    for (const p of [alice, bob]) {
      const mine = rows.filter((r) => r.userId === p.userId);
      expect(mine.length).toBe(2);
      const row = doc.querySelector(`#ledger tr[data-user-id="${p.userId}"]`)!;
      const net = mine.reduce((sum, r) => sum + r.net, 0);
      const cell = row.querySelector("[data-net]")!;
      expect(Number(cell.getAttribute("data-net"))).toBe(net);
      // And the number people read: the signed text parsed back, minus sign
      // (U+2212) and thousands separators included.
      expect(Number(cell.textContent!.replace("\u2212", "-").replace(/[,+]/g, ""))).toBe(net);
      expect(Number(row.querySelector("[data-hands]")!.getAttribute("data-hands"))).toBe(mine.length);
    }
    // Sorted by net, best first.
    const nets = [...doc.querySelectorAll("#ledger [data-net]")].map((el) => Number(el.getAttribute("data-net")));
    expect(nets).toEqual([...nets].sort((a, b) => b - a));
  });

  it("18. Results is signed-in only", async () => {
    players = [await registerAndSit()];
    const res = await fetch(new URL("/results", baseUrl), { redirect: "manual" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/login");
  });

  it("19. once everyone stands up, a newcomer sees an empty table, not the last showdown", async () => {
    const alice = await registerAndSit();
    const bob = await registerAndSit();
    players = [alice, bob];
    const view = await startHand(alice.cookie);
    await act(players.find((p) => p.seatNo === view.hand!.actionTo)!.cookie, "fold");
    // While seated, the finished hand stays on the felt: its last action shows.
    expect(await getView(alice.cookie).then((v) => v.hand!.winners)).not.toBeNull();
    await leaveTable(alice.cookie);
    await leaveTable(bob.cookie);

    const newcomer = await register(randomUsername());
    const doc = await tablePage(newcomer);
    expect(doc.querySelectorAll(".board .card:not(.slot)").length).toBe(0);
    expect(doc.querySelector(".said")).toBeNull();
    expect(doc.querySelector("[data-pot]")).toBeNull();
  });
});

// Brief 2 Step 10: showdown for everyone, and no dead time. Every hand that
// reaches a showdown is tabled for every viewer alike; folded hands are never
// shown to anyone else; a fold-out is not a showdown. A finished hand deals
// the next one by itself after SHOWDOWN_PAUSE_MS when two seated players are
// present. In this file because every test here plays on table 1.
describe.skipIf(!isLocal)("showdown for everyone, and no dead time (writes test data — local only)", () => {
  let players: Player[] = [];
  const streams: SseConnection[] = [];

  afterEach(async () => {
    for (const s of streams) s.close();
    streams.length = 0;
    await cleanupTable(players);
    players = [];
  });

  function holdStream(p: Player): SseConnection {
    const s = connectSse(p.cookie);
    streams.push(s);
    return s;
  }

  // A hand is fully visible in a view only if it holds two real cards.
  function isVisible(hand: HandPlayer["hand"] | undefined): boolean {
    return Array.isArray(hand) && hand.length === 2 && hand.every((c) => typeof c === "string");
  }

  // The (seatNo, hand) pairs a viewer can see, as sorted "seat:card,card"
  // keys, so two viewers' sets compare with toEqual.
  function visibleSet(view: TableView): string[] {
    const out: string[] = [];
    for (const p of view.hand!.players) if (p && isVisible(p.hand)) out.push(`${p.seat}:${p.hand!.join(",")}`);
    return out.sort();
  }

  // Plays the current hand to its end. `decide` picks each actor's move;
  // "pass" is check if nothing is owed, otherwise call.
  async function playOut(
    start: TableView,
    decide: (actor: Player, view: TableView) => "fold" | "pass" = () => "pass",
  ): Promise<TableView> {
    let view = start;
    for (let guard = 0; guard < 40 && view.hand!.winners === null; guard++) {
      const actor = players.find((p) => p.seatNo === view.hand!.actionTo);
      if (!actor) throw new Error(`seat ${view.hand!.actionTo} is to act but isn't one of this test's players`);
      if (decide(actor, view) === "fold") {
        view = await act(actor.cookie, "fold");
        continue;
      }
      const me = view.hand!.players[actor.seatNo]!;
      const owed = Math.max(...view.hand!.players.map((p) => p?.betThisStreet ?? 0)) - me.betThisStreet;
      view = await act(actor.cookie, owed > 0 ? "call" : "check");
    }
    expect(view.hand!.winners).not.toBeNull();
    return view;
  }

  // Every viewer's view of the hand that just ended: the seated players and
  // one signed-in spectator. Read before the next hand deals itself; each is
  // checked to still be that hand.
  async function viewsOf(handId: string, spectator: string): Promise<{ viewer: string; view: TableView }[]> {
    const cookies = [...players.map((p) => ({ viewer: p.username, cookie: p.cookie })), { viewer: "spectator", cookie: spectator }];
    const out = [];
    for (const { viewer, cookie } of cookies) {
      const view = await getView(cookie);
      expect(view.hand!.handId, `${viewer}'s view moved on to another hand before it was read`).toBe(handId);
      out.push({ viewer, view });
    }
    return out;
  }

  async function threeSeatedAndASpectator(): Promise<string> {
    players = [await registerAndSit(), await registerAndSit(), await registerAndSit()];
    return register(randomUsername());
  }

  it("20. symmetry: after a showdown every viewer, seated or spectating, sees the same tabled hands", async () => {
    const spectator = await threeSeatedAndASpectator();
    // A split pot between all three is shown to everyone by the engine anyway
    // (every winner shows), so it can't tell a fix from no fix: deal again.
    // Seen once on 4 Nov, as a run where this test passed before the fix.
    let ended = await playOut(await startHand(players[0].cookie));
    for (let tries = 0; ended.hand!.winners!.length === players.length && tries < 5; tries++) {
      ended = await playOut(await startHand(players[0].cookie));
    }
    expect(ended.hand!.winners!.length).toBeLessThan(players.length);
    const views = await viewsOf(ended.hand!.handId, spectator);
    const expected = visibleSet(views[0].view);
    // Nobody folded, so all three hands are live and all three are tabled.
    expect(expected).toHaveLength(3);
    for (const { viewer, view } of views) expect(visibleSet(view), viewer).toEqual(expected);
  });

  it("21. a hand folded preflop stays hidden from everyone else; the two that reach showdown are shown to all", async () => {
    const spectator = await threeSeatedAndASpectator();
    // The first to act preflop folds; the other two check or call it down. A
    // split between those two is shown to all by the engine anyway, so it
    // can't tell a fix from no fix (as in test 20): deal again.
    let folder: Player;
    let ended: TableView;
    for (let tries = 0; ; tries++) {
      const dealt = await startHand(players[0].cookie);
      const first = players.find((p) => p.seatNo === dealt.hand!.actionTo)!;
      let folded = false;
      ended = await playOut(dealt, (actor) => {
        if (actor !== first || folded) return "pass";
        folded = true;
        return "fold";
      });
      expect(folded).toBe(true);
      folder = first;
      if (ended.hand!.winners!.length < 2 || tries >= 5) break;
    }
    expect(ended.hand!.winners!.length).toBe(1);
    const live = players.filter((p) => p !== folder).map((p) => p.seatNo);
    for (const { viewer, view } of await viewsOf(ended.hand!.handId, spectator)) {
      // The folder's own view still holds their own cards, as it always has;
      // the rule is that nobody else's does.
      if (viewer !== folder.username) expect(isVisible(view.hand!.players[folder.seatNo]!.hand), viewer).toBe(false);
      for (const seat of live) expect(isVisible(view.hand!.players[seat]!.hand), `${viewer}, seat ${seat}`).toBe(true);
    }
  });

  it("22. a fold-out is not a showdown: the winner's cards stay hidden from every other viewer", async () => {
    const spectator = await threeSeatedAndASpectator();
    const ended = await playOut(await startHand(players[0].cookie), () => "fold");
    const winners = ended.hand!.winners!;
    expect(winners).toHaveLength(1);
    const winner = players.find((p) => p.seatNo === winners[0].seat)!;
    for (const { viewer, view } of await viewsOf(ended.hand!.handId, spectator)) {
      if (viewer === winner.username) continue;
      expect(isVisible(view.hand!.players[winner.seatNo]!.hand), viewer).toBe(false);
    }
  });

  it("23. the result is in the view: seat, amount and handRank per winner; handRank null after a fold-out", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const showdown = await playOut(await startHand(players[0].cookie));
    for (const w of showdown.hand!.winners!) {
      expect(players.map((p) => p.seatNo)).toContain(w.seat);
      expect(w.amount).toBeGreaterThan(0);
      expect(typeof w.handRank).toBe("string");
      expect(w.handRank!.length).toBeGreaterThan(0);
    }
    // And the prompt names it: the table page's prompt carries the rank it
    // shows, for every viewer.
    for (const p of players) {
      const res = await fetch(new URL(`/tables/${TABLE_ID}`, baseUrl), { headers: { cookie: p.cookie } });
      const doc = new JSDOM(await res.text()).window.document;
      const ranks = [...doc.querySelectorAll("[data-prompt] [data-hand-rank]")].map((el) => el.getAttribute("data-hand-rank"));
      expect(new Set(ranks)).toEqual(new Set(showdown.hand!.winners!.map((w) => w.handRank)));
    }

    const foldOut = await playOut(await startHand(players[0].cookie), () => "fold");
    expect(foldOut.hand!.winners!.map((w) => w.handRank)).toEqual([null]);
  });

  it(
    "24. auto-deal: two present players get a new hand within SHOWDOWN_PAUSE_MS, with no POST to /start",
    { timeout: SHOWDOWN_PAUSE_MS + 15_000 },
    async () => {
      players = [await registerAndSit(), await registerAndSit()];
      for (const p of players) holdStream(p);
      const ended = await playOut(await startHand(players[0].cookie), () => "fold");
      const endedAt = Date.now();
      // The view says when, from the server's clock.
      expect(ended.nextHandAt).toBeTruthy();
      const nextAt = new Date(ended.nextHandAt!).getTime();
      expect(Math.abs(nextAt - endedAt - SHOWDOWN_PAUSE_MS)).toBeLessThan(1000);

      let next: TableView | undefined;
      while (Date.now() - endedAt < SHOWDOWN_PAUSE_MS + 2000) {
        const view = await getView(players[0].cookie);
        if (view.hand!.handId !== ended.hand!.handId) {
          next = view;
          break;
        }
        await sleep(100);
      }
      expect(next, "no new hand was dealt").toBeDefined();
      expect(Date.now() - endedAt).toBeGreaterThanOrEqual(SHOWDOWN_PAUSE_MS - 500); // not early
      expect(next!.hand!.winners).toBeNull();
      expect(next!.nextHandAt).toBeNull();
    },
  );

  it(
    "25. no auto-deal with one present and one away",
    { timeout: AWAY_GRACE_MS + BOOT_GRACE_MS + 2 * TURN_TIMEOUT_SECONDS * 1000 + SHOWDOWN_PAUSE_MS + 20_000 },
    async () => {
      players = [await registerAndSit(), await registerAndSit()];
      const [alice, bob] = players;
      holdStream(alice);
      const bobStream = connectSse(bob.cookie);
      let view = await startHand(alice.cookie);
      // Bob's call (a POST) would count as being here, so it comes first.
      if (view.hand!.actionTo === bob.seatNo) view = await act(bob.cookie, "call");
      bobStream.close();
      const start = Date.now();
      while (Date.now() - start < AWAY_GRACE_MS + BOOT_GRACE_MS + 2000) {
        view = await getView(alice.cookie);
        if (view.seats.find((s) => s.userId === bob.userId)?.away) break;
        await sleep(250);
      }
      expect(view.seats.find((s) => s.userId === bob.userId)?.away).toBe(true);

      // End the hand: alice folds on her turn; bob's turns time out.
      for (let guard = 0; guard < 20; guard++) {
        view = await getView(alice.cookie);
        if (view.hand!.winners !== null) break;
        if (view.hand!.actionTo === alice.seatNo) await act(alice.cookie, "fold").catch(() => undefined);
        else await sleep(500);
      }
      expect(view.hand!.winners).not.toBeNull();
      expect(view.nextHandAt ?? null).toBeNull();
      await sleep(SHOWDOWN_PAUSE_MS + 1500);
      const after = await getView(alice.cookie);
      expect(after.hand!.handId).toBe(view.hand!.handId);
      // "Otherwise Deal next hand as today": the auto-deal stands nobody up,
      // so bob, away but within the owner's 5 timeouts / 5 minutes, keeps his
      // seat. (A manual deal would stand him up first, as Step 4 set.)
      expect(after.seats.find((s) => s.userId === bob.userId)).toBeDefined();
    },
  );

  it(
    "26. a manual deal during the pause starts exactly one hand, and the countdown restarts from its end",
    { timeout: 4 * SHOWDOWN_PAUSE_MS + 20_000 },
    async () => {
      players = [await registerAndSit(), await registerAndSit()];
      for (const p of players) holdStream(p);

      // Part A: a manual hand that ends quickly. The timer armed for the
      // first hand would deal at firstPauseEnds; the second hand's own pause
      // runs a full SHOWDOWN_PAUSE_MS after that, so 300 ms past the first
      // pause's end the second hand must still be on the felt, finished.
      const first = await playOut(await startHand(players[0].cookie), () => "fold");
      const firstPauseEnds = new Date(first.nextHandAt!).getTime();
      await sleep(SHOWDOWN_PAUSE_MS / 2);
      const second = await playOut(await startHand(players[0].cookie), () => "fold");
      const secondEnd = Date.now();
      expect(Math.abs(new Date(second.nextHandAt!).getTime() - secondEnd - SHOWDOWN_PAUSE_MS)).toBeLessThan(1000);
      await sleep(firstPauseEnds + 300 - Date.now());
      const afterFirstPause = await getView(players[0].cookie);
      expect(afterFirstPause.hand!.handId).toBe(second.hand!.handId);
      expect(afterFirstPause.hand!.winners).not.toBeNull();

      // Part B: a manual hand still running when its predecessor's pause
      // would have ended. Nothing is dealt on top of it, nothing is written,
      // and no countdown shows while it runs.
      const secondPauseEnds = new Date(second.nextHandAt!).getTime();
      await sleep(SHOWDOWN_PAUSE_MS / 4);
      const manual = await startHand(players[0].cookie);
      expect(manual.nextHandAt).toBeNull();
      await sleep(secondPauseEnds + 1000 - Date.now());
      const during = await getView(players[0].cookie);
      expect(during.hand!.handId).toBe(manual.hand!.handId);
      expect(during.hand!.winners).toBeNull();
      expect(during.version).toBe(manual.version);
      expect(during.nextHandAt).toBeNull();
    },
  );

  it("27. a fresh turn lasts TURN_TIMEOUT_SECONDS", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const dealt = await startHand(players[0].cookie);
    expect(dealt.turnSeconds).toBe(TURN_TIMEOUT_SECONDS);
  });
});

// Brief 2 step 10b (owner, 4 Nov): a hand that ends straight from the deal
// settles like any other, and a player left with 0 chips at hand end is stood
// up with a notice. Here because every test plays on table 1.
describe.skipIf(!isLocal)("settling every hand, and busting out (writes test data — local only)", () => {
  let players: Player[] = [];

  afterEach(async () => {
    await cleanupTable(players);
    players = [];
  });

  // Sets seated stacks directly, between hands. The route exists only when
  // the app runs with TEST_HOOKS=1 and NODE_ENV isn't production (see
  // src/server.ts); the Docker image sets NODE_ENV=production, so CI never
  // has it. Set TEST_HOOKS=1 for `pnpm check` too (src/poker/live.ts): then a
  // missing route is a failure, not a skip, so a run that meant to cover
  // these tests can't pass by skipping them.
  async function setStacks(stacks: Record<number, number>): Promise<void> {
    const res = await fetch(new URL(`/test-hooks/tables/${TABLE_ID}/stacks`, baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stacks),
    });
    if (!res.ok) throw new Error(`setStacks failed: ${res.status} (is the app running with TEST_HOOKS=1?)`);
  }
  const hooks = process.env.TEST_HOOKS === "1";

  async function resultsFor(cookie: string): Promise<{ userId: number; net: number; endedAt: string }[]> {
    const res = await fetch(new URL(`/tables/${TABLE_ID}/results`, baseUrl), { headers: { cookie } });
    return res.json();
  }

  it.skipIf(!hooks)("28. a hand that ends straight from the deal records results and stacks, and conserves chips", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const [alice, bob] = players;
    // Both blinds all in: 5 and 10 at blinds 5/10. Whichever seat is the
    // button posts the small blind heads-up, so give both seats a stack no
    // bigger than its blind either way round.
    await setStacks({ [alice.userId]: 5, [bob.userId]: 5 });
    const before = await getView(alice.cookie);
    const totalBefore = before.seats.reduce((sum, s) => sum + s.stack, 0);
    expect(totalBefore).toBe(10);
    const rowsBefore = (await resultsFor(alice.cookie)).length;

    const dealt = await startHand(alice.cookie);
    expect(dealt.hand!.winners).not.toBeNull(); // over before anyone acts

    const after = await getView(alice.cookie);
    const rows = (await resultsFor(alice.cookie)).slice(rowsBefore);
    // One row per player, one shared ended_at, nets summing to 0.
    expect(rows.map((r) => r.userId).sort()).toEqual([alice.userId, bob.userId].sort());
    expect(new Set(rows.map((r) => r.endedAt)).size).toBe(1);
    expect(rows.reduce((sum, r) => sum + r.net, 0)).toBe(0);
    // Stacks written back: what's seated now (a buster stands up with 0, so
    // count them as 0) sums to what went in, and matches each net.
    const stackNow = (userId: number) => after.seats.find((s) => s.userId === userId)?.stack ?? 0;
    expect(stackNow(alice.userId) + stackNow(bob.userId)).toBe(totalBefore);
    for (const p of players) {
      expect(stackNow(p.userId)).toBe(5 + rows.find((r) => r.userId === p.userId)!.net);
    }
  });

  // Plays all-in hands (raise to everything, call) until someone has 0. A
  // split pot leaves both with chips, so it deals again.
  async function bustSomeone(): Promise<{ loser: Player; winner: Player; ended: TableView }> {
    for (let tries = 0; tries < 6; tries++) {
      let view = await startHand(players[0].cookie);
      for (let guard = 0; guard < 6 && view.hand!.winners === null; guard++) {
        const actor = players.find((p) => p.seatNo === view.hand!.actionTo)!;
        const me = view.hand!.players[actor.seatNo]!;
        const owed = Math.max(...view.hand!.players.map((p) => p?.betThisStreet ?? 0)) - me.betThisStreet;
        if (owed > 0 && owed >= me.stack) view = await act(actor.cookie, "call");
        else if (owed > 0) view = await act(actor.cookie, "raise", me.betThisStreet + me.stack);
        else view = await act(actor.cookie, "bet", me.stack);
      }
      expect(view.hand!.winners).not.toBeNull();
      const loserSeat = view.hand!.players.find((p) => p !== null && p.stack === 0)?.seat;
      if (loserSeat === undefined) continue; // split: deal again
      const loser = players.find((p) => p.seatNo === loserSeat)!;
      return { loser, winner: players.find((p) => p !== loser)!, ended: view };
    }
    throw new Error("nobody busted in 6 all-in hands");
  }

  it("29. a player with 0 chips at hand end is stood up, with a notice that says so", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const { loser, winner, ended } = await bustSomeone();
    // In the response to the action that ended the hand, and after.
    for (const view of [ended, await getView(winner.cookie)]) {
      expect(view.seats.find((s) => s.userId === loser.userId)).toBeUndefined();
      const gone = view.notice?.players.find((p) => p.userId === loser.userId);
      expect(gone?.reason).toBe("out_of_chips");
    }
    // The page says it in words, for everyone at the table.
    const res = await fetch(new URL(`/tables/${TABLE_ID}`, baseUrl), { headers: { cookie: winner.cookie } });
    const doc = new JSDOM(await res.text()).window.document;
    const notice = doc.querySelector(`.table-notice [data-out-of-chips="${loser.userId}"]`);
    expect(notice).not.toBeNull();
    // The owner's wording, with the name the table shows for that player.
    const shownName = ended.notice!.players.find((p) => p.userId === loser.userId)!.displayName;
    expect(notice!.textContent).toBe(`${shownName} is out of chips.`);
    // The winner holds everything: conservation across the bust.
    expect(ended.seats.find((s) => s.userId === winner.userId)!.stack).toBe(2 * ended.table.buy_in);
  });

  it("30. sitting again after busting gives the fixed buy-in", async () => {
    players = [await registerAndSit(), await registerAndSit()];
    const { loser } = await bustSomeone();
    const res = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie: loser.cookie } });
    expect(res.status).toBe(200);
    const view = (await res.json()) as TableView;
    expect(view.seats.find((s) => s.userId === loser.userId)!.stack).toBe(view.table.buy_in);
  });

  it.skipIf(!hooks)("31. a seat already at 0 chips doesn't stop the next deal: it's stood up as out of chips", async () => {
    players = [await registerAndSit(), await registerAndSit(), await registerAndSit()];
    const [alice, bob, carol] = players;
    // As a seat that busted before the rule shipped, or a crash between a
    // hand's commit and its stand-ups, would leave it.
    await setStacks({ [carol.userId]: 0 });
    const dealt = await startHand(alice.cookie);
    expect(dealt.hand!.winners).toBeNull(); // dealt, between the two with chips
    expect(dealt.seats.map((s) => s.userId).sort()).toEqual([alice.userId, bob.userId].sort());
    expect(dealt.notice?.players.find((p) => p.userId === carol.userId)?.reason).toBe("out_of_chips");
  });

  it(
    "32. after a heads-up bust, a newcomer who sits in the pause doesn't get a hand dealt by itself",
    { timeout: SHOWDOWN_PAUSE_MS + 15_000 },
    async () => {
      players = [await registerAndSit(), await registerAndSit()];
      const { winner, ended } = await bustSomeone();
      expect(ended.nextHandAt).toBeNull(); // one left: no deal coming
      const newcomer = await registerAndSit();
      players.push(newcomer);
      await sleep(SHOWDOWN_PAUSE_MS + 1500);
      const view = await getView(winner.cookie);
      expect(view.hand!.handId).toBe(ended.hand!.handId); // nothing dealt
      expect(view.nextHandAt).toBeNull();
    },
  );
});

// Brief 2 Step 11: the guest door, at the table. In this file because these
// tests sit at table 1; the guest tests that don't are in
// spec/accounts.test.ts. Each guest comes from its own made-up Fly-Client-IP
// (the rate limit's key), so they never use up localhost's budget.
describe.skipIf(!isLocal)("guests at the table (writes test data — local only)", () => {
  let players: Player[] = [];

  afterEach(async () => {
    await cleanupTable(players);
    players = [];
  });

  async function guestCookie(): Promise<{ cookie: string; landing: URL }> {
    const ip = `10.${[...randomBytes(3)].join(".")}`;
    const res = await fetch(new URL("/guest", baseUrl), {
      method: "POST",
      body: new URLSearchParams(),
      headers: { "Fly-Client-IP": ip },
      redirect: "manual",
    });
    const cookie = sessionCookieFrom(res);
    if (!cookie) throw new Error(`POST /guest made no session: ${res.status}`);
    return { cookie, landing: new URL(res.headers.get("location")!, baseUrl) };
  }

  async function sit(cookie: string): Promise<Player> {
    const res = await fetch(new URL(`/tables/${TABLE_ID}/sit`, baseUrl), { method: "POST", headers: { cookie } });
    const view = (await res.json()) as TableView & { error?: string };
    if (!res.ok) throw new Error(`sit failed: ${view.error}`);
    const seat = view.seats.find((s) => s.userId === view.you)!;
    return { username: seat.username, userId: view.you!, cookie, seatNo: seat.seatNo };
  }

  // The rows' facts: who, how much, when. (The route also joins in the
  // user's current username, which a claim changes on purpose.)
  async function resultsRows(cookie: string): Promise<{ userId: number; net: number; endedAt: string }[]> {
    const rows = (await (await fetch(new URL(`/tables/${TABLE_ID}/results`, baseUrl), { headers: { cookie } })).json()) as {
      userId: number;
      net: number;
      endedAt: string;
    }[];
    return rows.map(({ userId, net, endedAt }) => ({ userId, net, endedAt }));
  }

  // Whether /results tags this user as a guest, in the ledger row and in
  // every recent-hand row that names them.
  async function guestTags(cookie: string, userId: number): Promise<{ ledger: boolean; recent: boolean[] }> {
    const doc = new JSDOM(await (await fetch(new URL("/results", baseUrl), { headers: { cookie } })).text()).window
      .document;
    const row = doc.querySelector(`#ledger tr[data-user-id="${userId}"]`);
    if (!row) throw new Error(`user ${userId} has no ledger row`);
    return {
      ledger: row.querySelector("[data-guest]") !== null,
      recent: [...doc.querySelectorAll(`#recent td[data-user-id="${userId}"]`)].map((td) => td.querySelector("[data-guest]") !== null),
    };
  }

  // Owner decision (4 Nov 2026, after Step 11): guests are an animal and two
  // digits, and the animal is one whose avatar letter nobody seated has. Read
  // from the page itself: each seat's avatar letter and name plate.
  it("35. guests who sit one after another get different animals, and each avatar letter is their animal's", async () => {
    for (let i = 0; i < 3; i++) players.push(await sit((await guestCookie()).cookie));
    const doc = new JSDOM(
      await (await fetch(new URL(`/tables/${TABLE_ID}`, baseUrl), { headers: { cookie: players[0].cookie } })).text(),
    ).window.document;
    const seats = [...doc.querySelectorAll(".seat[data-seat]:not(.empty)")].map((el) => ({
      letter: el.querySelector(".avatar > span")!.textContent!,
      // The plate's name without the "(you)" tag.
      name: el.querySelector(".plate .name")!.firstChild!.textContent!,
    }));
    expect(seats).toHaveLength(3);
    for (const { letter, name } of seats) {
      const animal = name.split(" ")[0];
      expect(GUEST_ANIMALS).toContain(animal);
      expect(letter).toBe(avatarLetter(animal));
    }
    expect(new Set(seats.map((s) => s.letter)).size).toBe(3);
  });

  it("33. POST /guest signs in and lands on the table, where the guest can sit and act", async () => {
    const { cookie, landing } = await guestCookie();
    expect(landing.pathname).toBe(`/tables/${TABLE_ID}`);
    const page = await fetch(landing, { headers: { cookie }, redirect: "manual" });
    expect(page.status).toBe(200); // signed in: the table, not a redirect to log in

    const guest = await sit(cookie);
    const other = await registerAndSit();
    players = [guest, other];
    expect(guest.username).toMatch(/^guest-[a-z2-7]{6}$/);

    // Whoever is first to act, the guest acts in this hand: if it's the guest,
    // they call; if not, the other player calls and the guest checks.
    let view = await startHand(guest.cookie);
    if (view.hand!.actionTo !== guest.seatNo) view = await act(other.cookie, "call");
    expect(view.hand!.actionTo).toBe(guest.seatNo);
    const owed = Math.max(...view.hand!.players.map((p) => p?.betThisStreet ?? 0)) - view.hand!.players[guest.seatNo]!.betThisStreet;
    const after = await act(guest.cookie, owed > 0 ? "call" : "check");
    expect(after.lastAction?.seat).toBe(guest.seatNo);
    expect(after.lastAction?.auto).toBe(false);
  });

  it("34. claim, log out, log in with the claimed details: same user, no longer a guest, seat and results unchanged", async () => {
    const { cookie } = await guestCookie();
    const guest = await sit(cookie);
    const other = await registerAndSit();
    players = [guest, other];
    // One finished hand, so the guest has a hand_results row and a stack
    // that isn't the buy-in.
    const dealt = await startHand(guest.cookie);
    await act(players.find((p) => p.seatNo === dealt.hand!.actionTo)!.cookie, "fold");
    const before = await getView(guest.cookie);
    const seatBefore = before.seats.find((s) => s.userId === guest.userId)!;
    const rowsBefore = (await resultsRows(guest.cookie)).filter((r) => r.userId === guest.userId);
    expect(rowsBefore.length).toBe(1);
    expect(await guestTags(guest.cookie, guest.userId)).toEqual({ ledger: true, recent: [true] });

    const username = randomUsername();
    const claimRes = await fetch(new URL("/profile/claim", baseUrl), {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
      body: new URLSearchParams({
        username,
        password: VALID_PASSWORD,
        question_1: "first_dish",
        answer_1: "pasta",
        question_2: "childhood_nickname",
        answer_2: "rex",
      }),
    });
    expect(claimRes.status).toBe(303);
    // The claim ends the guest's session and starts a new one.
    const claimedCookie = sessionCookieFrom(claimRes)!;
    expect(claimedCookie).toBeDefined();
    players = [{ ...guest, cookie: claimedCookie, username }, other];

    // Log out (the claimed session), then log in with what was chosen.
    await fetch(new URL("/logout", baseUrl), { method: "POST", headers: { cookie: claimedCookie }, redirect: "manual" });
    const fresh = await logIn(username);
    players = [{ ...guest, cookie: fresh, username }, other];
    const view = await getView(fresh);
    expect(view.you).toBe(guest.userId);

    // is_guest is 0: the profile has no claim panel, the header no guest
    // name, Results no tag.
    const profile = new JSDOM(await (await fetch(new URL("/profile", baseUrl), { headers: { cookie: fresh } })).text())
      .window.document;
    expect(profile.querySelector("#claim")).toBeNull();
    expect(profile.querySelector(".site-nav .guest-name")).toBeNull();
    expect(await guestTags(fresh, guest.userId)).toEqual({ ledger: false, recent: [false] });

    // Seat, stack, display name and hand_results as they were.
    // (Not `away`: neither player holds a stream here, so that can flip.)
    const seatAfter = view.seats.find((s) => s.userId === guest.userId)!;
    expect(seatAfter.username).toBe(username);
    expect({ seatNo: seatAfter.seatNo, stack: seatAfter.stack, displayName: seatAfter.displayName }).toEqual({
      seatNo: seatBefore.seatNo,
      stack: seatBefore.stack,
      displayName: seatBefore.displayName,
    });
    expect(seatBefore.stack).not.toBe(before.table.buy_in); // the hand moved chips, so this compares something
    expect((await resultsRows(fresh)).filter((r) => r.userId === guest.userId)).toEqual(rowsBefore);
  });
});
