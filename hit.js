// Cookiefri sidvisningsräknare: en liten POST per sidvisning, ingen cookie/localStorage, ingen persondata.
// Av: window.TEKNIKNYHETER_CONFIG.hits = false. Respekterar Do Not Track.
(function () {
  try {
    var cfg = window.TEKNIKNYHETER_CONFIG || {};
    var h = location.hostname;
    if (cfg.hits === false || !cfg.apiBaseUrl || h === 'localhost' || h === '127.0.0.1') return;
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || document.visibilityState === 'prerender') return;
    var src = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    var ref = '';
    try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (_) {}
    if (ref === h) ref = '';
    fetch(cfg.apiBaseUrl.replace(/\/$/, '') + '/api/hit', {
      method: 'POST',
      body: JSON.stringify({ path: location.pathname, utm_source: src, ref: ref }),
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      keepalive: true,
      credentials: 'omit',
      mode: 'cors',
    }).catch(function () {});
  } catch (_) {}
})();
