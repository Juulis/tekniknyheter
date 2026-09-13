/** Redaktionella prioriteringar för Tekniknyheter (Juulis). */

const PRIORITY_TOPICS = [
  {
    id: 'tesla',
    label: 'Tesla',
    category: 'Tesla',
    patterns: [/\btesla\b/i, /\bmodel\s*[3syx]\b/i, /\bcrypto?night\b/i, /\bfsd\b/i, /full self[- ]driving/i],
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
    patterns: [/\beu\b/i, /\busa?\b/i, /china|kina/i, /export control/i, /chip ban/i, /ai act/i, /lag(ändring|stiftning)/i, /reglering/i, /policy/i, /sanction/i],
  },
  {
    id: 'ai',
    label: 'AI',
    category: 'AI',
    patterns: [/\bai\b/i, /\bartificial intelligence\b/i, /\bllm\b/i, /\bmodel\b/i, /machine learning/i, /openai|anthropic|deepmind/i],
  },
];

const POSITIVE_HINTS =
  /lanserar|genombrott|rekord|växer|ökar|vinner|godkänd|klarar|förbättrar|billigare|snabbare|ny milstolpe|expand|breakthrough|record|approves|beats|surpasses|opens|launches/i;

const NEGATIVE_HINTS =
  /krasch|faller|åtal|stämmer|böter|skandal|döds|olycka|recall|ban|banned|lawsuit|crash|plunge|fraud|hack|breach|layoff|varsel/i;

function textOf(item) {
  return `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${(item.tags || []).join(' ')}`;
}

function detectTags(item) {
  const text = textOf(item);
  const tags = new Set(Array.isArray(item.tags) ? item.tags.map(String) : []);
  for (const topic of PRIORITY_TOPICS) {
    if (topic.patterns.some((re) => re.test(text))) {
      tags.add(topic.label);
    }
  }
  return [...tags];
}

function detectCategory(item, tags) {
  if (item.category) return item.category;
  for (const topic of PRIORITY_TOPICS) {
    if (tags.includes(topic.label) && topic.category) return topic.category;
  }
  return 'Teknik';
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

  // Musk-ekosystem bonus
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

enrich(item) {
  /* placeholder - fix below */
}

function enrich(item) {
  const tags = detectTags(item);
  const category = detectCategory(item, tags);
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
  if (!item.editorialPriority && !(item.tags || []).length) return false;
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
