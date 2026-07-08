// 日本株の月足終値をYahoo Financeから取得し、chart-guess/series.js を生成する。
// 使い方: node scripts/fetch-data.mjs
// 各銘柄の直近24ヶ月（当月の途中データは除外）を起点100で指数化して出力する。

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TICKERS = [
  "7974.T", // 任天堂
  "9501.T", // 東京電力HD
  "9983.T", // ファーストリテイリング
  "4755.T", // 楽天グループ
  "7011.T", // 三菱重工業
  "7203.T", // トヨタ自動車
  "6758.T", // ソニーグループ
  "6861.T", // キーエンス
  "8035.T", // 東京エレクトロン
  "8306.T", // 三菱UFJ FG
  "6501.T", // 日立製作所
  "9432.T", // NTT
  "9433.T", // KDDI
  "4661.T", // オリエンタルランド
  "4568.T", // 第一三共
  "4911.T", // 資生堂
  "7201.T", // 日産自動車
  "7267.T", // ホンダ
  "4385.T", // メルカリ
  "4751.T", // サイバーエージェント
  "3092.T", // ZOZO
  "9022.T", // JR東海
  "9202.T", // ANAホールディングス
  "5401.T", // 日本製鉄
  "5020.T", // ENEOSホールディングス
  "4452.T", // 花王
  "2502.T", // アサヒグループHD
  "7012.T", // 川崎重工業
  "7013.T", // IHI
  "6146.T", // ディスコ
];

const MONTHS = 24;

async function fetchMonthly(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=3y&interval=1mo`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${ticker}: HTTP ${res.status}`);
  const json = await res.json();
  const result = json.chart?.result?.[0];
  if (!result) throw new Error(`${ticker}: no chart result`);

  const closes = result.indicators.quote[0].close;
  const timestamps = result.timestamp;
  const points = timestamps
    .map((ts, i) => ({ ts, close: closes[i] }))
    .filter((p) => p.close != null);

  // 当月（進行中の月）のデータは確定していないので落とす
  const now = new Date();
  const currentMonthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
  const complete = points.filter((p) => {
    const d = new Date(p.ts * 1000);
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}` !== currentMonthKey;
  });

  if (complete.length < MONTHS) throw new Error(`${ticker}: only ${complete.length} complete months`);
  const window = complete.slice(-MONTHS);

  const base = window[0].close;
  const series = window.map((p) => Math.round((p.close / base) * 10000) / 100);
  const lastDate = new Date(window[window.length - 1].ts * 1000);
  const asof = `${lastDate.getUTCFullYear()}-${String(lastDate.getUTCMonth() + 1).padStart(2, "0")}`;
  return { series, asof };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const seriesMap = {};
let asof = null;
for (const ticker of TICKERS) {
  const data = await fetchMonthly(ticker);
  seriesMap[ticker] = data.series;
  asof = data.asof; // 全銘柄同一のはず。最後の値を採用
  console.log(`${ticker}: ok (asof ${data.asof}, ${data.series[0]} -> ${data.series[data.series.length - 1]})`);
  await sleep(400);
}

const lines = TICKERS.map((t) => `  "${t}": [${seriesMap[t].join(", ")}],`).join("\n");
const out = `// 自動生成ファイル。更新するには: node scripts/fetch-data.mjs
// 各銘柄の直近${MONTHS}ヶ月の月足終値を起点100で指数化した実データ。
const DATA_ASOF = "${asof}";
const SERIES = {
${lines}
};
`;

const dest = join(dirname(fileURLToPath(import.meta.url)), "..", "chart-guess", "series.js");
writeFileSync(dest, out);
console.log(`\nwrote ${dest} (asof ${asof}, ${TICKERS.length} tickers)`);
