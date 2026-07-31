let toastEl: HTMLDivElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string, durationMs = 2000): void {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.remove("visible");
  // Force a reflow so the "hidden" state paints before we switch to
  // "visible" — otherwise the browser can collapse both style changes into
  // one paint and skip the fade-in transition. See reveal.ts for the same
  // pattern; unlike requestAnimationFrame this doesn't depend on the tab
  // being visible/composited.
  void toastEl.offsetHeight;
  toastEl.classList.add("visible");

  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    toastEl?.classList.remove("visible");
  }, durationMs);
}
