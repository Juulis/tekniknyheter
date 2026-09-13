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
