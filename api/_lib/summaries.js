/**
 * Sammanfattningar för kort utan RSS-beskrivning (Google News upprepar bara rubriken).
 *
 * Ingen LLM används (ingen modellnyckel finns i projektets miljö). Därför översätts inget:
 * hämta utgivarens sida och ta og:description / meta description ordagrant (förkortad vid meningsgräns).
 * Hittas ingen användbar beskrivning lämnas summary tom (och döljs i UI) – ingen mallfyllnad, inget påhittat.
 */
const { SPAM_RE, MAX_LEN, extractImage, extractDescription, usableDescription, shorten } = require('./summaries_html');
const { fetchDescription, isGoogleUrl, skipSummaryFetch } = require('./summaries_http');

const cacheKey = '__tekniknyheter_summaries__';
const CONCURRENCY = 6;
const MAX_PER_REFRESH = 40;
const MAX_FAILS = 3;
const BUDGET_MS = 6500;
const THIN_LEN = 60;
const REL_BUDGET_MS = 3000;
const REL_MAX_FETCH = 12;

function state() {
  if (!globalThis[cacheKey]) globalThis[cacheKey] = { byId: new Map(), imgs: new Map(), fails: new Map(), owners: new Map(), rel: new Map(), relFails: new Map(), lastStats: null };
  return globalThis[cacheKey];
}

const relHost = (url) => {
  try {
    return new URL(url).hostname;
  } catch (_) {
    return '';
  }
};

/**
 * Reserv via "Också i"-länkarna (samma story hos andra utgivare): saknad eller tunn (<60 tecken) summary
 * ersätts av utgivarens egen beskrivning därifrån, och saknad bild av deras bild. Ingen LLM, inget påhittat.
 */
async function fillFromRelated(wanted, st, stats) {
  const curSummary = (it) => (st.byId.get(it.id) || {}).summary || it.summary || '';
  const urlsOf = (it) => (it.alsoIn || []).map((r) => r.url).filter((u) => u && !isGoogleUrl(u) && (st.relFails.get(u) || 0) < 2).slice(0, 3);
  const needs = (it) => curSummary(it).length < THIN_LEN || (!it.imageUrl && !st.imgs.get(it.id));
  const cands = wanted.filter((it) => needs(it) && urlsOf(it).length);

  const todo = [];
  const titleOf = new Map();
  for (const it of cands) {
    for (const u of urlsOf(it)) {
      if (!titleOf.has(u)) titleOf.set(u, it.title);
      if (!st.rel.has(u) && !todo.includes(u)) todo.push(u);
    }
  }
  const queue = todo.slice(0, REL_MAX_FETCH);
  const started = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length && Date.now() - started < REL_BUDGET_MS) {
      const u = queue[cursor++];
      try {
        const r = await fetchDescription(u, titleOf.get(u));
        if (r.status === 200) st.rel.set(u, { desc: r.desc, via: r.via, image: r.image });
        else st.relFails.set(u, (st.relFails.get(u) || 0) + 1);
      } catch (_) {
        st.relFails.set(u, (st.relFails.get(u) || 0) + 1);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  stats.relFetched = cursor;

  for (const it of cands) {
    const pages = urlsOf(it).map((u) => ({ u, p: st.rel.get(u) })).filter((x) => x.p);
    const old = curSummary(it);
    if (old.length < THIN_LEN) {
      for (const { u, p } of pages) {
        const text = usableDescription(p.desc, it);
        if (!text || text.length < THIN_LEN || text.length <= old.length + 15) continue;
        const owner = st.owners.get(text);
        if (owner && owner !== it.id) continue;
        st.owners.set(text, it.id);
        st.byId.set(it.id, { summary: text, summarySource: 'related', summaryVia: p.via, summaryLang: /\.se$/i.test(relHost(u)) ? 'sv' : 'en', upgraded: true });
        stats[old ? 'upgradedThin' : 'fromRelated'] = (stats[old ? 'upgradedThin' : 'fromRelated'] || 0) + 1;
        break;
      }
    }
    if (!it.imageUrl && !st.imgs.get(it.id)) {
      const withImg = pages.find((x) => x.p.image);
      if (withImg) {
        st.imgs.set(it.id, withImg.p.image);
        stats.imagesFromRelated = (stats.imagesFromRelated || 0) + 1;
      }
    }
  }
}

/**
 * Fyller i summary för de första `top` korten som saknar den. Muterar inte indata – returnerar nya objekt.
 * Cache per kort-id i globalThis; max MAX_PER_REFRESH sidhämtningar per anrop.
 */
async function fillSummaries(items, { top = 40 } = {}) {
  const st = state();
  const stats = { attempted: 0, fromPage: 0, failed: 0, reasons: {} };
  st.lastStats = stats;
  const why = (r) => {
    stats.reasons[r] = (stats.reasons[r] || 0) + 1;
  };

  const wanted = items.slice(0, top);
  // En sidhämtning ger både beskrivning och bild: hämta för kort som saknar något av dem (cache per id, MAX_FAILS försök).
  const todo = wanted
    .filter((it) => {
      if (!it.url || isGoogleUrl(it.url) || skipSummaryFetch(it.url) || (st.fails.get(it.id) || 0) >= MAX_FAILS) return false;
      const needSum = !it.summary && !st.byId.has(it.id);
      const needImg = !it.imageUrl && !st.imgs.has(it.id);
      return needSum || needImg;
    })
    .slice(0, MAX_PER_REFRESH);

  const started = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length && Date.now() - started < BUDGET_MS) {
      const it = todo[cursor++];
      stats.attempted++;
      try {
        const { status, desc, via, image } = await fetchDescription(it.url, it.title);
        if (status === 200) st.imgs.set(it.id, image || '');
        else st.fails.set(it.id, (st.fails.get(it.id) || 0) + 1);
        if (image) stats.images = (stats.images || 0) + 1;
        if (it.summary || st.byId.has(it.id)) continue;
        const text = usableDescription(desc, it);
        // Samma text på flera kort = sidans generiska beskrivning, inte artikelns.
        const owner = text && st.owners.get(text);
        if (text && owner && owner !== it.id) {
          st.fails.set(it.id, MAX_FAILS);
          why('generic_description');
        } else if (text) {
          st.owners.set(text, it.id);
          st.byId.set(it.id, { summary: text, summarySource: 'page', summaryVia: via, summaryLang: it.lang === 'sv' ? 'sv' : 'en' });
          stats.fromPage++;
        } else {
          if (status === 200) st.fails.set(it.id, (st.fails.get(it.id) || 0) + 1);
          why(status === 200 ? (desc ? 'description_rejected' : 'no_description') : `http_${status}`);
        }
      } catch (err) {
        st.fails.set(it.id, (st.fails.get(it.id) || 0) + 1);
        stats.failed++;
        why(String((err && (err.code || err.message)) || 'error').slice(0, 30));
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  try {
    await fillFromRelated(wanted, st, stats);
  } catch (_) {
    /* behåll det som redan finns */
  }

  return items.map((it, idx) => {
    if (idx >= top) return it;
    const found = st.byId.get(it.id);
    let hit = found && (!it.summary || found.upgraded) ? found : null;
    // Ordning vid saknad/tunn summary: cachad/sida/alsoIn (ovan) → RSS-teaser → rubrikteaser (sista utväg).
    if (!hit && !it.summary && it.rssTeaser) {
      const text = usableDescription(it.rssTeaser, it) || (String(it.rssTeaser).length >= 50 ? shorten(String(it.rssTeaser)) : '');
      if (text) hit = { summary: text, summarySource: 'rss', summaryLang: it.lang === 'sv' ? 'sv' : 'en' };
    }
    if (!hit && !it.summary) {
      const teaser = titleTeaser(it.title);
      if (teaser) hit = { summary: teaser, summarySource: 'title', summaryLang: it.lang === 'sv' ? 'sv' : 'en' };
    }
    const img = !it.imageUrl && st.imgs.get(it.id);
    if (!hit && !img) {
      if (!it.rssTeaser) return it;
      const { rssTeaser, ...rest } = it;
      return rest;
    }
    const { rssTeaser, ...rest } = it;
    return { ...rest, ...(hit || {}), ...(img ? { imageUrl: img, imageSource: 'page' } : {}) };
  });
}

/**
 * Sista utväg: delen efter första kolon/tankstreck/streck i rubriken (rubrikens egna ord, inga nya påståenden).
 * Returnerar '' om rubriken saknar sådan del eller om den är för kort.
 */
function titleTeaser(title) {
  const str = String(title || '');
  // Fallback: del efter ett bindeord (amid/after/while/despite ...), rubrikens egna ord.
  const m =
    str.match(/^.{3,}?(?::\s+|\s[\u2013\u2014-]\s|\s\|\s)(.+)$/) ||
    str.match(/^.{12,}?\s(?:amid|after|while|despite|following|by)\s(.+)$/i) ||
    // "as" bara när det följs av stor bokstav ("... as Earnings Season ..."), inte "as expected".
    str.match(/^.{12,}?\sas\s([A-Z].+)$/) ||
    // Komma följt av blanksteg (inte "$4,999"): delen efter kommat om den är en egen mening.
    str.match(/^.{12,}?,\s+(.+)$/);
  if (!m) return '';
  const t = m[1].trim().replace(/^\S/, (c) => c.toUpperCase());
  return t.length >= 20 && t.length <= MAX_LEN ? t : '';
}

function summaryStats() {
  const st = state();
  return { cached: st.byId.size, last: st.lastStats };
}

module.exports = { SPAM_RE, extractImage, fetchDescription, fillSummaries, summaryStats, usableDescription, extractDescription, skipSummaryFetch };
