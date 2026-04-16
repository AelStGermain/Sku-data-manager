'use strict';

const UIRetailers = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _editId   = null;   // retailer being edited (null = new)
  let _editCats = [];     // working copy of categories list

  // ── stats helpers ───────────────────────────
  function retailerStats(rid) {
    const products = DB.getProductsArray();
    const inRetailer = products.filter(p => p.retailers?.[rid]);
    const avg = inRetailer.length
      ? Math.round(inRetailer.reduce((s, p) => s + DB.computeCompleteness(p), 0) / inRetailer.length)
      : 0;
    const withImg = inRetailer.filter(p => p.imageUrl).length;
    return { count: inRetailer.length, avg, withImg };
  }

  // ── main render ────────────────────────────
  function render() {
    const el = document.getElementById('view-retailers');
    if (!el) return;
    const retailers = DB.getRetailers();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Retailers</h1>
    <p class="view-sub">${retailers.length} supermercados configurados</p>
  </div>
  <div class="view-actions">
    <button class="btn-primary" onclick="UIRetailers.openForm()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Agregar retailer
    </button>
  </div>
</header>

<div class="retailers-grid">
  ${retailers.map(r => renderCard(r)).join('')}
  <div class="retailer-add-card" onclick="UIRetailers.openForm()">
    <div class="add-card-inner">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <p>Agregar retailer</p>
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

  return { render, openForm, closeForm, saveForm, addCat, removeCat, deleteRetailer, openHomologate, closeHomologate, updateHomoCats, updateHomoDestCat, executeHomologate };
})();
