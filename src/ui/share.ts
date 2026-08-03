import type { AnswerRecord } from "../state/save.ts";
import type { CategoryProfile } from "../state/stats.ts";
import { CATEGORY_LABELS } from "./screens.ts";

/**
 * `text` and `url` are kept separate (rather than one combined string)
 * because the Web Share API cares about the difference — many native share
 * targets (Mail, X, etc.) specifically look for a structured `url` field to
 * decide whether they can handle a share at all, and silently refuse to
 * appear if a link is only ever buried inside free-text. See shareResult.
 */
export interface ShareContent {
  text: string;
  url: string;
}

export function buildShareText(
  puzzleNumber: number,
  answers: readonly AnswerRecord[],
  verdict: string,
  totalScore: number,
  percentile: number | null = null,
  // Defaults to wherever the app is actually running (workers.dev today,
  // a real domain later) so this never needs a manual edit when that changes.
  url: string = typeof window !== "undefined" ? window.location.origin : "",
): ShareContent {
  const emojis = answers.map((a) => (a.tight ? "🎯" : a.hit ? "✅" : "❌")).join("");
  const percentileLine = percentile !== null ? ` — beat ${percentile}% of players` : "";
  const text = `Give or Take #${puzzleNumber} 🤏\n${emojis}  ${totalScore} pts${percentileLine}\n${verdict}\nThink you can beat me?`;
  return { text, url };
}

export function buildProfileShareText(
  profile: CategoryProfile,
  url: string = typeof window !== "undefined" ? window.location.origin : "",
): ShareContent {
  const bestPercent = Math.round(profile.best.hitRate * 100);
  const worstPercent = Math.round(profile.worst.hitRate * 100);
  const text = `Give or Take 🤏\nSharp on ${CATEGORY_LABELS[profile.best.category]} (${bestPercent}%), hopeless on ${CATEGORY_LABELS[profile.worst.category]} (${worstPercent}%)\nWhat's your profile?`;
  return { text, url };
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareResult(content: ShareContent): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text: content.text, url: content.url });
      return "shared";
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled the native share sheet — not a failure, just no-op.
        return "failed";
      }
      // Fall through to clipboard on other share failures.
    }
  }
  try {
    await navigator.clipboard.writeText(`${content.text}\n${content.url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
