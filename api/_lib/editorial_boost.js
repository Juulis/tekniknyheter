/**
 * Extra intern poäng och svenska positiva signalord (ingen UI-text).
 * Patchar enrich från editorial.js utan att skriva om hela filen.
 */
const editorial = require('./editorial');

const EXTRA_POS = /slog förväntningarna|högsta|highest since/i;

function storyBoost(item) {
  const title = String(item.title || '');
  let n = 0;
  if (/robotaxi/.test(title) && /sverige|sweden|ladda ner/i.test(title)) n += 28;
  if (/german registrations?/i.test(title) && /highest|hit high|since 2022/i.test(title)) n += 32;
  if (/200\s*miljarder|över 200 miljard|\b200\s*b(illion)?\b|\$200\s*b/i.test(title) && /jensen|huang|nvidia|förmögenhet/i.test(title)) n += 35;
  if (/slog förväntningarna/i.test(title) && /tesla|levererade|kvartalet/i.test(title)) n += 30;
  return n;
}

const origEnrich = editorial.enrich;
function enrich(item) {
  // Tvinga positiv sentiment för tydliga svenska signalord innan origEnrich (om inte redan satt).
  let next = item;
  if (!item.sentiment && EXTRA_POS.test(String(item.title || ''))) {
    next = { ...item, sentiment: 'positive' };
  }
  const e = origEnrich(next);
  const bonus = storyBoost(e);
  if (!bonus) return e;
  return { ...e, priorityScore: (e.priorityScore || 0) + bonus };
}

module.exports = { ...editorial, enrich, storyBoost };
