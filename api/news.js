const { listNews } = require('./_lib/store');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function guessCategory(item) {
  if (item.category) return item.category;
  const hay = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/ai|llm|model|gpt|openai/.test(hay)) return 'AI';
  if (/chip|gpu|laptop|iphone|hardware|batteri/.test(hay)) return 'Hårdvara';
  if (/eu|lag|policy|regler|gdpr/.test(hay)) return 'Policy';
  if (/github|vercel|deploy|sdk|api|kod/.test(hay)) return 'Utveckling';
  if (/kv|infra|edge|cloud/.test(hay)) return 'Infra';
  return 'Teknik';
}

function filterItems(items, { q, category }) {
  const query = (q || '').trim().toLowerCase();
  const cat = (category || '').trim();

  return items
    .map((item) => ({ ...item, category: guessCategory(item) }))
    .filter((item) => {
      if (cat && cat.toLowerCase() !== 'alla' && item.category.toLowerCase() !== cat.toLowerCase()) {
        return false;
      }
      if (!query) return true;
      const hay = `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''}`.toLowerCase();
      return hay.includes(query);
    });
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
  const all = listNews().map((item) => ({ ...item, category: guessCategory(item) }));
  const items = filterItems(all, { q, category });

  return res.status(200).json({
    items,
    total: all.length,
    filtered: items.length,
    query: { q, category: category || null },
    generatedAt: new Date().toISOString(),
  });
};
