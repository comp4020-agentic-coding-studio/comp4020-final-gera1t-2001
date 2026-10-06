import { createHash } from "node:crypto";

// The fixed catalog security questions are chosen from (step 4b): no more
// free-text questions, so every question a user can pick is one only the
// owner wrote into this list, and its wording can't leak anything about
// whether a given username exists (every account draws from the same six).
export interface SecurityQuestionOption {
  key: string;
  text: string;
}

export const SECURITY_QUESTIONS: readonly SecurityQuestionOption[] = [
  { key: "first_dish", text: "What was the first dish you learned to cook?" },
  { key: "childhood_street", text: "What was the name of the street you lived on when you were eight?" },
  { key: "childhood_nickname", text: "What was your childhood nickname?" },
  { key: "first_game_finished", text: "What was the first game you finished?" },
  { key: "first_phone_model", text: "What was the model of your first phone?" },
  { key: "parents_met_city", text: "In what city did your parents meet?" },
];

const BY_KEY = new Map(SECURITY_QUESTIONS.map((q) => [q.key, q.text]));

export function isValidQuestionKey(key: string): boolean {
  return BY_KEY.has(key);
}

export function questionTextForKey(key: string): string {
  return BY_KEY.get(key) ?? key;
}

// For a username with no account: two catalog questions, picked
// deterministically from the username so repeat requests are stable, but
// different fake usernames don't all show the identical pair — a real
// account's two picks are otherwise indistinguishable from this in shape,
// since both come from the same six-question list.
export function placeholderQuestionsForUsername(username: string): SecurityQuestionOption[] {
  const digest = createHash("sha256").update(username).digest();
  const first = digest[0] % SECURITY_QUESTIONS.length;
  let second = digest[1] % SECURITY_QUESTIONS.length;
  if (second === first) second = (second + 1) % SECURITY_QUESTIONS.length;
  return [SECURITY_QUESTIONS[first], SECURITY_QUESTIONS[second]];
}
