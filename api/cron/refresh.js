const { fetchLiveArticles, FEEDS } = require('../_lib/sources');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = req.headers.authorization || '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const items = await fetchLiveArticles({ force: true });
    return res.status(200).json({
      ok: true,
      refreshed: items.length,
      feeds: FEEDS.length,
      sample: items.slice(0, 5).map((i) => ({ title: i.title, tags: i.tags, url: i.url })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'refresh failed' });
  }
};
