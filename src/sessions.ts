import { randomBytes } from "node:crypto";
import { db } from "./db.ts";
import type { User } from "./accounts.ts";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// lifetimeMs: how long this session lasts. Brief 2 Step 11 asks for a
// parameter rather than a second constant: POST /guest passes
// SESSION_LIFETIME_MS explicitly (guest sessions last 30 days by owner
// decision, which is today's default too), so a guest lifetime that differs
// later is a change at that one call.
export function createSession(
  userId: number,
  lifetimeMs: number = SESSION_LIFETIME_MS,
): { token: string; expiresAt: string } {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + lifetimeMs).toISOString();
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
