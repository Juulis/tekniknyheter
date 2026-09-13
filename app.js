const fallbackNews = [
  {
    id: 'local-1',
    title: 'EU föreslår nya AI-regler för öppna modeller',
    summary:
      'Utkastet handlar om transparenskrav, riskklassning och hur öppna modeller ska dokumenteras innan bred användning.',
    url: 'https://digital-strategy.ec.europa.eu',
    source: 'Policy Watch',
    category: 'Policy',
    publishedAt: hoursAgo(3),
  },
  {
    id: 'local-2',
    title: 'Nytt M-chip lovar längsta batteritiden hittills',
    summary:
      'Tillverkaren visar benchmarks där maskinen klarar heldagsarbete utan laddning, med fokus på tyst kylning.',
    url: 'https://www.apple.com',
    source: 'Hardware Daily',
    category: 'Hårdvara',
    publishedAt: hoursAgo(7),
  },
  {
    id: 'local-3',
    title: 'Öppen LLM sätter rekord i kodbench',
    summary:
      'En community-tränad modell når toppresultat i flera programmeringsuppgifter och släpps med öppna vikter.',
    url: 'https://huggingface.co',
    source: 'Model Hub',
    category: 'AI',
    publishedAt: hoursAgo(14),
  },
  {
    id: 'local-4',
    title: 'GitHub lanserar snabbare Pages-deploys',
    summary:
      'Byggtider kortas för statiska sajter, med bättre cache och tydligare status i Actions-loggen.',
    url: 'https://github.blog',
    source: 'DevTools',
    category: 'Utveckling',
    publishedAt: hoursAgo(22),
  },
  {
    id: 'local-5',
    title: 'Vercel KV får enklare SDK för edge-lagring',
    summary:
      'Nytt paket gör det smidigare att spara JSON nära användaren — bra nästa steg när vårt nyhetslager ska bli hållbart.',
    url: 'https://vercel.com/blog',
    source: 'Cloud Notes',
    category: 'Infra',
    publishedAt: hoursAgo(30),
  },
];

const statusEl = document.getElementById('status');
const listEl = document.getElementById('news-list');
const refreshBtn = document.getElementById('refresh');
const themeToggle = document.getElementById('theme-toggle');
const countEl = document.getElementById('count');
const searchInput = document.getElementById('search');
const categoryFiltersEl = document.getElementById('category-filters');
const clearFiltersBtn = document.getElementById('clear-filters');

const state = {
  allItems: [],
  query: '',
  category: 'Alla',
};

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

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

function formatRelative(iso) {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    const rtf = new Intl.RelativeTimeFormat('sv-SE', { numeric: 'auto' });
    if (Math.abs(mins) < 60) return rtf.format(-mins, 'minute');
    const hours = Math.round(mins / 60);
    if (Math.abs(hours) < 48) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.round(hours / 24), 'day');
  } catch {
    return formatDate(iso);
  }
}

function setStatus(stateName, text) {
  statusEl.dataset.state = stateName;
  statusEl.textContent = text;
}

function setCount(shown, total) {
  if (!total) {
    countEl.hidden = true;
    return;
  }
  countEl.hidden = false;
  if (shown === total) {
    countEl.textContent = total === 1 ? '1 nyhet' : `${total} nyheter`;
  } else {
    countEl.textContent = `Visar ${shown} av ${total}`;
  }
}

function renderSkeleton() {
  listEl.innerHTML = Array.from({ length: 4 })
    .map(
      (_, i) => `
      <article class="card skeleton${i === 0 ? ' featured' : ''}" aria-hidden="true">
        <div class="meta"><div class="skel-line short"></div></div>
        <div class="skel-line title"></div>
        <div class="skel-line body"></div>
        <div class="skel-line body"></div>
      </article>`
    )
    .join('');
}

function guessCategory(item) {
  if (item.category) return item.category;
  const hay = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
  if (/ai|llm|model|gpt|openai/.test(hay)) return 'AI';
  if (/chip|gpu|laptop|iphone|hardware|batteri/.test(hay)) return 'Hårdvara';
  if (/eu|lag|policy|regler|gdpr/.test(hay)) return 'Policy';
  if (/github|vercel|deploy|sdk|api|kod/.test(hay)) return 'Utveckling';
  if (/kv|infra|edge|cloud/.test(hay)) return 'Infra';
  return 'Teknik';
}

function normalizeItems(items) {
  return items.map((item) => ({ ...item, category: guessCategory(item) }));
}

function uniqueCategories(items) {
  return ['Alla', ...[...new Set(items.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'sv'))];
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  return state.allItems.filter((item) => {
    const categoryOk = state.category === 'Alla' || item.category === state.category;
    if (!categoryOk) return false;
    if (!q) return true;
    const hay = `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''}`.toLowerCase();
    return hay.includes(q);
  });
}

function syncClearButton() {
  const active = Boolean(state.query.trim()) || state.category !== 'Alla';
  clearFiltersBtn.hidden = !active;
}

function renderCategoryFilters() {
  const cats = uniqueCategories(state.allItems);
  if (!cats.includes(state.category)) {
    state.category = 'Alla';
  }

  categoryFiltersEl.innerHTML = cats
    .map(
      (cat) => `
      <button
        type="button"
        class="filter-chip"
        data-category="${escapeAttr(cat)}"
        aria-pressed="${cat === state.category ? 'true' : 'false'}"
      >${escapeHtml(cat)}</button>`
    )
    .join('');
}

function renderList() {
  const items = filteredItems();
  setCount(items.length, state.allItems.length);
  syncClearButton();

  if (!state.allItems.length) {
    listEl.innerHTML = '<div class="empty">Inga nyheter ännu. När boten postar till API:t dyker de upp här.</div>';
    return;
  }

  if (!items.length) {
    listEl.innerHTML =
      '<div class="empty">Inga träffar. Prova ett annat sökord eller kategori.</div>';
    return;
  }

  listEl.innerHTML = items
    .map((item, index) => {
      const featured = index === 0 && state.category === 'Alla' && !state.query.trim() ? ' featured' : '';
      const title = item.url
        ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      const link = item.url
        ? `<a class="read-more" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Läs mer</a>`
        : '<span></span>';

      return `
        <article class="card${featured}">
          <div class="meta">
            <button type="button" class="chip buttonish" data-category="${escapeAttr(item.category)}">${escapeHtml(item.category)}</button>
            <span class="source">${escapeHtml(item.source || 'Okänd källa')}</span>
            <span class="time" title="${escapeAttr(formatDate(item.publishedAt))}">${escapeHtml(formatRelative(item.publishedAt))}</span>
          </div>
          <h2>${title}</h2>
          <p>${escapeHtml(item.summary || '')}</p>
          <div class="card-footer">${link}</div>
        </article>
      `;
    })
    .join('');
}

function applyFiltersAndRender() {
  renderCategoryFilters();
  renderList();
}

function setItems(items) {
  state.allItems = normalizeItems(items);
  applyFiltersAndRender();
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

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function syncThemeButton() {
  themeToggle.textContent = currentTheme() === 'dark' ? 'Ljust läge' : 'Mörkt läge';
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem('tn-theme', next);
  } catch (_) {}
  syncThemeButton();
}

function clearFilters() {
  state.query = '';
  state.category = 'Alla';
  searchInput.value = '';
  applyFiltersAndRender();
}

async function loadNews() {
  const base = (window.TEKNIKNYHETER_CONFIG && window.TEKNIKNYHETER_CONFIG.apiBaseUrl) || '';
  setStatus('loading', 'Hämtar nyheter…');
  refreshBtn.disabled = true;
  renderSkeleton();

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/news`, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`API svarade ${res.status}`);
    }

    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    setItems(items);
    setStatus('live', 'Live från API');
  } catch (err) {
    console.warn(err);
    setItems(fallbackNews);
    setStatus('fallback', 'Visar lokal exempeldata');
  } finally {
    refreshBtn.disabled = false;
  }
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value;
    renderList();
  }, 120);
});

categoryFiltersEl.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-category]');
  if (!btn) return;
  state.category = btn.getAttribute('data-category') || 'Alla';
  applyFiltersAndRender();
});

listEl.addEventListener('click', (event) => {
  const btn = event.target.closest('.chip.buttonish[data-category]');
  if (!btn) return;
  state.category = btn.getAttribute('data-category') || 'Alla';
  applyFiltersAndRender();
});

clearFiltersBtn.addEventListener('click', clearFilters);
themeToggle.addEventListener('click', toggleTheme);
refreshBtn.addEventListener('click', loadNews);
syncThemeButton();
loadNews();
