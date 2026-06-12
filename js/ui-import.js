'use strict';

const UIImport = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── state ──────────────────────────────────
  let _step        = 1;
  let _fileData    = null;   // { headers, rows }
  let _mapping     = {};     // field → column name mapping
  let _retailer    = '';     // retailer id selected
  let _enrich      = true;
  let _importMode  = 'fill_empty';   // 'fill_empty' | 'overwrite' | 'skip'
  let _importResults = null;         // { created, updated, skipped, conflictLog }
  let _enrichLog   = [];             // [{ ean, name, status, source }]
  let _cellImages  = {};             // Map of "row,col" -> Blob

  // Labels for each master field
  const MASTER_FIELDS = [
    { key: 'ean',         label: 'EAN / Barcode',        required: true  },
    { key: 'name',        label: 'Nombre del producto',  required: false },
    { key: 'brand',       label: 'Marca',                required: false },
    { key: 'packageType', label: 'Tipo de paquete',      required: false },
    { key: 'weight',      label: 'Peso (g)',             required: false },
    { key: 'width',       label: 'Ancho (cm)',           required: false },
    { key: 'height',      label: 'Alto (cm)',            required: false },
    { key: 'depth',       label: 'Profundidad (cm)',     required: false },
  ];
  const RETAILER_FIELDS = [
    { key: 'customerId',    label: 'ID interno del retailer (Customer ID)' },
    { key: 'retailerName',  label: 'Nombre en ese retailer'                },
    { key: 'category',      label: 'Categoría'                             },
    { key: 'dmu',           label: 'DMU / Pasillo'                         },
    { key: 'position',      label: 'Posición en góndola'                   },
    { key: 'retailerImage', label: 'URL imagen oficial'                    },
  ];

  // ── main render ────────────────────────────
  function render() {
    const el = document.getElementById('view-import');
    if (!el) return;

    const stepLabels = ['Subir archivo','Mapear columnas','Revisar y configurar','Importar','Resultados'];
    const totalSteps = 5;

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Importar SKUs</h1>
    <p class="view-sub">Importa tu CSV o Excel y la plataforma detecta las columnas automáticamente</p>
  </div>
</header>

<!-- Step indicator -->
<div class="step-bar">
  ${stepLabels.map((s, i) => `
    <div class="step-item ${_step===i+1?'active':_step>i+1?'done':''}">
      <div class="step-circle">${_step>i+1?'✓':i+1}</div>
      <span class="step-label">${s}</span>
    </div>
    ${i < stepLabels.length-1 ? `<div class="step-line ${_step>i+1?'done':''}"></div>` : ''}
  `).join('')}
</div>

<div class="import-card">
  ${_step===1 ? renderStep1() : ''}
  ${_step===2 ? renderStep2() : ''}
  ${_step===3 ? renderStep3() : ''}
  ${_step===4 ? renderStep4() : ''}
  ${_step===5 ? renderStep5() : ''}
</div>`;

    if (_step === 1) _setupDropZone();
  }

  // ────────────────────────────────────────────
  //  STEP 1 — File upload
  // ────────────────────────────────────────────
  function renderStep1() {
    return `
<div class="drop-zone" id="drop-zone">
  <div class="drop-inner">
    <div class="drop-icon">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.1">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
    </div>
    <h3>Arrastra tu archivo aquí</h3>
    <p>Soporta <strong>CSV</strong> y <strong>Excel (.xlsx)</strong></p>
    <input type="file" id="file-input" accept=".csv,.xlsx,.xls" style="display:none" onchange="UIImport.handleFileInput(this)">
    <button class="btn-primary" onclick="document.getElementById('file-input').click()">Seleccionar archivo</button>
    <p class="drop-hint">El EAN / código de barras es el único campo obligatorio. El resto se detecta automáticamente.</p>
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
      e.preventDefault(); zone.classList.remove('dragging');
      if (e.dataTransfer.files[0]) _loadFile(e.dataTransfer.files[0]);
    });
  }

  function handleFileInput(input) { if (input.files[0]) _loadFile(input.files[0]); }

  async function _loadFile(file) {
    const zone = document.getElementById('drop-zone');
    const errEl = document.getElementById('file-error');
    if (zone) zone.classList.add('loading');
    try {
      if (file.name.match(/\.xlsx$/i)) {
        _cellImages = await ExcelImageParser.extractImages(file);
      } else {
        _cellImages = {};
      }
      _fileData = await Importer.readFile(file);
      _mapping  = Importer.autoDetect(_fileData.headers);
      _step = 2;
      render();
    } catch (e) {
      if (errEl) { errEl.textContent = e.message; errEl.classList.remove('hidden'); }
      if (zone)  zone.classList.remove('loading');
    }
  }

  // ────────────────────────────────────────────
  //  STEP 2 — Column mapping
  // ────────────────────────────────────────────
  function renderStep2() {
    const { headers } = _fileData;
    const retailers = DB.getRetailers();

    const allFields = [...MASTER_FIELDS, ...RETAILER_FIELDS];
    const detected  = allFields.filter(f => _mapping[f.key] && headers.includes(_mapping[f.key]));
    const requiredMissing = MASTER_FIELDS.filter(f => f.required && !_mapping[f.key]);

    const chips = allFields.map(f => {
      const col = _mapping[f.key];
      if (col) return `<span class="detect-chip ok" title="${esc(f.label)} → &quot;${esc(col)}&quot;">✓ ${esc(f.label)}</span>`;
      if (f.required) return `<span class="detect-chip required" title="Requerido — no detectado">✕ ${esc(f.label)}</span>`;
      return `<span class="detect-chip none" title="No detectado">— ${esc(f.label)}</span>`;
    }).join('');

    const pct = Math.round((detected.length / allFields.length) * 100);

    const selOpts = (key) => headers.map(h =>
      `<option value="${esc(h)}" ${_mapping[key]===h?'selected':''}>${esc(h)}</option>`
    ).join('');
    const allOpts = (key) => `<option value="">— No mapear —</option>${selOpts(key)}`;
    const reqOpts = (key) => `<option value="">— Seleccionar —</option>${selOpts(key)}`;

    return `
<!-- Detection summary -->
<div class="detect-summary">
  <div class="detect-summary-header">
    <div class="detect-summary-left">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <strong>Detección automática</strong>
      <span class="detect-count">${detected.length} de ${allFields.length} campos identificados</span>
    </div>
    <div class="detect-pct-bar">
      <div class="detect-pct-fill" style="width:${pct}%"></div>
    </div>
  </div>
  <div class="detect-chips">${chips}</div>
  ${requiredMissing.length ? `<p class="detect-warn">⚠ El campo <strong>${requiredMissing.map(f=>f.label).join(', ')}</strong> es obligatorio. Selecciónalo manualmente.</p>` : ''}
</div>

<!-- Column mapping -->
<div class="map-layout">
  <div class="map-col">
    <h3 class="map-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
      Datos maestros del producto
    </h3>
    ${MASTER_FIELDS.map(f => `
    <div class="map-row">
      <label class="map-label ${f.required?'required':''}">${esc(f.label)}</label>
      <div class="map-sel-wrap">
        <select class="form-select map-sel" onchange="UIImport.setMapping('${f.key}', this.value)">
          ${f.required ? reqOpts(f.key) : allOpts(f.key)}
        </select>
        ${_mapping[f.key] ? '<span class="auto-badge">AUTO</span>' : ''}
      </div>
    </div>`).join('')}
  </div>

  <div class="map-col">
    <h3 class="map-section-title">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Datos de retailer / levantamiento
    </h3>
    <div class="map-row">
      <label class="map-label">Asignar a retailer</label>
      <select class="form-select map-sel" onchange="UIImport.setRetailer(this.value)">
        <option value="">— Sin retailer —</option>
        ${retailers.map(r => `<option value="${esc(r.id)}" ${_retailer===r.id?'selected':''}>${esc(r.name)}</option>`).join('')}
      </select>
    </div>
    ${RETAILER_FIELDS.map(f => `
    <div class="map-row">
      <label class="map-label">${esc(f.label)}</label>
      <div class="map-sel-wrap">
        <select class="form-select map-sel" onchange="UIImport.setMapping('${f.key}', this.value)">
          ${allOpts(f.key)}
        </select>
        ${_mapping[f.key] ? '<span class="auto-badge">AUTO</span>' : ''}
      </div>
    </div>`).join('')}

    <div class="enrich-toggle-row">
      <div class="toggle-switch ${_enrich?'on':''}" id="enrich-toggle" onclick="UIImport.toggleEnrich()">
        <div class="toggle-knob"></div>
      </div>
      <div>
        <span class="enrich-label">Enriquecer con APIs externas</span>
        <p class="form-hint">Completa datos faltantes en paralelo vía Open Food Facts y Open Products Facts</p>
      </div>
    </div>
  </div>
</div><!-- map-layout -->

<!-- Columns in file (reference) -->
<details class="columns-detail">
  <summary>Ver todas las columnas del archivo (${headers.length})</summary>
  <div class="columns-list">
    ${headers.map(h => `<code class="col-chip">${esc(h)}</code>`).join('')}
  </div>
</details>

<div class="import-nav">
  <button class="btn-outline" onclick="UIImport.goStep(1)">← Volver</button>
  <button class="btn-primary" onclick="UIImport.toPreview()">Vista previa →</button>
</div>`;
  }

  // ────────────────────────────────────────────
  //  STEP 3 — Preview + conflict analysis + mode
  // ────────────────────────────────────────────
  function renderStep3() {
    const products  = Importer.applyMapping(_fileData.rows, _mapping, _retailer, { headers: _fileData.headers, cellImages: _cellImages });
    const { conflicts, news, total } = Importer.analyzeConflicts(products);
    const preview   = products.slice(0, 12);
    const extra     = products.length - 12;

    const modeBtn = (mode, label, desc) => `
      <button class="mode-btn ${_importMode===mode?'active':''}" onclick="UIImport.setMode('${mode}')">
        <span class="mode-dot ${_importMode===mode?'on':''}"></span>
        <div><strong>${label}</strong><p>${desc}</p></div>
      </button>`;

    return `
<!-- Summary bar -->
<div class="preview-summary-bar">
  <div class="psb-stat">
    <span class="psb-v new">${news.length}</span>
    <span class="psb-l">Nuevos</span>
  </div>
  <div class="psb-divider"></div>
  <div class="psb-stat">
    <span class="psb-v ${conflicts.length>0?'warn':'ok'}">${conflicts.length}</span>
    <span class="psb-l">Ya existen</span>
  </div>
  <div class="psb-divider"></div>
  <div class="psb-stat">
    <span class="psb-v">${total}</span>
    <span class="psb-l">Total en archivo</span>
  </div>
  ${_enrich ? `
  <div class="psb-divider"></div>
  <div class="psb-stat">
    <span class="psb-v" style="color:var(--accent)">⚡</span>
    <span class="psb-l">Enriquecimiento<br>paralelo activo</span>
  </div>` : ''}
</div>

${conflicts.length > 0 ? `
<!-- Conflict configuration -->
<div class="conflict-panel">
  <div class="conflict-panel-header">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <strong>${conflicts.length} producto${conflicts.length!==1?'s':''} ya existen en la plataforma</strong>
    <span class="conflict-eans">${conflicts.slice(0,3).map(c=>c.incoming.ean).join(', ')}${conflicts.length>3?` y ${conflicts.length-3} más`:''}</span>
  </div>
  <p class="conflict-question">¿Qué hacer con los duplicados?</p>
  <div class="mode-btns">
    ${modeBtn('fill_empty','Rellenar vacíos','Solo agrega datos que faltan. No sobreescribe lo que ya existe.')}
    ${modeBtn('overwrite','Actualizar todo','Sobreescribe los datos del archivo sobre los existentes.')}
    ${modeBtn('skip','Omitir duplicados','No toca los productos que ya están en la plataforma.')}
  </div>
</div>` : ''}

<!-- Preview table -->
<div class="preview-header"><h3>${total} producto${total!==1?'s':''} listos para importar</h3></div>
<div class="preview-table-wrap">
  <table class="preview-table">
    <thead>
      <tr>
        <th>#</th>
        <th>EAN</th>
        <th>Nombre</th>
        <th>Marca</th>
        ${_retailer ? '<th>ID Retailer</th><th>DMU</th><th>Pos.</th>' : ''}
        <th>Estado</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${preview.map((p, i) => {
        const exists = !!DB.getProduct(p.ean);
        const rData  = _retailer ? Object.values(p.retailers||{})[0] : null;
        return `<tr class="${exists?'row-conflict':'row-new'}">
          <td class="row-num">${i+1}</td>
          <td class="mono">${esc(p.ean)}</td>
          <td>${esc(p.name||'—')}</td>
          <td>${esc(p.brand||'—')}</td>
          ${_retailer ? `<td>${esc(rData?.customerId||'—')}</td><td>${esc(rData?.dmu||'—')}</td><td>${esc(rData?.position||'—')}</td>` : ''}
          <td><span class="status-badge ${exists?'conflict':'new'}">${exists?'⚠ Ya existe':'✚ Nuevo'}</span></td>
          <td>${exists ? `<button class="btn-mini" onclick="App.openSheet('${esc(p.ean)}')">Ver →</button>` : ''}</td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>
${extra > 0 ? `<p class="preview-more">… y ${extra} producto${extra!==1?'s':''} más no mostrados</p>` : ''}

<div class="import-nav">
  <button class="btn-outline" onclick="UIImport.goStep(2)">← Volver</button>
  <button class="btn-primary" onclick="UIImport.startImport()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
    Importar ${total} producto${total!==1?'s':''}${_enrich?' + enriquecer (paralelo)':''}
  </button>
</div>`;
  }

  // ────────────────────────────────────────────
  //  STEP 4 — Progress
  // ────────────────────────────────────────────
  function renderStep4() {
    return `
<div class="import-progress" id="import-progress">
  <div class="import-spinner"></div>
  <h3 id="import-status">Importando productos…</h3>
  <div class="progress-bar-track">
    <div class="progress-bar-fill" id="import-prog-fill" style="width:0%"></div>
  </div>
  <p id="import-detail" class="import-detail">Iniciando…</p>
  <!-- Live enrich log -->
  <div id="enrich-live-log" style="margin-top:16px; max-height:220px; overflow-y:auto; display:none;">
    <p style="font-size:11px; font-weight:600; color:var(--text-muted); margin:0 0 6px;">Log de enriquecimiento en tiempo real:</p>
    <div id="enrich-log-rows" style="font-size:11px; font-family:monospace; display:flex; flex-direction:column; gap:2px;"></div>
  </div>
</div>`;
  }

  // ────────────────────────────────────────────
  //  STEP 5 — Results with conflict + enrich report
  // ────────────────────────────────────────────
  function renderStep5() {
    if (!_importResults) return '<p>Sin resultados.</p>';
    const { created, updated, skipped, conflictLog } = _importResults;

    const enrichFound   = _enrichLog.filter(x => x.status === 'found').length;
    const enrichMissed  = _enrichLog.filter(x => x.status === 'not_found').length;

    const conflictRows = conflictLog.map(c => `
      <tr>
        <td class="mono">${esc(c.ean)}</td>
        <td>${esc(c.name||'—')}</td>
        <td><span class="status-badge ${c.action==='updated'?'update':'skip'}">${c.action==='updated'?'Actualizado':'Omitido'}</span></td>
        <td><button class="btn-mini" onclick="App.openSheet('${esc(c.ean)}')">Ver Technical Sheet →</button></td>
      </tr>`).join('');

    return `
<div class="results-header">
  <div class="results-icon">✓</div>
  <h2>¡Importación completada!</h2>
</div>

<div class="results-stats">
  <div class="rstat-big new">
    <span class="rstat-big-v">${created}</span>
    <span class="rstat-big-l">✚ Nuevos productos</span>
  </div>
  <div class="rstat-big update">
    <span class="rstat-big-v">${updated}</span>
    <span class="rstat-big-l">↻ Actualizados</span>
  </div>
  <div class="rstat-big skip">
    <span class="rstat-big-v">${skipped}</span>
    <span class="rstat-big-l">○ Omitidos</span>
  </div>
</div>

${_enrich && _enrichLog.length > 0 ? `
<div class="enrich-results-panel">
  <p class="enrich-results-title">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
    Enriquecimiento API — ${enrichFound} encontrados · ${enrichMissed} no encontrados
  </p>
  <details>
    <summary style="cursor:pointer; font-size:12px; color:var(--text-muted); margin-bottom:6px;">Ver detalle por EAN</summary>
    <div class="enrich-log-detail">
      ${_enrichLog.map(x => `
        <div class="enrich-log-row ${x.status}">
          <span class="mono">${esc(x.ean)}</span>
          ${x.status === 'found'
            ? `<span>✓ ${esc(x.name||'Sin nombre')} <em style="opacity:.6">(${esc(x.source)})</em></span>`
            : `<span style="opacity:.5">✗ No encontrado</span>`}
        </div>`).join('')}
    </div>
  </details>
</div>` : ''}

${conflictLog.length > 0 ? `
<div class="conflict-log">
  <p class="conflict-log-title">Productos que ya existían en la plataforma:</p>
  <div class="preview-table-wrap">
    <table class="preview-table">
      <thead><tr><th>EAN</th><th>Nombre</th><th>Resultado</th><th></th></tr></thead>
      <tbody>${conflictRows}</tbody>
    </table>
  </div>
</div>` : ''}

<div class="results-actions">
  <button class="btn-primary" onclick="App.navigateTo('catalog')">Ver catálogo →</button>
  <button class="btn-outline" onclick="UIImport.reset()">Importar otro archivo</button>
</div>`;
  }

  // ────────────────────────────────────────────
  //  IMPORT EXECUTION
  // ────────────────────────────────────────────
  async function startImport() {
    if (!_mapping.ean) { App.showToast('Debes mapear la columna del EAN', 'error'); return; }

    _enrichLog = [];
    _step = 4;
    render();

    const fill   = document.getElementById('import-prog-fill');
    const detail = document.getElementById('import-detail');
    const status = document.getElementById('import-status');

    // 1) Extract images from Excel and Import products into DB
    const products = Importer.applyMapping(_fileData.rows, _mapping, _retailer, { headers: _fileData.headers, cellImages: _cellImages });
    
    if (status) status.textContent = 'Procesando imágenes de Excel...';
    let imgCount = 0;
    for (const p of products) {
       if (p._imageBlob) {
          imgCount++;
          if (detail) detail.textContent = `Procesando imagen ${imgCount}...`;
          try {
             // Subirá a Supabase Storage, o devolverá Base64 nativo si no está configurado
             const url = await DB.uploadProductImage(p.ean, p._imageBlob, 'product');
             p.imageUrl = url;
             if (_retailer && p.retailers[_retailer]) {
                p.retailers[_retailer].imageUrl = url;
             }
          } catch(e) { console.error('Error procesando imagen para', p.ean, e); }
          delete p._imageBlob;
       }
    }

    _importResults = Importer.importWithMode(products, _importMode);
    if (fill) fill.style.width = '30%';
    if (detail) detail.textContent = `${_importResults.created} nuevos · ${_importResults.updated} actualizados · ${_importResults.skipped} omitidos`;

    // 2) Parallel enrichment
    if (_enrich && products.length > 0) {
      if (status) status.textContent = 'Enriqueciendo con APIs externas (en paralelo)…';

      const liveLog = document.getElementById('enrich-live-log');
      const logRows = document.getElementById('enrich-log-rows');
      if (liveLog) liveLog.style.display = 'block';

      const eans = products.map(p => p.ean);
      let done = 0;

      await API.enrichBatch(eans, (i, total, ean, apiData) => {
        done++;
        const pct = 30 + Math.round((done / total) * 65);
        if (fill) fill.style.width = pct + '%';
        if (detail) detail.textContent = `Enriqueciendo ${done}/${total}…`;

        // Save each enriched product immediately as it arrives
        const existing = DB.getProduct(ean);
        if (existing) {
          const merged = API.mergeEnriched(existing, apiData);
          DB.saveProduct(merged);
        }

        // Log entry
        const logEntry = apiData
          ? { ean, name: apiData.name, status: 'found', source: apiData.dataSource === 'open_food_facts' ? 'Open Food Facts' : 'Open Products Facts' }
          : { ean, status: 'not_found' };
        _enrichLog.push(logEntry);

        // Append live log row
        if (logRows) {
          const row = document.createElement('div');
          row.style.cssText = `padding:2px 6px; border-radius:3px; background:${apiData ? 'rgba(74,201,155,0.08)' : 'rgba(196,43,32,0.06)'}; color:${apiData ? '#4ac99b' : 'var(--text-muted)'};`;
          row.textContent = apiData
            ? `✓ ${ean}  →  ${apiData.name || 'sin nombre'}`
            : `✗ ${ean}  —  no encontrado`;
          logRows.appendChild(row);
          logRows.scrollTop = logRows.scrollHeight;
        }
      }, 5); // 5 concurrent requests
    }

    if (fill) fill.style.width = '100%';
    if (status) status.textContent = 'Procesando resultados…';
    await new Promise(r => setTimeout(r, 400));

    _step = 5;
    render();
  }

  // ── helpers ────────────────────────────────
  function setMapping(field, col) { _mapping[field] = col; }
  function setRetailer(rid)       { _retailer = rid; }
  function setMode(mode) {
    _importMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.getAttribute('onclick').includes(mode)));
    document.querySelectorAll('.mode-dot').forEach((d, i) => {
      const btns = [...document.querySelectorAll('.mode-btn')];
      d.classList.toggle('on', btns[i]?.classList.contains('active'));
    });
  }
  function toggleEnrich() {
    _enrich = !_enrich;
    const tog = document.getElementById('enrich-toggle');
    if (tog) tog.classList.toggle('on', _enrich);
  }
  function toPreview() {
    if (!_mapping.ean) { App.showToast('Debes seleccionar la columna del EAN', 'error'); return; }
    const sample = Importer.applyMapping(_fileData.rows, _mapping, _retailer, { headers: _fileData.headers, cellImages: _cellImages });
    if (sample.length === 0) { App.showToast('No se encontraron filas válidas con EAN.', 'error'); return; }
    _step = 3;
    render();
  }
  function goStep(n) { _step = n; render(); }
  function reset() {
    _step=1; _fileData=null; _mapping={}; _retailer=''; _enrich=true;
    _importMode='fill_empty'; _importResults=null; _enrichLog=[];
    render();
  }

  return { render, handleFileInput, setMapping, setRetailer, setMode, toggleEnrich, goStep, toPreview, startImport, reset };
})();
