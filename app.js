const fallbackNews = [
  {
    id: 'local-1',
    title: 'Välkommen till Tekniknyheter',
    summary: 'Det här är lokal exempeldata. När Vercel-API:t är igång hämtas nyheter därifrån i stället.',
    url: null,
    source: 'Lokalt skal',
    publishedAt: new Date().toISOString(),
  },
];

const statusEl = document.getElementById('status');
const listEl = document.getElementById('news-list');
const refreshBtn = document.getElementById('refresh');

function formatDate(iso) {
  try {
    return new Intl.DateTimeFormat('sv-SE', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusEl.textContent = text;
}

function render(items) {
  if (!items.length) {
    listEl.innerHTML = '<div class="empty">Inga nyheter ännu.</div>';
    return;
  }

  listEl.innerHTML = items
    .map((item) => {
      const title = item.url
        ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);

      return `
        <article class="card">
          <div class="meta">
            <span>${escapeHtml(item.source || 'Okänd källa')}</span>
            <span>${escapeHtml(formatDate(item.publishedAt))}</span>
          </div>
          <h2>${title}</h2>
          <p>${escapeHtml(item.summary || '')}</p>
        </article>
      `;
    })
    .join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}

async function loadNews() {
  const base = (window.TEKNIKNYHETER_CONFIG && window.TEKNIKNYHETER_CONFIG.apiBaseUrl) || '';
  setStatus('loading', 'Hämtar nyheter…');

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/news`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`API svarade ${res.status}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    render(items);
    setStatus('live', 'Live från API');
  } catch (err) {
    console.warn(err);
    render(fallbackNews);
    setStatus('fallback', 'Visar lokal exempeldata (API otillgängligt)');
  }
}

refreshBtn.addEventListener('click', loadNews);
loadNews();
