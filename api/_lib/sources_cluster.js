const { enrich } = require('./editorial_boost');
const { titleTokens, jaccard, normalizeDedupeKey } = require('./sources_rss');
const {
  JACCARD_THRESHOLD,
  CLUSTER_THRESHOLD,
  LOOSE_THRESHOLD,
  MAX_RELATED,
  keyEntities,
  sharedCount,
  EVENT_ENTITIES,
  EVENT_KINDS,
  GLOBAL_KINDS,
} = require('./sources_keys');

function distinctNumbers(title) {
  const m = String(title || '').toLowerCase().match(/\d[\d.,]*\s?(?:hours?|minutes?|days?|gigawatts?|gw|mw|kw|billion|million|trillion)?/g) || [];
  return new Set(m.map((x) => x.replace(/\s+/g, '')).filter((x) => !/^(19|20)\d\d$/.test(x) && (x.length >= 4 || /[a-z]$/.test(x))));
}

function eventKey(title) {
  // Alias: Hon Hai = Foxconn så samma intäktsnyhet klustras.
  const t = String(title || '')
    .toLowerCase()
    .replace(/\bhon\s*hai\b/g, 'foxconn');
  const g = GLOBAL_KINDS.find(([, test]) => test(t));
  if (g) return `any:${g[0]}`;
  const ent = EVENT_ENTITIES.find(([, re]) => re.test(t));
  if (!ent) return '';
  const kind = EVENT_KINDS.find(([, test]) => test(t));
  return kind ? `${ent[0]}:${kind[0]}` : '';
}

function sameStory(cand, kept) {
  const ka = eventKey(cand.item.title);
  if (ka && ka === eventKey(kept.item.title)) return true;
  const j = jaccard(cand.tokens, kept.tokens);
  if (j >= JACCARD_THRESHOLD) return true;
  if (j < LOOSE_THRESHOLD) return false;
  if ((cand.item.category || '') !== (kept.item.category || '')) return false;
  const opposite =
    (cand.item.sentiment === 'positive' && kept.item.sentiment === 'negative') ||
    (cand.item.sentiment === 'negative' && kept.item.sentiment === 'positive');
  if (opposite) return false;
  const ents = sharedCount(keyEntities(cand.item.title), keyEntities(kept.item.title));
  if (ents === 0) return false;
  // Försiktig breddning: J >= 0,15 men bara med samma distinkta tal (t.ex. "50,000 hours").
  const sameNumber = sharedCount(distinctNumbers(cand.item.title), distinctNumbers(kept.item.title)) > 0;
  if (j < CLUSTER_THRESHOLD) return sameNumber && sharedCount(cand.tokens, kept.tokens) >= 2;
  return sharedCount(cand.tokens, kept.tokens) >= 3;
}

function toRelated(it) {
  // summary/imageUrl (om flödet gav dem) används som reserv för primärkortet och tas bort ur den publika alsoIn.
  return { source: it.source, url: it.url, title: it.title, originalUrl: it.originalUrl || it.url, summary: it.summary || undefined, imageUrl: it.imageUrl || undefined };
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
    // Reserv från samma story: summary/bild från ett alsoIn-kort (utgivarens RSS) om primärkortet saknar dem.
    const fb = extras.find((r) => r.summary);
    // Tunn summary (<60 tecken) byts mot en längre från ett alsoIn-kort (utgivarens RSS).
    if (fb && (!rest.summary || (rest.summary.length < 60 && fb.summary.length >= 60 && fb.summary.length > rest.summary.length + 15))) {
      rest.summary = fb.summary;
      rest.summarySource = 'related';
    }
    if (!rest.imageUrl) rest.imageUrl = (extras.find((r) => r.imageUrl) || {}).imageUrl || rest.imageUrl;
    const clean = related.map(({ summary, imageUrl, ...r }) => r);
    return clean.length ? { ...rest, alsoIn: clean } : rest;
  });
}



module.exports = { dedupeItems, sameStory, eventKey, toRelated };
