import { JSDOM } from "jsdom";
import { randomBytes } from "node:crypto";
import { describe, expect, inject, it } from "vitest";

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
  return [...doc.querySelectorAll('[role="alert"] li')].map((li) => li.textContent ?? "");
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
    expect(errorMessages(await res.text())).toEqual(["One or more answers were incorrect."]);

    const { res: oldLogin } = await login(username, VALID_PASSWORD);
    expect(oldLogin.status).toBe(303);
  });

  it("all answers correct resets the password, invalidates the old session, and retires the old password", async () => {
    const { username, sessionCookie: oldSession } = await register();
    const newPassword = "FreshPass1!xyz";

    const res = await fetch(new URL("/reset-password", baseUrl), {
      method: "POST",
      body: new URLSearchParams({
        username,
        answer_1: ANSWERS[0],
        answer_2: ANSWERS[1],
        new_password: newPassword,
        confirm_password: newPassword,
      }),
    });
    expect(res.status).toBe(200);

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
    expect((await locked.text()).toLowerCase()).toContain("too many failed attempts");
  });

  it.each([
    ["lowercase letter", "ALLUPPER1!", "lowercase letter"],
    ["uppercase letter", "alllower1!", "uppercase letter"],
    ["digit", "NoDigitsHere!", "digit"],
    ["punctuation mark", "NoPunctHere1", "punctuation mark"],
  ])("a password missing a %s is rejected and says so", async (_label, password, expectedPhrase) => {
    const { res } = await register({ password });
    expect(res.status).toBe(400);
    expect(errorMessages(await res.text()).join(" ")).toContain(expectedPhrase);
  });

  it("registering with two identical security questions is rejected", async () => {
    const { res } = await register({ questionKeys: ["first_dish", "first_dish"] });
    expect(res.status).toBe(400);
  });

  it("registering with a security question outside the fixed list is rejected", async () => {
    const { res } = await register({ questionKeys: ["first_dish", "not_a_real_question_key"] });
    expect(res.status).toBe(400);
  });
});
