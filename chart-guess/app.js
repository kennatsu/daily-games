(() => {
  const MAX_GUESSES = 6;
  const STORAGE_KEY = "chart-guess-state";
  const STATS_KEY = "chart-guess-stats";
  const HELP_KEY = "chart-guess-seen-help";
  const EPOCH = "2026-07-01";
  const REDUCE_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function sleep(ms) {
    if (REDUCE_MOTION) return Promise.resolve();
    return new Promise((r) => setTimeout(r, ms));
  }

  // ---- JST 日付 ----
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

  // ---- 問題 ----
  const dayNumber = jstDayNumber();
  const puzzle = PUZZLES[dayNumber % PUZZLES.length];
  const series = SERIES[puzzle.ticker];
  const puzzleNo = dayNumber + 1;
  const targetMeta = STOCK_INDEX[puzzle.answer];
  const targetChangePct = changePctFor(puzzle.ticker);

  const changeText = `${targetChangePct >= 0 ? "+" : ""}${targetChangePct.toFixed(1)}%`;

  document.getElementById("puzzle-label").textContent = `#${puzzleNo}`;
  document.getElementById("data-asof").textContent = DATA_ASOF;

  const changeBadge = document.getElementById("chart-change");
  changeBadge.textContent = changeText;
  changeBadge.classList.add(targetChangePct >= 0 ? "up" : "down");

  const countdownEl = document.getElementById("countdown");
  function tickCountdown() {
    countdownEl.textContent = "次の問題まで " + formatCountdown(msUntilNextJSTMidnight());
  }
  tickCountdown();
  setInterval(tickCountdown, 1000);

  // ---- 企業名ルックアップ ----
  const nameLookup = new Map();
  for (const name of COMPANY_LIST) {
    nameLookup.set(normalize(name), name);
  }
  for (const p of PUZZLES) {
    nameLookup.set(normalize(p.answer), p.answer);
    for (const a of p.aliases) nameLookup.set(normalize(a), p.answer);
  }

  function normalize(s) {
    return s.trim().toLowerCase().replace(/\s+/g, "").replace(/[・･]/g, "");
  }

  function resolveCompany(input) {
    return nameLookup.get(normalize(input)) || null;
  }

  function changePctFor(ticker) {
    const s = SERIES[ticker];
    if (!s?.length) return 0;
    return (s[s.length - 1] / s[0] - 1) * 100;
  }

  function isCorrect(guess) {
    return resolveCompany(guess) === puzzle.answer;
  }

  // ---- Tradle 式フィードバック ----
  function computeFeedback(guessName) {
    const guess = STOCK_INDEX[guessName];
    if (!guess || !targetMeta) return null;

    const guessChange = changePctFor(guess.ticker);
    const sameDir = (guessChange >= 0) === (targetChangePct >= 0);
    const changeDiff = Math.abs(guessChange - targetChangePct);

    let proximity = 0;
    if (guess.sector === targetMeta.sector) proximity += 40;
    else if (guess.sectorRoot === targetMeta.sectorRoot) proximity += 22;

    const mcapRatio = Math.min(guess.mcapYen, targetMeta.mcapYen) / Math.max(guess.mcapYen, targetMeta.mcapYen || 1);
    proximity += Math.round(mcapRatio * 30);

    if (sameDir) proximity += 12;
    proximity += Math.max(0, 18 - Math.floor(changeDiff / 8));
    proximity = Math.min(100, proximity);

    let sectorFb;
    if (guess.sector === targetMeta.sector) sectorFb = { cls: "match", text: "業界 ○" };
    else if (guess.sectorRoot === targetMeta.sectorRoot) sectorFb = { cls: "partial", text: "業界 △" };
    else sectorFb = { cls: "miss", text: "業界 ✗" };

    let sizeFb;
    if (mcapRatio >= 0.55) sizeFb = { cls: "match", text: "規模 ≈" };
    else if (guess.mcapYen > targetMeta.mcapYen * 1.4) sizeFb = { cls: "miss", text: "規模 ↓小" };
    else sizeFb = { cls: "miss", text: "規模 ↑大" };

    const chartCls = sameDir ? (changeDiff <= 25 ? "match" : "partial") : "miss";
    const chartIcon = sameDir ? "↗" : "↘";
    const chartFb = { cls: chartCls, text: `株価 ${chartIcon}${proximity}%` };

    return { proximity, pills: [sectorFb, sizeFb, chartFb] };
  }

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

  function defaultStats() {
    return {
      played: 0, won: 0, streak: 0, maxStreak: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 },
    };
  }

  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem(STATS_KEY));
      return { ...defaultStats(), ...s, distribution: { ...defaultStats().distribution, ...s?.distribution } };
    } catch (_) {
      return defaultStats();
    }
  }

  function recordResult(won) {
    const stats = loadStats();
    stats.played += 1;
    if (won) {
      stats.won += 1;
      stats.streak += 1;
      stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
      const n = state.guesses.length;
      if (n >= 1 && n <= 6) stats.distribution[n] = (stats.distribution[n] || 0) + 1;
    } else {
      stats.streak = 0;
      stats.distribution.fail = (stats.distribution.fail || 0) + 1;
    }
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  function getVisibleChartMarkers() {
    const revealCount = state.done ? puzzle.hints.length : state.guesses.length;
    return puzzle.hints
      .slice(0, revealCount)
      .filter((h) => h.tag === "チャート" && h.index != null);
  }

  // ---- チャート描画 ----
  function drawChart(values, markers = [], opts = {}) {
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
    const pathLen = 1200;

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
      [0, 6, 12, 18, values.length - 1].forEach((i) => {
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

    const drawLine = opts.drawLine
      ? `<polyline class="chart-line-draw" points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="${pathLen}" stroke-dashoffset="${pathLen}"/>`
      : `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

    let eventMarkers = "";
    markers.forEach((m, idx) => {
      const cx = x(m.index);
      const cy = y(values[m.index]);
      const isDrop = m.moveType === "drop";
      const mColor = isDrop ? "#1565c0" : "#d32f2f";
      const label = isDrop ? "↓" : "↑";
      const labelY = isDrop ? cy + 18 : cy - 12;
      const isNew = opts.newMarkerIdx === idx;
      eventMarkers += `
        <g class="chart-marker${isNew ? " marker-pop" : ""}">
          <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${labelY + (isDrop ? -8 : 8)}" stroke="${mColor}" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>
          <circle cx="${cx}" cy="${cy}" r="6" fill="${mColor}" stroke="#fff" stroke-width="2"/>
          <text x="${cx}" y="${labelY}" text-anchor="middle" fill="${mColor}" font-size="11" font-weight="bold" font-family="sans-serif">${label}${idx + 1}</text>
        </g>
      `;
    });

    svg.innerHTML = `
      ${border}${grid}${baseline}
      <polygon points="${areaPoints}" fill="${color}" opacity="0.06"/>
      ${drawLine}
      <circle cx="${x(0)}" cy="${y(values[0])}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="${lastX}" cy="${lastY}" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>
      <text x="${lastX}" y="${lastY - 10}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold" font-family="sans-serif">${lastVal.toFixed(1)}</text>
      ${eventMarkers}${yLabels}${xLabels}
    `;
  }

  function renderChartStory(newNoteIdx = -1) {
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
      const noteCls = i === newNoteIdx ? " chart-note-new" : "";
      return `<div class="chart-note ${cls}${noteCls}"><span class="chart-note-icon">${icon}${i + 1}</span>${escapeHtml(m.text)}</div>`;
    }).join("");
  }

  // ---- 回答グリッド（Wordle 6行 + Tradle フィードバック） ----
  function renderGuessGrid(hideFeedback = false) {
    const container = document.getElementById("guess-grid");
    container.innerHTML = "";
    for (let i = 0; i < MAX_GUESSES; i++) {
      const row = document.createElement("div");
      if (i < state.guesses.length) {
        const guessRaw = state.guesses[i];
        const canonical = resolveCompany(guessRaw) || guessRaw;
        const correct = isCorrect(guessRaw);
        const isPending = hideFeedback && i === state.guesses.length - 1;

        if (isPending) {
          row.className = "guess-row pending";
          row.innerHTML = `<span class="guess-dot pending"></span><div class="guess-body"><span class="guess-text">${escapeHtml(canonical)}</span></div>`;
        } else if (correct) {
          row.className = "guess-row correct";
          row.innerHTML = `<span class="guess-dot correct"></span><div class="guess-body"><span class="guess-text">${escapeHtml(canonical)}</span></div>`;
        } else {
          row.className = "guess-row wrong";
          const fb = computeFeedback(canonical);
          const pills = fb
            ? fb.pills.map((p) => `<span class="fb-pill ${p.cls}">${escapeHtml(p.text)}</span>`).join("")
            : "";
          row.innerHTML = `
            <span class="guess-dot wrong"></span>
            <div class="guess-body">
              <span class="guess-text">${escapeHtml(canonical)}</span>
              ${pills ? `<div class="guess-feedback">${pills}</div>` : ""}
            </div>`;
        }
      } else {
        row.className = "guess-row empty" + (i === state.guesses.length && !state.done ? " active" : "");
        row.innerHTML = `<span class="guess-dot empty-dot"></span><span class="guess-placeholder">${i === state.guesses.length && !state.done ? "次の回答" : ""}</span>`;
      }
      container.appendChild(row);
    }
  }

  function renderHints(unlockIdx = -1) {
    const container = document.getElementById("hints");
    container.innerHTML = "";
    const revealCount = state.done ? puzzle.hints.length : state.guesses.length;
    puzzle.hints.forEach((h, i) => {
      const div = document.createElement("div");
      const revealed = i < revealCount;
      div.className = "hint" + (revealed ? " revealed" : "") + (i === unlockIdx ? " hint-unlock" : "");
      div.innerHTML = revealed
        ? `<span class="hint-tag ${h.tag === "チャート" ? "chart" : ""}">${escapeHtml(h.tag)}</span>${escapeHtml(h.text)}`
        : `<span class="hint-tag">🔒 ${i + 1}</span><span class="hint-locked">外すと「${escapeHtml(h.tag)}」が開く</span>`;
      container.appendChild(div);
    });
  }

  // ---- アニメーション ----
  async function playGuessAnimation(rowIdx, correct) {
    const row = document.getElementById("guess-grid")?.children[rowIdx];
    if (!row || REDUCE_MOTION) return;

    row.classList.add("anim-pop");
    await sleep(280);

    row.classList.add("anim-reveal", correct ? "anim-correct" : "anim-wrong");
    if (correct) {
      row.classList.remove("pending");
      row.classList.add("correct");
      row.querySelector(".guess-dot")?.classList.replace("pending", "correct");
      document.querySelector(".chart-card")?.classList.add("win-pulse");
      await sleep(520);
    } else {
      row.classList.remove("pending");
      row.classList.add("wrong");
      await sleep(320);
      row.classList.add("anim-shake");
      await sleep(420);
      renderGuessGrid(false);
      const updated = document.getElementById("guess-grid")?.children[rowIdx];
      updated?.classList.add("anim-pop", "anim-reveal", "anim-wrong", "anim-shake", "anim-pills");
      await sleep(280);
    }
  }

  async function playHintUnlock(hintIdx) {
    const markers = getVisibleChartMarkers();
    let newMarkerIdx = -1;
    if (puzzle.hints[hintIdx]?.tag === "チャート") {
      newMarkerIdx = markers.length - 1;
    }

    renderHints(hintIdx);
    const hintEl = document.getElementById("hints")?.children[hintIdx];
    hintEl?.scrollIntoView({ behavior: REDUCE_MOTION ? "auto" : "smooth", block: "nearest" });

    const newNoteIdx = puzzle.hints[hintIdx]?.tag === "チャート"
      ? markers.length - 1
      : -1;
    renderChartStory(newNoteIdx >= 0 ? newNoteIdx : -1);
    drawChart(series, markers, { newMarkerIdx: newMarkerIdx >= 0 ? newMarkerIdx : undefined });

    if (!REDUCE_MOTION) await sleep(450);
  }

  // ---- シェア ----
  function buildShareText() {
    const guessEmojis = state.guesses.map((g) => (isCorrect(g) ? "🟩" : "⬜")).join("");
    const hintEmojis = puzzle.hints.map((_, i) => {
      const revealed = state.done || i < state.guesses.length;
      return revealed ? "💡" : "🔒";
    }).join("");
    const score = state.won ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    return `チャート当て #${puzzleNo} ${score}\n${guessEmojis}\n${hintEmojis}\n${location.href}`;
  }

  // ---- モーダル ----
  function showResult() {
    document.getElementById("result-title").textContent = state.won
      ? `${state.guesses.length}回目で正解！ 🎉`
      : "残念…また明日！";
    document.getElementById("result-answer").textContent = puzzle.answer;
    const change = document.getElementById("result-change");
    change.textContent = `（${changeText}）`;
    change.className = "result-change " + (targetChangePct >= 0 ? "up" : "down");
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

    const distEl = document.getElementById("stat-distribution");
    const max = Math.max(1, ...[1, 2, 3, 4, 5, 6, "fail"].map((k) => s.distribution[k] || 0));
    distEl.innerHTML = [1, 2, 3, 4, 5, 6].map((n) => {
      const count = s.distribution[n] || 0;
      const pct = Math.round((count / max) * 100);
      return `<div class="dist-row"><span class="dist-label">${n}</span><div class="dist-bar-wrap"><div class="dist-bar" style="width:${pct}%"></div></div><span class="dist-count">${count}</span></div>`;
    }).join("") + `<div class="dist-row fail"><span class="dist-label">X</span><div class="dist-bar-wrap"><div class="dist-bar fail-bar" style="width:${Math.round(((s.distribution.fail || 0) / max) * 100)}%"></div></div><span class="dist-count">${s.distribution.fail || 0}</span></div>`;
    openModal("modal-stats");
  }

  function openModal(id) {
    const bd = document.getElementById(id);
    bd.classList.remove("hidden");
    bd.querySelector(".modal")?.classList.add("modal-pop");
  }

  document.querySelectorAll(".modal-backdrop").forEach((bd) => {
    bd.addEventListener("click", (e) => {
      if (e.target === bd || e.target.hasAttribute("data-close")) {
        bd.classList.add("hidden");
        bd.querySelector(".modal")?.classList.remove("modal-pop");
      }
    });
  });

  document.getElementById("btn-help").addEventListener("click", () => openModal("modal-help"));
  document.getElementById("btn-stats").addEventListener("click", showStats);

  // ---- トースト ----
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("visible");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => el.classList.remove("visible"), 2200);
  }

  function shakeInput() {
    const form = document.getElementById("guess-form");
    form.classList.remove("shake");
    void form.offsetWidth;
    form.classList.add("shake");
  }

  // ---- オートコンプリート ----
  const form = document.getElementById("guess-form");
  const input = document.getElementById("guess-input");
  const acList = document.getElementById("ac-list");
  let acIndex = -1;

  function filterCompanies(q) {
    const n = normalize(q);
    if (!n) return [];
    return COMPANY_LIST.filter((name) => normalize(name).includes(n)).slice(0, 8);
  }

  function renderAc(items) {
    acList.innerHTML = "";
    if (!items.length) {
      acList.classList.remove("open");
      return;
    }
    items.forEach((name, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ac-item" + (i === acIndex ? " active" : "");
      btn.textContent = name;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        input.value = name;
        acList.classList.remove("open");
        input.focus();
      });
      acList.appendChild(btn);
    });
    acList.classList.add("open");
  }

  input.addEventListener("input", () => {
    acIndex = -1;
    renderAc(filterCompanies(input.value));
  });

  input.addEventListener("keydown", (e) => {
    const items = acList.querySelectorAll(".ac-item");
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      acIndex = Math.min(acIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle("active", i === acIndex));
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      acIndex = Math.max(acIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle("active", i === acIndex));
    } else if (e.key === "Enter" && acIndex >= 0 && items[acIndex]) {
      e.preventDefault();
      input.value = items[acIndex].textContent;
      acList.classList.remove("open");
      form.requestSubmit();
    } else if (e.key === "Escape") {
      acList.classList.remove("open");
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".input-wrap")) acList.classList.remove("open");
  });

  // ---- 回答送信 ----
  let animating = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (state.done || animating) return;
    const raw = input.value.trim();
    if (!raw) return;

    const canonical = resolveCompany(raw);
    if (!canonical) {
      shakeInput();
      showToast("リストにない企業名です");
      return;
    }

    if (state.guesses.some((g) => resolveCompany(g) === canonical)) {
      shakeInput();
      showToast("もう回答済みです");
      input.value = "";
      acList.classList.remove("open");
      return;
    }

    animating = true;
    input.disabled = true;
    document.getElementById("btn-submit").disabled = true;

    state.guesses.push(raw);
    acList.classList.remove("open");

    const rowIdx = state.guesses.length - 1;
    const correct = isCorrect(raw);
    const hintIdx = rowIdx;

    if (correct) {
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

    renderGuessGrid(true);
    await playGuessAnimation(rowIdx, correct);

    renderGuessGrid(false);
    await playHintUnlock(hintIdx);

    animating = false;
    render();
    if (state.done) setTimeout(showResult, REDUCE_MOTION ? 100 : 350);
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
    renderGuessGrid(false);
    renderHints(-1);
    renderChartStory(-1);
    drawChart(series, getVisibleChartMarkers());
    const disabled = state.done || animating;
    input.disabled = disabled;
    document.getElementById("btn-submit").disabled = disabled;
    const remaining = MAX_GUESSES - state.guesses.length;
    input.placeholder = state.done ? "本日は終了。明日また！" : `企業名を入力（残り${remaining}回）`;
  }

  // ---- 初回ヘルプ ----
  if (!localStorage.getItem(HELP_KEY)) {
    localStorage.setItem(HELP_KEY, "1");
    setTimeout(() => openModal("modal-help"), 400);
  }

  drawChart(series, getVisibleChartMarkers(), { drawLine: !REDUCE_MOTION });
  renderChartStory(-1);
  render();
  if (state.done) showResult();
})();
