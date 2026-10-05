/**
 * Extra intern poäng, sentimentjustering och sv-signalord (ingen UI-text).
 * Patchar enrich från editorial.js utan att skriva om hela filen.
 */
const editorial = require('./editorial');

const EXTRA_POS = /slog förväntningarna|högsta|highest since/i;

/** Rubriker som inte ska räknas som positiva trots rekord/breakthrough-ord. */
const FORCE_NEUTRAL = new RegExp(
  [
    'more expensive',
    'loses? steam',
    '\\bskepticism\\b',
    'did it\\?',
    'hänger inte med',
    '\\bmen\\b.{0,50}hänger',
    '\\bundercut\\b',
    'china ev tariffs?',
    'ev tariffs?.{0,40}china|china.{0,40}ev tariffs?',
    'pay huawei',
    'qualcomm.{0,30}huawei',
  ].join('|'),
  'i'
);

/** Konkurrent/hållning mot Tesla/EV: behåll synlig men under positiva Tesla-nyheter. */
const TESLA_COMPETITOR_DRAG = /undercut tesla|xpeng.{0,40}tesla|byd.{0,40}mazda|china ev tariffs?|uk.{0,40}china.{0,40}tariffs?/i;

function storyBoost(item) {
  const title = String(item.title || '');
  let n = 0;
  if (/robotaxi/.test(title) && /sverige|sweden|ladda ner/i.test(title)) n += 28;
  if (/german registrations?/i.test(title) && /highest|hit high|since 2022/i.test(title)) n += 32;
  if (/200\s*miljarder|över 200 miljard|\b200\s*b(illion)?\b|\$200\s*b/i.test(title) && /jensen|huang|nvidia|förmögenhet/i.test(title)) n += 35;
  if (/slog förväntningarna/i.test(title) && /tesla|levererade|kvartalet/i.test(title)) n += 30;
  if (/no more ai/i.test(title) && /musk|spacex/i.test(title)) n += 40;
  if (/super intelligence force/i.test(title)) n += 36;
  return n;
}

function fixCategory(item, e) {
  const blob = `${item.title || ''} ${item.summary || ''} ${e.category || ''}`;
  if (/vistra|kärnkraftslån/i.test(blob)) return { ...e, category: 'Geopolitik' };
  return e;
}

const origEnrich = editorial.enrich;
function enrich(item) {
  let next = { ...item };
  const title = String(next.title || '');
  if (!next.sentiment && EXTRA_POS.test(title) && !FORCE_NEUTRAL.test(title)) {
    next.sentiment = 'positive';
  }
  if (FORCE_NEUTRAL.test(title)) {
    next.sentiment = 'neutral';
  }
  let e = origEnrich(next);
  e = fixCategory(next, e);
  if (FORCE_NEUTRAL.test(String(e.title || '')) && e.sentiment === 'positive') {
    e = { ...e, sentiment: 'neutral' };
  }
  let score = e.priorityScore || 0;
  // Om origEnrich gett positive-bonus trots force-neutral: sänk.
  if (FORCE_NEUTRAL.test(String(e.title || ''))) {
    score -= 22;
  }
  if (TESLA_COMPETITOR_DRAG.test(String(e.title || ''))) {
    score -= 18;
  }
  score += storyBoost(e);
  if (score === (e.priorityScore || 0) && e.category === (item.category || e.category) && e.sentiment === (next.sentiment || e.sentiment)) {
    return e;
  }
  return { ...e, priorityScore: score };
}

module.exports = { ...editorial, enrich, storyBoost };
