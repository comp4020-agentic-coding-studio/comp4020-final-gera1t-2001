import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
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

function nav(user: User | undefined): string {
  return user
    ? `<nav>
        <a href="/">Home</a> | <a href="/profile">My profile</a> |
        <form method="post" action="/logout" style="display:inline">
          <button type="submit">Log out</button>
        </form>
      </nav>`
    : `<nav><a href="/">Home</a> | <a href="/login">Log in</a> | <a href="/register">Register</a></nav>`;
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
        <p>This site's direction is not decided yet — see <a href="/readme/">the README</a>
        for where things stand.</p>
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

function registerForm(errors: string[], values: Record<string, string>): string {
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
  if (currentUser(c)) return c.redirect("/profile", 303);
  return c.html(page("Register", `${nav(undefined)}<main><h1>Register</h1>${registerForm([], {})}</main>`));
});

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");

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
      page("Register", `${nav(undefined)}<main><h1>Register</h1>${registerForm(errors, values)}</main>`),
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
  return c.redirect("/profile", 303);
});

// --- Log in / log out ---------------------------------------------------

function loginForm(error: string | undefined, username: string): string {
  return `
    ${error ? errorList([error]) : ""}
    <form method="post" action="/login">
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
  if (currentUser(c)) return c.redirect("/profile", 303);
  return c.html(page("Log in", `${nav(undefined)}<main><h1>Log in</h1>${loginForm(undefined, "")}</main>`));
});

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

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
        `${nav(undefined)}<main><h1>Log in</h1>${loginForm("Invalid username or password.", username)}</main>`,
      ),
      400,
    );
  }

  signIn(c, user.id);
  return c.redirect("/profile", 303);
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

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on 0.0.0.0:${info.port}`);
});
