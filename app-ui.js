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

// Kategori-platshållare för kort utan bild: färg och ikon per kategori (fast 16/9-yta, inget layout-hopp).
const CAT_LOOK = {
  Tesla: ['#e82127', '\u26a1'],
  Elbilar: ['#e82127', '\ud83d\udd0b'],
  NVIDIA: ['#76b900', '\ud83d\udda5\ufe0f'],
  AI: ['#7c5cff', '\ud83e\udd16'],
  xAI: ['#7c5cff', '\ud83e\udd16'],
  SpaceX: ['#2a7fc1', '\ud83d\ude80'],
  Neuralink: ['#00c2a8', '\ud83e\udde0'],
  Geopolitik: ['#d4a017', '\u2696\ufe0f'],
  'Elon Musk': ['#ff6b3d', '\u2728'],
  Politik: ['#8a6bd1', '\ud83c\udfdb\ufe0f'],
  Teknik: ['#6ea8ff', '\ud83d\udca1'],
};

function catLook(cat) {
  return CAT_LOOK[cat] || ['#6ea8ff', '\ud83d\udcf0'];
}

function cardHtml(item, index) {
  const featured = index === 0 && state.category === 'Alla' && !state.query.trim() ? ' featured' : '';
  const cat = item.category || 'Teknik';
  const catLower = String(cat).toLowerCase();
  const tags = (item.tags || [])
    .filter((t) => String(t).toLowerCase() !== catLower)
    .slice(0, 3)
    .map((t) => `<span class="chip">${escapeHtml(t)}</span>`)
    .join('');
  // Tom sammanfattning visas aldrig; äldre mallfyllnad ("Nyhet från X om Y.") döljs också.
  const summaryText = String(item.summary || '').trim();
  const summary = summaryText && !/^Nyhet från .+ om .+\.$/.test(summaryText) ? `<p>${escapeHtml(summaryText)}</p>` : '';
  const alsoLinks = (Array.isArray(item.alsoIn) ? item.alsoIn : [])
    .filter((r) => r && /^https?:\/\//i.test(r.url || ''))
    .slice(0, 3)
    .map((r) => `<a href="${escapeAttr(r.url)}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(r.title || '')}">${escapeHtml(r.source || 'Källa')}<span class="sr-only"> (öppnas i ny flik)</span></a>`);
  const also = alsoLinks.length ? `<p class="also-in" style="flex:none;margin:0;font-size:.82rem;opacity:.85">Också i: ${alsoLinks.join(', ')}</p>` : '';
  const lang = item.lang === 'sv' ? 'sv' : 'en';
  const title = item.url
    ? `<a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}<span class="sr-only"> (öppnas i ny flik)</span></a>`
    : escapeHtml(item.title);
  const media = item.imageUrl
    ? `<div class="card-media" aria-hidden="true"><img src="${escapeAttr(item.imageUrl)}" alt="" width="640" height="360" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></div>`
    : `<div class="card-media placeholder" data-cat="${escapeAttr(cat)}" style="--ph:${catLook(cat)[0]}" aria-hidden="true"><span class="ph-label">${catLook(cat)[1]} ${escapeHtml(cat)}</span></div>`;

  return `
        <article class="card${featured} has-image" lang="${lang}">
          ${media}
          <div class="card-body">
            <div class="meta">
              <button type="button" class="chip buttonish" data-category="${escapeAttr(cat)}" aria-label="Filtrera på ${escapeAttr(cat)}">${escapeHtml(cat)}</button>
              ${item.dygnet ? '<span class="chip" title="Från Dygnet på 60 sekunder">Dygnet</span>' : ''}
              ${tags}
              <span class="source">${escapeHtml(item.source || 'Okänd källa')}</span>
              <time class="time" datetime="${escapeAttr(item.publishedAt)}">${escapeHtml(formatRelative(item.publishedAt))}</time>
            </div>
            <h2>${title}</h2>
            ${summary}
            ${also}
            <div class="card-footer" style="margin-top:auto">
              <button type="button" class="ghost share-btn" data-share-id="${escapeAttr(item.id || '')}" aria-label="Dela ${escapeAttr(item.title || 'artikel')}">Dela</button>
            </div>
          </div>
        </article>`;
}

function moreHtml(remaining) {
  if (remaining <= 0) return '';
  const next = Math.min(PAGE_SIZE, remaining);
  return `<div class="more-wrap" style="grid-column:1/-1;display:flex;justify-content:center;padding:8px 0 16px"><button type="button" class="ghost more-btn" aria-label="Visa ${next} fler nyheter">Visa fler (${remaining} kvar)</button></div>`;
}

function renderList() {
  const items = filteredItems();
  const shown = Math.min(state.visible, items.length);
  setCount(shown, items.length, state.allItems.length);
  syncClearButton();
  writeUrlState();
  setBusy(false);

  if (!state.allItems.length) {
    listEl.innerHTML = '<div class="empty" role="status">Inga nyheter ännu.</div>';
    return;
  }
  if (!items.length) {
    const qLabel = state.query.trim() ? `«${escapeHtml(state.query.trim())}»` : 'filtret';
    listEl.innerHTML = `<div class="empty" role="status">Inga träffar för ${qLabel}.</div>`;
    return;
  }

  listEl.innerHTML = items.slice(0, shown).map(cardHtml).join('') + moreHtml(items.length - shown);
}

function showMore() {
  const items = filteredItems();
  const before = Math.min(state.visible, items.length);
  state.visible += PAGE_SIZE;
  const shown = Math.min(state.visible, items.length);
  const wrap = listEl.querySelector('.more-wrap');
  if (wrap) wrap.remove();
  const html = items
    .slice(before, shown)
    .map((item, i) => cardHtml(item, before + i))
    .join('') + moreHtml(items.length - shown);
  listEl.insertAdjacentHTML('beforeend', html);
  setCount(shown, items.length, state.allItems.length);
  const cards = listEl.querySelectorAll('article.card');
  const firstNew = cards[before];
  const link = firstNew && firstNew.querySelector('h2 a');
  if (link) link.focus({ preventScroll: false });
}

function applyFiltersAndRender() {
  renderCategoryFilters();
  renderList();
}

function setItems(items) {
  state.allItems = items;
  resetVisible();
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
  resetVisible();
  applyFiltersAndRender();
}

// Senast lyckade svar sparas lokalt (bara standardvyn, första ~40 korten, max ~200 kB) och visas direkt vid nästa laddning.
const SAVED_KEY = 'tn-news-v20260913m';
const SAVED_MAX_CHARS = 200000;
const SAVED_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function readSaved() {
  try {
    const o = JSON.parse(localStorage.getItem(SAVED_KEY) || 'null');
    if (!o || !Array.isArray(o.items) || !o.items.length || Date.now() - o.t > SAVED_MAX_AGE_MS) return null;
    return o.items;
  } catch (_) {
    return null;
  }
}

function writeSaved(items) {
  try {
    let list = items.slice(0, 40);
    let text = JSON.stringify({ t: Date.now(), items: list });
    while (text.length > SAVED_MAX_CHARS && list.length > 5) {
      list = list.slice(0, list.length - 5);
      text = JSON.stringify({ t: Date.now(), items: list });
    }
    if (text.length <= SAVED_MAX_CHARS) localStorage.setItem(SAVED_KEY, text);
  } catch (_) {
    /* lagring är bara en bonus */
  }
}

async function loadNews({ force = false } = {}) {
  const base = (window.TEKNIKNYHETER_CONFIG && window.TEKNIKNYHETER_CONFIG.apiBaseUrl) || '';
  refreshBtn.disabled = true;
  // Sparad data renderas direkt i standardvyn; skelettet visas bara om inget finns att visa.
  const saved = !force && !state.onlyTop ? readSaved() : null;
  if (saved) {
    setItems(saved);
    setStatus('loading', 'Visar sparade nyheter · uppdaterar…');
  } else {
    setStatus('loading', 'Hämtar nyheter…');
    if (state.onlyTop || !state.allItems.length) renderSkeleton();
  }

  try {
    const qs = new URLSearchParams({ editorial: '1', positive: state.onlyTop ? 'only' : '1', sort: 'priority' });
    if (force) qs.set('refresh', '1');
    const res = await fetch(`${base.replace(/\/$/, '')}/api/news?${qs}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`API svarade ${res.status}`);
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (saved || (state.allItems.length && !state.onlyTop)) {
      // Tyst byte: behåll hur många kort som visas.
      state.allItems = items;
      applyFiltersAndRender();
    } else {
      setItems(items);
    }
    if (!state.onlyTop && items.length) writeSaved(items);
    setStatus('live', 'Live · redaktionell prio');
  } catch (err) {
    console.warn(err);
    if (saved || (force && state.allItems.length && !state.onlyTop)) {
      setStatus('fallback', 'Visar tidigare hämtade nyheter');
    } else {
      setItems(EDITORIAL_FALLBACK);
      setStatus('fallback', 'Visar lokal exempeldata');
    }
  } finally {
    refreshBtn.disabled = false;
  }
}

let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = searchInput.value;
    resetVisible();
    renderList();
  }, 120);
});

sortSelect.addEventListener('change', () => {
  state.sort = SORTS.has(sortSelect.value) ? sortSelect.value : 'priority';
  resetVisible();
  renderList();
});

categoryFiltersEl.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-category]');
  if (!btn) return;
  state.category = btn.getAttribute('data-category') || 'Alla';
  resetVisible();
  applyFiltersAndRender();
});

// Bild som inte går att ladda byts mot kategori-placeholdern (error bubblar inte, därför capture).
listEl.addEventListener(
  'error',
  (event) => {
    const img = event.target;
    if (!img || img.tagName !== 'IMG') return;
    const media = img.closest('.card-media');
    if (!media || media.classList.contains('placeholder')) return;
    const chip = img.closest('.card') && img.closest('.card').querySelector('.chip.buttonish[data-category]');
    const cat = (chip && chip.getAttribute('data-category')) || 'Teknik';
    media.classList.add('placeholder');
    media.setAttribute('data-cat', cat);
    media.style.setProperty('--ph', catLook(cat)[0]);
    media.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'ph-label';
    label.textContent = `${catLook(cat)[1]} ${cat}`;
    media.appendChild(label);
  },
  true
);

listEl.addEventListener('click', (event) => {
  if (event.target.closest('.more-btn')) {
    showMore();
    return;
  }
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
  resetVisible();
  applyFiltersAndRender();
});

window.addEventListener('popstate', () => {
  const before = state.onlyTop;
  readUrlState();
  resetVisible();
  if (before !== state.onlyTop) loadNews();
  else applyFiltersAndRender();
});

if (topToggle) {
  topToggle.addEventListener('change', () => {
    state.onlyTop = topToggle.checked;
    try { localStorage.setItem(TOP_STORE_KEY, state.onlyTop ? '1' : '0'); } catch (_) {}
    resetVisible();
    loadNews();
  });
}

clearFiltersBtn.addEventListener('click', clearFilters);
themeToggle.addEventListener('click', toggleTheme);
refreshBtn.addEventListener('click', () => loadNews({ force: true }));
syncThemeButton();
readUrlState();
loadNews();
