#!/usr/bin/env node
// Step 1 of docs/final-brief.md: the instrument later steps are judged
// against, not a one-off check. It never registers accounts (reads two
// existing ones from env), so it's safe to point at production as well as
// local.
//
// A and B need separate cookie jars — this is exactly what the brief's
// Step 2 bug exploits (one jar, two identities), so the probe can't share
// a jar between them without being the same bug it's supposed to help
// diagnose later. fetch() has no cookie jar of its own; this script is the
// jar, keeping each session's "session=..." cookie in its own variable and
// attaching it by hand to every request that session makes.
import { setTimeout as sleep } from "node:timers/promises";

const APP_URL = process.env.APP_URL ?? "http://localhost:8080";
const TABLE_ID = Number(process.env.PROBE_TABLE_ID ?? 1);
const ACTIONS = Number(process.env.PROBE_ACTIONS ?? 20);
const NO_EVENT_TIMEOUT_MS = 5000;

// How long the server waits between pushes before sending a heartbeat, so
// the idle-hold check below knows what "healthy" looks like. Mirrors
// src/server.ts's SSE_HEARTBEAT_MS (10s today; the brief's Step 3 shrinks it
// to 5s and renames it a named `ping` event) — overridable so this probe
// doesn't need a code change the day that constant does.
const HEARTBEAT_MS = Number(process.env.PROBE_HEARTBEAT_MS ?? 10_000);
// At least 25s (the owner's own number), and always long enough to span a
// couple of heartbeats even if HEARTBEAT_MS is raised.
const IDLE_HOLD_MS = Math.max(25_000, HEARTBEAT_MS * 2.5);
const STALL_THRESHOLD_MS = HEARTBEAT_MS * 1.5;

// leave() (src/poker/table.ts) rejects a seat still dealt into a running
// hand, folded or not — so with other real players at the table, the probe
// can't just fold itself down once and call it done: the hand only ends
// once every dealt-in seat (including ones this script doesn't control) has
// acted or timed out. 120s comfortably covers a few rounds of the default
// 30s turn timeout.
const LEAVE_WAIT_TIMEOUT_MS = 120_000;
const LEAVE_POLL_INTERVAL_MS = 2000;
// Same shape of problem mid-run: if a third player is seated and it's their
// turn, this script can't act for them — it waits for the server's own turn
// timer, which needs a budget past the real default (30s) to be a timeout
// rather than a normal occurrence. Overridable for local runs started with
// a short TURN_TIMEOUT_SECONDS.
const OTHER_PLAYER_TURN_TIMEOUT_MS = Number(process.env.PROBE_OTHER_TURN_TIMEOUT_MS ?? 40_000);

const PROBE_A_USER = requireEnv("PROBE_A_USER");
const PROBE_A_PASS = requireEnv("PROBE_A_PASS");
const PROBE_B_USER = requireEnv("PROBE_B_USER");
const PROBE_B_PASS = requireEnv("PROBE_B_PASS");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. The probe reads two existing accounts' credentials from env ` +
        `(PROBE_A_USER, PROBE_A_PASS, PROBE_B_USER, PROBE_B_PASS) and never registers its own.`,
    );
  }
  return value;
}

interface SeatView {
  seatNo: number;
  userId: number;
  username: string;
}

interface HandView {
  actionTo: number | null;
  winners: unknown[] | null;
}

interface TableView {
  table: { max_seats: number };
  seats: SeatView[];
  hand: HandView | null;
  turnDeadline: string | null;
  you: number | null;
}

// --- One session: a cookie jar of exactly one cookie, owned by this script
// rather than fetch's (nonexistent, outside a browser) implicit jar. ------

class Session {
  private cookie: string | undefined;

  async login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({ username, password });
    const res = await fetch(new URL("/login", APP_URL), { method: "POST", body, redirect: "manual" });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
    if (!cookie) throw new Error(`login failed for ${username}: HTTP ${res.status}`);
    this.cookie = cookie;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    if (!this.cookie) throw new Error("not logged in");
    return { cookie: this.cookie, ...extra };
  }

  async sit(tableId: number): Promise<TableView> {
    const res = await fetch(new URL(`/tables/${tableId}/sit`, APP_URL), {
      method: "POST",
      headers: this.headers(),
    });
    const view = (await res.json()) as TableView & { error?: string };
    // "You're already seated" is fine — the probe may be re-run against a
    // table it left seated from a previous crashed run.
    if (!res.ok && !/already seated/i.test(view.error ?? "")) {
      throw new Error(`sit failed: ${view.error ?? res.status}`);
    }
    return this.view(tableId);
  }

  // Unlike the old version, this doesn't swallow the error: callers decide
  // what a failed leave means (mid-run it's always a bug; at cleanup time,
  // per Step 1's second fix, it's expected until the table clears).
  async leave(tableId: number): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(new URL(`/tables/${tableId}/leave`, APP_URL), {
      method: "POST",
      headers: this.headers(),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error };
  }

  async view(tableId: number): Promise<TableView> {
    const res = await fetch(new URL(`/tables/${tableId}/view`, APP_URL), { headers: this.headers() });
    if (!res.ok) throw new Error(`GET view failed: HTTP ${res.status}`);
    return res.json();
  }

  async startHand(tableId: number): Promise<TableView> {
    const res = await fetch(new URL(`/tables/${tableId}/start`, APP_URL), {
      method: "POST",
      headers: this.headers(),
    });
    const view = (await res.json()) as TableView & { error?: string };
    if (!res.ok) throw new Error(`start failed: ${view.error ?? res.status}`);
    return view;
  }

  async act(tableId: number, type: string): Promise<TableView> {
    const body = new URLSearchParams({ type });
    const res = await fetch(new URL(`/tables/${tableId}/act`, APP_URL), {
      method: "POST",
      headers: this.headers(),
      body,
    });
    const view = (await res.json()) as TableView & { error?: string };
    if (!res.ok) throw new Error(`act(${type}) failed: ${view.error ?? res.status}`);
    return view;
  }

  // A background pump, not a lazily-pulled generator, for the same reason
  // spec/poker.test.ts's connectSse() is one: a generator only reads from
  // the socket while something is actively calling .next() on it, so any
  // gap between reads (this script doing other work between actions, or
  // holding the stream idle on purpose for the heartbeat check below)
  // leaves messages sitting unread and timestamps them late, whenever the
  // generator happens to be resumed next — corrupting exactly the gap
  // measurements this probe exists to report. Caught by running with
  // PROBE_DEBUG=1 and seeing several heartbeats arrive back-to-back with a
  // ~0ms gap between them, right after a long idle hold that should have
  // spaced them 10s apart.
  //
  // Parsed the same way the browser's EventSource and connectSse() do:
  // blank-line-delimited frames, "event:"/"data:" lines, ":"-prefixed
  // comment lines (heartbeats) kept as their own event name "comment"
  // rather than dropped, since stream health (gaps between ANY message,
  // heartbeats included) is exactly what this probe is also asked to
  // report.
  connect(tableId: number): SseConnection {
    let closedByUser = false;
    let currentAbort: AbortController | undefined;
    const queue: SseEvent[] = [];
    const waiters: (() => void)[] = [];

    const wakeAll = (): void => {
      while (waiters.length > 0) waiters.shift()!();
    };

    const pumpOnce = async (): Promise<void> => {
      const controller = new AbortController();
      currentAbort = controller;
      try {
        const res = await fetch(new URL(`/tables/${tableId}/events`, APP_URL), {
          headers: this.headers(),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return;
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
            const at = Date.now();
            if (raw.startsWith(":")) {
              queue.push({ event: "comment", data: raw, at });
              wakeAll();
              continue;
            }
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of raw.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
            }
            if (dataLines.length > 0) {
              queue.push({ event: eventName, data: dataLines.join("\n"), at });
              wakeAll();
            }
          }
        }
      } catch {
        // reconnect loop below decides what happens next
      }
    };

    (async () => {
      while (!closedByUser) {
        await pumpOnce();
        if (!closedByUser) {
          console.error(
            "B's SSE connection ended unexpectedly — reconnecting (this is the same recovery a real " +
              "browser's EventSource does; a gap spanning the reconnect still counts toward stream health).",
          );
          await sleep(100);
        }
      }
    })();

    return {
      async nextEvent(timeoutMs) {
        const start = Date.now();
        while (true) {
          if (queue.length > 0) return queue.shift()!;
          const remaining = timeoutMs - (Date.now() - start);
          if (remaining <= 0) return undefined;
          await new Promise<void>((resolve) => {
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
}

interface SseEvent {
  event: string;
  data: string;
  at: number;
}

interface SseConnection {
  nextEvent(timeoutMs: number): Promise<SseEvent | undefined>;
  close(): void;
}

// --- Stats -----------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function summarize(label: string, samples: number[]): void {
  if (samples.length === 0) {
    console.log(`${label}: no samples`);
    return;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const median = percentile(sorted, 50);
  const p95 = percentile(sorted, 95);
  const max = sorted[sorted.length - 1];
  console.log(`${label}: n=${samples.length} median=${median}ms p95=${p95}ms max=${max}ms`);
}

// --- The probe itself --------------------------------------------------

async function main(): Promise<void> {
  console.log(`latency-probe: APP_URL=${APP_URL} table=${TABLE_ID} actions=${ACTIONS}`);

  const a = new Session();
  const b = new Session();
  await a.login(PROBE_A_USER, PROBE_A_PASS);
  await b.login(PROBE_B_USER, PROBE_B_PASS);

  // Whoever's already seated before A and B sit down is "other players" —
  // real accounts this script doesn't control and can't act for.
  const preSeatView = await a.view(TABLE_ID);
  const otherCount = preSeatView.seats.length;
  if (otherCount > 0) {
    console.log(
      `${otherCount} other player(s) already seated at table ${TABLE_ID} — their turns will inflate these timings (this script only acts for A and B).`,
    );
  } else {
    console.log(`no other players seated at table ${TABLE_ID}.`);
  }

  await a.sit(TABLE_ID);
  const bOwnView = await b.sit(TABLE_ID);

  // view.you is whoever's cookie made the request, not a fixed identity —
  // so each session's own id is read from its own view, not the other's.
  const aOwnView = await a.view(TABLE_ID);
  const aUserId = aOwnView.you;
  const bUserId = bOwnView.you;
  const aSeatNo = aOwnView.seats.find((s) => s.userId === aUserId)?.seatNo;
  const bSeatNo = bOwnView.seats.find((s) => s.userId === bUserId)?.seatNo;
  if (aUserId === null || bUserId === null || aSeatNo === undefined || bSeatNo === undefined) {
    throw new Error("couldn't find both A and B seated at the table after sitting down");
  }
  console.log(`A is seat ${aSeatNo}, B is seat ${bSeatNo}`);

  // A continuously-running background pump (see Session.connect's own
  // comment for why a lazily-pulled generator can't be trusted for this),
  // so every message's timestamp reflects when it actually arrived, not
  // when this script next happened to ask for it.
  const bStream = b.connect(TABLE_ID);

  // Drains bStream until `predicate` matches a "view" event or `timeoutMs`
  // elapses, recording the gap (in ms) before EVERY message along the way
  // (heartbeats included) into `gaps`, so a stall shows up even when it
  // doesn't swallow an action outright. A predicate that always returns
  // false drains for the full `timeoutMs` — used below both to wait out a
  // third player's turn and to hold the stream idle for the heartbeat
  // check.
  let lastMessageAt = Date.now();
  const gaps: number[] = [];
  async function drainUntil(
    predicate: (v: TableView) => boolean,
    timeoutMs: number,
  ): Promise<{ view: TableView; elapsedMs: number } | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const remaining = timeoutMs - (Date.now() - start);
      const msg = await bStream.nextEvent(remaining);
      if (msg === undefined) return undefined; // timed out
      if (process.env.PROBE_DEBUG) {
        const hand = msg.event === "view" ? (JSON.parse(msg.data) as TableView).hand : undefined;
        console.error(
          `[debug] event=${msg.event}` +
            (hand !== undefined ? ` actionTo=${hand?.actionTo} winners=${JSON.stringify(hand?.winners)}` : ""),
        );
      }
      gaps.push(msg.at - lastMessageAt);
      lastMessageAt = msg.at;
      if (msg.event !== "view") continue;
      const v = JSON.parse(msg.data) as TableView;
      if (predicate(v)) return { view: v, elapsedMs: Date.now() - start };
    }
    return undefined;
  }

  // The initial "current view" on connect — not timed, just drained so it
  // doesn't get mistaken for a push later.
  await drainUntil(() => true, 5000);

  // Waits (polling A's own view, not B's stream) until it's A's or B's turn
  // again, or the hand has ended — for when a third player's turn comes up
  // mid-loop and this script has no action to take for them. Keeps draining
  // B's stream (now via the background pump, so nothing is missed even if
  // this loop is slow to come back to it) the whole time.
  async function waitForOurTurnOrHandEnd(timeoutMs: number): Promise<TableView> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await drainUntil(() => false, 1000);
      const view = await a.view(TABLE_ID);
      if (!view.hand || view.hand.winners !== null || view.hand.actionTo === aSeatNo || view.hand.actionTo === bSeatNo) {
        return view;
      }
    }
    throw new Error(`timed out after ${timeoutMs}ms waiting for a seat other than A/B to act`);
  }

  // Folds A's or B's own turn (never acting for a seat it doesn't own —
  // that resolves only via the server's own timeout) until the hand ends,
  // so a subsequent idle hold starts from "nothing is running" rather than
  // mid-street. Only ever called with no other players seated (the idle
  // hold itself isn't attempted with other players — see the leave-wait
  // comment below for why that case can't be made this precise).
  async function foldToHandEnd(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const view = await a.view(TABLE_ID);
      if (!view.hand || view.hand.winners !== null) return;
      if (view.hand.actionTo === aSeatNo) await a.act(TABLE_ID, "fold").catch(() => undefined);
      else if (view.hand.actionTo === bSeatNo) await b.act(TABLE_ID, "fold").catch(() => undefined);
      else return; // someone else is seated — not ours to resolve; idle hold may see their action too
      await drainUntil(() => false, 200);
    }
  }

  const deliveryMs: number[] = [];
  const missed: { action: number; type: string }[] = [];

  for (let i = 0; i < ACTIONS; i++) {
    const beforeView = await a.view(TABLE_ID);
    let type: string;

    if (!beforeView.hand || beforeView.hand.winners !== null) {
      // No hand running (or just ended) — A starts a new one. The deal
      // itself is also a push B's stream should see, so it's timed the
      // same way as an action.
      type = "start";
    } else if (beforeView.hand.actionTo === aSeatNo) {
      type = "check-or-call";
    } else if (beforeView.hand.actionTo === bSeatNo) {
      // It's B's turn, not A's — have B act instead so the hand keeps
      // moving (the probe only measures A-acts/B-observes, so this
      // action isn't timed, but it can't be skipped or the hand stalls
      // forever on B).
      await actCheckOrCall(b, beforeView);
      i--; // doesn't count against the N requested A-actions
      continue;
    } else {
      // Some other seated player's turn — nothing this script can do but
      // wait for them or their own timeout.
      await waitForOurTurnOrHandEnd(OTHER_PLAYER_TURN_TIMEOUT_MS);
      i--; // doesn't count against the N requested A-actions
      continue;
    }

    const t0 = Date.now();
    if (type === "start") {
      await a.startHand(TABLE_ID);
    } else {
      await actCheckOrCall(a, beforeView);
    }

    const result = await drainUntil(
      (v) =>
        type === "start"
          ? v.hand !== null && v.hand.winners === null
          : v.hand === null || v.hand.winners !== null || v.hand.actionTo !== beforeView.hand!.actionTo,
      NO_EVENT_TIMEOUT_MS,
    );

    if (!result) {
      console.log(`action ${i + 1} (${type}): NO EVENT within ${NO_EVENT_TIMEOUT_MS}ms`);
      missed.push({ action: i + 1, type });
      continue;
    }
    const ms = Date.now() - t0;
    deliveryMs.push(ms);
    console.log(`action ${i + 1} (${type}): ${ms}ms`);
  }

  // --- Heartbeat / stall check: hold B's stream idle and see what actually
  // arrives, rather than inferring health from gaps the action loop above
  // happened to produce (which, at normal speed, never runs long enough to
  // see even one heartbeat). A hand still in progress when the hold starts
  // would push real game-state changes (the turn timer firing, or another
  // seated player acting) into the same window and masquerade as
  // heartbeats, so the last action's hand is folded down to a finish first
  // — confirmed by running with PROBE_DEBUG=1 and seeing two "idle"
  // messages that were actually FLOP/TURN street pushes, 4ms apart, not
  // heartbeat comments 10s apart.
  await foldToHandEnd(NO_EVENT_TIMEOUT_MS);
  console.log(`\nholding B's stream idle for ${IDLE_HOLD_MS}ms to check heartbeat health...`);
  const idleGapsStart = gaps.length;
  await drainUntil(() => false, IDLE_HOLD_MS);
  const idleGaps = gaps.slice(idleGapsStart);
  const maxIdleGap = idleGaps.length > 0 ? Math.max(...idleGaps) : undefined;
  const stalled = idleGaps.length === 0 || (maxIdleGap as number) > STALL_THRESHOLD_MS;
  console.log(
    `idle hold: ${idleGaps.length} message(s) received, max gap ${maxIdleGap ?? "n/a (none received)"}ms ` +
      `(heartbeat=${HEARTBEAT_MS}ms, STALL threshold=${STALL_THRESHOLD_MS}ms)`,
  );
  if (otherCount > 0) {
    console.log(
      `NOTE: ${otherCount} other player(s) are seated, so this hold can't be guaranteed hand-free — a message` +
        ` during it might be their real action rather than a heartbeat, which would hide a genuine stall.`,
    );
  }
  if (stalled) {
    console.log(
      `STALL: B's stream was silent for longer than 1.5x the heartbeat interval during the idle hold` +
        (idleGaps.length === 0 ? " (no messages at all)." : `.`),
    );
  }

  bStream.close();

  // --- Leave, tolerating other real players still at the table (fix #2):
  // leave() rejects a seat dealt into a hand still in progress, and a hand
  // with other players in it only ends once every one of them has acted or
  // timed out — not something folding A and B can force on its own. -----
  const noHandRunning = await waitUntilNoHandRunning();
  if (!noHandRunning) {
    console.log(
      `WARNING: a hand was still running after waiting ${LEAVE_WAIT_TIMEOUT_MS}ms for it to end; trying to leave anyway.`,
    );
  }
  const aLeft = await a.leave(TABLE_ID);
  const bLeft = await b.leave(TABLE_ID);

  const finalView = await a.view(TABLE_ID);
  const stillSeated = finalView.seats.filter((s) => s.userId === aUserId || s.userId === bUserId);

  console.log("\n--- results ---");
  summarize("delivery (A's POST -> matching event on B's stream)", deliveryMs);
  console.log(`missed (no event within ${NO_EVENT_TIMEOUT_MS}ms): ${missed.length}/${ACTIONS}`);
  for (const m of missed) console.log(`  action ${m.action} (${m.type})`);
  summarize("stream health during actions (gap between consecutive messages on B's stream)", gaps.slice(0, idleGapsStart));
  console.log(
    `stream health, idle hold (${IDLE_HOLD_MS}ms, heartbeats only): n=${idleGaps.length} max=${maxIdleGap ?? "n/a"}ms${stalled ? " — STALL" : ""}`,
  );

  if (stillSeated.length > 0) {
    console.error(
      `\nERROR: still seated after cleanup: ${stillSeated
        .map((s) => `${s.username} (seat ${s.seatNo})`)
        .join(", ")}. a.leave()=${JSON.stringify(aLeft)} b.leave()=${JSON.stringify(bLeft)}`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nboth A and B successfully left the table.");
  }

  // Waits (polling, up to LEAVE_WAIT_TIMEOUT_MS) for no hand to be in
  // progress, folding A's or B's own turn along the way so this script's
  // own accounts don't themselves hold things up — but never acting for a
  // seat it doesn't own; those resolve only via the server's own timeout.
  async function waitUntilNoHandRunning(): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < LEAVE_WAIT_TIMEOUT_MS) {
      const view = await a.view(TABLE_ID);
      if (!view.hand || view.hand.winners !== null) return true;
      if (view.hand.actionTo === aSeatNo) await a.act(TABLE_ID, "fold").catch(() => undefined);
      else if (view.hand.actionTo === bSeatNo) await b.act(TABLE_ID, "fold").catch(() => undefined);
      await sleep(LEAVE_POLL_INTERVAL_MS);
    }
    return false;
  }
}

// Picks whichever of check/call is legal for `session` against `view`
// rather than guessing: "call" is rejected with NOTHING_TO_CALL when
// nothing is owed, and "check" is rejected when something is, so this
// tries call first (the common case once blinds are live) and falls back
// to check on that specific rejection.
async function actCheckOrCall(session: Session, view: TableView): Promise<TableView> {
  try {
    return await session.act(TABLE_ID, "call");
  } catch (err) {
    if (err instanceof Error && /nothing to call/i.test(err.message)) {
      return session.act(TABLE_ID, "check");
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
