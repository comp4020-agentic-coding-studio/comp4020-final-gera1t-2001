// Markup for log in, register, forgot and reset password (final brief Step 6),
// built from docs/design/login-mockup.html and register-mockup.html. Copy and
// rules come from account-messages.ts; this file only lays them out.
import {
  DISPLAY_NAME_MAX,
  MESSAGES,
  PASSWORD_MIN,
  PASSWORD_RULES,
  RECOVERY_QUESTIONS,
} from "./account-messages.ts";
import type { FormError } from "./account-messages.ts";
import { escapeHtml } from "./html.ts";
import { SECURITY_QUESTIONS } from "./security-questions.ts";

const fan = `<div class="fan" aria-hidden="true">
    <div class="card"><span class="idx">A<br>♠</span>♠</div>
    <div class="card red"><span class="idx">K<br>♥</span>♥</div>
  </div>`;

function panel(inner: string, withFan = true): string {
  return `<main class="auth">${withFan ? fan : ""}<section class="panel">${inner}</section></main>${clientScript}`;
}

// A message that carries a lock-out expiry ends in a <time>; the browser
// rewrites its text into the visitor's own zone, and the ISO text is what
// shows without JS.
function messageHtml(e: FormError): string {
  if (!e.lockedUntil) return escapeHtml(e.message);
  const iso = escapeHtml(e.lockedUntil);
  return `${escapeHtml(e.message)} <time datetime="${iso}">${iso}</time>.`;
}

// The summary at the top of the panel: one link per error that has a field.
// Focus moves here on a failed submit (the script focuses [data-summary]).
export function errorSummary(errors: FormError[]): string {
  if (errors.length === 0) return "";
  const items = errors
    .map((e) =>
      e.field ? `<li><a href="#${escapeHtml(e.field)}">${messageHtml(e)}</a></li>` : `<li>${messageHtml(e)}</li>`,
    )
    .join("");
  const n = errors.length;
  return `<div class="summary" role="alert" tabindex="-1" data-summary>
      <strong>Fix ${n} ${n === 1 ? "thing" : "things"} to continue</strong><ul>${items}</ul></div>`;
}

interface FieldParts {
  id: string;
  label: string;
  input: string; // the control, without id/aria attributes
  hint?: string;
  hintId?: string;
  error?: string;
  optional?: boolean;
  // Extra ids the control is described by (e.g. the password checklist).
  describedBy?: string[];
}

// Renders a field whose error sits inside the control's aria-describedby
// target — the wiring spec/accounts.test.ts follows through the parsed DOM.
function field(p: FieldParts): string {
  const hintId = p.hint ? (p.hintId ?? `${p.id}-hint`) : undefined;
  const errorId = p.error ? `${p.id}-error` : undefined;
  const describedBy = [hintId, ...(p.describedBy ?? []), errorId].filter(Boolean).join(" ");
  const attrs = ` id="${p.id}" name="${p.id}"${describedBy ? ` aria-describedby="${describedBy}"` : ""}${
    p.error ? ` aria-invalid="true"` : ""
  }`;
  return `<div class="field${p.error ? " invalid" : ""}">
      <label for="${p.id}">${escapeHtml(p.label)}${p.optional ? ` <span class="opt">(optional)</span>` : ""}</label>
      ${p.input.replace("<input", `<input${attrs}`).replace("<select", `<select${attrs}`)}
      ${p.error ? `<span class="field-error" id="${errorId}">${escapeHtml(p.error)}</span>` : ""}
      ${p.hint ? `<span class="hint" id="${hintId}">${escapeHtml(p.hint)}</span>` : ""}
    </div>`;
}

const errorFor = (errors: FormError[], id: string): string | undefined =>
  errors.find((e) => e.field === id)?.message;

function passwordInput(id: string, label: string, errors: FormError[], opts: { current: boolean; rules: boolean }) {
  const rulesId = `${id}-rules`;
  const rules = opts.rules
    ? `<ul class="rules" id="${rulesId}" aria-live="polite" data-rules-for="${id}">${PASSWORD_RULES.map(
        (r) => `<li data-rule="${r.key}">${escapeHtml(r.label)}</li>`,
      ).join("")}</ul>`
    : "";
  const control = field({
    id,
    label,
    input: `<div class="pw"><input type="password" required autocomplete="${opts.current ? "current-password" : "new-password"}"${
      opts.rules ? ` minlength="${PASSWORD_MIN}"` : ""
    } /><button type="button" aria-controls="${id}" aria-pressed="false" data-toggle-password>Show</button></div>`,
    error: errorFor(errors, id),
    describedBy: opts.rules ? [rulesId] : [],
  });
  // The checklist belongs under the control, inside the same field.
  return opts.rules ? control.replace(/<\/div>\s*$/, `${rules}</div>`) : control;
}

function nextField(next?: string): string {
  return next ? `<input type="hidden" name="next" value="${escapeHtml(next)}" />` : "";
}

const withNext = (path: string, next?: string): string =>
  next ? `${path}?next=${encodeURIComponent(next)}` : path;

// --- Log in ---------------------------------------------------------------

export function loginPage(opts: { errors?: FormError[]; username?: string; next?: string; notice?: string }): string {
  const errors = opts.errors ?? [];
  return panel(`
    <h1>Log in</h1>
    <p class="lede">Log in to take your seat at the table.</p>
    ${opts.notice ? `<p class="notice" role="status">${escapeHtml(opts.notice)}</p>` : ""}
    ${errorSummary(errors)}
    <form method="post" action="/login">
      ${nextField(opts.next)}
      ${field({
        id: "username",
        label: "Username",
        input: `<input type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${escapeHtml(
          opts.username ?? "",
        )}" />`,
      })}
      ${passwordInput("password", "Password", errors, { current: true, rules: false })}
      <button class="primary" type="submit">Log in</button>
    </form>
    <p class="links">
      <span><a href="/forgot-password">Forgot your password?</a></span>
      <span>New here? <a href="${escapeHtml(withNext("/register", opts.next))}">Create an account</a></span>
    </p>`);
}

// --- Register -------------------------------------------------------------

function questionOptions(selected: string, other: string, placeholder: string): string {
  return (
    `<option value=""${selected ? "" : " selected"} disabled>${escapeHtml(placeholder)}</option>` +
    SECURITY_QUESTIONS.map(
      (q) =>
        `<option value="${escapeHtml(q.key)}"${q.key === selected ? " selected" : ""}${
          q.key === other ? " disabled" : ""
        }>${escapeHtml(q.text)}</option>`,
    ).join("")
  );
}

export function registerPage(opts: {
  errors?: FormError[];
  values?: Record<string, string>;
  next?: string;
  buyIn: number;
}): string {
  const errors = opts.errors ?? [];
  const v = (k: string): string => opts.values?.[k] ?? "";
  const questions = Array.from({ length: RECOVERY_QUESTIONS }, (_, i) => {
    const n = i + 1;
    const other = v(`question_${n === 1 ? 2 : 1}`);
    const qErr = errorFor(errors, `question_${n}`);
    const aErr = errorFor(errors, `answer_${n}`);
    return `<div class="q">
        ${field({
          id: `question_${n}`,
          label: `Question ${n}`,
          input: `<select required data-question>${questionOptions(
            v(`question_${n}`),
            other,
            n === 1 ? "Choose a question" : "Choose a different question",
          )}</select>`,
          error: qErr,
        })}
        ${field({
          id: `answer_${n}`,
          label: `Answer to question ${n}`,
          input: `<input type="text" maxlength="200" required autocomplete="off" value="${escapeHtml(v(`answer_${n}`))}" />`,
          error: aErr,
        })}
      </div>`;
  }).join("");

  return panel(`
    <h1>Create an account</h1>
    <p class="lede">One account per person. Every seat starts with ${escapeHtml(
      opts.buyIn.toLocaleString("en-AU"),
    )} play chips; nothing here is real money.</p>
    ${errorSummary(errors)}
    <form method="post" action="/register">
      ${nextField(opts.next)}
      <fieldset>
        <legend>Your login</legend>
        ${field({
          id: "username",
          label: "Username",
          input: `<input type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required value="${escapeHtml(v("username"))}" />`,
          hint: "3–20 characters: lowercase letters, numbers and _. You log in with this.",
          error: errorFor(errors, "username"),
        })}
        ${passwordInput("password", "Password", errors, { current: false, rules: true })}
      </fieldset>
      <fieldset>
        <legend>At the table</legend>
        ${field({
          id: "display_name",
          label: "Display name",
          optional: true,
          input: `<input type="text" maxlength="${DISPLAY_NAME_MAX}" value="${escapeHtml(v("display_name"))}" />`,
          hint: "What other players see on your seat. Leave it blank to use your username.",
          error: errorFor(errors, "display_name"),
        })}
      </fieldset>
      <fieldset>
        <legend>If you forget your password</legend>
        <p class="why">There's no email reset here. Pick two questions only you can answer; you'll answer them to set a new password. Capitals and extra spaces don't matter.</p>
        ${questions}
      </fieldset>
      <button class="primary" type="submit">Create account and go to the table</button>
    </form>
    <p class="links"><span>Already have an account? <a href="${escapeHtml(withNext("/login", opts.next))}">Log in</a></span></p>`);
}

// --- Forgot / reset password ---------------------------------------------

export function forgotPage(): string {
  return panel(
    `<h1>Forgot password</h1>
    <p class="lede">Enter your username. We'll ask your two security questions.</p>
    <form method="post" action="/forgot-password">
      ${field({
        id: "username",
        label: "Username",
        input: `<input type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required />`,
      })}
      <button class="primary" type="submit">Continue</button>
    </form>
    <p class="links"><span><a href="/login">Back to log in</a></span></p>`,
    false,
  );
}

export function resetPage(opts: {
  username: string;
  questions: { position: number; question: string }[];
  errors?: FormError[];
}): string {
  const errors = opts.errors ?? [];
  const answers = opts.questions
    .map((q) =>
      field({
        id: `answer_${q.position}`,
        label: q.question,
        input: `<input type="text" maxlength="200" required autocomplete="off" />`,
        error: errorFor(errors, `answer_${q.position}`),
      }),
    )
    .join("");
  return panel(
    `<h1>Reset your password</h1>
    <p class="lede">Answer your two security questions, then choose a new password.</p>
    ${errorSummary(errors)}
    <form method="post" action="/reset-password">
      <input type="hidden" name="username" value="${escapeHtml(opts.username)}" />
      ${answers}
      ${passwordInput("new_password", "New password", errors, { current: false, rules: true })}
      ${field({
        id: "confirm_password",
        label: "Confirm password",
        input: `<input type="password" required minlength="${PASSWORD_MIN}" autocomplete="new-password" />`,
        error: errorFor(errors, "confirm_password"),
      })}
      <button class="primary" type="submit">Reset password</button>
    </form>`,
    false,
  );
}

export const LOCKED_OUT_PREFIX = MESSAGES.lockedOut;

// --- Client behaviour -----------------------------------------------------
// Progressive enhancement only: every form works without it. The password
// rules arrive as data (each rule's regex source) so the ticks follow the
// server's own rules.
const rulePatterns = JSON.stringify(Object.fromEntries(PASSWORD_RULES.map((r) => [r.key, r.pattern])));

const clientScript = `<script>
(() => {
  const patterns = ${rulePatterns};
  // Show / Hide on every password box.
  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = document.getElementById(btn.getAttribute("aria-controls"));
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-pressed", String(show));
    });
  });
  // The live checklist: a guide only; the server has the final say.
  document.querySelectorAll("[data-rules-for]").forEach((list) => {
    const input = document.getElementById(list.getAttribute("data-rules-for"));
    const update = () => {
      list.querySelectorAll("[data-rule]").forEach((li) => {
        li.classList.toggle("met", new RegExp(patterns[li.getAttribute("data-rule")]).test(input.value));
      });
    };
    input.addEventListener("input", update);
    update();
  });
  // What is chosen in one question is not offered in the other.
  const selects = [...document.querySelectorAll("select[data-question]")];
  const exclude = () => {
    selects.forEach((s) => {
      const other = selects.find((o) => o !== s);
      [...s.options].forEach((o) => { o.disabled = o.value === "" || (!!other && o.value === other.value); });
    });
  };
  selects.forEach((s) => s.addEventListener("change", exclude));
  if (selects.length) exclude();
  // A lock-out time is written in the server's zone (UTC); show the visitor's.
  document.querySelectorAll("time[datetime]").forEach((t) => {
    const d = new Date(t.getAttribute("datetime"));
    if (!isNaN(d)) t.textContent = d.toLocaleString([], { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
  });
  // After a failed submit the summary is the first thing read.
  const summary = document.querySelector("[data-summary]");
  if (summary) summary.focus();
})();
</script>`;
