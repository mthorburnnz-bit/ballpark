/**
 * Captures Play Store screenshots by driving headless Edge over the Chrome
 * DevTools Protocol. Uses Node's built-in WebSocket, so there's no browser
 * automation dependency to install.
 *
 * Gameplay screens are captured via the ARCHIVE (practice mode), which never
 * submits to the leaderboard — so running this leaves no trace in production
 * data.
 *
 * Output is 1080x1920 (9:16), which satisfies both Play tablet tiers at once:
 * 7-inch wants each side 320-3840, 10-inch wants 1080-7680.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SITE = process.env.SHOT_SITE ?? "https://give-or-take.com";
const OUT = process.argv[2] ?? "tools/shots";
const PROFILE = `${OUT}/.profile`;
const PORT = 9333;
// CSS viewport is a realistic small-tablet size; the device scale factor
// multiplies it up to the 1080x1920 output Play wants. Capturing at 1080 CSS
// pixels directly would leave the 480px content column filling under half the
// frame, marooned in empty background.
const CSS_W = 720, CSS_H = 1280, SCALE = 1.5;
const W = CSS_W * SCALE, H = CSS_H * SCALE;

mkdirSync(OUT, { recursive: true });

const edge = spawn(EDGE, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  `--window-size=${CSS_W},${CSS_H}`, "about:blank",
], { stdio: "ignore" });

let ws, msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    globalThis.setTimeout(() => rej(new Error(`${method} timed out`)), 20000);
  });
}

/** Runs an expression in the page and returns its value. */
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.text}`);
  return r.result?.value;
}

/** Clicks the first button whose trimmed text matches, and waits for re-render. */
async function click(text, waitMs = 700) {
  const ok = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(text)});
    if (!b) return false;
    b.click();
    return true;
  })()`);
  if (!ok) throw new Error(`no button labelled "${text}"`);
  await sleep(waitMs);
}

async function shot(name) {
  // Programmatic clicks leave a :focus-visible ring on the last button, which
  // reads as a rendering glitch in a store screenshot. Drop focus first.
  await evaluate(`(() => { document.activeElement?.blur?.(); return true; })()`);
  await sleep(150);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
  console.log(`  captured ${name}.png`);
}

try {
  // Wait for the debugger endpoint, then attach to the page target.
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) throw new Error("Edge devtools endpoint never came up");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error.message)) : p.res(m.result);
  });
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: CSS_W, height: CSS_H, deviceScaleFactor: SCALE, mobile: false,
  });

  await send("Page.navigate", { url: SITE });
  await sleep(3500);

  // Seed plausible history so Stats shows a filled-in profile rather than
  // empty-state copy. Local only — never sent anywhere.
  await evaluate(`(() => {
    localStorage.setItem('giveortake:save', JSON.stringify({
      version: 1, days: {}, hasSeenTutorial: true,
      streak: { current: 12, best: 34, lastCompletedDate: null },
      settings: { reducedMotion: false, haptics: true, sound: false },
      lifetime: {
        gamesPlayed: 34, totalScore: 7480, totalQuestions: 170,
        totalHits: 112, totalTight: 31, totalWidthFraction: 52.7,
        categoryTotals: {
          history: { questions: 26, hits: 22 }, geography: { questions: 28, hits: 20 },
          science: { questions: 24, hits: 16 }, sport: { questions: 22, hits: 14 },
          nature: { questions: 24, hits: 15 }, money: { questions: 26, hits: 9 },
          everyday: { questions: 20, hits: 16 },
        },
      },
    }));
    return true;
  })()`);
  await send("Page.navigate", { url: SITE });
  await sleep(3000);

  await shot("1-home");

  await click("Stats", 900);
  await shot("2-stats");
  await click("← Back", 700);

  // Archive = practice mode: scored locally, never submitted.
  await click("Archive", 900);
  const opened = await evaluate(`(() => {
    const items = [...document.querySelectorAll('.archive-item')];
    if (!items.length) return false;
    items[Math.min(3, items.length - 1)].click();
    return true;
  })()`);
  if (!opened) throw new Error("no archive entries to play");
  await sleep(1600);
  await shot("3-question");

  await click("Lock it in", 3800);
  await shot("4-reveal");

  // Play out the rest of the day to reach the results screen.
  for (let i = 0; i < 4; i++) {
    await click("Next", 1200).catch(() => {});
    await click("Lock it in", 3200).catch(() => {});
  }
  await click("See results", 1600).catch(() => {});
  await shot("5-results");

  console.log("\nAll screenshots written to", OUT);
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  edge.kill();
  await sleep(600);
  try { rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ }
}
