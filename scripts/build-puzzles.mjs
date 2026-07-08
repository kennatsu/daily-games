// puzzles.js を stocks-catalog.mjs + stock-hints.mjs から生成する。
// 使い方: node scripts/build-puzzles.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { STOCKS } from "./stocks-catalog.mjs";
import { HINTS } from "./stock-hints.mjs";

function buildHints(s) {
  const h = HINTS[s.ticker];
  if (!h) throw new Error(`Missing hints for ${s.ticker} (${s.answer})`);

  const chartHints = (h.events || []).slice(0, 2).map((e) => ({
    tag: "チャート",
    text: e.hint,
    index: e.index,
    type: e.type,
  }));

  while (chartHints.length < 2) {
    chartHints.push({ tag: "チャート", text: "この期間に大きな値動きがありました", index: 0, type: "rise" });
  }

  return [
    { tag: "業界", text: s.sector },
    { tag: "稼ぎ方", text: h.earn },
    { tag: "強み", text: h.moat },
    chartHints[0],
    chartHints[1],
    { tag: "関連ワード", text: h.clue },
  ];
}

function buildPuzzle(s, id) {
  const hints = buildHints(s);
  const hintsStr = hints.map((h) => {
    const extra = h.index != null ? `, index: ${h.index}, moveType: ${JSON.stringify(h.type)}` : "";
    return `      { tag: ${JSON.stringify(h.tag)}, text: ${JSON.stringify(h.text)}${extra} }`;
  }).join(",\n");

  return `  {
    id: ${id},
    answer: ${JSON.stringify(s.answer)},
    aliases: ${JSON.stringify(s.aliases)},
    ticker: ${JSON.stringify(s.ticker)},
    hints: [
${hintsStr}
    ],
    desc: ${JSON.stringify(s.desc)},
  }`;
}

const companyList = STOCKS.map((s) => JSON.stringify(s.answer)).join(", ");
const puzzles = STOCKS.map((s, i) => buildPuzzle(s, i + 1)).join(",\n");

const out = `// 自動生成ファイル。更新するには:
//   node scripts/export-for-hints.mjs
//   node scripts/build-smart-hints.mjs
//   node scripts/build-puzzles.mjs

const COMPANY_LIST = [
  ${companyList.split(", ").join(",\n  ")},
];

const PUZZLES = [
${puzzles}
];
`;

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "chart-guess", "puzzles.js");
writeFileSync(dest, out);
console.log(`wrote ${dest} (${STOCKS.length} puzzles, 6 hints with 2 chart insights each)`);
