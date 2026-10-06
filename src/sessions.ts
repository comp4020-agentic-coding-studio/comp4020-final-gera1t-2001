import { randomBytes } from "node:crypto";
import { db } from "./db.ts";
import type { User } from "./accounts.ts";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function createSession(userId: number): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expiresAt,
  );
  return { token, expiresAt };
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export function userForSessionToken(token: string): User | undefined {
  return db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ? AND sessions.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as User | undefined;
}
