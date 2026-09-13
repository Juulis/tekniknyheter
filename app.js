const EDITORIAL_FALLBACK = [
  {id:'local-1',title:'Tesla levererar rekordmånga bilar i kvartalet',summary:'Leveranserna ökar i flera marknader samtidigt som Supercharger-nätet växer.',url:'https://www.tesla.com',source:'EV Desk',category:'Tesla',tags:['Tesla','Elbilar'],sentiment:'positive',priorityScore:40,publishedAt:hoursAgo(2)},
  {id:'local-2',title:'NVIDIA och Jensen Huang visar nästa AI-GPU-generation',summary:'Nya chips lovar högre träningseffektivitet för LLM:er.',url:'https://www.nvidia.com',source:'Chip Wire',category:'NVIDIA',tags:['NVIDIA','Jensen Huang','AI'],sentiment:'positive',priorityScore:42,publishedAt:hoursAgo(5)},
  {id:'local-3',title:'xAI öppnar nya kapaciteter i Grok för utvecklare',summary:'API-utökningen gör det enklare att bygga produktivitetsverktyg.',url:'https://x.ai',source:'AI Brief',category:'AI',tags:['xAI','AI','Elon Musk'],sentiment:'positive',priorityScore:38,publishedAt:hoursAgo(9)},
  {id:'local-4',title:'SpaceX Starship klarar ny testmilstolpe',summary:'Lyckad flygsekvens stärker tidplanen för frekventa uppskjutningar.',url:'https://www.spacex.com',source:'Orbit Daily',category:'SpaceX',tags:['SpaceX','Elon Musk'],sentiment:'positive',priorityScore:35,publishedAt:hoursAgo(14)},
  {id:'local-5',title:'EU:s AI Act får tydligare vägledning för innovation',summary:'Riktlinjer ska göra det enklare att följa reglerna utan att bromsa utveckling.',url:'https://digital-strategy.ec.europa.eu',source:'Policy Watch',category:'Geopolitik',tags:['Geopolitik','AI'],sentiment:'positive',priorityScore:30,publishedAt:hoursAgo(20)},
];

const statusEl = document.getElementById('status');
const listEl = document.getElementById('news-list');
const refreshBtn = document.getElementById('refresh');
const themeToggle = document.getElementById('theme-toggle');
const countEl = document.getElementById('count');
const searchInput = document.getElementById('search');
const categoryFiltersEl = document.getElementById('category-filters');
const clearFiltersBtn = document.getElementById('clear-filters');
const sortSelect = document.getElementById('sort');

const SORTS = new Set(['priority', 'newest', 'oldest', 'title']);

const state = {
  allItems: [],
  query: '',
  category: 'Alla',
  sort: 'priority',
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
  countEl.textContent = shown === total ? `${total} nyheter` : `Visar ${shown} av ${total}`;
}

function setBusy(busy) {
  listEl.setAttribute('aria-busy', busy ? 'true' : 'false');
}

function renderSkeleton() {
  setBusy(true);
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

function uniqueCategories(items) {
  return ['Alla', ...[...new Set(items.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sv'))];
}

function sortItems(items) {
  const copy = [...items];
  if (state.sort === 'oldest') return copy.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  if (state.sort === 'title') return copy.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'sv'));
  if (state.sort === 'newest') return copy.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return copy.sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
}

function filteredItems() {
  const q = state.query.trim().toLowerCase();
  return sortItems(
    state.allItems.filter((item) => {
      if (state.category !== 'Alla' && item.category !== state.category) return false;
      if (!q) return true;
      const hay = `${item.title || ''} ${item.summary || ''} ${item.source || ''} ${item.category || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
      return hay.includes(q);
    })
  );
}

function syncClearButton() {
  clearFiltersBtn.hidden = !(state.query.trim() || state.category !== 'Alla' || state.sort !== 'priority');
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  state.query = params.get('q') || '';
  state.category = params.get('category') || 'Alla';
  const sort = params.get('sort') || 'priority';
  state.sort = SORTS.has(sort) ? sort : 'priority';
  searchInput.value = state.query;
  sortSelect.value = state.sort;
}

function writeUrlState() {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set('q', state.query.trim());
  if (state.category !== 'Alla') params.set('category', state.category);
  if (state.sort !== 'priority') params.set('sort', state.sort);
  const next = params.toString();
  const url = next ? `${window.location.pathname}?${next}` : window.location.pathname;
  if (url !== `${window.location.pathname}${window.location.search}`) history.replaceState(null, '', url);
}

function renderCategoryFilters() {
  const cats = uniqueCategories(state.allItems);
  if (!cats.includes(state.category)) state.category = 'Alla';
  categoryFiltersEl.innerHTML = cats
    .map(
      (cat) => `<button type="button" class="filter-chip" data-category="${escapeAttr(cat)}" aria-pressed="${cat === state.category}">${escapeHtml(cat)}</button>`
    )
    .join('');
}

async function shareItem(item) {
  const url = item.url || window.location.href;
  const title = item.title || 'Tekniknyheter';
  const text = item.summary || title;
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus('live', 'Länk kopierad');
    setTimeout(() => setStatus('live', 'Live · redaktionell prio'), 1600);
  } catch (_) {
    window.prompt('Kopiera länken', url);
  }
}

function renderList() {
  const items = filteredItems();
  setCount(items.length, state.allItems.length);
  syncClearButton();
  writeUrlState();
  setBusy(false);

  if (!state.allItems.length) {
    listEl.innerHTML = '<div class="empty" role="status">Inga nyheter ännu.</div>';
    return;
  }
  if (!items.length) {
    listEl.innerHTML = '<div class="empty" role="status">Inga träffar i redaktionell vy.</div>';
    return;
  }

  listEl.innerHTML = items
    .map((item, index) => {
      const featured = index === 0 && state.category === 'Alla' && !state.query.trim() ? ' featured' : '';
      const title = item.url
        ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a>`
        : escapeHtml(item.title);
      const tags = (item.tags || [])
        .slice(0, 4)
        .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
        .join('');
      const link = item.url
        ? `<a class="read-more" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Läs mer<span class="sr-only">: ${escapeHtml(item.title)}</span></a>`
        : '<span></span>';

      const cat = item.category || 'Teknik';
      const media = item.imageUrl
        ? `<a class="card-media" href="${escapeAttr(item.url || '#')}" target="_blank" rel="noopener noreferrer" tabindex="-1" aria-hidden="true"><img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></a>`
        : `<div class="card-media placeholder" data-cat="${escapeAttr(cat)}" aria-hidden="true"><span class="ph-label">${escapeHtml(cat)}</span></div>`;

      return `
        <article class="card${featured} has-image">
          ${media}
          <div class="card-body">
            <div class="meta">
              <button type="button" class="chip buttonish" data-category="${escapeAttr(cat)}" aria-label="Filtrera på ${escapeAttr(cat)}">${escapeHtml(cat)}</button>
              ${tags}
              <span class="source">${escapeHtml(item.source || 'Okänd källa')}</span>
              <time class="time" datetime="${escapeAttr(item.publishedAt)}">${escapeHtml(formatRelative(item.publishedAt))}</time>
            </div>
            <h2>${title}</h2>
            <p>${escapeHtml(item.summary || '')}</p>
            <div class="card-footer">
              ${link}
              <button type="button" class="ghost share-btn" data-share-id="${escapeAttr(item.id || '')}" aria-label="Dela ${escapeAttr(item.title || 'artikel')}">Dela</button>
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function applyFiltersAndRender() {
  renderCategoryFilters();
  renderList();
}

function setItems(items) {
  state.allItems = items;
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
  const dark = currentTheme() === 'dark';
  themeToggle.textContent = dark ? 'Ljust läge' : 'Mörkt läge';
  themeToggle.setAttribute('aria-pressed', dark ? 'true' : 'false');
}

function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('tn-theme', next); } catch (_) {}
  syncThemeButton();
}

function clearFilters() {
  state.query = '';
  state.category = 'Alla';
  state.sort = 'priority';
  searchInput.value = '';
  sortSelect.value = 'priority';
  applyFiltersAndRender();
}

async function loadNews({ force = false } = {}) {
  const base = (window.TEKNIKNYHETER_CONFIG && window.TEKNIKNYHETER_CONFIG.apiBaseUrl) || '';
  setStatus('loading', 'Hämtar nyheter…');
  refreshBtn.disabled = true;
  renderSkeleton();

  try {
    const qs = new URLSearchParams({ editorial: '1', positive: '1', sort: 'priority' });
    if (force) qs.set('refresh', '1');
    const res = await fetch(`${base.replace(/\/$/, '')}/api/news?${qs}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`API svarade ${res.status}`);
    const data = await res.json();
    setItems(Array.isArray(data.items) ? data.items : []);
    setStatus('live', 'Live · redaktionell prio');
  } catch (err) {
    console.warn(err);
    setItems(EDITORIAL_FALLBACK);
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

sortSelect.addEventListener('change', () => {
  state.sort = SORTS.has(sortSelect.value) ? sortSelect.value : 'priority';
  renderList();
});

categoryFiltersEl.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-category]');
  if (!btn) return;
  state.category = btn.getAttribute('data-category') || 'Alla';
  applyFiltersAndRender();
});

listEl.addEventListener('click', (event) => {
  const shareBtn = event.target.closest('.share-btn');
  if (shareBtn) {
    const id = shareBtn.getAttribute('data-share-id');
    const shareLabel = shareBtn.getAttribute('aria-label') || '';
    const item = state.allItems.find((x) => String(x.id) === String(id)) || state.allItems.find((x) => x.title && shareLabel.includes(x.title));
    if (item) shareItem(item);
    return;
  }
  const btn = event.target.closest('.chip.buttonish[data-category]');
  if (!btn) return;
  state.category = btn.getAttribute('data-category') || 'Alla';
  applyFiltersAndRender();
});

window.addEventListener('popstate', () => {
  readUrlState();
  applyFiltersAndRender();
});

clearFiltersBtn.addEventListener('click', clearFilters);
themeToggle.addEventListener('click', toggleTheme);
refreshBtn.addEventListener('click', () => loadNews({ force: true }));
syncThemeButton();
readUrlState();
loadNews();
