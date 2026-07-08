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

  // ---- チャート描画 ----
  function drawChart(values) {
    const svg = document.getElementById("chart");
    const W = 640, H = 300, PAD = 28;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const x = (i) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = (v) => H - PAD - ((v - min) / range) * (H - PAD * 2);

    const up = values[values.length - 1] >= values[0];
    const color = up ? "#6aaa64" : "#e74c3c";
    const points = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

    let grid = "";
    for (let g = 0; g <= 4; g++) {
      const gy = PAD + (g / 4) * (H - PAD * 2);
      grid += `<line x1="${PAD}" y1="${gy}" x2="${W - PAD}" y2="${gy}" stroke="#ececec" stroke-width="1"/>`;
    }

    const areaPoints = `${PAD},${H - PAD} ${points} ${W - PAD},${H - PAD}`;
    const lastX = x(values.length - 1);
    const lastY = y(values[values.length - 1]);

    svg.innerHTML = `
      ${grid}
      <polygon points="${areaPoints}" fill="${color}" opacity="0.12"/>
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lastX}" cy="${lastY}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/>
    `;
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
        ? `<span class="hint-tag">${h.tag}</span>${escapeHtml(h.text)}`
        : `<span class="hint-tag">🔒</span>外すと開放`;
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
    const disabled = state.done;
    input.disabled = disabled;
    document.getElementById("btn-submit").disabled = disabled;
    const remaining = MAX_GUESSES - state.guesses.length;
    input.placeholder = disabled ? "本日は終了。明日また！" : `企業名を入力（残り${remaining}回）`;
  }

  drawChart(series);
  render();
  if (state.done) showResult();
})();
