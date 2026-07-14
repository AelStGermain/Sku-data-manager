'use strict';

const UIStaging = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _enriching = false;
  let _activeTab = 'no_ean'; // 'no_ean' | 'batch'

  function render() {
    const el = document.getElementById('view-auditoria');
    if (!el) return;

    const noEan = DB.getStagingNoEan();
    const batch = DB.getVisperaBatch();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Bandejas de Colaboración</h1>
    <p class="view-sub">Asigna EANs a productos de terreno y gestiona Tickets para Vispera.</p>
  </div>
  <div class="view-actions">
    <button class="btn-outline" onclick="UIStaging.clearBatch()">Limpiar Lotes Completados</button>
  </div>
</header>

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
  <button class="staging-tab ${_activeTab === 'no_ean' ? 'active' : ''}" onclick="UIStaging.setTab('no_ean')">
    Por Identificar (Sin EAN)
    <span class="staging-tab-count">${noEan.length}</span>
  </button>
  <button class="staging-tab ${_activeTab === 'batch' ? 'active' : ''}" onclick="UIStaging.setTab('batch')">
    Tickets a Vispera
    <span class="staging-tab-count">${batch.length}</span>
  </button>
</div>

${_activeTab === 'no_ean' ? renderNoEan(noEan) : renderBatch(batch)}
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

  function renderNoEan(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Bandeja Limpia</h3>
  <p>No hay productos pendientes de identificar.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">Total: <strong>${items.length}</strong> productos sin EAN</span>
  </div>
  <button class="btn-clear" onclick="UIStaging.clearNoEan()">Limpiar todo</button>
</div>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>Holding / DMU</th>
        <th>Nombre Reportado</th>
        <th>Auditor / Fecha</th>
        <th>Identificar EAN</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td>
          <span class="holding-badge-sm">${esc(item.holdingId || '—')}</span><br>
          <span style="font-size:12px; color:var(--text-sec)">DMU: ${esc(item.dmu)}</span>
        </td>
        <td style="font-weight:500;">${esc(item.firebaseName || item.source)}</td>
        <td style="font-size:12px;">
          ${esc(item.auditor)}<br>
          <span style="color:var(--text-muted)">${new Date(item.timestamp).toLocaleString('es-CL')}</span>
        </td>
        <td>
          <input type="text" id="noean-input-${esc(item.id)}" class="form-input" placeholder="Ingresar EAN (13 dígitos)..." style="width:180px; padding:6px; font-family:monospace;">
        </td>
        <td style="display:flex; gap:6px;">
          <button class="btn-primary btn-mini" onclick="UIStaging.identifyEan('${esc(item.id)}')">Asignar EAN</button>
          <button class="btn-mini" style="color:var(--danger)" onclick="UIStaging.removeNoEan('${esc(item.id)}')">✕</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
  }

  function renderBatch(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">📦</div>
  <h3>Sin tickets pendientes</h3>
  <p>Los tickets a Vispera se generan automáticamente al procesar EANs desconocidos en Levantamiento.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">Total Tickets: <strong>${items.length}</strong></span>
    <span class="staging-info-label">Pendientes: <strong>${items.filter(i => i.status === 'PENDING_REVIEW').length}</strong></span>
    <span class="staging-info-label" style="color:var(--success)">Enviados: <strong>${items.filter(i => i.status === 'SENT_TO_VISPERA').length}</strong></span>
  </div>
  <button class="btn-clear" onclick="UIStaging.clearBatch()">Limpiar lista completa</button>
</div>

<div class="batch-cards">
  ${items.map(item => {
    const catColor = VISPERA_CATEGORY_COLORS[item.dmuCategory] || '#888';
    const statusClass = item.status === 'SENT_TO_VISPERA' ? 'new' : item.status === 'REJECTED' ? 'conflict' : '';
    return `
  <div class="batch-card">
    <div class="batch-card-header">
      <div>
        <span class="mono" style="font-size:11px; color:var(--text-muted)">Ticket: ${esc(item.batchId?.slice(0, 8))}…</span>
        <h4 style="margin:4px 0 0 0">${esc(item.name || 'Sin nombre')}</h4>
      </div>
      <span class="status-badge ${statusClass}">${esc(item.status)}</span>
    </div>
    <div class="batch-card-body">
      <div class="batch-meta">
        <span><strong>EAN:</strong> <span class="mono" style="background:#eee; padding:2px 4px; border-radius:2px;">${esc(item.ean)}</span></span>
        <span><strong>Categoría:</strong> <span class="vispera-cat-badge" style="--cat-color:${catColor}">${esc(item.dmuCategory || '—')}</span></span>
        <span><strong>Motivo:</strong> ${esc(item.reason)}</span>
      </div>
    </div>
    <div class="batch-card-footer">
      <span style="font-size:10px; color:var(--text-muted)">${new Date(item.createdAt).toLocaleString('es-CL')}</span>
      ${item.status === 'PENDING_REVIEW' ? `
        <div style="display:flex; gap:6px;">
          <button class="btn-mini" style="background:rgba(74,201,155,0.1); color:#4ac99b; border-color:rgba(74,201,155,0.2);" onclick="UIStaging.sendToVispera('${esc(item.batchId)}')">Marcar como Enviado a Vispera</button>
          <button class="btn-mini" style="color:var(--danger); border-color:rgba(196,43,32,0.2);" onclick="UIStaging.rejectBatch('${esc(item.batchId)}')">Cancelar</button>
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
    let batch = [];
    const chunkSize = 10;
    
    for (let i = 0; i < unmatched.length; i += chunkSize) {
      const chunk = unmatched.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (item) => {
        const apiData = await API.enrichProduct(item.ean);
        if (apiData) {
          const universalCat = _mapToVisperaCategory(apiData.masterCategory || apiData.name || '');
          batch.push({
            id: item.id,
            updates: {
              apiRawName: apiData.name || null,
              apiBrand: apiData.brand || null,
              apiWeight: apiData.weight_g ? `${apiData.weight_g}g` : null,
              apiUniversalCategory: universalCat,
              status: 'ENRICHED'
            }
          });
          enriched++;
        } else {
          batch.push({
            id: item.id,
            updates: {
              status: 'ENRICHED',
              apiUniversalCategory: item.dmuCategory ? _mapToVisperaCategory(item.dmuCategory) : null
            }
          });
        }
      }));
      
      if (batch.length >= 20) {
        DB.updateStagingUnmatchedBatch([...batch]);
        batch = [];
        render(); // optional to show progress
      }
      
      await new Promise(r => setTimeout(r, 1000));
    }
    
    if (batch.length > 0) {
      DB.updateStagingUnmatchedBatch(batch);
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

  function setTab(tab) {
    _activeTab = tab;
    render();
  }

  function identifyEan(id) {
    const input = document.getElementById(`noean-input-${id}`);
    const ean = input ? input.value.trim() : '';
    if (!ean || ean.length < 6) {
      App.showToast('Ingresa un EAN válido de al menos 6 dígitos', 'error');
      return;
    }

    const item = DB.getStagingNoEan().find(i => i.id === id);
    if (!item) return;

    // Send it to Levantamiento Pipeline
    DB.addStagingLevantamiento({
      ean: ean,
      holdingId: item.holdingId,
      dmu: item.dmu,
      category: item.category,
      auditor: item.auditor,
      firebaseName: item.firebaseName || item.source,
      status: 'PENDING'
    });

    DB.removeStagingNoEan(id);
    App.showToast(`EAN ${ean} asignado. Producto enviado al Pipeline de Levantamiento.`, 'success');
    render();
  }

  function removeNoEan(id) {
    DB.removeStagingNoEan(id);
    App.showToast('Registro eliminado', 'info');
    render();
  }

  function clearNoEan() {
    if (!confirm('¿Eliminar todos los registros por identificar?')) return;
    DB.clearStagingNoEan();
    App.showToast('Bandeja limpiada', 'info');
    render();
  }

  function clearBatch() {
    if (!confirm('¿Limpiar todos los tickets de Vispera?')) return;
    DB.clearVisperaBatch();
    App.showToast('Tickets limpiados', 'info');
    render();
  }

  function sendToVispera(batchId) {
    DB.updateVisperaBatchItem(batchId, { status: 'SENT_TO_VISPERA' });
    App.showToast('Ticket marcado como enviado a Vispera', 'success');
    render();
  }

  function rejectBatch(batchId) {
    DB.updateVisperaBatchItem(batchId, { status: 'REJECTED' });
    App.showToast('Ticket cancelado', 'info');
    render();
  }

  return {
    render,
    setTab,
    identifyEan,
    removeNoEan,
    clearNoEan,
    clearBatch,
    sendToVispera,
    rejectBatch
  };
})();
