/** Number/unit formatting shared by the slider readouts and recap screens. */

function roundForDisplay(value: number, unit: string): number {
  if (unit === "year") return Math.round(value);
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function formatNumber(value: number, unit: string): string {
  const rounded = roundForDisplay(value, unit);
  switch (unit) {
    case "$":
      return "$" + rounded.toLocaleString("en-US");
    case "%":
      return rounded.toLocaleString("en-US") + "%";
    case "year":
      return rounded.toLocaleString("en-US", { useGrouping: false });
    default:
      return rounded.toLocaleString("en-US") + " " + unit;
  }
}

export function formatQuestionValue(
  value: number,
  question: { unit: string; displayUnit?: string },
): string {
  const primary = formatNumber(value, question.unit);
  return question.displayUnit ? `${primary} ${question.displayUnit}` : primary;
}
