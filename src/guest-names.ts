// Owner decision (4 Nov 2026, after Step 11): a guest's display name is an
// animal plus two digits, like "Wombat 27", instead of "Guest 4821". Pure (no
// database), so spec/ can import it.
//
// Every animal starts with a different letter, and the seat's avatar is the
// display name's first letter (src/poker/render.js), so the letter alone
// names the animal. Six letters at most, so "Wombat 27" fits a seat plate on
// a phone. 24 animals; no animal for U or X.
export const GUEST_ANIMALS: readonly string[] = [
  "Alpaca", "Bilby", "Crane", "Dingo", "Emu", "Finch", "Galah", "Heron",
  "Ibis", "Jay", "Koala", "Lynx", "Moose", "Numbat", "Otter", "Possum",
  "Quokka", "Robin", "Seal", "Tapir", "Vole", "Wombat", "Yak", "Zebra",
];

// The avatar letter a display name gets, as render.js computes it.
export const avatarLetter = (displayName: string): string =>
  Array.from(displayName.trim())[0]?.toUpperCase() ?? "?";

// A guest name whose animal (so whose avatar letter) none of `takenLetters`
// uses, while one is free; any animal otherwise. `randomInt(n)` picks
// 0..n-1. The two digits are 00-99.
export function guestDisplayName(takenLetters: ReadonlySet<string>, randomInt: (n: number) => number): string {
  const free = GUEST_ANIMALS.filter((a) => !takenLetters.has(avatarLetter(a)));
  const pool = free.length > 0 ? free : GUEST_ANIMALS;
  const animal = pool[randomInt(pool.length)];
  return `${animal} ${String(randomInt(100)).padStart(2, "0")}`;
}
