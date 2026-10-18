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

  async leave(tableId: number): Promise<void> {
    await fetch(new URL(`/tables/${tableId}/leave`, APP_URL), { method: "POST", headers: this.headers() }).catch(
      () => undefined,
    );
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

  // Raw SSE events, parsed the same way the browser's EventSource and
  // spec/poker.test.ts's connectSse() do: blank-line-delimited frames,
  // "event:"/"data:" lines, ":"-prefixed comment lines (heartbeats) kept
  // as their own event name "comment" rather than dropped, since stream
  // health (gaps between ANY message, heartbeats included) is exactly what
  // this probe is also asked to report.
  async *events(tableId: number, signal: AbortSignal): AsyncGenerator<{ event: string; data: string; at: number }> {
    const res = await fetch(new URL(`/tables/${tableId}/events`, APP_URL), {
      headers: this.headers(),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`SSE connect failed: HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
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
            yield { event: "comment", data: raw, at };
            continue;
          }
          let eventName = "message";
          const dataLines: string[] = [];
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (dataLines.length > 0) yield { event: eventName, data: dataLines.join("\n"), at };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
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
  console.log(
    `${label}: n=${samples.length} median=${median}ms p95=${p95}ms max=${max}ms`,
  );
}

// --- The probe itself --------------------------------------------------

async function main(): Promise<void> {
  console.log(`latency-probe: APP_URL=${APP_URL} table=${TABLE_ID} actions=${ACTIONS}`);

  const a = new Session();
  const b = new Session();
  await a.login(PROBE_A_USER, PROBE_A_PASS);
  await b.login(PROBE_B_USER, PROBE_B_PASS);

  await a.sit(TABLE_ID);
  const view = await b.sit(TABLE_ID);

  // view.you is B's own id (B just sat last); find each seat by comparing
  // against a's own view instead, since this script holds two independent
  // sessions and view.you only ever reflects whoever's cookie made the
  // request.
  const aView = await a.view(TABLE_ID);
  const aSeatNo = aView.seats.find((s) => s.userId === aView.you)?.seatNo;
  const bSeatNo = view.seats.find((s) => s.userId === view.you)?.seatNo;
  if (aSeatNo === undefined || bSeatNo === undefined) {
    throw new Error("couldn't find both A and B seated at the table after sitting down");
  }
  console.log(`A is seat ${aSeatNo}, B is seat ${bSeatNo}`);

  const abort = new AbortController();
  const bEvents = b.events(TABLE_ID, abort.signal);

  // Drains bEvents until `predicate` matches a "view" event or `timeoutMs`
  // elapses, recording the gap (in ms) before EVERY message along the way
  // (heartbeats included) into `gaps`, so a stall shows up even when it
  // doesn't swallow an action outright.
  let lastMessageAt = Date.now();
  const gaps: number[] = [];
  async function nextMatchingView(
    predicate: (v: TableView) => boolean,
    timeoutMs: number,
  ): Promise<{ view: TableView; elapsedMs: number } | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const remaining = timeoutMs - (Date.now() - start);
      const next = await Promise.race([
        bEvents.next(),
        sleep(remaining).then(() => undefined),
      ]);
      if (next === undefined) return undefined; // timed out
      if (next.done) throw new Error("B's SSE stream ended unexpectedly");
      const msg = next.value;
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
  await nextMatchingView(() => true, 5000);

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
      throw new Error(`no one (A or B) is to act — actionTo=${beforeView.hand.actionTo}`);
    }

    const t0 = Date.now();
    if (type === "start") {
      await a.startHand(TABLE_ID);
    } else {
      await actCheckOrCall(a, beforeView);
    }

    const result = await nextMatchingView(
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

  abort.abort();
  await finishAnyHandInProgress(a, b, aSeatNo, bSeatNo);
  await a.leave(TABLE_ID);
  await b.leave(TABLE_ID);

  console.log("\n--- results ---");
  summarize("delivery (A's POST -> matching event on B's stream)", deliveryMs);
  console.log(`missed (no event within ${NO_EVENT_TIMEOUT_MS}ms): ${missed.length}/${ACTIONS}`);
  for (const m of missed) console.log(`  action ${m.action} (${m.type})`);
  summarize("stream health (gap between consecutive messages on B's stream, heartbeats included)", gaps);
}

// leave() (src/poker/table.ts) rejects a seat that's dealt into a hand
// still in progress, so the probe — like spec/poker.test.ts's own
// cleanupTable — folds whoever's left down to a finish before it tries to
// stand both sessions up, otherwise it strands two seats at the table for
// the next run (and, against production, forever).
async function finishAnyHandInProgress(
  a: Session,
  b: Session,
  aSeatNo: number,
  bSeatNo: number,
): Promise<void> {
  for (let guard = 0; guard < 20; guard++) {
    const view = await a.view(TABLE_ID);
    if (!view.hand || view.hand.winners !== null || view.hand.actionTo === null) return;
    const actor = view.hand.actionTo === aSeatNo ? a : view.hand.actionTo === bSeatNo ? b : undefined;
    if (!actor) return; // someone else's seat is acting — not ours to resolve
    await actor.act(TABLE_ID, "fold").catch(() => undefined);
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
