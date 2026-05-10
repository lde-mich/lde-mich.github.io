import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const outDir = resolve(rootDir, "data");
const outFile = resolve(outDir, "tcg-data.json");
const manifestFile = resolve(outDir, "manifest.json");

const apiTcgKey = process.env.APITCG_API_KEY || "";
const allowPartialSync = process.env.ALLOW_PARTIAL_SYNC === "1";
const dryRun = process.env.DRY_RUN === "1";
const selectedGames = (process.env.SYNC_GAMES || "pokemon,one-piece,dragon-ball")
  .split(",")
  .map((game) => game.trim())
  .filter(Boolean);

const pokemonSetLimit = Number(process.env.POKEMON_SET_LIMIT || 0);
const apiTcgLimit = Math.min(Number(process.env.APITCG_PAGE_SIZE || 100), 100);
const minCardsPerSet = 5;

const accents = {
  pokemon: "#7c3cff",
  "one-piece": "#2ad4ce",
  "dragon-ball": "#ffb347",
};

async function main() {
  const chunks = [];

  if (selectedGames.includes("pokemon")) {
    chunks.push(await syncPokemonItalian());
  }

  if (selectedGames.includes("one-piece")) {
    chunks.push(
      await syncApiTcgGame({
        slug: "one-piece",
        franchise: "One Piece",
        language: "en",
        endpoint: "https://apitcg.com/api/one-piece/cards",
      }),
    );
  }

  if (selectedGames.includes("dragon-ball")) {
    chunks.push(
      await syncApiTcgGame({
        slug: "dragon-ball",
        franchise: "Dragon Ball",
        language: "en",
        endpoint: "https://apitcg.com/api/dragon-ball-fusion/cards",
      }),
    );
  }

  const database = mergeChunks(chunks);
  if (!dryRun) {
    await writeDatabase(database);
  }
  printSummary(database);
}

async function syncPokemonItalian() {
  const baseUrl = "https://api.tcgdex.net/v2/it";
  const setList = await fetchJson(`${baseUrl}/sets`);
  const selectedSets = pokemonSetLimit > 0 ? setList.slice(-pokemonSetLimit) : setList;
  const details = await mapWithConcurrency(selectedSets, 4, (set) =>
    fetchJson(`${baseUrl}/sets/${encodeURIComponent(set.id)}`),
  );

  const sets = [];
  const cards = [];

  for (const set of details) {
    const setId = `pokemon-${set.id}`;
    const setCards = Array.isArray(set.cards) ? set.cards : [];

    if (setCards.length < minCardsPerSet) {
      continue;
    }

    const normalizedSetCards = [];

    for (const card of setCards) {
      if (!card.id || !card.name || !card.localId) {
        continue;
      }

      const imageSmall = withCardQuality(card.image, "low", "webp");
      const imageLarge = withCardQuality(card.image, "high", "webp");

      if (!imageSmall && !imageLarge) {
        continue;
      }

      normalizedSetCards.push({
        id: `pokemon-${card.id}`,
        game: "pokemon",
        language: "it",
        setId,
        code: `${set.id.toUpperCase()}-${card.localId}`,
        localId: String(card.localId),
        name: card.name,
        type: "Carta Pokémon",
        rarity: "",
        imageSmall,
        imageLarge,
        source: "tcgdex",
        sourceId: card.id,
      });
    }

    if (normalizedSetCards.length < minCardsPerSet) {
      continue;
    }

    sets.push({
      id: setId,
      game: "pokemon",
      franchise: "Pokémon",
      language: "it",
      name: set.name,
      code: set.id.toUpperCase(),
      era: set.serie?.name || "Pokémon",
      accent: accents.pokemon,
      source: "tcgdex",
      sourceId: set.id,
      releaseDate: set.releaseDate || "",
      cardCount: normalizedSetCards.length,
      logo: withAssetExtension(set.logo, "webp"),
      symbol: withAssetExtension(set.symbol, "webp"),
    });

    cards.push(...normalizedSetCards);
  }

  return { sets, cards };
}

async function syncApiTcgGame({ slug, franchise, language, endpoint }) {
  if (!apiTcgKey) {
    const message = `APITCG_API_KEY mancante: salto ${franchise}.`;
    if (allowPartialSync) {
      console.warn(message);
      return { sets: [], cards: [] };
    }

    throw new Error(`${message} Crea il secret GitHub APITCG_API_KEY o usa ALLOW_PARTIAL_SYNC=1.`);
  }

  const rawCards = await fetchAllApiTcgCards(endpoint);
  const setsById = new Map();
  const cards = [];

  for (const card of rawCards) {
    const imageSmall = card.images?.small || card.images?.large || "";
    const imageLarge = card.images?.large || card.images?.small || "";

    if (!imageSmall && !imageLarge) {
      continue;
    }

    const sourceSet = card.set || {};
    const extractedCode = extractSetCode(sourceSet.id || sourceSet.name || card.getIt || card.code);
    const setCode = extractedCode || inferSetCodeFromCard(card.code || card.id);
    const cleanSet = cleanSetName(sourceSet.name || card.getIt || setCode || franchise);
    const setId = `${slug}-${slugify(setCode || cleanSet)}`;

    if (!setsById.has(setId)) {
      setsById.set(setId, {
        id: setId,
        game: slug,
        franchise,
        language,
        name: cleanSet,
        code: (setCode || cleanSet).toUpperCase(),
        era: franchise,
        accent: accents[slug] || "#7c3cff",
        source: "apitcg",
        sourceId: sourceSet.id || setCode || "",
        releaseDate: "",
        cardCount: 0,
      });
    }

    const set = setsById.get(setId);
    set.cardCount += 1;

    cards.push({
      id: `${slug}-${card.id || card.code}`,
      game: slug,
      language,
      setId,
      code: String(card.code || card.id || ""),
      localId: String(card.code || card.id || ""),
      name: String(card.name || ""),
      type: String(card.type || card.cardType || "Card"),
      rarity: String(card.rarity || ""),
      imageSmall,
      imageLarge,
      source: "apitcg",
      sourceId: String(card.id || card.code || ""),
    });
  }

  const sets = [...setsById.values()].filter((set) => set.cardCount >= minCardsPerSet);
  const playableSetIds = new Set(sets.map((set) => set.id));

  return {
    sets,
    cards: cards.filter((card) => playableSetIds.has(card.setId) && card.code && card.name),
  };
}

async function fetchAllApiTcgCards(endpoint) {
  const cards = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL(endpoint);
    url.searchParams.set("limit", String(apiTcgLimit));
    url.searchParams.set("page", String(page));

    const response = await fetchJson(url, {
      "x-api-key": apiTcgKey,
    });

    const data = Array.isArray(response.data) ? response.data : [];
    cards.push(...data);
    totalPages = Number(response.totalPages || Math.ceil(Number(response.total || data.length) / apiTcgLimit) || 1);
    page += 1;
  } while (page <= totalPages);

  return cards;
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} per ${url}`);
  }

  return response.json();
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function mergeChunks(chunks) {
  const sets = chunks.flatMap((chunk) => chunk.sets);
  const cards = chunks.flatMap((chunk) => chunk.cards);
  const playableSetIds = new Set(sets.map((set) => set.id));
  const playableCards = cards.filter((card) => playableSetIds.has(card.setId));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: [
      {
        name: "TCGdex",
        game: "pokemon",
        language: "it",
        url: "https://api.tcgdex.net/v2/it",
      },
      {
        name: "API TCG",
        game: "one-piece",
        language: "en",
        url: "https://apitcg.com/api/one-piece/cards",
      },
      {
        name: "API TCG",
        game: "dragon-ball",
        language: "en",
        url: "https://apitcg.com/api/dragon-ball-fusion/cards",
      },
    ],
    sets: sortSets(sets),
    cards: sortCards(playableCards),
  };
}

async function writeDatabase(database) {
  if (database.sets.length < 2 || database.cards.length < 10) {
    throw new Error("Sincronizzazione annullata: il database generato e' troppo piccolo.");
  }

  await mkdir(outDir, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  await writeFile(
    manifestFile,
    `${JSON.stringify(
      {
        generatedAt: database.generatedAt,
        setCount: database.sets.length,
        cardCount: database.cards.length,
        games: countBy(database.sets, "game"),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

function printSummary(database) {
  if (dryRun) {
    console.log("DRY_RUN attivo: nessun file scritto.");
  }

  console.log(`Generato ${outFile}`);
  console.log(`Set: ${database.sets.length}`);
  console.log(`Carte: ${database.cards.length}`);
  console.log(database.sets.reduce((summary, set) => {
    summary[set.franchise] = (summary[set.franchise] || 0) + 1;
    return summary;
  }, {}));
}

function withCardQuality(baseUrl, quality, extension) {
  if (!baseUrl) {
    return "";
  }

  if (/\.(png|webp|jpg|jpeg)$/i.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}/${quality}.${extension}`;
}

function withAssetExtension(baseUrl, extension) {
  if (!baseUrl) {
    return "";
  }

  if (/\.(png|webp|jpg|jpeg)$/i.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}.${extension}`;
}

function extractSetCode(value) {
  const text = String(value || "");
  const bracket = text.match(/\[([A-Z0-9-]+)\]/i);
  if (bracket) {
    return bracket[1].toUpperCase();
  }

  const code = text.match(/\b(OP|ST|EB|PRB|FB|FS|SB)\s?-?\d{1,2}\b/i);
  if (code) {
    return code[0].replace(/\s/g, "").toUpperCase();
  }

  return "";
}

function inferSetCodeFromCard(code) {
  const match = String(code || "").match(/^([A-Z]+[0-9]{1,2})-/i);
  return match ? match[1].toUpperCase() : "";
}

function cleanSetName(value) {
  const text = String(value || "")
    .replace(/\[[^\]]+\]/g, "")
    .replace(/^[-\s]+|[-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text || "Unknown Set";
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortSets(items) {
  return [...items].sort((a, b) => {
    const game = a.game.localeCompare(b.game);
    if (game !== 0) {
      return game;
    }

    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

function sortCards(items) {
  return [...items].sort((a, b) => {
    const set = a.setId.localeCompare(b.setId);
    if (set !== 0) {
      return set;
    }

    return a.code.localeCompare(b.code, undefined, { numeric: true });
  });
}

function countBy(items, key) {
  return items.reduce((summary, item) => {
    summary[item[key]] = (summary[item[key]] || 0) + 1;
    return summary;
  }, {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
