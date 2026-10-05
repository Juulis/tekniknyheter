const { isWeakSource } = require('./sources_rss');

const resolveKey = '__tekniknyheter_gnews_resolved__';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const RESOLVE_TIMEOUT_MS = 4000;
const RESOLVE_CONCURRENCY = 4;
const RESOLVE_MAX_PER_REFRESH = 70;
// Tidsbudgeten ryms inom maxDuration (30 s i vercel.json): flöden ~1-2 s + upplösning 14 s + sammanfattningar ~5,5 s.
const RESOLVE_BUDGET_MS = 14000;
const RESOLVE_COOLDOWN_MS = 10 * 60 * 1000;

function resolveState() {
  if (!globalThis[resolveKey]) {
    globalThis[resolveKey] = { urls: new Map(), fails: new Map(), blockedUntil: 0, lastStats: null };
  }
  return globalThis[resolveKey];
}

function googleArticleId(link) {
  const m = String(link || '').match(/^https?:\/\/news\.google\.com\/(?:rss\/)?articles\/([^?/#]+)/i);
  return m ? m[1] : '';
}

class RateLimited extends Error {}

async function timedFetch(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS) });
  if (res.status === 429) throw new RateLimited('429');
  return res;
}

async function resolveGoogleArticle(id) {
  const page = await timedFetch(`https://news.google.com/articles/${id}`, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'en-US,en;q=0.9' },
  });
  if (!page.ok) return '';
  const html = await page.text();
  const sg = html.match(/data-n-a-sg="([^"]+)"/);
  const ts = html.match(/data-n-a-ts="([^"]+)"/);
  if (!sg || !ts) return '';
  const inner = JSON.stringify([
    'garturlreq',
    [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
    id,
    Number(ts[1]),
    sg[1],
  ]);
  const freq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]]);
  const res = await timedFetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': BROWSER_UA },
    body: `f.req=${encodeURIComponent(freq)}`,
  });
  if (!res.ok) return '';
  const text = (await res.text()).replace(/^\)\]\}'\s*/, '');
  for (const line of text.split('\n')) {
    if (!line.startsWith('[')) continue;
    try {
      for (const env of JSON.parse(line)) {
        if (Array.isArray(env) && env[0] === 'wrb.fr' && env[1] === 'Fbv4je' && env[2]) {
          const payload = JSON.parse(env[2]);
          if (payload[0] === 'garturlres' && /^https?:\/\//i.test(payload[1] || '')) return payload[1];
        }
      }
    } catch (_) {
      /* ignorera rader som inte är JSON */
    }
  }
  return '';
}

/** Löser upp några fler Google-länkar per refresh. Cache överlever mellan refreshar (globalThis). */
async function resolveBatch(items) {
  const st = resolveState();
  const stats = { attempted: 0, resolved: 0, failed: 0, rateLimited: false, skippedCooldown: false };
  st.lastStats = stats;
  if (Date.now() < st.blockedUntil) {
    stats.skippedCooldown = true;
    return;
  }
  const todo = items
    .map((it) => ({ it, gid: googleArticleId(it.originalUrl) }))
    .filter(({ gid }) => gid && !st.urls.has(gid) && (st.fails.get(gid) || 0) < 2)
    .slice(0, RESOLVE_MAX_PER_REFRESH);
  const started = Date.now();
  let cursor = 0;
  let abort = false;
  async function worker() {
    while (!abort && cursor < todo.length && Date.now() - started < RESOLVE_BUDGET_MS) {
      const { gid } = todo[cursor++];
      stats.attempted++;
      try {
        const url = await resolveGoogleArticle(gid);
        if (url) {
          st.urls.set(gid, url);
          stats.resolved++;
        } else {
          st.fails.set(gid, (st.fails.get(gid) || 0) + 1);
          stats.failed++;
        }
      } catch (err) {
        if (err instanceof RateLimited) {
          abort = true;
          stats.rateLimited = true;
          st.blockedUntil = Date.now() + RESOLVE_COOLDOWN_MS;
        } else {
          st.fails.set(gid, (st.fails.get(gid) || 0) + 1);
          stats.failed++;
        }
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  await Promise.all(Array.from({ length: RESOLVE_CONCURRENCY }, worker));
}

function applyResolved(items) {
  const st = resolveState();
  const out = [];
  for (const item of items) {
    const gid = googleArticleId(item.originalUrl);
    const real = gid && st.urls.get(gid);
    if (real) {
      const next = { ...item, url: real, urlResolved: true };
      if (isWeakSource(next)) continue;
      out.push(next);
    } else {
      out.push(item);
    }
  }
  return out;
}

/** Upplösta länkar för "Också i": bara utgivar-URL:er som lyckats lösas upp (aldrig Google-länkar). */
function applyResolvedRelated(items) {
  const st = resolveState();
  return items.map((item) => {
    if (!Array.isArray(item.alsoIn)) return item;
    const related = [];
    for (const r of item.alsoIn) {
      const gid = googleArticleId(r.originalUrl || r.url);
      const url = gid ? st.urls.get(gid) : r.url;
      if (!url || googleArticleId(url) || url === item.url) continue;
      const next = { source: r.source, url, title: r.title };
      if (isWeakSource(next)) continue;
      related.push(next);
    }
    const { alsoIn, ...rest } = item;
    return related.length ? { ...rest, alsoIn: related } : rest;
  });
}

function resolveStats() {
  const st = resolveState();
  return { cached: st.urls.size, blockedUntil: st.blockedUntil, last: st.lastStats };
}


module.exports = {
  resolveBatch,
  applyResolved,
  applyResolvedRelated,
  resolveStats,
  googleArticleId,
  resolveState,
};
