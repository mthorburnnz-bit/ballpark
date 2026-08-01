import type { PublicQuestion } from "../game/types.ts";
import type { RevealApiResult } from "../state/api.ts";
import type { RangeSlider } from "./slider.ts";
import { formatNumber } from "./format.ts";

export interface RevealOptions {
  question: PublicQuestion;
  slider: RangeSlider;
  result: RevealApiResult; // from the server — trueValue/funFact/source never touch the client before this
  container: HTMLElement; // reveal stage is appended here, below the slider
  reducedMotion: boolean;
}

const STEP_DELAY_MS = 150;
const NEEDLE_DROP_MS = 550;
const COUNT_UP_MS = 500;

/**
 * Orchestrates spec §5.2's reveal: needle drop -> hit/miss flash + point
 * count-up (+ confetti if tight) -> fun fact fade-in. Tap anywhere on the
 * stage skips straight to the final state. `reducedMotion` collapses the
 * whole thing to an instant reveal with no needle drop or confetti.
 */
export class RevealSequence {
  private readonly opts: RevealOptions;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private skipped = false;
  private done = false;
  private resolveFn: (() => void) | null = null;

  private stageEl!: HTMLDivElement;
  private needleEl!: HTMLDivElement;
  private pointsEl!: HTMLDivElement;
  private badgeEl!: HTMLDivElement;
  private offByEl: HTMLDivElement | null = null;

  constructor(opts: RevealOptions) {
    this.opts = opts;
  }

  play(): Promise<void> {
    return new Promise((resolve) => {
      this.resolveFn = resolve;
      this.buildDom();
      this.stageEl.addEventListener("click", () => this.skip());

      if (this.opts.reducedMotion) {
        this.applyFinalState();
        this.appendFunFact();
        this.finish();
        return;
      }
      this.runAnimated();
    });
  }

  private buildDom(): void {
    const { result, container } = this.opts;

    this.stageEl = document.createElement("div");
    this.stageEl.className = "reveal-stage";
    this.stageEl.setAttribute("aria-live", "polite");

    this.needleEl = document.createElement("div");
    this.needleEl.className = "rs-needle";
    this.opts.slider.trackElement.appendChild(this.needleEl);
    const fraction = this.opts.slider.fractionForValue(result.trueValue);
    this.needleEl.style.left = `${fraction * 100}%`;

    this.pointsEl = document.createElement("div");
    this.pointsEl.className = "reveal-points";
    this.pointsEl.textContent = "0";

    this.badgeEl = document.createElement("div");
    this.badgeEl.className = "reveal-badge";
    this.badgeEl.textContent = "";

    this.stageEl.append(this.pointsEl, this.badgeEl);
    container.appendChild(this.stageEl);
  }

  private runAnimated(): void {
    // 1. Needle drops onto the true value. Force a synchronous reflow before
    // adding the end-state class so the browser paints the off-screen/
    // transparent starting state first — otherwise it can collapse both
    // style changes into one paint and skip the transition entirely. This
    // (rather than requestAnimationFrame) also keeps working on a
    // backgrounded/non-visible tab, where rAF callbacks are suspended.
    void this.needleEl.offsetHeight;
    this.needleEl.classList.add("rs-needle-visible");

    this.after(NEEDLE_DROP_MS, () => {
      const { result } = this.opts;
      this.needleEl.classList.add(result.hit ? "state-hit" : "state-miss");

      // 2. Fill flash + points count-up (+ confetti for a tight hit).
      this.opts.slider.fillElement.classList.add(result.hit ? "flash-hit" : "flash-miss");
      this.pointsEl.classList.add(result.hit ? "state-hit" : "state-miss");
      this.badgeEl.textContent = this.badgeText();
      this.animatePointsCountUp();

      if (result.tight) {
        this.spawnConfetti();
      }
      if (!result.hit) {
        this.showOffBy();
      }
    });

    // 3. Fun fact fades in.
    this.after(NEEDLE_DROP_MS + COUNT_UP_MS + STEP_DELAY_MS, () => {
      this.appendFunFact();
      this.finish();
    });
  }

  private applyFinalState(): void {
    const { result } = this.opts;
    this.needleEl.classList.add("rs-needle-visible", result.hit ? "state-hit" : "state-miss");
    this.opts.slider.fillElement.classList.add(result.hit ? "flash-hit" : "flash-miss");
    this.pointsEl.classList.add(result.hit ? "state-hit" : "state-miss");
    this.pointsEl.textContent = String(result.points);
    this.badgeEl.textContent = this.badgeText();
    if (!result.hit) this.showOffBy();
  }

  private badgeText(): string {
    const { result } = this.opts;
    if (!result.hit) return "Miss";
    return result.tight ? "🎯 Tight hit" : "Hit";
  }

  private showOffBy(): void {
    const { question, result, slider } = this.opts;
    const { lo, hi } = slider.getValue();
    const distance = result.trueValue < lo ? lo - result.trueValue : result.trueValue - hi;
    this.offByEl = document.createElement("div");
    this.offByEl.className = "reveal-offby";
    this.offByEl.textContent = `Out by ${formatNumber(distance, question.unit)}`;
    this.stageEl.appendChild(this.offByEl);
  }

  private animatePointsCountUp(): void {
    const target = this.opts.result.points;
    // Safe default: if the tab is backgrounded, rAF callbacks below may never
    // run at all. Showing the correct final number beats an animation that
    // silently never starts and leaves "0" on screen forever.
    this.pointsEl.textContent = String(target);

    const start = performance.now();
    const step = (now: number) => {
      if (this.done) return;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      this.pointsEl.textContent = String(t < 1 ? Math.round(target * eased) : target);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private spawnConfetti(): void {
    const track = this.opts.slider.trackElement;
    const fraction = this.opts.slider.fractionForValue(this.opts.result.trueValue);
    const colors = ["var(--color-tight)", "var(--color-accent)", "var(--color-hit)"];
    for (let i = 0; i < 14; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = `${fraction * 100}%`;
      piece.style.top = "0";
      piece.style.background = colors[i % colors.length]!;
      piece.style.setProperty("--confetti-x", `${(Math.random() - 0.5) * 140}px`);
      piece.style.setProperty("--confetti-y", `${40 + Math.random() * 90}px`);
      piece.style.setProperty("--confetti-r", `${(Math.random() - 0.5) * 500}deg`);
      track.appendChild(piece);
      const t = setTimeout(() => piece.remove(), 750);
      this.timeouts.push(t);
    }
  }

  private appendFunFact(): void {
    const { result } = this.opts;
    const fact = document.createElement("div");
    fact.className = "fun-fact";

    const text = document.createElement("span");
    text.textContent = `${result.funFact} `;

    const link = document.createElement("a");
    link.href = result.source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Source ↗";

    fact.append(text, link);
    this.stageEl.appendChild(fact);
  }

  private after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      if (this.skipped) return;
      fn();
    }, ms);
    this.timeouts.push(t);
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    this.resolveFn?.();
    this.resolveFn = null;
  }

  /** Jump straight to the fully-revealed end state — the tap-to-skip affordance. */
  skip(): void {
    if (this.done || this.skipped) return;
    this.skipped = true;
    for (const t of this.timeouts) clearTimeout(t);
    this.timeouts = [];
    this.applyFinalState();
    if (!this.stageEl.querySelector(".fun-fact")) {
      this.appendFunFact();
    }
    this.finish();
  }
}
