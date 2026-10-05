/**
 * "Dygnet på 60 sekunder": dagens nyhetspunkter från data/dygnet.json (uppdateras via GitHub).
 * Läses från raw.githubusercontent.com med kort cache i globalThis; fel ignoreras tyst.
 */
const crypto = require('crypto');
const { PRIORITY_TOPICS, detectTags, POLITICS_RE } = require('./editorial');
const { fetchDescription } = require('./summaries');

const RAW_URL = 'https://raw.githubusercontent.com/Juulis/tekniknyheter/main/data/dygnet.json';
const CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 3000;
const MAX_POSTS = 20;
const MAX_AGE_DAYS = 7;
const SOURCE_NAME = 'Dygnet på 60 sekunder';
const TZ = 'Europe/Stockholm';
const CATEGORIES = new Map([...PRIORITY_TOPICS.map((t) => t.category), 'Teknik', 'Politik'].map((c) => [c.toLowerCase(), c]));
// Kategorier som räknas som tekniskt ämne (Geopolitik/Teknik/Politik avgörs av texten).
const TECH_CATEGORIES = new Set(['Tesla', 'Elbilar', 'Elon Musk', 'NVIDIA', 'SpaceX', 'Neuralink', 'AI']);
const IMG_BUDGET_MS = 3500;
const IMG_MAX_TRIES = 3;

function ymdInStockholm(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// 12:00 svensk tid för ett YYYY-MM-DD (sommar-/vintertid avgörs genom att prova UTC 10 och 11).
function noonStockholm(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  for (const h of [10, 11]) {
    const cand = new Date(Date.UTC(y, m - 1, d, h));
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(cand));
    if (hour === 12) return cand;
  }
  return new Date(Date.UTC(y, m - 1, d, 11));
}

function dayNumber(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function validDate(value) {
  const s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
    return { ymd: s, at: noonStockholm(s) };
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    const at = new Date(s);
    if (Number.isNaN(at.getTime())) return null;
    return { ymd: ymdInStockholm(at), at };
  }
  return null;
}

function validUrl(value) {
  try {
    const u = new URL(String(value || '').trim());
    if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;
    if (/(^|\.)news\.google\.com$/i.test(u.hostname)) return null;
    const s = u.toString();
    return s.length <= 500 ? s : null;
  } catch (_) {
    return null;
  }
}

/** Validerar rådata och gör om giltiga poster till nyhetskort. Ogiltiga och för gamla/framtida ignoreras. */
function parseDygnet(raw, now = new Date()) {
  const list = Array.isArray(raw) ? raw : [];
  const today = dayNumber(ymdInStockholm(now));
  const out = [];
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
    const url = validUrl(r.sourceUrl);
    const when = validDate(r.date);
    if (!title || title.length > 160 || !summary || summary.length > 300 || !url || !when) continue;
    const age = today - dayNumber(when.ymd);
    if (age < 0 || age > MAX_AGE_DAYS) continue;
    const id = 'dygnet-' + crypto.createHash('sha1').update(when.ymd + title).digest('hex').slice(0, 10);
    if (seen.has(id)) continue;
    seen.add(id);
    let cat = CATEGORIES.get(String(r.category || '').trim().toLowerCase()) || 'Teknik';
    // Tekniskt ämne: kategori, annars ämnesträff i title+summary (inkl. chip/exportkontroll och AI-lagar).
    const tech = TECH_CATEGORIES.has(cat) || detectTags({ title, summary }).length > 0;
    // Politik utan tekniskt ämne ligger under Politik, inte Geopolitik (som är chip/exportkontroll/AI-lagar).
    if (!tech && (cat === 'Geopolitik' || cat === 'Politik' || (cat === 'Teknik' && POLITICS_RE.test(`${title} ${summary}`)))) cat = 'Politik';
    out.push({
      id,
      title,
      summary,
      url,
      source: SOURCE_NAME,
      category: cat,
      lang: 'sv',
      publishedAt: (when.at > now ? now : when.at).toISOString(),
      dygnet: true,
      dygnetAge: age,
      dygnetTech: tech,
    });
  }
  out.sort((a, b) => a.dygnetAge - b.dygnetAge || a.title.localeCompare(b.title, 'sv'));
  return out.slice(0, MAX_POSTS);
}

/** Bonus: dagens Dygnet behåller stark boost; gårdagens (≥1) sänkt så färska morgonnyheter går före. */
function dygnetBonus(item) {
  const tech = item.dygnetTech !== false;
  if (item.dygnetAge === 0) return tech ? 100 : 25;
  if (item.dygnetAge === 1) return tech ? 22 : 6;
  return 0;
}

/** og:image/twitter:image från sourceUrl (https), cache per id i globalThis. Saknas bild visas kategori-placeholder. */
async function addImages(items) {
  const cache = globalThis.__dygnetImgs || (globalThis.__dygnetImgs = new Map());
  const todo = items.filter((i) => {
    const c = cache.get(i.id);
    return !c || (!c.done && c.tries < IMG_MAX_TRIES);
  });
  const started = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length && Date.now() - started < IMG_BUDGET_MS) {
      const it = todo[cursor++];
      const c = cache.get(it.id) || { image: '', done: false, tries: 0 };
      try {
        const r = await fetchDescription(it.url, it.title);
        if (r.status === 200) {
          c.image = r.image || '';
          c.done = true;
        } else c.tries++;
      } catch (_) {
        c.tries++;
      }
      cache.set(it.id, c);
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  for (const it of items) {
    const c = cache.get(it.id);
    if (c && c.image) {
      it.imageUrl = c.image;
      it.imageSource = 'page';
    }
  }
}

async function fetchDygnet({ force = false } = {}) {
  const cache = globalThis.__dygnetCache;
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(force ? `${RAW_URL}?cb=${Date.now()}` : RAW_URL, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const items = parseDygnet(JSON.parse(await res.text()));
    try {
      await addImages(items);
    } catch (_) {
      /* kort utan bild får kategori-placeholder */
    }
    globalThis.__dygnetCache = { at: Date.now(), items };
    return items;
  } catch (_) {
    // Fel ignoreras tyst; senast lyckade läsning (om någon) behålls en stund till, annars inga poster.
    if (cache) globalThis.__dygnetCache = { at: Date.now() - CACHE_MS + 30000, items: cache.items };
    return cache ? cache.items : [];
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchDygnet, parseDygnet, dygnetBonus, SOURCE_NAME };
