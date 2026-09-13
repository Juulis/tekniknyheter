/** Ephemeral in-memory store for the shell. Replace with durable storage later. */

const { enrich, compareEditorial } = require('./editorial');

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

const seed = [
  {
    id: 'seed-1',
    title: 'Tesla levererar rekordmånga bilar i kvartalet',
    summary:
      'Leveranserna ökar i flera marknader samtidigt som Supercharger-nätet växer — positiv signal för elbilsadoption.',
    url: 'https://www.tesla.com',
    source: 'EV Desk',
    publishedAt: hoursAgo(2),
  },
  {
    id: 'seed-2',
    title: 'NVIDIA och Jensen Huang visar nästa AI-GPU-generation',
    summary:
      'Nya chips lovar högre träningseffektivitet för LLM:er och öppnar för mer tillgänglig AI-infrastruktur.',
    url: 'https://www.nvidia.com',
    source: 'Chip Wire',
    publishedAt: hoursAgo(5),
  },
  {
    id: 'seed-3',
    title: 'xAI öppnar nya kapaciteter i Grok för utvecklare',
    summary:
      'API-utökningen gör det enklare att bygga positiva produktivitetsverktyg ovanpå Musks AI-stack.',
    url: 'https://x.ai',
    source: 'AI Brief',
    publishedAt: hoursAgo(9),
  },
  {
    id: 'seed-4',
    title: 'SpaceX Starship klarar ny testmilstolpe',
    summary:
      'Lyckad flygsekvens stärker tidplanen för frekventa uppskjutningar och Starlink-expansion.',
    url: 'https://www.spacex.com',
    source: 'Orbit Daily',
    publishedAt: hoursAgo(14),
  },
  {
    id: 'seed-5',
    title: 'EU:s AI Act får tydligare vägledning för innovation',
    summary:
      'Nya riktlinjer ska göra det enklare för AI-bolag att följa reglerna utan att bromsa produktutveckling.',
    url: 'https://digital-strategy.ec.europa.eu',
    source: 'Policy Watch',
    publishedAt: hoursAgo(20),
  },
  {
    id: 'seed-6',
    title: 'Elbilsladdning blir billigare i fler europeiska städer',
    summary:
      'Kommuner och operatörer sänker priser i rusningstid — boost för vardagskörning på el.',
    url: 'https://www.iea.org',
    source: 'Mobility Notes',
    publishedAt: hoursAgo(28),
  },
  {
    id: 'seed-7',
    title: 'Neuralink får grönt ljus för utökad patientstudie',
    summary:
      'Godkännandet möjliggör fler deltagare och snabbare lärande kring hjärn-dator-gränssnitt.',
    url: 'https://neuralink.com',
    source: 'BioTech Pulse',
    publishedAt: hoursAgo(36),
  },
].map(enrich);

const globalKey = '__tekniknyheter_store__';

function getStore() {
  if (!globalThis[globalKey]) {
    globalThis[globalKey] = { items: [...seed] };
  }
  return globalThis[globalKey];
}

function listNews() {
  return [...getStore().items].sort(compareEditorial);
}

function addNews(item) {
  const store = getStore();
  const entry = enrich({
    id: item.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    url: item.url ? String(item.url).trim() : null,
    source: item.source ? String(item.source).trim() : 'Bot',
    category: item.category ? String(item.category).trim() : null,
    tags: Array.isArray(item.tags) ? item.tags : [],
    sentiment: item.sentiment || null,
    priority: item.priority === true,
    publishedAt: item.publishedAt || new Date().toISOString(),
  });
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
