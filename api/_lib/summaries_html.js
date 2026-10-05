/**
 * HTML-extrakt för sammanfattningar/bilder (og/twitter/meta/json-ld/<p>/<img>).
 * Ingen LLM: bara utgivarens egna texter.
 */
const BOILERPLATE_RE =
  /cookie|javascript|subscribe|sign in|log in|logga in|prenumer|paywall|enable js|captcha|are you a robot|access denied|just a moment|all rights reserved|privacy policy|latest news,? (and|&)|breaking news,? (and|&)|key stats|stock price as of|price change for|your (source|home) for|^welcome to|leading (source|provider)/i;

// Insamlings-/prenumerationstext (t.ex. CleanTechnica: "Support our work ... Patreon") är aldrig en sammanfattning.
const SPAM_RE =
  /patreon|donat(e|ion)|fundrais|become a (member|supporter|patron)|\bsupport\b[^.]{0,40}\b(work|us|our|journalism|mission|independent)\b|\bsubscribe\b|substack/i;

const MAX_LEN = 240;

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

/** Reservbild ur sidans HTML: <link rel="image_src">, annars första stora <img> (ej ikon/logga/spårpixel/avatar/svg/gif). */
function linkOrImgImage(html) {
  const link = html.match(/<link\b[^>]*rel=["']image_src["'][^>]*>/i);
  const href = link && link[0].match(/href=["']([^"']+)["']/i);
  if (href) return decodeEntities(href[1]);
  const tags = html.match(/<img\b[^>]*>/gi) || [];
  for (const tag of tags.slice(0, 40)) {
    const m = tag.match(/\s(?:data-src|src)=["']([^"']+)["']/i);
    if (!m) continue;
    const src = decodeEntities(m[1]);
    if (/^data:|\.(svg|gif)(\?|$)|icon|logo|sprite|avatar|pixel|badge|banner-ad|placeholder|blank/i.test(src)) continue;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(src) && !/\/(images?|media|uploads?|photos?)\//i.test(src)) continue;
    const w = tag.match(/\swidth=["']?(\d+)/i);
    const h = tag.match(/\sheight=["']?(\d+)/i);
    if ((w && Number(w[1]) < 300) || (h && Number(h[1]) < 160)) continue;
    return src;
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
    ldImage(html) ||
    linkOrImgImage(html);
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

module.exports = {
  SPAM_RE,
  MAX_LEN,
  decodeEntities,
  descriptionVia,
  extractDescription,
  extractImage,
  descriptionComplete,
  words,
  overlap,
  usableDescription,
  shorten,
};
