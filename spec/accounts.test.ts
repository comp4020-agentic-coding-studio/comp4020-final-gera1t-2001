import { JSDOM } from "jsdom";
import { randomBytes } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

import { MESSAGES, PASSWORD_RULES } from "../src/account-messages.ts";

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

  it("the register form excludes a chosen question from the other select", async () => {
    // Server render of a failed submit with question 1 chosen: that option is
    // disabled in select 2. (The live exclusion as you pick is checked in a
    // real browser; this is the no-JS half.)
    const { res } = await register({ questionKeys: ["first_dish", "first_dish"] });
    const doc = new JSDOM(await res.text()).window.document;
    const disabledIn2 = [...doc.querySelectorAll<HTMLOptionElement>("#question_2 option")]
      .filter((o) => o.disabled)
      .map((o) => o.value);
    expect(disabledIn2).toContain("first_dish");
    expect(fieldErrors(doc, "question_2").messages).toEqual([MESSAGES.questionsSame]);
  });
});
