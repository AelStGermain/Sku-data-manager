'use strict';

const UICatalog = (() => {
  let _search    = '';
  let _retailer  = 'all';
  let _category  = 'all';
  let _source    = 'all';
  let _enriching = false;   // prevent concurrent enrichment runs

  // ── helpers ────────────────────────────────
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function srcBadge(src) {
    if (src === 'open_food_facts')    return `<span class="source-badge off" title="Open Food Facts">OFF</span>`;
    if (src === 'open_products_facts') return `<span class="source-badge opf" title="Open Products Facts">OPF</span>`;
    return '';
  }

  function completenessColor(pct) {
    if (pct >= 80) return 'var(--success)';
    if (pct >= 50) return 'var(--warning)';
    return 'var(--danger)';
  }

  // ── card ───────────────────────────────────
  function renderCard(p, retailers) {
    const pct  = DB.computeCompleteness(p);
    const col  = completenessColor(pct);
    const img  = esc(p.imageUrl || '');
    const name = esc(p.name || 'Sin nombre');
    const brand = esc(p.brand || '—');
    const ean   = esc(p.ean);

    const retailerBadges = retailers
      .filter(r => p.retailers?.[r.id])
      .map(r => `<span class="r-badge" style="background:${r.color}" title="${esc(r.name)}">${esc(r.name[0])}</span>`)
      .join('');

    return `
<article class="product-card" data-ean="${ean}" onclick="App.openSheet('${ean}')" title="Ver Technical Sheet">
  <div class="card-img-wrap">
    <img class="card-img" src="${img || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect fill=%22%231A1D27%22 width=%22300%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%234F6EF7%22 font-size=%2228%22 font-family=%22sans-serif%22%3ESKU%3C/text%3E%3C/svg%3E'}"
         alt="${name}"
         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect fill=%22%231A1D27%22 width=%22300%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%234F6EF7%22 font-size=%2228%22 font-family=%22sans-serif%22%3ESKU%3C/text%3E%3C/svg%3E'">
    <div class="card-badges">
      <div class="r-badges">${retailerBadges}</div>
      ${srcBadge(p.dataSource)}
    </div>
  </div>
  <div class="card-body">
    <p class="card-brand">${brand}</p>
    <h3 class="card-name">${name}</h3>
    <p class="card-ean">EAN: ${ean}</p>
    <div class="completeness-row">
      <div class="comp-track"><div class="comp-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="comp-label" style="color:${col}">${pct}%</span>
    </div>
  </div>
  <div class="card-footer">
    <button class="btn-card-cta" onclick="event.stopPropagation();App.openSheet('${ean}')">Ver Technical Sheet →</button>
  </div>
</article>`;
  }

  // ── empty state ────────────────────────────
  function renderEmpty(hasProducts) {
    return hasProducts
      ? `<div class="empty-state">
           <div class="empty-icon">🔍</div>
           <h3>Sin resultados</h3>
           <p>Intenta con otros filtros de búsqueda.</p>
           <button class="btn-outline" onclick="UICatalog.clearFilters()">Limpiar filtros</button>
         </div>`
      : `<div class="empty-state">
           <div class="empty-icon">📦</div>
           <h3>Sin productos aún</h3>
           <p>Importa tu primer archivo de SKUs para comenzar.</p>
           <button class="btn-primary" onclick="App.navigateTo('import')">Importar SKUs</button>
         </div>`;
  }

  // ── main render ────────────────────────────
  function render() {
    const el = document.getElementById('view-catalog');
    if (!el) return;

    const all       = DB.getProductsArray();
    const retailers = DB.getRetailers();
    const q = _search.toLowerCase();

    let filtered = all;
    if (q)              filtered = filtered.filter(p => (p.name||'').toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q) || p.ean.includes(q));
    if (_retailer !== 'all') filtered = filtered.filter(p => p.retailers?.[_retailer]);
    if (_category !== 'all') filtered = filtered.filter(p => Object.values(p.retailers||{}).some(r => r.category === _category));
    if (_source   !== 'all') filtered = filtered.filter(p => p.dataSource === _source);

    // Stats
    const enriched = all.filter(p => p.dataSource !== 'manual').length;
    const noData   = all.filter(p => DB.computeCompleteness(p) < 40).length;

    // Category options
    const cats = [...new Set(all.flatMap(p => Object.values(p.retailers||{}).map(r => r.category).filter(Boolean)))].sort();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Catálogo de Productos</h1>
    <p class="view-sub">${all.length} SKU${all.length !== 1 ? 's' : ''} en el sistema</p>
  </div>
  <div class="view-actions">
    <button class="btn-teal" id="enrich-all-btn" onclick="UICatalog.enrichAll()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
      Enriquecer catálogo
    </button>
    <button class="btn-outline" onclick="App.exportCSV()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar CSV
    </button>
    <button class="btn-primary" onclick="App.navigateTo('import')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Importar SKUs
    </button>
  </div>
</header>

<div class="stats-bar">
  <div class="stat-card">
    <span class="stat-v">${all.length}</span>
    <span class="stat-l">SKUs totales</span>
  </div>
  <div class="stat-card">
    <span class="stat-v">${retailers.length}</span>
    <span class="stat-l">Retailers activos</span>
  </div>
  <div class="stat-card accent">
    <span class="stat-v">${enriched}</span>
    <span class="stat-l">Enriquecidos (API)</span>
  </div>
  <div class="stat-card warn">
    <span class="stat-v">${noData}</span>
    <span class="stat-l">Datos incompletos</span>
  </div>
</div>

<div class="filters-bar">
  <div class="search-wrap">
    <svg class="search-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <input id="cat-search" class="search-inp" type="text" placeholder="Buscar por nombre, marca o EAN…" value="${esc(_search)}" oninput="UICatalog.setSearch(this.value)">
  </div>
  <select class="filter-sel" onchange="UICatalog.setCategory(this.value)">
    <option value="all" ${_category==='all'?'selected':''}>Todas las categorías</option>
    ${cats.map(c=>`<option value="${esc(c)}" ${_category===c?'selected':''}>${esc(c)}</option>`).join('')}
  </select>
  <select class="filter-sel" onchange="UICatalog.setSource(this.value)">
    <option value="all" ${_source==='all'?'selected':''}>Todas las fuentes</option>
    <option value="open_food_facts" ${_source==='open_food_facts'?'selected':''}>Open Food Facts</option>
    <option value="open_products_facts" ${_source==='open_products_facts'?'selected':''}>Open Products Facts</option>
    <option value="manual" ${_source==='manual'?'selected':''}>Manual</option>
  </select>
  ${(_search||_retailer!=='all'||_category!=='all'||_source!=='all') ? '<button class="btn-clear" onclick="UICatalog.clearFilters()">Limpiar ×</button>' : ''}
</div>

<p class="result-count">${filtered.length} resultado${filtered.length!==1?'s':''}</p>

${filtered.length === 0
  ? renderEmpty(all.length > 0)
  : `<div class="product-grid">${filtered.map(p => renderCard(p, retailers)).join('')}</div>`}
`;
  }

  // ── public setters (called inline) ────────
  function setSearch(v)   { _search   = v;   render(); }
  function setRetailer(v) { _retailer = v;   render(); }
  function setCategory(v) { _category = v;   render(); }
  function setSource(v)   { _source   = v;   render(); }
  function clearFilters() {
    _search = ''; _retailer = 'all'; _category = 'all'; _source = 'all';
    const inp = document.getElementById('cat-search');
    if (inp) inp.value = '';
    document.querySelectorAll('.sidebar-r-btn').forEach(b => b.classList.toggle('active', b.dataset.rid === 'all'));
    render();
  }

  // ── enrich all products via OFF API ────────
  async function enrichAll(silent = false) {
    if (_enriching) return;
    const products = DB.getProductsArray();
    const toEnrich = products.filter(p => !p.imageUrl);
    if (toEnrich.length === 0) {
      if (!silent) App.showToast('Todos los productos ya tienen imagen', 'info');
      return;
    }

    _enriching = true;
    const btn = document.getElementById('enrich-all-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin-ico">↻</span> Enriqueciendo (0/${toEnrich.length})…`; }
    if (!silent) App.showToast(`Consultando Open Food Facts para ${toEnrich.length} productos…`, 'info');

    let done = 0, found = 0;
    for (const product of toEnrich) {
      const apiData = await API.enrichProduct(product.ean);
      if (apiData) {
        const merged = API.mergeEnriched(product, apiData);
        DB.saveProduct(merged);
        found++;
        // Live-update the card image if visible
        const imgEl = document.querySelector(`[data-ean="${product.ean}"] .card-img`);
        if (imgEl && merged.imageUrl) imgEl.src = merged.imageUrl;
      }
      done++;
      if (btn) btn.innerHTML = `<span class="spin-ico">↻</span> Enriqueciendo (${done}/${toEnrich.length})…`;
    }

    _enriching = false;
    if (found > 0) App.showToast(`${found} productos actualizados con Open Food Facts`, 'success');
    if (btn) { btn.disabled = false; btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Enriquecer catálogo`; }
    render(); // full re-render to update cards
  }

  return { render, setSearch, setRetailer, setCategory, setSource, clearFilters, enrichAll };
})();
