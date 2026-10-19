import { serve } from "@hono/node-server";
import type { Context } from "hono";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { marked } from "marked";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";

import {
  BIO_MAX,
  DISPLAY_NAME_MAX,
  MESSAGES,
  RECOVERY_QUESTIONS as RECOVERY_QUESTION_COUNT,
  passwordErrors,
  registerErrors,
} from "./account-messages.ts";
import type { FormError } from "./account-messages.ts";
import { forgotPage, loginPage, registerPage, resetPage } from "./account-pages.ts";
import {
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
import { FAVICON_SVG, SITE_CSS, SITE_CSS_VERSION, errorList, escapeHtml, page } from "./html.ts";
import { SSE_RETRY_MS, SSE_HEARTBEAT_MS } from "./poker/live.ts";
import { renderTablePage } from "./poker/page.ts";
import {
  PokerError,
  applyAction,
  buildView,
  currentSeq,
  getHandResults,
  leave,
  markPresent,
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
import { db } from "./db.ts";

// Re-arms every table's turn-timeout timer from table_state.turn_deadline —
// a table whose deadline already passed while the process was down gets its
// auto action immediately; every other table's future deadline is
// rescheduled. Must run after the "./db.ts" import above (migrations).
restoreSchedulersOnBoot();

const projectRoot = resolve(import.meta.dirname, "..");

const SESSION_COOKIE = "session";

// Where a visitor lands after logging in or registering with no (safe) `next`.
const DEFAULT_LANDING = "/tables/1";

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

const app = new Hono();

// The layout's stylesheet (src/html.ts links it as ?v=<content hash>). A
// request for the current hash can be cached for good, since the next deploy
// that changes the file changes the URL; anything else (an old hash, or none)
// is revalidated every time, so a stale copy is never served.
app.get("/assets/site.css", (c) => {
  const cacheControl =
    c.req.query("v") === SITE_CSS_VERSION ? "public, max-age=31536000, immutable" : "no-cache";
  return c.body(SITE_CSS, 200, { "content-type": "text/css; charset=utf-8", "cache-control": cacheControl });
});

app.get("/favicon.svg", (c) =>
  c.body(FAVICON_SVG, 200, { "content-type": "image/svg+xml", "cache-control": "no-cache" }),
);

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
      null,
      `<main class="column">
        <h1>Members</h1>
        <p>A Texas Hold'em table for friends. <a href="/tables/1">Join the table</a>.</p>
        ${members.length > 0 ? `<ul>${items}</ul>` : "<p>No one has registered yet.</p>"}
      </main>`,
      { user: currentUser(c) },
    ),
  );
});

app.get("/readme", (c) => c.redirect("/readme/", 301));

app.get("/readme/", (c) => {
  const markdown = readFileSync(resolve(projectRoot, "README.md"), "utf8");
  return c.html(
    page("About", `<main class="column">${marked.parse(markdown, { async: false })}</main>`, {
      user: currentUser(c),
      current: "about",
    }),
  );
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

function buyIn(): number {
  return (db.prepare("SELECT buy_in FROM poker_tables WHERE id = 1").get() as { buy_in: number } | undefined)?.buy_in ?? 1000;
}

app.get("/register", (c) => {
  const next = safeNextPath(c.req.query("next"));
  if (currentUser(c)) return c.redirect(next ?? DEFAULT_LANDING, 303);
  return c.html(page("Create an account", registerPage({ next, buyIn: buyIn() }), { current: "register", next }));
});

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");
  const next = safeNextPath(str("next"));

  const username = str("username").trim();
  const password = str("password");
  const displayNameInput = str("display_name").trim();
  // The register page has no bio field; a POST that still carries one is kept
  // (the profile page is where it is normally set).
  const bio = str("bio").trim();
  const questions = Array.from({ length: RECOVERY_QUESTION_COUNT }, (_, i) => ({
    questionKey: str(`question_${i + 1}`).trim(),
    answer: str(`answer_${i + 1}`).trim(),
  }));

  const errors = registerErrors(
    { username, password, displayName: displayNameInput, bio, questions },
    { usernameTaken: !!findUserByUsername(username), isValidQuestionKey },
  );

  if (errors.length > 0) {
    // Typed values come back, except the password.
    const values: Record<string, string> = { username, display_name: displayNameInput };
    questions.forEach((q, i) => {
      values[`question_${i + 1}`] = q.questionKey;
      values[`answer_${i + 1}`] = q.answer;
    });
    return c.html(
      page("Create an account", registerPage({ errors, values, next, buyIn: buyIn() }), {
        current: "register",
        next,
      }),
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
  return c.redirect(next ?? DEFAULT_LANDING, 303);
});

// --- Log in / log out ---------------------------------------------------

app.get("/login", (c) => {
  const next = safeNextPath(c.req.query("next"));
  if (currentUser(c)) return c.redirect(next ?? DEFAULT_LANDING, 303);
  // /login?reset=1 is where a successful password reset sends people.
  const notice = c.req.query("reset") === "1" ? MESSAGES.passwordChanged : undefined;
  return c.html(page("Log in", loginPage({ next, notice }), { current: "login", next }));
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
    // One generic message that never says which part was wrong. It sits under
    // the password, which is the box the person has to retype: the username
    // stays in its box and the password is not sent back.
    return c.html(
      page("Log in", loginPage({ errors: [{ field: "password", message: MESSAGES.loginMismatch }], username, next }), {
        current: "login",
        next,
      }),
      400,
    );
  }

  signIn(c, user.id);
  return c.redirect(next ?? DEFAULT_LANDING, 303);
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
      <div class="field">
        <label for="display_name">Display name</label>
        <input id="display_name" name="display_name" type="text" maxlength="${DISPLAY_NAME_MAX}"
          value="${escapeHtml(user.display_name)}" />
      </div>
      <div class="field">
        <label for="bio">Bio</label>
        <textarea id="bio" name="bio" maxlength="${BIO_MAX}">${escapeHtml(user.bio)}</textarea>
      </div>
      <button class="primary" type="submit">Save</button>
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
      `<main class="auth"><section class="panel"><h1>My profile</h1>${profileForm(user, [])}${securityQuestionsSummary(user.id)}</section></main>`,
      { user, current: "profile" },
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
        `<main class="auth"><section class="panel"><h1>My profile</h1>${profileForm({ ...user, display_name: displayNameInput, bio }, errors)}${securityQuestionsSummary(user.id)}</section></main>`,
        { user, current: "profile" },
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

app.get("/forgot-password", (c) =>
  c.html(page("Forgot password", forgotPage(), { user: currentUser(c) })),
);

app.post("/forgot-password", async (c) => {
  const body = await c.req.parseBody();
  const username = typeof body.username === "string" ? body.username.trim() : "";
  return c.html(
    page("Reset your password", resetPage({ username, questions: securityQuestionsForUsername(username) }), {
      user: currentUser(c),
    }),
  );
});

app.post("/reset-password", async (c) => {
  const body = await c.req.parseBody();
  const str = (k: string): string => (typeof body[k] === "string" ? (body[k] as string) : "");

  const username = str("username").trim();
  const newPassword = str("new_password");
  const confirmPassword = str("confirm_password");
  const answers = Array.from({ length: RECOVERY_QUESTION_COUNT }, (_, i) => str(`answer_${i + 1}`));

  const rerender = (errors: FormError[]): Response =>
    c.html(
      page("Reset your password", resetPage({ username, questions: securityQuestionsForUsername(username), errors }), {
        user: currentUser(c),
      }),
      400,
    );

  const newPasswordErrors = passwordErrors(newPassword);
  if (newPasswordErrors.length > 0) {
    return rerender([{ field: "new_password", message: newPasswordErrors.join(" ") }]);
  }
  if (newPassword !== confirmPassword) {
    return rerender([{ field: "confirm_password", message: MESSAGES.passwordsDiffer }]);
  }

  const genericFailure = (): Response => rerender([{ field: "answer_1", message: MESSAGES.answersWrong }]);
  const user = findUserByUsername(username);

  if (!user) {
    // Spend the same scrypt cost a real check would, so a nonexistent
    // username isn't measurably cheaper to rule out than a real one with
    // wrong answers.
    for (const answer of answers) spendDummyVerify(normaliseAnswer(answer));
    return genericFailure();
  }

  if (isRecoveryLocked(user)) {
    return rerender([{ message: MESSAGES.lockedOut, lockedUntil: user.recovery_locked_until as string }]);
  }

  const stored = getSecurityQuestions(user.id);
  // .map, not .every/.some: every answer is checked regardless of earlier
  // results, so which position was wrong can't be inferred from timing.
  const results = stored.map((q, i) => verifySecret(normaliseAnswer(answers[i] ?? ""), q.answer_hash));
  const allCorrect = stored.length === RECOVERY_QUESTION_COUNT && results.every(Boolean);

  if (!allCorrect) {
    // One failed attempt, however many answers were wrong — and the message
    // never says which one.
    recordFailedRecoveryAttempt(user);
    return genericFailure();
  }

  resetPassword(user.id, hashSecret(newPassword));
  return c.redirect("/login?reset=1", 303);
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

// Final brief Step 2: one browser profile shares one cookie jar, so a table
// page opened as A keeps posting after another tab signs the jar in as B —
// and without this, B's cookie would act for B (or be refused out of turn)
// from a page that shows A. The page says who it's playing as (`as`, its
// own data-viewer-id); if that isn't who the cookie now belongs to, nothing
// is acted on and the page is told who the browser is signed in as instead.
// A signed-out jar counts as a change too (nowSignedInAs: null). The message
// names only the cookie's own account, never the claimed one, so this can't
// be used to look up display names by id; the page names itself from
// data-viewer-name.
async function identityChangedResponse(c: Context, user: User | undefined): Promise<Response | undefined> {
  const body = await c.req.parseBody();
  const claimed = typeof body.as === "string" && body.as !== "" ? Number(body.as) : undefined;
  if (claimed === undefined || claimed === user?.id) return undefined;
  return c.json(
    {
      error: user
        ? `This browser is now signed in as ${user.display_name}, in another tab or window. Reload to play as them.`
        : "This browser is now signed out, in another tab or window. Reload to log in again.",
      code: "identity_changed",
      nowSignedInAs: user ? { userId: user.id, displayName: user.display_name } : null,
    },
    409,
  );
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
  return c.html(renderTablePage(view, user));
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
// start, any action — real or the turn timer's). One view-shaped "dirty"
// flag per connection, not a queue of past events: a client that's behind
// only ever needs the current state, never a history of what it missed.
//
// Final brief Step 3: a named "ping" event ({"seq":N}) every
// SSE_HEARTBEAT_MS on a fixed schedule, pushes or not. It used to be an SSE
// comment, which JavaScript never sees, so the page couldn't tell a quiet
// table from a dead stream; now the page's watchdog counts it. The first
// thing sent is "retry:", so a dropped stream comes back in 2 s, not the
// browser's default. Every write (push or ping) first re-checks the
// session, and the stream ends once it's gone (final brief Step 2).
app.get("/tables/:id/events", (c) => {
  const tableId = tableIdParam(c);
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? userForSessionToken(token) : undefined;
  if (!token || !user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined || !buildView(tableId, user.id)) return c.notFound();

  const response = streamSSE(c, async (stream) => {
    let dirty = false;
    let wake: (() => void) | undefined;
    // Final brief Step 4: this stream is also what says the user is still at
    // the table, so it's counted out on every way the stream can end (the
    // client going away, the loop ending, or a write throwing on a closed
    // socket). unsubscribe is safe to call more than once.
    const unsubscribe = subscribeToTable(tableId, user.id, () => {
      dirty = true;
      wake?.();
    });
    stream.onAbort(() => unsubscribe());
    try {
      // Final brief Step 2: a stream opened under a session that has since
      // ended (logged out in another tab) closes itself rather than keep
      // pushing that user's view to a page whose cookie is no longer theirs.
      // The browser's EventSource then reconnects with whatever the jar holds
      // now, so the page learns it's someone else (or no one). Checked before
      // every write, push or ping.
      const sessionStillValid = (): boolean => userForSessionToken(token)?.id === user.id;

      const sendView = async (): Promise<void> => {
        const view = buildView(tableId, user.id);
        if (view) await stream.writeSSE({ event: "view", data: JSON.stringify(view) });
      };

      await stream.write(`retry: ${SSE_RETRY_MS}\n\n`);
      await sendView(); // the caller's full current view, right on connect

      let nextPingAt = Date.now() + SSE_HEARTBEAT_MS;
      while (!stream.aborted && !stream.closed) {
        if (dirty) {
          dirty = false;
          if (!sessionStillValid()) break;
          await sendView();
          continue; // re-check immediately — another change may have landed while sendView() was writing
        }
        const waitMs = nextPingAt - Date.now();
        if (waitMs > 0) {
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, waitMs);
            wake = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          wake = undefined;
        }
        if (stream.aborted || stream.closed) break;
        if (Date.now() < nextPingAt) continue; // woken by a push: send the view first

        if (!sessionStillValid()) break;
        // The table's current seq, so a page that somehow missed a view can
        // tell (ping seq above what it last painted) and fetch it.
        await stream.writeSSE({ event: "ping", data: JSON.stringify({ seq: currentSeq(tableId) }) });
        nextPingAt = Date.now() + SSE_HEARTBEAT_MS;
      }
    } finally {
      unsubscribe();
    }
  });
  // streamSSE sets its own Cache-Control, so these go on its response.
  // no-transform and X-Accel-Buffering: no ask proxies (and HTTPS-scanning
  // antivirus that respects them) not to buffer the stream.
  response.headers.set("Cache-Control", "no-cache, no-transform");
  response.headers.set("X-Accel-Buffering", "no");
  return response;
});

app.post("/tables/:id/sit", async (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  const identityChanged = await identityChangedResponse(c, user);
  if (identityChanged) return identityChanged;
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  markPresent(tableId, user.id); // final brief Step 4: posting counts as being here
  try {
    sitDown(tableId, user.id);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

app.post("/tables/:id/leave", async (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  const identityChanged = await identityChangedResponse(c, user);
  if (identityChanged) return identityChanged;
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  markPresent(tableId, user.id); // final brief Step 4: posting counts as being here
  try {
    leave(tableId, user.id);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

app.post("/tables/:id/start", async (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  const identityChanged = await identityChangedResponse(c, user);
  if (identityChanged) return identityChanged;
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  markPresent(tableId, user.id); // final brief Step 4: posting counts as being here
  try {
    startHand(tableId);
  } catch (err) {
    return c.json({ error: pokerErrorMessage(err) }, 400);
  }
  return c.json(buildView(tableId, user.id));
});

// fold / check / call / bet / raise. bet and raise need a form field
// "amount"; the others ignore it if present. "as" (every poker POST) is the
// identity guard above.
app.post("/tables/:id/act", async (c) => {
  const tableId = tableIdParam(c);
  const user = currentUser(c);
  const identityChanged = await identityChangedResponse(c, user);
  if (identityChanged) return identityChanged;
  if (!user) return c.json({ error: "Log in first." }, 401);
  if (tableId === undefined) return c.notFound();
  markPresent(tableId, user.id); // final brief Step 4: posting counts as being here

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
