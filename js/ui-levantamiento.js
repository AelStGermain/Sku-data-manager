'use strict';

const UILevantamiento = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  let _hasSyncedFirebase = false;
  let _auditoresFetched = false;
  let _filterDateFrom = '';
  let _filterDateTo = '';
  let _filterAuditor = '';
  let _filterDmu = '';
  let _filterCategoria = '';
  let _auditoresOpts = '';
  let _dmusOpts = '';
  
  async function fetchMetadata() {
    if (_auditoresFetched || !window.FirebaseAPI) return;
    try {
      const [auditores, dmus] = await Promise.all([
        window.FirebaseAPI.obtenerAuditores(),
        window.FirebaseAPI.obtenerTiposNegocio()
      ]);
      _auditoresOpts = auditores.map(a => `<option value="${esc(a.nombre || a.id)}">`).join('');
      _dmusOpts = dmus.map(d => `<option value="${esc(d.nombre || d.id)}">`).join('');
      _auditoresFetched = true;
      render();
    } catch(e) {
      console.warn("No se pudieron cargar catálogos desde Firebase", e);
    }
  }

  function render() {
    const el = document.getElementById('view-levantamiento');
    if (!el) return;

    const holdings = DB.getHoldings();
    const staging = DB.getStagingLevantamiento();
    const holdingOpts = holdings.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
    const catOpts = UNIVERSAL_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">App de Levantamiento</h1>
    <p class="view-sub">Escanear datos de productos y asociarlos con un DMU (Góndola/Category ID)</p>
  </div>
</header>

<div class="levantamiento-layout">
  <!-- Search / Filter Panel -->
  <div class="lev-panel lev-input-panel">
    <div class="lev-panel-header">
      <h3> Búsqueda de Levantamientos</h3>
      <p class="lev-panel-sub">Buscar en Firebase por fecha, auditor o DMU</p>
    </div>
    <div class="lev-form">
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Desde Fecha</label>
          <input type="date" id="fb-filter-date-from" class="form-input" value="${_filterDateFrom}" onchange="UILevantamiento.setFilters()">
        </div>
        <div class="form-group" style="flex:1">
          <label>Hasta Fecha</label>
          <input type="date" id="fb-filter-date-to" class="form-input" value="${_filterDateTo}" onchange="UILevantamiento.setFilters()">
        </div>
      </div>
      <div class="form-group">
        <label>Auditor</label>
        <input type="text" list="fb-auditores-list" id="fb-filter-auditor" class="form-input" placeholder="Todos los Auditores..." value="${_filterAuditor}" onchange="UILevantamiento.setFilters()">
        <datalist id="fb-auditores-list">${_auditoresOpts}</datalist>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>DMU / Góndola</label>
          <input type="text" list="fb-dmus-list" id="fb-filter-dmu" class="form-input" placeholder="Todos los DMUs..." value="${_filterDmu}" onchange="UILevantamiento.setFilters()">
          <datalist id="fb-dmus-list">${_dmusOpts}</datalist>
        </div>
        <div class="form-group" style="flex:1">
          <label>Categoría</label>
          <select id="fb-filter-cat" class="form-select" onchange="UILevantamiento.setFilters()">
            <option value="">Todas las Categorías</option>
            ${catOpts}
          </select>
        </div>
      </div>
      <div style="margin-top:16px;">
        <button class="btn-primary" style="width:100%; justify-content:center; padding:12px;" onclick="UILevantamiento.syncFirebase(true)">
          <span class="spin-ico" id="fb-sync-icon">🔥</span> Descargar Resultados
        </button>
      </div>
    </div>
    
    <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:16px;">
       <details>
         <summary style="cursor:pointer; font-weight:600; color:var(--text-muted); display:flex; align-items:center; gap:8px;">
           <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
           Agregar SKU Manualmente
         </summary>
         <div class="lev-form" style="margin-top:12px;">
            <div class="form-group">
              <label>Holding</label>
              <select class="form-select" id="lev-holding">${holdingOpts}</select>
            </div>
            <div class="form-group">
              <label>EAN (Código de Barra)</label>
              <input type="text" class="form-input" id="lev-ean" placeholder="7801320242247" maxlength="14">
            </div>
            <div class="form-row">
              <div class="form-group" style="flex:1">
                <label>DMU / Góndola</label>
                <input type="text" list="lev-dmus-list" class="form-input" id="lev-dmu" placeholder="Ej: ACEITES">
                <datalist id="lev-dmus-list">${_dmusOpts}</datalist>
              </div>
              <div class="form-group" style="flex:1">
                <label>Categoría</label>
                <select class="form-select" id="lev-cat">${catOpts}</select>
              </div>
            </div>
            <div class="form-group">
              <label>Auditor</label>
              <input type="text" list="lev-auditores-list" class="form-input" id="lev-auditor" placeholder="Nombre del auditor">
              <datalist id="lev-auditores-list">${_auditoresOpts}</datalist>
            </div>
            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
              <button class="btn-outline" onclick="UILevantamiento.addEntry()">Agregar al Staging</button>
            </div>
         </div>
       </details>
    </div>
  </div>

  <!-- Raw Data Panel -->
  <div class="lev-panel lev-raw-panel">
    <div class="lev-panel-header">
      <h3> Levantamiento Raw Data</h3>
      <p class="lev-panel-sub">DMU, EAN, Categoría, Auditor, Timestamp</p>
    </div>
    <div class="lev-raw-table-wrap">
      ${staging.length === 0
        ? `<div class="empty-state" style="padding:32px;"><div class="empty-icon">📦</div><h3>Sin registros</h3><p>Agrega entradas de levantamiento usando el formulario.</p></div>`
        : `<table class="preview-table">
            <thead>
              <tr>
                <th>EAN</th>
                <th>Holding</th>
                <th>Nombre Identificado</th>
                <th>Categoría</th>
                <th>Auditor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${staging.slice(-25).reverse().map(s => `
              <tr style="background:${s.status === 'MATCHED' ? '#d4edda' : (s.status === 'UNDEFINED' ? '#fff3cd' : 'transparent')}">
                <td class="mono" style="font-weight:600;">${esc(s.ean)}</td>
                <td><span class="holding-badge-sm">${esc(s.holdingId)}</span></td>
                <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${esc(s.firebaseName || s.dmu)}">${esc(s.firebaseName || s.dmu || '—')}</td>
                <td><span class="vispera-cat-badge" style="--cat-color:${VISPERA_CATEGORY_COLORS[s.category] || '#888'}">${esc(s.category)}</span></td>
                <td>${esc(s.auditor)}</td>
                <td>
                  <span class="badge" style="background:${s.status === 'MATCHED' ? '#28a745' : (s.status === 'UNDEFINED' ? '#ffc107' : 'var(--border)')}; color:${s.status === 'UNDEFINED' ? '#000' : '#fff'}">
                    ${s.status === 'MATCHED' ? '✔️ Matched' : (s.status === 'UNDEFINED' ? '⚠️ Indefinido' : 'Pendiente')}
                  </span>
                </td>
                <td><button class="btn-mini" style="color:var(--danger)" onclick="UILevantamiento.removeEntry(${staging.indexOf(s)})">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>`
      }
    </div>
    ${staging.length > 0 ? `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:12px; border-top:1px solid var(--border);">
      <button class="btn-clear" onclick="UILevantamiento.clearStaging()">Limpiar Staging</button>
      <span style="font-size:12px; color:var(--text-muted)">${staging.length} registro(s)</span>
    </div>` : ''}
  </div>
</div>

<!-- Pipeline Visual -->
<div class="pipeline-visual">
  <h3 style="margin-bottom:16px;">Auditoría de Matching</h3>
  <div class="pipeline-steps">
    <div class="pipeline-step">
      <div class="pipeline-step-number">1</div>
      <div class="pipeline-step-content">
        <h4>Comparar Staging EANs</h4>
        <p>Contra el Master SKU EAN Index</p>
      </div>
    </div>
    <div class="pipeline-arrow">→</div>
    <div class="pipeline-step">
      <div class="pipeline-step-number">2</div>
      <div class="pipeline-step-content">
        <h4>EANs no matcheados</h4>
        <p>Enviar a staging_unmatched_eans</p>
      </div>
    </div>
    <div class="pipeline-arrow">→</div>
    <div class="pipeline-step">
      <div class="pipeline-step-number">3</div>
      <div class="pipeline-step-content">
        <h4>Enriquecer con APIs</h4>
        <p>Open Food Facts / Open Products</p>
      </div>
    </div>
    <div class="pipeline-arrow">→</div>
    <div class="pipeline-step step-review">
      <div class="pipeline-step-number">4</div>
      <div class="pipeline-step-content">
        <h4>Revisión Manual</h4>
        <p>Portal GUI para aprobar</p>
      </div>
    </div>
  </div>
</div>`;

    if (!_hasSyncedFirebase) {
      setTimeout(() => syncFirebase(false), 500); // Auto sync once on first render
    }
    fetchMetadata();
  }

  function setFilters() {
    _filterDateFrom = document.getElementById('fb-filter-date-from')?.value || '';
    _filterDateTo = document.getElementById('fb-filter-date-to')?.value || '';
    _filterAuditor = document.getElementById('fb-filter-auditor')?.value || '';
    _filterDmu = document.getElementById('fb-filter-dmu')?.value || '';
    _filterCategoria = document.getElementById('fb-filter-cat')?.value || '';
  }

  function addEntry() {
    const ean = document.getElementById('lev-ean')?.value.trim();
    const holdingId = document.getElementById('lev-holding')?.value;
    const dmu = document.getElementById('lev-dmu')?.value.trim();
    const category = document.getElementById('lev-cat')?.value;
    const auditor = document.getElementById('lev-auditor')?.value.trim();

    if (!ean || ean.length < 6) {
      if (!ean) {
        // Ruta C (Terreno): Producto sin EAN
        DB.addStagingNoEan({ holdingId, dmu, category, auditor, source: 'Manual' });
        App.showToast(`Registro SIN EAN agregado a Por Identificar`, 'info');
        document.getElementById('lev-ean').value = '';
        document.getElementById('lev-dmu').value = '';
        return;
      }
      App.showToast('EAN debe tener al menos 6 dígitos', 'error');
      return;
    }

    // EAN checksum warning (non-blocking)
    const eanCheck = DB.validateEAN(ean);
    if (!eanCheck.valid) {
      App.showToast(`⚠️ EAN ${ean}: ${eanCheck.reason}`, 'warning');
    }

    DB.addStagingLevantamiento({ ean, holdingId, dmu, category, auditor });
    App.showToast(`EAN ${ean} agregado a Staging`, 'success');
    document.getElementById('lev-ean').value = '';
    document.getElementById('lev-dmu').value = '';
    render();
  }

  function removeEntry(idx) {
    const staging = DB.getStagingLevantamiento();
    staging.splice(idx, 1);
    try { localStorage.setItem('ss_staging_levantamiento', JSON.stringify(staging)); } catch (e) { localStorage.removeItem('ss_products_cache'); try { localStorage.setItem('ss_staging_levantamiento', JSON.stringify(staging)); } catch(e2) {} }
    render();
  }

  function clearForm() {
    document.getElementById('lev-ean').value = '';
    document.getElementById('lev-dmu').value = '';
  }

  function clearStaging() {
    if (!confirm('¿Limpiar todo el staging de levantamiento?')) return;
    DB.clearStagingLevantamiento();
    App.showToast('Staging limpiado', 'info');
    render();
  }

  async function syncFirebase(force = false) {
    if (!window.FirebaseAPI) {
      if (force) App.showToast('SDK de Firebase no cargado aún.', 'warning');
      return;
    }
    if (_hasSyncedFirebase && !force) return;

    if (force) App.showToast('Buscando levantamientos en Firebase...', 'info');
    const icon = document.getElementById('fb-sync-icon');
    if (icon) icon.style.animation = 'spin 1s linear infinite';

    function cleanOCRName(rawName) {
      if (!rawName) return 'Desconocido';
      return String(rawName).replace(/\$?\d+(?:[.,]\d+)?\s*POR\s*KG/gi, '').trim() || 'Desconocido';
    }

    try {
      const opts = { limitCount: 150 };
      if (_filterDateFrom) opts.fechaInicio = _filterDateFrom;
      if (_filterDateTo) opts.fechaFin = _filterDateTo;
      if (_filterAuditor) opts.auditor = _filterAuditor;
      if (_filterDmu) opts.dmu = _filterDmu;
      if (_filterCategoria) opts.categoria = _filterCategoria;
      const datos = await window.FirebaseAPI.obtenerLevantamientos(opts);
      
      if (force) {
         DB.clearStagingLevantamiento();
      }
      
      let agregados = 0;
      let agregadosNoEan = 0;
      const staging = DB.getStagingLevantamiento();
      let nuevos = [];

      for (const reg of datos) {
        let eanStr = String(reg.ean || '').trim();
        let isValidEan = false;
        
        if (eanStr) {
           const eanCheck = DB.validateEAN(eanStr);
           isValidEan = eanCheck.valid;
        }

        if (!isValidEan) {
           // Ruta C (Terreno): Producto sin EAN o EAN inválido (probablemente un DMU)
           const existsNoEan = DB.getStagingNoEan().find(s => s.firebaseId === reg.id);
           if (!existsNoEan) {
              const mappedCategory = reg.categoria || ''; 
              const holding = reg.holding || document.getElementById('lev-holding')?.value || 'TOTTUS';
              DB.addStagingNoEan({
                 firebaseId: reg.id,
                 holdingId: holding,
                 dmu: reg.dmu || reg.pasillo || (eanStr ? eanStr : mappedCategory),
                 category: mappedCategory,
                 auditor: reg.auditor || 'App Terreno',
                 timestamp: reg.fecha?.toDate ? reg.fecha.toDate().toISOString() : new Date().toISOString(),
                 firebaseName: cleanOCRName(reg.productoWeb || reg.nombreProductoOCR),
                 firebasePrice: reg.precioWeb || reg.precioOCR
              });
              agregadosNoEan++;
           }
           continue;
        }
        
        const exists = staging.find(s => s.firebaseId === reg.id);
        if (!exists) nuevos.push(reg);
      }

      if (nuevos.length > 0) {
        App.showToast(`Encontrados ${nuevos.length} registros. Triangulando con Open Products...`, 'info');
        
        // Auto-enriquecimiento rápido (Lotes de 10)
        const chunkSize = 10;
        for (let i = 0; i < nuevos.length; i += chunkSize) {
          const chunk = nuevos.slice(i, i + chunkSize);
          await Promise.all(chunk.map(async (reg) => {
             const apiData = await API.enrichProduct(reg.ean);
             
             let mappedName = 'Desconocido';
             let mappedCategory = reg.categoria || '';
             if (apiData && apiData.name) {
               mappedName = apiData.name;
               if (apiData.masterCategory) mappedCategory = apiData.masterCategory;
             }
             
             const holding = reg.holding || document.getElementById('lev-holding')?.value || 'TOTTUS';
             const timestamp = reg.fecha?.toDate ? reg.fecha.toDate().toISOString() : new Date().toISOString();
  
             DB.addStagingLevantamiento({
               firebaseId: reg.id,
               ean: reg.ean,
               holdingId: holding,
               dmu: reg.dmu || reg.pasillo || mappedCategory,
               category: mappedCategory,
               auditor: reg.auditor || 'App Terreno',
               timestamp: timestamp,
               firebaseName: cleanOCRName(mappedName),
               firebasePrice: reg.precioWeb || reg.precioOCR,
               firebaseInternalCode: reg.codigoInternoOCR,
               status: 'PENDING'
             });
             agregados++;
          }));
          
          render(); // Refrescar para ver cómo van apareciendo
          await new Promise(r => setTimeout(r, 1000)); // Pausa anti-spam
        }
      }
      
      _hasSyncedFirebase = true;
      if (agregados > 0 || agregadosNoEan > 0) {
        if (!force) App.showToast(`Se descargaron ${agregados} completos y ${agregadosNoEan} sin EAN 🔥`, 'success');
      }
      
      // AUTO MATCHING: Process directly to master catalog
      await processStaging(true);
      
    } catch (err) {
      console.error("Firebase sync error:", err);
      if (force) App.showToast('Error conectando con Firebase. Ver consola.', 'error');
    } finally {
      if (icon) icon.style.animation = '';
    }
  }

  async function processStaging(silent = false) {
    const staging = DB.getStagingLevantamiento();
    const pending = staging.filter(s => s.status === 'PENDING' || !s.status);
    
    if (pending.length === 0) {
      if (!silent) App.showToast('No hay registros pendientes en staging para procesar', 'warning');
      return;
    }

    if (!silent) App.showToast(`Procesando ${pending.length} registros a través del Pipeline...`, 'info');

    let matched = 0;
    let unmatched = 0;
    let visperaTickets = 0;

    for (const entry of pending) {
      // Step 1: Compare against Master SKU EAN index
      const existing = DB.getProduct(entry.ean);

      if (existing) {
        // Matched! Update the holding relation
        const holdings = existing.holdings || {};
        if (!holdings[entry.holdingId]) {
          holdings[entry.holdingId] = {
            holdingInternalId: entry.ean,
            customerId: entry.ean,
            localProductName: existing.name,
            name: existing.name,
            localCategoryName: entry.category || existing.universalCategory,
            category: entry.category || existing.universalCategory,
            dmu: entry.dmu,
            isActiveHolding: true,
            stockStatus: true,
            updatedAt: new Date().toISOString()
          };
          existing.holdings = holdings;
          await DB.saveProduct(existing, true);
        }
        
        DB.addRecentMatch({
          ean: entry.ean,
          name: existing.name,
          category: entry.category || existing.universalCategory,
          dmu: entry.dmu,
          auditor: entry.auditor,
          holdingId: entry.holdingId,
          type: 'MATCH_EXISTENTE'
        });
        
        // Vispera Check: si el producto existe pero no tiene ID de Vispera
        if (!existing.visperaId) {
          DB.addVisperaBatchItem({
            ean: entry.ean,
            name: existing.name || entry.firebaseName || 'Desconocido',
            dmuCategory: entry.dmu || entry.category || 'General',
            reason: 'SKU Existente sin Vispera ID detectado por Auditor en terreno.',
            source: 'App de Levantamiento'
          });
          visperaTickets++;
        }
        
        entry.status = 'MATCHED';
        matched++;
      } else {
        // Ruta B: Unmatched (New EAN) -> Guardar en Catálogo + Vispera Tickets
        
        // 1. Guardar en Catálogo Maestro (como pending Vispera)
        const newProduct = {
          ean: entry.ean,
          name: entry.firebaseName || 'Producto Nuevo',
          brand: 'Por Definir',
          netWeight: 'Por Definir',
          universalCategory: entry.category || 'General',
          visperaId: null, // Asegurar que sea null para Vispera
          holdings: {
            [entry.holdingId]: {
              holdingInternalId: entry.ean,
              customerId: entry.ean,
              localProductName: entry.firebaseName || 'Producto Nuevo',
              name: entry.firebaseName || 'Producto Nuevo',
              localCategoryName: entry.category || 'General',
              category: entry.category || 'General',
              dmu: entry.dmu || '',
              isActiveHolding: true,
              stockStatus: true,
              updatedAt: new Date().toISOString()
            }
          }
        };
        
        // Guardar asíncronamente
        DB.saveProduct(newProduct, true);
        
        DB.addRecentMatch({
          ean: entry.ean,
          name: newProduct.name,
          category: newProduct.universalCategory,
          dmu: entry.dmu,
          auditor: entry.auditor,
          holdingId: entry.holdingId,
          type: 'NUEVO_SKU'
        });
        
        // 2. Enviar a Tickets Vispera (Nuevos SKUs)
        DB.addVisperaBatchItem({
          ean: entry.ean,
          name: newProduct.name,
          dmuCategory: entry.dmu || entry.category || 'General',
          reason: 'Nuevo SKU ingresado (Ruta B)',
          source: 'App de Levantamiento'
        });
        visperaTickets++;
        
        entry.status = 'CATALOGUED';
        unmatched++;
      }
    }

    // Save status changes without clearing staging
    try { localStorage.setItem('ss_staging_levantamiento', JSON.stringify(staging)); } catch (e) { localStorage.removeItem('ss_products_cache'); try { localStorage.setItem('ss_staging_levantamiento', JSON.stringify(staging)); } catch(e2) {} }

    if (matched > 0 || unmatched > 0) {
      App.showToast(`Auditoría Automática: ${matched} matches, ${unmatched} nuevos SKUs. ${visperaTickets} tickets a Vispera.`, 'success');
    } else if (silent) {
      App.showToast('Búsqueda finalizada. No hubo nuevos matches que procesar.', 'info');
    }
    render();
  }

  return {
    render,
    addEntry,
    removeEntry,
    clearForm,
    clearStaging,
    processStaging,
    syncFirebase,
    setFilters
  };
})();
