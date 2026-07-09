'use strict';

const UIRetailers = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _editId   = null;   // retailer being edited (null = new)
  let _editCats = [];     // working copy of categories list

  let _activeRetailerId = null;
  let _activeStoreId = null;
  let _activeStoreView = 'list'; // 'list' | 'planogram' | 'sessions'
  let _storeEditId = null;     // store being edited

  // ── stats helpers ───────────────────────────
  function retailerStats(rid) {
    const products = DB.getProductsArray();
    const inHolding = products.filter(p => {
      const h = p.holdings || p.retailers || {};
      return h[rid];
    });
    const avg = inHolding.length
      ? Math.round(inHolding.reduce((s, p) => s + DB.computeCompleteness(p), 0) / inHolding.length)
      : 0;
    const withImg = inHolding.filter(p => p.imageUrl).length;
    return { count: inHolding.length, avg, withImg };
  }

  // ── main render ────────────────────────────
  function render() {
    const el = document.getElementById('view-holdings') || document.getElementById('view-retailers');
    if (!el) return;
    const retailers = DB.getHoldings();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Holdings</h1>
    <p class="view-sub">${retailers.length} holdings configurados · Holding-Specific SKU Data</p>
  </div>
  <div class="view-actions">
    <button class="btn-primary" onclick="UIRetailers.openForm()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Agregar Holding
    </button>
  </div>
</header>

<div class="retailers-grid">
  ${retailers.map(r => renderCard(r)).join('')}
  <div class="retailer-add-card" onclick="UIRetailers.openForm()">
    <div class="add-card-inner">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <p>Agregar Holding</p>
    </div>
  </div>
</div>

<!-- Edit / Add modal -->
<div class="form-overlay hidden" id="retailer-overlay">
  <div class="retailer-form-modal" id="retailer-form-modal">
    <!-- filled by _renderForm() -->
  </div>
</div>

<!-- Homologate modal -->
<div class="form-overlay hidden" id="homologate-overlay">
  <div class="retailer-form-modal" id="homologate-form-modal">
    <!-- filled by _renderHomologate(...) -->
  </div>
</div>

<!-- Stores modal -->
<div class="form-overlay hidden" id="stores-overlay">
  <div class="retailer-form-modal" id="stores-form-modal" style="max-width: 900px; width: 95%;">
    <!-- filled by _renderStores(...) -->
  </div>
</div>`;
  }


  function renderCard(r) {
    const s = retailerStats(r.id);
    const cats = r.categories || [];
    return `
<div class="retailer-card">
  ${r.logoUrl ? `<div class="retailer-card-banner" style="background-image: url('${esc(r.logoUrl)}');"></div>` : ''}
  <div class="retailer-card-header">
    ${!r.logoUrl ? `<div class="retailer-logo-circle" style="background:${esc(r.color)}20;color:${esc(r.color)}">
      ${esc(r.name[0])}
    </div>` : ''}
    <div class="retailer-card-info">
      <h3 style="color:${esc(r.color)}">${esc(r.name)}</h3>
      <span class="retailer-id-badge">ID: ${esc(r.id)}</span>
    </div>
    <div class="retailer-card-actions">
      <button class="icon-btn" title="Ver Tiendas Físicas" onclick="UIRetailers.openStores('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </button>
      <button class="icon-btn" title="Homologar SKUs" onclick="UIRetailers.openHomologate('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29"/></svg>
      </button>
      <button class="icon-btn" title="Editar" onclick="UIRetailers.openForm('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn danger" title="Eliminar" onclick="UIRetailers.deleteRetailer('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>

  <div class="retailer-card-stats">
    <div class="rstat">
      <span class="rstat-v" style="color:${esc(r.color)}">${s.count}</span>
      <span class="rstat-l">SKUs</span>
    </div>
    <div class="rstat">
      <span class="rstat-v">${s.avg}%</span>
      <span class="rstat-l">Completitud</span>
    </div>
    <div class="rstat">
      <span class="rstat-v">${s.withImg}</span>
      <span class="rstat-l">Con imagen</span>
    </div>
  </div>

  <div>
    <div class="retailer-comp-bar-track">
      <div class="retailer-comp-bar-fill" style="width:${s.avg}%;background:${esc(r.color)}"></div>
    </div>
  </div>

  ${cats.length > 0 ? `
  <div class="retailer-cats-preview">
    <p class="retailer-cats-label">Categorías (${cats.length})</p>
    <div class="retailer-cats-chips">
      ${cats.slice(0,5).map(c => `<span class="rcat-chip">${esc(c)}</span>`).join('')}
      ${cats.length > 5 ? `<span class="rcat-chip muted">+${cats.length-5} más</span>` : ''}
    </div>
  </div>` : ''}
</div>`;
  }

  // ── form (add / edit) ───────────────────────
  function openForm(rid) {
    _editId = rid || null;
    const r = rid ? DB.getRetailers().find(x => x.id === rid) : null;
    _editCats = r?.categories ? [...r.categories] : [];
    _renderForm(r);
    const overlay = document.getElementById('retailer-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  function closeForm() {
    const overlay = document.getElementById('retailer-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  }

  function _renderForm(r) {
    const modal = document.getElementById('retailer-form-modal');
    if (!modal) return;
    const isEdit = !!_editId;

    modal.innerHTML = `
<div class="form-modal-header">
  <h2>${isEdit ? `Editar ${esc(r?.name||'')}` : 'Agregar retailer'}</h2>
  <button class="btn-close-sm" onclick="UIRetailers.closeForm()">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>

<div class="form-modal-body" style="max-height:70vh;overflow-y:auto">
  <div class="form-group">
    <label>Nombre del retailer *</label>
    <input type="text" class="form-input" id="r-name" value="${esc(r?.name||'')}" placeholder="ej. Lider">
  </div>
  ${!isEdit ? `
  <div class="form-group">
    <label>ID interno (slug) *</label>
    <input type="text" class="form-input" id="r-id" value="" placeholder="ej. lider  (sin espacios)">
    <p class="form-hint">Solo letras minúsculas y guiones. No se puede cambiar después.</p>
  </div>` : `
  <div class="form-group">
    <label>ID interno</label>
    <input type="text" class="form-input readonly-inp" value="${esc(r?.id||'')}" readonly>
    <p class="form-hint">El ID no se puede modificar.</p>
  </div>`}

  <div class="form-group">
    <label>Color de marca</label>
    <div class="color-pick-row">
      <input type="color" class="color-picker" id="r-color" value="${esc(r?.color||'#4F6EF7')}">
      <input type="text" class="form-input" id="r-color-hex" value="${esc(r?.color||'#4F6EF7')}" placeholder="#RRGGBB"
        oninput="document.getElementById('r-color').value=this.value">
    </div>
  </div>

  <div class="form-group">
    <label>URL del Logo / Banner (Opcional)</label>
    <input type="text" class="form-input" id="r-logo" value="${esc(r?.logoUrl||'')}" placeholder="ej. copec_logo.png o https://...">
    <p class="form-hint">URL o nombre de archivo de la imagen que se usará como cabecera o banner.</p>
  </div>

  <!-- Categories are dynamically gathered from imported products -->
</div>

<div class="form-modal-footer">
  <button class="btn-outline" onclick="UIRetailers.closeForm()">Cancelar</button>
  <button class="btn-primary" onclick="UIRetailers.saveForm()">
    ${isEdit ? 'Guardar cambios' : 'Agregar retailer'}
  </button>
</div>`;

    // Sync color picker → hex input
    document.getElementById('r-color')?.addEventListener('input', e => {
      const hex = document.getElementById('r-color-hex');
      if (hex) hex.value = e.target.value;
    });
  }

  function _renderCatTags() {
    if (_editCats.length === 0) return '<p class="cats-empty">Sin categorías aún.</p>';
    return _editCats.map((c, i) => `
      <div class="cat-tag">
        <span>${esc(c)}</span>
        <button onclick="UIRetailers.removeCat(${i})" title="Eliminar">×</button>
      </div>`).join('');
  }

  function addCat() {
    const inp = document.getElementById('cat-new-input');
    if (!inp) return;
    const val = inp.value.trim();
    if (!val || _editCats.includes(val)) { inp.focus(); return; }
    _editCats.push(val);
    inp.value = '';
    const mgr = document.getElementById('cats-manager');
    if (mgr) mgr.innerHTML = _renderCatTags();
    inp.focus();
  }

  function removeCat(i) {
    _editCats.splice(i, 1);
    const mgr = document.getElementById('cats-manager');
    if (mgr) mgr.innerHTML = _renderCatTags();
  }

  function saveForm() {
    const name  = document.getElementById('r-name')?.value.trim();
    const color = document.getElementById('r-color')?.value || '#4F6EF7';
    const logoUrl = document.getElementById('r-logo')?.value.trim() || null;

    if (!name) { App.showToast('El nombre es obligatorio', 'error'); return; }

    if (_editId) {
      DB.updateRetailer(_editId, { name, color, logoUrl });
      App.showToast(`${name} actualizado correctamente`, 'success');
    } else {
      const idInput = document.getElementById('r-id')?.value.trim().toLowerCase().replace(/\s+/g,'-');
      if (!idInput) { App.showToast('El ID es obligatorio', 'error'); return; }
      const exists = DB.getRetailers().find(r => r.id === idInput);
      if (exists) { App.showToast(`Ya existe un retailer con ID "${idInput}"`, 'error'); return; }
      DB.addRetailer({ id: idInput, name, color, logoUrl, categories: [] });
      App.showToast(`${name} agregado correctamente`, 'success');
    }

    closeForm();
    render();
    App.renderSidebar();
  }

  function deleteRetailer(rid) {
    const r = DB.getRetailers().find(x => x.id === rid);
    if (!r) return;
    const count = DB.getProductsArray().filter(p => p.retailers?.[rid]).length;
    const msg = count > 0
      ? `¿Eliminar "${r.name}"? Esto quitará sus datos de ${count} producto(s). Los productos seguirán en el catálogo.`
      : `¿Eliminar "${r.name}"?`;
    if (!confirm(msg)) return;
    DB.deleteRetailer(rid);
    render();
    App.renderSidebar();
    App.showToast(`"${r.name}" eliminado`, 'info');
  }

  // ── homologate ───────────────────────────
  let _homologateTarget = null;
  
  function openHomologate(rid) {
    _homologateTarget = rid;
    _renderHomologate();
    const overlay = document.getElementById('homologate-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  function closeHomologate() {
    const overlay = document.getElementById('homologate-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  }

  function _renderHomologate() {
    const modal = document.getElementById('homologate-form-modal');
    if (!modal) return;
    const targetRetailer = DB.getRetailers().find(x => x.id === _homologateTarget);
    if (!targetRetailer) return;

    const sourceRetailers = DB.getRetailers().filter(x => x.id !== _homologateTarget);
    const sOpts = sourceRetailers.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join('');

    modal.innerHTML = `
<div class="form-modal-header">
  <h2>Homologar a ${esc(targetRetailer.name)}</h2>
  <button class="btn-close-sm" onclick="UIRetailers.closeHomologate()">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>
<div class="form-modal-body">
  <p class="form-hint" style="margin-bottom: 12px;">Copia masivamente productos desde otro retailer hacia <strong>${esc(targetRetailer.name)}</strong>.</p>
  
  <div class="form-group">
    <label>Retailer de origen</label>
    <select class="form-select" id="homo-source" onchange="UIRetailers.updateHomoCats()">
      <option value="">Selecciona el origen...</option>
      ${sOpts}
    </select>
  </div>
  
  <div class="form-group">
    <label>Categoría a copiar</label>
    <select class="form-select" id="homo-cat" onchange="UIRetailers.updateHomoDestCat()">
      <option value="">Selecciona un retailer primero</option>
    </select>
  </div>

  <div class="form-group">
    <label>Categoría destino en ${esc(targetRetailer.name)}</label>
    <input type="text" class="form-input" id="homo-dest-cat" placeholder="Nombre en el retailer final">
    <p class="form-hint">Si usas un nombre distinto, se adaptarán a la taxonomía de este retailer.</p>
  </div>
  
  <p id="homo-count-msg" style="font-weight:600; color:var(--accent); font-size:13px; margin-top:8px;"></p>
</div>

<div class="form-modal-footer">
  <button class="btn-outline" onclick="UIRetailers.closeHomologate()">Cancelar</button>
  <button class="btn-primary" onclick="UIRetailers.executeHomologate()">Ejecutar</button>
</div>
`;
  }

  function updateHomoCats() {
    const sId = document.getElementById('homo-source')?.value;
    const catSel = document.getElementById('homo-cat');
    if (!sId || !catSel) return;
    
    const sRetailer = DB.getRetailers().find(x => x.id === sId);
    let opts = '<option value="__ALL__">Todo el catálogo (todas las categorías)</option>';
    if (sRetailer && sRetailer.categories) {
      sRetailer.categories.forEach(c => {
        opts += `<option value="${esc(c)}">${esc(c)}</option>`;
      });
    }
    catSel.innerHTML = opts;
    updateHomoDestCat();
  }

  function updateHomoDestCat() {
    const cat = document.getElementById('homo-cat')?.value;
    const dest = document.getElementById('homo-dest-cat');
    const msg = document.getElementById('homo-count-msg');
    const source = document.getElementById('homo-source')?.value;
    
    if (dest) {
       dest.value = (cat && cat !== '__ALL__') ? cat : '';
    }
    
    if (!source || !cat) {
      if (msg) msg.textContent = '';
      return;
    }

    let count = 0;
    const products = DB.getProductsArray();
    products.forEach(p => {
      const rData = p.retailers && p.retailers[source];
      if (rData) {
        if (cat === '__ALL__' || rData.category === cat) count++;
      }
    });
    
    if (msg) msg.textContent = count > 0 ? `Se integrarán ${count} SKUs a la ficha de este retailer.` : 'No hay productos que coincidan.';
  }

  function executeHomologate() {
    const source = document.getElementById('homo-source')?.value;
    const cat = document.getElementById('homo-cat')?.value;
    const destCat = document.getElementById('homo-dest-cat')?.value.trim();
    
    if (!source || !cat) {
      App.showToast('Selecciona origen y categoría', 'warning');
      return;
    }
    if (cat !== '__ALL__' && !destCat) {
      App.showToast('Escribe una categoría de destino', 'warning');
      return;
    }
    
    let updatedProducts = [];
    const products = DB.getProductsArray();
    
    products.forEach(p => {
      const rData = p.retailers && p.retailers[source];
      if (rData && (cat === '__ALL__' || rData.category === cat)) {
         if (!p.retailers[_homologateTarget]) {
            p.retailers[_homologateTarget] = {
               customerId: `HOM-${p.ean}`,
               name: rData.name || p.name || '',
               category: cat === '__ALL__' ? (rData.category || 'Categoría por Defecto') : destCat,
               stockStatus: true,
               imageUrl: rData.imageUrl || p.imageUrl || null,
               updatedAt: new Date().toISOString()
            };
            updatedProducts.push(p);
         }
      }
    });
    
    if (updatedProducts.length > 0) {
      DB.saveProducts(updatedProducts);
      App.showToast(`Homologación exitosa: ${updatedProducts.length} SKUs añadidos.`, 'success');
      App.renderSidebar();
    } else {
      App.showToast('No se detectaron productos nuevos para integrar.', 'info');
    }
    closeHomologate();
    render();
  }

  // ── physical stores ──────────────────────────
  function openStores(rid) {
    _activeRetailerId = rid;
    _activeStoreId = null;
    _activeStoreView = 'list';
    _storeEditId = null;
    _renderStores();
    const overlay = document.getElementById('stores-overlay');
    overlay.classList.remove('hidden');
    requestAnimationFrame(() => overlay.classList.add('visible'));
  }

  function closeStores() {
    const overlay = document.getElementById('stores-overlay');
    overlay.classList.remove('visible');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  }

  function _renderStores() {
    const modal = document.getElementById('stores-form-modal');
    if (!modal) return;
    const r = DB.getRetailers().find(x => x.id === _activeRetailerId);
    if (!r) return;

    const stores = DB.getStores(_activeRetailerId);

    let html = `
<div class="form-modal-header" style="border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px;">
  <div style="display:flex; align-items:center; gap:10px;">
    <span class="r-dot" style="background:${esc(r.color)}; width:12px; height:12px; border-radius:50%; display:inline-block;"></span>
    <h2>Tiendas Físicas — ${esc(r.name)}</h2>
  </div>
  <button class="btn-close-sm" onclick="UIRetailers.closeStores()">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>
<div class="form-modal-body" style="display:flex; flex-direction:column; gap:16px;">
    `;

    if (_activeStoreView === 'list') {
      html += `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <p style="color:var(--text-muted); font-size:13px; margin:0;">Administra las sucursales físicas donde se realizan levantamientos.</p>
          <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="UIRetailers.openStoreForm()">+ Agregar Sucursal</button>
        </div>
        
        <div id="store-form-container" class="hidden" style="background:var(--surface-el); padding:16px; border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; gap:12px;">
           <!-- Store Add/Edit Form -->
        </div>

        <div class="preview-table-wrap">
          <table class="preview-table">
            <thead>
              <tr>
                <th>ID Tienda</th>
                <th>Sucursal</th>
                <th>Ciudad / Región</th>
                <th style="text-align:right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${stores.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:20px;">Sin sucursales registradas aún.</td></tr>` : 
                stores.map(s => `
                <tr>
                  <td class="mono" style="font-weight:600;">${esc(s.storeId)}</td>
                  <td><strong>${esc(s.branchName)}</strong></td>
                  <td>${esc(s.city)}</td>
                  <td style="text-align:right; display:flex; justify-content:flex-end; gap:6px;">
                    <button class="btn-mini" style="background:var(--accent-dim); color:var(--accent); border-color:var(--accent-border);" onclick="UIRetailers.viewPlanogram('${esc(s.storeId)}')">Planograma</button>
                    <button class="btn-mini" style="background:rgba(74, 201, 155, 0.1); color:#4ac99b; border-color:rgba(74, 201, 155, 0.2);" onclick="UIRetailers.viewAudits('${esc(s.storeId)}')">Auditorías</button>
                    <button class="btn-mini" onclick="UIRetailers.openStoreForm('${esc(s.storeId)}')">Editar</button>
                    <button class="btn-mini" style="color:var(--danger); border-color:rgba(196,43,32,0.2);" onclick="UIRetailers.deleteStore('${esc(s.storeId)}')">✕</button>
                  </td>
                </tr>`).join('')
              }
            </tbody>
          </table>
        </div>
      `;
    } else if (_activeStoreView === 'planogram') {
      const store = DB.getStore(_activeStoreId);
      const items = DB.getStorePlanogram(_activeStoreId);

      // Group by DMU
      const dmuGroups = {};
      items.forEach(it => {
        const dmu = it.dmu || it.officialAisle || 'Sin DMU';
        if (!dmuGroups[dmu]) dmuGroups[dmu] = [];
        dmuGroups[dmu].push(it);
      });
      // Sort items by position within each DMU
      Object.values(dmuGroups).forEach(arr => arr.sort((a, b) => (a.position || 9999) - (b.position || 9999)));

      const dmuCount = Object.keys(dmuGroups).length;

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div>
            <button class="btn-mini" onclick="UIRetailers.goStoresList()">← Volver a Sucursales</button>
            <span style="font-size:15px; font-weight:700; margin-left:12px;">Planograma — ${esc(store?.branchName)}</span>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span class="badge" style="background:var(--accent)">${items.length} SKUs · ${dmuCount} DMUs</span>
            <button class="btn-mini" style="background:rgba(74,201,155,0.1); color:#4ac99b; border-color:rgba(74,201,155,0.25); padding:5px 10px;" onclick="App.exportDMUExcel('${esc(_activeRetailerId)}')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel por DMU
            </button>
          </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:16px; max-height:420px; overflow-y:auto; padding-right:4px;">
          ${Object.keys(dmuGroups).length === 0
            ? `<p style="text-align:center; color:var(--text-muted); padding:20px;">No hay productos asignados. Importa un Excel con columna DMU o asigna productos al retailer.</p>`
            : Object.entries(dmuGroups).map(([dmu, dmuItems]) => `
              <div style="background:var(--surface-el); border:1px solid var(--border); border-radius:8px; overflow:hidden;">
                <div style="padding:8px 14px; background:var(--accent-dim); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                  <strong style="font-size:13px; color:var(--accent);">📦 DMU: ${esc(dmu)}</strong>
                  <span style="font-size:11px; color:var(--text-muted);">${dmuItems.length} producto${dmuItems.length!==1?'s':''}</span>
                </div>
                <table class="preview-table" style="margin:0;">
                  <thead>
                    <tr>
                      <th style="width:30px;">Pos.</th>
                      <th>EAN</th>
                      <th>Producto</th>
                      <th>Marca</th>
                      <th>Certificado</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${dmuItems.map(it => `
                    <tr>
                      <td style="text-align:center; font-weight:700; color:var(--text-muted);">${it.position || '—'}</td>
                      <td class="mono">${esc(it.ean)}</td>
                      <td><strong>${esc(it.productName || 'Sin Nombre')}</strong></td>
                      <td style="font-size:11px; color:var(--text-muted);">${esc(it.brand || '—')}</td>
                      <td>
                        <span class="status-badge ${it.isCertified ? 'new' : 'conflict'}" style="font-size:10px;">
                          ${it.isCertified ? '✓ Cert.' : '⚠ Pend.'}
                        </span>
                      </td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>`).join('')}
        </div>
      `;

    } else if (_activeStoreView === 'sessions') {
      const store = DB.getStore(_activeStoreId);
      const sessions = DB.getStoreCaptureSessions(_activeStoreId);

      html += `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div>
            <button class="btn-mini" onclick="UIRetailers.goStoresList()">← Volver a Sucursales</button>
            <span style="font-size:15px; font-weight:700; margin-left:12px;">Auditorías de Terreno: ${esc(store?.branchName)}</span>
          </div>
          <span class="badge" style="background:#4ac99b">${sessions.length} Sesiones Registradas</span>
        </div>

        <div style="display:flex; flex-direction:column; gap:16px; max-height:400px; overflow-y:auto;">
          ${sessions.length === 0 ? `<p style="text-align:center; color:var(--text-muted); padding:20px;">Sin sesiones de captura registradas. Esto se conectará con el dispositivo móvil.</p>` :
            sessions.map(s => {
              const dateStr = new Date(s.startTime).toLocaleString('es-CL');
              const discrepancies = s.items.filter(it => it.isDiscrepancy).length;
              return `
              <div style="background:var(--surface-el); border:1px solid var(--border); border-radius:8px; padding:16px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid var(--border); padding-bottom:8px;">
                  <div>
                    <strong style="color:var(--accent);">${esc(s.sessionId)}</strong> &nbsp;·&nbsp;
                    <span style="font-size:12px; color:var(--text-muted);">Pasillo: <strong>${esc(s.aisleId)}</strong></span>
                  </div>
                  <div style="font-size:11px; color:var(--text-muted);">
                    Auditor: <strong>${esc(s.auditorId)}</strong> &nbsp;·&nbsp; ${dateStr}
                  </div>
                </div>

                <p style="font-size:12px; font-weight:600; margin:0 0 8px 0; display:flex; justify-content:space-between;">
                  <span>Productos Escaneados:</span>
                  ${discrepancies > 0 ? `<span style="color:var(--danger);">⚠ ${discrepancies} discrepancia(s) detectada(s)</span>` : `<span style="color:var(--success);">✓ 100% Coincidencia</span>`}
                </p>

                <!-- Scanned items list -->
                <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
                  ${s.items.map(it => `
                    <div style="background:var(--card-bg); border:1px solid ${it.isDiscrepancy ? 'var(--danger)' : 'var(--border)'}; border-radius:6px; padding:8px; display:flex; gap:8px; align-items:center; font-size:11px;">
                      <img src="${esc(it.photoUrl)}" style="width:32px; height:32px; object-fit:contain; border-radius:4px; background:var(--surface-el);" onerror="this.src='logo.png'">
                      <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">
                        <strong style="display:block; overflow:hidden; text-overflow:ellipsis;">${esc(it.productName || 'Desconocido')}</strong>
                        <span class="mono" style="font-size:9px;">EAN: ${esc(it.ean)}</span>
                        ${it.isDiscrepancy ? `<span style="display:block; color:var(--danger); font-size:9px; font-weight:700;">OCR: "${esc(it.rawOcrText)}"</span>` : ''}
                      </div>
                      <span style="font-size:12px;">${it.isDiscrepancy ? '❌' : '✅'}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
              `;
            }).join('')
          }
        </div>
      `;
    }

    html += `
</div>
<div class="form-modal-footer" style="border-top:1px solid var(--border); padding-top:12px; margin-top:16px;">
  <button class="btn-outline" onclick="UIRetailers.closeStores()">Cerrar</button>
</div>
    `;

    modal.innerHTML = html;
  }

  function openStoreForm(storeId = null) {
    _storeEditId = storeId;
    const container = document.getElementById('store-form-container');
    if (!container) return;
    
    container.classList.remove('hidden');
    const store = storeId ? DB.getStore(storeId) : null;
    
    container.innerHTML = `
      <h4 style="margin:0 0 10px 0;">${storeId ? 'Editar Sucursal' : 'Nueva Sucursal'}</h4>
      <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;">
        <div class="form-group">
          <label>ID Tienda (ej. tottus_vitacura) *</label>
          <input type="text" class="form-input" id="st-id" value="${esc(store?.storeId || '')}" ${storeId ? 'readonly style="background:var(--surface-el); opacity:0.7;"' : ''} placeholder="ID único">
        </div>
        <div class="form-group">
          <label>Nombre de Sucursal *</label>
          <input type="text" class="form-input" id="st-name" value="${esc(store?.branchName || '')}" placeholder="ej. Sucursal Vitacura">
        </div>
        <div class="form-group">
          <label>Ciudad / Región *</label>
          <input type="text" class="form-input" id="st-city" value="${esc(store?.city || 'Santiago')}" placeholder="ej. Santiago">
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
        <button class="btn-clear" style="padding:6px 12px; font-size:12px;" onclick="document.getElementById('store-form-container').classList.add('hidden')">Cancelar</button>
        <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="UIRetailers.saveStoreForm()">Guardar</button>
      </div>
    `;
  }

  function saveStoreForm() {
    const storeId = document.getElementById('st-id')?.value.trim();
    const branchName = document.getElementById('st-name')?.value.trim();
    const city = document.getElementById('st-city')?.value.trim();

    if (!storeId || !branchName || !city) {
      App.showToast('Todos los campos marcados con * son obligatorios', 'warning');
      return;
    }

    const store = {
      storeId,
      retailerId: _activeRetailerId,
      branchName,
      city
    };

    DB.saveStore(store);
    App.showToast('Sucursal guardada correctamente', 'success');
    _storeEditId = null;
    _renderStores();
  }

  function deleteStore(storeId) {
    if (!confirm('¿Eliminar esta sucursal?')) return;
    DB.deleteStore(storeId);
    App.showToast('Sucursal eliminada', 'info');
    _renderStores();
  }

  function viewPlanogram(storeId) {
    _activeStoreId = storeId;
    _activeStoreView = 'planogram';
    _renderStores();
  }

  function viewAudits(storeId) {
    _activeStoreId = storeId;
    _activeStoreView = 'sessions';
    _renderStores();
  }

  function goStoresList() {
    _activeStoreView = 'list';
    _renderStores();
  }

  return { 
    render, 
    openForm, 
    closeForm, 
    saveForm, 
    addCat, 
    removeCat, 
    deleteRetailer, 
    openHomologate, 
    closeHomologate, 
    updateHomoCats, 
    updateHomoDestCat, 
    executeHomologate,
    openStores,
    closeStores,
    openStoreForm,
    saveStoreForm,
    deleteStore,
    viewPlanogram,
    viewAudits,
    goStoresList
  };
})();

// UIHoldings alias for the new architecture
const UIHoldings = UIRetailers;
