"use strict";

// Il gioco viene avviato solo con dati reali generati in data/tcg-data.json.
let sets = [];
let cards = [];
let byId = new Map();
const totalRounds = 10;
const baseRoundSeconds = 15;
const dataUrl = "data/tcg-data.json";

const state = {
  config: null,
  targetSet: null,
  round: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  timerId: null,
  roundEndsAt: 0,
  roundSeconds: baseRoundSeconds,
  accepting: false,
  currentQuestion: null,
};

const elements = {
  setupScreen: document.querySelector("#setupScreen"),
  maintenanceScreen: document.querySelector("#maintenanceScreen"),
  drawScreen: document.querySelector("#drawScreen"),
  gameScreen: document.querySelector("#gameScreen"),
  resultScreen: document.querySelector("#resultScreen"),
  setupForm: document.querySelector("#setupForm"),
  franchiseSelect: document.querySelector("#franchiseSelect"),
  setSelect: document.querySelector("#setSelect"),
  setField: document.querySelector("#setField"),
  dataStatus: document.querySelector("#dataStatus"),
  maintenanceStatus: document.querySelector("#maintenanceStatus"),
  scorePill: document.querySelector(".score-pill"),
  rouletteTicker: document.querySelector("#rouletteTicker"),
  drawSetName: document.querySelector("#drawSetName"),
  drawSetCode: document.querySelector("#drawSetCode"),
  scoreValue: document.querySelector("#scoreValue"),
  roundModeLabel: document.querySelector("#roundModeLabel"),
  questionTitle: document.querySelector("#questionTitle"),
  roundValue: document.querySelector("#roundValue"),
  streakValue: document.querySelector("#streakValue"),
  timerValue: document.querySelector("#timerValue"),
  timerBar: document.querySelector("#timerBar"),
  targetSetName: document.querySelector("#targetSetName"),
  targetSetCode: document.querySelector("#targetSetCode"),
  cardsGrid: document.querySelector("#cardsGrid"),
  feedback: document.querySelector("#feedback"),
  resultTitle: document.querySelector("#resultTitle"),
  finalScore: document.querySelector("#finalScore"),
  correctValue: document.querySelector("#correctValue"),
  bestStreakValue: document.querySelector("#bestStreakValue"),
  playedSetValue: document.querySelector("#playedSetValue"),
  shareButton: document.querySelector("#shareButton"),
  playAgainButton: document.querySelector("#playAgainButton"),
  shareStatus: document.querySelector("#shareStatus"),
};

async function init() {
  const databaseLoaded = await loadCardDatabase();

  if (!databaseLoaded) {
    showMaintenance();
    return;
  }

  fillFranchiseSelect();
  fillSetSelect();
  bindEvents();
  updateScore();
}

async function loadCardDatabase() {
  try {
    const response = await fetch(dataUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Database non disponibile: ${response.status}`);
    }

    const database = await response.json();
    const normalized = normalizeDatabase(database);
    sets = normalized.sets;
    cards = normalized.cards;
    byId = new Map(sets.map((set) => [set.id, set]));

    if (elements.dataStatus) {
      elements.dataStatus.textContent = `Database reale caricato: ${formatNumber(cards.length)} carte, ${formatNumber(sets.length)} set.`;
    }
    return true;
  } catch (error) {
    sets = [];
    cards = [];
    byId = new Map();

    if (elements.dataStatus) {
      elements.dataStatus.textContent =
        "Database carte non disponibile. Il gioco tornerà online appena finita la sincronizzazione.";
    }

    if (elements.maintenanceStatus) {
      elements.maintenanceStatus.textContent =
        "Stiamo aggiornando set, espansioni e immagini reali. Torna tra poco per giocare.";
    }
    return false;
  }
}

function normalizeDatabase(database) {
  const rawSets = Array.isArray(database.sets) ? database.sets : [];
  const rawCards = Array.isArray(database.cards) ? database.cards : [];

  const normalizedCards = rawCards
    .map((card) => ({
      id: String(card.id || card.code || ""),
      code: String(card.code || card.number || card.id || ""),
      name: String(card.name || card.cardName || ""),
      type: String(card.type || card.cardType || "Carta"),
      setId: String(card.setId || ""),
      motif: card.motif || "Star",
      rarity: card.rarity || "",
      imageSmall: card.imageSmall || card.image || "",
      imageLarge: card.imageLarge || card.imageSmall || card.image || "",
    }))
    .filter((card) => card.id && card.code && card.name && card.setId);

  const cardsBySet = normalizedCards.reduce((map, card) => {
    map.set(card.setId, (map.get(card.setId) || 0) + 1);
    return map;
  }, new Map());

  const normalizedSets = rawSets
    .map((set) => ({
      id: String(set.id || ""),
      franchise: String(set.franchise || set.game || ""),
      name: String(set.name || ""),
      code: String(set.code || set.id || "").toUpperCase(),
      era: String(set.era || set.series || set.franchise || set.game || ""),
      accent: set.accent || "#7c3cff",
      language: set.language || "",
      cardCount: cardsBySet.get(String(set.id || "")) || 0,
    }))
    .filter((set) => set.id && set.franchise && set.name && set.cardCount >= 5);

  const playableSetIds = new Set(normalizedSets.map((set) => set.id));
  const playableCards = normalizedCards.filter((card) => playableSetIds.has(card.setId));

  if (normalizedSets.length < 2 || playableCards.length < 10) {
    throw new Error("Database insufficiente per generare il quiz.");
  }

  return {
    sets: normalizedSets,
    cards: playableCards,
  };
}

function bindEvents() {
  elements.setupForm.addEventListener("change", handleSetupChange);
  elements.setupForm.addEventListener("submit", startGame);
  elements.playAgainButton.addEventListener("click", resetToSetup);
  elements.shareButton.addEventListener("click", shareResult);
  window.addEventListener("keydown", handleKeyboardChoice);
}

function fillFranchiseSelect() {
  const franchises = [...new Set(sets.map((set) => set.franchise))];
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "Tutti i TCG";
  const options = [allOption];

  for (const franchise of franchises) {
    const option = document.createElement("option");
    option.value = franchise;
    option.textContent = franchise;
    options.push(option);
  }

  elements.franchiseSelect.replaceChildren(...options);
}

function fillSetSelect() {
  const selectedFranchise = elements.franchiseSelect.value;
  const availableSets = filterSetsByFranchise(selectedFranchise);
  elements.setSelect.replaceChildren(
    ...availableSets.map((set) => {
      const option = document.createElement("option");
      option.value = set.id;
      option.textContent = `${set.franchise} - ${set.name} (${set.code})`;
      return option;
    }),
  );
}

function filterSetsByFranchise(franchise) {
  return franchise === "all" ? sets : sets.filter((set) => set.franchise === franchise);
}

function handleSetupChange(event) {
  if (event.target.name === "mode") {
    updateSetSelectState();
  }

  if (event.target.name === "franchise") {
    fillSetSelect();
  }
}

function updateSetSelectState() {
  const mode = getFormValue("mode");
  const isSpecific = mode === "specific";
  elements.setSelect.disabled = !isSpecific;
  elements.setField.classList.toggle("is-disabled", !isSpecific);
}

function startGame(event) {
  event.preventDefault();

  if (!sets.length || !cards.length) {
    showMaintenance();
    return;
  }

  const mode = getFormValue("mode");
  const franchise = elements.franchiseSelect.value;
  const candidateSets = filterSetsByFranchise(franchise);
  const specificSet = byId.get(elements.setSelect.value) || candidateSets[0];

  state.config = {
    mode,
    franchise,
    questionStyle: getFormValue("questionStyle"),
    difficulty: getFormValue("difficulty"),
  };
  state.targetSet = mode === "specific" ? specificSet : sample(candidateSets);
  state.round = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.correct = 0;

  updateScore();

  if (mode === "roulette") {
    showScreen("draw");
    runRouletteDraw(candidateSets).then(() => {
      showScreen("game");
      nextRound();
    });
    return;
  }

  showScreen("game");
  nextRound();
}

function getFormValue(name) {
  const field = elements.setupForm.querySelector(`[name="${name}"]:checked`);
  return field ? field.value : "";
}

function nextRound() {
  clearTimer();
  state.round += 1;

  if (state.round > totalRounds) {
    endGame();
    return;
  }

  state.accepting = true;
  elements.feedback.textContent = "";
  elements.feedback.className = "feedback";
  state.roundSeconds = getRoundSeconds();
  state.currentQuestion = buildQuestion();
  renderRound();
  startTimer();
}

function runRouletteDraw(candidateSets) {
  elements.drawSetName.textContent = "-";
  elements.drawSetCode.textContent = "-";
  elements.rouletteTicker.textContent = "Preparazione...";

  return new Promise((resolve) => {
    let tick = 0;
    const maxTicks = 14;
    const intervalId = window.setInterval(() => {
      const set = tick >= maxTicks - 3 ? state.targetSet : candidateSets[tick % candidateSets.length];
      elements.rouletteTicker.textContent = `${set.franchise} - ${set.name}`;
      elements.drawSetName.textContent = `${state.targetSet.franchise} - ${state.targetSet.name}`;
      elements.drawSetCode.textContent = state.targetSet.code;
      tick += 1;

      if (tick >= maxTicks) {
        window.clearInterval(intervalId);
        window.setTimeout(resolve, 520);
      }
    }, 85);
  });
}

function getRoundSeconds() {
  const hardTrim = state.config.difficulty === "hard" ? 3 : 0;
  const scalingTrim = Math.min(4, Math.floor((state.round - 1) / 2));
  return Math.max(7, baseRoundSeconds - hardTrim - scalingTrim);
}

function buildQuestion() {
  const style =
    state.config.questionStyle === "mixed"
      ? sample(["belongs", "intruder"])
      : state.config.questionStyle;

  const targetCards = cards.filter((card) => card.setId === state.targetSet.id);
  const decoys = getDecoys(style === "belongs" ? 4 : 1);
  let choices;
  let answerCode;

  if (style === "belongs") {
    const answer = sample(targetCards);
    choices = shuffle([answer, ...decoys]);
    answerCode = answer.code;
  } else {
    const answer = decoys[0];
    const sameSetChoices = sampleMany(
      targetCards.filter((card) => card.code !== answer.code),
      4,
    );
    choices = shuffle([...sameSetChoices, answer]);
    answerCode = answer.code;
  }

  return {
    style,
    choices,
    answerCode,
  };
}

function getDecoys(count) {
  const otherCards = cards.filter((card) => card.setId !== state.targetSet.id);
  const target = state.targetSet;
  let pool = otherCards;

  if (state.config.difficulty === "hard" || state.round > 4) {
    const sameFranchise = otherCards.filter((card) => byId.get(card.setId).franchise === target.franchise);
    if (sameFranchise.length >= count) {
      pool = sameFranchise;
    }
  }

  if (state.config.difficulty === "hard" || state.round > 7) {
    const sameEra = pool.filter((card) => byId.get(card.setId).era === target.era);
    if (sameEra.length >= count) {
      pool = sameEra;
    }
  }

  return sampleMany(pool, count);
}

function renderRound() {
  const question = state.currentQuestion;
  const isIntruder = question.style === "intruder";
  const modeName = state.config.mode === "specific" ? "Set specifico" : "Roulette";
  const difficultyName = state.config.difficulty === "hard" ? "Esperto" : "Normale";

  elements.roundModeLabel.textContent = `${modeName} - ${difficultyName}`;
  elements.questionTitle.textContent = isIntruder
    ? "Quale carta non appartiene a questo set?"
    : "Quale carta appartiene a questo set?";
  elements.roundValue.textContent = `${state.round}/${totalRounds}`;
  elements.streakValue.textContent = state.streak;
  elements.timerValue.textContent = state.roundSeconds.toFixed(1);
  elements.timerBar.style.width = "100%";
  elements.targetSetName.textContent = `${state.targetSet.franchise} - ${state.targetSet.name}`;
  elements.targetSetCode.textContent = state.targetSet.code;
  elements.cardsGrid.replaceChildren(...question.choices.map(renderCardButton));
}

function renderCardButton(card, index) {
  const set = byId.get(card.setId);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "card-choice";
  button.dataset.code = card.code;
  button.setAttribute("aria-label", `Scelta ${index + 1}: ${card.name}`);
  button.addEventListener("click", () => chooseCard(card.code));

  const art = document.createElement("div");
  art.className = "card-choice__art";
  const img = document.createElement("img");
  img.alt = "";
  img.src = card.imageSmall || card.imageLarge || makeCardArt(card, set);
  img.addEventListener("error", () => {
    img.onerror = null;
    img.src = makeCardArt(card, set);
  });
  art.append(img);

  const meta = document.createElement("div");
  meta.className = "card-choice__meta";
  meta.innerHTML = `
    <span class="card-choice__code">${escapeHtml(card.code)}</span>
    <span class="card-choice__name">${escapeHtml(card.name)}</span>
    <span class="card-choice__details">${escapeHtml(card.type)} - ${escapeHtml(set.franchise)}</span>
  `;

  button.append(art, meta);
  return button;
}

function chooseCard(code) {
  if (!state.accepting) {
    return;
  }

  state.accepting = false;
  clearTimer();

  const elapsed = Math.max(0, state.roundSeconds - getRemainingSeconds());
  const isCorrect = code === state.currentQuestion.answerCode;
  const selectedCard = cards.find((card) => card.code === code);
  const answerCard = cards.find((card) => card.code === state.currentQuestion.answerCode);

  markChoices(code);

  if (isCorrect) {
    const earned = scoreRound(elapsed);
    state.score += earned;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.correct += 1;
    elements.feedback.textContent = `Corretto: ${selectedCard.name}. +${earned} punti`;
    elements.feedback.classList.add("is-good");
  } else {
    state.streak = 0;
    elements.feedback.textContent = `Non era lei. Risposta giusta: ${answerCard.name} (${answerCard.code}).`;
    elements.feedback.classList.add("is-bad");
  }

  updateScore();
  setTimeout(nextRound, 1250);
}

function scoreRound(elapsedSeconds) {
  const speedRatio = Math.max(0, 1 - elapsedSeconds / state.roundSeconds);
  const speedBonus = Math.round(speedRatio * 80);
  const streakBonus = Math.min(120, state.streak * 18);
  const reverseBonus = state.currentQuestion.style === "intruder" ? 25 : 0;
  const hardBonus = state.config.difficulty === "hard" ? 45 : 0;
  return 100 + speedBonus + streakBonus + reverseBonus + hardBonus;
}

function markChoices(selectedCode) {
  for (const button of elements.cardsGrid.querySelectorAll(".card-choice")) {
    const isAnswer = button.dataset.code === state.currentQuestion.answerCode;
    const isSelected = button.dataset.code === selectedCode;
    button.disabled = true;
    button.classList.toggle("is-correct", isAnswer);
    button.classList.toggle("is-wrong", isSelected && !isAnswer);
  }
}

function startTimer() {
  state.roundEndsAt = performance.now() + state.roundSeconds * 1000;
  state.timerId = window.setInterval(updateTimer, 100);
  updateTimer();
}

function updateTimer() {
  const remaining = getRemainingSeconds();
  const progress = Math.max(0, remaining / state.roundSeconds);
  elements.timerValue.textContent = remaining.toFixed(1);
  elements.timerBar.style.width = `${progress * 100}%`;

  if (remaining <= 0) {
    handleTimeout();
  }
}

function getRemainingSeconds() {
  return Math.max(0, (state.roundEndsAt - performance.now()) / 1000);
}

function clearTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }
}

function handleTimeout() {
  if (!state.accepting) {
    return;
  }

  state.accepting = false;
  clearTimer();
  state.streak = 0;
  markChoices("");
  const answerCard = cards.find((card) => card.code === state.currentQuestion.answerCode);
  elements.feedback.textContent = `Tempo scaduto. Risposta giusta: ${answerCard.name} (${answerCard.code}).`;
  elements.feedback.classList.add("is-bad");
  updateScore();
  setTimeout(nextRound, 1250);
}

function handleKeyboardChoice(event) {
  if (!state.accepting || elements.gameScreen.hidden) {
    return;
  }

  const index = Number(event.key) - 1;
  if (index < 0 || index > 4) {
    return;
  }

  const button = elements.cardsGrid.querySelectorAll(".card-choice")[index];
  if (button) {
    button.click();
  }
}

function endGame() {
  clearTimer();
  showScreen("result");
  const title =
    state.correct === totalRounds
      ? "Maestro dei Set"
      : state.correct >= 8
        ? "Specialista dei Set"
        : state.correct >= 5
          ? "Esploratore del Binder"
          : "Collezionista in Erba";

  elements.resultTitle.textContent = title;
  elements.finalScore.textContent = formatNumber(state.score);
  elements.correctValue.textContent = `${state.correct}/${totalRounds}`;
  elements.bestStreakValue.textContent = state.bestStreak;
  elements.playedSetValue.textContent = `${state.targetSet.code} - ${state.targetSet.name}`;
  elements.shareStatus.textContent = "";
}

async function shareResult() {
  const text = `Ho fatto ${formatNumber(state.score)} punti su Maestro dei Set TCG nel set ${state.targetSet.name}. Tu quanto fai?`;
  const shareData = {
    title: "Maestro dei Set TCG",
    text,
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      elements.shareStatus.textContent = "Punteggio condiviso.";
      return;
    }

    await navigator.clipboard.writeText(`${text} ${window.location.href}`);
    elements.shareStatus.textContent = "Testo copiato negli appunti.";
  } catch (error) {
    elements.shareStatus.textContent = "Condivisione non completata.";
  }
}

function resetToSetup() {
  clearTimer();
  state.score = 0;
  state.streak = 0;
  showScreen("setup");
  updateScore();
}

function showScreen(name) {
  elements.setupScreen.hidden = name !== "setup";
  elements.maintenanceScreen.hidden = name !== "maintenance";
  elements.drawScreen.hidden = name !== "draw";
  elements.gameScreen.hidden = name !== "game";
  elements.resultScreen.hidden = name !== "result";
  elements.scorePill.hidden = name === "maintenance";
}

function showMaintenance() {
  clearTimer();
  state.accepting = false;
  showScreen("maintenance");
  updateScore();
}

function updateScore() {
  elements.scoreValue.textContent = formatNumber(state.score);
  elements.streakValue.textContent = state.streak;
}

function sample(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function sampleMany(items, count) {
  const copy = shuffle([...items]);
  return copy.slice(0, count);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
  }
  return items;
}

function formatNumber(value) {
  return new Intl.NumberFormat("it-IT").format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

function makeCardArt(card, set) {
  const palette = getPalette(set.accent);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 230">
      <rect width="320" height="230" fill="${palette.base}"/>
      <path d="M0 168 C70 126 110 203 184 142 C239 97 270 126 320 88 L320 230 L0 230 Z" fill="${palette.deep}" opacity=".86"/>
      <path d="M0 42 C55 10 98 64 146 37 C207 2 253 31 320 12 L320 86 C255 112 203 80 155 111 C98 148 54 94 0 124 Z" fill="${palette.light}" opacity=".78"/>
      <circle cx="250" cy="60" r="42" fill="#ffffff" opacity=".22"/>
      <circle cx="70" cy="176" r="56" fill="#ffffff" opacity=".16"/>
      ${motifSvg(card.motif)}
      <text x="22" y="35" fill="#ffffff" font-family="Arial, sans-serif" font-size="22" font-weight="800">${set.code}</text>
      <text x="22" y="207" fill="#ffffff" font-family="Arial, sans-serif" font-size="16" font-weight="700">${card.rarity} STELLE</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getPalette(accent) {
  return {
    base: accent,
    deep: shadeColor(accent, -34),
    light: shadeColor(accent, 34),
  };
}

function shadeColor(hex, percent) {
  const value = parseInt(hex.slice(1), 16);
  const amount = Math.round(2.55 * percent);
  const red = clamp((value >> 16) + amount);
  const green = clamp(((value >> 8) & 0xff) + amount);
  const blue = clamp((value & 0xff) + amount);
  return `#${((1 << 24) + (red << 16) + (green << 8) + blue).toString(16).slice(1)}`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}

function motifSvg(motif) {
  const shared = `fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".88"`;
  const motifs = {
    Aura: `<circle cx="160" cy="112" r="48" ${shared}/><path d="M160 38 L176 96 L230 112 L176 130 L160 188 L144 130 L90 112 L144 96 Z" fill="#fff" opacity=".22"/>`,
    Beam: `<path d="M72 158 L248 70" ${shared}/><path d="M105 178 L278 92" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".52"/>`,
    Bird: `<path d="M88 126 C120 80 152 86 160 132 C170 86 204 78 232 126 C204 112 184 125 160 160 C136 125 116 112 88 126 Z" fill="#fff" opacity=".68"/>`,
    Blade: `<path d="M102 170 L220 52 M198 50 L224 76 M98 148 L124 174" ${shared}/>`,
    Bolt: `<path d="M178 36 L94 128 H152 L132 198 L228 96 H166 Z" fill="#fff" opacity=".72"/>`,
    Burst: `<path d="M160 46 L178 100 L232 70 L202 124 L262 142 L198 152 L226 207 L172 172 L144 220 L136 162 L76 188 L116 140 L62 112 L128 104 Z" fill="#fff" opacity=".5"/>`,
    Capsule: `<rect x="88" y="78" width="144" height="76" rx="38" ${shared}/><path d="M160 82 V150" ${shared}/>`,
    Clock: `<circle cx="160" cy="118" r="64" ${shared}/><path d="M160 80 V122 L196 144" ${shared}/>`,
    Compass: `<circle cx="160" cy="116" r="62" ${shared}/><path d="M184 92 L164 146 L136 168 L156 114 Z" fill="#fff" opacity=".65"/>`,
    Crest: `<path d="M160 52 L228 82 V132 C228 171 193 195 160 207 C127 195 92 171 92 132 V82 Z" ${shared}/>`,
    Crown: `<path d="M82 156 L98 82 L136 130 L160 70 L184 130 L222 82 L238 156 Z" fill="#fff" opacity=".72"/>`,
    Curtain: `<path d="M92 54 V184 M228 54 V184 M104 58 C132 98 132 142 104 182 M216 58 C188 98 188 142 216 182" ${shared}/>`,
    Feather: `<path d="M106 174 C178 64 230 52 238 76 C248 105 202 170 106 174 Z M116 166 L206 88" ${shared}/>`,
    Flag: `<path d="M100 190 V52 M104 58 H224 L198 96 L224 134 H104" ${shared}/>`,
    Flame: `<path d="M160 198 C112 172 98 132 128 94 C138 124 158 116 154 82 C190 112 222 146 160 198 Z" fill="#fff" opacity=".7"/>`,
    Fusion: `<path d="M98 92 C132 54 188 54 222 92 M98 150 C132 188 188 188 222 150 M110 108 H210 M110 134 H210" ${shared}/>`,
    Gear: `<circle cx="160" cy="116" r="42" ${shared}/><path d="M160 42 V70 M160 162 V190 M86 116 H114 M206 116 H234 M108 64 L128 84 M192 148 L212 168 M212 64 L192 84 M128 148 L108 168" ${shared}/>`,
    Gem: `<path d="M108 74 H212 L244 116 L160 202 L76 116 Z M108 74 L160 202 M212 74 L160 202 M76 116 H244" ${shared}/>`,
    Halo: `<ellipse cx="160" cy="78" rx="66" ry="24" ${shared}/><path d="M114 122 C122 178 198 178 206 122" ${shared}/>`,
    Hammer: `<path d="M132 84 L176 40 L214 78 L170 122 M158 110 L84 184" ${shared}/>`,
    Harbor: `<path d="M72 164 C112 144 128 184 160 164 C192 144 208 184 248 164 M104 146 V86 H216 V146 M128 86 V58 H192 V86" ${shared}/>`,
    Hex: `<path d="M160 48 L228 86 V164 L160 202 L92 164 V86 Z" ${shared}/><path d="M126 112 H194 M126 142 H194" ${shared}/>`,
    Hour: `<path d="M112 48 H208 M112 196 H208 M128 56 C128 98 192 98 192 116 C192 134 128 134 128 188" ${shared}/>`,
    Leaf: `<path d="M88 154 C112 70 190 58 234 82 C214 158 142 190 88 154 Z M106 150 C148 130 178 106 218 84" ${shared}/>`,
    Map: `<path d="M82 70 L132 52 L188 74 L238 56 V166 L188 184 L132 162 L82 180 Z M132 52 V162 M188 74 V184" ${shared}/>`,
    Moon: `<path d="M198 60 C146 74 124 132 160 180 C104 164 82 98 118 56 C138 34 170 34 198 60 Z" fill="#fff" opacity=".72"/>`,
    Nova: `<path d="M160 52 L180 100 L232 84 L198 128 L238 164 L184 158 L160 206 L136 158 L82 164 L122 128 L88 84 L140 100 Z" fill="#fff" opacity=".72"/>`,
    Portal: `<ellipse cx="160" cy="118" rx="74" ry="44" ${shared}/><path d="M100 118 C132 88 188 88 220 118 C188 148 132 148 100 118 Z" fill="#fff" opacity=".22"/>`,
    Prism: `<path d="M160 42 L238 118 L160 194 L82 118 Z M160 42 V194 M82 118 H238" ${shared}/>`,
    Ring: `<circle cx="160" cy="116" r="70" ${shared}/><circle cx="160" cy="116" r="32" ${shared}/>`,
    Shield: `<path d="M160 52 L226 80 V126 C226 170 190 194 160 206 C130 194 94 170 94 126 V80 Z" ${shared}/>`,
    Signal: `<path d="M160 176 V116 M116 140 C140 116 180 116 204 140 M86 110 C126 70 194 70 234 110 M60 80 C116 24 204 24 260 80" ${shared}/>`,
    Slash: `<path d="M82 174 C128 118 176 82 238 52 C206 110 160 154 82 174 Z" fill="#fff" opacity=".7"/>`,
    Spark: `<path d="M158 52 L184 104 L240 112 L196 148 L208 202 L160 174 L112 202 L124 148 L80 112 L136 104 Z" ${shared}/>`,
    Star: `<path d="M160 50 L184 100 L240 108 L198 146 L210 202 L160 174 L110 202 L122 146 L80 108 L136 100 Z" fill="#fff" opacity=".7"/>`,
    Sun: `<circle cx="160" cy="116" r="42" fill="#fff" opacity=".7"/><path d="M160 42 V70 M160 162 V190 M86 116 H114 M206 116 H234 M108 64 L128 84 M192 148 L212 168 M212 64 L192 84 M128 148 L108 168" ${shared}/>`,
    Tower: `<path d="M112 190 H208 M126 190 V80 H194 V190 M112 80 H208 M144 80 V52 H176 V80" ${shared}/>`,
    Wave: `<path d="M54 136 C90 96 122 176 160 136 C198 96 230 176 266 136 M76 166 C108 134 132 190 164 166 C196 134 220 190 252 166" ${shared}/>`,
    Wing: `<path d="M152 164 C118 94 86 82 60 92 C82 136 110 164 152 164 Z M168 164 C202 94 234 82 260 92 C238 136 210 164 168 164 Z" fill="#fff" opacity=".7"/>`,
  };

  return motifs[motif] || motifs.Star;
}

init();
