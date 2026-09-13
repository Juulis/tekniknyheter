const { addNews, addMany } = require('./_lib/store');
const { enrich, matchesEditorialFocus } = require('./_lib/editorial');

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
    const strict = body.strictEditorial === true || req.headers['x-strict-editorial'] === '1';
    const payload = Array.isArray(body) ? body : body.items || [body];

    if (!payload.length) {
      return res.status(400).json({ error: 'Inga nyheter i body' });
    }

    const accepted = [];
    const rejected = [];

    for (const raw of payload) {
      const preview = enrich(raw);
      if (strict && !matchesEditorialFocus(preview, { preferPositive: true })) {
        rejected.push({
          title: preview.title,
          reason: 'Utanför redaktionell prio eller för negativ ton',
          priorityScore: preview.priorityScore,
          sentiment: preview.sentiment,
          tags: preview.tags,
        });
        continue;
      }
      accepted.push(raw);
    }

    if (!accepted.length) {
      return res.status(422).json({
        ok: false,
        error: 'Inga items matchade redaktionell prio',
        rejected,
        hint: 'Prioritera positiva nyheter om Tesla, elbilar, Elon Musk, NVIDIA/Jensen, Musk-bolag, geopolitik-tech och AI.',
      });
    }

    const created = addMany(accepted);

    return res.status(201).json({
      ok: true,
      created,
      rejected,
      editorialHint:
        'Prioritera positiva nyheter: Tesla, elbilar, Elon Musk, NVIDIA, Jensen Huang, xAI/SpaceX/Neuralink, geopolitik-tech, AI.',
    });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Ogiltig body' });
  }
};
