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

function parseRssItems(xml, sourceName) {
  const items = [];
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const title = stripHtml(tagValue(block, 'title'));
    const link = stripHtml(tagValue(block, 'link'));
    const rawDescription = tagValue(block, 'description');
    const description = stripHtml(rawDescription);
    const pubDate = stripHtml(tagValue(block, 'pubDate'));
    const imageUrl = extractImage(block, rawDescription);
    if (!title || !link) continue;
    items.push({
      id: `rss-${Buffer.from(link).toString('base64url').slice(0, 24)}`,
      title,
      summary: description.slice(0, 280),
      url: link,
      source: sourceName,
      imageUrl: imageUrl || undefined,
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

  const items = [...byUrl.values()].sort(compareEditorial).slice(0, 50);
  globalThis[cacheKey] = { at: now, items };
  return items;
}

module.exports = { fetchLiveArticles, FEEDS };
