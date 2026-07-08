// hints-input.json + hints-data.mjs → stock-hints.mjs（チャート解説付き）
// node scripts/build-smart-hints.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HINT_DATA } from "./hints-data.mjs";
import { explainMove } from "./chart-explains.mjs";
import { formatChartHint } from "./analyze-chart.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const input = JSON.parse(readFileSync(join(root, "scripts/hints-input.json"), "utf8"));
const legacy = Object.fromEntries(HINT_DATA.map(([t, earn, moat, driver, clue]) => [t, { earn, moat, clue }]));

const hints = {};
for (const stock of input) {
  const leg = legacy[stock.ticker];
  if (!leg) throw new Error(`Missing legacy hints for ${stock.ticker}`);

  const events = stock.moves.map((move) => ({
    index: move.index,
    type: move.type,
    explain: explainMove(stock, move),
    hint: formatChartHint(move, explainMove(stock, move)),
  }));

  hints[stock.ticker] = {
    earn: leg.earn,
    moat: leg.moat,
    clue: leg.clue,
    events,
  };
}

const lines = Object.entries(hints).map(([ticker, h]) => {
  const eventsStr = h.events.map((e) =>
    `{ index: ${e.index}, type: ${JSON.stringify(e.type)}, explain: ${JSON.stringify(e.explain)}, hint: ${JSON.stringify(e.hint)} }`
  ).join(", ");
  return `  "${ticker}": { earn: ${JSON.stringify(h.earn)}, moat: ${JSON.stringify(h.moat)}, clue: ${JSON.stringify(h.clue)}, events: [${eventsStr}] }`;
}).join(",\n");

const out = `// 自動生成。node scripts/build-smart-hints.mjs
// Fable 5 で再生成する場合は hints-batch-*.json をマージして差し替え。
export const HINTS = {
${lines}
};
`;

writeFileSync(join(root, "scripts/stock-hints.mjs"), out);
console.log(`wrote stock-hints.mjs (${Object.keys(hints).length} tickers with chart events)`);
