// Fable 5 用の入力JSONを生成: node scripts/export-for-hints.mjs
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STOCKS } from "./stocks-catalog.mjs";
import { findKeyMoves } from "./analyze-chart.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seriesSrc = readFileSync(join(root, "chart-guess/series.js"), "utf8");
const { SERIES, MONTH_LABELS } = new Function(seriesSrc + "; return { SERIES, MONTH_LABELS };")();

const data = STOCKS.map((s) => ({
  ticker: s.ticker,
  answer: s.answer,
  sector: s.sector,
  desc: s.desc,
  series: SERIES[s.ticker],
  months: MONTH_LABELS,
  moves: findKeyMoves(SERIES[s.ticker], MONTH_LABELS),
}));

writeFileSync(join(root, "scripts/hints-input.json"), JSON.stringify(data, null, 2));
console.log(`wrote hints-input.json (${data.length} stocks)`);
