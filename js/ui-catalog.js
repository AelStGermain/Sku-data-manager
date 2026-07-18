'use strict';

const UICatalog = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── filter / sort state ─────────────────────
  let _search        = '';
  let _retailer      = 'all';
  let _category      = 'all';
  let _source        = 'all';
  let _statusFilter  = 'all';
  let _showIncomplete= false;
  let _sortBy        = 'name';   // name | brand | completeness | updatedAt
  let _sortDir       = 'asc';
  let _imagePref     = localStorage.getItem('ss_imagePref') || 'main';
  let _enriching     = false;
  let _viewMode      = localStorage.getItem('ss_viewMode') || 'grid';
  let _page          = 0;
  const PAGE_SIZE    = 50;

  // ── export dropdown state ───────────────
  let _exportDropdownOpen = false;

  function toggleExportDropdown(e) {
    if (e) e.stopPropagation();
    _exportDropdownOpen = !_exportDropdownOpen;
    const menu = document.getElementById('export-dropdown-menu');
    if (menu) {
      menu.classList.toggle('show', _exportDropdownOpen);
    }
  }

  document.addEventListener('click', (e) => {
    const container = document.querySelector('.export-dropdown-container');
    if (container && !container.contains(e.target)) {
      _exportDropdownOpen = false;
      const menu = document.getElementById('export-dropdown-menu');
      if (menu) menu.classList.remove('show');
    }
  });

  // ── helpers ─────────────────────────────────
  function srcBadge(src) {
    if (src === 'open_food_facts')     return `<span class="source-badge off">API</span>`;
    if (src === 'open_products_facts') return `<span class="source-badge opf">API_OPF</span>`;
    if (src === 'firebase')            return `<span class="source-badge firebase" title="Importado desde Firebase / App de Terreno">🔥 Firebase</span>`;
    if (src === 'levantamiento')       return `<span class="source-badge firebase" title="Importado desde App de Terreno">📱 Terreno</span>`;
    return '';
  }
  function completenessColor(pct) {
    if (pct >= 80) return 'var(--success)';
    if (pct >= 50) return 'var(--warning)';
    return 'var(--danger)';
  }
  function statusPill(s) {
    const st = (SKU_STATUSES||[]).find(x => x.value === s);
    if (!st) return '';
    return `<span class="status-pill" style="background:${st.color}20;color:${st.color};border-color:${st.color}40">${st.label}</span>`;
  }
  function normalizeStr(s) {
    return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  }
  function sortProducts(arr) {
    const dir = _sortDir === 'asc' ? 1 : -1;
    return [...arr].sort((a,b) => {
      let va, vb;
      if (_sortBy === 'completeness') { va = DB.computeCompleteness(a); vb = DB.computeCompleteness(b); }
      else if (_sortBy === 'updatedAt') { va = a.updatedAt||''; vb = b.updatedAt||''; }
      else { va = normalizeStr(a[_sortBy]); vb = normalizeStr(b[_sortBy]); }
      if (va < vb) return -dir;
      if (va > vb) return  dir;
      return 0;
    });
  }

  function getPreferredImage(p) {
    const retailerImgs = p.retailers ? Object.values(p.retailers).map(r => r.imageUrl).filter(Boolean) : [];
    const firstRetailerImg = retailerImgs[0] || '';

    if (_imagePref === 'off') {
      return p.offImageUrl || p.imageUrl || firstRetailerImg || '';
    }
    if (_imagePref.startsWith('retailer_')) {
      const rid = _imagePref.split('_')[1];
      return p.retailers?.[rid]?.imageUrl || p.imageUrl || p.offImageUrl || firstRetailerImg || '';
    }
    // Default 'main' image pref
    return p.imageUrl || p.offImageUrl || firstRetailerImg || '';
  }

  // ── card ─────────────────────────────────────
  function renderCard(p, retailers) {
    const pct   = DB.computeCompleteness(p);
    const col   = completenessColor(pct);
    const rawImg = getPreferredImage(p);
    const img   = esc(rawImg);
    const name  = esc(p.name || 'Sin nombre');
    const brand = esc(p.brand || '—');
    const ean   = esc(p.ean);
    const noImg = !rawImg;
    const isPendingVispera = p.visperaId === null || p.visperaId === undefined;
    const pendingBadge = isPendingVispera ? `<span class="status-badge conflict" title="Falta en Vispera" style="font-size:10px; margin-left:6px;">⚠️ Vispera</span>` : '';

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const retailerBadges = retailers
      .filter(r => { const h = p.holdings || p.retailers || {}; return h[r.id]; })
      .map(r => {
        const hData = (p.holdings || p.retailers || {})[r.id];
        let extra = '';
        if (hData.isDiscontinued) {
          extra = `<span style="color:#ffcccc; margin-left:4px; font-weight:700">⨯</span>`;
        } else if (hData.createdAt && hData.createdAt > thirtyDaysAgo) {
          extra = `<span style="color:#ffffaa; margin-left:4px; font-weight:700">★</span>`;
        }
        return `<span class="r-badge" style="background:${r.color}; width:auto; padding:0 6px; border-radius:10px" title="${esc(r.name)}${hData.isDiscontinued ? ' (Discontinuado)' : ''}">${esc(r.name[0])}${extra}</span>`;
      })
      .join('');

    return `
<article class="product-card stagger-in"
  data-ean="${ean}"
  onclick="App.openSheet('${ean}')"
  title="Ver Technical Sheet">

  <div class="card-img-wrap">
    <img class="card-img${noImg?' no-img':''}" src="${img}" alt="${name}" onerror="this.classList.add('no-img');this.src=''">
    <div class="card-badges">
      <div class="r-badges">${retailerBadges}</div>
      ${srcBadge(p.dataSource)}
    </div>
  </div>
  <div class="card-body">
    <p class="card-brand">${brand}</p>
    <h3 class="card-name" style="display:flex;align-items:center;">${name} ${pendingBadge}</h3>
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

  // ── list row ─────────────────────────────────
  function renderListRow(p, retailers) {
    const pct     = DB.computeCompleteness(p);
    const col     = completenessColor(pct);
    const rawImg  = getPreferredImage(p);
    const img     = esc(rawImg);
    const name    = esc(p.name || 'Sin nombre');
    const brand   = esc(p.brand || '—');
    const ean     = esc(p.ean);
    const noImg   = !rawImg;
    const isPendingVispera = p.visperaId === null || p.visperaId === undefined;
    const pendingBadge = isPendingVispera ? `<span class="status-badge conflict" title="Falta en Vispera" style="font-size:10px; margin-left:6px;">⚠️ Vispera</span>` : '';

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const retailerBadges = retailers
      .filter(r => { const h = p.holdings || p.retailers || {}; return h[r.id]; })
      .map(r => {
        const hData = (p.holdings || p.retailers || {})[r.id];
        let extra = '';
        if (hData.isDiscontinued) {
          extra = `<span style="color:#ffcccc; margin-left:4px; font-weight:700">⨯</span>`;
        } else if (hData.createdAt && hData.createdAt > thirtyDaysAgo) {
          extra = `<span style="color:#ffffaa; margin-left:4px; font-weight:700">★</span>`;
        }
        return `<span class="r-badge" style="background:${r.color}; width:auto; padding:0 6px; border-radius:10px" title="${esc(r.name)}${hData.isDiscontinued ? ' (Discontinuado)' : ''}">${esc(r.name[0])}${extra}</span>`;
      })
      .join('');

    return `
<div class="product-list-row stagger-in" data-ean="${ean}" onclick="App.openSheet('${ean}')">
  <div class="pl-img">
    <img class="${noImg?'no-img':''}" style="width:100%;height:100%;object-fit:contain;padding:4px${noImg?';display:none':''}" src="${img}" alt="${name}" onerror="this.style.display='none'">
  </div>
  <div class="pl-ean">${ean}</div>
  <div class="pl-info">
    <span class="pl-name" style="display:flex;align-items:center;">${name} ${pendingBadge}</span>
    <span class="pl-brand">${brand}</span>
  </div>
  <div class="pl-badges">${retailerBadges} ${srcBadge(p.dataSource)}</div>
  <div class="pl-comp">
    <div class="pl-comp-bar"><div class="pl-comp-fill" style="width:${pct}%;background:${col}"></div></div>
    <span class="pl-comp-lbl" style="color:${col}">${pct}%</span>
  </div>
  <div class="pl-actions"><button class="btn-mini" onclick="event.stopPropagation();App.openSheet('${ean}')">Ver Sheet →</button></div>
</div>`;
  }

  function renderEmpty(hasProducts) {
    return hasProducts
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Sin resultados</h3><p>Intenta con otros filtros de búsqueda.</p><button class="btn-outline" onclick="UICatalog.clearFilters()">Limpiar filtros</button></div>`
      : `<div class="empty-state"><div class="empty-icon">📦</div><h3>Sin productos aún</h3><p>Importa tu primer archivo de SKUs para comenzar.</p><button class="btn-primary" onclick="App.navigateTo('import')">Importar SKUs</button></div>`;
  }



  // ── pagination bar ────────────────────────────
  function renderPagination(total) {
    if (total <= PAGE_SIZE) return '';
    const totalPages = Math.ceil(total / PAGE_SIZE);
    const cur = _page;

    // Build page number window: always show first, last, current ±2, with … gaps
    const pages = new Set([0, totalPages-1, cur, cur-1, cur+1, cur-2, cur+2]);
    const sorted = [...pages].filter(p => p >= 0 && p < totalPages).sort((a,b) => a-b);
    let nums = '';
    let prev = -1;
    for (const p of sorted) {
      if (prev !== -1 && p - prev > 1) nums += `<span class="pg-ellipsis">…</span>`;
      nums += `<button class="pg-num ${p===cur?'active':''}" onclick="UICatalog.goPage(${p})">${p+1}</button>`;
      prev = p;
    }

    const from = cur * PAGE_SIZE + 1;
    const to   = Math.min((cur+1) * PAGE_SIZE, total);

    return `
<div class="pagination">
  <span class="pg-info">${from}–${to} de ${total} productos</span>
  <div class="pg-controls">
    <button class="pg-btn" ${cur===0?'disabled':''} onclick="UICatalog.goPage(0)" title="Primera página">«</button>
    <button class="pg-btn" ${cur===0?'disabled':''} onclick="UICatalog.goPage(${cur-1})" title="Anteriores">‹ Anteriores</button>
    <div class="pg-nums">${nums}</div>
    <button class="pg-btn" ${cur===totalPages-1?'disabled':''} onclick="UICatalog.goPage(${cur+1})" title="Siguientes">Siguientes ›</button>
    <button class="pg-btn" ${cur===totalPages-1?'disabled':''} onclick="UICatalog.goPage(${totalPages-1})" title="Última página">»</button>
  </div>
</div>`;
  }

  // ── main render ──────────────────────────────
  function render() {
    const el = document.getElementById('view-catalog');
    if (!el) return;

    const all       = DB.getProductsArray();
    const retailers = DB.getHoldings();
    const q  = normalizeStr(_search);

    let filtered = all;
    if (q) filtered = filtered.filter(p => {
      if (normalizeStr(p.name).includes(q))  return true;
      if (normalizeStr(p.brand).includes(q)) return true;
      if (p.ean.includes(_search))           return true;
      // search in retailer customerId
      if (Object.values(p.retailers||{}).some(r => normalizeStr(r.customerId).includes(q))) return true;
      return false;
    });
    if (_retailer !== 'all')  filtered = filtered.filter(p => { const h = p.holdings || p.retailers || {}; return h[_retailer]; });
    if (_category !== 'all')  filtered = filtered.filter(p => { const h = p.holdings || p.retailers || {}; return Object.values(h).some(r => {
      const rCats = Array.isArray(r.localCategoryName) ? r.localCategoryName : (Array.isArray(r.category) ? r.category : [r.localCategoryName || r.category]);
      return rCats.includes(_category);
    }); });
    if (_source   !== 'all')  filtered = filtered.filter(p => p.dataSource === _source);
    if (_statusFilter === 'new') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      filtered = filtered.filter(p => {
        if (p.createdAt && p.createdAt > thirtyDaysAgo) return true;
        const h = p.holdings || p.retailers || {};
        return Object.values(h).some(r => r.createdAt && r.createdAt > thirtyDaysAgo);
      });
    } else if (_statusFilter === 'discontinued') {
      filtered = filtered.filter(p => {
        const h = p.holdings || p.retailers || {};
        return Object.values(h).some(r => r.isDiscontinued);
      });
    } else if (_statusFilter !== 'all') {
      filtered = filtered.filter(p => (p.status||'active') === _statusFilter);
    }
    if (_showIncomplete)      filtered = filtered.filter(p => DB.computeCompleteness(p) < 50);

    filtered = sortProducts(filtered);
    const page = filtered.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE);

    const enriched = all.filter(p => p.dataSource !== 'manual').length;
    const noData   = all.filter(p => DB.computeCompleteness(p) < 40).length;
    const cats = [...new Set(all.flatMap(p => { const h = p.holdings || p.retailers || {}; return Object.values(h).flatMap(r => Array.isArray(r.localCategoryName) ? r.localCategoryName : (Array.isArray(r.category) ? r.category : [r.localCategoryName || r.category])).filter(Boolean); }))].sort();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Catálogo de Productos</h1>
    <p class="view-sub">${all.length} SKU${all.length !== 1 ? 's' : ''} en el sistema</p>
  </div>
  <div class="view-actions">
    <div class="view-toggle-btns">
      <button class="view-toggle-btn ${_viewMode==='grid'?'active':''}" onclick="UICatalog.setViewMode('grid')" title="Vista grilla">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
      </button>
      <button class="view-toggle-btn ${_viewMode==='list'?'active':''}" onclick="UICatalog.setViewMode('list')" title="Vista lista">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      </button>
    </div>
    <button class="btn-teal" id="enrich-all-btn" onclick="UICatalog.enrichAll()" ${_enriching?'disabled':''}>
      ${_enriching ? `<span class="spin-ico">↻</span> Enriqueciendo…` : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Enriquecer catálogo`}
    </button>

    <div class="export-dropdown-container" style="position:relative; display:inline-block;">
      <button class="btn-outline" onclick="UICatalog.toggleExportDropdown(event)" title="Exportar catálogo en CSV">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Exportar Datos ▾
      </button>
      <div id="export-dropdown-menu" class="export-dropdown-menu">
        <button class="export-dropdown-item" onclick="App.exportCSV()">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Todo (Master CSV)
        </button>
        <div class="export-dropdown-divider"></div>
        ${retailers.map(r => `
          <button class="export-dropdown-item" onclick="App.exportRetailerCSV('${esc(r.id)}')">
            <span class="r-dot" style="background:${esc(r.color)}; width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:4px;"></span>
            Holding ${esc(r.name)}
          </button>
        `).join('')}
      </div>
    </div>
    <button class="btn-primary" onclick="App.navigateTo('import')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Importar SKUs
    </button>
    <button class="btn-primary" onclick="UISheet.openCreate()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Nuevo SKU
    </button>

  </div>
</header>

<div class="stats-bar">
  <div class="stat-card"><span class="stat-v">${all.length}</span><span class="stat-l">SKUs totales</span></div>
  <div class="stat-card"><span class="stat-v">${retailers.length}</span><span class="stat-l">Holdings activos</span></div>
</div>

<!-- Sort bar + Status quick filters -->
<div class="sort-filter-bar">
  <div class="sort-btns">
    <span class="sort-label">Ordenar:</span>
    ${[['name','Nombre'],['brand','Marca'],['completeness','Completitud'],['updatedAt','Recientes']].map(([k,l])=>`
    <button class="sort-btn ${_sortBy===k?'active':''}" onclick="UICatalog.setSortBy('${k}')">
      ${l} ${_sortBy===k ? (_sortDir==='asc'?'↑':'↓') : ''}  
    </button>`).join('')}
  </div>
  <div class="status-filter-pills">
    <button class="spill ${_statusFilter==='all'?'active':''}" onclick="UICatalog.setStatusFilter('all')">Todos</button>
    ${(SKU_STATUSES||[]).map(s=>`
    <button class="spill" style="${_statusFilter===s.value?`background:${s.color}20;color:${s.color};border-color:${s.color}40`:''}"
      onclick="UICatalog.setStatusFilter('${s.value}')">${s.label}</button>`).join('')}
    <button class="spill ${_showIncomplete?'active':''}" onclick="UICatalog.toggleIncomplete()" style="${_showIncomplete?'background:var(--warning-dim);color:var(--warning);border-color:var(--warning)40':''}">⚠ Incompletos</button>
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
    <option value="firebase" ${_source==='firebase'?'selected':''}>🔥 Firebase (Terreno)</option>
    <option value="levantamiento" ${_source==='levantamiento'?'selected':''}>📱 App Terreno</option>
    <option value="open_food_facts" ${_source==='open_food_facts'?'selected':''}>API Rest (Auto)</option>
    <option value="open_products_facts" ${_source==='open_products_facts'?'selected':''}>API OPF</option>
    <option value="manual" ${_source==='manual'?'selected':''}>Manual / Excel</option>
  </select>
  <div style="border-left:1px solid var(--border); margin:0 8px; height:24px;"></div>
  <select class="filter-sel" style="background-color: var(--card-bg); font-weight: 500;" onchange="UICatalog.setImagePref(this.value)">
    <option value="main" ${_imagePref==='main'?'selected':''}>👁️ Imagen: Principal</option>
    <option value="off" ${_imagePref==='off'?'selected':''}>👁️ Imagen: API</option>
    ${retailers.map(r=>`<option value="retailer_${esc(r.id)}" ${_imagePref===`retailer_${r.id}`?'selected':''}>👁️ Imagen: ${esc(r.name)}</option>`).join('')}
  </select>
  ${(_search||_retailer!=='all'||_category!=='all'||_source!=='all') ? '<button class="btn-clear" onclick="UICatalog.clearFilters()">Limpiar ×</button>' : ''}
</div>

<p class="result-count">${filtered.length} resultado${filtered.length!==1?'s':''}${filtered.length>PAGE_SIZE?` &nbsp;·&nbsp; Página ${_page+1} de ${Math.ceil(filtered.length/PAGE_SIZE)}`:''}</p>



${filtered.length === 0
  ? renderEmpty(all.length > 0)
  : _viewMode === 'list'
    ? `<div class="product-list-header">
        <span></span><span>EAN</span><span>Producto</span><span>Retailers</span><span>Fuente</span><span>Completitud</span><span></span>
       </div>
       <div class="product-list">${page.map(p => renderListRow(p, retailers)).join('')}</div>`
    : `<div class="product-grid">${page.map(p => renderCard(p, retailers)).join('')}</div>`}

${renderPagination(filtered.length)}`;
  }



  // ── filter / sort / quick-filter setters ────
  let _searchTimer = null;
  function setSearch(v) {
    _search = v; // Update state immediately
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      _page = 0;
      const wasFocused = document.activeElement && document.activeElement.id === 'cat-search';
      const caret = wasFocused ? document.activeElement.selectionStart : 0;
      render();
      if (wasFocused) {
        const inp = document.getElementById('cat-search');
        if (inp) {
          inp.focus();
          inp.setSelectionRange(caret, caret);
        }
      }
    }, 250);
  }

  function setRetailer(v)      { _retailer      = v;   _page = 0; render(); }
  function setCategory(v)      { _category      = v;   _page = 0; render(); }
  function setSource(v)        { _source        = v;   _page = 0; render(); }
  function setStatusFilter(v)  { _statusFilter  = v;   _page = 0; render(); }
  function setSortBy(k)        { if(_sortBy===k) _sortDir=_sortDir==='asc'?'desc':'asc'; else {_sortBy=k;_sortDir='asc';} _page=0; render(); }
  function setImagePref(v)     { _imagePref = v; localStorage.setItem('ss_imagePref', v); render(); }
  function toggleIncomplete()  { _showIncomplete = !_showIncomplete; _page = 0; render(); }
  function setViewMode(m)      { _viewMode = m; localStorage.setItem('ss_viewMode', m); render(); }
  function goPage(n)           { _page = n; render(); document.querySelector('.main-content')?.scrollTo({top:0,behavior:'smooth'}); }
  function clearFilters() {
    _search=''; _retailer='all'; _category='all'; _source='all';
    _statusFilter='all'; _showIncomplete=false; _page=0;
    const inp = document.getElementById('cat-search');
    if (inp) inp.value = '';
    document.querySelectorAll('.sidebar-r-btn').forEach(b => b.classList.toggle('active', b.dataset.rid==='all'));
    render();
  }

  // ── single-product delete (from list row) ───
  function deleteOne(ean) {
    const p = DB.getProduct(ean);
    if (!p) return;
    if (!confirm(`¿Eliminar "${p.name||ean}"? Esta acción se puede deshacer.`)) return;
    DB.deleteProduct(ean);
    App.showToast(`Producto eliminado. Puedes deshacer con ↩ Deshacer.`, 'info');
    render();
    App.checkUndo();
  }



  // ── enrich all ───────────────────────────────
  async function enrichAll(silent = false) {
    if (_enriching) return;
    const products = DB.getProductsArray();
    const toEnrich = products.filter(p => !p.imageUrl);
    if (toEnrich.length === 0) { if (!silent) App.showToast('Todos los productos ya tienen imagen', 'info'); return; }

    _enriching = true;
    render(); // Refleja estado disabled del botón de inmediato
    if (!silent) App.showToast(`Enriqueciendo en segundo plano ${toEnrich.length} productos…`, 'info');

    // Desacoplar la ejecución para que sobreviva la navegación de vistas
    (async () => {
      let done = 0, found = 0;
      let batchToSave = [];
      
      // Procesar en chunks de 10 concurrentes
      const chunkSize = 10;
      for (let i = 0; i < toEnrich.length; i += chunkSize) {
        const chunk = toEnrich.slice(i, i + chunkSize);
        
        await Promise.all(chunk.map(async (product) => {
          const apiData = await API.enrichProduct(product.ean);
          if (apiData) {
            const merged = API.mergeEnriched(product, apiData);
            batchToSave.push(merged);
            found++;
            const imgEl = document.querySelector(`[data-ean="${product.ean}"] .card-img`);
            if (imgEl && merged.imageUrl) imgEl.src = merged.imageUrl;
          }
          done++;
        }));
        
        // Save batch if it reaches threshold (e.g., 20)
        if (batchToSave.length >= 20) {
          await DB.saveProducts([...batchToSave]);
          batchToSave = [];
        }
        
        // Actualizar botón si existe en el DOM
        const btn = document.getElementById('enrich-all-btn');
        if (btn) btn.innerHTML = `<span class="spin-ico">↻</span> Enriqueciendo (${done}/${toEnrich.length})…`;
        
        // Espera de 1 segundo entre chunks para no saturar la API (aprox 10 req/s)
        await new Promise(r => setTimeout(r, 1000));
      }
      
      // Save remaining
      if (batchToSave.length > 0) {
        await DB.saveProducts(batchToSave);
      }
      _enriching = false;
      if (found > 0) App.showToast(`${found} productos actualizados usando API`, 'success');
      
      // Rearmar la vista si el usuario está en el catálogo actual
      if (document.getElementById('view-catalog')) {
        render();
      }
    })();
  }

  return {
    render,
    setSearch, setRetailer, setCategory, setSource, setStatusFilter, setSortBy, toggleIncomplete, setImagePref,
    clearFilters, setViewMode, goPage, enrichAll, deleteOne,
    toggleExportDropdown
  };
})();
