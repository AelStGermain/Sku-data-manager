'use strict';

const UIImport = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _step     = 1;
  let _fileData = null;   // { headers, rows }
  let _mapping  = {};     // { ean, name, brand, ... }
  let _retailer = '';     // retailer id
  let _enrich   = true;   // auto-enrich toggle

  const MASTER_FIELDS = [
    { key: 'ean',         label: 'EAN / Barcode *',    required: true  },
    { key: 'name',        label: 'Nombre del producto', required: false },
    { key: 'brand',       label: 'Marca',               required: false },
    { key: 'packageType', label: 'Tipo de paquete',     required: false },
    { key: 'weight',      label: 'Peso (g)',            required: false },
    { key: 'width',       label: 'Ancho (cm)',          required: false },
    { key: 'height',      label: 'Alto (cm)',           required: false },
    { key: 'depth',       label: 'Profundidad (cm)',    required: false },
  ];
  const RETAILER_FIELDS = [
    { key: 'customerId',    label: 'ID interno del retailer' },
    { key: 'retailerName',  label: 'Nombre en ese retailer'  },
    { key: 'category',      label: 'Categoría'               },
    { key: 'retailerImage', label: 'URL imagen oficial'      },
  ];

  function render() {
    const el = document.getElementById('view-import');
    if (!el) return;

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Importar SKUs</h1>
    <p class="view-sub">Importa un CSV o Excel y enriquece automáticamente con Open Food Facts</p>
  </div>
</header>

<!-- Step indicator -->
<div class="step-bar">
  ${['Subir archivo','Mapear columnas','Vista previa','Importar'].map((s,i) => `
    <div class="step-item ${_step===i+1?'active':_step>i+1?'done':''}">
      <div class="step-circle">${_step>i+1?'✓':i+1}</div>
      <span class="step-label">${s}</span>
    </div>
    ${i<3?'<div class="step-line '+(_step>i+1?'done':'')+'"></div>':''}
  `).join('')}
</div>

<div class="import-card">
  ${_step===1 ? renderStep1() : ''}
  ${_step===2 ? renderStep2() : ''}
  ${_step===3 ? renderStep3() : ''}
  ${_step===4 ? renderStep4() : ''}
</div>
`;

    if (_step === 1) _setupDropZone();
  }

  // ── STEP 1: Upload ─────────────────────────
  function renderStep1() {
    return `
<div class="drop-zone" id="drop-zone">
  <div class="drop-inner">
    <div class="drop-icon">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </div>
    <h3>Arrastra tu archivo aquí</h3>
    <p>Soporta <strong>CSV</strong> y <strong>Excel (.xlsx)</strong></p>
    <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display:none" onchange="UIImport.handleFileInput(this)">
    <button class="btn-primary" onclick="document.getElementById('file-input').click()">
      Seleccionar archivo
    </button>
    <p class="drop-hint">El EAN o barcode es el único campo obligatorio</p>
  </div>
</div>
<div id="file-error" class="file-error hidden"></div>`;
  }

  function _setupDropZone() {
    const zone = document.getElementById('drop-zone');
    if (!zone) return;
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragging'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragging');
      const file = e.dataTransfer.files[0];
      if (file) _loadFile(file);
    });
  }

  function handleFileInput(input) {
    if (input.files[0]) _loadFile(input.files[0]);
  }

  async function _loadFile(file) {
    const zone = document.getElementById('drop-zone');
    const errEl = document.getElementById('file-error');
    if (zone) zone.classList.add('loading');
    try {
      _fileData = await Importer.readFile(file);
      _mapping  = {};
      // Auto-detect common column names
      const h = _fileData.headers;
      const find = (...candidates) => { for (const c of candidates) { const m = h.find(col => col.toLowerCase().includes(c.toLowerCase())); if (m) return m; } return ''; };
      _mapping.ean         = find('ean','barcode','codigo','code','upc','gtin');
      _mapping.name        = find('nombre','name','descripcion','description','producto');
      _mapping.brand       = find('marca','brand');
      _mapping.packageType = find('paquete','package','tipo','empaque');
      _mapping.weight      = find('peso','weight','gramaje','gramos');
      _mapping.width       = find('ancho','width');
      _mapping.height      = find('alto','height','altura');
      _mapping.depth       = find('profundidad','depth','largo');
      _mapping.customerId  = find('id_retailer','retailer_id','sku','id_interno','customer_id');
      _mapping.retailerName= find('nombre_retailer');
      _mapping.category    = find('categoria','category');
      _step = 2;
      render();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
      if (zone)  zone.classList.remove('loading');
    }
  }

  // ── STEP 2: Map columns ────────────────────
  function renderStep2() {
    const retailers = DB.getRetailers();
    const headerOpts = [
      `<option value="">— No mapear —</option>`,
      ..._fileData.headers.map(h => `<option value="${esc(h)}">${esc(h)}</option>`)
    ].join('');

    const selOpts = (key) => _fileData.headers.map(h =>
      `<option value="${esc(h)}" ${_mapping[key]===h?'selected':''}>${esc(h)}</option>`
    ).join('');

    const allOpts = (key) => `<option value="">— No mapear —</option>${selOpts(key)}`;

    return `
<div class="map-layout">
  <div class="map-col">
    <h3 class="map-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
      Datos maestros del producto
    </h3>
    ${MASTER_FIELDS.map(f => `
    <div class="map-row">
      <label class="map-label ${f.required?'required':''}">${esc(f.label)}</label>
      <select class="form-select map-sel" id="map-${f.key}" onchange="UIImport.setMapping('${f.key}', this.value)">
        ${f.required ? `<option value="">— Seleccionar —</option>` : `<option value="">— No mapear —</option>`}
        ${selOpts(f.key)}
      </select>
    </div>`).join('')}
  </div>

  <div class="map-col">
    <h3 class="map-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Datos de retailer (opcional)
    </h3>
    <div class="map-row">
      <label class="map-label">Asignar a retailer</label>
      <select class="form-select map-sel" id="map-retailer" onchange="UIImport.setRetailer(this.value)">
        <option value="">— Sin retailer —</option>
        ${retailers.map(r => `<option value="${esc(r.id)}" ${_retailer===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    ${RETAILER_FIELDS.map(f => `
    <div class="map-row">
      <label class="map-label">${esc(f.label)}</label>
      <select class="form-select map-sel" id="map-${f.key}" onchange="UIImport.setMapping('${f.key}', this.value)">
        ${allOpts(f.key)}
      </select>
    </div>`).join('')}

    <div class="enrich-toggle-row">
      <div class="toggle-switch ${_enrich?'on':''}" id="enrich-toggle" onclick="UIImport.toggleEnrich()">
        <div class="toggle-knob"></div>
      </div>
      <div>
        <span class="enrich-label">Enriquecer con Open Food Facts</span>
        <p class="form-hint">Completa automáticamente datos faltantes consultando la API</p>
      </div>
    </div>
  </div>
</div>

<div class="import-nav">
  <button class="btn-outline" onclick="UIImport.goStep(1)">← Volver</button>
  <button class="btn-primary" onclick="UIImport.toPreview()">
    Vista previa →
  </button>
</div>`;
  }

  // ── STEP 3: Preview ────────────────────────
  function renderStep3() {
    const products = Importer.applyMapping(_fileData.rows, _mapping, _retailer);
    const preview  = products.slice(0, 10);
    const extra    = products.length - 10;

    return `
<div class="preview-header">
  <h3>${products.length} producto${products.length!==1?'s':''} listos para importar</h3>
  ${extra > 0 ? `<p class="form-hint">Mostrando los primeros 10 de ${products.length}.</p>` : ''}
</div>
<div class="preview-table-wrap">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre</th>
        <th>Marca</th>
        <th>Paquete</th>
        ${_retailer ? `<th>ID Retailer</th><th>Categoría</th>` : ''}
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      ${preview.map(p => {
        const exists = !!DB.getProduct(p.ean);
        return `<tr class="${exists?'row-update':'row-new'}">
          <td class="mono">${esc(p.ean)}</td>
          <td>${esc(p.name||'—')}</td>
          <td>${esc(p.brand||'—')}</td>
          <td>${esc(p.packageType||'—')}</td>
          ${_retailer ? `<td>${esc(Object.values(p.retailers||{})[0]?.customerId||'—')}</td><td>${esc(Object.values(p.retailers||{})[0]?.category||'—')}</td>` : ''}
          <td><span class="status-badge ${exists?'update':'new'}">${exists?'Actualizar':'Nuevo'}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
${extra > 0 ? `<p class="preview-more">… y ${extra} producto${extra!==1?'s':''} más</p>` : ''}

<div class="import-nav">
  <button class="btn-outline" onclick="UIImport.goStep(2)">← Volver</button>
  <button class="btn-primary" onclick="UIImport.startImport()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Importar ${products.length} producto${products.length!==1?'s':''}${_enrich?' y enriquecer':''}
  </button>
</div>`;
  }

  // ── STEP 4: Importing ─────────────────────
  function renderStep4() {
    return `
<div class="import-progress" id="import-progress">
  <div class="import-spinner"></div>
  <h3 id="import-status">Importando productos…</h3>
  <div class="progress-bar-track">
    <div class="progress-bar-fill" id="import-prog-fill" style="width:0%"></div>
  </div>
  <p id="import-detail" class="import-detail">Procesando…</p>
</div>`;
  }

  // ── STEP navigation ─────────────────────────
  function goStep(n) { _step = n; render(); }

  function toPreview() {
    if (!_mapping.ean) { App.showToast('Debes mapear la columna del EAN', 'error'); return; }
    const sample = Importer.applyMapping(_fileData.rows, _mapping, _retailer);
    if (sample.length === 0) { App.showToast('No se encontraron filas válidas con EAN.', 'error'); return; }
    _step = 3;
    render();
  }

  async function startImport() {
    _step = 4;
    render();

    const products = Importer.applyMapping(_fileData.rows, _mapping, _retailer);
    const fill = document.getElementById('import-prog-fill');
    const detail = document.getElementById('import-detail');
    const status = document.getElementById('import-status');

    // 1) Save all to DB immediately
    const { created, updated } = Importer.importProducts(products);
    if (fill) fill.style.width = '30%';
    if (detail) detail.textContent = `${created} nuevos, ${updated} actualizados.`;

    // 2) Optionally enrich
    if (_enrich && products.length > 0) {
      if (status) status.textContent = 'Enriqueciendo con Open Food Facts…';
      const eans = products.map(p => p.ean);
      let done = 0;

      await API.enrichBatch(eans, (i, total, ean, apiData) => {
        done++;
        const pct = 30 + Math.round((done / total) * 65);
        if (fill) fill.style.width = pct + '%';
        if (detail) detail.textContent = `Enriqueciendo ${done}/${total}: ${ean}`;

        if (apiData) {
          const existing = DB.getProduct(ean);
          if (existing) DB.saveProduct(API.mergeEnriched(existing, apiData));
        }
      });
    }

    if (fill) fill.style.width = '100%';
    if (status) status.textContent = '¡Importación completada!';
    if (detail) detail.textContent = `${created} productos nuevos · ${updated} actualizados${_enrich?' · Enriquecidos con Open Food Facts':''}`;

    // Show done UI
    setTimeout(() => {
      document.getElementById('import-progress').innerHTML += `
        <div class="import-done">
          <button class="btn-primary" onclick="App.navigateTo('catalog')">Ver catálogo →</button>
          <button class="btn-outline" onclick="UIImport.reset()">Importar otro archivo</button>
        </div>`;
    }, 500);
  }

  // ── setters ────────────────────────────────
  function setMapping(field, col) { _mapping[field] = col; }
  function setRetailer(rid)       { _retailer = rid; }
  function toggleEnrich() {
    _enrich = !_enrich;
    const tog = document.getElementById('enrich-toggle');
    if (tog) tog.classList.toggle('on', _enrich);
  }

  function reset() {
    _step = 1; _fileData = null; _mapping = {}; _retailer = ''; _enrich = true;
    render();
  }

  return { render, handleFileInput, setMapping, setRetailer, toggleEnrich, goStep, toPreview, startImport, reset };
})();
