/**
 * Sammanfattningar för kort utan RSS-beskrivning (Google News upprepar bara rubriken).
 *
 * Ingen LLM används (ingen modellnyckel finns i projektets miljö). Därför översätts inget:
 * hämta utgivarens sida och ta og:description / meta description ordagrant (förkortad vid meningsgräns).
 * Hittas ingen användbar beskrivning lämnas summary tom (och döljs i UI) – ingen mallfyllnad, inget påhittat.
 */

const https = require('https');
const http = require('http');
const zlib = require('zlib');

const cacheKey = '__tekniknyheter_summaries__';
const FETCH_TIMEOUT_MS = 3000;
const CONCURRENCY = 6;
const MAX_PER_REFRESH = 40;
const MAX_FAILS = 3;
const BUDGET_MS = 6500;
const MAX_BYTES = 450 * 1024;
const MAX_LEN = 240;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const BOILERPLATE_RE =
  /cookie|javascript|subscribe|sign in|log in|logga in|prenumer|paywall|enable js|captcha|are you a robot|access denied|just a moment|all rights reserved|privacy policy|latest news,? (and|&)|breaking news,? (and|&)|key stats|stock price as of|price change for|your (source|home) for|^welcome to|leading (source|provider)/i;

// Insamlings-/prenumerationstext (t.ex. CleanTechnica: "Support our work ... Patreon") är aldrig en sammanfattning.
const SPAM_RE =
  /patreon|donat(e|ion)|fundrais|become a (member|supporter|patron)|\bsupport\b[^.]{0,40}\b(work|us|our|journalism|mission|independent)\b|\bsubscribe\b|substack/i;

const THIN_LEN = 60;
const REL_BUDGET_MS = 3000;
const REL_MAX_FETCH = 12;

function state() {
  if (!globalThis[cacheKey]) globalThis[cacheKey] = { byId: new Map(), imgs: new Map(), fails: new Map(), owners: new Map(), rel: new Map(), relFails: new Map(), lastStats: null };
  return globalThis[cacheKey];
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018',
  rdquo: '\u201d', ldquo: '\u201c', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
};

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => (ENTITIES[n.toLowerCase()] !== undefined ? ENTITIES[n.toLowerCase()] : m))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function metaContent(html, keyAttr, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const k = tag.match(new RegExp(`${keyAttr}\\s*=\\s*["']${key}["']`, 'i'));
    if (!k) continue;
    const c = tag.match(/content\s*=\s*"([^"]*)"/i) || tag.match(/content\s*=\s*'([^']*)'/i);
    if (c && c[1]) return decodeEntities(c[1]);
  }
  return '';
}

/** JSON-LD-noder (inkl. @graph) från sidan; trasig JSON hoppas över. */
function ldNodes(html) {
  const out = [];
  const scripts = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  const walk = (n, depth) => {
    if (!n || typeof n !== 'object' || depth > 3) return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, depth + 1));
    out.push(n);
    if (n['@graph']) walk(n['@graph'], depth + 1);
  };
  for (const sc of scripts) {
    try {
      walk(JSON.parse(sc.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '')), 0);
    } catch (_) {
      /* hoppa över */
    }
  }
  // Bara artikeltyper: Organization/WebSite-beskrivningar är sidans, inte artikelns.
  return out.filter((n) => /Article|Posting|Report/i.test(JSON.stringify(n['@type'] || '')));
}

/** Första stycket i artikeln (minst 80 tecken, utan länk-/menytext). */
function firstParagraph(html) {
  const ps = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || [];
  for (const p of ps.slice(0, 15)) {
    const t = decodeEntities(p);
    if (t.length >= 80 && !BOILERPLATE_RE.test(t) && !SPAM_RE.test(t)) return t;
  }
  return '';
}

/** Beskrivning och vilken metod som gav den: og, twitter, meta, jsonld eller p (första stycket). */
function descriptionVia(html) {
  const tries = [
    ['og', () => metaContent(html, 'property', 'og:description')],
    ['twitter', () => metaContent(html, 'name', 'twitter:description')],
    ['meta', () => metaContent(html, 'name', 'description')],
    ['jsonld', () => decodeEntities((ldNodes(html).find((n) => typeof n.description === 'string' && n.description) || {}).description)],
    ['p', () => firstParagraph(html)],
  ];
  for (const [via, fn] of tries) {
    const text = fn();
    if (text) return { text, via };
  }
  return { text: '', via: '' };
}

function extractDescription(html) {
  return descriptionVia(html).text;
}

/** image ur JSON-LD (sträng, {url} eller lista). */
function ldImage(html) {
  for (const n of ldNodes(html)) {
    const im = Array.isArray(n.image) ? n.image[0] : n.image;
    const u = typeof im === 'string' ? im : im && im.url;
    if (typeof u === 'string' && u) return u;
  }
  return '';
}

/** og:image (eller twitter:image) som absolut https-URL; relativa URL:er löses mot sidans adress, http och data: förkastas. */
function extractImage(html, baseUrl) {
  const raw =
    metaContent(html, 'property', 'og:image:secure_url') ||
    metaContent(html, 'property', 'og:image') ||
    metaContent(html, 'name', 'twitter:image') ||
    metaContent(html, 'name', 'twitter:image:src') ||
    ldImage(html);
  if (!raw) return '';
  try {
    const u = new URL(raw, baseUrl);
    return u.protocol === 'https:' && u.href.length < 600 ? u.href : '';
  } catch (_) {
    return '';
  }
}

/** Sant när en description-metatagg hunnit läsas in helt (taggen kan ligga efter </head> i t.ex. Next.js). */
function descriptionComplete(html) {
  return /<meta\b[^>]*(og:description|name=["']description["'])[^>]*>/i.test(html);
}

function words(text) {
  return new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9åäö]+/i)
      .filter((w) => w.length >= 4)
      .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
  );
}

function overlap(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function cleanDescription(text, item) {
  let t = String(text || '').replace(/^key takeaways\s*/i, '').replace(/\s+/g, ' ').trim();
  // Ta bort avslutande " | Utgivare" / " - Utgivare" om det är utgivarnamnet.
  const m = t.match(/^(.*\S)\s+[|\u2013\u2014-]\s+([^|\u2013\u2014-]{2,40})$/);
  if (m) {
    const n = (x) => String(x).toLowerCase().replace(/[^a-z0-9åäö]+/g, '');
    const tail = n(m[2]);
    const src = n(item.source || '');
    if (tail && src && (src.includes(tail) || tail.includes(src))) t = m[1];
  }
  return t;
}

function shorten(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= MAX_LEN) return t;
  const cut = t.slice(0, MAX_LEN);
  const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentenceEnd >= 80) return cut.slice(0, sentenceEnd + 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\-\u2013\u2014\s]+$/, '')}\u2026`;
}

/** Returnerar en användbar beskrivning eller '' om den ser ut som sidmall/ej hör till rubriken. */
function usableDescription(desc, item) {
  const text = cleanDescription(desc, item);
  if (text.length < 40) return '';
  if (BOILERPLATE_RE.test(text) || SPAM_RE.test(text)) return '';
  const wt = words(item.title);
  const wd = words(text);
  // Hela beskrivningen får inte bara vara rubriken igen.
  if (wt.size && overlap(wt, wd) / wt.size > 0.9 && text.length < String(item.title || '').length + 25) return '';
  return shorten(text);
}

/** Egen GET med node:https: tål långa svarshuvuden (Yahoo) som fetch/undici avvisar. Följer upp till 3 omdirigeringar. */
function httpGetHead(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(
      u,
      {
        method: 'GET',
        maxHeaderSize: 128 * 1024,
        timeout: FETCH_TIMEOUT_MS,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(httpGetHead(new URL(res.headers.location, u).toString(), redirects - 1));
        }
        const type = String(res.headers['content-type'] || '');
        if (status !== 200 || (type && !/html/i.test(type))) {
          res.resume();
          return resolve({ status: status === 200 ? 'not_html' : status, html: '' });
        }
        const enc = String(res.headers['content-encoding'] || '').toLowerCase();
        let stream = res;
        if (enc === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br') stream = res.pipe(zlib.createBrotliDecompress());
        const dec = new TextDecoder('utf-8');
        let html = '';
        let bytes = 0;
        let finished = false;
        const done = () => {
          if (finished) return;
          finished = true;
          req.destroy();
          resolve({ status: 200, html, url: u.toString() });
        };
        stream.on('data', (chunk) => {
          bytes += chunk.length;
          html += dec.decode(chunk, { stream: true });
          if (bytes > MAX_BYTES || (descriptionComplete(html) && extractDescription(html) && (extractImage(html, url) || /<\/head>/i.test(html)))) done();
        });
        stream.on('end', done);
        stream.on('error', done);
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => reject(e));
    req.end();
  });
}

async function fetchDescription(url, title) {
  const res = await Promise.race([
    httpGetHead(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT_MS + 500)),
  ]);
  const html = res.html || '';
  let { text: desc, via } = descriptionVia(html);
  // JSON-LD och första stycket måste dela minst ett ord med rubriken (annars kan det vara fel text).
  if ((via === 'p' || via === 'jsonld') && title && !overlap(words(title), words(desc))) desc = '';
  return { status: res.status, desc, via: desc ? via : '', image: extractImage(html, res.url || url) };
}

function isGoogleUrl(url) {
  return /^https?:\/\/news\.google\.com\//i.test(String(url || ''));
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
      if (!it.url || isGoogleUrl(it.url) || (st.fails.get(it.id) || 0) >= MAX_FAILS) return false;
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
    if (!hit && !it.summary) {
      const teaser = titleTeaser(it.title);
      if (teaser) hit = { summary: teaser, summarySource: 'title', summaryLang: it.lang === 'sv' ? 'sv' : 'en' };
    }
    const img = !it.imageUrl && st.imgs.get(it.id);
    if (!hit && !img) return it;
    return { ...it, ...(hit || {}), ...(img ? { imageUrl: img, imageSource: 'page' } : {}) };
  });
}

/**
 * Sista utväg: delen efter första kolon/tankstreck/streck i rubriken (rubrikens egna ord, inga nya påståenden).
 * Returnerar '' om rubriken saknar sådan del eller om den är för kort.
 */
function titleTeaser(title) {
  const str = String(title || '');
  // Fallback: del efter ett bindeord (amid/after/while/despite ...), rubrikens egna ord.
  const m = str.match(/^.{3,}?(?::\s+|\s[\u2013\u2014-]\s|\s\|\s)(.+)$/) || str.match(/^.{12,}?\s(?:amid|after|while|despite|following|by)\s(.+)$/i);
  if (!m) return '';
  const t = m[1].trim().replace(/^\S/, (c) => c.toUpperCase());
  return t.length >= 25 && t.length <= MAX_LEN ? t : '';
}

function summaryStats() {
  const st = state();
  return { cached: st.byId.size, last: st.lastStats };
}

module.exports = { SPAM_RE, extractImage, fetchDescription, fillSummaries, summaryStats, usableDescription, extractDescription };
