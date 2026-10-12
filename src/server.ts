import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { marked } from "marked";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  RECOVERY_QUESTION_COUNT,
  createUser,
  findUserByUsername,
  getSecurityQuestions,
  isRecoveryLocked,
  listMembers,
  normaliseAnswer,
  recordFailedRecoveryAttempt,
  resetPassword,
  updateProfile,
} from "./accounts.ts";
import type { User } from "./accounts.ts";
import { hashSecret, spendDummyVerify, verifySecret } from "./crypto.ts";
import { errorList, escapeHtml, page } from "./html.ts";
import { renderTablePage } from "./poker/page.ts";
import {
  PokerError,
  applyAction,
  buildView,
  getHandResults,
  leave,
  restoreSchedulersOnBoot,
  sitDown,
  startHand,
  subscribeToTable,
} from "./poker/table.ts";
import {
  SECURITY_QUESTIONS,
  isValidQuestionKey,
  placeholderQuestionsForUsername,
  questionTextForKey,
} from "./security-questions.ts";
import { createSession, deleteSession, userForSessionToken } from "./sessions.ts";

// Opening the database here (src/db.ts) is what step 2/3 needed to show: the
// file lives under /data in production, with the schema applied on boot.
import "./db.ts";

// Re-arms every table's turn-timeout timer from table_state.turn_deadline —
// a table whose deadline already passed while the process was down gets its
// auto action immediately; every other table's future deadline is
// rescheduled. Must run after the "./db.ts" import above (migrations).
restoreSchedulersOnBoot();

const projectRoot = resolve(import.meta.dirname, "..");

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
const DISPLAY_NAME_MAX = 40;
const BIO_MAX = 160;
const PASSWORD_MIN = 8;
const PASSWORD_RULE_HINT = `At least ${PASSWORD_MIN} characters, including an uppercase letter, a lowercase letter, a digit, and a punctuation mark.`;
const SESSION_COOKIE = "session";

// One message per missing part, so the error says exactly what's missing
// rather than a single pass/fail verdict.
function passwordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN) {
    errors.push(`Password must be at least ${PASSWORD_MIN} characters.`);
  }
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter.");
  if (!/[0-9]/.test(password)) errors.push("Password must include a digit.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a punctuation mark.");
  return errors;
}

function currentUser(c: Context): User | undefined {
  const token = getCookie(c, SESSION_COOKIE);
  return token ? userForSessionToken(token) : undefined;
}

function signIn(c: Context, userId: number): void {
  const { token, expiresAt } = createSession(userId);
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    // Fly terminates TLS in front of the app, so the request the app sees is
    // plain HTTP even when the client used HTTPS — X-Forwarded-Proto is the
    // only place that's recorded.
    secure: c.req.header("X-Forwarded-Proto") === "https",
    path: "/",
    expires: new Date(expiresAt),
  });
}

// Only ever a same-site, root-relative path — never a scheme or a
// protocol-relative "//host" — so this can't be used to redirect a visitor
// off-site after they log in or register.
function safeNextPath(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw === "") return undefined;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.includes("://")) {
    return undefined;
  }
  return raw;
}

function nav(user: User | undefined, next?: string): string {
  // Carried onto the logged-out links too, so a visitor who lands on /login
  // from a protected page and then switches to /register (or back) doesn't
  // lose where they were headed.
  const suffix = next ? `?next=${encodeURIComponent(next)}` : "";
  return user
    ? `<nav>
        <a href="/">Home</a> | <a href="/tables/1">Table</a> | <a href="/profile">My profile</a> |
        <form method="post" action="/logout" style="display:inline">
          <button type="submit">Log out</button>
        </form>
      </nav>`
    : `<nav><a href="/">Home</a> | <a href="/tables/1">Table</a> | <a href="/login${suffix}">Log in</a> | <a href="/register${suffix}">Register</a></nav>`;
}

const app = new Hono();

app.get("/", (c) => {
  const members = listMembers();
  const items = members
    .map(
      (m) =>
        `<li><strong>${escapeHtml(m.display_name)}</strong>${m.bio ? ` — ${escapeHtml(m.bio)}` : ""}</li>`,
    )
    .join("");
  return c.html(
    page(
      "comp4020-final",
      `${nav(currentUser(c))}
      <main>
        <h1>Members</h1>
        <p>A Texas Hold'em table for friends. <a href="/tables/1">Join the table</a>.</p>
        ${members.length > 0 ? `<ul>${items}</ul>` : "<p>No one has registered yet.</p>"}
      </main>`,
    ),
  );
});

app.get("/readme", (c) => c.redirect("/readme/", 301));

app.get("/readme/", (c) => {
  const markdown = readFileSync(resolve(projectRoot, "README.md"), "utf8");
  return c.html(page("About this app", `<main>${marked.parse(markdown, { async: false })}</main>`));
});

// Relative links in README.md (e.g. an image) resolve against /readme/ once
// served, so a sibling file at the repo root has to answer at /readme/<name>
// too. Scoped to image extensions and to paths that stay under the repo
// root, so this can't be used to read arbitrary files (source, .env, etc).
const ASSET_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

app.get("/readme/:asset{.+}", (c) => {
  const asset = c.req.param("asset");
  const type = ASSET_TYPES[extname(asset).toLowerCase()];
  const target = resolve(projectRoot, asset);
  if (!type || !target.startsWith(projectRoot + "/") || !existsSync(target) || !statSync(target).isFile()) {
    return c.notFound();
  }
  return new Response(new Uint8Array(readFileSync(target)), { headers: { "content-type": type } });
});

// --- Register ---------------------------------------------------------

function registerForm(errors: string[], values: Record<string, string>, next?: string): string {
  const v = (k: string): string => escapeHtml(values[k] ?? "");
  const questionOptions = (selected: string): string =>
    `<option value="" disabled${selected ? "" : " selected"}>Choose a question</option>` +
    SECURITY_QUESTIONS.map(
      (q) =>
        `<option value="${escapeHtml(q.key)}"${q.key === selected ? " selected" : ""}>${escapeHtml(q.text)}</option>`,
    ).join("");
  const questionInputs = Array.from({ length: RECOVERY_QUESTION_COUNT }, (_, i) => {
    const n = i + 1;
    return `
      <p>
        <label for="question_${n}">Security question ${n}</label><br />
        <select id="question_${n}" name="question_${n}" required>${questionOptions(values[`question_${n}`] ?? "")}</select>
      </p>
      <p>
        <label for="answer_${n}">Answer ${n}</label><br />
        <input id="answer_${n}" name="answer_${n}" type="text" maxlength="200" required
          value="${v(`answer_${n}`)}" />
      </p>`;
  }).join("");

  return `
    ${errorList(errors)}
    <form method="post" action="/register">
      ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}" />` : ""}
      <p>
        <label for="username">Username (3-20 lowercase letters, numbers, underscore)</label><br />
        <input id="username" name="username" type="text" required pattern="[a-z0-9_]{3,20}"
          autocomplete="username" value="${v("username")}" />
      </p>
      <p>
        <label for="password">Password</label><br />
        <input id="password" name="password" type="password" required minlength="${PASSWORD_MIN}"
          autocomplete="new-password" aria-describedby="password-rule" /><br />
        <small id="password-rule">${escapeHtml(PASSWORD_RULE_HINT)}</small>
      </p>
      <p>
        <label for="display_name">Display name (optional — defaults to your username)</label><br />
        <input id="display_name" name="display_name" type="text" maxlength="${DISPLAY_NAME_MAX}"
          value="${v("display_name")}" />
      </p>
      <p>
        <label for="bio">Bio (optional)</label><br />
        <textarea id="bio" name="bio" maxlength="${BIO_MAX}">${v("bio")}</textarea>
      </p>
      ${questionInputs}
      <p>Choose two different questions.</p>
      <p><button type="submit">Register</button></p>
    </form>`;
}

app.get("/register", (c) => {
  const next = safeNextPath(c.req.query("next"));
  if (currentUser(c)) return c.redirect(next ?? "/profile", 303);
  return c.html(
    page("Register", `${nav(undefined, next)}<main><h1>Register</h1>${registerForm([], {}, next)}</main>`),
  );
});

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");
  const next = safeNextPath(str("next"));

  const username = str("username").trim();
  const password = str("password");
  const displayNameInput = str("display_name").trim();
  const bio = str("bio").trim();
  const questions = Array.from({ length: RECOVERY_QUESTION_COUNT }, (_, i) => ({
    questionKey: str(`question_${i + 1}`).trim(),
    answer: str(`answer_${i + 1}`).trim(),
  }));

  const errors: string[] = [];
  if (!USERNAME_RE.test(username)) {
    errors.push("Username must be 3-20 characters: lowercase letters, numbers, underscore only.");
  } else if (findUserByUsername(username)) {
    errors.push("That username is already taken.");
  }
  errors.push(...passwordErrors(password));
  if (displayNameInput.length > DISPLAY_NAME_MAX) {
    errors.push(`Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`);
  }
  if (bio.length > BIO_MAX) {
    errors.push(`Bio must be ${BIO_MAX} characters or fewer.`);
  }
  questions.forEach((q, i) => {
    if (!q.questionKey || !isValidQuestionKey(q.questionKey)) {
      errors.push(`Choose a valid option for security question ${i + 1}.`);
    }
    if (!q.answer) errors.push(`Security question ${i + 1} needs an answer.`);
  });
  if (
    questions.length === 2 &&
    questions[0].questionKey &&
    questions[0].questionKey === questions[1].questionKey
  ) {
    errors.push("Choose two different security questions.");
  }

  const values: Record<string, string> = { username, display_name: displayNameInput, bio };
  questions.forEach((q, i) => {
    values[`question_${i + 1}`] = q.questionKey;
    values[`answer_${i + 1}`] = q.answer;
  });

  if (errors.length > 0) {
    return c.html(
      page("Register", `${nav(undefined, next)}<main><h1>Register</h1>${registerForm(errors, values, next)}</main>`),
      400,
    );
  }

  const displayName = displayNameInput || username;
  const userId = createUser(
    username,
    hashSecret(password),
    displayName,
    bio,
    questions.map((q) => ({ questionKey: q.questionKey, answerHash: hashSecret(normaliseAnswer(q.answer)) })),
  );
  signIn(c, userId);
  return c.redirect(next ?? "/profile", 303);
});

// --- Log in / log out ---------------------------------------------------

function loginForm(error: string | undefined, username: string, next?: string): string {
  return `
    ${error ? errorList([error]) : ""}
    <form method="post" action="/login">
      ${next ? `<input type="hidden" name="next" value="${escapeHtml(next)}" />` : ""}
      <p>
        <label for="username">Username</label><br />
        <input id="username" name="username" type="text" required autocomplete="username"
          value="${escapeHtml(username)}" />
      </p>
      <p>
        <label for="password">Password</label><br />
        <input id="password" name="password" type="password" required autocomplete="current-password" />
      </p>
      <p><button type="submit">Log in</button></p>
    </form>
    <p><a href="/forgot-password">Forgot your password?</a></p>`;
}

app.get("/login", (c) => {
  const next = safeNextPath(c.req.query("next"));
  if (currentUser(c)) return c.redirect(next ?? "/profile", 303);
  return c.html(page("Log in", `${nav(undefined, next)}<main><h1>Log in</h1>${loginForm(undefined, "", next)}</main>`));
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const next = safeNextPath(typeof body.next === "string" ? body.next : undefined);

  const user = findUserByUsername(username);
  let ok: boolean;
  if (user) {
    ok = verifySecret(password, user.password_hash);
  } else {
    // Same cost as a real check, so a nonexistent username doesn't answer
    // measurably faster than a wrong password for a real one.
    spendDummyVerify(password);
    ok = false;
  }

  if (!user || !ok) {
    return c.html(
      page(
        "Log in",
        `${nav(undefined, next)}<main><h1>Log in</h1>${loginForm("Invalid username or password.", username, next)}</main>`,
      ),
      400,
    );
  }

  signIn(c, user.id);
  return c.redirect(next ?? "/profile", 303);
});

app.post("/logout", (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) deleteSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.redirect("/", 303);
});

// --- Profile -------------------------------------------------------------

function profileForm(user: User, errors: string[]): string {
  return `
    ${errorList(errors)}
    <form method="post" action="/profile">
      <p>
        <label for="display_name">Display name</label><br />
        <input id="display_name" name="display_name" type="text" maxlength="${DISPLAY_NAME_MAX}"
          value="${escapeHtml(user.display_name)}" />
      </p>
      <p>
        <label for="bio">Bio</label><br />
        <textarea id="bio" name="bio" maxlength="${BIO_MAX}">${escapeHtml(user.bio)}</textarea>
      </p>
      <p><button type="submit">Save</button></p>
    </form>`;
}

// Read-only: the brief doesn't ask for changing security questions after
// registration, and never shows the answers — only which questions were
// picked.
function securityQuestionsSummary(userId: number): string {
  const items = getSecurityQuestions(userId)
    .map((q) => `<li>${escapeHtml(questionTextForKey(q.question_key))}</li>`)
    .join("");
  return `<h2>Your security questions</h2><ul>${items}</ul>`;
}

app.get("/profile", (c) => {
  const user = currentUser(c);
  if (!user) return c.redirect("/login", 303);
  return c.html(
    page(
      "My profile",
      `${nav(user)}<main><h1>My profile</h1>${profileForm(user, [])}${securityQuestionsSummary(user.id)}</main>`,
    ),
  );
});

app.post("/profile", async (c) => {
  const user = currentUser(c);
  if (!user) return c.redirect("/login", 303);

  const body = await c.req.parseBody();
  const displayNameInput = typeof body.display_name === "string" ? body.display_name.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";

  const errors: string[] = [];
  if (displayNameInput.length > DISPLAY_NAME_MAX) {
    errors.push(`Display name must be ${DISPLAY_NAME_MAX} characters or fewer.`);
  }
  if (bio.length > BIO_MAX) {
    errors.push(`Bio must be ${BIO_MAX} characters or fewer.`);
  }

  if (errors.length > 0) {
    return c.html(
      page(
        "My profile",
        `${nav(user)}<main><h1>My profile</h1>${profileForm({ ...user, display_name: displayNameInput, bio }, errors)}${securityQuestionsSummary(user.id)}</main>`,
      ),
      400,
    );
  }

  // Same rule as registration: an empty display name falls back to the
  // username, since the column is NOT NULL with no default.
  updateProfile(user.id, displayNameInput || user.username, bio);
  return c.redirect("/profile", 303);
});

// --- Forgot password -------------------------------------------------------

function securityQuestionsForUsername(username: string): { position: number; question: string }[] {
  const user = findUserByUsername(username);
  if (user) {
    return getSecurityQuestions(user.id).map((q) => ({
      position: q.position,
      question: questionTextForKey(q.question_key),
    }));
  }
  // Two real catalog questions, chosen deterministically from the username —
  // the same shape and the same source list as a real account's picks, so
  // this page alone gives no sign the username doesn't exist.
  return placeholderQuestionsForUsername(username).map((q, i) => ({ position: i + 1, question: q.text }));
}

function resetForm(
  username: string,
  questions: { position: number; question: string }[],
  errors: string[],
): string {
  const answerInputs = questions
    .map(
      (q) => `
      <p>
        <label for="answer_${q.position}">${escapeHtml(q.question)}</label><br />
        <input id="answer_${q.position}" name="answer_${q.position}" type="text" required maxlength="200" />
      </p>`,
    )
    .join("");

  return `
    ${errorList(errors)}
    <form method="post" action="/reset-password">
      <input type="hidden" name="username" value="${escapeHtml(username)}" />
      ${answerInputs}
      <p>
        <label for="new_password">New password</label><br />
        <input id="new_password" name="new_password" type="password" required minlength="${PASSWORD_MIN}"
          autocomplete="new-password" aria-describedby="new-password-rule" /><br />
        <small id="new-password-rule">${escapeHtml(PASSWORD_RULE_HINT)}</small>
      </p>
      <p>
        <label for="confirm_password">Confirm new password</label><br />
        <input id="confirm_password" name="confirm_password" type="password" required
          minlength="${PASSWORD_MIN}" autocomplete="new-password" />
      </p>
      <p><button type="submit">Reset password</button></p>
    </form>`;
}

app.get("/forgot-password", (c) =>
  c.html(
    page(
      "Forgot password",
      `${nav(currentUser(c))}<main><h1>Forgot password</h1>
      <form method="post" action="/forgot-password">
        <p>
          <label for="username">Username</label><br />
          <input id="username" name="username" type="text" required autocomplete="username" />
        </p>
        <p><button type="submit">Continue</button></p>
      </form></main>`,
    ),
  ),
);

app.post("/forgot-password", async (c) => {
  const body = await c.req.parseBody();
  const username = typeof body.username === "string" ? body.username.trim() : "";
  return c.html(
    page(
      "Reset your password",
      `${nav(currentUser(c))}<main><h1>Reset your password</h1>
      <p>Answer your security questions and choose a new password.</p>
      ${resetForm(username, securityQuestionsForUsername(username), [])}</main>`,
    ),
  );
});

app.post("/reset-password", async (c) => {
  const body = await c.req.parseBody();
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");

  const username = str("username").trim();
  const newPassword = str("new_password");
  const confirmPassword = str("confirm_password");
  const answers = Array.from({ length: RECOVERY_QUESTION_COUNT }, (_, i) => str(`answer_${i + 1}`));

  const rerender = (errors: string[]): Response =>
    c.html(
      page(
        "Reset your password",
        `${nav(currentUser(c))}<main><h1>Reset your password</h1>
        <p>Answer your security questions and choose a new password.</p>
        ${resetForm(username, securityQuestionsForUsername(username), errors)}</main>`,
      ),
      400,
    );

  const newPasswordErrors = passwordErrors(newPassword);
  if (newPasswordErrors.length > 0) {
    return rerender(newPasswordErrors);
  }
  if (newPassword !== confirmPassword) {
    return rerender(["New password and confirmation do not match."]);
  }

  const genericFailure = (): Response => rerender(["One or more answers were incorrect."]);
  const user = findUserByUsername(username);

  if (!user) {
    // Spend the same scrypt cost a real check would, so a nonexistent
    // username isn't measurably cheaper to rule out than a real one with
    // wrong answers.
    for (const answer of answers) spendDummyVerify(normaliseAnswer(answer));
    return genericFailure();
  }

  if (isRecoveryLocked(user)) {
    return rerender([
      `Too many failed attempts. Try again after ${new Date(user.recovery_locked_until as string).toLocaleString()}.`,
    ]);
  }

  const stored = getSecurityQuestions(user.id);
  // .map, not .every/.some: every answer is checked regardless of earlier
  // results, so which position was wrong can't be inferred from timing.
  const results = stored.map((q, i) => verifySecret(normaliseAnswer(answers[i] ?? ""), q.answer_hash));
  const allCorrect = stored.length === RECOVERY_QUESTION_COUNT && results.every(Boolean);

  if (!allCorrect) {
    // One failed attempt, however many answers were wrong — and the message
    // above never says which one.
    recordFailedRecoveryAttempt(user);
    return genericFailure();
  }

  resetPassword(user.id, hashSecret(newPassword));
  return c.html(
    page(
      "Password reset",
      `${nav(currentUser(c))}<main><h1>Password reset</h1>
      <p>Your password has been reset. <a href="/login">Log in</a> with your new password.</p></main>`,
    ),
  );
});

// --- Poker (C9) ----------------------------------------------------------
//
// Every response here is "the view for user X" (poker/table.ts's
// buildView) — never the engine's own unmasked state. GET /tables/:id is
// the human-facing page (Step 3); GET /tables/:id/view is the same data as
// JSON, for curl/Step 4's checks and anything else that wants it without
// scraping HTML; GET /tables/:id/events is the SSE stream.

// A PokerError's message is meant to reach the client as-is (out-of-turn,
// illegal bet size, table full, ...); anything else is a bug, so its detail
// stays out of the response.
function pokerErrorMessage(err: unknown): string {
  return err instanceof PokerError ? err.message : "Something went wrong.";
}

function tableIdParam(c: Context): number | undefined {
  const id = Number(c.req.param("id"));
  return Number.isInteger(id) ? id : undefined;
}

// Server-rendered first paint (docs/c9-brief.md Step 3); the page's own
// inline script takes over from here via EventSource.
app.get("/tables/:id", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) {
    // tableId is already validated as a plain integer by tableIdParam, so
    // it's safe to embed directly — nothing a visitor supplied reaches this
    // path unvalidated.
    const next = tableId !== undefined ? `/tables/${tableId}` : "/tables/1";
    return c.redirect(`/login?next=${encodeURIComponent(next)}`, 303);
  }
  const view = tableId !== undefined ? buildView(tableId, user.id) : undefined;
  if (!view) return c.notFound();
  return c.html(renderTablePage(view));
});

app.get("/tables/:id/view", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  const view = tableId !== undefined ? buildView(tableId, user.id) : undefined;
  if (!view) return c.notFound();
  return c.json(view);
});

// Append-only, oldest first. No per-viewer masking — a net win/loss amount
// isn't hidden information the way hole cards are.
app.get("/tables/:id/results", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  try {
    return c.json(getHandResults(tableId));
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
});

// SSE stream per docs/c9-brief.md Step 3: the caller's full current view on
// connect, their own view again after any change to the table (sit, leave,
// start, any action — real or the turn timer's), and a plain comment line
// every ~20s so a reverse proxy (Fly's, in production) doesn't time out an
// otherwise-idle connection. One view-shaped "dirty" flag per connection,
// not a queue of past events: a client that's behind only ever needs the
// current state, never a history of what it missed.
const SSE_HEARTBEAT_MS = 10_000;

app.get("/tables/:id/events", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined || !buildView(tableId, user.id)) return c.notFound();

  return streamSSE(c, async (stream) => {
    let dirty = false;
    let wake: (() => void) | undefined;
    const unsubscribe = subscribeToTable(tableId, () => {
      dirty = true;
      wake?.();
    });
    stream.onAbort(() => unsubscribe());

    const sendView = async (): Promise<void> => {
      const view = buildView(tableId, user.id);
      if (view) await stream.writeSSE({ event: "view", data: JSON.stringify(view) });
    };

    await sendView(); // the caller's full current view, right on connect

    while (!stream.aborted && !stream.closed) {
      if (dirty) {
        dirty = false;
        await sendView();
        continue; // re-check immediately — another change may have landed while sendView() was writing
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
        setTimeout(resolve, SSE_HEARTBEAT_MS);
      });
      wake = undefined;
      if (stream.aborted || stream.closed) break;
      if (!dirty) await stream.write(": heartbeat\n\n");
      // if dirty is now true, loop back to the top and send the view instead
    }

    unsubscribe();
  });
});

app.post("/tables/:id/sit", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  try {
    sitDown(tableId, user.id);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

app.post("/tables/:id/leave", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  try {
    leave(tableId, user.id);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

app.post("/tables/:id/start", (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  try {
    startHand(tableId);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

// fold / check / call / bet / raise. bet and raise need a form field
// "amount"; the others ignore it if present.
app.post("/tables/:id/act", async (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();

  const body = await c.req.parseBody();
  const type = typeof body.type === "string" ? body.type : "";
  const amountInput = typeof body.amount === "string" ? body.amount : undefined;
  const amount = amountInput !== undefined && amountInput !== "" ? Number(amountInput) : undefined;

  try {
    applyAction(tableId, String(user.id), type, amount);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on 0.0.0.0:${info.port}`);
});
