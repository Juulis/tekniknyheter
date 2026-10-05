const { SPAM_RE } = require('./summaries');
const {
  FEEDS,
  cacheKey,
  CACHE_MS,
  NEGATIVE_TITLE,
  isWeakSource,
  hostOf,
  decodeXml,
  stripHtml,
  cleanSummary,
  normalizeDedupeKey,
  splitTitleAndPublisher,
  titleTokens,
  jaccard,
  detectLang,
  tagValue,
  attrValue,
  extractImage,
  pickBestUrl,
  stableId,
} = require('./sources_parse');

function softRssTeaser(raw, title, publisher) {
  let text = stripHtml(raw).replace(/\s+/g, ' ').trim();
  if (!text || text.length < 50) return '';
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9åäö]+/gi, ' ').trim();
  const nTitle = norm(title);
  if (nTitle && (norm(text) === nTitle || norm(text).startsWith(nTitle))) {
    text = text.slice(title.length).replace(/^[\s\-–—:|]+/, '').trim();
  }
  if (publisher) {
    const nPub = norm(publisher);
    if (norm(text) === nPub || norm(text).endsWith(nPub)) {
      text = text.replace(new RegExp(`(?:\\s*[-–—]?\\s*)?${publisher.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i'), '').trim();
    }
  }
  if (!text || text.length < 50 || (nTitle && norm(text) === nTitle)) return '';
  if (SPAM_RE.test(text)) return '';
  // Google News-beskrivningar är bara en länk: hoppa över.
  if (/^https?:\/\/news\.google\.com\//i.test(text) || /^&lt;a href/i.test(String(raw || ''))) return '';
  return text.slice(0, 240);
}

function parseRssItems(xml, feedLabel, feedLang) {
  const items = [];
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const rawTitle = tagValue(block, 'title');
    // Egna svenska flöden har ingen "Titel - Utgivare"-form (Google News har det): dela bara Google-titlar.
    const { title, publisher } = feedLang ? { title: stripHtml(rawTitle), publisher: '' } : splitTitleAndPublisher(rawTitle);
    const link = stripHtml(tagValue(block, 'link'));
    const rawDescription = tagValue(block, 'description');
    // RSS-beskrivning, annars content:encoded (om flödet har den).
    const rawContent = tagValue(block, 'content:encoded');
    const summary = cleanSummary(rawDescription, title, publisher) || cleanSummary(rawContent, title, publisher);
    // Mjuk RSS-reserv (vid 403 på sidhämtning): teaser ur flödestexten, aldrig bara titel+källa.
    const rssTeaser = summary ? '' : softRssTeaser(rawContent || rawDescription, title, publisher);
    const pubDate = stripHtml(tagValue(block, 'pubDate'));
    const imageUrl = extractImage(block, rawDescription + rawContent);
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
      summary: summary || undefined,
      ...(rssTeaser ? { rssTeaser } : {}),
      url,
      sourceUrl: sourceUrl || undefined,
      source,
      imageUrl: imageUrl || undefined,
      lang: detectLang(title, feedLang),
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
    signal: AbortSignal.timeout(7000),
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`${feed.source} ${res.status}`);
  }
  const xml = await res.text();
  return parseRssItems(xml, feed.source, feed.lang);
}



module.exports = {
  FEEDS,
  cacheKey,
  CACHE_MS,
  NEGATIVE_TITLE,
  isWeakSource,
  hostOf,
  decodeXml,
  stripHtml,
  cleanSummary,
  softRssTeaser,
  parseRssItems,
  fetchFeed,
  normalizeDedupeKey,
  splitTitleAndPublisher,
  titleTokens,
  jaccard,
  detectLang,
};
