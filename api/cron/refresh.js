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
    // Förvärmning: en andra omgång löser upp Google-länkar och sammanfattningar som hann slut på tid/budget i den första.
    let items = await fetchLiveArticles({ force: true });
    let passes = 1;
    if (items.some((i) => /news\.google\.com/i.test(i.url || ''))) {
      items = await fetchLiveArticles({ force: true });
      passes = 2;
    }
    return res.status(200).json({
      ok: true,
      passes,
      googleLinksLeft: items.filter((i) => /news\.google\.com/i.test(i.url || '')).length,
      refreshed: items.length,
      feeds: FEEDS.length,
      sample: items.slice(0, 5).map((i) => ({ title: i.title, tags: i.tags, url: i.url })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'refresh failed' });
  }
};
