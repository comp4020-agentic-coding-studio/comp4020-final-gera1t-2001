import { randomBytes, randomInt } from "node:crypto";

import { hashSecret } from "./crypto.ts";
import { db } from "./db.ts";
import { avatarLetter, guestDisplayName } from "./guest-names.ts";

const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_LOCK_MS = 60 * 60 * 1000; // 1 hour

export interface User {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  bio: string;
  recovery_failed_attempts: number;
  recovery_locked_until: string | null;
  created_at: string;
  // 1 for an unclaimed guest (brief 2 Step 11), 0 otherwise.
  is_guest: number;
}

export interface SecurityQuestion {
  position: number;
  question_key: string;
  answer_hash: string;
}

export interface Member {
  display_name: string;
  bio: string;
}

export function findUserByUsername(username: string): User | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as User | undefined;
}

export function findUserById(id: number): User | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as User | undefined;
}

// The home page's Regulars: registered and claimed accounts. Unclaimed
// guests (brief 2 Step 11) aren't regulars; Results still lists them, tagged.
export function listMembers(): Member[] {
  return db
    .prepare("SELECT display_name, bio FROM users WHERE is_guest = 0 ORDER BY created_at ASC")
    .all() as Member[];
}

export function createUser(
  username: string,
  passwordHash: string,
  displayName: string,
  bio: string,
  questions: { questionKey: string; answerHash: string }[],
): number {
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO users (username, password_hash, display_name, bio) VALUES (?, ?, ?, ?)",
      )
      .run(username, passwordHash, displayName, bio);
    const userId = Number(lastInsertRowid);
    const insertQuestion = db.prepare(
      "INSERT INTO security_questions (user_id, position, question_key, answer_hash) VALUES (?, ?, ?, ?)",
    );
    questions.forEach((q, i) => insertQuestion.run(userId, i + 1, q.questionKey, q.answerHash));
    return userId;
  })();
}

// --- Guests (brief 2 Step 11) ----------------------------------------------

// Lowercase RFC 4648 base32. 256 is a multiple of 32, so a byte mod 32 picks
// each letter with equal odds.
const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
const GUEST_NAME_TRIES = 20;

function guestUsername(): string {
  return "guest-" + [...randomBytes(6)].map((b) => BASE32[b % 32]).join("");
}

const isUniqueViolation = (err: unknown): boolean =>
  (err as { code?: string } | null)?.code === "SQLITE_CONSTRAINT_UNIQUE";

// A signed-in account in one tap: a generated username and display name, a
// password hash of 32 random bytes that are thrown away (nobody can log in
// with a password until the account is claimed), no security questions.
//
// The username's "-" is outside USERNAME_RE, so no registered account can
// ever hold a guest-shaped name, and a guest's name never passes as a real
// one. It is unique by the column's constraint: a collision (one in 2^30 per
// pair) retries with a new name.
//
// The display name is an animal and two digits (src/guest-names.ts). The
// animal is one whose avatar letter nobody seated at a table right now has,
// so a guest who sits straight away (the invite link's path) is told apart
// from everyone already there by the letter as well as the name. That holds
// for the table as it is when the guest is made: two guests made before
// either sits can still share an animal (they'll differ in their digits).
// Display names aren't unique for anyone, but the digits are re-drawn (up to
// GUEST_NAME_TRIES times) while another account already shows the name.
export function createGuest(): User {
  const passwordHash = hashSecret(randomBytes(32).toString("hex"));
  const seatedNames = db
    .prepare("SELECT users.display_name AS name FROM seats JOIN users ON users.id = seats.user_id")
    .all() as { name: string }[];
  const takenLetters = new Set(seatedNames.map((r) => avatarLetter(r.name)));
  const taken = db.prepare("SELECT 1 FROM users WHERE display_name = ?");
  let displayName = guestDisplayName(takenLetters, randomInt);
  for (let i = 0; i < GUEST_NAME_TRIES && taken.get(displayName); i++) {
    displayName = guestDisplayName(takenLetters, randomInt);
  }
  const insert = db.prepare(
    "INSERT INTO users (username, password_hash, display_name, is_guest) VALUES (?, ?, ?, 1)",
  );
  for (let attempt = 1; ; attempt++) {
    try {
      const { lastInsertRowid } = insert.run(guestUsername(), passwordHash, displayName);
      return findUserById(Number(lastInsertRowid))!;
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= GUEST_NAME_TRIES) throw err;
    }
  }
}

// Turns a guest into a registered account, keeping its id, so its seat, its
// stack and its hand_results rows stay where they are. The display name is
// not touched. Returns false if the username was taken between the form's
// check and this write (the column's unique constraint), so the page can say
// so the same way the check would have. `AND is_guest = 1` makes a second
// claim of the same account change nothing.
export function claimGuest(
  userId: number,
  username: string,
  passwordHash: string,
  questions: { questionKey: string; answerHash: string }[],
): boolean {
  try {
    return db.transaction(() => {
      const { changes } = db
        .prepare("UPDATE users SET username = ?, password_hash = ?, is_guest = 0 WHERE id = ? AND is_guest = 1")
        .run(username, passwordHash, userId);
      if (changes === 0) return false;
      const insertQuestion = db.prepare(
        "INSERT INTO security_questions (user_id, position, question_key, answer_hash) VALUES (?, ?, ?, ?)",
      );
      questions.forEach((q, i) => insertQuestion.run(userId, i + 1, q.questionKey, q.answerHash));
      return true;
    })();
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

export function getSecurityQuestions(userId: number): SecurityQuestion[] {
  return db
    .prepare(
      "SELECT position, question_key, answer_hash FROM security_questions WHERE user_id = ? ORDER BY position ASC",
    )
    .all(userId) as SecurityQuestion[];
}

export function updateProfile(userId: number, displayName: string, bio: string): void {
  db.prepare("UPDATE users SET display_name = ?, bio = ? WHERE id = ?").run(displayName, bio, userId);
}

// A user already past the attempt limit stays locked regardless of whether
// the lock would otherwise have expired on wall-clock time, until this
// returns false — recovery_locked_until is only ever compared, never relied
// on alone, so a clock question never un-locks early.
export function isRecoveryLocked(user: User): boolean {
  return user.recovery_locked_until !== null && user.recovery_locked_until > new Date().toISOString();
}

// One failed attempt, however many of the answers were wrong, per the brief.
export function recordFailedRecoveryAttempt(user: User): void {
  const attempts = user.recovery_failed_attempts + 1;
  const lockedUntil =
    attempts >= MAX_RECOVERY_ATTEMPTS ? new Date(Date.now() + RECOVERY_LOCK_MS).toISOString() : null;
  db.prepare("UPDATE users SET recovery_failed_attempts = ?, recovery_locked_until = ? WHERE id = ?").run(
    attempts,
    lockedUntil,
    user.id,
  );
}

export function resetPassword(userId: number, newPasswordHash: string): void {
  db.transaction(() => {
    db.prepare(
      "UPDATE users SET password_hash = ?, recovery_failed_attempts = 0, recovery_locked_until = NULL WHERE id = ?",
    ).run(newPasswordHash, userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  })();
}

export function normaliseAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}
