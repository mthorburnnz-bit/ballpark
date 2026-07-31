import type { Question } from "./game/types.ts";
import { RangeSlider } from "./ui/slider.ts";

const sampleQuestions: Question[] = [
  {
    id: "microwave-invented-year",
    prompt: "In what year was the microwave oven invented?",
    value: 1945,
    unit: "year",
    scale: "linear",
    domainMin: 1800,
    domainMax: 2020,
    step: 1,
    category: "history",
    funFact: "Percy Spencer noticed a candy bar melted in his pocket near an active radar magnetron.",
    source: "https://www.britannica.com/technology/microwave-oven",
  },
  {
    id: "auckland-tokyo-distance-km",
    prompt: "How far is Auckland from Tokyo, in kilometres?",
    value: 8823,
    unit: "km",
    scale: "log",
    domainMin: 100,
    domainMax: 20000,
    step: 1,
    category: "geography",
    funFact: "That's further than Auckland to London via the shorter great-circle route over Asia.",
    source: "https://www.distancefromto.net/distance-from-auckland-to-tokyo",
  },
  {
    id: "nz-population-2024",
    prompt: "What was New Zealand's population, as of 2024?",
    value: 5223100,
    unit: "people",
    scale: "log",
    domainMin: 100000,
    domainMax: 500000000,
    step: 1,
    category: "everyday",
    asOf: "2024",
    funFact: "More sheep than people, but the ratio has been shrinking for decades.",
    source: "https://www.stats.govt.nz/topics/population",
  },
  {
    id: "blue-whale-weight-kg",
    prompt: "How much does an adult blue whale weigh, in kilograms?",
    value: 140000,
    unit: "kg",
    scale: "log",
    domainMin: 100,
    domainMax: 300000,
    step: 1,
    category: "nature",
    funFact: "Its heart alone can weigh close to 180 kg — about as much as an adult grizzly bear.",
    source: "https://ocean.si.edu/ocean-life/marine-mammals/blue-whale",
  },
  {
    id: "eiffel-tower-height-m",
    prompt: "How tall is the Eiffel Tower today, including antennas, in metres?",
    value: 330,
    unit: "m",
    scale: "linear",
    domainMin: 50,
    domainMax: 600,
    step: 1,
    category: "everyday",
    funFact: "It grows about 15 cm taller in summer as the iron expands in the heat.",
    source: "https://www.toureiffel.paris/en/the-monument/key-figures",
  },
];

const root = document.getElementById("harness-root")!;

for (const question of sampleQuestions) {
  const card = document.createElement("div");
  card.className = "harness-q";

  const title = document.createElement("div");
  title.className = "harness-title";
  title.textContent = question.prompt;

  const meta = document.createElement("div");
  meta.className = "harness-meta";
  meta.textContent = `${question.scale} scale · domain ${question.domainMin.toLocaleString()}–${question.domainMax.toLocaleString()} ${question.unit} · answer hidden`;

  const debugValue = document.createElement("div");
  debugValue.className = "harness-value";

  const slider = new RangeSlider({
    question,
    hapticsEnabled: true,
    onChange: (lo, hi) => {
      debugValue.textContent = `lo=${lo}, hi=${hi} (dev-only readout, not shown in game)`;
    },
  });

  card.append(title, meta, slider.el, debugValue);
  root.appendChild(card);
}
