import type { PublicQuestion } from "../game/types.ts";
import { toSliderSpace, fromSliderSpace, provisionalScore } from "../game/scoring.ts";
import { formatNumber } from "./format.ts";
import { computeTicks } from "./ticks.ts";

export interface RangeSliderOptions {
  question: PublicQuestion;
  initialLo?: number;
  initialHi?: number;
  hapticsEnabled?: boolean;
  onChange?: (lo: number, hi: number) => void;
}

type Which = "lo" | "hi";

type Drag =
  | { kind: "thumb"; which: Which }
  | { kind: "fill"; startPointerFraction: number; startLoFraction: number; startHiFraction: number }
  | null;

/**
 * THE component. Dual-thumb range slider over a linear or log domain.
 * Built with plain divs (not native <input type=range>) so we can support
 * dragging the whole range, per-thumb ARIA slider semantics, and a live
 * "worth N pts" readout between the thumbs.
 */
export class RangeSlider {
  readonly el: HTMLDivElement;

  private q: PublicQuestion;
  private lo: number;
  private hi: number;
  private hapticsEnabled: boolean;
  private onChange?: (lo: number, hi: number) => void;
  private locked = false;

  private trackEl!: HTMLDivElement;
  private fillEl!: HTMLDivElement;
  private thumbLoEl!: HTMLDivElement;
  private thumbHiEl!: HTMLDivElement;
  private readoutLoWrap!: HTMLDivElement;
  private readoutHiWrap!: HTMLDivElement;
  private readoutLoBtn!: HTMLButtonElement;
  private readoutHiBtn!: HTMLButtonElement;
  private midLabelEl!: HTMLDivElement;
  private ticksEl!: HTMLDivElement;

  private drag: Drag = null;
  private lastVibratedFraction: number | null = null;

  private readonly onPointerMove = (e: PointerEvent) => this.handlePointerMove(e);
  private readonly onPointerUp = (e: PointerEvent) => this.handlePointerUp(e);

  constructor(opts: RangeSliderOptions) {
    this.q = opts.question;
    // Default range is centered at 35%-65% of *slider space* (not raw value space) —
    // for log-scale questions, interpolating raw values instead would put the
    // default massively skewed toward domainMax, since large numbers dominate a
    // linear span even though the slider itself is laid out in log space.
    this.lo = this.snap(opts.initialLo ?? this.valueAtFraction(0.35));
    this.hi = this.snap(opts.initialHi ?? this.valueAtFraction(0.65));
    this.ensureMinGap("hi");
    this.hapticsEnabled = opts.hapticsEnabled ?? false;
    this.onChange = opts.onChange;

    this.el = document.createElement("div");
    this.el.className = "rs";
    this.buildDom();
    this.renderTicks();
    this.render();
  }

  // ---------- public API ----------

  getValue(): { lo: number; hi: number } {
    return { lo: this.lo, hi: this.hi };
  }

  /** Fraction (0..1) along the track for an arbitrary value, in this slider's scale. Used by the reveal needle. */
  fractionForValue(value: number): number {
    return this.fractionOf(value);
  }

  get trackElement(): HTMLDivElement {
    return this.trackEl;
  }

  get fillElement(): HTMLDivElement {
    return this.fillEl;
  }

  lock(): void {
    this.locked = true;
    this.el.classList.add("rs-locked");
    this.thumbLoEl.tabIndex = -1;
    this.thumbHiEl.tabIndex = -1;
  }

  destroy(): void {
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
    this.el.remove();
  }

  // ---------- value <-> slider-space helpers ----------

  private fractionOf(value: number): number {
    const s = toSliderSpace(value, this.q.scale);
    const minS = toSliderSpace(this.q.domainMin, this.q.scale);
    const maxS = toSliderSpace(this.q.domainMax, this.q.scale);
    return (s - minS) / (maxS - minS);
  }

  private valueAtFraction(fraction: number): number {
    const minS = toSliderSpace(this.q.domainMin, this.q.scale);
    const maxS = toSliderSpace(this.q.domainMax, this.q.scale);
    const s = minS + fraction * (maxS - minS);
    return fromSliderSpace(s, this.q.scale);
  }

  private snap(value: number): number {
    const clamped = Math.min(this.q.domainMax, Math.max(this.q.domainMin, value));
    let snapped: number;
    if (this.q.scale === "log") {
      snapped = roundToSigFigs(clamped, 2);
    } else {
      snapped = Math.round(clamped / this.q.step) * this.q.step;
    }
    return Math.min(this.q.domainMax, Math.max(this.q.domainMin, snapped));
  }

  /** Step to the next/previous snap-grid value, used by keyboard control. */
  private stepValue(value: number, direction: 1 | -1, multiplier: number): number {
    if (this.q.scale === "log") {
      return sigFig2Step(value, direction, multiplier);
    }
    return value + direction * this.q.step * multiplier;
  }

  private minGap(): number {
    return 2 * this.q.step;
  }

  private ensureMinGap(pushWhich: Which): void {
    const gap = this.minGap();
    if (this.hi - this.lo < gap) {
      if (pushWhich === "hi") {
        this.hi = Math.min(this.q.domainMax, this.lo + gap);
        this.lo = Math.min(this.lo, this.hi - gap);
      } else {
        this.lo = Math.max(this.q.domainMin, this.hi - gap);
        this.hi = Math.max(this.hi, this.lo + gap);
      }
    }
  }

  // ---------- DOM ----------

  private buildDom(): void {
    this.readoutLoWrap = this.buildReadout("lo");
    this.readoutHiWrap = this.buildReadout("hi");
    this.readoutLoBtn = this.readoutLoWrap.querySelector("button")!;
    this.readoutHiBtn = this.readoutHiWrap.querySelector("button")!;

    const readoutsRow = document.createElement("div");
    readoutsRow.className = "rs-readouts";
    readoutsRow.append(this.readoutLoWrap, this.readoutHiWrap);

    this.trackEl = document.createElement("div");
    this.trackEl.className = "rs-track";

    const trackLine = document.createElement("div");
    trackLine.className = "rs-track-line";

    this.fillEl = document.createElement("div");
    this.fillEl.className = "rs-fill";
    this.fillEl.addEventListener("pointerdown", (e) => this.startFillDrag(e));

    this.midLabelEl = document.createElement("div");
    this.midLabelEl.className = "rs-mid-label";
    this.fillEl.appendChild(this.midLabelEl);

    this.thumbLoEl = this.buildThumb("lo");
    this.thumbHiEl = this.buildThumb("hi");

    this.trackEl.append(trackLine, this.fillEl, this.thumbLoEl, this.thumbHiEl);

    this.ticksEl = document.createElement("div");
    this.ticksEl.className = "rs-ticks";

    this.el.append(readoutsRow, this.trackEl, this.ticksEl);
  }

  private buildReadout(which: Which): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = `rs-readout rs-readout-${which}`;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rs-readout-btn tabular-nums";
    btn.setAttribute("aria-label", `${which === "lo" ? "Lower" : "Upper"} bound, tap to type an exact value`);
    btn.addEventListener("click", () => this.startEditing(which));

    wrap.appendChild(btn);
    return wrap;
  }

  private buildThumb(which: Which): HTMLDivElement {
    const thumb = document.createElement("div");
    thumb.className = `rs-thumb rs-thumb-${which}`;
    thumb.setAttribute("role", "slider");
    thumb.tabIndex = 0;
    thumb.setAttribute("aria-label", which === "lo" ? "Low end of range" : "High end of range");
    thumb.setAttribute("aria-valuemin", String(this.q.domainMin));
    thumb.setAttribute("aria-valuemax", String(this.q.domainMax));

    thumb.addEventListener("pointerdown", (e) => this.startThumbDrag(e, which));
    thumb.addEventListener("keydown", (e) => this.handleKeydown(e, which));

    return thumb;
  }

  private renderTicks(): void {
    this.ticksEl.innerHTML = "";
    const ticks = computeTicks(this.q.domainMin, this.q.domainMax, this.q.scale);
    for (const tick of ticks) {
      const el = document.createElement("span");
      el.className = "rs-tick";
      el.style.left = `${tick.fraction * 100}%`;
      el.textContent = formatNumber(tick.value, this.q.unit);
      this.ticksEl.appendChild(el);
    }
  }

  // ---------- rendering ----------

  private render(): void {
    const loFrac = this.fractionOf(this.lo);
    const hiFrac = this.fractionOf(this.hi);

    this.thumbLoEl.style.left = `${loFrac * 100}%`;
    this.thumbHiEl.style.left = `${hiFrac * 100}%`;
    this.fillEl.style.left = `${loFrac * 100}%`;
    this.fillEl.style.width = `${Math.max(0, hiFrac - loFrac) * 100}%`;

    this.readoutLoBtn.textContent = formatNumber(this.lo, this.q.unit);
    this.readoutHiBtn.textContent = formatNumber(this.hi, this.q.unit);

    this.thumbLoEl.setAttribute("aria-valuenow", String(this.lo));
    this.thumbLoEl.setAttribute("aria-valuetext", formatNumber(this.lo, this.q.unit));
    this.thumbHiEl.setAttribute("aria-valuenow", String(this.hi));
    this.thumbHiEl.setAttribute("aria-valuetext", formatNumber(this.hi, this.q.unit));

    const width = this.hi - this.lo;
    const points = provisionalScore(this.lo, this.hi, this.q.domainMin, this.q.domainMax, this.q.scale);
    this.midLabelEl.textContent = `${formatNumber(width, this.q.unit)} wide · worth ${points} pts`;

    this.onChange?.(this.lo, this.hi);
  }

  // ---------- pointer drag: thumbs ----------

  private startThumbDrag(e: PointerEvent, which: Which): void {
    if (this.locked) return;
    e.preventDefault();
    this.drag = { kind: "thumb", which };
    (e.target as HTMLElement).focus();
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);
  }

  private startFillDrag(e: PointerEvent): void {
    if (this.locked) return;
    // Ignore if the pointerdown actually landed on a thumb (thumbs sit above the fill).
    if ((e.target as HTMLElement).closest(".rs-thumb")) return;
    e.preventDefault();
    this.drag = {
      kind: "fill",
      startPointerFraction: this.pointerFraction(e),
      startLoFraction: this.fractionOf(this.lo),
      startHiFraction: this.fractionOf(this.hi),
    };
    document.addEventListener("pointermove", this.onPointerMove);
    document.addEventListener("pointerup", this.onPointerUp);
  }

  private pointerFraction(e: PointerEvent): number {
    const rect = this.trackEl.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.drag) return;

    if (this.drag.kind === "thumb") {
      const fraction = this.pointerFraction(e);
      const raw = this.valueAtFraction(fraction);
      const snapped = this.snap(raw);
      this.applyThumbValue(this.drag.which, snapped);
    } else {
      const currentFraction = this.pointerFraction(e);
      const delta = currentFraction - this.drag.startPointerFraction;
      let newLoFrac = this.drag.startLoFraction + delta;
      let newHiFrac = this.drag.startHiFraction + delta;
      const width = this.drag.startHiFraction - this.drag.startLoFraction;
      if (newLoFrac < 0) {
        newLoFrac = 0;
        newHiFrac = width;
      }
      if (newHiFrac > 1) {
        newHiFrac = 1;
        newLoFrac = 1 - width;
      }
      const newLo = this.snap(this.valueAtFraction(newLoFrac));
      const newHi = this.snap(this.valueAtFraction(newHiFrac));
      this.lo = Math.min(newLo, newHi - this.minGap());
      this.hi = Math.max(newHi, newLo + this.minGap());
      this.lo = Math.max(this.q.domainMin, this.lo);
      this.hi = Math.min(this.q.domainMax, this.hi);
      this.maybeVibrate(this.lo);
      this.render();
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    this.drag = null;
    document.removeEventListener("pointermove", this.onPointerMove);
    document.removeEventListener("pointerup", this.onPointerUp);
  }

  private applyThumbValue(which: Which, snapped: number): void {
    const gap = this.minGap();
    if (which === "lo") {
      this.lo = Math.min(snapped, this.hi - gap);
      this.lo = Math.max(this.q.domainMin, this.lo);
    } else {
      this.hi = Math.max(snapped, this.lo + gap);
      this.hi = Math.min(this.q.domainMax, this.hi);
    }
    this.maybeVibrate(snapped);
    this.render();
  }

  private maybeVibrate(newSnappedValue: number): void {
    if (!this.hapticsEnabled) return;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (this.lastVibratedFraction === newSnappedValue) return;
    this.lastVibratedFraction = newSnappedValue;
    navigator.vibrate(5);
  }

  // ---------- keyboard ----------

  private handleKeydown(e: KeyboardEvent, which: Which): void {
    if (this.locked) return;
    const multiplier = e.shiftKey ? 10 : 1;
    let direction: 1 | -1 | 0 = 0;

    switch (e.key) {
      case "ArrowLeft":
      case "ArrowDown":
        direction = -1;
        break;
      case "ArrowRight":
      case "ArrowUp":
        direction = 1;
        break;
      case "Home":
        this.applyThumbValue(which, this.q.domainMin);
        e.preventDefault();
        return;
      case "End":
        this.applyThumbValue(which, this.q.domainMax);
        e.preventDefault();
        return;
      default:
        return;
    }

    e.preventDefault();
    const current = which === "lo" ? this.lo : this.hi;
    const stepped = this.stepValue(current, direction, multiplier);
    this.applyThumbValue(which, this.snap(stepped));
  }

  // ---------- tap-to-type ----------

  private startEditing(which: Which): void {
    if (this.locked) return;
    const wrap = which === "lo" ? this.readoutLoWrap : this.readoutHiWrap;
    const btn = which === "lo" ? this.readoutLoBtn : this.readoutHiBtn;
    const current = which === "lo" ? this.lo : this.hi;

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.className = "rs-readout-input tabular-nums";
    input.value = String(roundForInputDisplay(current));
    input.step = String(this.q.step);
    input.setAttribute("aria-label", `${which === "lo" ? "Lower" : "Upper"} bound exact value`);

    const commit = () => {
      const parsed = Number.parseFloat(input.value);
      if (!Number.isNaN(parsed)) {
        this.applyThumbValue(which, this.snap(parsed));
      } else {
        this.render();
      }
      wrap.replaceChild(btn, input);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        input.blur();
      } else if (e.key === "Escape") {
        wrap.replaceChild(btn, input);
      }
    });
    input.addEventListener("blur", commit, { once: true });

    wrap.replaceChild(input, btn);
    input.focus();
    input.select();
  }
}

function roundForInputDisplay(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundToSigFigs(value: number, sig: number): number {
  if (value === 0) return 0;
  // toPrecision avoids the float drift that manual log10/pow round-tripping
  // introduces (e.g. 2,000,000 coming back as 1999999.9999999998).
  return Number.parseFloat(value.toPrecision(sig));
}

/**
 * Moves a value by `multiplier` steps of "2 significant figures", per spec §4.2:
 * log-scale snapping is to 2 sig figs of the value, not of the log. Keyboard
 * stepping follows the same grid so arrow keys land on the same values a drag would.
 */
export function sigFig2Step(value: number, direction: 1 | -1, multiplier: number): number {
  const v = Math.max(value, 1e-9);
  let k = Math.floor(Math.log10(v));
  let mantissa = v / Math.pow(10, k);
  let mant2 = Math.round(mantissa * 10);
  if (mant2 >= 100) {
    mant2 = 10;
    k += 1;
  }
  mant2 += direction * multiplier;
  while (mant2 > 99) {
    mant2 -= 90;
    k += 1;
  }
  while (mant2 < 10) {
    mant2 += 90;
    k -= 1;
  }
  return roundToSigFigs((mant2 / 10) * Math.pow(10, k), 2);
}
