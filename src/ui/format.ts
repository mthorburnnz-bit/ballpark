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

const COMPACT_SCALES: Array<{ exp: number; suffix: string }> = [
  { exp: 15, suffix: "Q" },
  { exp: 12, suffix: "T" },
  { exp: 9, suffix: "B" },
  { exp: 6, suffix: "M" },
  { exp: 3, suffix: "K" },
];

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

function toSuperscript(n: number): string {
  return String(n)
    .split("")
    .map((d) => SUPERSCRIPT_DIGITS[d] ?? d)
    .join("");
}

function compactMagnitude(value: number): string {
  const exp = Math.floor(Math.log10(Math.abs(value)));
  if (exp >= 18) {
    // Past quadrillion, a named suffix stops being recognizable (content
    // spans up to 1e26 — Rubik's cube combinations) — a power of ten reads
    // better than either a wall of zeros or an obscure "sextillion".
    return `10${toSuperscript(exp)}`;
  }
  const bucket = COMPACT_SCALES.find((s) => exp >= s.exp)!;
  const scaled = value / Math.pow(10, bucket.exp);
  const rounded = Math.round(scaled * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return text + bucket.suffix;
}

/**
 * Compact form for the small-print slider tick labels only — "10M" instead
 * of "10,000,000". The two live readouts, the mid-slider "worth N pts"
 * label, the recap, and share text all keep full precision via
 * formatNumber; only these low-emphasis axis labels are small and numerous
 * enough (up to 5 on a ~400px track) to collide once values get large.
 */
export function formatTickNumber(value: number, unit: string): string {
  if (unit === "year" || Math.abs(value) < 1000) {
    return formatNumber(value, unit);
  }
  const compact = compactMagnitude(value);
  if (PREFIX_CURRENCY_UNITS.has(unit)) return unit + compact;
  if (unit === "%") return compact + "%";
  return compact + " " + unit;
}
