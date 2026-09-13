const { listNews } = require('./_lib/store');
const { enrich, compareEditorial, matchesEditorialFocus, PRIORITY_TOPICS } = require('./_lib/editorial');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function filterItems(items, { q, category, tag, editorial, positive }) {
  const query = (q || '').trim().toLowerCase();
  const cat = (category || '').trim();
  const tagFilter = (tag || '').trim().toLowerCase();

  return items
    .map((item) => enrich(item))
    .filter((item) => {
      if (editorial === '1' || editorial === 'true') {
        if (!matchesEditorialFocus(item, { preferPositive: positive !== '0' })) return false;
      }
      if (positive === '1' || positive === 'true') {
        if (item.sentiment === 'negative') return false;
      }
      if (cat && cat.toLowerCase() !== 'alla' && item.category.toLowerCase() !== cat.toLowerCase()) {
        return false;
      }
      if (tagFilter) {
        const tags = (item.tags || []).map((t) => String(t).toLowerCase());
        if (!tags.includes(tagFilter)) return false;
      }
      if (!query) return true;
      const hay = `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(query);
    });
}

function sortItems(items, sort) {
  const copy = [...items];
  if (sort === 'oldest') {
    return copy.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  }
  if (sort === 'title') {
    return copy.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'sv'));
  }
  if (sort === 'newest') {
    return copy.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }
  return copy.sort(compareEditorial);
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('q') || '';
  const category = url.searchParams.get('category') || '';
  const tag = url.searchParams.get('tag') || '';
  const sort = url.searchParams.get('sort') || 'priority';
  const editorial = url.searchParams.get('editorial') || '1';
  const positive = url.searchParams.get('positive') || '1';

  const all = listNews().map(enrich);
  const filtered = filterItems(all, { q, category, tag, editorial, positive });
  const items = sortItems(filtered, sort);

  return res.status(200).json({
    items,
    total: all.length,
    filtered: items.length,
    editorialTopics: PRIORITY_TOPICS.map((t) => ({ id: t.id, label: t.label, category: t.category })),
    query: { q, category: category || null, tag: tag || null, sort, editorial, positive },
    generatedAt: new Date().toISOString(),
  });
};
