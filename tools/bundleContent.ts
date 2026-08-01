import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadQuestionBank, loadSchedule } from "./loadContent.ts";

/**
 * Generates two JSON bundles from the same source-of-truth question files:
 *
 *  - worker/generated/content-bundle.json — FULL question data (including
 *    value/funFact/source), for the Worker to statically import. Workers
 *    have no filesystem at runtime, and Vite's import.meta.glob is a
 *    bundler-specific macro that doesn't exist in the Workers/esbuild
 *    build, so the worker needs its own plain, statically-importable copy.
 *
 *  - content/generated/public-bundle.json — REDACTED question data (no
 *    value/funFact/source) for the browser client. The true answer must
 *    never ship in the client bundle — it's fetched per-question from
 *    /api/reveal only once the player has locked in a range.
 *
 * Run as part of `npm run build`, before both the Vite client build and the
 * `wrangler deploy` step that bundles worker/index.ts.
 */

const here = dirname(fileURLToPath(import.meta.url));
const workerOutDir = join(here, "..", "worker", "generated");
const workerOutFile = join(workerOutDir, "content-bundle.json");
const publicOutDir = join(here, "..", "content", "generated");
const publicOutFile = join(publicOutDir, "public-bundle.json");

function main(): void {
  const questions = loadQuestionBank();
  const { launchDate, schedule } = loadSchedule();

  mkdirSync(workerOutDir, { recursive: true });
  writeFileSync(workerOutFile, JSON.stringify({ questions, launchDate, schedule }, null, 2));

  const publicQuestions = questions.map(({ value: _value, funFact: _funFact, source: _source, ...rest }) => rest);
  mkdirSync(publicOutDir, { recursive: true });
  writeFileSync(publicOutFile, JSON.stringify({ questions: publicQuestions, launchDate, schedule }, null, 2));

  console.log(`Bundled ${questions.length} questions + schedule:`);
  console.log(`  full (server-only) -> ${workerOutFile}`);
  console.log(`  redacted (client)  -> ${publicOutFile}`);
}

main();
