const { record } = require('./_lib/stats');

// Frontend på GitHub Pages. Andra webbläsar-Origins räknas inte (POST utan Origin, t.ex. curl, går att räkna).
const ALLOWED_ORIGIN = 'https://juulis.github.io';
const OWN_HOSTS = new Set(['juulis.github.io', 'tekniknyheter.vercel.app']);
const BOT_RE = /bot|crawl|spider|headless|preview|lighthouse|slurp|monitor|uptime/i;

const cleanSource = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);

function cleanRef(v) {
  const h = String(v || '').toLowerCase().replace(/^www\./, '');
  return /^[a-z0-9.-]{1,64}$/.test(h) && !OWN_HOSTS.has(h) ? h : '';
}

function readInput(req) {
  let b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (_) { b = {}; }
  }
  return b && typeof b === 'object' ? b : {};
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  // Endast POST (från hit.js) räknar. GET är read-only och räknar aldrig.
  if (req.method !== 'POST') return res.status(405).json({ counted: false, reason: 'method' });

  const origin = req.headers.origin;
  if (origin && origin !== ALLOWED_ORIGIN) return res.status(403).json({ counted: false, reason: 'origin' });
  if (req.headers.dnt === '1') return res.status(200).json({ counted: false, reason: 'dnt' });
  const ua = String(req.headers['user-agent'] || '');
  if (!ua || BOT_RE.test(ua)) return res.status(200).json({ counted: false, reason: 'bot' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(200).json({ counted: false, reason: 'storage_not_configured' });

  const input = readInput(req);
  try {
    await record({ source: cleanSource(input.utm_source) || 'direct', ref: cleanRef(input.ref) || 'direct' });
    return res.status(200).json({ counted: true });
  } catch (err) {
    return res.status(200).json({ counted: false, reason: 'storage_error' });
  }
};
