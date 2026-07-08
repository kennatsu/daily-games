(() => {
  const MAX_GUESSES = 6;
  const STORAGE_KEY = "chart-guess-state";
  const STATS_KEY = "chart-guess-stats";
  const EPOCH = "2026-07-01"; // 第1問の日付（JST）

  // ---- JST 日付ユーティリティ ----
  function jstDateStr(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(d);
  }

  function jstDayNumber() {
    const epoch = new Date(EPOCH + "T00:00:00+09:00");
    const today = new Date(jstDateStr() + "T00:00:00+09:00");
    return Math.max(0, Math.floor((today - epoch) / 86400000));
  }

  function msUntilNextJSTMidnight() {
    const tomorrow = new Date(jstDateStr() + "T00:00:00+09:00");
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow - Date.now();
  }

  function formatCountdown(ms) {
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  // ---- 今日の問題 ----
  const dayNumber = jstDayNumber();
  const puzzle = PUZZLES[dayNumber % PUZZLES.length];
  const series = SERIES[puzzle.ticker];
  const puzzleNo = dayNumber + 1;

  const changePct = (series[series.length - 1] / series[0] - 1) * 100;
  const changeText = `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`;

  document.getElementById("puzzle-label").textContent = `#${puzzleNo}`;
  document.getElementById("data-asof").textContent = DATA_ASOF;

  const changeBadge = document.getElementById("chart-change");
  changeBadge.textContent = changeText;
  changeBadge.classList.add(changePct >= 0 ? "up" : "down");

  // ---- カウントダウン ----
  const countdownEl = document.getElementById("countdown");
  function tickCountdown() {
    countdownEl.textContent = "次の問題まで " + formatCountdown(msUntilNextJSTMidnight());
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---- 状態 ----
  const defaultState = { day: dayNumber, guesses: [], done: false, won: false };
  let state = loadState();

  function loadState() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (raw && raw.day === dayNumber) return raw;
    } catch (_) { /* 破損時は初期化 */ }
    return { ...defaultState };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function loadStats() {
    try {
      return JSON.parse(localStorage.getItem(STATS_KEY)) || { played: 0, won: 0, streak: 0, maxStreak: 0 };
    } catch (_) {
      return { played: 0, won: 0, streak: 0, maxStreak: 0 };
    }
  }

  function recordResult(won) {
    const stats = loadStats();
    stats.played += 1;
    if (won) {
      stats.won += 1;
      stats.streak += 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    } else {
      stats.streak = 0;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  // ---- チャート上に表示するマーカー（解説ヒントが開いた分だけ） ----
  function getVisibleChartMarkers() {
    const revealCount = state.done ? puzzle.hints.length : state.guesses.length;
    return puzzle.hints
      .slice(0, revealCount)
      .filter((h) => h.tag === "チャート" && h.index != null);
  }

  // ---- チャート描画（SBI/楽天証券風 + 変動ポイントマーカー） ----
  function drawChart(values, markers = []) {
    const svg = document.getElementById("chart");
    const W = 640, H = 380;
    const PL = 56, PR = 48, PT = 14, PB = 36;
    const cW = W - PL - PR;
    const cH = H - PT - PB;

    let yMin = Math.min(...values, 100);
    let yMax = Math.max(...values, 100);
    const pad = (yMax - yMin) * 0.1 || 8;
    yMin = Math.floor((yMin - pad) / 5) * 5;
    yMax = Math.ceil((yMax + pad) / 5) * 5;
    const yRange = yMax - yMin || 1;

    const up = values[values.length - 1] >= values[0];
    const color = up ? "#d32f2f" : "#1565c0";

    const x = (i) => PL + (i / (values.length - 1)) * cW;
    const y = (v) => PT + cH - ((v - yMin) / yRange) * cH;
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

    let grid = "";
    let yLabels = "";
    for (let i = 0; i <= 4; i++) {
      const val = yMin + (i / 4) * yRange;
      const gy = y(val);
      grid += `<line x1="${PL}" y1="${gy}" x2="${PL + cW}" y2="${gy}" stroke="#e8e8e8" stroke-width="1"/>`;
      yLabels += `<text x="${PL - 8}" y="${gy + 4}" text-anchor="end" fill="#999" font-size="11" font-family="sans-serif">${Math.round(val)}</text>`;
    }

    let baseline = "";
    if (100 >= yMin && 100 <= yMax) {
      const by = y(100);
      baseline = `<line x1="${PL}" y1="${by}" x2="${PL + cW}" y2="${by}" stroke="#bbb" stroke-width="1" stroke-dasharray="5,4"/>`;
      yLabels += `<text x="${PL + cW + 6}" y="${by + 4}" fill="#999" font-size="10" font-family="sans-serif">100</text>`;
    }

    let xLabels = "";
    if (typeof MONTH_LABELS !== "undefined") {
      const indices = [0, 6, 12, 18, values.length - 1];
      indices.forEach((i) => {
        if (i >= MONTH_LABELS.length) return;
        const lbl = MONTH_LABELS[i].slice(2).replace("-", "/");
        xLabels += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" fill="#999" font-size="10" font-family="sans-serif">${lbl}</text>`;
      });
    }

    const border = `<rect x="${PL}" y="${PT}" width="${cW}" height="${cH}" fill="#fafafa" stroke="#ddd" stroke-width="1" rx="2"/>`;
    const areaPoints = `${PL},${PT + cH} ${points} ${PL + cW},${PT + cH}`;
    const lastVal = values[values.length - 1];
    const lastX = x(values.length - 1);
    const lastY = y(lastVal);

    let eventMarkers = "";
    markers.forEach((m, idx) => {
      const cx = x(m.index);
      const cy = y(values[m.index]);
      const isDrop = m.moveType === "drop";
      const mColor = isDrop ? "#1565c0" : "#d32f2f";
      const label = isDrop ? "↓" : "↑";
      const labelY = isDrop ? cy + 18 : cy - 12;
      eventMarkers += `
        <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${labelY + (isDrop ? -8 : 8)}" stroke="${mColor}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>
        <circle cx="${cx}" cy="${cy}" r="6" fill="${mColor}" stroke="#fff" stroke-width="2"/>
        <text x="${cx}" y="${labelY}" text-anchor="middle" fill="${mColor}" font-size="11" font-weight="bold" font-family="sans-serif">${label}${idx + 1}</text>
      `;
    });

    svg.innerHTML = `
      ${border}
      ${grid}
      ${baseline}
      <polygon points="${areaPoints}" fill="${color}" opacity="0.06"/>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${x(0)}" cy="${y(values[0])}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="${lastX}" cy="${lastY}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="${lastX}" y="${lastY - 10}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold" font-family="sans-serif">${lastVal.toFixed(1)}</text>
      ${eventMarkers}
      ${yLabels}
      ${xLabels}
    `;
  }

  function renderChartStory() {
    const container = document.getElementById("chart-story");
    const markers = getVisibleChartMarkers();
    if (!markers.length) {
      container.innerHTML = "";
      container.className = "chart-story";
      return;
    }
    container.className = "chart-story visible";
    container.innerHTML = markers.map((m, i) => {
      const cls = m.moveType === "drop" ? "drop" : "rise";
      const icon = m.moveType === "drop" ? "↓" : "↑";
      return `<div class="chart-note ${cls}"><span class="chart-note-icon">${icon}${i + 1}</span>${escapeHtml(m.text)}</div>`;
    }).join("");
  }

  // ---- 回答グリッド（Wordle風） ----
  function renderGuessGrid() {
    const container = document.getElementById("guess-grid");
    container.innerHTML = "";
    for (let i = 0; i < MAX_GUESSES; i++) {
      const row = document.createElement("div");
      if (i < state.guesses.length) {
        const correct = isCorrect(state.guesses[i]);
        row.className = "guess-row " + (correct ? "correct" : "wrong");
        row.innerHTML = `<span class="guess-dot ${correct ? "correct" : "wrong"}"></span><span class="guess-text">${escapeHtml(state.guesses[i])}</span>`;
      } else if (!state.done) {
        row.className = "guess-row empty";
        row.textContent = i === state.guesses.length ? "ここに回答が入る" : "";
      } else {
        continue;
      }
      container.appendChild(row);
    }
  }

  // ---- ヒント ----
  function renderHints() {
    const container = document.getElementById("hints");
    container.innerHTML = "";
    const revealCount = state.done ? puzzle.hints.length : state.guesses.length;
    puzzle.hints.forEach((h, i) => {
      const div = document.createElement("div");
      div.className = "hint" + (i < revealCount ? " revealed" : "");
      div.innerHTML = i < revealCount
        ? `<span class="hint-tag ${h.tag === "チャート" ? "chart" : ""}">${escapeHtml(h.tag)}</span>${escapeHtml(h.text)}`
        : `<span class="hint-tag">🔒 ${i + 1}</span><span class="hint-locked">外すと「${escapeHtml(h.tag)}」が開く</span>`;
      container.appendChild(div);
    });
  }

  // ---- 正誤判定 ----
  function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, "").replace(/[・･]/g, "");
  }

  function isCorrect(guess) {
    const n = normalize(guess);
    if (!n) return false;
    if (n === normalize(puzzle.answer)) return true;
    return puzzle.aliases.some((a) => normalize(a) === n);
  }

  // ---- シェア ----
  function buildShareText() {
    const rows = state.guesses.map((g) => (isCorrect(g) ? "🟩" : "⬜")).join("");
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    return `チャート当て #${puzzleNo} ${score}\n${rows}\n${location.href}`;
  }

  // ---- モーダル ----
  function showResult() {
    document.getElementById("result-title").textContent = state.won
      ? `${state.guesses.length}回目で正解！ 🎉`
      : "残念…また明日！";
    document.getElementById("result-answer").textContent = puzzle.answer;
    const change = document.getElementById("result-change");
    change.textContent = `（${changeText}）`;
    change.className = "result-change " + (changePct >= 0 ? "up" : "down");
    document.getElementById("result-desc").textContent = puzzle.desc;
    document.getElementById("share-preview").textContent = buildShareText();
    openModal("modal-result");
  }

  function showStats() {
    const s = loadStats();
    document.getElementById("stat-played").textContent = s.played;
    document.getElementById("stat-winrate").textContent = s.played ? Math.round((s.won / s.played) * 100) + "%" : "0%";
    document.getElementById("stat-streak").textContent = s.streak;
    document.getElementById("stat-maxstreak").textContent = s.maxStreak;
    openModal("modal-stats");
  }

  function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
  }

  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => {
      if (e.target === bd || e.target.hasAttribute("data-close")) bd.classList.add("hidden");
    });
  });

  document.getElementById("btn-help").addEventListener("click", () => openModal("modal-help"));
  document.getElementById("btn-stats").addEventListener("click", showStats);

  // ---- 入力 ----
  const form = document.getElementById("guess-form");
  const input = document.getElementById("guess-input");
  const datalist = document.getElementById("companies");

  COMPANY_LIST.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    datalist.appendChild(opt);
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.done) return;
    const guess = input.value.trim();
    if (!guess) return;
    if (state.guesses.some((g) => normalize(g) === normalize(guess))) {
      input.value = "";
      return;
    }

    state.guesses.push(guess);
    if (isCorrect(guess)) {
      state.done = true;
      state.won = true;
      recordResult(true);
    } else if (state.guesses.length >= MAX_GUESSES) {
      state.done = true;
      state.won = false;
      recordResult(false);
    }
    saveState();
    input.value = "";
    render();
    if (state.done) setTimeout(showResult, 500);
  });

  document.getElementById("btn-share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      document.getElementById("copy-note").classList.remove("hidden");
    } catch (_) {
      const range = document.createRange();
      range.selectNodeContents(document.getElementById("share-preview"));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function render() {
    renderGuessGrid();
    renderHints();
    renderChartStory();
    drawChart(series, getVisibleChartMarkers());
    const disabled = state.done;
    input.disabled = disabled;
    document.getElementById("btn-submit").disabled = disabled;
    const remaining = MAX_GUESSES - state.guesses.length;
    input.placeholder = disabled ? "本日は終了。明日また！" : `企業名を入力（残り${remaining}回）`;
  }

  drawChart(series, getVisibleChartMarkers());
  renderChartStory();
  render();
  if (state.done) showResult();
})();
