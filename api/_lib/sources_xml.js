const { SPAM_RE } = require('./summaries');
const { FEEDS } = require('./sources_feeds');

const cacheKey = '__tekniknyheter_sources_cache__';
const CACHE_MS = 10 * 60 * 1000;

const NEGATIVE_TITLE =
  /what could go wrong|slowdown|sales weaken|plunge|crash|lawsuit|fraud|hack|breach|layoff|ban\b|banned|recall|skandal|åtal|varsel|kryptospam|predicts solana|crypto pump/i;

/** Svaga/oönskade källor: matchas mot utgivarnamn och mot host (artikel-URL eller utgivarens hemsida). */
const WEAK_SOURCE_RE =
  /svt\s?play|shattered(\.io)?\b|off\s?grid\s?survival|offgridsurvival|\bbriefs\.co\b|blogspot|blogger\.com|wordpress\.com|tumblr|pinterest|quora|\bmedium\.com\b|\bprweb\b|\bopenpr\b|einpresswire|\bnewsbreak\b|\bscoop\.it\b|\bpr\s?newswire\b|\bbusiness\s?wire\b|\bglobenewswire\b|\baccesswire\b|\bfacebook\b|\bx\.com\b|\btwitter\b|\binstagram\b|\breddit\b/i;
const WEAK_HOST_RE =
  /(^|\.)(svtplay\.se|shattered\.io|offgridsurvival\.com|briefs\.co|blogspot\.[a-z.]+|blogger\.com|wordpress\.com|tumblr\.com|pinterest\.[a-z.]+|quora\.com|medium\.com|prweb\.com|openpr\.com|einpresswire\.com|newsbreak\.com|scoop\.it|prnewswire\.com|businesswire\.com|globenewswire\.com|accesswire\.com|facebook\.com|x\.com|twitter\.com|instagram\.com|reddit\.com)$/i;

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
    attrValue(block, 'itunes:image', 'href'),
  ].filter(Boolean);

  const desc = String(description || '');
  const imgInDesc = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgInDesc) candidates.push(decodeXml(imgInDesc[1]));
  // og:image / twitter:image inbäddad i RSS-beskrivning (vissa flöden).
  const og = desc.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i) || desc.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  if (og) candidates.push(decodeXml(og[1]));

  for (const raw of candidates) {
    let url = String(raw || '').trim();
    if (/^http:\/\//i.test(url)) url = `https://${url.slice(7)}`;
    if (/^https:\/\//i.test(url) && !/\.(mp3|mp4|m4a|aac)(\?|$)/i.test(url) && url.length < 600) {
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
  let text = stripHtml(summary)
    .replace(/\s*(The post .{0,200} appeared first on .*|Inlägget .{0,200} dök först upp .*)$/i, '')
    .replace(/\s*\[(…|\.\.\.)\]\s*$/, '…')
    .trim();
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
  if (text.length < 24 || SPAM_RE.test(text)) return '';
  return text.slice(0, 280);
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
  tagValue,
  attrValue,
  extractImage,
  splitTitleAndPublisher,
};
