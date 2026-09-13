/** Ephemeral in-memory store for the shell. Replace with durable storage later. */

const seed = [
  {
    id: 'seed-1',
    title: 'Apple lanserar nya M-chip',
    summary: 'Nästa generation chip lovar bättre prestanda och batteritid i Mac och iPad.',
    url: 'https://www.apple.com',
    source: 'Exempel',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'seed-2',
    title: 'Open source-modell slår nya rekord',
    summary: 'En öppen modell når jämförbara resultat med slutna alternativ i flera benchmarks.',
    url: 'https://huggingface.co',
    source: 'Exempel',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'seed-3',
    title: 'EU skärper regler för digitala plattformar',
    summary: 'Nya krav på transparens och datadelning väntas påverka hur techbolag agerar i Europa.',
    url: 'https://digital-strategy.ec.europa.eu',
    source: 'Exempel',
    publishedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
];

const globalKey = '__tekniknyheter_store__';

function getStore() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = { items: [...seed] };
  }
  return globalThis[globalKey];
}

function listNews() {
  return [...getStore().items].sort(
    (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)
  );
}

function addNews(item) {
  const store = getStore();
  const entry = {
    id: item.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    url: item.url ? String(item.url).trim() : null,
    source: item.source ? String(item.source).trim() : 'Bot',
    publishedAt: item.publishedAt || new Date().toISOString(),
  };
  if (!entry.title) {
    throw new Error('title krävs');
  }
  store.items.unshift(entry);
  return entry;
}

function addMany(items) {
  return items.map(addNews);
}

module.exports = { listNews, addNews, addMany };
