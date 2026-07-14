'use strict';

const UISheet = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _ean      = null;
  let _original = null;   // deep clone of product at open time
  let _data     = null;   // working copy (may have edits)
  let _holding  = null;   // active holding tab id
  let _dirty    = false;
  let _isCreate = false;
  let _activeImageIndex = 0;

  function open(ean) {
    const p = DB.getProduct(ean);
    if (!p) { App.showToast('Producto no encontrado', 'error'); return; }
    _ean      = ean;
    _original = JSON.parse(JSON.stringify(p));
    _data     = JSON.parse(JSON.stringify(p));
    
    // Normalize holdings
    if (!_data.holdings && _data.retailers) _data.holdings = _data.retailers;
    if (!_data.holdings) _data.holdings = {};

    _dirty    = false;
    _isCreate = false;
    _activeImageIndex = -1; // special flag for auto-select
    const holdings = DB.getHoldings();
    const pref = localStorage.getItem('ss_imagePref');
    let defHolding = holdings.length > 0 ? holdings[0].id : null;
    if (pref && pref.startsWith('retailer_')) {
      const rid = pref.split('_')[1];
      if (holdings.find(r => r.id === rid)) defHolding = rid;
    }
    _holding = defHolding;
    _render();
    _showModal();
  }

  function openCreate() {
    _ean = null;
    _isCreate = true;
    _data = {
      ean: '', name: '', brand: '', packageType: 'other', 
      status: 'active', nameSource: 'manual', masterCategory: null, universalCategory: null,
      offAttempted: false, width_cm: null, height_cm: null, depth_cm: null,
      weight_g: null, imageUrl: null, images: [], dataSource: 'manual', history: [], 
      planogram: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      holdings: {}
    };
    _original = JSON.parse(JSON.stringify(_data));
    _dirty = true;
    const holdings = DB.getHoldings();
    _holding = holdings.length > 0 ? holdings[0].id : null;
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

  function updateHoldingField(field, value) {
    if (!_holding) return;
    _data.holdings = _data.holdings || {};
    _data.holdings[_holding] = _data.holdings[_holding] || {};
    _data.holdings[_holding][field] = value;
    _markDirty();
  }

  function toggleStock() {
    if (!_holding || !_data.holdings?.[_holding]) return;
    _data.holdings[_holding].stockStatus = !_data.holdings[_holding].stockStatus;
    _data.holdings[_holding].isActiveHolding = _data.holdings[_holding].stockStatus; // keep sync
    _markDirty();
    // Update toggle visual only
    const tog = document.getElementById('stock-toggle');
    if (tog) {
      const isOn = _data.holdings[_holding].stockStatus;
      tog.classList.toggle('on', isOn);
      const lbl = document.getElementById('stock-label');
      if (lbl) lbl.textContent = isOn ? 'Disponible en tienda' : 'Sin stock / Inactivo';
    }
  }

  function addToHolding(hid) {
    _data.holdings = _data.holdings || {};
    _data.holdings[hid] = {
      holdingInternalId: null, customerId: null, localProductName: _data.name || '', name: _data.name || '', localCategoryName: null, category: null,
      stockStatus: true, isActiveHolding: true, imageUrl: null, updatedAt: new Date().toISOString()
    };
    _holding = hid;
    _markDirty();
    _render();
  }

  function removeFromHolding(hid) {
    if (!confirm(`¿Quitar este producto del holding?`)) return;
    delete _data.holdings[hid];
    _holding = DB.getHoldings().find(r => r.id !== hid)?.id || DB.getHoldings()[0]?.id || null;
    _markDirty();
    _render();
  }

  function setHolding(hid) {
    _holding = hid;
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
    
    // EAN validation warning (non-blocking)
    if (_isCreate) {
      const v = DB.validateEAN(_data.ean);
      if (!v.valid) App.showToast(`⚠️ EAN posiblemente inválido: ${v.reason}`, 'warning');
    }
    
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

  // ── sync with Open Food Facts / Open Products Facts ───
  async function syncOFF() {
    const btn = document.getElementById('sync-btn');
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    App.showToast('Consultando APIs externas…', 'info');

    try {
      const apiData = await API.enrichProduct(_data.ean);
      if (!apiData) {
        // Mark as attempted so the badge shows
        _data.offAttempted = true;
        _data.enrichFailed = true;
        DB.saveProduct(_data);
        App.showToast('EAN no encontrado en Open Food Facts ni Open Products Facts', 'warning');
        _render();
      } else {
        const before = JSON.parse(JSON.stringify(_data));
        _data = API.mergeEnriched(_data, apiData);
        
        // Map category
        const t = String(apiData.masterCategory || apiData.name || '').toLowerCase();
        const mapping = {
          'alcohol': 'ALCOHOL', 'whisky': 'ALCOHOL', 'cerveza': 'ALCOHOL', 'vino': 'ALCOHOL', 'beer': 'ALCOHOL', 'wine': 'ALCOHOL', 'vodka': 'ALCOHOL', 'licor': 'ALCOHOL',
          'cleaning': 'CLEANING', 'limpieza': 'CLEANING', 'detergent': 'DETERGENTS', 'detergente': 'DETERGENTS', 'lavaloza': 'DETERGENTS', 'jabón': 'CLEANING',
          'dairy': 'DAIRYS', 'lácteo': 'DAIRYS', 'leche': 'DAIRYS', 'yogurt': 'DAIRYS', 'queso': 'DAIRYS', 'milk': 'DAIRYS',
          'frozen': 'FROZEN', 'congelado': 'FROZEN', 'helado': 'FROZEN',
          'breakfast': 'BREAKFAST', 'desayuno': 'BREAKFAST', 'cereal': 'CEREALS', 'avena': 'CEREALS',
          'snack': 'SNACKS', 'galleta': 'SNACKS', 'chip': 'SNACKS', 'biscuit': 'SNACKS',
          'baby': 'BABY', 'bebé': 'BABY', 'infant': 'BABY', 'pañal': 'BABY',
          'pet': 'PET', 'mascota': 'PET', 'perro': 'PET', 'gato': 'PET',
          'sweet': 'SWEET', 'dulce': 'SWEET', 'chocolate': 'DESSERT', 'caramelo': 'SWEET', 'candy': 'SWEET',
          'dessert': 'DESSERT', 'postre': 'DESSERT', 'torta': 'DESSERT',
          'canned': 'CANNED FOOD', 'conserva': 'CANNED FOOD', 'enlatado': 'CANNED FOOD', 'lata': 'CANNED FOOD',
          'drink': 'DRINKS', 'beverage': 'DRINKS', 'bebida': 'DRINKS', 'jugo': 'DRINKS', 'agua': 'DRINKS', 'juice': 'DRINKS', 'soda': 'DRINKS',
          'healthy': 'HEALTHY', 'salud': 'HEALTHY', 'organic': 'HEALTHY', 'natural': 'HEALTHY',
          'paper': 'PAPER ITEMS', 'papel': 'PAPER ITEMS', 'servilleta': 'PAPER ITEMS', 'toalla': 'PAPER ITEMS',
          'grocery': 'GROCERY STORE', 'tienda': 'GROCERY STORE'
        };
        let foundCat = 'GROCERY STORE';
        for (const [key, cat] of Object.entries(mapping)) {
          if (t.includes(key)) { foundCat = cat; break; }
        }
        _data.universalCategory = _data.universalCategory || foundCat;
        _data.category = _data.universalCategory;

        // Collect what changed
        const changed = [];
        ['name','brand','packageType','weight_g','imageUrl','width_cm','height_cm','depth_cm','universalCategory'].forEach(f => {
          if (!before[f] && _data[f]) changed.push(f);
        });

        // ── AUTO-SAVE immediately (no need to press Guardar) ──
        _data.updatedAt = new Date().toISOString();
        await DB.saveProduct(_data);
        _original = JSON.parse(JSON.stringify(_data));
        _dirty = false;

        if (changed.length === 0) {
          App.showToast('Sin datos nuevos — el producto ya estaba completo', 'info');
        } else {
          const src = apiData.dataSource === 'open_food_facts' ? 'Open Food Facts' : 'Open Products Facts';
          App.showToast(`✓ Guardado automáticamente (${src}): ${changed.length} campo(s) completado(s)`, 'success');
        }
        _render();
      }
    } catch (e) {
      App.showToast('Error conectando con la API', 'error');
      console.error(e);
    }

    if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
  }

  // ── image change ───────────────────────────
  function changeImage() {
    // Hidden file input to select an image
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const btn = document.querySelector('.sheet-img-col .btn-change-img');
      const originalText = btn ? btn.innerHTML : '';
      if (btn) { btn.innerHTML = 'Subiendo...'; btn.disabled = true; }
      
      try {
        const url = await DB.uploadProductImage(_data.ean || 'temp', file, 'product');
        if (url) {
          _data.images = _data.images || [];
          if (!_data.imageUrl) {
            _data.imageUrl = url;
            _data.images.push(url);
          } else {
            if (!_data.images.includes(_data.imageUrl)) {
              _data.images.unshift(_data.imageUrl); // make sure main is in array
            }
            if (!_data.images.includes(url)) {
              _data.images.push(url);
            }
            _data.imageUrl = url; // set newest as main
          }
          _markDirty();
          _activeImageIndex = _data.images.indexOf(url);
          _render();
        }
      } catch (err) {
        App.showToast('Error subiendo imagen', 'error');
      }
      if (btn) { btn.innerHTML = originalText; btn.disabled = false; }
    };
    input.click();
  }

  function changeImageUrl() {
    const url = prompt('URL de la imagen del producto:', _data.imageUrl || '');
    if (url === null) return;
    
    _data.images = _data.images || [];
    if (!_data.imageUrl) {
       _data.imageUrl = url.trim() || null;
       if (_data.imageUrl) _data.images.push(_data.imageUrl);
    } else if (url.trim()) {
       if (!_data.images.includes(_data.imageUrl)) _data.images.unshift(_data.imageUrl);
       if (!_data.images.includes(url.trim())) _data.images.push(url.trim());
       _data.imageUrl = url.trim();
    } else {
       _data.imageUrl = null;
    }
    _markDirty();
    _activeImageIndex = _data.images.indexOf(_data.imageUrl) >= 0 ? _data.images.indexOf(_data.imageUrl) : 0;
    _render();
  }

  function setActiveImage(idx) {
    _activeImageIndex = idx;
    _render();
  }

  function setAsMainImage(url) {
    if (!url) return;
    updateField('imageUrl', url);
    _activeImageIndex = 0;
    _render();
    App.showToast('Imagen guardada como principal', 'success');
  }

  // ── main render ────────────────────────────
  function _render() {
    const container = document.getElementById('sheet-content');
    if (!container || !_data) return;

    const holdings = DB.getHoldings();
    if (_holding && !holdings.find(r => r.id === _holding)) {
      _holding = holdings[0]?.id || null;
    }

    const rInfo = holdings.find(r => r.id === _holding);
    const rData = _holding ? (_data.holdings?.[_holding] || null) : null;
    const inStock = rData?.stockStatus ?? true;

    // -- IMAGE TABS LOGIC --
    const imageTabs = [];
    const mainImg = _data.imageUrl;
    const offImg = _data.offImageUrl;
    const rImg = rData?.imageUrl;
    
    const gallery = _data.images || [];
    if (mainImg && !gallery.includes(mainImg)) gallery.unshift(mainImg);
    
    if (gallery.length > 0) {
      gallery.forEach((imgUrl, i) => {
        imageTabs.push({ id: `main_${i}`, label: `Principal ${i+1}`, src: imgUrl });
      });
    } else {
      imageTabs.push({ id: 'main', label: 'Principal', src: mainImg || null });
    }

    if (offImg && !gallery.includes(offImg)) imageTabs.push({ id: 'off', label: 'API (OFF)', src: offImg });
    if (rImg && !gallery.includes(rImg)) imageTabs.push({ id: 'retailer', label: rInfo?.name || 'Holding', src: rImg });
    
    if (_activeImageIndex === -1) {
      _activeImageIndex = 0;
      const pref = localStorage.getItem('ss_imagePref') || 'main';
      if (pref === 'off') {
        const idx = imageTabs.findIndex(t => t.id === 'off');
        if (idx !== -1) _activeImageIndex = idx;
      } else if (pref.startsWith('retailer_')) {
        const idx = imageTabs.findIndex(t => t.id === 'retailer');
        if (idx !== -1) _activeImageIndex = idx;
      }
      
      // Auto-derivar si la opción seleccionada no tiene foto
      if (!imageTabs[_activeImageIndex].src) {
        const fallbackIdx = imageTabs.findIndex(t => t.src);
        if (fallbackIdx !== -1) _activeImageIndex = fallbackIdx;
      }
    }
    
    if (_activeImageIndex >= imageTabs.length) _activeImageIndex = 0;
    const activeTab = imageTabs[_activeImageIndex];
    const imgSrc = activeTab.src ? esc(activeTab.src) : '';

    const imgTabsHtml = imageTabs.length > 1 ? `
    <div class="sheet-img-tabs" style="display:flex; gap:6px; margin-bottom:8px; overflow-x:auto;">
      ${imageTabs.map((tab, idx) => `
        <button class="badge-tab ${idx === _activeImageIndex ? 'active' : ''}" 
                style="padding:4px 8px; border-radius:12px; border:1px solid var(--border); background:${idx === _activeImageIndex ? 'var(--accent)' : 'transparent'}; color:${idx === _activeImageIndex ? '#fff' : 'inherit'}; font-size:11px; cursor:pointer; white-space:nowrap;"
                onclick="UISheet.setActiveImage(${idx})">${esc(tab.label)}</button>
      `).join('')}
    </div>` : '';

    const setMainBtnHtml = (_activeImageIndex !== 0 && activeTab.src) ? `
    <button class="btn-change-img" style="margin-top:4px;" onclick="UISheet.setAsMainImage('${esc(activeTab.src)}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/></svg>
      Fijar como principal
    </button>` : '';

    const NO_IMG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Crect fill='transparent' width='280' height='280'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239CA3AF' font-size='22' font-family='sans-serif'%3ESin imagen%3C/text%3E%3C/svg%3E`;
    const pkgOpts = PACKAGE_TYPES.map(pt =>
      `<option value="${pt.value}" ${_data.packageType===pt.value?'selected':''}>${esc(pt.label)}</option>`
    ).join('');
    
    // Universal categories for Master SKU
    const masterCatOpts = UNIVERSAL_CATEGORIES.map(c =>
      `<option value="${esc(c)}" ${(_data.universalCategory || _data.category)===c?'selected':''}>${esc(c)}</option>`
    ).join('');
    
    const rCategories = (rInfo?.categories?.length ? rInfo.categories : UNIVERSAL_CATEGORIES);
    const catOpts = rCategories.map(c =>
      `<option value="${esc(c)}" ${(rData?.localCategoryName || rData?.category)===c?'selected':''}>${esc(c)}</option>`
    ).join('');

    const sourceLabel = {
      'open_food_facts': 'Open Food Facts',
      'open_products_facts': 'Open Products Facts',
      'manual': 'Carga manual',
      'levantamiento': 'App de Levantamiento',
      'mixed': 'Múltiple fuentes'
    }[_data.dataSource] || _data.dataSource || '—';

    // Enrichment badge logic
    let enrichBadge = '';
    if (_data.offAttempted && !_data.enrichFailed) {
      enrichBadge = `<span class="enrich-badge found">✓ Enriquecido — ${sourceLabel}</span>`;
    } else if (_data.offAttempted && _data.enrichFailed) {
      enrichBadge = `<span class="enrich-badge not-found">✗ Sin datos en APIs externas</span>`;
    } else {
      enrichBadge = `<span class="enrich-badge pending">○ Sin consultar API</span>`;
    }

    container.innerHTML = `
<div class="sheet-layout">

  <!-- ═══ LEFT: UNIVERSAL PRODUCTS (MASTER) ═══ -->
  <div class="sheet-left">

    <div class="sheet-hdr">
      <div class="sheet-hdr-left">
        <span class="badge-master">UNIVERSAL PRODUCTS</span>
        <button class="btn-sync" id="sync-btn" onclick="UISheet.syncOFF()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
          Enriquecer SKU
        </button>
      </div>
      <button class="btn-close-sheet" onclick="UISheet.close()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <input class="sheet-title-inp" type="text" id="sheet-name"
      value="${esc(_data.name || '')}" placeholder="Nombre Universal del producto…"
      oninput="UISheet.updateField('name', this.value)">

    <div class="sheet-body-row">
      <!-- Image -->
      <div class="sheet-img-col">
        ${imgTabsHtml}
        <div class="sheet-img-wrap">
          <img id="sheet-img" src="${imgSrc || NO_IMG}" alt="${esc(_data.name || '')}"
               onerror="this.src='${NO_IMG}'">
        </div>
        <div style="display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap; justify-content: center;">
          <button class="btn-change-img" onclick="UISheet.changeImage()">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Subir Imagen
          </button>
          <button class="btn-change-img" style="background: transparent; border: 1px dashed var(--border); color: var(--text-muted);" onclick="UISheet.changeImageUrl()">
            URL manual
          </button>
        </div>
        ${setMainBtnHtml}
      </div>

      <!-- Core Info -->
      <div class="sheet-core-col">
        <p class="section-lbl">INFORMACIÓN CENTRAL</p>

        <div class="form-group">
          <label>Marca Universal</label>
          <input type="text" class="form-input" value="${esc(_data.brand || '')}"
            placeholder="—" oninput="UISheet.updateField('brand', this.value)">
        </div>
        <div class="form-group">
          <label>Categoría Vispera</label>
          <select class="form-select" onchange="UISheet.updateField('universalCategory', this.value); UISheet.updateField('category', this.value);">
            <option value="">Seleccionar…</option>${masterCatOpts}
          </select>
        </div>
        <div class="form-group">
          <label>Tipo de envase</label>
          <select class="form-select" onchange="UISheet.updateField('packageType', this.value)">
            <option value="">Seleccionar…</option>${pkgOpts}
          </select>
        </div>
        <div class="form-group">
          <label>EAN-13 / master_product_id</label>
          <div style="position:relative;">
            <input type="text" class="form-input ${_isCreate ? '' : 'readonly-inp'}" id="sheet-ean-inp" value="${esc(_data.ean)}" ${_isCreate ? 'maxlength="13" oninput="UISheet.validateEANInput(this.value)"' : 'readonly'} oninput="UISheet.updateField('ean', this.value)">
            ${_isCreate ? `<span id="ean-validation-badge" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;"></span>` : ''}
          </div>
          ${_isCreate ? '<p class="form-hint" id="ean-hint">Introduce el EAN para validar el dígito de control.</p>' : ''}
        </div>
        <div class="form-group">
          <label>Peso neto (g)</label>
          <input type="number" class="form-input" value="${_data.weight_g || ''}"
            placeholder="—" min="0"
            oninput="UISheet.updateField('weight_g', parseFloat(this.value)||null)">
        </div>
      </div>
    </div>

    <!-- Meta -->
    <div class="sheet-meta-row">
      ${enrichBadge}
      <span class="meta-chip">Completitud: <strong>${DB.computeCompleteness(_data)}%</strong></span>
    </div>
  </div>

  <!-- ═══ RIGHT: HOLDING SKU CATALOG ═══ -->
  <div class="sheet-right">
    <p class="section-lbl">HOLDING SKU CATALOG</p>

    <div class="retailer-tabs">
      ${holdings.map(r => `
        <button class="r-tab ${r.id===_holding?'active':''}"
          onclick="UISheet.setHolding('${esc(r.id)}')"
          style="${r.id===_holding ? `border-bottom-color:${r.color};color:${r.color}` : ''}">
          ${esc(r.name)}
          ${_data.holdings?.[r.id] ? '' : '<span class="r-tab-dot">+</span>'}
        </button>`).join('')}
    </div><!-- holding-tabs -->

    ${rData ? `
    <!-- Holding form -->
    <div class="retailer-form-area">
      <div class="form-group">
        <label>ID del Holding (holding_internal_id)</label>
        <input type="text" class="form-input" value="${esc(rData.holdingInternalId || rData.customerId || '')}"
          placeholder="ej. TOT-44921-X"
          oninput="UISheet.updateHoldingField('holdingInternalId', this.value); UISheet.updateHoldingField('customerId', this.value);">
      </div>
      <div class="form-group">
        <label>Nombre Local (local_product_name)</label>
        <input type="text" class="form-input" value="${esc(rData.localProductName || rData.name || '')}"
          placeholder="Nombre en este holding"
          oninput="UISheet.updateHoldingField('localProductName', this.value); UISheet.updateHoldingField('name', this.value);">
      </div>
      <div class="form-group">
        <label>Categoría Local</label>
        <select class="form-select" onchange="UISheet.updateHoldingField('localCategoryName', this.value); UISheet.updateHoldingField('category', this.value);">
          <option value="">Seleccionar…</option>${catOpts}
        </select>
      </div>
      <div class="form-group">
        <label>Estado / Stock (is_active_holding)</label>
        <div class="toggle-row">
          <div class="toggle-switch ${inStock?'on':''}" id="stock-toggle" onclick="UISheet.toggleStock()">
            <div class="toggle-knob"></div>
          </div>
          <span id="stock-label">${inStock ? 'Disponible en tienda' : 'Sin stock / Inactivo'}</span>
        </div>
      </div>
      <button class="btn-danger-sm" onclick="UISheet.removeFromHolding('${esc(_holding)}')">
        Quitar de ${esc(rInfo?.name || _holding)} ×
      </button>
    </div>` : `
    <!-- Add to holding -->
    <div class="retailer-empty-area">
      <div class="retailer-empty-icon" style="color:${rInfo?.color||'var(--accent)'}">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      </div>
      <p>Este SKU no está activo en el Holding <strong>${esc(rInfo?.name || _holding)}</strong>.</p>
      <button class="btn-primary" onclick="UISheet.addToHolding('${esc(_holding)}')">
        + Activar en ${esc(rInfo?.name || _holding)}
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

  function validateEANInput(ean) {
    updateField('ean', ean);
    const badge = document.getElementById('ean-validation-badge');
    const hint  = document.getElementById('ean-hint');
    if (!badge) return;
    if (!ean || ean.length < 8) {
      badge.textContent = '';
      if (hint) hint.textContent = 'Introduce el EAN para validar el dígito de control.';
      return;
    }
    const v = DB.validateEAN(ean);
    if (v.valid) {
      badge.textContent = '✓ Válido';
      badge.style.color = 'var(--success, #4ac99b)';
      if (hint) hint.textContent = 'EAN válido.';
    } else {
      badge.textContent = '✗ Inválido';
      badge.style.color = 'var(--danger, #e55)';
      if (hint) hint.textContent = v.reason;
    }
  }

  // Legacy aliases for backward compatibility with external calls
  function updateRetailerField(field, value) { updateHoldingField(field, value); }
  function addToRetailer(rid) { addToHolding(rid); }
  function removeFromRetailer(rid) { removeFromHolding(rid); }
  function setRetailer(rid) { setHolding(rid); }

  return {
    open, openCreate, close, save, discard, syncOFF, changeImage, changeImageUrl, setActiveImage, setAsMainImage,
    updateField, updateHoldingField, toggleStock,
    setHolding, addToHolding, removeFromHolding,
    validateEANInput,
    updateRetailerField, addToRetailer, removeFromRetailer, setRetailer
  };
})();
