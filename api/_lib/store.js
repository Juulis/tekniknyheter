/** Ephemeral in-memory store for the shell. Replace with durable storage later. */

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const seed = [
  {
    id: 'seed-1',
    title: 'EU föreslår nya AI-regler för öppna modeller',
    summary:
      'Utkastet handlar om transparenskrav, riskklassning och hur öppna modeller ska dokumenteras innan bred användning.',
    url: 'https://digital-strategy.ec.europa.eu',
    source: 'Policy Watch',
    category: 'Policy',
    publishedAt: hoursAgo(3),
  },
  {
    id: 'seed-2',
    title: 'Nytt M-chip lovar längsta batteritiden hittills',
    summary:
      'Tillverkaren visar benchmarks där maskinen klarar heldagsarbete utan laddning, med fokus på tyst kylning.',
    url: 'https://www.apple.com',
    source: 'Hardware Daily',
    category: 'Hårdvara',
    publishedAt: hoursAgo(7),
  },
  {
    id: 'seed-3',
    title: 'Öppen LLM sätter rekord i kodbench',
    summary:
      'En community-tränad modell når toppresultat i flera programmeringsuppgifter och släpps med öppna vikter.',
    url: 'https://huggingface.co',
    source: 'Model Hub',
    category: 'AI',
    publishedAt: hoursAgo(14),
  },
  {
    id: 'seed-4',
    title: 'GitHub lanserar snabbare Pages-deploys',
    summary:
      'Byggtider kortas för statiska sajter, med bättre cache och tydligare status i Actions-loggen.',
    url: 'https://github.blog',
    source: 'DevTools',
    category: 'Utveckling',
    publishedAt: hoursAgo(22),
  },
  {
    id: 'seed-5',
    title: 'Vercel KV får enklare SDK för edge-lagring',
    summary:
      'Nytt paket gör det smidigare att spara JSON nära användaren — bra nästa steg när nyhetslagret ska bli hållbart.',
    url: 'https://vercel.com/blog',
    source: 'Cloud Notes',
    category: 'Infra',
    publishedAt: hoursAgo(30),
  },
  {
    id: 'seed-6',
    title: 'Rust 1.x stabiliserar fler async-API:er',
    summary:
      'Release notes lyfter fram bättre ergonomi för futures och tydligare felmeddelanden i compilern.',
    url: 'https://blog.rust-lang.org',
    source: 'Lang Weekly',
    category: 'Utveckling',
    publishedAt: hoursAgo(40),
  },
  {
    id: 'seed-7',
    title: 'Kvantchip når 99,9 % två-qubit-fidelitet i labb',
    summary:
      'Forskargrupp visar att felkorrigering blir mer praktisk när brusnivåerna sjunker under kritiska trösklar.',
    url: 'https://www.nature.com',
    source: 'Science Desk',
    category: 'Hårdvara',
    publishedAt: hoursAgo(52),
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
    category: item.category ? String(item.category).trim() : null,
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
