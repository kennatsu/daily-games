// stock-hints.mjs を hints-data.mjs から生成
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HINT_DATA } from "./hints-data.mjs";

const entries = HINT_DATA.map(([ticker, earn, moat, driver, clue]) =>
  `  "${ticker}": { earn: ${JSON.stringify(earn)}, moat: ${JSON.stringify(moat)}, driver: ${JSON.stringify(driver)}, clue: ${JSON.stringify(clue)} }`
).join(",\n");

const out = `// 自動生成。編集は scripts/hints-data.mjs で行い node scripts/generate-hints-file.mjs を実行。
export const HINTS = {
${entries}
};
`;

writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "stock-hints.mjs"), out);
console.log(`wrote stock-hints.mjs (${HINT_DATA.length} tickers)`);
