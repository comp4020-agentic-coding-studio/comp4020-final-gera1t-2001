import { randomBytes } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, inject, it } from "vitest";

import { evaluateStrings, getCardCodes, rank } from "@pokertools/evaluator";
import {
  FLUSH,
  FOUR_OF_A_KIND,
  FULL_HOUSE,
  HAND_RANK_DESCRIPTIONS,
  HIGH_CARD,
  ONE_PAIR,
  QUALIFYING_HAND,
  QUALIFYING_SCORE,
  ROYAL_FLUSH_SCORE,
  STRAIGHT,
  STRAIGHT_FLUSH,
  THREE_OF_A_KIND,
  TWO_PAIR,
  antePaytable,
  category,
  dealerQualifies,
  score,
  settle,
} from "../src/solo/rules.ts";

// Brief 2 Step 12: Casino Hold'em against the house. Nothing here touches
// table 1, so these tests have their own file. (The one solo test that sits
// a player at the table, to show their table stack doesn't move, is in
// spec/poker.test.ts with every other test on table 1.)
//
// The first two describes are pure (the rules against the evaluator) and run
// everywhere, CI included. The rest create accounts and play hands, so they
// run only when APP_URL is localhost, like the other spec files. A fixed deck
// needs the test-only route (TEST_HOOKS=1, never in production); those tests
// skip without it.
const baseUrl = inject("baseUrl");
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
const hooks = process.env.TEST_HOOKS === "1";

// --- The rules, against @pokertools/evaluator ------------------------------

describe("solo rules: the evaluator's categories and the qualifying hand", () => {
  it("the named category numbers are the library's own (HandRank is a const enum)", () => {
    const names: [number, string][] = [
      [STRAIGHT_FLUSH, "Straight Flush"],
      [FOUR_OF_A_KIND, "Four of a Kind"],
      [FULL_HOUSE, "Full House"],
      [FLUSH, "Flush"],
      [STRAIGHT, "Straight"],
      [THREE_OF_A_KIND, "Three of a Kind"],
      [TWO_PAIR, "Two Pair"],
      [ONE_PAIR, "One Pair"],
      [HIGH_CARD, "High Card"],
    ];
    for (const [n, name] of names) expect(HAND_RANK_DESCRIPTIONS[n as keyof typeof HAND_RANK_DESCRIPTIONS]).toBe(name);
    // And a hand of each kind lands in its number.
    expect(category(["As", "Ks", "Qs", "Js", "Ts"])).toBe(STRAIGHT_FLUSH);
    expect(category(["8s", "8h", "8d", "8c", "2s"])).toBe(FOUR_OF_A_KIND);
    expect(category(["2c", "3d", "4h", "5s", "7c"])).toBe(HIGH_CARD);
  });

  it("a royal is an ace-high straight flush: pays 100; a 5-high straight flush pays 20", () => {
    expect(score(["As", "Ks", "Qs", "Js", "Ts"])).toBe(ROYAL_FLUSH_SCORE);
    expect(score(["Ah", "Kh", "Qh", "Jh", "Th"])).toBe(ROYAL_FLUSH_SCORE);
    expect(antePaytable(["As", "Ks", "Qs", "Js", "Ts"])).toBe(100);
    expect(category(["5h", "4h", "3h", "2h", "Ah"])).toBe(STRAIGHT_FLUSH);
    expect(antePaytable(["5h", "4h", "3h", "2h", "Ah"])).toBe(20);
    expect(antePaytable(["Kd", "Qd", "Jd", "Td", "9d"])).toBe(20);
  });

  it("the paytable: four of a kind 10, full house 3, flush 2, straight or less 1", () => {
    expect(antePaytable(["8s", "8h", "8d", "8c", "2s"])).toBe(10);
    expect(antePaytable(["9s", "9h", "9d", "Kc", "Kh"])).toBe(3);
    expect(antePaytable(["Ac", "7c", "Kc", "9c", "4c"])).toBe(2);
    expect(antePaytable(["6s", "7h", "8d", "9c", "Td"])).toBe(1);
    expect(antePaytable(["Ah", "Ad", "Ac", "2s", "7d"])).toBe(1);
    expect(antePaytable(["2c", "3d", "4h", "5s", "7c"])).toBe(1);
  });

  it("qualifying boundary: 3-3-A-K-Q doesn't, 4-4-5-3-2 does, 4-4-6-3-2 does", () => {
    expect(QUALIFYING_SCORE).toBe(score([...QUALIFYING_HAND]));
    expect(dealerQualifies(["3s", "3h", "Ad", "Kc", "Qh"])).toBe(false);
    expect(dealerQualifies(["4s", "4h", "5d", "3c", "2h"])).toBe(true);
    expect(dealerQualifies(["4s", "4h", "6d", "3c", "2h"])).toBe(true);
    // Lower is stronger (index.d.ts: "Returns a strength score (lower is better)").
    expect(score(["4s", "4h", "6d", "3c", "2h"])).toBeLessThan(QUALIFYING_SCORE);
    expect(score(["3s", "3h", "Ad", "Kc", "Qh"])).toBeGreaterThan(QUALIFYING_SCORE);
  });

  it("settlement: each of the four call outcomes and a fold", () => {
    // Fold: lose the ante.
    expect(settle(10, true, ["2c", "3d"], ["Ah", "Qc"], ["Ks", "Kh", "9d"]).net).toBe(-10);
    // Dealer doesn't qualify: call pushes, ante pays the paytable (a flush, 2:1).
    expect(settle(10, false, ["Ac", "7c"], ["3h", "5s"], ["Kc", "9c", "4c", "2d", "8h"])).toMatchObject({
      outcome: "no_qualify",
      net: 20,
    });
    // Qualifies, player stronger: call 1:1 plus ante at the paytable (quads, 10:1).
    expect(settle(10, false, ["8s", "8h"], ["3c", "7d"], ["8d", "8c", "Kd", "2s", "5h"])).toMatchObject({
      outcome: "player_wins",
      net: 10 * 10 + 20,
    });
    // Qualifies, dealer stronger: ante and call lost.
    expect(settle(10, false, ["2c", "3d"], ["Ah", "Qc"], ["Ks", "Kh", "9d", "7s", "4c"])).toMatchObject({
      outcome: "dealer_wins",
      net: -30,
    });
    // Equal: both push (both play the board's straight).
    expect(settle(10, false, ["2c", "3d"], ["4h", "5s"], ["As", "Ks", "Qd", "Jh", "Tc"])).toMatchObject({
      outcome: "push",
      net: 0,
    });
  });
});

// --- Over HTTP ---------------------------------------------------------------

const VALID_PASSWORD = "Correct1!Horse";

function sessionCookieFrom(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
}

async function register(): Promise<string> {
  const body = new URLSearchParams({
    username: `solo_${randomBytes(6).toString("hex")}`,
    password: VALID_PASSWORD,
    display_name: "",
    question_1: "first_dish",
    answer_1: "pasta",
    question_2: "childhood_nickname",
    answer_2: "rex",
  });
  const res = await fetch(new URL("/register", baseUrl), { method: "POST", body, redirect: "manual" });
  const cookie = sessionCookieFrom(res);
  if (!cookie) throw new Error(`register failed: ${res.status}`);
  return cookie;
}

interface SoloView {
  stack: number;
  buyIn: number;
  maxAnte: number;
  sessionNet: number;
  live: { ante: number; player: string[]; flop: string[] } | null;
  last: {
    ante: number;
    player: string[];
    dealer: string[];
    board: string[];
    outcome: string;
    net: number;
  } | null;
  newStack: boolean;
}

interface SoloHand {
  ante: number;
  player_cards: string;
  dealer_cards: string;
  board: string;
  outcome: string;
  net: number;
}

async function soloView(cookie: string): Promise<SoloView> {
  const res = await fetch(new URL("/solo/view", baseUrl), { headers: { cookie } });
  if (!res.ok) throw new Error(`GET /solo/view: ${res.status}`);
  return res.json();
}

// Every solo move is a form POST answered with the new state as JSON.
async function post(cookie: string, path: string, fields: Record<string, string> = {}): Promise<{ status: number; body: SoloView & { error?: string } }> {
  const res = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { cookie, accept: "application/json" },
    body: new URLSearchParams(fields),
  });
  const text = await res.text();
  let body: SoloView & { error?: string };
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path}: ${res.status}, not JSON: ${text.slice(0, 60)}`);
  }
  return { status: res.status, body };
}

async function ok(cookie: string, path: string, fields: Record<string, string> = {}): Promise<SoloView> {
  const r = await post(cookie, path, fields);
  if (r.status !== 200) throw new Error(`${path} failed: ${r.status} ${r.body.error}`);
  return r.body;
}

async function hands(cookie: string): Promise<SoloHand[]> {
  const res = await fetch(new URL("/solo/hands", baseUrl), { headers: { cookie } });
  if (!res.ok) throw new Error(`GET /solo/hands: ${res.status}`);
  return res.json();
}

async function setDeck(cookie: string, deck: string[]): Promise<void> {
  const res = await fetch(new URL("/test-hooks/solo/deck", baseUrl), {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ deck }),
  });
  if (!res.ok) throw new Error(`setDeck: ${res.status} (is the app running with TEST_HOOKS=1?)`);
}

const cardsOf = (s: string): string[] => (s ? s.split(" ") : []);

// The settlement, worked out here from the brief's rules with the evaluator
// directly, not with src/solo/rules.ts (which the server uses), so a wrong
// rule there can't agree with itself. Lower scores are stronger
// (index.d.ts). Categories are the evaluator's numbers: 0 straight flush,
// 1 four of a kind, 2 full house, 3 flush; a royal scores 1.
function expectedNet(ante: number, folded: boolean, player: string[], dealer: string[], board: string[]): number {
  if (folded) return -ante;
  const p = [...player, ...board];
  const d = [...dealer, ...board];
  const ps = evaluateStrings(p);
  const ds = evaluateStrings(d);
  const cat = rank(getCardCodes(p));
  const pays = cat === 0 ? (ps === 1 ? 100 : 20) : cat === 1 ? 10 : cat === 2 ? 3 : cat === 3 ? 2 : 1;
  const qualifies = ds <= evaluateStrings(["4s", "4h", "5d", "3c", "2h"]);
  if (!qualifies) return ante * pays; // call pushes, ante pays the paytable
  if (ps < ds) return ante * pays + 2 * ante; // call 1:1, ante pays the paytable
  if (ps > ds) return -3 * ante; // ante and call lost
  return 0; // both push
}

describe.skipIf(!isLocal)("solo against the house (writes test data — local only)", () => {
  it("a new player starts with the table's buy-in, separate from any table stack", async () => {
    const cookie = await register();
    const view = await soloView(cookie);
    expect(view.stack).toBe(view.buyIn);
    expect(view.sessionNet).toBe(0);
    expect(view.maxAnte).toBe(Math.floor(view.buyIn / 3));
    expect(view.live).toBeNull();
  });

  it("an ante over stack / 3 is refused with a message that states the maximum; nothing is dealt", async () => {
    const cookie = await register();
    const { maxAnte } = await soloView(cookie);
    const over = await post(cookie, "/solo/deal", { ante: String(maxAnte + 1) });
    expect(over.status).toBe(400);
    // The message states the maximum: the number in it, parsed, is maxAnte.
    const numbers = (over.body.error ?? "").match(/[\d,]+/g)?.map((n) => Number(n.replace(/,/g, ""))) ?? [];
    expect(numbers).toContain(maxAnte);
    for (const bad of ["0", "-5", "2.5", "abc", ""]) {
      expect((await post(cookie, "/solo/deal", { ante: bad })).status, bad).toBe(400);
    }
    expect((await soloView(cookie)).live).toBeNull();
    // Exactly the maximum is fine.
    expect((await ok(cookie, "/solo/deal", { ante: String(maxAnte) })).live?.ante).toBe(maxAnte);
  });

  it("the dealer's cards are in no response, JSON or DOM, until the player has called or folded", async () => {
    const cookie = await register();
    const dealt = await ok(cookie, "/solo/deal", { ante: "10" });
    expect(dealt.live?.player).toHaveLength(2);
    expect(dealt.live?.flop).toHaveLength(3);
    // The dealer's two are the only cards dealt that aren't the player's or
    // the flop. After the fold they're in the stored hand; check that none of
    // them was in anything the player saw before it.
    const before = [JSON.stringify(dealt), JSON.stringify(await soloView(cookie))];
    const pageRes = await fetch(new URL("/solo", baseUrl), { headers: { cookie } });
    const doc = new JSDOM(await pageRes.text()).window.document;
    before.push(doc.documentElement.outerHTML);
    // Two face-down cards on the dealer's side of the felt, no faces.
    const dealerCards = [...doc.querySelectorAll("[data-dealer] .card")];
    expect(dealerCards).toHaveLength(2);
    expect(dealerCards.every((c) => c.classList.contains("back"))).toBe(true);

    const folded = await ok(cookie, "/solo/fold");
    const dealer = folded.last!.dealer;
    expect(dealer).toHaveLength(2);
    // Each dealer card, written the way a response or the page would carry
    // it: the code ("Qd") and the card's accessible name ("Queen of diamonds").
    const RANK: Record<string, string> = { A: "Ace", K: "King", Q: "Queen", J: "Jack", T: "10" };
    const SUIT: Record<string, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
    for (const card of dealer) {
      const name = `${RANK[card[0]] ?? card[0]} of ${SUIT[card[1]]}`;
      for (const text of before) {
        expect(text.includes(`"${card}"`), `${card} leaked`).toBe(false);
        expect(text.includes(name), `${name} leaked`).toBe(false);
      }
    }
  });

  it("every hand's net equals the settlement rules recomputed from its stored cards", async () => {
    const cookie = await register();
    // A mix of folds and calls.
    for (let i = 0; i < 8; i++) {
      await ok(cookie, "/solo/deal", { ante: "5" });
      await ok(cookie, i % 3 === 0 ? "/solo/fold" : "/solo/call");
    }
    const rows = await hands(cookie);
    expect(rows).toHaveLength(8);
    for (const h of rows) {
      const folded = h.outcome === "fold";
      const board = cardsOf(h.board);
      expect(board).toHaveLength(folded ? 3 : 5);
      expect(h.net).toBe(expectedNet(h.ante, folded, cardsOf(h.player_cards), cardsOf(h.dealer_cards), board));
    }
    // And the stack moved by exactly the sum of the nets.
    const view = await soloView(cookie);
    expect(view.stack).toBe(view.buyIn + rows.reduce((sum, h) => sum + h.net, 0));
    expect(view.sessionNet).toBe(view.stack - view.buyIn);
  });

  it("the stack never goes negative: max-ante calls until a bust, then a new stack at the buy-in", async () => {
    const cookie = await register();
    let view = await soloView(cookie);
    const buyIn = view.buyIn;
    let busted = false;
    for (let i = 0; i < 60 && !busted; i++) {
      const before = view.stack;
      view = await ok(cookie, "/solo/deal", { ante: String(view.maxAnte) });
      view = await ok(cookie, "/solo/call");
      if (view.newStack) {
        busted = true;
        // The last hand's net took the stack under 3: it was never below 0.
        const last = (await hands(cookie)).at(-1)!;
        expect(before + last.net).toBeGreaterThanOrEqual(0);
        expect(before + last.net).toBeLessThan(3);
      } else {
        expect(view.stack).toBeGreaterThanOrEqual(0);
      }
    }
    expect(busted).toBe(true);
    // A fresh session at the buy-in.
    expect(view.stack).toBe(buyIn);
    expect(view.sessionNet).toBe(0);
    // The hand that busted the last stack is what the felt shows, with the
    // notice: in the response, and again after a reload (the page as a GET,
    // which is all a browser without JavaScript ever sees).
    const bustingHand = (await hands(cookie)).at(-1)!;
    for (const v of [view, await soloView(cookie)]) {
      expect(v.newStack).toBe(true);
      expect(v.last?.net).toBe(bustingHand.net);
      expect(v.last?.player).toEqual(cardsOf(bustingHand.player_cards));
    }
    const doc = new JSDOM(await (await fetch(new URL("/solo", baseUrl), { headers: { cookie } })).text()).window.document;
    expect(doc.querySelector("[data-new-stack]")?.textContent).toBe(
      `You're out. New stack of ${buyIn.toLocaleString("en-AU")} play chips.`,
    );
    expect(Number(doc.querySelector("[data-result]")!.getAttribute("data-net"))).toBe(bustingHand.net);
    // The next deal clears it: no notice, and the old hand is gone from the felt.
    const next = await ok(cookie, "/solo/deal", { ante: "5" });
    expect(next.newStack).toBe(false);
    const after = await ok(cookie, "/solo/fold");
    expect(after.newStack).toBe(false);
    expect(after.last?.net).toBe(-5);
    expect((await soloView(cookie)).newStack).toBe(false);
  });

  it("without JavaScript a bust still says You're out: the form post's 303 lands on a page with the notice", async () => {
    const cookie = await register();
    const { buyIn } = await soloView(cookie);
    let notice: string | null = null;
    for (let i = 0; i < 60 && notice === null; i++) {
      const { maxAnte } = await soloView(cookie);
      for (const [path, fields] of [["/solo/deal", { ante: String(maxAnte) }], ["/solo/call", {}]] as const) {
        const res = await fetch(new URL(path, baseUrl), {
          method: "POST",
          headers: { cookie },
          body: new URLSearchParams(fields),
          redirect: "manual",
        });
        expect(res.status, path).toBe(303);
      }
      const doc = new JSDOM(await (await fetch(new URL("/solo", baseUrl), { headers: { cookie } })).text()).window.document;
      notice = doc.querySelector("[data-new-stack]")?.textContent ?? null;
    }
    expect(notice).toBe(`You're out. New stack of ${buyIn.toLocaleString("en-AU")} play chips.`);
  });

  it("cashing out of a stack with no hand played records no session and changes nothing", async () => {
    const cookie = await register();
    const first = await ok(cookie, "/solo/cash-out");
    const second = await ok(cookie, "/solo/cash-out");
    expect(first.stack).toBe(first.buyIn);
    expect(second).toEqual(first);
  });

  it("cash out records the session and the next visit starts at the buy-in; not mid-hand", async () => {
    const cookie = await register();
    await ok(cookie, "/solo/deal", { ante: "10" });
    expect((await post(cookie, "/solo/cash-out")).status).toBe(400); // a hand is in play
    const after = await ok(cookie, "/solo/fold");
    expect(after.stack).toBe(after.buyIn - 10);
    const cashed = await ok(cookie, "/solo/cash-out");
    expect(cashed.stack).toBe(cashed.buyIn);
    expect(cashed.sessionNet).toBe(0);
    expect(cashed.last).toBeNull(); // the felt starts empty
  });

  it("call and fold with no hand in play are refused; a second deal while one is live is refused", async () => {
    const cookie = await register();
    expect((await post(cookie, "/solo/call")).status).toBe(400);
    expect((await post(cookie, "/solo/fold")).status).toBe(400);
    await ok(cookie, "/solo/deal", { ante: "5" });
    expect((await post(cookie, "/solo/deal", { ante: "5" })).status).toBe(400);
    expect((await hands(cookie))).toHaveLength(0);
  });

  it("a hand in progress survives a reload: the same cards come back", async () => {
    const cookie = await register();
    const dealt = await ok(cookie, "/solo/deal", { ante: "5" });
    const again = await soloView(cookie);
    expect(again.live).toEqual(dealt.live);
  });

  it("solo is signed-in only", async () => {
    for (const path of ["/solo", "/solo/view", "/solo/hands"]) {
      const res = await fetch(new URL(path, baseUrl), { redirect: "manual" });
      expect([303, 401], path).toContain(res.status);
    }
    const deal = await fetch(new URL("/solo/deal", baseUrl), { method: "POST", body: new URLSearchParams({ ante: "5" }), redirect: "manual" });
    expect([303, 401]).toContain(deal.status);
  });

  it("the page: presets 5, 10, 25, 50 and Max, Deal; then Call 2×a and Fold; then the result and Deal again / Cash out", async () => {
    const cookie = await register();
    const page = async () =>
      new JSDOM(await (await fetch(new URL("/solo", baseUrl), { headers: { cookie } })).text()).window.document;
    let doc = await page();
    const presets = [...doc.querySelectorAll("[data-ante-preset]")].map((b) => b.getAttribute("data-ante-preset"));
    expect(presets).toEqual(["5", "10", "25", "50", "max"]);
    const view = await soloView(cookie);
    expect(Number(doc.querySelector("[data-ante-preset=max]")!.getAttribute("data-value"))).toBe(view.maxAnte);
    expect(doc.querySelector("form[action='/solo/deal'] button[type=submit]")?.textContent?.trim()).toBe("Deal");
    // Stack and session net always shown, as numbers.
    expect(Number(doc.querySelector("[data-stack]")!.getAttribute("data-stack"))).toBe(view.stack);
    expect(Number(doc.querySelector("[data-session-net]")!.getAttribute("data-session-net"))).toBe(0);

    await ok(cookie, "/solo/deal", { ante: "25" });
    doc = await page();
    const callBtn = doc.querySelector("form[action='/solo/call'] button")!;
    // "Call 50": the amount in the label, parsed, is twice the ante.
    expect(Number(callBtn.textContent!.replace(/\D/g, ""))).toBe(50);
    expect(doc.querySelector("form[action='/solo/fold'] button")?.textContent?.trim()).toBe("Fold");
    expect(doc.querySelector("form[action='/solo/deal']")).toBeNull();

    await ok(cookie, "/solo/call");
    doc = await page();
    const result = doc.querySelector("[data-result]")!;
    const last = (await hands(cookie)).at(-1)!;
    expect(Number(result.getAttribute("data-net"))).toBe(last.net);
    expect(doc.querySelector("form[action='/solo/deal'] button[type=submit]")?.textContent?.trim()).toBe("Deal again");
    expect(doc.querySelector("form[action='/solo/cash-out'] button")?.textContent?.trim()).toBe("Cash out");
    // The dealer's cards are face up now, as many as the hand had.
    expect(doc.querySelectorAll("[data-dealer] .card:not(.back)")).toHaveLength(2);
  });

  it("the page works without JavaScript: a form POST redirects back to /solo", async () => {
    const cookie = await register();
    const res = await fetch(new URL("/solo/deal", baseUrl), {
      method: "POST",
      headers: { cookie },
      body: new URLSearchParams({ ante: "5" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/solo");
    expect((await soloView(cookie)).live?.ante).toBe(5);
  });

  it("Results: Against the house lists each player's solo net as the sum of their solo_hands rows, never summed with the table", async () => {
    const cookie = await register();
    for (let i = 0; i < 3; i++) {
      await ok(cookie, "/solo/deal", { ante: "5" });
      await ok(cookie, i === 0 ? "/solo/fold" : "/solo/call");
    }
    const rows = await hands(cookie);
    const net = rows.reduce((sum, h) => sum + h.net, 0);
    const doc = new JSDOM(await (await fetch(new URL("/results", baseUrl), { headers: { cookie } })).text()).window.document;
    // Two sections, Table first, then Against the house.
    const headings = [...doc.querySelectorAll("main h2")].map((h) => h.textContent?.trim());
    expect(headings.indexOf("Table")).toBeGreaterThanOrEqual(0);
    expect(headings.indexOf("Against the house")).toBeGreaterThan(headings.indexOf("Table"));
    const me = (await soloView(cookie)) && doc.querySelector("#house-ledger tr.you")!;
    expect(me).not.toBeNull();
    const cell = me.querySelector("[data-net]")!;
    expect(Number(cell.getAttribute("data-net"))).toBe(net);
    expect(Number(cell.textContent!.replace("−", "-").replace(/[,+]/g, ""))).toBe(net);
    expect(Number(me.querySelector("[data-hands]")!.getAttribute("data-hands"))).toBe(rows.length);
    // This player never played the table: no row for them in the table ledger.
    const myId = me.getAttribute("data-user-id");
    expect(doc.querySelector(`#ledger tr[data-user-id="${myId}"]`)).toBeNull();
    // The last 20 solo hands list.
    expect(doc.querySelectorAll("#house-recent tbody tr").length).toBeGreaterThan(0);
  });

  it("home offers Play the house, linking to /solo", async () => {
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl))).text()).window.document;
    const link = [...doc.querySelectorAll("main a")].find((a) => a.textContent?.trim() === "Play the house");
    expect(link).toBeDefined();
    expect(new URL(link!.getAttribute("href")!, baseUrl).pathname).toBe("/solo");
  });
});

// With a fixed deck: the qualification boundary and each paytable category
// end to end, through the routes and the stored hand. Decks are player 2,
// dealer 2, board 5 (rules.ts's deal()).
describe.skipIf(!isLocal || !hooks)("solo with a fixed deck (needs TEST_HOOKS=1)", () => {
  const cases: { name: string; deck: string[]; outcome: string; multiple?: number; qualified?: boolean }[] = [
    { name: "royal flush pays 100", deck: ["As", "Ks", "3h", "8d", "Qs", "Js", "Ts", "2d", "7c"], outcome: "no_qualify", multiple: 100 },
    { name: "5-high straight flush pays 20", deck: ["5h", "4h", "7s", "8c", "Ah", "3h", "2h", "9c", "Kd"], outcome: "no_qualify", multiple: 20 },
    { name: "four of a kind pays 10", deck: ["8s", "8h", "3c", "7d", "8d", "8c", "Kd", "2s", "5h"], outcome: "player_wins", multiple: 10 },
    { name: "full house pays 3", deck: ["9s", "9h", "3c", "7d", "9d", "Kc", "Kh", "2s", "4d"], outcome: "player_wins", multiple: 3 },
    { name: "flush pays 2", deck: ["Ac", "7c", "3h", "5s", "Kc", "9c", "4c", "2d", "8h"], outcome: "no_qualify", multiple: 2 },
    { name: "straight pays 1", deck: ["6s", "7h", "Ac", "4s", "8d", "9c", "Td", "2s", "Kh"], outcome: "no_qualify", multiple: 1 },
    { name: "dealer wins", deck: ["2c", "3d", "Ah", "Qc", "Ks", "Kh", "9d", "7s", "4c"], outcome: "dealer_wins" },
    { name: "a push", deck: ["2c", "3d", "4h", "5s", "As", "Ks", "Qd", "Jh", "Tc"], outcome: "push" },
    // The boundary, as seven-card dealer hands: a pair of threes with A-K-Q
    // high doesn't qualify (5746); the weakest seven-card pair of fours,
    // 4-4-8-7-5 (+3, 2: 5727, found by trying every one), does.
    { name: "dealer 3-3 A-K-Q doesn't qualify", deck: ["9c", "8c", "3s", "3h", "Ad", "Kc", "Qh", "7s", "2d"], outcome: "no_qualify", qualified: false },
    { name: "dealer 4-4 8-7-5 qualifies", deck: ["9s", "9c", "4s", "4h", "8d", "7c", "5h", "3s", "2d"], outcome: "player_wins", qualified: true },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const cookie = await register();
      await setDeck(cookie, c.deck);
      const ante = 10;
      await ok(cookie, "/solo/deal", { ante: String(ante) });
      const view = await ok(cookie, "/solo/call");
      const [player, dealer, board] = [c.deck.slice(0, 2), c.deck.slice(2, 4), c.deck.slice(4)];
      expect(view.last!.player).toEqual(player);
      expect(view.last!.dealer).toEqual(dealer);
      expect(view.last!.board).toEqual(board);
      expect(view.last!.outcome).toBe(c.outcome);
      const expected =
        c.outcome === "dealer_wins" ? -3 * ante : c.outcome === "push" ? 0 : c.outcome === "player_wins" ? ante * (c.multiple ?? 1) + 2 * ante : ante * (c.multiple ?? 1);
      expect(view.last!.net).toBe(expected);
      expect(view.stack).toBe(view.buyIn + expected);
      if (c.qualified !== undefined) {
        const h = (await hands(cookie)).at(-1)! as SoloHand & { dealer_qualified: number };
        expect(h.dealer_qualified).toBe(c.qualified ? 1 : 0);
      }
    });
  }
});

// The result line names a royal as one, and says whose hand is whose when
// both are the same kind. Read from the page's DOM.
describe.skipIf(!isLocal || !hooks)("solo result line (needs TEST_HOOKS=1)", () => {
  async function resultAfterCall(deck: string[]): Promise<string> {
    const cookie = await register();
    await setDeck(cookie, deck);
    await ok(cookie, "/solo/deal", { ante: "10" });
    await ok(cookie, "/solo/call");
    const doc = new JSDOM(await (await fetch(new URL("/solo", baseUrl), { headers: { cookie } })).text()).window.document;
    return doc.querySelector("[data-result]")!.textContent!;
  }
  it("a royal is named, and the ante's multiple is the paytable's", async () => {
    expect(await resultAfterCall(["As", "Ks", "3h", "8d", "Qs", "Js", "Ts", "2d", "7c"])).toBe(
      "Dealer doesn't qualify. Ante pays 100:1. +1,000",
    );
  });
  it("a pair against a pair says whose is whose", async () => {
    expect(await resultAfterCall(["9s", "9c", "4s", "4h", "8d", "7c", "5h", "3s", "2d"])).toBe(
      "Your pair beats the dealer's pair. +30",
    );
  });
});

// The deck hook must not exist in the build that ships: CI runs the image
// with NODE_ENV=production. A valid request (JSON, a signed-in user, a full
// deck) would get 200 from a mounted route, so only a missing one answers 404.
describe.skipIf(!isLocal)("solo deck hook in production", () => {
  it.skipIf(hooks)("the test-only deck route doesn't exist in this build", async () => {
    const cookie = await register();
    const deck: string[] = [];
    for (const r of "23456789TJQKA") for (const s of "shdc") deck.push(r + s);
    const res = await fetch(new URL("/test-hooks/solo/deck", baseUrl), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ deck }),
    });
    expect(res.status).toBe(404);
  });
});
