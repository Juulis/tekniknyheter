const { summary } = require('./_lib/stats');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=20');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return res.status(503).json({ error: 'storage_not_configured' });
  try {
    return res.status(200).json(await summary());
  } catch (err) {
    return res.status(500).json({ error: 'storage_error' });
  }
};
