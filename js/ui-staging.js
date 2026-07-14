'use strict';

const UIStaging = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _enriching = false;
  let _activeTab = 'unmatched'; // 'unmatched' | 'batch'

  function render() {
    const el = document.getElementById('view-staging');
    if (!el) return;

    const unmatched = DB.getStagingUnmatched();
    const batch = DB.getVisperaBatch();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Matching &amp; Enrichment Pipeline</h1>
    <p class="view-sub">Revisión de EANs no identificados y envío de lotes a Vispera</p>
  </div>
  <div class="view-actions">
    <button class="btn-teal" onclick="UIStaging.enrichAll()" ${_enriching ? 'disabled' : ''}>
      ${_enriching
        ? '<span class="spin-ico">↻</span> Enriqueciendo…'
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg> Paso 3: Enriquecer con APIs`
      }
    </button>
    <button class="btn-primary" onclick="UIStaging.groupAndBatch()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Agrupar y Enviar a Batch
    </button>
  </div>
</header>

<!-- Pipeline Flow Banner -->
<div class="pipeline-flow-banner">
  <div class="pf-step active">
    <div class="pf-step-num">1</div>
    <div class="pf-step-info">
      <strong>Levantamiento</strong>
      <span>Escaneo de EANs en tienda</span>
    </div>
  </div>
  <div class="pf-arrow">→</div>
  <div class="pf-step ${unmatched.length > 0 ? 'active' : ''}">
    <div class="pf-step-num">2</div>
    <div class="pf-step-info">
      <strong>EANs sin Identificar</strong>
      <span>${unmatched.length} pendientes de revisión</span>
    </div>
  </div>
  <div class="pf-arrow">→</div>
  <div class="pf-step ${batch.length > 0 ? 'active' : ''}">
    <div class="pf-step-num">3</div>
    <div class="pf-step-info">
      <strong>Lote para Vispera</strong>
      <span>${batch.length} SKUs listos para enviar</span>
    </div>
  </div>
</div>

<div class="dashboard-row stagger-in" style="display:flex; gap:16px; margin-bottom: 24px; padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow);">
  <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
    <h3 style="font-size:12px; color:var(--text-sec); margin-bottom: 12px; text-transform:uppercase; letter-spacing:0.05em;">Tasa de Enriquecimiento (Global)</h3>
    <div style="position:relative; width:140px; height:140px;"><canvas id="chart-enrichment"></canvas></div>
  </div>
  <div style="flex:1; display:flex; flex-direction:column; align-items:center;">
    <h3 style="font-size:12px; color:var(--text-sec); margin-bottom: 12px; text-transform:uppercase; letter-spacing:0.05em;">Completitud (Global)</h3>
    <div style="position:relative; width:140px; height:140px;"><canvas id="chart-completeness"></canvas></div>
  </div>
</div>

<!-- Tabs -->
<div class="staging-tabs">
  <button class="staging-tab ${_activeTab === 'unmatched' ? 'active' : ''}" onclick="UIStaging.setTab('unmatched')">
    EANs sin Identificar
    <span class="staging-tab-count">${unmatched.length}</span>
  </button>
  <button class="staging-tab ${_activeTab === 'batch' ? 'active' : ''}" onclick="UIStaging.setTab('batch')">
    Lote para Vispera
    <span class="staging-tab-count">${batch.length}</span>
  </button>
</div>

${_activeTab === 'unmatched' ? renderUnmatched(unmatched) : renderBatch(batch)}
`;

    setTimeout(_drawCharts, 50);
  }

  let _chart1 = null;
  let _chart2 = null;

  function _drawCharts() {
    if (typeof Chart === 'undefined') return;
    
    const all = DB.getProductsArray();
    if (!all || all.length === 0) return;

    const enriched = all.filter(p => p.dataSource !== 'manual').length;
    const manual = all.length - enriched;

    const complete = all.filter(p => DB.computeCompleteness(p) >= 80).length;
    const partial = all.filter(p => DB.computeCompleteness(p) >= 50 && DB.computeCompleteness(p) < 80).length;
    const incomplete = all.filter(p => DB.computeCompleteness(p) < 50).length;

    const ctx1 = document.getElementById('chart-enrichment');
    const ctx2 = document.getElementById('chart-completeness');

    if (ctx1) {
      if (_chart1) _chart1.destroy();
      _chart1 = new Chart(ctx1, {
        type: 'doughnut',
        data: {
          labels: ['Por API', 'Manual'],
          datasets: [{ data: [enriched, manual], backgroundColor: ['#4F6EF7', '#D8DFF0'], borderWidth: 0 }]
        },
        options: { cutout: '75%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
      });
    }

    if (ctx2) {
      if (_chart2) _chart2.destroy();
      _chart2 = new Chart(ctx2, {
        type: 'doughnut',
        data: {
          labels: ['Alta (>80%)', 'Media', 'Baja (<50%)'],
          datasets: [{ data: [complete, partial, incomplete], backgroundColor: ['#1A7A34', '#D29922', '#C42B20'], borderWidth: 0 }]
        },
        options: { cutout: '75%', plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
      });
    }
  }

  function renderUnmatched(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Sin EANs pendientes</h3>
  <p>Todos los EANs del levantamiento han sido matcheados o procesados.</p>
  <button class="btn-outline" onclick="App.navigateTo('levantamiento')">Ir a Levantamiento</button>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">Total: <strong>${items.length}</strong> EAN(s) sin match</span>
    <span class="staging-info-label">Enriquecidos: <strong>${items.filter(i => i.apiRawName).length}</strong></span>
    <span class="staging-info-label" style="color:var(--success)">Alta confianza: <strong>${items.filter(i => getConfidence(i) === 'ALTA').length}</strong></span>
    <span class="staging-info-label" style="color:var(--warning)">Baja confianza: <strong>${items.filter(i => getConfidence(i) === 'BAJA').length}</strong></span>
  </div>
  <button class="btn-clear" onclick="UIStaging.clearUnmatched()">Limpiar todo</button>
</div>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Holding</th>
        <th>DMU/Categoría</th>
        <th>Nombre (API)</th>
        <th>Marca (API)</th>
        <th>Peso (API)</th>
        <th>Cat. Universal</th>
        <th>Confianza</th>
        <th>Status</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const conf = getConfidence(item);
        const confColor = conf === 'ALTA' ? 'var(--success)' : 'var(--warning)';
        const catColor = VISPERA_CATEGORY_COLORS[item.apiUniversalCategory] || '#888';
        return `
      <tr>
        <td class="mono" style="font-weight:600">${esc(item.ean)}</td>
        <td><span class="holding-badge-sm">${esc(item.holdingId)}</span></td>
        <td>${esc(item.dmuCategory || '—')}</td>
        <td>${item.apiRawName ? esc(item.apiRawName) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${item.apiBrand ? esc(item.apiBrand) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${item.apiWeight ? esc(item.apiWeight) : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td>${item.apiUniversalCategory
          ? `<span class="vispera-cat-badge" style="--cat-color:${catColor}">${esc(item.apiUniversalCategory)}</span>`
          : '<span style="color:var(--text-muted)">—</span>'}</td>
        <td><span class="confidence-badge" style="background:${confColor}20;color:${confColor};border-color:${confColor}40">${conf}</span></td>
        <td><span class="status-badge ${item.status === 'ENRICHED' ? 'new' : 'conflict'}" style="font-size:10px">${esc(item.status)}</span></td>
        <td style="display:flex; gap:4px;">
          <button class="btn-mini" onclick="UIStaging.approveAndInsert('${esc(item.id)}')" title="Aprobar e insertar en Master">✓</button>
          <button class="btn-mini" style="color:var(--danger)" onclick="UIStaging.removeUnmatched('${esc(item.id)}')" title="Rechazar">✕</button>
        </td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`;
  }

  function renderBatch(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">📦</div>
  <h3>Sin lotes pendientes</h3>
  <p>Agrupa EANs enriquecidos para generar lotes de envío a Vispera.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">Total lotes: <strong>${items.length}</strong></span>
    <span class="staging-info-label">Pendientes: <strong>${items.filter(i => i.status === 'PENDING_REVIEW').length}</strong></span>
    <span class="staging-info-label" style="color:var(--success)">Enviados: <strong>${items.filter(i => i.status === 'SENT_TO_VISPERA').length}</strong></span>
  </div>
  <button class="btn-clear" onclick="UIStaging.clearBatch()">Limpiar lotes</button>
</div>

<div class="batch-cards">
  ${items.map(item => {
    const eanCount = (item.eanList || []).length;
    const catColor = VISPERA_CATEGORY_COLORS[item.universalCategory] || '#888';
    const statusClass = item.status === 'SENT_TO_VISPERA' ? 'new' : item.status === 'REJECTED' ? 'conflict' : '';
    return `
  <div class="batch-card">
    <div class="batch-card-header">
      <div>
        <span class="mono" style="font-size:11px; color:var(--text-muted)">Batch: ${esc(item.batchId?.slice(0, 8))}…</span>
        <h4 style="margin:4px 0 0 0">${esc(item.suggestedVisperaName || 'Sin nombre')}</h4>
      </div>
      <span class="status-badge ${statusClass}">${esc(item.status)}</span>
    </div>
    <div class="batch-card-body">
      <div class="batch-meta">
        <span><strong>Marca:</strong> ${esc(item.brand || '—')}</span>
        <span><strong>Categoría:</strong> <span class="vispera-cat-badge" style="--cat-color:${catColor}">${esc(item.universalCategory || '—')}</span></span>
        <span><strong>EANs:</strong> ${eanCount} código(s)</span>
      </div>
      ${eanCount > 0 ? `
      <div class="batch-eans">
        ${(item.eanList || []).map(e => `<span class="mono batch-ean-chip">${esc(e)}</span>`).join('')}
      </div>` : ''}
    </div>
    <div class="batch-card-footer">
      <span style="font-size:10px; color:var(--text-muted)">${new Date(item.createdAt).toLocaleString('es-CL')}</span>
      ${item.status === 'PENDING_REVIEW' ? `
        <div style="display:flex; gap:6px;">
          <button class="btn-mini" style="background:rgba(74,201,155,0.1); color:#4ac99b; border-color:rgba(74,201,155,0.2);" onclick="UIStaging.sendToVispera('${esc(item.batchId)}')">Aprobar y Enviar</button>
          <button class="btn-mini" style="color:var(--danger); border-color:rgba(196,43,32,0.2);" onclick="UIStaging.rejectBatch('${esc(item.batchId)}')">Rechazar</button>
        </div>` : ''}
    </div>
  </div>`;
  }).join('')}
</div>`;
  }

  function getConfidence(item) {
    if (item.apiRawName && item.apiUniversalCategory) return 'ALTA';
    return 'BAJA';
  }

  function setTab(tab) {
    _activeTab = tab;
    render();
  }

  async function enrichAll() {
    const unmatched = DB.getStagingUnmatched().filter(i => i.status === 'PENDING_ENRICHMENT');
    if (unmatched.length === 0) {
      App.showToast('No hay EANs pendientes de enriquecimiento', 'info');
      return;
    }

    _enriching = true;
    render();
    App.showToast(`Step 3: Enriqueciendo ${unmatched.length} EANs con APIs externas…`, 'info');

    let enriched = 0;
    for (const item of unmatched) {
      const apiData = await API.enrichProduct(item.ean);
      if (apiData) {
        // Map to universal category
        const universalCat = _mapToVisperaCategory(apiData.masterCategory || apiData.name || '');

        DB.updateStagingUnmatched(item.id, {
          apiRawName: apiData.name || null,
          apiBrand: apiData.brand || null,
          apiWeight: apiData.weight_g ? `${apiData.weight_g}g` : null,
          apiUniversalCategory: universalCat,
          status: 'ENRICHED'
        });
        enriched++;
      } else {
        DB.updateStagingUnmatched(item.id, {
          status: 'ENRICHED',
          apiUniversalCategory: item.dmuCategory ? _mapToVisperaCategory(item.dmuCategory) : null
        });
      }
      await new Promise(r => setTimeout(r, 600));
    }

    _enriching = false;
    App.showToast(`${enriched} de ${unmatched.length} EANs enriquecidos`, 'success');
    render();
  }

  function _mapToVisperaCategory(text) {
    if (!text) return null;
    const t = String(text).toLowerCase();
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

    for (const [key, cat] of Object.entries(mapping)) {
      if (t.includes(key)) return cat;
    }
    return 'GROCERY STORE';
  }

  function groupAndBatch() {
    const unmatched = DB.getStagingUnmatched().filter(i => i.status === 'ENRICHED');
    if (unmatched.length === 0) {
      App.showToast('No hay EANs enriquecidos para agrupar. Ejecuta Step 3 primero.', 'warning');
      return;
    }

    // Step: Agrupación por marca + primeros 12 caracteres del nombre normalizado
    const groups = {};
    unmatched.forEach(item => {
      const brand = (item.apiBrand || 'UNKNOWN').toUpperCase().trim();
      const nameKey = (item.apiRawName || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
      const groupKey = `${brand}__${nameKey}`;

      if (!groups[groupKey]) {
        groups[groupKey] = {
          suggestedVisperaName: item.apiRawName || `${brand} PRODUCT`,
          brand: item.apiBrand || 'UNKNOWN',
          universalCategory: item.apiUniversalCategory || 'GROCERY STORE',
          eanList: []
        };
      }
      groups[groupKey].eanList.push(item.ean);
    });

    // Create batch items
    let created = 0;
    Object.values(groups).forEach(group => {
      DB.addVisperaBatchItem(group);
      created++;
    });

    // Remove processed items from unmatched
    unmatched.forEach(item => DB.removeStagingUnmatched(item.id));

    App.showToast(`${created} lotes creados con ${unmatched.length} EANs agrupados`, 'success');
    _activeTab = 'batch';
    render();
  }

  async function approveAndInsert(id) {
    const item = DB.getStagingUnmatched().find(i => i.id === id);
    if (!item) return;

    // Insert into Master SKU / Universal Products
    const product = {
      ean: item.ean,
      name: item.apiRawName || 'Nuevo SKU de Terreno',
      brand: item.apiBrand || 'N/A',
      universalCategory: item.apiUniversalCategory || 'GROCERY STORE',
      category: item.apiUniversalCategory || 'GROCERY STORE',
      weight_g: item.apiWeight ? parseFloat(item.apiWeight) : null,
      imageUrl: null,
      status: 'new',
      dataSource: 'levantamiento',
      holdings: {}
    };

    // Associate with holding if known
    if (item.holdingId) {
      product.holdings[item.holdingId] = {
        holdingInternalId: item.ean,
        customerId: item.ean,
        localProductName: product.name,
        name: product.name,
        localCategoryName: item.dmuCategory || product.universalCategory,
        category: item.dmuCategory || product.universalCategory,
        isActiveHolding: true,
        stockStatus: true,
        updatedAt: new Date().toISOString()
      };
    }

    await DB.saveProduct(product);
    DB.removeStagingUnmatched(id);
    App.showToast(`EAN ${item.ean} insertado en Universal Products`, 'success');
    render();
  }

  function removeUnmatched(id) {
    DB.removeStagingUnmatched(id);
    App.showToast('EAN removido del staging', 'info');
    render();
  }

  function clearUnmatched() {
    if (!confirm('¿Limpiar todos los EANs no matcheados?')) return;
    DB.clearStagingUnmatched();
    App.showToast('Staging limpiado', 'info');
    render();
  }

  function clearBatch() {
    if (!confirm('¿Limpiar todos los lotes de Vispera?')) return;
    DB.clearVisperaBatch();
    App.showToast('Lotes limpiados', 'info');
    render();
  }

  function sendToVispera(batchId) {
    DB.updateVisperaBatchItem(batchId, { status: 'SENT_TO_VISPERA' });
    App.showToast('Lote aprobado y marcado como enviado a Vispera', 'success');
    render();
  }

  function rejectBatch(batchId) {
    DB.updateVisperaBatchItem(batchId, { status: 'REJECTED' });
    App.showToast('Lote rechazado', 'info');
    render();
  }

  return {
    render,
    setTab,
    enrichAll,
    groupAndBatch,
    approveAndInsert,
    removeUnmatched,
    clearUnmatched,
    clearBatch,
    sendToVispera,
    rejectBatch
  };
})();
