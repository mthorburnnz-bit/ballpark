import type { AnswerRecord } from "../state/save.ts";

export function buildShareText(
  puzzleNumber: number,
  answers: readonly AnswerRecord[],
  verdict: string,
  totalScore: number,
  // Defaults to wherever the app is actually running (workers.dev today,
  // a real domain later) so this never needs a manual edit when that changes.
  url: string = typeof window !== "undefined" ? window.location.host : "",
): string {
  const emojis = answers.map((a) => (a.tight ? "🎯" : a.hit ? "✅" : "❌")).join("");
  return `Give or Take #${puzzleNumber} 🤏\n${emojis}  ${totalScore} pts\n${verdict}\n${url}`;
}

export type ShareOutcome = "shared" | "copied" | "failed";

export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
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
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
