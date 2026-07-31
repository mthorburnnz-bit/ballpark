import type { Question, Category } from "../game/types.ts";
import type { AnswerRecord, SettingsState } from "../state/save.ts";
import type { DerivedStats } from "../state/stats.ts";
import { RangeSlider } from "./slider.ts";
import { formatNumber } from "./format.ts";

const CATEGORY_LABELS: Record<Category, string> = {
  geography: "Geography",
  history: "History",
  science: "Science",
  sport: "Sport",
  everyday: "Everyday",
  money: "Money",
  nature: "Nature",
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildTopBar(title: string, onBack: () => void): HTMLDivElement {
  const bar = el("div", "topbar");
  const back = el("button", "btn-text", "← Back");
  back.type = "button";
  back.addEventListener("click", onBack);
  const heading = el("div", "logo", title);
  bar.append(back, heading);
  return bar;
}

// ---------- Intro / today card ----------

export interface IntroScreenProps {
  puzzleNumber: number;
  streakCurrent: number;
  dayState: "unplayed" | "inProgress" | "complete";
  isFirstEverPlay: boolean;
  onPlay: () => void;
  onStats: () => void;
  onArchive: () => void;
  onSettings: () => void;
}

export function buildIntroScreen(props: IntroScreenProps): HTMLDivElement {
  const screen = el("div", "screen");

  const topbar = el("div", "topbar");
  const logo = el("div", "logo");
  logo.innerHTML = `Ball<span class="logo-ball">park</span>`;
  const streak = el("div", "streak-flame", props.streakCurrent > 0 ? `🔥 ${props.streakCurrent}` : "");
  topbar.append(logo, streak);

  const card = el("div", "today-card");
  const puzzleLabel = el("div", "puzzle-number", `Puzzle #${props.puzzleNumber}`);
  card.appendChild(puzzleLabel);

  const playBtn = el("button", "btn btn-primary");
  playBtn.type = "button";
  playBtn.textContent =
    props.dayState === "complete"
      ? "See today's results"
      : props.dayState === "inProgress"
        ? "Continue today's five"
        : "Play today's five";
  playBtn.addEventListener("click", props.onPlay);
  card.appendChild(playBtn);

  screen.append(topbar, card);

  const navLinks = el("div", "nav-links");
  const statsBtn = el("button", undefined, "Stats");
  statsBtn.type = "button";
  statsBtn.addEventListener("click", props.onStats);
  const archiveBtn = el("button", undefined, "Archive");
  archiveBtn.type = "button";
  archiveBtn.addEventListener("click", props.onArchive);
  const settingsBtn = el("button", undefined, "Settings");
  settingsBtn.type = "button";
  settingsBtn.addEventListener("click", props.onSettings);
  navLinks.append(statsBtn, archiveBtn, settingsBtn);
  screen.appendChild(navLinks);

  return screen;
}

// ---------- Question screen ----------

export interface QuestionScreenHandles {
  el: HTMLDivElement;
  slider: RangeSlider;
  lockInBtn: HTMLButtonElement;
  revealContainer: HTMLDivElement;
  nextBtn: HTMLButtonElement;
}

export interface QuestionScreenProps {
  question: Question;
  index: number; // 0-based
  total: number;
  runningScore: number;
  showTutorial: boolean;
  settings: SettingsState;
  isLastQuestion: boolean;
}

export function buildQuestionScreen(props: QuestionScreenProps): QuestionScreenHandles {
  const screen = el("div", "screen");

  const progress = el("div", "question-progress");
  const label = el("span", undefined, `Question ${props.index + 1} of ${props.total}`);
  const score = el("span", "running-score tabular-nums", `${props.runningScore} pts`);
  progress.append(label, score);

  const body = el("div", "question-body");

  if (props.showTutorial) {
    const tutorial = el(
      "p",
      "tutorial-line",
      "Set a range you're sure contains the answer. Tighter range, more points. Miss = zero.",
    );
    body.appendChild(tutorial);
  }

  const meta = el("div", "question-meta", CATEGORY_LABELS[props.question.category]);
  const prompt = el("h1", "question-prompt", props.question.prompt);

  const slider = new RangeSlider({
    question: props.question,
    hapticsEnabled: props.settings.haptics,
  });

  const lockInBtn = el("button", "btn btn-primary", "Lock it in");
  lockInBtn.type = "button";

  const revealContainer = el("div", "reveal-container");

  const nextBtn = el("button", "btn btn-primary", props.isLastQuestion ? "See results" : "Next");
  nextBtn.type = "button";
  nextBtn.style.display = "none";

  body.append(meta, prompt, slider.el, lockInBtn, revealContainer, nextBtn);
  screen.append(progress, body);

  return { el: screen, slider, lockInBtn, revealContainer, nextBtn };
}

// ---------- Results screen ----------

export interface RecapItem {
  question: Question;
  answer: AnswerRecord;
}

export interface ResultsScreenProps {
  puzzleNumber: number;
  totalScore: number;
  recap: RecapItem[];
  verdict: string;
  streakCurrent: number;
  isPractice: boolean;
  onShare: () => void;
  onHome: () => void;
  onStats: () => void;
  onArchive: () => void;
}

export function buildResultsScreen(props: ResultsScreenProps): { el: HTMLDivElement; shareBtn: HTMLButtonElement } {
  const screen = el("div", "screen");

  screen.appendChild(buildTopBar(`Puzzle #${props.puzzleNumber}`, props.onHome));

  const total = el("div", "results-total");
  total.appendChild(el("div", "score-number tabular-nums", String(props.totalScore)));
  total.appendChild(el("div", "score-label", "points"));

  const emojiRow = el(
    "div",
    "emoji-row",
    props.recap.map((r) => (r.answer.tight ? "🎯" : r.answer.hit ? "✅" : "❌")).join(""),
  );

  const verdict = el("div", "verdict-line", props.verdict);

  const recapList = el("ul", "recap-list");
  for (const { question, answer } of props.recap) {
    const item = el("li", "recap-item");
    const top = el("div", "recap-item-top");
    top.appendChild(el("span", "recap-prompt", question.prompt));
    top.appendChild(
      el(
        "span",
        `recap-points tabular-nums ${answer.hit ? "state-hit" : "state-miss"}`,
        `${answer.hit ? "+" : ""}${answer.points}`,
      ),
    );
    const detail = el(
      "div",
      "recap-detail",
      `Your range: ${formatNumber(answer.lo, question.unit)}–${formatNumber(answer.hi, question.unit)} · Answer: ${formatNumber(question.value, question.unit)}`,
    );
    item.append(top, detail);
    recapList.appendChild(item);
  }

  const shareBtn = el("button", "btn btn-primary", "Share result");
  shareBtn.type = "button";
  shareBtn.addEventListener("click", props.onShare);

  screen.append(total, emojiRow, verdict, recapList, shareBtn);

  if (props.isPractice) {
    screen.appendChild(el("div", "archive-note", "Practice run — doesn't affect your streak or stats."));
  } else {
    const streakRow = el("div", "streak-row");
    streakRow.appendChild(el("span", undefined, "Current streak"));
    streakRow.appendChild(el("span", "tabular-nums", `🔥 ${props.streakCurrent}`));
    screen.appendChild(streakRow);
  }

  const navLinks = el("div", "nav-links");
  const statsBtn = el("button", undefined, "Stats");
  statsBtn.type = "button";
  statsBtn.addEventListener("click", props.onStats);
  const archiveBtn = el("button", undefined, "Archive");
  archiveBtn.type = "button";
  archiveBtn.addEventListener("click", props.onArchive);
  navLinks.append(statsBtn, archiveBtn);
  screen.appendChild(navLinks);

  return { el: screen, shareBtn };
}

// ---------- Stats screen ----------

export function buildStatsScreen(stats: DerivedStats, onBack: () => void): HTMLDivElement {
  const screen = el("div", "screen");
  screen.appendChild(buildTopBar("Your stats", onBack));

  const grid = el("div", "stats-grid");
  const cards: Array<[string, string]> = [
    ["Current streak", String(stats.currentStreak)],
    ["Best streak", String(stats.bestStreak)],
    ["Games played", String(stats.gamesPlayed)],
    ["Average score", stats.gamesPlayed > 0 ? stats.averageScore.toFixed(0) : "–"],
    ["Hit rate", `${Math.round(stats.hitRate * 100)}%`],
    ["Tight-hit rate", `${Math.round(stats.tightHitRate * 100)}%`],
  ];
  for (const [label, value] of cards) {
    const card = el("div", "stat-card");
    card.appendChild(el("div", "stat-value tabular-nums", value));
    card.appendChild(el("div", "stat-label", label));
    grid.appendChild(card);
  }

  const categorySection = el("div", "category-bars");
  if (stats.categoryHitRates.length === 0) {
    categorySection.appendChild(el("p", "archive-note", "Play a few days to see your hit rate by category."));
  } else {
    for (const c of stats.categoryHitRates) {
      const row = el("div", "category-bar-row");
      row.appendChild(el("span", undefined, CATEGORY_LABELS[c.category]));
      const track = el("div", "category-bar-track");
      const fill = el("div", "category-bar-fill");
      fill.style.width = `${Math.round(c.hitRate * 100)}%`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "tabular-nums", `${Math.round(c.hitRate * 100)}%`));
      categorySection.appendChild(row);
    }
  }

  screen.append(grid, categorySection);
  return screen;
}

// ---------- Archive screen ----------

export interface ArchiveEntry {
  date: string;
  puzzleNumber: number;
  played: boolean;
}

export function buildArchiveScreen(
  entries: ArchiveEntry[],
  onPlay: (date: string) => void,
  onBack: () => void,
): HTMLDivElement {
  const screen = el("div", "screen");
  screen.appendChild(buildTopBar("Archive", onBack));
  screen.appendChild(el("p", "archive-note", "Past puzzles, playable any time. Doesn't affect your streak or stats."));

  const list = el("ul", "archive-list");
  for (const entry of entries) {
    const item = el("button", "archive-item");
    item.type = "button";
    const left = el("div");
    left.appendChild(el("div", "archive-item-title", `Puzzle #${entry.puzzleNumber}`));
    left.appendChild(el("div", "archive-item-date", entry.date));
    item.appendChild(left);
    item.appendChild(el("span", "archive-badge", entry.played ? "Played" : "Unplayed"));
    item.addEventListener("click", () => onPlay(entry.date));
    list.appendChild(item);
  }
  screen.appendChild(list);
  return screen;
}

// ---------- Settings screen ----------

export function buildSettingsScreen(
  settings: SettingsState,
  onChange: (patch: Partial<SettingsState>) => void,
  onBack: () => void,
): HTMLDivElement {
  const screen = el("div", "screen");
  screen.appendChild(buildTopBar("Settings", onBack));

  const rows: Array<[keyof SettingsState, string]> = [
    ["sound", "Sound"],
    ["haptics", "Haptics"],
    ["reducedMotion", "Reduce motion"],
  ];

  for (const [key, label] of rows) {
    const row = el("div", "settings-row");
    row.appendChild(el("span", undefined, label));
    const toggle = el("button", "switch");
    toggle.type = "button";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("aria-checked", String(settings[key]));
    toggle.setAttribute("aria-label", label);
    toggle.addEventListener("click", () => {
      const next = !settings[key];
      toggle.setAttribute("aria-checked", String(next));
      onChange({ [key]: next } as Partial<SettingsState>);
    });
    row.appendChild(toggle);
    screen.appendChild(row);
  }

  return screen;
}
