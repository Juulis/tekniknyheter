/**
 * Snapshot av senaste lyckade /api/news-svar i Vercel Blob.
 * Kallstart (efter deploy) serverar snapshot direkt; bakgrundsuppdatering via waitUntil.
 */
const { get, put } = require('@vercel/blob');

const FRESH_MS = 10 * 60 * 1000;
const pathFor = (key) => `cache/news-${key}.json`;

function snapshotKey({ editorial, positive, sort }) {
  return `${editorial || '1'}-${positive || '1'}-${sort || 'priority'}`.replace(/[^a-z0-9_-]/gi, '');
}

async function readSnapshot(key) {
  try {
    const r = await get(pathFor(key), { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    const data = JSON.parse(await new Response(r.stream).text());
    if (!data || !data.payload || !data.at) return null;
    return data;
  } catch (err) {
    if (/not.?found|404/i.test(String((err && (err.name || err.message)) || ''))) return null;
    return null;
  }
}

async function writeSnapshot(key, payload) {
  const body = JSON.stringify({ at: Date.now(), key, payload });
  await put(pathFor(key), body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

module.exports = { FRESH_MS, snapshotKey, readSnapshot, writeSnapshot };
