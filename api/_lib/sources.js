const crypto = require('crypto');
const { enrich, matchesEditorialFocus, compareEditorial } = require('./editorial');
const { fillSummaries, summaryStats } = require('./summaries');

const FEEDS = [
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=Tesla+OR+Cybertruck+OR+Optimus+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=NVIDIA+OR+%22Jensen+Huang%22+OR+CUDA+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22Elon+Musk%22+OR+xAI+OR+Grok+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=SpaceX+OR+Starship+OR+Starlink+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=Neuralink+when:7d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22electric+vehicle%22+OR+EV+OR+elbilar+OR+supercharger+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=AI+regulation+OR+%22AI+Act%22+OR+%22chip+export%22+OR+%22export+controls%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22artificial+intelligence%22+breakthrough+OR+LLM+OR+%22open+source+AI%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News SE',
    url: 'https://news.google.com/rss/search?q=Tesla+OR+elbilar+OR+NVIDIA+OR+AI+when:3d&hl=sv&gl=SE&ceid=SE:sv',
  },
];

const cacheKey = '__tekniknyheter_sources_cache__';
const CACHE_MS = 10 * 60 * 1000;

const NEGATIVE_TITLE =
  /what could go wrong|slowdown|sales weaken|plunge|crash|lawsuit|fraud|hack|breach|layoff|ban\b|banned|recall|skandal|åtal|varsel|kryptospam|predicts solana|crypto pump/i;

/** Svaga/oönskade källor: matchas mot utgivarnamn och mot host (artikel-URL eller utgivarens hemsida). */
const WEAK_SOURCE_RE =
  /svt\s?play|shattered(\.io)?\b|off\s?grid\s?survival|offgridsurvival|\bbriefs\.co\b|blogspot|blogger\.com|wordpress\.com|tumblr|pinterest|quora|\bmedium\.com\b|\bprweb\b|\bopenpr\b|einpresswire|\bnewsbreak\b|\bscoop\.it\b/i;
const WEAK_HOST_RE =
  /(^|\.)(svtplay\.se|shattered\.io|offgridsurvival\.com|briefs\.co|blogspot\.[a-z.]+|blogger\.com|wordpress\.com|tumblr\.com|pinterest\.[a-z.]+|quora\.com|medium\.com|prweb\.com|openpr\.com|einpresswire\.com|newsbreak\.com|scoop\.it)$/i;

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return '';
  }
}

function isWeakSource(item) {
  if (WEAK_SOURCE_RE.test(String(item.source || ''))) return true;
  for (const u of [item.url, item.sourceUrl]) {
    const host = hostOf(u);
    if (host && WEAK_HOST_RE.test(host)) return true;
  }
  return false;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function stripHtml(value) {
  return decodeXml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function attrValue(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["'][^>]*/?>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function extractImage(block, description) {
  const candidates = [
    attrValue(block, 'media:content', 'url'),
    attrValue(block, 'media:thumbnail', 'url'),
    attrValue(block, 'enclosure', 'url'),
  ].filter(Boolean);

  const imgInDesc = String(description || '').match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgInDesc) candidates.push(decodeXml(imgInDesc[1]));

  for (const url of candidates) {
    if (/^https?:\/\//i.test(url) && !/\.(mp3|mp4|m4a|aac)(\?|$)/i.test(url)) {
      return url;
    }
  }
  return '';
}

function splitTitleAndPublisher(rawTitle) {
  const title = stripHtml(rawTitle);
  const parts = title.split(/\s+[-–—]\s+/);
  if (parts.length < 2) return { title, publisher: '' };
  const publisher = parts[parts.length - 1].trim();
  const headline = parts.slice(0, -1).join(' - ').trim();
  if (publisher.length < 2 || publisher.length > 80 || !headline) {
    return { title, publisher: '' };
  }
  return { title: headline, publisher };
}

function cleanSummary(summary, title, publisher) {
  let text = stripHtml(summary);
  if (!text) return '';
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9åäö]+/gi, ' ').trim();
  const nTitle = norm(title);
  const nText = norm(text);
  if (!nText) return '';
  if (nTitle && (nText === nTitle || nText.startsWith(nTitle))) {
    const rest = text.slice(title.length).replace(/^[\s\-–—:]+/, '').trim();
    text = rest;
  }
  if (publisher) {
    const nPub = norm(publisher);
    if (norm(text) === nPub || norm(text).endsWith(nPub)) {
      text = text.replace(new RegExp(`(?:\\s*[-–—]?\\s*)?${publisher.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i'), '').trim();
    }
  }
  if (!text || (nTitle && norm(text) === nTitle)) return '';
  if (text.length < 24) return '';
  return text.slice(0, 280);
}

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

function parseRssItems(xml, feedLabel) {
  const items = [];
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const rawTitle = tagValue(block, 'title');
    const { title, publisher } = splitTitleAndPublisher(rawTitle);
    const link = stripHtml(tagValue(block, 'link'));
    const rawDescription = tagValue(block, 'description');
    const summary = cleanSummary(rawDescription, title, publisher);
    const pubDate = stripHtml(tagValue(block, 'pubDate'));
    const imageUrl = extractImage(block, rawDescription);
    const sourceFromXml = stripHtml(tagValue(block, 'source'));
    const url = pickBestUrl(block, link);
    const sourceUrl = attrValue(block, 'source', 'url');
    if (!title || !url) continue;
    if (NEGATIVE_TITLE.test(title)) continue;
    if (/\bbritannica\b|encyclopedia|wiki\b/i.test(title + ' ' + url + ' ' + (publisher || ''))) continue;

    const source = publisher || sourceFromXml || feedLabel;
    if (isWeakSource({ source, url, sourceUrl })) continue;
    items.push({
      id: stableId(url),
      title,
      summary,
      url,
      sourceUrl: sourceUrl || undefined,
      source,
      imageUrl: imageUrl || undefined,
      lang: /[\u00c0-\u024f]|å|ä|ö/i.test(title) && /\b(och|för|att|är|på)\b/i.test(title) ? 'sv' : 'en',
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
    });
  }
  return items;
}

async function fetchFeed(feed) {
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': 'TekniknyheterBot/1.0 (+https://juulis.github.io/tekniknyheter/)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
  });
  if (!res.ok) {
    throw new Error(`${feed.source} ${res.status}`);
  }
  const xml = await res.text();
  return parseRssItems(xml, feed.source);
}

const JACCARD_THRESHOLD = 0.5;
// Lägre tröskel gäller bara klustring (aldrig för att tappa en nyhet) och kräver samma kategori, minst tre gemensamma ord och en gemensam nyckelentitet.
const CLUSTER_THRESHOLD = 0.4;
const MAX_RELATED = 3;
const KEY_ENTITY_RE =
  /\b(tesla|cybertruck|optimus|nvidia|nvda|jensen|huang|musk|spacex|starship|starlink|grok|xai|openai|anthropic|neuralink|maduro|trump|google|alphabet|amd|intel|tsmc|waymo|rivian|byd|ford|gm)\b/gi;

function keyEntities(title) {
  return new Set((String(title || '').toLowerCase().match(KEY_ENTITY_RE) || []));
}

function sharedCount(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

function sameStory(cand, kept) {
  const j = jaccard(cand.tokens, kept.tokens);
  if (j >= JACCARD_THRESHOLD) return true;
  if (j < CLUSTER_THRESHOLD) return false;
  if ((cand.item.category || '') !== (kept.item.category || '')) return false;
  const opposite =
    (cand.item.sentiment === 'positive' && kept.item.sentiment === 'negative') ||
    (cand.item.sentiment === 'negative' && kept.item.sentiment === 'positive');
  if (opposite) return false;
  if (sharedCount(cand.tokens, kept.tokens) < 3) return false;
  return sharedCount(keyEntities(cand.item.title), keyEntities(kept.item.title)) > 0;
}

function toRelated(it) {
  return { source: it.source, url: it.url, title: it.title, originalUrl: it.originalUrl || it.url };
}

const byScore = (a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || new Date(b.publishedAt) - new Date(a.publishedAt);

/**
 * Slår ihop dubbletter och nära-dubbletter till kluster: en primär nyhet (högst priorityScore) plus
 * alsoIn: [{ source, url, title }] för övriga utgivare (max 3, en per utgivare). Inget tappas utan spår.
 */
function dedupeItems(items) {
  const groups = new Map();
  for (const item of items) {
    const key = normalizeDedupeKey(item.title) || (item.url || '').toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const heads = [];
  for (const group of groups.values()) {
    group.sort(byScore);
    const [head, ...rest] = group;
    const extras = [...(head.alsoIn || []), ...rest.map(toRelated), ...rest.flatMap((r) => r.alsoIn || [])];
    heads.push({ item: head, extras });
  }
  heads.sort((a, b) => byScore(a.item, b.item));

  const kept = [];
  for (const h of heads) {
    const cand = { item: h.item, tokens: titleTokens(h.item.title), extras: h.extras };
    const into = kept.find((k) => sameStory(cand, k));
    if (into) {
      into.extras.push(toRelated(h.item), ...h.extras);
    } else {
      kept.push(cand);
    }
  }

  return kept.map(({ item, extras }) => {
    const seen = new Set([String(item.source || '').toLowerCase()]);
    const related = [];
    for (const r of extras) {
      const src = String(r.source || '').toLowerCase();
      if (!r.url || seen.has(src)) continue;
      seen.add(src);
      related.push(r);
      if (related.length >= MAX_RELATED) break;
    }
    const { alsoIn, ...rest } = item;
    return related.length ? { ...rest, alsoIn: related } : rest;
  });
}

/** Mjuk kategorikvotering: högst ~25% per kategori först, resten fylls på i poängordning. */
function diversify(sorted, limit, maxShare = 0.25) {
  const cap = Math.max(1, Math.ceil(limit * maxShare));
  const counts = new Map();
  const picked = [];
  const deferred = [];
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const cat = item.category || 'Teknik';
    if ((counts.get(cat) || 0) < cap) {
      counts.set(cat, (counts.get(cat) || 0) + 1);
      picked.push(item);
    } else {
      deferred.push(item);
    }
  }
  for (const item of deferred) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked.sort(compareEditorial);
}

/* ---------- Google News-länkar -> riktiga utgivar-URL:er ---------- */

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

async function fetchLiveArticles({ force = false } = {}) {
  const now = Date.now();
  if (!force && globalThis[cacheKey] && now - globalThis[cacheKey].at < CACHE_MS) {
    return globalThis[cacheKey].items;
  }

  const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
  const collected = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') collected.push(...result.value);
  }

  const enriched = [];
  for (const raw of collected) {
    const item = enrich({ ...raw, originalUrl: raw.url });
    // Negativa rubriker göms inte längre; de rankas ned i editorial.js. Bara NEGATIVE_TITLE (skräp/spam) sorteras bort.
    if (!matchesEditorialFocus(item, { preferPositive: false })) continue;
    if (NEGATIVE_TITLE.test(item.title || '')) continue;
    enriched.push(item);
  }

  const clustered = dedupeItems(enriched).sort(compareEditorial);
  const top = diversify(clustered, 40);
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
  globalThis[cacheKey] = { at: now, items };
  return items;
}

function resolveStats() {
  const st = resolveState();
  return { cached: st.urls.size, blockedUntil: st.blockedUntil, last: st.lastStats };
}

module.exports = { fetchLiveArticles, resolveStats, summaryStats, dedupeItems, titleTokens, jaccard, isWeakSource, FEEDS, cleanSummary, normalizeDedupeKey, splitTitleAndPublisher };
