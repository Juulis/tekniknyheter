/** Redaktionella prioriteringar för Tekniknyheter (Juulis). */

const PRIORITY_TOPICS = [
  {
    id: 'tesla',
    label: 'Tesla',
    category: 'Tesla',
    patterns: [/\btesla\b/i, /\bcybertruck\b/i, /\boptimus\b/i, /\bmodel\s*[3syx]\b/i, /\bcrypto?night\b/i, /\bfsd\b/i, /full self[- ]driving/i],
  },
  {
    id: 'ev',
    label: 'Elbilar',
    category: 'Elbilar',
    patterns: [/\belbil/i, /\bev\b/i, /electric vehicle/i, /\bbatteri(bil|pack)?\b/i, /charging network/i, /supercharger/i],
  },
  {
    id: 'elon',
    label: 'Elon Musk',
    category: 'Elon Musk',
    patterns: [/\belon\b/i, /\bmusk\b/i],
  },
  {
    id: 'nvidia',
    label: 'NVIDIA',
    category: 'NVIDIA',
    patterns: [/\bnvidia\b/i, /\bcuda\b/i, /\bh100\b/i, /\bb200\b/i, /\bgpu\b/i],
  },
  {
    id: 'jensen',
    label: 'Jensen Huang',
    category: 'NVIDIA',
    patterns: [/\bjensen\b/i, /\bhuang\b/i],
  },
  {
    id: 'xai',
    label: 'xAI',
    category: 'AI',
    patterns: [/\bxai\b/i, /\bgrok\b/i],
  },
  {
    id: 'spacex',
    label: 'SpaceX',
    category: 'SpaceX',
    patterns: [/\bspacex\b/i, /\bstarship\b/i, /\bfalcon\s*9\b/i, /\bstarlink\b/i],
  },
  {
    id: 'neuralink',
    label: 'Neuralink',
    category: 'Neuralink',
    patterns: [/\bneuralink\b/i],
  },
  {
    id: 'geopolitics',
    label: 'Geopolitik',
    category: 'Geopolitik',
    patterns: [/\bEU\b/, /\bUSA?\b/, /\bchina\b|\bkina\b/i, /export control/i, /chip ban/i, /ai act/i, /lag(ändring|stiftning)/i, /reglering/i, /policy/i, /sanction/i],
  },
  {
    id: 'ai',
    label: 'AI',
    category: 'AI',
    patterns: [/\bai\b/i, /\bartificial intelligence\b/i, /\bllm\b/i, /machine learning/i, /openai|anthropic|deepmind/i],
  },
];

const POSITIVE_HINTS =
  /lanserar|genombrott|rekord|växer|ökar|vinner|godkänd|klarar|förbättrar|billigare|snabbare|ny milstolpe|expand|breakthrough|record|approves|beats|surpasses|opens|launches/i;

const NEGATIVE_HINTS =
  /krasch|faller|åtal|stämmer|böter|skandal|döds|olycka|recall|ban|banned|lawsuit|crash|plunge|fraud|hack|breach|layoff|varsel|slowdown|weaken|what could go wrong|goes wrong|riskerar|kritisera/i;

/** Text för ämnesdetektion: endast titel + sammanfattning (aldrig utgivare/källa). */
function topicText(item) {
  return `${item.title || ''} ${item.summary || ''}`;
}

/** Text för sentiment: källa får användas här. */
function textOf(item) {
  return `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${(item.tags || []).join(' ')}`;
}

function matchTopic(topic, text) {
  let best = -1;
  for (const re of topic.patterns) {
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

function detectTags(item) {
  const text = topicText(item);
  const tags = new Set(Array.isArray(item.tags) ? item.tags.map(String) : []);
  for (const topic of PRIORITY_TOPICS) {
    if (matchTopic(topic, text) >= 0) {
      tags.add(topic.label);
    }
  }
  return [...tags];
}

/** Starka entiteter (vinner över svagare ämnen); vid flera träffar vinner den som står först i titeln. */
const STRONG_TOPICS = new Set(['spacex', 'neuralink', 'nvidia', 'jensen', 'xai', 'tesla', 'aiact']);
const WEAK_ORDER = ['ev', 'elon', 'ai', 'geopolitics'];
const AI_ACT_RE = /\bai act\b|export controls?|chip (ban|export)|\bEU\b.{0,40}(regulat|polic|law)|(regulat|polic|law).{0,40}\bEU\b/i;

function categoryFromText(text) {
  if (!text.trim()) return null;
  let best = null;
  const consider = (id, category, index) => {
    if (index < 0) return;
    if (!best || index < best.index) best = { id, category, index };
  };
  for (const topic of PRIORITY_TOPICS) {
    if (STRONG_TOPICS.has(topic.id)) consider(topic.id, topic.category, matchTopic(topic, text));
  }
  const act = AI_ACT_RE.exec(text);
  if (act) consider('aiact', 'Geopolitik', act.index);
  if (best) return best.category;
  for (const id of WEAK_ORDER) {
    const topic = PRIORITY_TOPICS.find((t) => t.id === id);
    if (topic && matchTopic(topic, text) >= 0) return topic.category;
  }
  return null;
}

function detectCategory(item) {
  if (item.category) return item.category;
  return categoryFromText(String(item.title || '')) || categoryFromText(String(item.summary || '')) || 'Teknik';
}

function sentimentOf(item) {
  if (item.sentiment === 'positive' || item.sentiment === 'negative' || item.sentiment === 'neutral') {
    return item.sentiment;
  }
  const text = textOf(item);
  const pos = POSITIVE_HINTS.test(text);
  const neg = NEGATIVE_HINTS.test(text);
  if (pos && !neg) return 'positive';
  if (neg && !pos) return 'negative';
  return 'neutral';
}

function priorityScore(item) {
  const tags = item.tags || detectTags(item);
  const sentiment = item.sentiment || sentimentOf(item);
  let score = 0;

  for (const topic of PRIORITY_TOPICS) {
    if (tags.includes(topic.label)) score += 10;
  }

  if (tags.some((t) => ['Tesla', 'Elon Musk', 'xAI', 'SpaceX', 'Neuralink'].includes(t))) {
    score += 8;
  }
  if (tags.includes('NVIDIA') || tags.includes('Jensen Huang')) score += 8;
  if (tags.includes('AI')) score += 4;
  if (tags.includes('Elbilar')) score += 5;
  if (tags.includes('Geopolitik')) score += 5;

  if (sentiment === 'positive') score += 12;
  else if (sentiment === 'negative') score -= 15;
  else score += 1;

  if (item.priority === true) score += 20;
  if (typeof item.priorityScore === 'number') score += item.priorityScore;

  return score;
}

function uniqueTags(tags, category) {
  const seen = new Set();
  const out = [];
  const cat = String(category || '').toLowerCase();
  for (const tag of tags || []) {
    const t = String(tag).trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    if (cat && key === cat) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function enrich(item) {
  const detected = detectTags(item);
  const category = detectCategory(item);
  const tags = uniqueTags(detected, category);
  const sentiment = sentimentOf({ ...item, tags });
  const score = priorityScore({ ...item, tags, sentiment });
  const editorialPriority = score >= 12;

  return {
    ...item,
    tags,
    category,
    sentiment,
    priorityScore: score,
    editorialPriority,
  };
}

function compareEditorial(a, b) {
  const scoreDiff = (b.priorityScore || 0) - (a.priorityScore || 0);
  if (scoreDiff) return scoreDiff;
  return new Date(b.publishedAt) - new Date(a.publishedAt);
}

function matchesEditorialFocus(item, { preferPositive = true } = {}) {
  if (preferPositive && item.sentiment === 'negative' && (item.priorityScore || 0) < 20) {
    return false;
  }
  return (item.priorityScore || 0) >= 8;
}

module.exports = {
  PRIORITY_TOPICS,
  detectTags,
  enrich,
  compareEditorial,
  matchesEditorialFocus,
  priorityScore,
};
