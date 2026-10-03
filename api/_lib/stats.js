/**
 * Cookiefri besöksräknare. Lagring: privat Vercel Blob (BLOB_READ_WRITE_TOKEN), en liten JSON-fil per dag
 * (stats/YYYY-MM-DD.json) plus stats/total.json. Bara aggregerade siffror: ingen IP, ingen User-Agent, inga cookies.
 * Skrivning = läs (med ETag) + skriv med ifMatch och upp till 10 omförsök, så två samtidiga träffar tappar inte räkning.
 */
const { get, put } = require('@vercel/blob');

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });
const MAX_KEYS = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dayKey = (d = new Date()) => DAY_FMT.format(d);

function lastDays(n) {
  const [y, m, d] = dayKey().split('-').map(Number);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
  return out;
}

async function readJson(pathname) {
  try {
    const r = await get(pathname, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { data: null, etag: null };
    return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
  } catch (err) {
    if (/not.?found|404/i.test(String((err && (err.name || err.message)) || ''))) return { data: null, etag: null };
    throw err;
  }
}

async function update(pathname, mutate, empty) {
  for (let i = 0; i < 10; i++) {
    const { data, etag } = await readJson(pathname);
    const next = mutate(data || empty());
    try {
      await put(pathname, JSON.stringify(next), {
        access: 'private',
        addRandomSuffix: false,
        contentType: 'application/json',
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
      return;
    } catch (err) {
      if (i === 9) throw err;
      await sleep(Math.random() * 40 * (i + 1));
    }
  }
}

function bump(map, key) {
  const k = key in map || Object.keys(map).length < MAX_KEYS ? key : 'other';
  map[k] = (map[k] || 0) + 1;
}

/** Räknar en sidvisning (källa och refererande värdnamn är redan saneräde). */
async function record({ source, ref }) {
  const date = dayKey();
  await Promise.all([
    update(`stats/${date}.json`, (d) => {
      d.views++;
      bump(d.bySource, source);
      bump(d.byRef, ref);
      return d;
    }, () => ({ date, views: 0, bySource: {}, byRef: {} })),
    update('stats/total.json', (d) => {
      d.views++;
      bump(d.bySource, source);
      return d;
    }, () => ({ since: date, views: 0, bySource: {} })),
  ]);
}

const cacheKey = '__tekniknyheter_stats_cache__';

/** Sammanställning för /api/stats (cachas 20 s i serverminnet för att spara Blob-anrop). */
async function summary() {
  const c = globalThis[cacheKey];
  if (c && Date.now() - c.at < 20000) return c.value;
  const keys = lastDays(30);
  const [total, ...days] = await Promise.all([readJson('stats/total.json'), ...keys.map((k) => readJson(`stats/${k}.json`))]);
  const list = keys.map((date, i) => {
    const d = days[i].data;
    return { date, views: d ? d.views : 0, bySource: d ? d.bySource : {}, byRef: d ? d.byRef : {} };
  });
  const t = total.data || { since: null, views: 0, bySource: {} };
  const value = {
    total: t.views,
    today: list[list.length - 1].views,
    since: t.since,
    timezone: 'Europe/Stockholm',
    days: list,
    bySourceTotal: t.bySource,
    generatedAt: new Date().toISOString(),
  };
  globalThis[cacheKey] = { at: Date.now(), value };
  return value;
}

module.exports = { record, summary, dayKey, lastDays };
