'use strict';

const UISheet = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _ean      = null;
  let _original = null;   // deep clone of product at open time
  let _data     = null;   // working copy (may have edits)
  let _retailer = null;   // active retailer tab id
  let _dirty    = false;
  let _isCreate = false;

  function open(ean) {
    const p = DB.getProduct(ean);
    if (!p) { App.showToast('Producto no encontrado', 'error'); return; }
    _ean      = ean;
    _original = JSON.parse(JSON.stringify(p));
    _data     = JSON.parse(JSON.stringify(p));
    _dirty    = false;
    _isCreate = false;
    const retailers = DB.getRetailers();
    _retailer = retailers.length > 0 ? retailers[0].id : null;
    _render();
    _showModal();
  }

  function openCreate() {
    _ean = null;
    _isCreate = true;
    _data = {
      ean: '', name: '', brand: '', packageType: 'other', 
      status: 'active', nameSource: 'manual', masterCategory: null,
      offAttempted: false, width_cm: null, height_cm: null, depth_cm: null,
      weight_g: null, imageUrl: null, dataSource: 'manual', history: [], 
      planogram: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      retailers: {}
    };
    _original = JSON.parse(JSON.stringify(_data));
    _dirty = true;
    const retailers = DB.getRetailers();
    _retailer = retailers.length > 0 ? retailers[0].id : null;
    _render();
    _showModal();
  }

  function close() {
    if (_dirty && !confirm('Tienes cambios sin guardar. ¿Salir de todas formas?')) return;
    _hideModal();
    _ean = _original = _data = null;
    _dirty = false;
    _isCreate = false;
  }

  function _showModal() {
    const ov = document.getElementById('sheet-overlay');
    ov.classList.remove('hidden');
    requestAnimationFrame(() => ov.classList.add('visible'));
  }

  function _hideModal() {
    const ov = document.getElementById('sheet-overlay');
    ov.classList.remove('visible');
    setTimeout(() => ov.classList.add('hidden'), 280);
  }

  // ── field update helpers ───────────────────
  function updateField(field, value) {
    _data[field] = value;
    _markDirty();
  }

  function updateRetailerField(field, value) {
    if (!_retailer) return;
    _data.retailers = _data.retailers || {};
    _data.retailers[_retailer] = _data.retailers[_retailer] || {};
    _data.retailers[_retailer][field] = value;
    _markDirty();
  }

  function toggleStock() {
    if (!_retailer || !_data.retailers?.[_retailer]) return;
    _data.retailers[_retailer].stockStatus = !_data.retailers[_retailer].stockStatus;
    _markDirty();
    // Update toggle visual only
    const tog = document.getElementById('stock-toggle');
    if (tog) {
      const isOn = _data.retailers[_retailer].stockStatus;
      tog.classList.toggle('on', isOn);
      const lbl = document.getElementById('stock-label');
      if (lbl) lbl.textContent = isOn ? 'Disponible en tienda' : 'Sin stock';
    }
  }

  function addToRetailer(rid) {
    _data.retailers = _data.retailers || {};
    _data.retailers[rid] = {
      customerId: null, name: _data.name || '', category: null,
      stockStatus: true, imageUrl: null, updatedAt: new Date().toISOString()
    };
    _retailer = rid;
    _markDirty();
    _render();
  }

  function removeFromRetailer(rid) {
    if (!confirm(`¿Quitar este producto del retailer?`)) return;
    delete _data.retailers[rid];
    _retailer = DB.getRetailers().find(r => r.id !== rid)?.id || DB.getRetailers()[0]?.id || null;
    _markDirty();
    _render();
  }

  function setRetailer(rid) {
    _retailer = rid;
    _render();
  }

  function _markDirty() {
    _dirty = true;
    const btn = document.getElementById('sheet-save-btn');
    if (btn) btn.classList.add('has-changes');
  }

  // ── save & discard ─────────────────────────
  function save() {
    if (!_data || !_data.ean) { App.showToast('El EAN es requerido', 'error'); return; }
    if (_isCreate && DB.getProduct(_data.ean)) { App.showToast('Ya existe un producto con el EAN ' + _data.ean, 'error'); return; }
    
    DB.saveProduct(_data);
    _original = JSON.parse(JSON.stringify(_data));
    _dirty = false;
    _isCreate = false;
    const btn = document.getElementById('sheet-save-btn');
    if (btn) btn.classList.remove('has-changes');
    App.showToast('Cambios guardados correctamente', 'success');
    _render();
    // Refresh catalog in background
    if (document.getElementById('view-catalog')?.classList.contains('active')) UICatalog.render();
  }

  function discard() {
    if (!_dirty) return;
    _data  = JSON.parse(JSON.stringify(_original));
    _dirty = false;
    _render();
    App.showToast('Cambios descartados', 'info');
  }

  // ── sync with Open Food Facts ──────────────
  async function syncOFF() {
    const btn = document.getElementById('sync-btn');
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    App.showToast('Consultando Open Food Facts…', 'info');

    try {
      const apiData = await API.enrichProduct(_data.ean);
      if (!apiData) {
        App.showToast('No se encontró este EAN en Open Food Facts', 'error');
      } else {
        const before = JSON.parse(JSON.stringify(_data));
        _data = API.mergeEnriched(_data, apiData);

        // Collect what changed
        const changed = [];
        ['name','brand','packageType','weight_g','imageUrl','width_cm','height_cm','depth_cm'].forEach(f => {
          if (!before[f] && _data[f]) changed.push(f);
        });

        if (changed.length === 0) {
          App.showToast('No hay datos nuevos para agregar (todo ya está completo)', 'info');
        } else {
          _markDirty();
          _render();
          App.showToast(`Datos actualizados: ${changed.join(', ')}`, 'success');
        }
      }
    } catch (e) {
      App.showToast('Error conectando con Open Food Facts', 'error');
    }

    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }

  // ── image change ───────────────────────────
  function changeImage() {
    const url = prompt('URL de la imagen del producto:', _data.imageUrl || '');
    if (url === null) return;
    updateField('imageUrl', url.trim() || null);
    _render();
  }

  // ── main render ────────────────────────────
  function _render() {
    const container = document.getElementById('sheet-content');
    if (!container || !_data) return;

    const retailers = DB.getRetailers();
    if (_retailer && !retailers.find(r => r.id === _retailer)) {
      _retailer = retailers[0]?.id || null;
    }

    const rInfo = retailers.find(r => r.id === _retailer);
    const rData = _retailer ? (_data.retailers?.[_retailer] || null) : null;
    const inStock = rData?.stockStatus ?? true;

    const imgSrc = esc(_data.imageUrl || '');
    const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Crect fill='%231A1D27' width='280' height='280'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%234F6EF7' font-size='22' font-family='sans-serif'%3ESin imagen%3C/text%3E%3C/svg%3E`;
    const pkgOpts = PACKAGE_TYPES.map(pt =>
      `<option value="${pt.value}" ${_data.packageType===pt.value?'selected':''}>${esc(pt.label)}</option>`
    ).join('');
    const rCategories = (rInfo?.categories?.length ? rInfo.categories : CATEGORIES);
    const catOpts = rCategories.map(c =>
      `<option value="${esc(c)}" ${rData?.category===c?'selected':''}>${esc(c)}</option>`
    ).join('');

    const sourceLabel = {
      'open_food_facts': 'Open Food Facts',
      'open_products_facts': 'Open Products Facts',
      'manual': 'Carga manual',
      'mixed': 'Múltiple fuentes'
    }[_data.dataSource] || _data.dataSource || '—';

    container.innerHTML = `
<div class="sheet-layout">

  <!-- ═══ LEFT: MASTER DATA ═══ -->
  <div class="sheet-left">

    <div class="sheet-hdr">
      <div class="sheet-hdr-left">
        <span class="badge-master">MASTER DATA</span>
        <button class="btn-sync" id="sync-btn" onclick="UISheet.syncOFF()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Sync con Open Food Facts
        </button>
      </div>
      <button class="btn-close-sheet" onclick="UISheet.close()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <input class="sheet-title-inp" type="text" id="sheet-name"
      value="${esc(_data.name || '')}" placeholder="Nombre del producto…"
      oninput="UISheet.updateField('name', this.value)">

    <div class="sheet-body-row">
      <!-- Image -->
      <div class="sheet-img-col">
        <div class="sheet-img-wrap">
          <img id="sheet-img" src="${imgSrc || NO_IMG}" alt="${esc(_data.name || '')}"
               onerror="this.src='${NO_IMG}'">
        </div>
        <button class="btn-change-img" onclick="UISheet.changeImage()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Cambiar imagen
        </button>
      </div>

      <!-- Core Info -->
      <div class="sheet-core-col">
        <p class="section-lbl">INFORMACIÓN CENTRAL</p>

        <div class="form-group">
          <label>Nombre de marca</label>
          <input type="text" class="form-input" value="${esc(_data.brand || '')}"
            placeholder="—" oninput="UISheet.updateField('brand', this.value)">
        </div>
        <div class="form-group">
          <label>Tipo de paquete</label>
          <select class="form-select" onchange="UISheet.updateField('packageType', this.value)">
            <option value="">Seleccionar…</option>${pkgOpts}
          </select>
        </div>
        <div class="form-group">
          <label>EAN-13 / Barcode</label>
          <input type="text" class="form-input ${_isCreate ? '' : 'readonly-inp'}" value="${esc(_data.ean)}" ${_isCreate ? '' : 'readonly'} oninput="UISheet.updateField('ean', this.value)">
        </div>
        <div class="form-group">
          <label>Peso neto (g)</label>
          <input type="number" class="form-input" value="${_data.weight_g || ''}"
            placeholder="—" min="0"
            oninput="UISheet.updateField('weight_g', parseFloat(this.value)||null)">
        </div>
      </div>
    </div>

    <!-- Dimensions -->
    <div class="sheet-dims">
      <p class="section-lbl">DIMENSIONES LOGÍSTICAS</p>
      <div class="dims-row">
        <div class="form-group">
          <label>Ancho (cm)</label>
          <input type="number" class="form-input" value="${_data.width_cm||''}" placeholder="—"
            oninput="UISheet.updateField('width_cm', parseFloat(this.value)||null)">
        </div>
        <div class="form-group">
          <label>Alto (cm)</label>
          <input type="number" class="form-input" value="${_data.height_cm||''}" placeholder="—"
            oninput="UISheet.updateField('height_cm', parseFloat(this.value)||null)">
        </div>
        <div class="form-group">
          <label>Profundidad (cm)</label>
          <input type="number" class="form-input" value="${_data.depth_cm||''}" placeholder="—"
            oninput="UISheet.updateField('depth_cm', parseFloat(this.value)||null)">
        </div>
      </div>
    </div>

    <!-- Meta -->
    <div class="sheet-meta-row">
      <span class="meta-chip">Fuente: <strong>${esc(sourceLabel)}</strong></span>
      <span class="meta-chip">Completitud: <strong>${DB.computeCompleteness(_data)}%</strong></span>
      <span class="meta-chip">Actualizado: <strong>${App.formatDate(_data.updatedAt)}</strong></span>
    </div>
  </div>

  <!-- ═══ RIGHT: RETAILER SPECIFICS ═══ -->
  <div class="sheet-right">
    <p class="section-lbl">RETAILER SPECIFICS</p>

    <div class="retailer-tabs">
      ${retailers.map(r => `
        <button class="r-tab ${r.id===_retailer?'active':''}"
          onclick="UISheet.setRetailer('${esc(r.id)}')"
          style="${r.id===_retailer ? `border-bottom-color:${r.color};color:${r.color}` : ''}">
          ${esc(r.name)}
          ${_data.retailers?.[r.id] ? '' : '<span class="r-tab-dot">+</span>'}
        </button>`).join('')}
    </div><!-- retailer-tabs -->

    ${rData ? `
    <!-- Retailer form -->
    <div class="retailer-form-area">
      <div class="form-group">
        <label>ID del retailer</label>
        <input type="text" class="form-input" value="${esc(rData.customerId||'')}"
          placeholder="ej. TOT-44921-X"
          oninput="UISheet.updateRetailerField('customerId', this.value)">
      </div>
      <div class="form-group">
        <label>Nombre en este retailer</label>
        <input type="text" class="form-input" value="${esc(rData.name||'')}"
          placeholder="Nombre como aparece en el supermercado"
          oninput="UISheet.updateRetailerField('name', this.value)">
      </div>
      <div class="form-group">
        <label>Categoría</label>
        <select class="form-select" onchange="UISheet.updateRetailerField('category', this.value)">
          <option value="">Seleccionar…</option>${catOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Stock</label>
        <div class="toggle-row">
          <div class="toggle-switch ${inStock?'on':''}" id="stock-toggle" onclick="UISheet.toggleStock()">
            <div class="toggle-knob"></div>
          </div>
          <span id="stock-label">${inStock ? 'Disponible en tienda' : 'Sin stock'}</span>
        </div>
      </div>
      <div class="form-group">
        <label>Última actualización</label>
        <div class="readonly-date">${App.formatDate(rData.updatedAt)}</div>
      </div>
      <button class="btn-danger-sm" onclick="UISheet.removeFromRetailer('${esc(_retailer)}')">
        Quitar de ${esc(rInfo?.name || _retailer)} ×
      </button>
    </div>` : `
    <!-- Add to retailer -->
    <div class="retailer-empty-area">
      <div class="retailer-empty-icon" style="color:${rInfo?.color||'var(--accent)'}">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <p>Este producto no está listado en <strong>${esc(rInfo?.name || _retailer)}</strong>.</p>
      <button class="btn-primary" onclick="UISheet.addToRetailer('${esc(_retailer)}')">
        + Agregar a ${esc(rInfo?.name || _retailer)}
      </button>
    </div>`}

    <!-- Footer buttons -->
    <div class="sheet-footer">
      <button class="btn-save ${_dirty?'has-changes':''}" id="sheet-save-btn" onclick="UISheet.save()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Guardar Cambios
      </button>
      <button class="btn-discard" onclick="UISheet.discard()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        Descartar
      </button>
    </div>
  </div><!-- sheet-right -->
</div><!-- sheet-layout -->
`;
  }

  return {
    open, openCreate, close, save, discard, syncOFF, changeImage,
    updateField, updateRetailerField, toggleStock,
    setRetailer, addToRetailer, removeFromRetailer
  };
})();
