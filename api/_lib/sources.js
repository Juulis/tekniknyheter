const { enrich, matchesEditorialFocus, compareEditorial } = require('./editorial');

const FEEDS = [
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=Tesla+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=NVIDIA+OR+%22Jensen+Huang%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22Elon+Musk%22+OR+SpaceX+OR+xAI+OR+Neuralink+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=%22electric+vehicle%22+OR+EV+OR+elbilar+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=AI+regulation+OR+%22AI+Act%22+OR+%22chip+export%22+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
  {
    source: 'Google News',
    url: 'https://news.google.com/rss/search?q=artificial+intelligence+breakthrough+OR+LLM+when:3d&hl=en-US&gl=US&ceid=US:en',
  },
];

const cacheKey = '__tekniknyheter_sources_cache__';
const CACHE_MS = 15 * 60 * 1000;

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function stripHtml(value) {
  return decodeXml(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagValue(block, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? decodeXml(m[1]) : '';
}

function parseRssItems(xml, sourceName) {
  const items = [];
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = stripHtml(tagValue(block, 'title'));
    const link = stripHtml(tagValue(block, 'link'));
    const description = stripHtml(tagValue(block, 'description'));
    const pubDate = stripHtml(tagValue(block, 'pubDate'));
    if (!title || !link) continue;
    items.push({
      id: `rss-${Buffer.from(link).toString('base64url').slice(0, 24)}`,
      title,
      summary: description.slice(0, 280),
      url: link,
      source: sourceName,
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

  const byUrl = new Map();
  for (const raw of collected) {
    const item = enrich(raw);
    if (!matchesEditorialFocus(item, { preferPositive: true })) continue;
    if (item.sentiment === 'negative') continue;
    const key = (item.url || item.title).toLowerCase();
    const prev = byUrl.get(key);
    if (!prev || (item.priorityScore || 0) > (prev.priorityScore || 0)) {
      byUrl.set(key, item);
    }
  }

  const items = [...byUrl.values()].sort(compareEditorial).slice(0, 40);
  globalThis[cacheKey] = { at: now, items };
  return items;
}

module.exports = { fetchLiveArticles, FEEDS };
