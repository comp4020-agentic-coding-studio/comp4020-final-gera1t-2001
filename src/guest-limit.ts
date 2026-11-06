// Brief 2 Step 11: POST /guest makes at most GUEST_LIMIT accounts per client
// IP per GUEST_LIMIT_WINDOW_MS, counted in memory. A restart forgets every
// count, which is fine for a cap meant to stop one network filling the users
// table, not to be exact.
//
// The key is the Fly-Client-IP header when present, else the socket address.
// On Fly every request comes through Fly's proxy, so the socket address is
// the proxy's and only the header names the visitor; the header is trusted
// because the proxy is what sets it. Checked on production on 7 Nov 2026
// (brief 2 Step 13): a request sending its own Fly-Client-IP reached the app
// with the real address, so the proxy overwrites it and a client can't pick
// its own budget. Off Fly (localhost, CI) anyone can send
// the header, which is how the spec gives each test its own budget.
//
// An IPv6 address counts by its /64: one home or phone holds a whole /64,
// so keying on the full address would give one visitor 2^64 budgets.
import { GUEST_LIMIT, GUEST_LIMIT_WINDOW_MS } from "./account-messages.ts";

const created = new Map<string, number[]>(); // key -> creation times, oldest first

// Above this many keys, and at most once per SWEEP_EVERY_MS, a request also
// sweeps out every key whose window is over, so a stream of one-off IPs can't
// grow the map for ever, nor make every request walk it.
const SWEEP_ABOVE = 1_000;
const SWEEP_EVERY_MS = 60_000;
let lastSweep = 0;

// The rate limit's key for an address: an IPv4 address as is (also when
// written IPv4-mapped, "::ffff:1.2.3.4"), an IPv6 address as its first four
// groups, expanded so "2001:db8::1" and "2001:db8:0:0::2" match.
export function limitKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  if (!address.includes(":")) return address;
  const [head, tail = ""] = address.toLowerCase().split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = address.includes("::") ? (tail ? tail.split(":") : []) : [];
  const groups = address.includes("::") ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
  return groups.slice(0, 4).map((g) => parseInt(g || "0", 16).toString(16)).join(":") + "::/64";
}

function recent(key: string, now: number): number[] {
  const times = (created.get(key) ?? []).filter((t) => now - t < GUEST_LIMIT_WINDOW_MS);
  if (times.length === 0) created.delete(key);
  else created.set(key, times);
  return times;
}

// True, and the creation counted, if this key may make another guest now.
export function takeGuestSlot(address: string, now = Date.now()): boolean {
  const key = limitKey(address);
  if (created.size > SWEEP_ABOVE && now - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = now;
    for (const k of [...created.keys()]) recent(k, now);
  }
  const times = recent(key, now);
  if (times.length >= GUEST_LIMIT) return false;
  created.set(key, [...times, now]);
  return true;
}
