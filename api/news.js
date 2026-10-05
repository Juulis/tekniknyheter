const { listNews } = require('./_lib/store');
const { enrich, compareEditorial, matchesEditorialFocus, PRIORITY_TOPICS } = require('./_lib/editorial_boost');
const { fetchLiveArticles, resolveStats, summaryStats, dedupeItems, isSoftDrop, isTopCritic } = require('./_lib/sources');
const { fetchDygnet, dygnetBonus } = require('./_lib/dygnet');
const { FRESH_MS, snapshotKey, readSnapshot, writeSnapshot } = require('./_lib/news_snapshot');

// Lagrade/seed-nyheter blandas bara in när live-RSS ger färre än så här många nyheter (eller misslyckas).
const MIN_LIVE_ITEMS = 5;

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
    .map((item) => {
      const e = enrich(item);
      // Dygnet-kort är redaktionellt utvalda: bonus efter enrich (som räknar om basen varje gång).
      return e.dygnet ? { ...e, priorityScore: (e.priorityScore || 0) + dygnetBonus(e), editorialPriority: true } : e;
    })
    .filter((item) => {
      // Dygnet-kort kringgår ämnes- och toppnyhetsfiltren men följer kategori-, tagg- och sökfilter.
      if (!item.dygnet && (editorial === '1' || editorial === 'true')) {
        if (!matchesEditorialFocus(item, { preferPositive: false })) return false;
      }
      // positive=1 (standard) = "positiv lutning": styr bara rankningen (positiva först, neutrala OK, negativa sist).
      // positive=only är strikt: returnerar enbart items med sentiment === 'positive'.
      if (!item.dygnet && isSoftDrop(item)) return false;
      if (positive === 'only' && !item.dygnet) {
        if (item.sentiment !== 'positive') return false;
        if (isTopCritic(item)) return false;
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

function mergeItems(...lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const raw of list) {
      const item = enrich(raw);
      const key = (item.url || item.id || item.title || '').toLowerCase();
      if (!key) continue;
      const prev = byKey.get(key);
      if (!prev || (item.priorityScore || 0) > (prev.priorityScore || 0)) {
        byKey.set(key, item);
      }
    }
  }
  return [...byKey.values()];
}

function setCacheHeaders(res, noStore) {
  // Vercel visar ofta bara "public" utåt; CDN-rubrikerna styr edge/SWR.
  const value = noStore ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=86400';
  res.setHeader('Cache-Control', value);
  if (!noStore) {
    res.setHeader('CDN-Cache-Control', value);
    res.setHeader('Vercel-CDN-Cache-Control', value);
  }
}

async function buildNewsPayload(url) {
  const q = url.searchParams.get('q') || '';
  const category = url.searchParams.get('category') || '';
  const tag = url.searchParams.get('tag') || '';
  const sort = url.searchParams.get('sort') || 'priority';
  const editorial = url.searchParams.get('editorial') || '1';
  const positive = url.searchParams.get('positive') || '1';
  const live = url.searchParams.get('live') !== '0';
  const force = url.searchParams.get('refresh') === '1';

  let liveItems = [];
  let liveError = null;
  if (live) {
    try {
      liveItems = await fetchLiveArticles({ force, positiveOnly: positive === 'only' });
    } catch (err) {
      liveError = err.message || 'live fetch failed';
    }
  }

  const dygnet = (await fetchDygnet({ force })).map(enrich);
  const dygnetUrls = new Set(dygnet.map((d) => d.url.toLowerCase()));

  const stored = listNews().map(enrich);
  const useStored = !!liveError || liveItems.length < MIN_LIVE_ITEMS;
  const base = useStored ? dedupeItems(mergeItems(liveItems, stored)) : mergeItems(liveItems);
  const all = [...base.filter((i) => !dygnetUrls.has(String(i.url || '').toLowerCase())), ...dygnet];
  const filtered = filterItems(all, { q, category, tag, editorial, positive });
  const items = sortItems(filtered, sort).slice(0, 50);

  const noStore = force || !!liveError || (live && !liveItems.length);
  return {
    noStore,
    snapKey: snapshotKey({ editorial, positive, sort }),
    body: {
      items,
      total: all.length,
      filtered: items.length,
      liveCount: liveItems.length,
      storedCount: stored.length,
      dygnetCount: dygnet.length,
      storedUsed: useStored,
      resolve: resolveStats(),
      summaries: summaryStats(),
      liveError,
      editorialTopics: PRIORITY_TOPICS.map((t) => ({ id: t.id, label: t.label, category: t.category })),
      query: { q, category: category || null, tag: tag || null, sort, editorial, positive, live },
      generatedAt: new Date().toISOString(),
    },
  };
}

function schedule(task) {
  try {
    const { waitUntil } = require('@vercel/functions');
    waitUntil(task());
  } catch (_) {
    // Lokalt/utan runtime: kör utan att blockera svaret.
    Promise.resolve()
      .then(task)
      .catch(() => {});
  }
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
  const refresh = url.searchParams.get('refresh') === '1';
  const editorial = url.searchParams.get('editorial') || '1';
  const positive = url.searchParams.get('positive') || '1';
  const sort = url.searchParams.get('sort') || 'priority';
  const key = snapshotKey({ editorial, positive, sort });
  // Snapshot bara för standardvy utan sök/filter (annars risk för fel payload).
  const canSnapshot = !refresh && !url.searchParams.get('q') && !url.searchParams.get('category') && !url.searchParams.get('tag');

  if (canSnapshot) {
    const snap = await readSnapshot(key);
    if (snap && snap.payload && Array.isArray(snap.payload.items)) {
      const age = Date.now() - snap.at;
      setCacheHeaders(res, false);
      res.status(200).json(snap.payload);
      if (age > FRESH_MS) {
        schedule(async () => {
          try {
            const built = await buildNewsPayload(url);
            if (!built.noStore && built.body.items.length) await writeSnapshot(key, built.body);
          } catch (_) {
            /* behåll gammal snapshot */
          }
        });
      }
      return;
    }
  }

  const built = await buildNewsPayload(url);
  setCacheHeaders(res, built.noStore);
  if (!built.noStore && canSnapshot && built.body.items.length) {
    schedule(async () => {
      try {
        await writeSnapshot(key, built.body);
      } catch (_) {
        /* snapshot är best-effort */
      }
    });
  }
  return res.status(200).json(built.body);
};
