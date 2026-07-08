// 各銘柄のチャートから「注目すべき変動」を2点抽出する
export function findKeyMoves(series, labels) {
  const moves = [];
  for (let i = 1; i < series.length; i++) {
    const pct = ((series[i] - series[i - 1]) / series[i - 1]) * 100;
    if (Math.abs(pct) >= 8) {
      moves.push({
        index: i,
        month: labels[i],
        type: pct > 0 ? "rise" : "drop",
        pct: Math.round(pct * 10) / 10,
        from: series[i - 1],
        to: series[i],
      });
    }
  }
  moves.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  const picked = [];
  const used = new Set();
  for (const m of moves) {
    if (picked.length >= 2) break;
    if (used.has(m.index) || [...used].some((i) => Math.abs(i - m.index) <= 2)) continue;
    picked.push(m);
    used.add(m.index);
  }

  if (picked.length < 2) {
    let maxI = 0, minI = 0;
    for (let i = 1; i < series.length; i++) {
      if (series[i] > series[maxI]) maxI = i;
      if (series[i] < series[minI]) minI = i;
    }
    if (!picked.find((p) => p.index === maxI) && maxI > 0) {
      picked.push({
        index: maxI,
        month: labels[maxI],
        type: "rise",
        pct: Math.round(((series[maxI] - series[maxI - 1]) / series[maxI - 1]) * 1000) / 10,
        from: series[maxI - 1],
        to: series[maxI],
      });
    }
    if (picked.length < 2 && !picked.find((p) => p.index === minI) && minI > 0) {
      picked.push({
        index: minI,
        month: labels[minI],
        type: "drop",
        pct: Math.round(((series[minI] - series[minI - 1]) / series[minI - 1]) * 1000) / 10,
        from: series[minI - 1],
        to: series[minI],
      });
    }
  }

  return picked.slice(0, 2).sort((a, b) => a.index - b.index);
}

export function formatChartHint(move, explanation) {
  const dir = move.type === "drop" ? "下落" : "上昇";
  const month = move.month.replace("-", "年") + "月";
  return `${month}ごろの${dir}（${move.pct > 0 ? "+" : ""}${move.pct}%）は、${explanation}`;
}
