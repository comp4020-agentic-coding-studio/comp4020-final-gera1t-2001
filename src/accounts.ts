import { db } from "./db.ts";

export const RECOVERY_QUESTION_COUNT = 2;
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

export function listMembers(): Member[] {
  return db
    .prepare("SELECT display_name, bio FROM users ORDER BY created_at ASC")
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
