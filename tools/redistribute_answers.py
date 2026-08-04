#!/usr/bin/env python3
"""One-off content fix: questions whose true value sits inside the slider's
default 35%-65% starting range get a free hit if a player never touches the
slider. Shifts domainMin/domainMax (never the true value) for affected
questions so the value's position moves outside that band, alternating
between a "low" and "high" target band (deterministic per question id) to
keep the overall bank roughly balanced rather than piling everything onto
one side. Prefers preserving the domain *span* (log space for log-scale
questions, linear space for linear) so difficulty doesn't shift alongside
position — but when the span is larger than the value itself, preserving it
while shifting would need a negative domainMin, which clamps back to 0 and
collapses the fraction right back into the forbidden band. For that case a
second construction (anchor the floor, solve the other bound directly for
the exact target fraction) is tried instead, accepting a smaller span.

Two unit-specific hard rules, found by inspection after a first pass:
- "year": a LOW-band shift pushes domainMax out (since span is fixed and
  domainMin only moves up slightly) — for a value already close to the
  present day that runs domainMax into the future, which makes no sense
  for a past event. Forced to the HIGH band only (which instead pushes
  domainMin further into the past), plus a hard ceiling as a backstop.
- "%": physically bounded to [0, 100] regardless of which band is picked.
"""
import glob
import hashlib
import json
import math
import sys

QUESTIONS_DIR = "content/questions"
DEFAULT_LO, DEFAULT_HI = 0.35, 0.65
LOW_BAND = (0.15, 0.32)
HIGH_BAND = (0.68, 0.85)
YEAR_CEILING = 2026
DRY_RUN = "--write" not in sys.argv


def fraction_of(value, dmin, dmax, scale):
    if scale == "log":
        return (math.log10(value) - math.log10(dmin)) / (math.log10(dmax) - math.log10(dmin))
    return (value - dmin) / (dmax - dmin)


def round_sig(x, sig=2):
    if x <= 0:
        return x
    n = math.floor(math.log10(x))
    factor = 10 ** (sig - 1 - n)
    return round(x * factor) / factor


def round_year(x):
    return round(x / 10) * 10


def clean_number(x):
    """Write 2900 rather than 2900.0 — matches every existing content file's
    style, where a whole number is never written with a trailing .0."""
    x = round(x, 6)
    return int(x) if x == int(x) else x


def stable_unit_floats(qid):
    h = hashlib.sha256(qid.encode()).digest()
    a = int.from_bytes(h[:8], "big") / 2**64
    b = int.from_bytes(h[8:16], "big") / 2**64
    return a, b


def band_fractions(band, within_pick):
    lo, hi = band
    primary = lo + within_pick * (hi - lo)
    # A few alternates spread across the band, tried if the primary pick
    # doesn't survive rounding/clamping for this particular domain.
    return [primary, lo + 0.15 * (hi - lo), lo + 0.85 * (hi - lo), lo + 0.5 * (hi - lo)]


def candidate_plan(qid, unit):
    """Ordered list of (target_fraction, band_name) to try. Year is
    high-band-only (see module docstring); everything else tries its
    id-picked band first, then the other band as a last resort."""
    band_pick, within_pick = stable_unit_floats(qid)
    if unit == "year":
        bands = [("high", HIGH_BAND)]
    else:
        primary_name, primary_band = ("high", HIGH_BAND) if band_pick < 0.5 else ("low", LOW_BAND)
        other_name, other_band = ("low", LOW_BAND) if primary_name == "high" else ("high", HIGH_BAND)
        bands = [(primary_name, primary_band), (other_name, other_band)]

    plan = []
    for name, band in bands:
        for f in band_fractions(band, within_pick):
            plan.append((f, name))
    return plan


def valid(value, dmin, dmax, scale, step, unit):
    if not (dmax > dmin):
        return False
    if not (value > dmin and value < dmax):
        return False
    if scale == "log" and dmin <= 0:
        return False
    if unit == "%" and (dmin < 0 or dmax > 100):
        return False
    if unit == "year" and dmax > YEAR_CEILING:
        return False
    f = fraction_of(value, dmin, dmax, scale)
    if f < 0.1 or f > 0.9:
        return False
    if DEFAULT_LO <= f <= DEFAULT_HI:
        return False
    if 2 * step >= dmax - dmin:
        return False
    return True


def span_preserving(value, dmin, dmax, scale, target_f, band, unit):
    if scale == "log":
        log_span = math.log10(dmax) - math.log10(dmin)
        new_log_min = math.log10(value) - target_f * log_span
        new_dmin = 10**new_log_min
        new_dmax = new_dmin * (10**log_span)
        return new_dmin, new_dmax

    span = dmax - dmin
    new_dmin = value - target_f * span
    new_dmax = new_dmin + span
    floor = 0.0
    if new_dmin < floor:
        new_dmin = floor
        new_dmax = new_dmin + span
    if unit == "%" and new_dmax > 100:
        new_dmax = 100.0
        new_dmin = max(new_dmax - span, 0.0)
    if unit == "year" and new_dmax > YEAR_CEILING:
        new_dmax = YEAR_CEILING
        new_dmin = new_dmax - span
    return new_dmin, new_dmax


def anchored(value, scale, target_f, band, unit):
    """Fixes whichever bound the band pushes toward its natural limit (the
    floor for a high-band target, a unit-appropriate ceiling for a
    low-band target) and solves the other bound directly for target_f —
    used when preserving the original span isn't possible without going
    out of bounds. Accepts a smaller span as the trade-off."""
    if scale == "log":
        return None  # domainMin can't be anchored at 0 on a log scale; span-preserving is the only option
    if band == "high":
        floor = 0.0
        if not (value > floor):
            return None
        new_dmin = floor
        new_dmax = new_dmin + (value - new_dmin) / target_f
        if unit == "%":
            new_dmax = min(new_dmax, 100.0)
        if unit == "year":
            new_dmax = min(new_dmax, YEAR_CEILING)
        return new_dmin, new_dmax
    else:
        ceiling = 100.0 if unit == "%" else (YEAR_CEILING if unit == "year" else value * 50 + 1000)
        if not (ceiling > value):
            return None
        new_dmax = ceiling
        # f = (value-dmin)/(dmax-dmin) => dmin = (value - f*dmax) / (1-f)
        new_dmin = (value - target_f * new_dmax) / (1 - target_f)
        new_dmin = max(new_dmin, 0.0)
        return new_dmin, new_dmax


def round_bounds(dmin, dmax, unit, scale, step):
    if unit == "year":
        return round_year(dmin), round_year(dmax)
    # An integer step on a linear scale means the true values are always
    # whole numbers (player counts, teeth, chromosomes, ...) — round_sig's
    # 2-sig-fig rounding can otherwise land on something like "7.6 players",
    # which is meaningless for a count.
    if scale == "linear" and step == int(step) and step >= 1:
        return round(dmin), round(dmax)
    return round_sig(dmin, 2), round_sig(dmax, 2)


def try_candidate(value, dmin, dmax, scale, step, unit):
    if dmin is None or not (dmax > dmin) or dmin < 0:
        return None
    nice_dmin, nice_dmax = round_bounds(dmin, dmax, unit, scale, step)
    if valid(value, nice_dmin, nice_dmax, scale, step, unit):
        return nice_dmin, nice_dmax, True
    if valid(value, dmin, dmax, scale, step, unit):
        return dmin, dmax, False
    return None


def fix_question(q):
    value, dmin, dmax, scale, step, unit = (
        q["value"],
        q["domainMin"],
        q["domainMax"],
        q["scale"],
        q["step"],
        q["unit"],
    )
    f0 = fraction_of(value, dmin, dmax, scale)
    if not (DEFAULT_LO <= f0 <= DEFAULT_HI):
        return None  # untouched

    for target_f, band in candidate_plan(q["id"], unit):
        for dmin2, dmax2 in (
            span_preserving(value, dmin, dmax, scale, target_f, band, unit),
            anchored(value, scale, target_f, band, unit) or (None, None),
        ):
            result = try_candidate(value, dmin2, dmax2, scale, step, unit)
            if result is None:
                continue
            new_dmin, new_dmax, rounded = result

            new_step = step
            if 2 * new_step >= new_dmax - new_dmin:
                while 2 * new_step >= new_dmax - new_dmin and new_step > 0:
                    new_step = round_sig(new_step / 3, 2)

            new_dmin = clean_number(new_dmin)
            new_dmax = clean_number(new_dmax)
            new_step = clean_number(new_step)

            new_f = fraction_of(value, new_dmin, new_dmax, scale)
            return {
                "id": q["id"],
                "old": (dmin, dmax, f0),
                "new": (new_dmin, new_dmax, new_f),
                "rounded": rounded,
                "step": (step, new_step),
            }

    return "FAILED"


def main():
    files = sorted(glob.glob(f"{QUESTIONS_DIR}/*.json"))
    changed = 0
    failed = []
    for path in files:
        q = json.load(open(path))
        result = fix_question(q)
        if result is None:
            continue
        if result == "FAILED":
            failed.append(q["id"])
            continue
        changed += 1
        rounded_note = "" if result["rounded"] else "  (unrounded fallback)"
        step_note = "" if result["step"][0] == result["step"][1] else f"  step {result['step'][0]}->{result['step'][1]}"
        print(
            f"{result['id']:45s} {result['old'][2]*100:5.1f}% -> {result['new'][2]*100:5.1f}%  "
            f"domain [{result['old'][0]:.4g},{result['old'][1]:.4g}] -> [{result['new'][0]:.4g},{result['new'][1]:.4g}]"
            f"{rounded_note}{step_note}"
        )
        if not DRY_RUN:
            q["domainMin"] = result["new"][0]
            q["domainMax"] = result["new"][1]
            q["step"] = result["step"][1]
            with open(path, "w", encoding="utf-8") as f:
                json.dump(q, f, indent=2, ensure_ascii=False)
                f.write("\n")

    print(f"\n{changed} questions changed, {len(failed)} failed to find a valid domain: {failed}")
    if DRY_RUN:
        print("(dry run — pass --write to apply)")


if __name__ == "__main__":
    main()
