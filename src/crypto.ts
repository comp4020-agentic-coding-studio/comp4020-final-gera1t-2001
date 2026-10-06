import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;

// "salt:hash", both hex. Used for both passwords and security-question
// answers — same algorithm, independent per-row salts.
export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(secret, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// A fixed hash with no real secret behind it, hashed once at startup. Verify
// against it (and discard the result) when a lookup by username/position
// finds nothing, so a missing row costs the same scrypt call as a real one —
// otherwise "no such account" would answer measurably faster than "wrong
// answer", leaking which one happened.
const DUMMY_HASH = hashSecret(randomBytes(32).toString("hex"));

export function spendDummyVerify(secret: string): void {
  verifySecret(secret, DUMMY_HASH);
}
