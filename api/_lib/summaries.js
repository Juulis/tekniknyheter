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
const CONCURRENCY = 4;
const MAX_PER_REFRESH = 20;
const MAX_FAILS = 3;
const BUDGET_MS = 5500;
const MAX_BYTES = 450 * 1024;
const MAX_LEN = 240;
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const BOILERPLATE_RE =
  /cookie|javascript|subscribe|sign in|log in|logga in|prenumer|paywall|enable js|captcha|are you a robot|access denied|just a moment|all rights reserved|privacy policy|latest news,? (and|&)|breaking news,? (and|&)|key stats|stock price as of|price change for|your (source|home) for|^welcome to|leading (source|provider)/i;

function state() {
  if (!globalThis[cacheKey]) globalThis[cacheKey] = { byId: new Map(), fails: new Map(), owners: new Map(), lastStats: null };
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

function extractDescription(html) {
  return (
    metaContent(html, 'property', 'og:description') ||
    metaContent(html, 'name', 'twitter:description') ||
    metaContent(html, 'name', 'description')
  );
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
  if (BOILERPLATE_RE.test(text)) return '';
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
          resolve({ status: 200, html });
        };
        stream.on('data', (chunk) => {
          bytes += chunk.length;
          html += dec.decode(chunk, { stream: true });
          if (bytes > MAX_BYTES || (descriptionComplete(html) && extractDescription(html))) done();
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

async function fetchDescription(url) {
  const res = await Promise.race([
    httpGetHead(url),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), FETCH_TIMEOUT_MS + 500)),
  ]);
  return { status: res.status, desc: extractDescription(res.html || '') };
}

function isGoogleUrl(url) {
  return /^https?:\/\/news\.google\.com\//i.test(String(url || ''));
}

/**
 * Fyller i summary för de första `top` korten som saknar den. Muterar inte indata – returnerar nya objekt.
 * Cache per kort-id i globalThis; max MAX_PER_REFRESH sidhämtningar per anrop.
 */
async function fillSummaries(items, { top = 25 } = {}) {
  const st = state();
  const stats = { attempted: 0, fromPage: 0, failed: 0, reasons: {} };
  st.lastStats = stats;
  const why = (r) => {
    stats.reasons[r] = (stats.reasons[r] || 0) + 1;
  };

  const wanted = items.slice(0, top);
  const todo = wanted
    .filter((it) => !it.summary && !st.byId.has(it.id) && it.url && !isGoogleUrl(it.url) && (st.fails.get(it.id) || 0) < MAX_FAILS)
    .slice(0, MAX_PER_REFRESH);

  const started = Date.now();
  let cursor = 0;
  async function worker() {
    while (cursor < todo.length && Date.now() - started < BUDGET_MS) {
      const it = todo[cursor++];
      stats.attempted++;
      try {
        const { status, desc } = await fetchDescription(it.url);
        const text = usableDescription(desc, it);
        // Samma text på flera kort = sidans generiska beskrivning, inte artikelns.
        const owner = text && st.owners.get(text);
        if (text && owner && owner !== it.id) {
          st.fails.set(it.id, MAX_FAILS);
          why('generic_description');
        } else if (text) {
          st.owners.set(text, it.id);
          st.byId.set(it.id, { summary: text, summarySource: 'page', summaryLang: it.lang === 'sv' ? 'sv' : 'en' });
          stats.fromPage++;
        } else {
          st.fails.set(it.id, (st.fails.get(it.id) || 0) + 1);
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

  return items.map((it, idx) => {
    if (it.summary || idx >= top) return it;
    const hit = st.byId.get(it.id);
    return hit ? { ...it, ...hit } : it;
  });
}

function summaryStats() {
  const st = state();
  return { cached: st.byId.size, last: st.lastStats };
}

module.exports = { fetchDescription, fillSummaries, summaryStats, usableDescription, extractDescription };
