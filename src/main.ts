import "./style.css";
import type { PublicQuestion } from "./game/types.ts";
import * as bank from "./game/bank.ts";
import { todayLocalDateString } from "./game/daily.ts";
import { computeVerdict } from "./game/verdicts.ts";
import { loadSave, persistSave, getOrCreateDayProgress } from "./state/save.ts";
import type { DayProgress, AnswerRecord } from "./state/save.ts";
import { recordDayCompletion, deriveStats } from "./state/stats.ts";
import { loadPlayerIdentity, createPlayerIdentity } from "./state/player.ts";
import type { PlayerIdentity } from "./state/player.ts";
import { fetchReveal, submitDay, fetchLeaderboard } from "./state/api.ts";
import {
  buildIntroScreen,
  buildQuestionScreen,
  buildResultsScreen,
  buildStatsScreen,
  buildArchiveScreen,
  buildSettingsScreen,
  buildNameEntryScreen,
  buildLeaderboardScreen,
} from "./ui/screens.ts";
import type { RecapItem } from "./ui/screens.ts";
import { RevealSequence } from "./ui/reveal.ts";
import { buildShareText, shareResult } from "./ui/share.ts";
import { showToast } from "./ui/toast.ts";

const appRoot = document.querySelector<HTMLDivElement>("#app")!;
let shell: HTMLDivElement | null = null;

function mountScreen(screenEl: HTMLElement): void {
  if (!shell) {
    appRoot.innerHTML = "";
    shell = document.createElement("div");
    shell.className = "app-shell";
    appRoot.appendChild(shell);
  }
  shell.innerHTML = "";
  shell.appendChild(screenEl);
  window.scrollTo(0, 0);
}

function mountMessageScreen(message: string, actionLabel: string, onAction: () => void): void {
  const screen = document.createElement("div");
  screen.className = "screen";
  const p = document.createElement("p");
  p.className = "archive-note";
  p.textContent = message;
  const btn = document.createElement("button");
  btn.className = "btn btn-secondary";
  btn.type = "button";
  btn.textContent = actionLabel;
  btn.addEventListener("click", onAction);
  screen.append(p, btn);
  mountScreen(screen);
}

const save = loadSave();
const today = todayLocalDateString();

function effectiveReducedMotion(): boolean {
  return save.settings.reducedMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ---------- Navigation ----------

function showIntro(): void {
  const dayProgress = save.days[today];
  const dayState = !dayProgress ? "unplayed" : dayProgress.state;
  const screen = buildIntroScreen({
    puzzleNumber: bank.puzzleNumberForDate(today),
    streakCurrent: save.streak.current,
    dayState,
    isFirstEverPlay: !save.hasSeenTutorial,
    onPlay: () => void startTodayFlow(),
    onStats: showStats,
    onArchive: showArchive,
    onSettings: showSettings,
    onLeaderboard: () => void showLeaderboard(),
  });
  mountScreen(screen);
}

function showStats(): void {
  mountScreen(buildStatsScreen(deriveStats(save), showIntro));
}

function showSettings(): void {
  const screen = buildSettingsScreen(
    save.settings,
    (patch) => {
      Object.assign(save.settings, patch);
      persistSave(save);
    },
    showIntro,
  );
  mountScreen(screen);
}

function showArchive(): void {
  const entries = Object.keys(bank.schedule)
    .filter((date) => date <= today)
    .sort()
    .map((date) => ({
      date,
      puzzleNumber: bank.puzzleNumberForDate(date),
      played: save.days[date]?.state === "complete",
    }));
  mountScreen(buildArchiveScreen(entries, (date) => void playArchivedDay(date), showIntro));
}

async function showLeaderboard(): Promise<void> {
  mountMessageScreen("Loading leaderboard…", "Back", showIntro);
  const identity = loadPlayerIdentity();
  try {
    const entries = await fetchLeaderboard();
    mountScreen(buildLeaderboardScreen(entries, identity?.id ?? null, showIntro));
  } catch {
    mountMessageScreen("Couldn't load the leaderboard — check your connection.", "Back", showIntro);
  }
}

// ---------- Game flow ----------

async function startTodayFlow(): Promise<void> {
  const day = getOrCreateDayProgress(save, today, bank.questionsForDate(today).map((q) => q.id));
  if (day.state === "complete") {
    showResults(today, day, false);
    return;
  }
  const questions = day.questionIds.map((id) => bank.getQuestion(id));
  await runQuestionFlow(questions, day, true);
  recordDayCompletion(save, today);
  await submitDayToLeaderboard(day);
  showResults(today, day, false);
}

async function playArchivedDay(date: string): Promise<void> {
  const questions = bank.questionsForDate(date);
  const practiceDay: DayProgress = {
    date,
    questionIds: questions.map((q) => q.id),
    answers: [null, null, null, null, null],
    currentIndex: 0,
    state: "inProgress",
  };
  await runQuestionFlow(questions, practiceDay, false);
  showResults(date, practiceDay, true);
}

function promptForPlayerName(): Promise<PlayerIdentity> {
  return new Promise((resolve) => {
    mountScreen(buildNameEntryScreen((name) => resolve(createPlayerIdentity(name))));
  });
}

async function submitDayToLeaderboard(day: DayProgress): Promise<void> {
  const identity = loadPlayerIdentity() ?? (await promptForPlayerName());
  const answers = day.questionIds.map((id, i) => {
    const a = day.answers[i]!;
    return { questionId: id, lo: a.lo, hi: a.hi };
  });
  try {
    await submitDay(identity.id, identity.name, day.date, bank.puzzleNumberForDate(day.date), answers);
  } catch {
    showToast("Couldn't save your score to the leaderboard, but your results are safe.");
  }
}

/** Drives one player through all 5 questions of `day`, resuming from day.currentIndex. */
async function runQuestionFlow(questions: PublicQuestion[], day: DayProgress, persist: boolean): Promise<void> {
  for (let i = day.currentIndex; i < questions.length; i++) {
    const question = questions[i]!;
    const runningScore = day.answers.reduce((sum, a) => sum + (a?.points ?? 0), 0);
    const showTutorial = persist && !save.hasSeenTutorial && i === 0;

    const { el: screenEl, slider, lockInBtn, revealContainer, nextBtn } = buildQuestionScreen({
      question,
      index: i,
      total: questions.length,
      runningScore,
      showTutorial,
      settings: save.settings,
      isLastQuestion: i === questions.length - 1,
    });
    mountScreen(screenEl);

    await new Promise<void>((resolve) => {
      const attemptReveal = async () => {
        revealContainer.innerHTML = "";
        const loadingEl = document.createElement("div");
        loadingEl.className = "reveal-loading";
        loadingEl.setAttribute("aria-label", "Revealing");
        loadingEl.innerHTML =
          '<span class="reveal-loading-dot"></span><span class="reveal-loading-dot"></span><span class="reveal-loading-dot"></span>';
        revealContainer.appendChild(loadingEl);

        const { lo, hi } = slider.getValue();
        try {
          const apiResult = await fetchReveal(question.id, lo, hi);
          revealContainer.innerHTML = "";

          const answer: AnswerRecord = {
            questionId: question.id,
            lo,
            hi,
            hit: apiResult.hit,
            f: apiResult.f,
            tight: apiResult.tight,
            points: apiResult.points,
            category: question.category,
            trueValue: apiResult.trueValue,
          };
          day.answers[i] = answer;
          day.currentIndex = i + 1;
          if (day.currentIndex >= questions.length) day.state = "complete";
          if (persist) persistSave(save);

          const reveal = new RevealSequence({
            question,
            slider,
            result: apiResult,
            container: revealContainer,
            reducedMotion: effectiveReducedMotion(),
          });
          await reveal.play();
          nextBtn.style.display = "";
          nextBtn.addEventListener("click", () => resolve(), { once: true });
        } catch {
          revealContainer.innerHTML = "";
          const errorEl = document.createElement("div");
          errorEl.className = "reveal-error";
          const msg = document.createElement("span");
          msg.textContent = "Couldn't reach the server. Check your connection and try again.";
          const retryBtn = document.createElement("button");
          retryBtn.className = "btn btn-secondary";
          retryBtn.type = "button";
          retryBtn.textContent = "Retry";
          retryBtn.addEventListener("click", () => void attemptReveal(), { once: true });
          errorEl.append(msg, retryBtn);
          revealContainer.appendChild(errorEl);
        }
      };

      lockInBtn.addEventListener(
        "click",
        () => {
          slider.lock();
          lockInBtn.style.display = "none";
          void attemptReveal();
        },
        { once: true },
      );
    });
  }

  if (persist && !save.hasSeenTutorial) {
    save.hasSeenTutorial = true;
    persistSave(save);
  }
}

function showResults(dateStr: string, day: DayProgress, isPractice: boolean): void {
  const questions = day.questionIds.map((id) => bank.getQuestion(id));
  const recap: RecapItem[] = questions.map((question, i) => ({ question, answer: day.answers[i]! }));
  const total = recap.reduce((sum, r) => sum + r.answer.points, 0);
  const verdict = computeVerdict(
    recap.map((r) => ({
      category: r.question.category,
      hit: r.answer.hit,
      f: r.answer.f,
      tight: r.answer.tight,
      points: r.answer.points,
    })),
  );
  const puzzleNumber = bank.puzzleNumberForDate(dateStr);

  const { el: screenEl } = buildResultsScreen({
    puzzleNumber,
    totalScore: total,
    recap,
    verdict,
    streakCurrent: save.streak.current,
    isPractice,
    onShare: () => void handleShare(puzzleNumber, recap, verdict, total),
    onHome: showIntro,
    onStats: showStats,
    onArchive: showArchive,
    onLeaderboard: () => void showLeaderboard(),
  });
  mountScreen(screenEl);
}

async function handleShare(
  puzzleNumber: number,
  recap: RecapItem[],
  verdict: string,
  total: number,
): Promise<void> {
  const text = buildShareText(
    puzzleNumber,
    recap.map((r) => r.answer),
    verdict,
    total,
  );
  const outcome = await shareResult(text);
  if (outcome === "copied") showToast("Copied to clipboard!");
  else if (outcome === "failed") showToast("Couldn't share — try again");
}

showIntro();

// Only register in production — an active SW during `vite dev` fights HMR
// by serving stale cached modules instead of the live-reloaded ones.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a progressive enhancement — a failed registration
      // (unsupported browser, blocked storage) shouldn't block the game.
    });
  });
}
