import { JSDOM } from "jsdom";
import { randomBytes } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

import { GUEST_LIMIT, GUEST_LIMIT_WINDOW_MS, MESSAGES, PASSWORD_RULES } from "../src/account-messages.ts";
import { limitKey } from "../src/guest-limit.ts";
import { GUEST_ANIMALS, avatarLetter, guestDisplayName } from "../src/guest-names.ts";
import { GUEST_SESSION_SLIDE_BELOW_MS, SESSION_LIFETIME_MS } from "../src/sessions.ts";
import { placeholderQuestionsForUsername } from "../src/security-questions.ts";

// These tests register real accounts against the running app, so they must
// never run against the live deployment — only a local instance (which is
// what CI points APP_URL at too, per spec/global-setup.ts).
const baseUrl = inject("baseUrl");
const isLocal = ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);

const VALID_PASSWORD = "Correct1!Horse";
const QUESTION_KEYS: [string, string] = ["first_dish", "childhood_nickname"];
const ANSWERS: [string, string] = ["Pasta", "Buddy"];

function randomUsername(): string {
  return `user_${randomBytes(6).toString("hex")}`;
}

function sessionCookieFrom(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("session="))?.split(";")[0];
}

interface RegisterOptions {
  username?: string;
  password?: string;
  displayName?: string;
  bio?: string;
  questionKeys?: [string, string];
  answers?: [string, string];
}

async function register(
  opts: RegisterOptions = {},
): Promise<{ res: Response; username: string; sessionCookie: string | undefined }> {
  const username = opts.username ?? randomUsername();
  const [q1, q2] = opts.questionKeys ?? QUESTION_KEYS;
  const [a1, a2] = opts.answers ?? ANSWERS;
  const body = new URLSearchParams({
    username,
    password: opts.password ?? VALID_PASSWORD,
    display_name: opts.displayName ?? "",
    bio: opts.bio ?? "",
    question_1: q1,
    answer_1: a1,
    question_2: q2,
    answer_2: a2,
  });
  const res = await fetch(new URL("/register", baseUrl), { method: "POST", body, redirect: "manual" });
  return { res, username, sessionCookie: sessionCookieFrom(res) };
}

async function login(
  username: string,
  password: string,
): Promise<{ res: Response; sessionCookie: string | undefined }> {
  const body = new URLSearchParams({ username, password });
  const res = await fetch(new URL("/login", baseUrl), { method: "POST", body, redirect: "manual" });
  return { res, sessionCookie: sessionCookieFrom(res) };
}

async function profileDom(cookie: string): Promise<Document> {
  const res = await fetch(new URL("/profile", baseUrl), { headers: { cookie } });
  return new JSDOM(await res.text()).window.document;
}

function errorMessages(html: string): string[] {
  const doc = new JSDOM(html).window.document;
  return [...doc.querySelectorAll('[role="alert"] li')].map((li) => li.textContent?.trim() ?? "");
}

// The message a field shows, found the way a screen reader would: take the
// input, follow each id in its aria-describedby, and read the node it names.
// Returns only the nodes that are errors (class field-error), so a hint that
// happens to share the attribute isn't mistaken for one.
function fieldErrors(doc: Document, inputId: string): { invalid: string | null; messages: string[] } {
  const input = doc.getElementById(inputId);
  const ids = (input?.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
  const messages = ids
    .map((id) => doc.getElementById(id))
    .filter((el): el is HTMLElement => !!el && el.classList.contains("field-error"))
    .map((el) => el.textContent?.trim() ?? "");
  return { invalid: input?.getAttribute("aria-invalid") ?? null, messages };
}

describe.skipIf(!isLocal)("accounts (writes test data — local only)", () => {
  it("trace persists: a saved bio shows up after logging in again with a fresh session", async () => {
    const bio = `bio-${randomBytes(4).toString("hex")}`;
    const { username, sessionCookie } = await register({ bio });
    expect(sessionCookie).toBeDefined();

    const fresh = await login(username, VALID_PASSWORD);
    expect(fresh.sessionCookie).toBeDefined();

    const doc = await profileDom(fresh.sessionCookie!);
    const bioField = doc.querySelector<HTMLTextAreaElement>("#bio");
    expect(bioField?.value).toBe(bio);
  });

  it("a second registration with the same username is rejected", async () => {
    const { username } = await register();
    const { res } = await register({ username });
    expect(res.status).toBe(400);
  });

  it("a wrong password does not create a session", async () => {
    const { username } = await register();
    const { res, sessionCookie } = await login(username, "WrongPassword1!");
    expect(res.status).toBe(400);
    expect(sessionCookie).toBeUndefined();
  });

  it("editing a profile without a valid session is rejected and changes nothing", async () => {
    const { sessionCookie } = await register({ displayName: "Original Name", bio: "original bio" });

    const res = await fetch(new URL("/profile", baseUrl), {
      method: "POST",
      body: new URLSearchParams({ display_name: "Hacked", bio: "hacked bio" }),
      redirect: "manual",
    });
    expect(res.status).toBe(303);

    const doc = await profileDom(sessionCookie!);
    expect(doc.querySelector<HTMLInputElement>("#display_name")?.value).toBe("Original Name");
    expect(doc.querySelector<HTMLTextAreaElement>("#bio")?.value).toBe("original bio");
  });

  it("one wrong answer (the other correct) does not change the password and names no answer", async () => {
    const { username } = await register();
    const res = await fetch(new URL("/reset-password", baseUrl), {
      method: "POST",
      body: new URLSearchParams({
        username,
        answer_1: "WRONG",
        answer_2: ANSWERS[1],
        new_password: "NewPass1!zzz",
        confirm_password: "NewPass1!zzz",
      }),
    });
    expect(res.status).toBe(400);
    expect(errorMessages(await res.text())).toEqual([MESSAGES.answersWrong]);

    const { res: oldLogin } = await login(username, VALID_PASSWORD);
    expect(oldLogin.status).toBe(303);
  });

  it("all answers correct resets the password, invalidates the old session, and retires the old password", async () => {
    const { username, sessionCookie: oldSession } = await register();
    const newPassword = "FreshPass1!xyz";

    const res = await fetch(new URL("/reset-password", baseUrl), {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        username,
        answer_1: ANSWERS[0],
        answer_2: ANSWERS[1],
        new_password: newPassword,
        confirm_password: newPassword,
      }),
    });
    // A successful reset goes to the log-in page with its success note.
    expect(res.status).toBe(303);
    const location = new URL(res.headers.get("location")!, baseUrl);
    expect(location.pathname).toBe("/login");
    const loginDoc = new JSDOM(await (await fetch(location)).text()).window.document;
    expect(loginDoc.querySelector('[role="status"]')?.textContent).toBe(MESSAGES.passwordChanged);

    const staleProfile = await fetch(new URL("/profile", baseUrl), {
      headers: { cookie: oldSession! },
      redirect: "manual",
    });
    expect(staleProfile.status).toBe(303);

    const { res: oldLogin } = await login(username, VALID_PASSWORD);
    expect(oldLogin.status).toBe(400);

    const { res: newLogin } = await login(username, newPassword);
    expect(newLogin.status).toBe(303);
  });

  it("after 5 failed attempts, even all-correct answers are refused", async () => {
    const { username } = await register();
    const attempt = (answer1: string, answer2: string) =>
      fetch(new URL("/reset-password", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          username,
          answer_1: answer1,
          answer_2: answer2,
          new_password: "Whatever1!abc",
          confirm_password: "Whatever1!abc",
        }),
      });

    for (let i = 0; i < 5; i++) {
      const res = await attempt("WRONG", "WRONG");
      expect(res.status).toBe(400);
    }

    const locked = await attempt(ANSWERS[0], ANSWERS[1]);
    expect(locked.status).toBe(400);
    // The lock-out says when to try again as a <time>; read its datetime,
    // which must be a real instant in the future, rather than matching text.
    const lockedDoc = new JSDOM(await locked.text()).window.document;
    expect(lockedDoc.querySelector('[role="alert"]')?.textContent).toContain(MESSAGES.lockedOut);
    const until = new Date(lockedDoc.querySelector("time")!.getAttribute("datetime")!);
    expect(until.getTime()).toBeGreaterThan(Date.now());
  });

  // Each rule's own message is what the field says when only that rule fails,
  // so the checklist's wording and the server's can't drift apart.
  it.each([
    ["lower", "ALLUPPER1!"],
    ["upper", "alllower1!"],
    ["digit", "NoDigitsHere!"],
    ["symbol", "NoPunctHere1"],
    ["length", "Ab1!"],
  ])("a password failing only the %s rule is rejected with that rule's message", async (key, password) => {
    const { res } = await register({ password });
    expect(res.status).toBe(400);
    const doc = new JSDOM(await res.text()).window.document;
    const rule = PASSWORD_RULES.find((r) => r.key === key)!;
    expect(fieldErrors(doc, "password").messages).toEqual([rule.message]);
  });

  it("registering with two identical security questions is rejected", async () => {
    const { res } = await register({ questionKeys: ["first_dish", "first_dish"] });
    expect(res.status).toBe(400);
  });

  it("registering with a security question outside the fixed list is rejected", async () => {
    const { res } = await register({ questionKeys: ["first_dish", "not_a_real_question_key"] });
    expect(res.status).toBe(400);
  });

  it("registering without `next` lands on the table; an unsafe `next` does too", async () => {
    const plain = await register();
    expect(plain.res.status).toBe(303);
    expect(new URL(plain.res.headers.get("location")!, baseUrl).pathname).toBe("/tables/1");

    for (const unsafe of ["https://evil.example/", "//evil.example/", "/\\\\evil"]) {
      const username = randomUsername();
      const res = await fetch(new URL("/register", baseUrl), {
        method: "POST",
        redirect: "manual",
        body: new URLSearchParams({
          username,
          password: VALID_PASSWORD,
          question_1: QUESTION_KEYS[0],
          answer_1: ANSWERS[0],
          question_2: QUESTION_KEYS[1],
          answer_2: ANSWERS[1],
          next: unsafe,
        }),
      });
      expect(new URL(res.headers.get("location")!, baseUrl).pathname).toBe("/tables/1");
    }

    const safe = await fetch(new URL("/register", baseUrl), {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        username: randomUsername(),
        password: VALID_PASSWORD,
        question_1: QUESTION_KEYS[0],
        answer_1: ANSWERS[0],
        question_2: QUESTION_KEYS[1],
        answer_2: ANSWERS[1],
        next: "/readme/",
      }),
    });
    expect(new URL(safe.headers.get("location")!, baseUrl).pathname).toBe("/readme/");
  });

  it("logging in without `next` lands on the table; an unsafe `next` does too", async () => {
    const { username } = await register();
    const go = async (next?: string) => {
      const body = new URLSearchParams({ username, password: VALID_PASSWORD });
      if (next !== undefined) body.set("next", next);
      const res = await fetch(new URL("/login", baseUrl), { method: "POST", body, redirect: "manual" });
      expect(res.status).toBe(303);
      return new URL(res.headers.get("location")!, baseUrl);
    };
    expect((await go()).pathname).toBe("/tables/1");
    expect((await go("https://evil.example/")).pathname).toBe("/tables/1");
    expect((await go("//evil.example/")).pathname).toBe("/tables/1");
    expect((await go("/readme/")).pathname).toBe("/readme/");
  });

  it("a wrong login shows one generic error on the password field, keeps the username, drops the password", async () => {
    const { username } = await register();
    const res = await fetch(new URL("/login", baseUrl), {
      method: "POST",
      body: new URLSearchParams({ username, password: "WrongPassword1!" }),
    });
    expect(res.status).toBe(400);
    const doc = new JSDOM(await res.text()).window.document;
    expect(errorMessages(doc.documentElement.outerHTML)).toEqual([MESSAGES.loginMismatch]);
    expect(fieldErrors(doc, "password")).toEqual({ invalid: "true", messages: [MESSAGES.loginMismatch] });
    expect(doc.querySelector<HTMLInputElement>("#username")?.value).toBe(username);
    expect(doc.querySelector<HTMLInputElement>("#password")?.getAttribute("value")).toBeNull();
  });

  it("a failed login looks the same for an unknown username and a wrong password", async () => {
    const { username } = await register();
    const fail = async (user: string) => {
      const res = await fetch(new URL("/login", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ username: user, password: "WrongPassword1!" }),
      });
      const doc = new JSDOM(await res.text()).window.document;
      // The echoed username is the one allowed difference: blank it, then the
      // whole page (error text, which field carries it, aria wiring) must match.
      doc.querySelector("#username")!.setAttribute("value", "");
      return { status: res.status, setCookie: res.headers.getSetCookie(), html: doc.documentElement.outerHTML };
    };
    const real = await fail(username);
    const unknown = await fail(`nobody_${randomBytes(5).toString("hex")}`);
    expect(real.status).toBe(400);
    expect(unknown).toEqual(real);
    // Guard against comparing two empty or error-free pages.
    expect(real.html).toContain(MESSAGES.loginMismatch);
  });

  it("a failed register shows the field's error inside that field's aria-describedby target", async () => {
    const { username } = await register();
    // Same username again, plus a password failing one rule.
    const { res } = await register({ username, password: "alllower1!" });
    expect(res.status).toBe(400);
    const doc = new JSDOM(await res.text()).window.document;

    const usernameField = fieldErrors(doc, "username");
    expect(usernameField.invalid).toBe("true");
    expect(usernameField.messages).toEqual([MESSAGES.usernameTaken]);

    const passwordField = fieldErrors(doc, "password");
    expect(passwordField.invalid).toBe("true");
    expect(passwordField.messages).toHaveLength(1);

    // A field with no problem is neither invalid nor described by an error.
    expect(fieldErrors(doc, "display_name")).toEqual({ invalid: null, messages: [] });

    // The summary counts the same errors and each item links to its field.
    const summary = doc.querySelector("[data-summary]")!;
    const links = [...summary.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toEqual(["#username", "#password"]);
    for (const href of links) expect(doc.getElementById(href!.slice(1))).not.toBeNull();
    expect(summary.querySelector("strong")?.textContent).toBe("Fix 2 things to continue");
  });

  it("the register form has no bio field, but a POST that includes bio still saves it", async () => {
    const res = await fetch(new URL("/register", baseUrl));
    const doc = new JSDOM(await res.text()).window.document;
    expect(doc.querySelector('[name="bio"]')).toBeNull();

    const bio = `bio-${randomBytes(4).toString("hex")}`;
    const { sessionCookie } = await register({ bio });
    expect(sessionCookie).toBeDefined();
    const profile = await profileDom(sessionCookie!);
    expect(profile.querySelector<HTMLTextAreaElement>("#bio")?.value).toBe(bio);
  });

  it("a re-rendered register form hides each question from the other select but never disables its own choice", async () => {
    // Server-rendered half of the exclusion (the live half is checked in a
    // browser). A disabled option is not submitted, so a select whose chosen
    // option is disabled would post no question at all.
    const disabledValues = (doc: Document, id: string) =>
      [...doc.querySelectorAll<HTMLOptionElement>(`#${id} option`)].filter((o) => o.disabled).map((o) => o.value);
    const selectedDisabled = (doc: Document, id: string) => doc.querySelector<HTMLSelectElement>(`#${id}`)!.selectedOptions[0]?.disabled;

    // Two different questions, failing for another reason (weak password).
    const different = await register({ password: "weak", questionKeys: ["first_dish", "childhood_nickname"] });
    const d1 = new JSDOM(await different.res.text()).window.document;
    expect(disabledValues(d1, "question_2")).toContain("first_dish");
    expect(disabledValues(d1, "question_1")).toContain("childhood_nickname");
    expect(selectedDisabled(d1, "question_1")).toBe(false);
    expect(selectedDisabled(d1, "question_2")).toBe(false);

    // The same question twice: both selects keep their choice submittable.
    const same = await register({ questionKeys: ["first_dish", "first_dish"] });
    const d2 = new JSDOM(await same.res.text()).window.document;
    expect(fieldErrors(d2, "question_2").messages).toEqual([MESSAGES.questionsSame]);
    expect(selectedDisabled(d2, "question_1")).toBe(false);
    expect(selectedDisabled(d2, "question_2")).toBe(false);
    const submitted = [...new d2.defaultView!.FormData(d2.querySelector("form")!).keys()];
    expect(submitted).toEqual(expect.arrayContaining(["question_1", "question_2"]));
  });
});

// Brief 2 Step 11: the guest door. Nothing here sits at table 1 (those tests
// are in spec/poker.test.ts). Each guest is made from its own made-up
// Fly-Client-IP, the rate limit's key (src/guest-limit.ts), so the limit
// counts per test and repeated runs never use up localhost's budget; the
// limit test below uses one address on purpose.
function randomIp(): string {
  return `10.${[...randomBytes(3)].join(".")}`;
}

async function postGuest(
  opts: { next?: string; from?: string; ip?: string; cookie?: string } = {},
): Promise<{ res: Response; cookie: string | undefined; location: URL | undefined }> {
  const body = new URLSearchParams();
  if (opts.next !== undefined) body.set("next", opts.next);
  if (opts.from !== undefined) body.set("from", opts.from);
  const headers: Record<string, string> = { "Fly-Client-IP": opts.ip ?? randomIp() };
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await fetch(new URL("/guest", baseUrl), { method: "POST", body, headers, redirect: "manual" });
  const raw = res.headers.get("location");
  return { res, cookie: sessionCookieFrom(res), location: raw ? new URL(raw, baseUrl) : undefined };
}

// Who the profile page says a guest is: the generated username and display
// name, read from the claim panel's own data attributes.
async function guestIdentity(cookie: string): Promise<{ username: string; displayName: string }> {
  const doc = await profileDom(cookie);
  return {
    username: doc.querySelector("#claim [data-username]")?.textContent ?? "",
    displayName: doc.querySelector("#claim [data-display-name]")?.textContent ?? "",
  };
}

async function claim(cookie: string, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({
    password: VALID_PASSWORD,
    question_1: QUESTION_KEYS[0],
    answer_1: ANSWERS[0],
    question_2: QUESTION_KEYS[1],
    answer_2: ANSWERS[1],
    ...fields,
  });
  return fetch(new URL("/profile/claim", baseUrl), { method: "POST", body, headers: { cookie }, redirect: "manual" });
}

// Pure, so these run everywhere, CI included.
describe("guest display names (owner decision: an animal and two digits)", () => {
  it("every animal has its own avatar letter, and fits a phone's seat plate", () => {
    const letters = GUEST_ANIMALS.map(avatarLetter);
    expect(new Set(letters).size).toBe(GUEST_ANIMALS.length);
    for (const a of GUEST_ANIMALS) expect(a.length).toBeLessThanOrEqual(6);
  });

  it("picks an animal whose letter isn't taken while one is free, and digits 00-99", () => {
    // Every letter but Wombat's taken: Wombat is the only choice, whatever
    // the random picks are.
    const taken = new Set(GUEST_ANIMALS.map(avatarLetter).filter((l) => l !== "W"));
    for (const pick of [0, 7, 99]) {
      const name = guestDisplayName(taken, (n) => Math.min(pick, n - 1));
      expect(name.split(" ")[0]).toBe("Wombat");
      expect(Number(name.split(" ")[1])).toBe(Math.min(pick, 99));
    }
    expect(guestDisplayName(new Set(), () => 3)).toBe(`${GUEST_ANIMALS[3]} 03`);
    // All taken: still a name, from the whole list.
    const all = new Set(GUEST_ANIMALS.map(avatarLetter));
    expect(GUEST_ANIMALS).toContain(guestDisplayName(all, () => 0).split(" ")[0]);
  });
});

describe("the guest rate limit's key", () => {
  it("is the address for IPv4 (plain or IPv4-mapped) and the /64 for IPv6", () => {
    expect(limitKey("::ffff:203.0.113.7")).toBe(limitKey("203.0.113.7"));
    expect(limitKey("203.0.113.7")).not.toBe(limitKey("203.0.113.8"));
    // One /64, however it's written: the same key.
    expect(limitKey("2001:db8:0:0:1:2:3:4")).toBe(limitKey("2001:db8::ffff"));
    expect(limitKey("2001:DB8:0000:0000::1")).toBe(limitKey("2001:db8::2"));
    // The next /64 over: another key.
    expect(limitKey("2001:db8:0:1::1")).not.toBe(limitKey("2001:db8::1"));
  });
});

describe.skipIf(!isLocal)("guests (writes test data — local only)", () => {
  it("POST /guest signs in with a 30-day session and lands on a safe next, else the table", async () => {
    const plain = await postGuest();
    expect(plain.res.status).toBe(303);
    expect(plain.cookie).toBeDefined();
    expect(plain.location?.pathname).toBe("/tables/1");
    // The cookie's own expiry: 30 days from now, give or take the request.
    const setCookie = plain.res.headers.getSetCookie().find((c) => c.startsWith("session="))!;
    const expires = new Date(/expires=([^;]+)/i.exec(setCookie)![1]).getTime();
    const DAY = 24 * 60 * 60 * 1000;
    expect((expires - Date.now()) / DAY).toBeCloseTo(30, 1);

    const withNext = await postGuest({ next: "/results" });
    expect(withNext.location?.pathname).toBe("/results");
    const unsafe = await postGuest({ next: "//evil.example/x" });
    expect(unsafe.location?.origin).toBe(new URL(baseUrl).origin);
    expect(unsafe.location?.pathname).toBe("/tables/1");
  });

  // Browsers drop tab, CR and LF inside a URL, so "/\t/evil.example" is
  // followed as "//evil.example", off-site; a raw newline can't go in a
  // header at all. Each lands on the table, as a guest, with no 500.
  it("a next with control characters or a backslash is unsafe: the guest still lands on the table", async () => {
    for (const next of ["/\t/evil.example/x", "/\n/evil.example/x", "/\r\n/evil", "/\\evil.example", "/ok\u0000"]) {
      const { res, cookie, location } = await postGuest({ next });
      expect(res.status, JSON.stringify(next)).toBe(303);
      expect(cookie, JSON.stringify(next)).toBeDefined();
      expect(location?.origin).toBe(new URL(baseUrl).origin);
      expect(location?.pathname, JSON.stringify(next)).toBe("/tables/1");
    }
  });

  // A real browser sends Sec-Fetch-Site on every request. A cross-site form
  // POST carries no SameSite=Lax cookie, so without a check /guest would make
  // a new guest whose Set-Cookie replaces the visitor's (a guest's only key),
  // and /logout would delete it.
  it("a cross-site POST to /guest or /logout is refused and leaves the visitor's session alone", async () => {
    const { cookie } = await postGuest();
    const who = await guestIdentity(cookie!);
    for (const path of ["/guest", "/logout"]) {
      const res = await fetch(new URL(path, baseUrl), {
        method: "POST",
        body: new URLSearchParams(),
        headers: { "Sec-Fetch-Site": "cross-site", "Fly-Client-IP": randomIp() },
        redirect: "manual",
      });
      expect(res.status, path).toBe(403);
      expect(res.headers.getSetCookie(), path).toEqual([]);
    }
    expect(await guestIdentity(cookie!)).toEqual(who);
    // The same POSTs from the site itself still work.
    const own = await postGuest();
    expect(own.res.status).toBe(303);
  });

  it("two guests in a row get different usernames and display names, both guest-shaped", async () => {
    const a = await guestIdentity((await postGuest()).cookie!);
    const b = await guestIdentity((await postGuest()).cookie!);
    for (const g of [a, b]) {
      expect(g.username).toMatch(/^guest-[a-z2-7]{6}$/);
      // An animal from the list, then two digits.
      const [animal, digits] = g.displayName.split(" ");
      expect(GUEST_ANIMALS).toContain(animal);
      expect(digits).toMatch(/^\d{2}$/);
    }
    expect(a.username).not.toBe(b.username);
    expect(a.displayName).not.toBe(b.displayName);
  });

  it("a signed-in browser posting /guest makes no second account", async () => {
    const first = await postGuest();
    const before = await guestIdentity(first.cookie!);
    const again = await postGuest({ cookie: first.cookie });
    expect(again.res.status).toBe(303);
    expect(again.cookie).toBeUndefined(); // the session isn't replaced
    expect(await guestIdentity(first.cookie!)).toEqual(before);
  });

  it("over GUEST_LIMIT guests from one address in the window gets a 429 and the page it came from, with the message", async () => {
    const ip = randomIp();
    for (let i = 0; i < GUEST_LIMIT; i++) expect((await postGuest({ ip })).res.status).toBe(303);

    const fromLogin = await postGuest({ ip, next: "/tables/1" });
    expect(fromLogin.res.status).toBe(429);
    expect(fromLogin.cookie).toBeUndefined();
    const loginDoc = new JSDOM(await fromLogin.res.text()).window.document;
    expect(loginDoc.querySelector("main form[action='/login']")).not.toBeNull();
    expect(loginDoc.querySelector("[data-guest-error]")?.textContent?.trim()).toBe(MESSAGES.guestRateLimited);
    // The guest door still carries where they were headed.
    expect(loginDoc.querySelector<HTMLInputElement>(".guest-door input[name=next]")?.value).toBe("/tables/1");

    const fromRegister = await postGuest({ ip, from: "register" });
    expect(fromRegister.res.status).toBe(429);
    const regDoc = new JSDOM(await fromRegister.res.text()).window.document;
    expect(regDoc.querySelector("main form[action='/register']")).not.toBeNull();
    expect(regDoc.querySelector("[data-guest-error]")?.textContent?.trim()).toBe(MESSAGES.guestRateLimited);

    // Another address is unaffected.
    expect((await postGuest()).res.status).toBe(303);
  });

  // Only with a short window (GUEST_LIMIT_WINDOW_MS, set for the app and the
  // spec alike); CI uses the hour and skips it.
  it.skipIf(GUEST_LIMIT_WINDOW_MS > 5_000)(
    "once the window has passed, the same address may make guests again",
    { timeout: GUEST_LIMIT_WINDOW_MS + 15_000 },
    async () => {
      const ip = randomIp();
      for (let i = 0; i < GUEST_LIMIT; i++) await postGuest({ ip });
      expect((await postGuest({ ip })).res.status).toBe(429);
      await new Promise((r) => setTimeout(r, GUEST_LIMIT_WINDOW_MS + 200));
      expect((await postGuest({ ip })).res.status).toBe(303);
    },
  );

  it("log in and register offer Play as a guest, posting to /guest with next and the door's line", async () => {
    for (const path of ["/login", "/register"]) {
      const res = await fetch(new URL(`${path}?next=${encodeURIComponent("/tables/1")}`, baseUrl));
      const doc = new JSDOM(await res.text()).window.document;
      const door = doc.querySelector<HTMLFormElement>("form.guest-door")!;
      expect(door, path).not.toBeNull();
      expect(new URL(door.action, baseUrl).pathname).toBe("/guest");
      expect(door.method.toLowerCase()).toBe("post");
      expect(door.querySelector<HTMLInputElement>("input[name=next]")?.value).toBe("/tables/1");
      expect(door.querySelector("button[type=submit]")?.textContent?.trim()).toBe("Play as a guest");
      expect(door.querySelector(".why")?.textContent?.trim()).toBe(MESSAGES.guestDoor);
      // Under the primary button: the door comes after the main form.
      const mainForm = doc.querySelector(`main form[action='${path}']`)!;
      expect(mainForm.compareDocumentPosition(door) & doc.defaultView!.Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("a guest's header shows their name and a Claim account link to the profile", async () => {
    const { cookie } = await postGuest();
    const { displayName } = await guestIdentity(cookie!);
    const doc = new JSDOM(await (await fetch(new URL("/", baseUrl), { headers: { cookie: cookie! } })).text()).window
      .document;
    const nav = doc.querySelector(".site-nav")!;
    expect(nav.querySelector(".guest-name")?.textContent).toBe(displayName);
    const claimLink = [...nav.querySelectorAll("a")].find((a) => a.textContent?.trim() === "Claim account");
    expect(claimLink).toBeDefined();
    expect(new URL(claimLink!.getAttribute("href")!, baseUrl).pathname).toBe("/profile");
    // A registered user's header has neither.
    const { sessionCookie } = await register();
    const regDoc = new JSDOM(await (await fetch(new URL("/", baseUrl), { headers: { cookie: sessionCookie! } })).text())
      .window.document;
    expect(regDoc.querySelector(".site-nav .guest-name")).toBeNull();
    expect([...regDoc.querySelectorAll(".site-nav a")].some((a) => a.textContent?.trim() === "Claim account")).toBe(false);
  });

  it("a guest's Log out goes to a warning page with Claim it first and Log out anyway, and no confirm()", async () => {
    const { cookie } = await postGuest();
    const home = new JSDOM(await (await fetch(new URL("/", baseUrl), { headers: { cookie: cookie! } })).text()).window
      .document;
    const logoutLink = [...home.querySelectorAll(".site-nav a")].find((a) => a.textContent?.trim() === "Log out")!;
    expect(new URL(logoutLink.getAttribute("href")!, baseUrl).pathname).toBe("/logout");

    const res = await fetch(new URL("/logout", baseUrl), { headers: { cookie: cookie! }, redirect: "manual" });
    expect(res.status).toBe(200);
    const html = await res.text();
    const doc = new JSDOM(html).window.document;
    expect(doc.querySelector("main .lede")?.textContent?.trim()).toBe(MESSAGES.guestLogout);
    const claimFirst = [...doc.querySelectorAll("main a")].find((a) => a.textContent?.trim() === "Claim it first")!;
    expect(new URL(claimFirst.getAttribute("href")!, baseUrl).pathname).toBe("/profile");
    const anyway = [...doc.querySelectorAll("main form")].find(
      (f) => f.querySelector("button")?.textContent?.trim() === "Log out anyway",
    ) as HTMLFormElement;
    expect(new URL(anyway.action, baseUrl).pathname).toBe("/logout");
    expect(anyway.method.toLowerCase()).toBe("post");
    expect(html).not.toMatch(/confirm\s*\(/);

    // The GET logged no one out; the POST does.
    expect((await guestIdentity(cookie!)).username).toMatch(/^guest-/);
    await fetch(new URL("/logout", baseUrl), { method: "POST", headers: { cookie: cookie! }, redirect: "manual" });
    const after = await fetch(new URL("/profile", baseUrl), { headers: { cookie: cookie! }, redirect: "manual" });
    expect(after.status).toBe(303);
  });

  it("claiming with a taken username shows the register page's error inside that field's aria-describedby target", async () => {
    const { username: taken } = await register();
    const { cookie } = await postGuest();
    const res = await claim(cookie!, { username: taken, password: "alllower1!" });
    expect(res.status).toBe(400);
    const doc = new JSDOM(await res.text()).window.document;
    expect(fieldErrors(doc, "username")).toEqual({ invalid: "true", messages: [MESSAGES.usernameTaken] });
    // The password's error is the register page's too: one message per
    // unmet rule, from the same rules.
    const unmet = PASSWORD_RULES.filter((r) => !new RegExp(r.pattern).test("alllower1!")).map((r) => r.message);
    expect(fieldErrors(doc, "password")).toEqual({ invalid: "true", messages: [unmet.join(" ")] });
    expect(fieldErrors(doc, "answer_1")).toEqual({ invalid: null, messages: [] });
    // Still a guest, with the name it had.
    expect((await guestIdentity(cookie!)).username).toMatch(/^guest-/);
  });

  it("forgot password treats a guest's username exactly like an unknown one", async () => {
    const { cookie } = await postGuest();
    const { username } = await guestIdentity(cookie!);
    const questionsShown = async (user: string): Promise<string[]> => {
      const res = await fetch(new URL("/forgot-password", baseUrl), {
        method: "POST",
        body: new URLSearchParams({ username: user }),
      });
      const doc = new JSDOM(await res.text()).window.document;
      return [...doc.querySelectorAll("form[action='/reset-password'] label")]
        .map((l) => l.textContent?.trim() ?? "")
        .filter((t) => !/password/i.test(t));
    };
    // Two plausible questions: the placeholders an unknown username gets.
    expect(await questionsShown(username)).toEqual(placeholderQuestionsForUsername(username).map((q) => q.text));

    // Every reset attempt fails generically, and never locks (no attempt is
    // counted against a guest, as none is against an unknown name).
    const reset = async (user: string) => {
      const res = await fetch(new URL("/reset-password", baseUrl), {
        method: "POST",
        body: new URLSearchParams({
          username: user,
          answer_1: "x",
          answer_2: "y",
          new_password: "NewPass1!zzz",
          confirm_password: "NewPass1!zzz",
        }),
      });
      const doc = new JSDOM(await res.text()).window.document;
      return { status: res.status, answer1: fieldErrors(doc, "answer_1"), alerts: errorMessages(doc.documentElement.outerHTML) };
    };
    const unknown = await reset(`nobody_${randomBytes(5).toString("hex")}`);
    expect(unknown.answer1.messages).toEqual([MESSAGES.answersWrong]);
    for (let i = 0; i < 6; i++) expect(await reset(username)).toEqual(unknown);
    // And the guest's own session is untouched.
    expect((await guestIdentity(cookie!)).username).toBe(username);
  });
});

// Owner decision (4 Nov 2026, after Step 11): a guest session with under
// GUEST_SESSION_SLIDE_BELOW_MS left is extended, on any request, to
// SESSION_LIFETIME_MS from now. The test-only session hook (src/server.ts;
// TEST_HOOKS=1, never in production) moves a session's expiry, which is the
// only way to reach day 15 inside a test.
describe.skipIf(!isLocal || process.env.TEST_HOOKS !== "1")("guest sessions slide (needs TEST_HOOKS=1)", () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function expiry(cookie: string, set?: Date): Promise<number> {
    const res = await fetch(new URL("/test-hooks/session", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(set ? { expiresAt: set.toISOString() } : {}),
    });
    if (!res.ok) throw new Error(`session hook failed: ${res.status} (is the app running with TEST_HOOKS=1?)`);
    return new Date(((await res.json()) as { expiresAt: string }).expiresAt).getTime();
  }

  // Any ordinary request; the slide happens before the route runs.
  async function visit(cookie: string): Promise<Response> {
    return fetch(new URL("/", baseUrl), { headers: { cookie } });
  }

  const cookieExpiry = (res: Response): number | undefined => {
    const c = res.headers.getSetCookie().find((h) => h.startsWith("session="));
    return c ? new Date(/expires=([^;]+)/i.exec(c)![1]).getTime() : undefined;
  };

  it("a guest session with under 15 days left is extended to 30 days from now, in the database and the cookie", async () => {
    const { cookie } = await postGuest();
    await expiry(cookie!, new Date(Date.now() + GUEST_SESSION_SLIDE_BELOW_MS - DAY)); // 14 days left
    const res = await visit(cookie!);
    const after = await expiry(cookie!);
    expect((after - Date.now()) / DAY).toBeCloseTo(SESSION_LIFETIME_MS / DAY, 1);
    // The browser is told too, with the same token: the cookie's own expiry
    // moves, to within a second of the stored one (cookies carry seconds).
    const sent = res.headers.getSetCookie().find((h) => h.startsWith("session="))!;
    expect(sent.split(";")[0]).toBe(cookie);
    expect(Math.abs(cookieExpiry(res)! - after)).toBeLessThan(1000);
    // Still the same guest.
    expect((await guestIdentity(cookie!)).username).toMatch(/^guest-/);
  });

  it("with 15 days or more left nothing moves, and no cookie is sent", async () => {
    const { cookie } = await postGuest();
    const set = new Date(Date.now() + GUEST_SESSION_SLIDE_BELOW_MS + DAY); // 16 days left
    await expiry(cookie!, set);
    const res = await visit(cookie!);
    expect(cookieExpiry(res)).toBeUndefined();
    expect(await expiry(cookie!)).toBe(set.getTime());
  });

  it("a registered account's session doesn't slide", async () => {
    const { sessionCookie } = await register();
    const set = new Date(Date.now() + DAY); // 1 day left
    await expiry(sessionCookie!, set);
    const res = await visit(sessionCookie!);
    expect(cookieExpiry(res)).toBeUndefined();
    expect(await expiry(sessionCookie!)).toBe(set.getTime());
  });

  it("an expired guest session isn't brought back", async () => {
    const { cookie } = await postGuest();
    const set = new Date(Date.now() - 1000);
    await expiry(cookie!, set);
    const res = await visit(cookie!);
    expect(cookieExpiry(res)).toBeUndefined();
    expect(await expiry(cookie!)).toBe(set.getTime());
    const profile = await fetch(new URL("/profile", baseUrl), { headers: { cookie: cookie! }, redirect: "manual" });
    expect(profile.status).toBe(303); // signed out
  });

  it("a claimed account's session stops sliding", async () => {
    const { cookie } = await postGuest();
    const claimed = await claim(cookie!, { username: `claim_${randomBytes(5).toString("hex")}` });
    expect(claimed.status).toBe(303);
    const newCookie = sessionCookieFrom(claimed)!;
    const set = new Date(Date.now() + DAY);
    await expiry(newCookie, set);
    await visit(newCookie);
    expect(await expiry(newCookie)).toBe(set.getTime());
  });
});
