// The one place the account forms' rules and wording live (final brief
// Step 6: "the server, the page and the tests agree on it"). Pure: no database
// and no HTML, so the server, the page renderer and spec/ can all import it.

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 40;
export const BIO_MAX = 160;
export const PASSWORD_MIN = 8;
export const RECOVERY_QUESTIONS = 2;

// The five password rules, in the order the live checklist shows them. The
// checklist's `label` and the server's `message` use the same words, and the
// page script is handed each rule's `pattern` as data and builds its test from
// it, so the ticks can't drift from what the server enforces.
export interface PasswordRule {
  key: string;
  label: string;
  message: string;
  pattern: string; // RegExp source; a password meets the rule when it matches
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    key: "length",
    label: "8 or more characters",
    message: `Use ${PASSWORD_MIN} or more characters.`,
    pattern: `^[\\s\\S]{${PASSWORD_MIN},}$`,
  },
  { key: "upper", label: "An uppercase letter", message: "Add an uppercase letter.", pattern: "[A-Z]" },
  { key: "lower", label: "A lowercase letter", message: "Add a lowercase letter.", pattern: "[a-z]" },
  { key: "digit", label: "A number", message: "Add a number.", pattern: "[0-9]" },
  { key: "symbol", label: "A symbol, like ! or ?", message: "Add a symbol, like ! or ?.", pattern: "[^A-Za-z0-9]" },
];

export const meetsRule = (rule: PasswordRule, password: string): boolean =>
  new RegExp(rule.pattern).test(password);

// The authority on what a password needs; the page's checklist is only a
// guide. One message per rule that isn't met, empty when the password is fine.
export function passwordErrors(password: string): string[] {
  return PASSWORD_RULES.filter((r) => !meetsRule(r, password)).map((r) => r.message);
}

// What a field's error says. `field` is the input's id (so the summary can
// link to it); undefined means the problem isn't about one field.
export interface FormError {
  field?: string;
  message: string;
  // A lock-out's expiry. The page renders it as <time datetime> and formats
  // it in the browser's own time zone, so the message has no clock in it.
  lockedUntil?: string;
}

export const MESSAGES = {
  loginMismatch: "That username and password don't match. Check both and try again.",
  usernameInvalid: `Usernames use only lowercase letters, numbers and _ (3–20 characters).`,
  usernameTaken: "That username is already taken. Try another.",
  displayNameTooLong: `Display name can be at most ${DISPLAY_NAME_MAX} characters. Shorten it.`,
  bioTooLong: `Bio can be at most ${BIO_MAX} characters. Shorten it.`,
  questionNeeded: (n: number) => `Choose question ${n} to continue.`,
  answerNeeded: (n: number) => `Answer question ${n} to continue.`,
  questionsSame: "Choose two different questions. Pick another one for question 2.",
  passwordsDiffer: "The two passwords don't match. Type the new password again in both boxes.",
  answersWrong: "One or more answers were incorrect. Check them and try again.",
  lockedOut: "Too many tries. You can try again after",
  passwordChanged: "Password changed. Log in with your new password.",
  guestRateLimited: "Too many new guests from this network. Try again in an hour, or log in.",
  guestDoor:
    "No password. Your seat lives in this browser; claim the account later from your profile if you want to keep it.",
  guestLogout: "You're a guest. If you log out you can't get back into this account.",
  guestClaimed: "Account claimed. From now on, log in with your username and password.",
} as const;

// --- Guests (brief 2 Step 11) ---------------------------------------------
// Read once at boot. The two limit numbers are env-overridable for tests: set
// the override for the app and for `pnpm check` alike, as with the timings
// listed in src/poker/live.ts. CI sets neither.

// POST /guest makes at most GUEST_LIMIT accounts per IP per
// GUEST_LIMIT_WINDOW_MS (in memory, so a restart forgets it).
// A malformed override fails the boot rather than become NaN, which would
// compare false with everything and turn the limit off.
function positiveEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got ${JSON.stringify(raw)}`);
  return n;
}
export const GUEST_LIMIT = positiveEnv("GUEST_LIMIT", 10);
export const GUEST_LIMIT_WINDOW_MS = positiveEnv("GUEST_LIMIT_WINDOW_MS", 60 * 60_000);

export interface RegisterInput {
  username: string;
  password: string;
  displayName: string;
  bio: string;
  questions: { questionKey: string; answer: string }[];
}

// In the order the form shows its fields, so the summary reads top to bottom.
export function registerErrors(
  input: RegisterInput,
  checks: { usernameTaken: boolean; isValidQuestionKey: (key: string) => boolean },
): FormError[] {
  const errors: FormError[] = [];
  if (!USERNAME_RE.test(input.username)) {
    errors.push({ field: "username", message: MESSAGES.usernameInvalid });
  } else if (checks.usernameTaken) {
    errors.push({ field: "username", message: MESSAGES.usernameTaken });
  }
  const pw = passwordErrors(input.password);
  if (pw.length > 0) errors.push({ field: "password", message: pw.join(" ") });
  if (input.displayName.length > DISPLAY_NAME_MAX) {
    errors.push({ field: "display_name", message: MESSAGES.displayNameTooLong });
  }
  // The register page has no bio field any more, so this can only come from a
  // hand-made POST; it has no input to point at.
  if (input.bio.length > BIO_MAX) errors.push({ message: MESSAGES.bioTooLong });
  input.questions.forEach((q, i) => {
    const n = i + 1;
    if (!q.questionKey || !checks.isValidQuestionKey(q.questionKey)) {
      errors.push({ field: `question_${n}`, message: MESSAGES.questionNeeded(n) });
    }
    if (!q.answer) errors.push({ field: `answer_${n}`, message: MESSAGES.answerNeeded(n) });
  });
  if (
    input.questions.length === RECOVERY_QUESTIONS &&
    input.questions[0].questionKey &&
    input.questions[0].questionKey === input.questions[1].questionKey
  ) {
    errors.push({ field: "question_2", message: MESSAGES.questionsSame });
  }
  return errors;
}
