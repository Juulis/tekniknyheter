const { enrich, compareEditorial, ageDays, priceCompany } = require('./editorial');

const SV_MIN = 4;
// Minikvoter (kärnkategorier, svenska) får bara fyllas med färska kort; äldre än MAX_AGE_DAYS filtreras bort när det finns nog färska.
const QUOTA_MAX_DAYS = 4;
const MAX_AGE_DAYS = 3; // ~72 h; Dygnet har egen ålderslogik
const CORE_CATEGORIES = ['Tesla', 'Elbilar', 'Elon Musk', 'NVIDIA', 'SpaceX', 'Neuralink', 'AI', 'Geopolitik'];

/**
 * Mjuk kategorikvotering: först minst `minPer` per kärnkategori (om kandidater finns), sedan högst ~25% per kategori,
 * och till sist fylls det på i poängordning.
 */
function diversify(sorted, limit, maxShare = 0.25, minPer = 2, maxPositive = 1) {
  const cap = Math.max(1, Math.ceil(limit * maxShare));
  // Positiv lutning, inte bara positivt: högst maxPositive av korten är positiva så länge det finns neutrala kandidater.
  const posCap = Math.ceil(limit * maxPositive);
  let posCount = 0;
  const counts = new Map();
  const picked = new Set();
  const take = (item) => {
    picked.add(item);
    if (item.sentiment === 'positive') posCount++;
    const cat = item.category || 'Teknik';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  };
  for (const cat of CORE_CATEGORIES) {
    let n = 0;
    for (const item of sorted) {
      if (n >= minPer) break;
      if (item.category === cat && item.sentiment !== 'negative' && !item.personalLife && !item.speculativeSoft && ageDays(item) <= QUOTA_MAX_DAYS) {
        take(item);
        n++;
      }
    }
  }
  // Svenska källor får lite extra plats: minst SV_MIN svenska kort om det finns kandidater.
  let sv = 0;
  for (const item of sorted) {
    if (sv >= SV_MIN) break;
    if (item.lang === 'sv' && item.sentiment !== 'negative' && !item.personalLife && !item.speculativeSoft && ageDays(item) <= QUOTA_MAX_DAYS) {
      if (!picked.has(item)) take(item);
      sv++;
    }
  }
  for (const item of sorted) {
    if (picked.size >= limit) break;
    // Geopolitik (AI-lagar, exportkontroll, EV-tullar) tar högst 4 platser: mer än så blir politiskt brus.
    const catCap = item.category === 'Geopolitik' ? Math.min(cap, 4) : cap;
    if (!picked.has(item) && (counts.get(item.category || 'Teknik') || 0) < catCap && !(item.sentiment === 'positive' && posCount >= posCap)) take(item);
  }
  for (const item of sorted) {
    if (picked.size >= limit) break;
    if (!picked.has(item)) take(item);
  }
  return [...picked].sort(compareEditorial);
}

/** Brus att ranka bort/ned: BNPL/konsumentkredit, lokala laddare, hävstångs-ETF. */
const SOFT_DROP_RE =
  /\bbnpl\b|buy[- ]?now[- ]?pay[- ]?later|\bklarna\b|done\.ai|aspentimes|\bmoomoo\b|\bleveraged?\s+etf\b|\b3x\s+(bull|bear)\b|hävstångs?-?etf|2x\s+(bull|bear|long)|two\s+times\s+long|times\s+long\s+tesla|inverse\s+etf|local\s+(ev\s+)?charg|ev\s+charg(er|ing).{0,40}\b(aspen|town|county|city|municipal)\b|laddstation.{0,30}\b(kommun|stad|aspen)\b/i;

/** Rubriker som är kritiska mot Musk/Tesla/NVIDIA – filtreras i toppnyheter (positive=only). */
const TOP_CRITIC_RE =
  /\b(gör|makes?|making)\b.{0,20}\b(bara|only|just)\b.{0,20}\b(musk|tesla|nvidia)\b.{0,20}\b(rikare|richer|rich)\b|\bmusk\b.{0,30}\b(rikare|greed|greedy|egot)\b|\b(tesla|nvidia|musk)\b.{0,40}\b(depreciation|liabilities|bubble|scam|fraud|övervärder|kritisera|slår\s+mot|attackerar)\b|\bai\s+gör\s+bara\s+musk\b|\bbiggo\b.{0,40}\b(depreciation|liabilities)\b|\barbetet\b.{0,40}\bmusk\b/i;

function isSoftDrop(item) {
  const blob = `${item.title || ''} ${item.source || ''} ${item.url || ''}`;
  return SOFT_DROP_RE.test(blob);
}

function isTopCritic(item) {
  const blob = `${item.title || ''} ${item.source || ''}`;
  return TOP_CRITIC_RE.test(blob);
}

// Kursnyheter: de två bästa per bolag (nvidia/tesla/spacex) behåller sin poäng, övriga får priceCapped (-40 i enrich).
const MAX_PRICE_PER_COMPANY = 2;
function capPriceCards(sorted) {
  const seen = {};
  return sorted.map((it) => {
    const co = it.priceNews || priceCompany(it);
    if (!co) return it;
    seen[co] = (seen[co] || 0) + 1;
    return seen[co] > MAX_PRICE_PER_COMPANY ? enrich({ ...it, priceCapped: true }) : it;
  });
}

module.exports = {
  diversify,
  isSoftDrop,
  isTopCritic,
  capPriceCards,
  MAX_AGE_DAYS,
};
