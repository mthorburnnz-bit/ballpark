/** Number/unit formatting shared by the slider readouts and recap screens. */

// Currency symbols read as a prefix ("£11.44"), not a suffix ("11.44 £").
const PREFIX_CURRENCY_UNITS = new Set(["$", "NZ$", "£", "€", "¥"]);

function roundForDisplay(value: number, unit: string): number {
  if (unit === "year") return Math.round(value);
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

export function formatNumber(value: number, unit: string): string {
  if (PREFIX_CURRENCY_UNITS.has(unit)) {
    // Currency always keeps up to 2 decimals (cents/pence) regardless of
    // magnitude — the general tiered rounding below would otherwise chop
    // $23.15 down to $23.1 once the value crosses 10.
    return unit + value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  const rounded = roundForDisplay(value, unit);
  switch (unit) {
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
