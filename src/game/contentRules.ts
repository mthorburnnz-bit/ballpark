import type { Question } from "./types.ts";
import { DEFAULT_LO_FRACTION, DEFAULT_HI_FRACTION } from "./scoring.ts";

export interface ValidationIssue {
  questionId?: string;
  message: string;
}

const VALID_CATEGORIES = new Set(["geography", "history", "science", "sport", "everyday", "money", "nature"]);
const VALID_SCALES = new Set(["linear", "log"]);

/** Where the true value sits in the domain, in slider space (0 = domainMin, 1 = domainMax). */
export function valuePositionFraction(q: Pick<Question, "value" | "domainMin" | "domainMax" | "scale">): number {
  return q.scale === "log"
    ? (Math.log10(q.value) - Math.log10(q.domainMin)) / (Math.log10(q.domainMax) - Math.log10(q.domainMin))
    : (q.value - q.domainMin) / (q.domainMax - q.domainMin);
}

/** §7.4: schema-valid, domain/position/step sanity, asOf pinning, source URL. */
export function validateQuestion(q: Question): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fail = (message: string) => issues.push({ questionId: q.id, message });

  if (!q.id) fail(`missing "id"`);
  if (!q.prompt) fail(`missing "prompt"`);
  if (!q.unit) fail(`missing "unit"`);
  if (!q.category) fail(`missing "category"`);
  if (!q.funFact) fail(`missing "funFact"`);
  if (!q.source) fail(`missing "source"`);
  if (typeof q.value !== "number" || Number.isNaN(q.value)) fail(`"value" must be a number`);
  if (typeof q.domainMin !== "number" || Number.isNaN(q.domainMin)) fail(`"domainMin" must be a number`);
  if (typeof q.domainMax !== "number" || Number.isNaN(q.domainMax)) fail(`"domainMax" must be a number`);
  if (typeof q.step !== "number" || Number.isNaN(q.step)) fail(`"step" must be a number`);

  if (q.category && !VALID_CATEGORIES.has(q.category)) fail(`invalid category "${q.category}"`);
  if (q.scale && !VALID_SCALES.has(q.scale)) fail(`invalid scale "${q.scale}"`);

  if (q.scale === "log" && q.domainMin <= 0) {
    fail(`log scale requires domainMin > 0, got ${q.domainMin}`);
  }

  if (typeof q.domainMax === "number" && typeof q.domainMin === "number") {
    if (q.domainMax <= q.domainMin) {
      fail(`domainMax (${q.domainMax}) must be greater than domainMin (${q.domainMin})`);
    } else {
      if (!(q.value > q.domainMin && q.value < q.domainMax)) {
        fail(`value ${q.value} is not strictly inside domain [${q.domainMin}, ${q.domainMax}]`);
      }

      const fraction = valuePositionFraction(q);

      if (fraction < 0.1 || fraction > 0.9) {
        fail(
          `value sits at ${(fraction * 100).toFixed(1)}% of the domain in slider space — must be within 10%-90%`,
        );
      }

      if (typeof q.step === "number") {
        if (!(q.step > 0)) {
          fail(`step must be > 0, got ${q.step}`);
        } else if (2 * q.step >= q.domainMax - q.domainMin) {
          fail(
            `step (${q.step}) is too coarse for domain width (${q.domainMax - q.domainMin}) — the minimum range (2x step) would span the whole domain`,
          );
        }
      }
    }
  }

  if ((q.category === "money" || q.unit === "people") && !q.asOf) {
    fail(`time-varying quantity (category=${q.category}, unit=${q.unit}) requires "asOf"`);
  }
  if (q.asOf && q.prompt && !/\d{4}/.test(q.prompt) && !/as of/i.test(q.prompt)) {
    fail(`"asOf" is set (${q.asOf}) but the prompt doesn't appear to pin a date`);
  }

  if (q.source && !/^https?:\/\//.test(q.source)) {
    fail(`"source" must be a URL, got "${q.source}"`);
  }

  return issues;
}

function normalizePrompt(p: string): string {
  return p
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function validateBank(bank: readonly Question[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Map<string, number>();
  const seenPrompts = new Map<string, string>();

  for (const q of bank) {
    issues.push(...validateQuestion(q));

    seenIds.set(q.id, (seenIds.get(q.id) ?? 0) + 1);

    const norm = normalizePrompt(q.prompt ?? "");
    const existing = seenPrompts.get(norm);
    if (existing && existing !== q.id) {
      issues.push({ questionId: q.id, message: `near-duplicate prompt of "${existing}"` });
    } else {
      seenPrompts.set(norm, q.id);
    }
  }

  for (const [id, count] of seenIds) {
    if (count > 1) issues.push({ questionId: id, message: `id used ${count} times in the bank` });
  }

  // A per-question check (10%-90%, above) keeps any single question sane,
  // but says nothing about the bank as a whole: a player who locks in the
  // slider's untouched default range (35%-65% — see DEFAULT_LO/HI_FRACTION)
  // gets a free hit on every question whose true value happens to land
  // there. A uniform spread across the allowed 10%-90% band would put
  // ~37.5% of questions in that 35%-65% slice; well above that means
  // values are clustering near the middle instead of being spread out.
  // Skipped below a minimum bank size so small test fixtures aren't
  // affected by a rule that's only meaningful in aggregate.
  const MIN_BANK_SIZE_FOR_DISTRIBUTION_CHECK = 20;
  const MAX_DEFAULT_WINDOW_SHARE = 0.4;
  if (bank.length >= MIN_BANK_SIZE_FOR_DISTRIBUTION_CHECK) {
    const inDefaultWindow = bank.filter((q) => {
      const f = valuePositionFraction(q);
      return f >= DEFAULT_LO_FRACTION && f <= DEFAULT_HI_FRACTION;
    }).length;
    const share = inDefaultWindow / bank.length;
    if (share > MAX_DEFAULT_WINDOW_SHARE) {
      issues.push({
        message:
          `${inDefaultWindow}/${bank.length} questions (${(share * 100).toFixed(1)}%) have their true value inside ` +
          `the slider's default ${DEFAULT_LO_FRACTION * 100}%-${DEFAULT_HI_FRACTION * 100}% starting range — ` +
          `above the ${MAX_DEFAULT_WINDOW_SHARE * 100}% cap. Too many questions are winnable without touching the slider.`,
      });
    }
  }

  return issues;
}

export function validateScheduleEntry(
  ids: readonly string[],
  bank: ReadonlyMap<string, Question>,
  dateStr: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (ids.length !== 5) {
    issues.push({ message: `${dateStr}: schedule entry has ${ids.length} questions, expected 5` });
    return issues;
  }
  if (new Set(ids).size !== 5) {
    issues.push({ message: `${dateStr}: schedule entry has duplicate question ids within the day` });
  }

  const categoryCounts = new Map<string, number>();
  let hasLog = false;
  let hasLinear = false;
  for (const id of ids) {
    const q = bank.get(id);
    if (!q) {
      issues.push({ message: `${dateStr}: unknown question id "${id}"` });
      continue;
    }
    categoryCounts.set(q.category, (categoryCounts.get(q.category) ?? 0) + 1);
    if (q.scale === "log") hasLog = true;
    else hasLinear = true;
  }
  for (const [cat, count] of categoryCounts) {
    if (count > 2) issues.push({ message: `${dateStr}: category "${cat}" appears ${count} times, max 2` });
  }
  if (!hasLog || !hasLinear) {
    issues.push({ message: `${dateStr}: day should mix at least one log-scale and one linear-scale question` });
  }
  return issues;
}

export function validateSchedule(
  scheduleObj: Record<string, string[]>,
  bank: ReadonlyMap<string, Question>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const firstSeenOn = new Map<string, string>();

  for (const [dateStr, ids] of Object.entries(scheduleObj)) {
    issues.push(...validateScheduleEntry(ids, bank, dateStr));
    for (const id of ids) {
      const firstDate = firstSeenOn.get(id);
      if (firstDate) {
        issues.push({
          questionId: id,
          message: `used on both ${firstDate} and ${dateStr} — each question must be used at most once in the schedule`,
        });
      } else {
        firstSeenOn.set(id, dateStr);
      }
    }
  }
  return issues;
}
