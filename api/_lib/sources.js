const { enrich, matchesEditorialFocus, compareEditorial, ageDays } = require('./editorial_boost');
const { fillSummaries, summaryStats } = require('./summaries');
const {
  FEEDS,
  cacheKey,
  CACHE_MS,
  NEGATIVE_TITLE,
  isWeakSource,
  fetchFeed,
  titleTokens,
  jaccard,
  cleanSummary,
  normalizeDedupeKey,
  splitTitleAndPublisher,
} = require('./sources_rss');
const { dedupeItems } = require('./sources_cluster');
const { resolveBatch, applyResolved, applyResolvedRelated, resolveStats } = require('./sources_resolve');
const { diversify, isSoftDrop, isTopCritic, capPriceCards, MAX_AGE_DAYS } = require('./sources_rank');

const poolKey = '__tekniknyheter_pool_cache__';

async function loadPool(now, force) {
  const cached = globalThis[poolKey];
  if (!force && cached && now - cached.at < CACHE_MS) return cached.pool;
  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const collected = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') collected.push(...result.value);
  }
  const enriched = [];
  for (const raw of collected) {
    const item = enrich({ ...raw, originalUrl: raw.url });
    // Negativa rubriker göms inte; de rankas ned i editorial.js. Bara NEGATIVE_TITLE (skräp/spam) sorteras bort.
    if (!matchesEditorialFocus(item, { preferPositive: false })) continue;
    if (NEGATIVE_TITLE.test(item.title || '')) continue;
    enriched.push(item);
  }
  const pool = dedupeItems(enriched).sort(compareEditorial);
  globalThis[poolKey] = { at: now, pool };
  return pool;
}

async function fetchLiveArticles({ force = false, positiveOnly = false } = {}) {
  const now = Date.now();
  const key = `${cacheKey}${positiveOnly ? '_only' : ''}`;
  if (!force && globalThis[key] && now - globalThis[key].at < CACHE_MS) {
    return globalThis[key].items;
  }

  const clustered = await loadPool(now, force);
  // Brus (politiskt slam, eventlistor, krypto, BNPL/ETF/lokal laddare) utesluts; spekulation bara som utfyllnad.
  let candidates = clustered.filter((i) => !i.noise && !i.speculative && !isSoftDrop(i));
  if (candidates.length < 40) candidates = clustered.filter((i) => !i.noise && !isSoftDrop(i));
  // Åldersfilter: äldre än ~72 h (3 dygn) bort om det finns minst 40 färska, annars fylls med de nyaste äldre.
  const fresh = candidates.filter((i) => ageDays(i) <= MAX_AGE_DAYS);
  candidates = fresh.length >= 40 ? fresh : [...fresh, ...candidates.filter((i) => ageDays(i) > MAX_AGE_DAYS).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))];
  // Lågvärdiga poster och överskjutande kursnyheter sorteras bort så länge det finns minst 40 andra.
  candidates = capPriceCards(candidates).sort(compareEditorial);
  const useful = candidates.filter((i) => !i.lowValue && !i.priceCapped);
  if (useful.length >= 40) candidates = useful;
  if (positiveOnly) candidates = candidates.filter((i) => i.sentiment === 'positive' && !isTopCritic(i));
  const top = diversify(candidates, 40, 0.25, 2, positiveOnly ? 1 : 0.65);
  try {
    // Primära nyheter först, sedan länkarna i "Också i" (så att budgeten räcker till det viktigaste).
    await resolveBatch([...top, ...top.flatMap((t) => t.alsoIn || [])]);
  } catch (_) {
    /* behåll Google-länkarna */
  }
  let items = applyResolvedRelated(applyResolved(top).map(({ originalUrl, ...rest }) => rest));
  try {
    // Sammanfattning för toppkorten som saknar en (se summaries.js): utgivarens egen og:description (annars ingen summary).
    items = await fillSummaries(items);
  } catch (_) {
    /* behåll korten utan sammanfattning */
  }
  globalThis[key] = { at: now, items };
  return items;
}

module.exports = {
  fetchLiveArticles,
  resolveStats,
  summaryStats,
  dedupeItems,
  titleTokens,
  jaccard,
  isWeakSource,
  FEEDS,
  cleanSummary,
  normalizeDedupeKey,
  splitTitleAndPublisher,
  isSoftDrop,
  isTopCritic,
};
