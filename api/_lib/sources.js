const { enrich, matchesEditorialFocus, compareEditorial } = require('./editorial');

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

function pickBestUrl(block, link) {
  const guid = stripHtml(tagValue(block, 'guid'));
  const atomLink = attrValue(block, 'link', 'href');
  const sourceUrl = attrValue(block, 'source', 'url');
  for (const candidate of [link, atomLink, guid, sourceUrl]) {
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return link || '';
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
    if (!title || !url) continue;
    if (NEGATIVE_TITLE.test(title)) continue;
    if (/\bbritannica\b|encyclopedia|wiki\b/i.test(title + ' ' + url + ' ' + (publisher || ''))) continue;

    const source = publisher || sourceFromXml || feedLabel;
    items.push({
      id: `rss-${Buffer.from(url).toString('base64url').slice(0, 24)}`,
      title,
      summary,
      url,
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

function dedupeItems(items) {
  const byKey = new Map();
  for (const item of items) {
    const key = normalizeDedupeKey(item.title) || (item.url || '').toLowerCase();
    if (!key) continue;
    const prev = byKey.get(key);
    if (!prev || (item.priorityScore || 0) > (prev.priorityScore || 0)) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()];
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
    const item = enrich(raw);
    if (!matchesEditorialFocus(item, { preferPositive: true })) continue;
    if (item.sentiment === 'negative') continue;
    if (NEGATIVE_TITLE.test(item.title || '')) continue;
    enriched.push(item);
  }

  const items = dedupeItems(enriched).sort(compareEditorial).slice(0, 40);
  globalThis[cacheKey] = { at: now, items };
  return items;
}

module.exports = { fetchLiveArticles, FEEDS, cleanSummary, normalizeDedupeKey, splitTitleAndPublisher };
