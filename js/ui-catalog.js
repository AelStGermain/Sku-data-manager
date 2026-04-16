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

  // ── bulk-edit state ─────────────────────
  let _selectMode = false;
  let _selected   = new Set();

  // ── helpers ─────────────────────────────────
  function srcBadge(src) {
    if (src === 'open_food_facts')     return `<span class="source-badge off">OFF</span>`;
    if (src === 'open_products_facts') return `<span class="source-badge opf">OPF</span>`;
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
    if (_imagePref === 'off') return p.offImageUrl || p.imageUrl || '';
    if (_imagePref.startsWith('retailer_')) {
      const rid = _imagePref.split('_')[1];
      return p.retailers?.[rid]?.imageUrl || p.imageUrl || '';
    }
    return p.imageUrl || '';
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
    const checked = _selected.has(p.ean);
    const noImg = !rawImg;

    const retailerBadges = retailers
      .filter(r => p.retailers?.[r.id])
      .map(r => `<span class="r-badge" style="background:${r.color}" title="${esc(r.name)}">${esc(r.name[0])}</span>`)
      .join('');

    return `
<article class="product-card ${_selectMode?'selectable':''} ${checked?'selected':''}"
  data-ean="${ean}"
  onclick="${_selectMode ? `UICatalog.toggleSelect('${ean}')` : `App.openSheet('${ean}')`}"
  title="${_selectMode ? 'Seleccionar / deseleccionar' : 'Ver Technical Sheet'}">

  ${_selectMode ? `
  <div class="card-checkbox ${checked?'checked':''}">
    ${checked ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
  </div>` : ''}

  <div class="card-img-wrap">
    <img class="card-img${noImg?' no-img':''}" src="${img}" alt="${name}" onerror="this.classList.add('no-img');this.src=''">
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
  ${!_selectMode ? `
  <div class="card-footer">
    <button class="btn-card-cta" onclick="event.stopPropagation();App.openSheet('${ean}')">Ver Technical Sheet →</button>
  </div>` : ''}
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
    const checked = _selected.has(p.ean);
    const noImg   = !rawImg;

    const retailerBadges = retailers
      .filter(r => p.retailers?.[r.id])
      .map(r => `<span class="r-badge" style="background:${r.color}" title="${esc(r.name)}">${esc(r.name[0])}</span>`)
      .join('');

    return `
<div class="product-list-row ${_selectMode?'selectable':''} ${checked?'selected':''}" data-ean="${ean}"
  onclick="${_selectMode ? `UICatalog.toggleSelect('${ean}')` : `App.openSheet('${ean}')`}">
  <div class="pl-img">
    <img class="${noImg?'no-img':''}" style="width:100%;height:100%;object-fit:contain;padding:4px${noImg?';display:none':''}" src="${img}" alt="${name}" onerror="this.style.display='none'">
  </div>
  <div class="pl-ean">${ean}</div>
  <div class="pl-info">
    <span class="pl-name">${name}</span>
    <span class="pl-brand">${brand}</span>
  </div>
  <div class="pl-badges">${retailerBadges} ${srcBadge(p.dataSource)}</div>
  <div class="pl-comp">
    <div class="pl-comp-bar"><div class="pl-comp-fill" style="width:${pct}%;background:${col}"></div></div>
    <span class="pl-comp-lbl" style="color:${col}">${pct}%</span>
  </div>
  <div>${_selectMode ? `<div class="pl-checkbox ${checked?'checked':''}">${checked?'<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>':''}</div>` : ''}</div>
  <div class="pl-actions">${!_selectMode ? `<button class="btn-mini" onclick="event.stopPropagation();App.openSheet('${ean}')">Ver Sheet →</button>` : ''}</div>
</div>`;
  }

  function renderEmpty(hasProducts) {
    return hasProducts
      ? `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Sin resultados</h3><p>Intenta con otros filtros de búsqueda.</p><button class="btn-outline" onclick="UICatalog.clearFilters()">Limpiar filtros</button></div>`
      : `<div class="empty-state"><div class="empty-icon">📦</div><h3>Sin productos aún</h3><p>Importa tu primer archivo de SKUs para comenzar.</p><button class="btn-primary" onclick="App.navigateTo('import')">Importar SKUs</button></div>`;
  }

  // ── bulk edit bar ────────────────────────────
  function renderBulkBar(filtered, retailers) {
    if (!_selectMode) return '';
    const n = _selected.size;

    // Master fields that can be bulk-cleared or set
    const masterFields = [
      { v:'',             l:'— Seleccionar campo —' },
      { v:'width_cm',     l:'Ancho (cm)' },
      { v:'height_cm',    l:'Alto (cm)' },
      { v:'depth_cm',     l:'Profundidad (cm)' },
      { v:'weight_g',     l:'Peso (g)' },
      { v:'brand',        l:'Marca' },
      { v:'packageType',  l:'Tipo de paquete' },
    ];
    // Retailer category fields
    const rFields = retailers.map(r => ({ v:`rcat_${r.id}`, l:`Categoría — ${r.name}` }));
    const rStock  = retailers.map(r => ({ v:`rstock_${r.id}`, l:`Stock — ${r.name}` }));
    const allFields = [...masterFields, ...rFields, ...rStock];

    return `
<div class="bulk-bar" id="bulk-bar">
  <div class="bulk-bar-left">
    <span class="bulk-count">${n} producto${n!==1?'s':''} seleccionado${n!==1?'s':''}</span>
    <button class="bulk-sel-all" onclick="UICatalog.selectAll()">Seleccionar todos (${filtered.length})</button>
    <button class="bulk-sel-all" onclick="UICatalog.deselectAll()">Deseleccionar</button>
  </div>
  <div class="bulk-bar-mid">
    <select class="form-select bulk-field-sel" id="bulk-field" style="font-size:12px">
      ${allFields.map(f => `<option value="${esc(f.v)}">${esc(f.l)}</option>`).join('')}
    </select>
    <input type="text" class="form-input bulk-value-inp" id="bulk-value" placeholder="Nuevo valor (vacío = borrar)">
    <button class="btn-primary" style="padding:7px 14px;font-size:12px" onclick="UICatalog.applyBulk()">Aplicar</button>
    <button class="btn-danger-sm" onclick="UICatalog.bulkDelete()" title="Eliminar seleccionados">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
      Eliminar
    </button>
  </div>
  <button class="bulk-close" onclick="UICatalog.exitSelectMode()">✕ Salir</button>
</div>`;
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
    const retailers = DB.getRetailers();
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
    if (_retailer !== 'all')  filtered = filtered.filter(p => p.retailers?.[_retailer]);
    if (_category !== 'all')  filtered = filtered.filter(p => Object.values(p.retailers||{}).some(r => r.category === _category));
    if (_source   !== 'all')  filtered = filtered.filter(p => p.dataSource === _source);
    if (_statusFilter !== 'all') filtered = filtered.filter(p => (p.status||'active') === _statusFilter);
    if (_showIncomplete)      filtered = filtered.filter(p => DB.computeCompleteness(p) < 50);

    filtered = sortProducts(filtered);
    const page = filtered.slice(_page * PAGE_SIZE, (_page + 1) * PAGE_SIZE);

    const enriched = all.filter(p => p.dataSource !== 'manual').length;
    const noData   = all.filter(p => DB.computeCompleteness(p) < 40).length;
    const cats = [...new Set(all.flatMap(p => Object.values(p.retailers||{}).map(r => r.category).filter(Boolean)))].sort();

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
    <button class="btn-outline ${_selectMode?'active':''}" onclick="UICatalog.toggleSelectMode()" title="Edición masiva de productos">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      Edición masiva
    </button>
    <button class="btn-outline" onclick="App.exportCSV()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar CSV
    </button>
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
  <div class="stat-card"><span class="stat-v">${retailers.length}</span><span class="stat-l">Retailers activos</span></div>
  <div class="stat-card accent"><span class="stat-v">${enriched}</span><span class="stat-l">Enriquecidos (API)</span></div>
  <div class="stat-card warn" style="cursor:pointer" onclick="UICatalog.toggleIncomplete()" title="Filtrar incompletos">
    <span class="stat-v">${noData}</span><span class="stat-l">Incompletos ${_showIncomplete?'✓':''}</span>
  </div>
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
    <option value="open_food_facts" ${_source==='open_food_facts'?'selected':''}>Open Food Facts</option>
    <option value="open_products_facts" ${_source==='open_products_facts'?'selected':''}>Open Products Facts</option>
    <option value="manual" ${_source==='manual'?'selected':''}>Manual</option>
  </select>
  <div style="border-left:1px solid var(--border); margin:0 8px; height:24px;"></div>
  <select class="filter-sel" style="background-color: var(--card-bg); font-weight: 500;" onchange="UICatalog.setImagePref(this.value)">
    <option value="main" ${_imagePref==='main'?'selected':''}>👁️ Imagen: Principal</option>
    <option value="off" ${_imagePref==='off'?'selected':''}>👁️ Imagen: OFF</option>
    ${retailers.map(r=>`<option value="retailer_${esc(r.id)}" ${_imagePref===`retailer_${r.id}`?'selected':''}>👁️ Imagen: ${esc(r.name)}</option>`).join('')}
  </select>
  ${(_search||_retailer!=='all'||_category!=='all'||_source!=='all') ? '<button class="btn-clear" onclick="UICatalog.clearFilters()">Limpiar ×</button>' : ''}
</div>

<p class="result-count">${filtered.length} resultado${filtered.length!==1?'s':''}${filtered.length>PAGE_SIZE?` &nbsp;·&nbsp; Página ${_page+1} de ${Math.ceil(filtered.length/PAGE_SIZE)}`:''}</p>

${_selectMode ? `<p class="bulk-hint">❖ Modo edición masiva — haz click en las cards para seleccionarlas</p>` : ''}

${filtered.length === 0
  ? renderEmpty(all.length > 0)
  : _viewMode === 'list'
    ? `<div class="product-list-header">
        <span></span><span>EAN</span><span>Producto</span><span>Retailers</span><span>Fuente</span><span>Completitud</span><span></span>
       </div>
       <div class="product-list">${page.map(p => renderListRow(p, retailers)).join('')}</div>`
    : `<div class="product-grid">${page.map(p => renderCard(p, retailers)).join('')}</div>`}

${renderPagination(filtered.length)}

${renderBulkBar(filtered, retailers)}`;
  }

  // ── select mode handlers ─────────────────────
  function toggleSelectMode() {
    _selectMode = !_selectMode;
    if (!_selectMode) _selected.clear();
    render();
  }
  function exitSelectMode() { _selectMode = false; _selected.clear(); render(); }

  function toggleSelect(ean) {
    if (_selected.has(ean)) _selected.delete(ean);
    else _selected.add(ean);
    // Lightweight update: just toggle classes on card + update bar count
    const card = document.querySelector(`[data-ean="${ean}"]`);
    if (card) card.classList.toggle('selected', _selected.has(ean));
    const cb = card?.querySelector('.card-checkbox');
    if (cb) { cb.classList.toggle('checked', _selected.has(ean)); cb.innerHTML = _selected.has(ean) ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''; }
    const cnt = document.querySelector('.bulk-count');
    if (cnt) { const n=_selected.size; cnt.textContent = `${n} producto${n!==1?'s':''} seleccionado${n!==1?'s':''}`; }
  }

  function selectAll() {
    document.querySelectorAll('.product-card[data-ean]').forEach(c => _selected.add(c.dataset.ean));
    render();
  }
  function deselectAll() { _selected.clear(); render(); }

  // ── bulk apply ──────────────────────────────
  function applyBulk() {
    if (_selected.size === 0) { App.showToast('Selecciona al menos un producto', 'error'); return; }
    const field = document.getElementById('bulk-field')?.value;
    const raw   = document.getElementById('bulk-value')?.value.trim();
    if (!field) { App.showToast('Selecciona un campo', 'error'); return; }

    const numVal = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    let changed = 0;

    _selected.forEach(ean => {
      const p = DB.getProduct(ean);
      if (!p) return;

      if (field.startsWith('rcat_')) {
        // Retailer category
        const rid = field.replace('rcat_','');
        p.retailers = p.retailers || {};
        if (p.retailers[rid]) { p.retailers[rid].category = raw || null; changed++; }
      } else if (field.startsWith('rstock_')) {
        // Retailer stock toggle
        const rid = field.replace('rstock_','');
        p.retailers = p.retailers || {};
        if (p.retailers[rid]) {
          p.retailers[rid].stockStatus = raw.toLowerCase() === 'si' || raw === '1' || raw.toLowerCase() === 'true';
          changed++;
        }
      } else {
        // Master field
        const numFields = ['width_cm','height_cm','depth_cm','weight_g'];
        p[field] = numFields.includes(field) ? numVal(raw) : (raw || null);
        changed++;
      }
      DB.saveProduct(p);
    });

    App.showToast(`${changed} producto${changed!==1?'s':''} actualizado${changed!==1?'s':''}`, 'success');
    _selected.clear();
    _selectMode = false;
    render();
  }

  // ── filter / sort / quick-filter setters ────
  function setSearch(v)        { _search       = v;   _page = 0; render(); }
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

  // ── bulk delete ──────────────────────────────
  function bulkDelete() {
    if (_selected.size === 0) { App.showToast('Selecciona al menos un producto', 'error'); return; }
    const n = _selected.size;
    if (!confirm(`¿Eliminar ${n} producto${n!==1?'s':''}? Esta acción se puede deshacer usando ↩ Deshacer.`)) return;
    DB.deleteProducts([..._selected]);
    App.showToast(`${n} producto${n!==1?'s':''} eliminado${n!==1?'s':''}. Puedes deshacer.`, 'info');
    _selected.clear(); _selectMode = false;
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
      for (const product of toEnrich) {
        const apiData = await API.enrichProduct(product.ean);
        if (apiData) {
          const merged = API.mergeEnriched(product, apiData);
          DB.saveProduct(merged);
          found++;
          const imgEl = document.querySelector(`[data-ean="${product.ean}"] .card-img`);
          if (imgEl && merged.imageUrl) imgEl.src = merged.imageUrl;
        }
        done++;
        
        // Actualizar botón si existe en el DOM (si el usuario sigue en Catalog)
        const btn = document.getElementById('enrich-all-btn');
        if (btn) btn.innerHTML = `<span class="spin-ico">↻</span> Enriqueciendo (${done}/${toEnrich.length})…`;
        
        await new Promise(r => setTimeout(r, 600)); // Intervalo generoso para no saturar API
      }

      _enriching = false;
      if (found > 0) App.showToast(`${found} productos actualizados (OFF)`, 'success');
      
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
    toggleSelectMode, exitSelectMode, toggleSelect, selectAll, deselectAll, applyBulk, bulkDelete
  };
})();
