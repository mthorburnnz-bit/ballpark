import type { Scale } from "../game/types.ts";
import { toSliderSpace } from "../game/scoring.ts";

export interface Tick {
  value: number;
  fraction: number; // 0..1 position along the track in slider space
}

function fractionOf(value: number, domainMin: number, domainMax: number, scale: Scale): number {
  const s = toSliderSpace(value, scale);
  const minS = toSliderSpace(domainMin, scale);
  const maxS = toSliderSpace(domainMax, scale);
  return (s - minS) / (maxS - minS);
}

function niceStep(roughStep: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let niceResidual: number;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

function computeLinearTicks(domainMin: number, domainMax: number): Tick[] {
  const targetCount = 5;
  const roughStep = (domainMax - domainMin) / (targetCount - 1);
  const step = niceStep(roughStep) || 1;
  const start = Math.ceil(domainMin / step) * step;
  const ticks: Tick[] = [];
  for (let v = start; v <= domainMax + 1e-9 && ticks.length < 8; v += step) {
    ticks.push({
      value: Math.round(v * 1e6) / 1e6,
      fraction: fractionOf(v, domainMin, domainMax, "linear"),
    });
  }
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (!first || first.fraction > 0.05) {
    ticks.unshift({ value: domainMin, fraction: 0 });
  }
  if (!last || last.fraction < 0.95) {
    ticks.push({ value: domainMax, fraction: 1 });
  }
  return ticks.slice(0, 6);
}

function computeLogTicks(domainMin: number, domainMax: number): Tick[] {
  const minExp = Math.floor(Math.log10(domainMin));
  const maxExp = Math.ceil(Math.log10(domainMax));
  const withSubdivisions: number[] = [];
  const powersOfTen: number[] = [];
  for (let exp = minExp; exp <= maxExp; exp++) {
    for (const mult of [1, 2, 5]) {
      const v = mult * Math.pow(10, exp);
      if (v >= domainMin - 1e-9 && v <= domainMax + 1e-9) {
        withSubdivisions.push(v);
        if (mult === 1) powersOfTen.push(v);
      }
    }
  }
  withSubdivisions.sort((a, b) => a - b);
  powersOfTen.sort((a, b) => a - b);

  let chosen: number[];
  if (powersOfTen.length >= 4 && powersOfTen.length <= 6) {
    chosen = powersOfTen;
  } else if (withSubdivisions.length > 6) {
    // Too many candidates: prefer powers of ten, pad with subdivisions if too few.
    chosen = powersOfTen.length >= 4 ? powersOfTen : withSubdivisions.slice(0, 6);
  } else {
    chosen = withSubdivisions;
  }

  return chosen.map((v) => ({ value: v, fraction: fractionOf(v, domainMin, domainMax, "log") }));
}

export function computeTicks(domainMin: number, domainMax: number, scale: Scale): Tick[] {
  if (domainMax <= domainMin) return [];
  return scale === "log" ? computeLogTicks(domainMin, domainMax) : computeLinearTicks(domainMin, domainMax);
}
