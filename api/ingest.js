const { addNews, addMany } = require('./_lib/store');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Ingest-Key');
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Ogiltig eller saknad X-Ingest-Key' });
}

module.exports = async function handler(req, res) {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    return res.status(503).json({
      error: 'INGEST_API_KEY är inte satt i Vercel',
    });
  }

  const provided = req.headers['x-ingest-key'];
  if (!provided || provided !== expected) {
    return unauthorized(res);
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const payload = Array.isArray(body) ? body : body.items || [body];

    if (!payload.length) {
      return res.status(400).json({ error: 'Inga nyheter i body' });
    }

    const created = Array.isArray(body) || body.items ? addMany(payload) : [addNews(payload[0])];

    return res.status(201).json({ ok: true, created });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ogiltig body' });
  }
};
