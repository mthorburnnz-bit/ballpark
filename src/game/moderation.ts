/**
 * Leaderboard display-name filter. Used both client-side (ui/screens.ts,
 * so a rejected name is never even saved locally — there's no later "edit
 * name" flow) and server-side (worker/index.ts's handleSubmitDay, the real
 * trust boundary since /api/submit-day can be called directly).
 *
 * Deliberately simple substring matching on a normalized form, not a
 * dictionary-perfect filter — it will have both false positives (rare
 * English words that happen to contain a banned root) and false negatives
 * (creative misspellings it doesn't recognize). For an anonymous casual
 * leaderboard that's an acceptable trade: a false positive just means
 * picking a different name, and it stops the common case of someone
 * typing a swear word or slur outright.
 */

const LEETSPEAK_MAP: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  "$": "s",
};

// Curated, not exhaustive — extend as needed. Kept to strong profanity and
// slurs rather than mild words (e.g. "damn", "hell") to limit collateral
// false positives on innocent names.
const BANNED_ROOTS = [
  "fuck",
  "shit",
  "bitch",
  "cunt",
  "asshole",
  "dick",
  "pussy",
  "whore",
  "slut",
  "bastard",
  "nigger",
  "nigga",
  "faggot",
  "fag",
  "retard",
  "spic",
  "chink",
  "kike",
  "tranny",
  "rapist",
  "nazi",
  "molest",
  "pedo",
];

function normalize(input: string): string {
  const substituted = Array.from(input.toLowerCase())
    .map((ch) => LEETSPEAK_MAP[ch] ?? ch)
    .join("");
  return substituted.replace(/[^a-z]/g, "");
}

export function containsBannedWord(name: string): boolean {
  const normalized = normalize(name);
  if (normalized.length === 0) return false;
  return BANNED_ROOTS.some((root) => normalized.includes(root));
}
