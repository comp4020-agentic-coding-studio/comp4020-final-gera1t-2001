import { randomBytes } from "node:crypto";
import { db } from "./db.ts";
import type { User } from "./accounts.ts";

export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Owner decision (4 Nov 2026, after Step 11): a guest's session slides. On
// any request, a guest session with less than this left is extended to
// SESSION_LIFETIME_MS from now. A guest who plays at least once a fortnight
// never loses the account to the clock. Registered sessions don't slide.
export const GUEST_SESSION_SLIDE_BELOW_MS = 15 * 24 * 60 * 60 * 1000; // 15 days

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

// Extends a live guest session that has under GUEST_SESSION_SLIDE_BELOW_MS
// left, in one statement, so the check and the write can't be split. Returns
// the new expiry if it moved, else undefined (not a guest, already expired,
// or 15 days or more left). Most requests read and change nothing; one write
// per guest per fortnight at most.
export function slideGuestSession(token: string, now = Date.now()): string | undefined {
  const expiresAt = new Date(now + SESSION_LIFETIME_MS).toISOString();
  const { changes } = db
    .prepare(
      `UPDATE sessions SET expires_at = ?
       WHERE token = ? AND expires_at > ? AND expires_at < ?
         AND user_id IN (SELECT id FROM users WHERE is_guest = 1)`,
    )
    .run(expiresAt, token, new Date(now).toISOString(), new Date(now + GUEST_SESSION_SLIDE_BELOW_MS).toISOString());
  return changes > 0 ? expiresAt : undefined;
}

// Test hooks only (src/server.ts mounts the route that calls these never in
// production): read, and optionally set, one session's expiry.
export function sessionExpiryForTest(token: string, expiresAt?: string): string | undefined {
  if (expiresAt !== undefined) db.prepare("UPDATE sessions SET expires_at = ? WHERE token = ?").run(expiresAt, token);
  return (db.prepare("SELECT expires_at FROM sessions WHERE token = ?").get(token) as { expires_at: string } | undefined)
    ?.expires_at;
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
