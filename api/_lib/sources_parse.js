const crypto = require('crypto');
const {
  FEEDS,
  cacheKey,
  CACHE_MS,
  NEGATIVE_TITLE,
  isWeakSource,
  hostOf,
  decodeXml,
  stripHtml,
  cleanSummary,
  tagValue,
  attrValue,
  extractImage,
  splitTitleAndPublisher,
} = require('./sources_xml');

function normalizeDedupeKey(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9åäö]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

const TITLE_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'has', 'have', 'its', 'his', 'her', 'how', 'why',
  'what', 'who', 'will', 'can', 'new', 'says', 'say', 'after', 'over', 'into', 'than', 'but', 'not', 'you', 'your',
  'och', 'att', 'som', 'det', 'den', 'för', 'med', 'ett', 'har', 'inte', 'numbers', 'number', 'tell', 'tells', 'stock', 'stocks',
]);

/** Token-mängd för nära-dubblettdetektion: utan siffror, valuta och standardfraser. */
function titleTokens(title) {
  let t = String(title || '').toLowerCase().replace(/['’]s?\b/g, '');
  t = t.replace(/\b\d+\s+numbers?\s+that\s+tell\b[^]*$/i, ' ');
  t = t.replace(/[$€£]\s?\d[\d.,]*\s?(b|bn|m|k|billion|million|trillion|tn)?\b/gi, ' ');
  t = t.replace(/\d[\d.,]*\s?(%|b|bn|m|k|billion|million|trillion|tn)?/gi, ' ');
  const out = new Set();
  for (const w of t.split(/[^a-zåäö]+/i)) {
    if (w.length < 3 || TITLE_STOPWORDS.has(w)) continue;
    out.add(w.replace(/(ing|ed|es|s)$/, ''));
  }
  return out;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function pickBestUrl(block, link) {
  const guid = stripHtml(tagValue(block, 'guid'));
  const atomLink = attrValue(block, 'link', 'href');
  // Obs: <source url> är bara utgivarens hemsida och används aldrig som artikel-URL.
  for (const candidate of [link, atomLink, guid]) {
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return link || '';
}

function stableId(originalUrl) {
  return `rss-${crypto.createHash('sha1').update(String(originalUrl)).digest('hex').slice(0, 16)}`;
}

const SV_WORDS = /\b(och|att|är|på|för|med|som|inte|till|från|om|har|får|nya|ny|vid|kan|ska|blir|efter|men|mer|över|under|elbil|elbilar|bilen|vill|sig|ett|den|det|procent|andelen|hittills|utökar|laddtjänst|laddning|högsta|näst|nästa)\b/gi;
const SV_STRONG = /\b(procent|andelen|hittills|utökar|laddtjänst|elbilar|kärnkraft|rekordfart)\b/i;

/** Enkel språkheuristik: svenska ord/tecken i rubriken, eller flödets språk för svenska källor. */
function detectLang(title, feedLang) {
  if (feedLang === 'sv') return 'sv';
  const t = String(title || '');
  const words = (t.match(SV_WORDS) || []).length;
  const accents = /[åäö]/i.test(t);
  if (accents || words >= 2 || SV_STRONG.test(t)) return 'sv';
  return 'en';
}



module.exports = {
  FEEDS,
  cacheKey,
  CACHE_MS,
  NEGATIVE_TITLE,
  isWeakSource,
  hostOf,
  decodeXml,
  stripHtml,
  cleanSummary,
  normalizeDedupeKey,
  splitTitleAndPublisher,
  titleTokens,
  jaccard,
  detectLang,
  tagValue,
  attrValue,
  extractImage,
  pickBestUrl,
  stableId,
};
