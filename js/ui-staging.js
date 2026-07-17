'use strict';

const UIStaging = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _enriching = false;
  let _activeTab = 'batch'; // 'batch' | 'orphans'

  function render() {
    const el = document.getElementById('view-auditoria');
    if (!el) return;

    const matches = DB.getRecentMatches ? DB.getRecentMatches() : [];
    const noEan = DB.getStagingNoEan();
    const inReview = DB.getProductsArray().filter(p => p.status === 'review');
    const orphans = DB.getProductsArray().filter(p => {
      const hData = p.holdings || p.retailers || {};
      const hKeys = Object.keys(hData);
      if (hKeys.length === 0) return true; // No holdings
      // If ANY holding lacks customerId
      return hKeys.some(k => !hData[k].customerId && !hData[k].holdingInternalId);
    });

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Revisión</h1>
  </div>
</header>

<!-- Tabs -->
<div class="staging-tabs">
  <button class="staging-tab ${_activeTab === 'batch' ? 'active' : ''}" onclick="UIStaging.setTab('batch')">
    SKUs en Revisión
    <span class="staging-tab-count">${inReview.length}</span>
  </button>
  <button class="staging-tab ${_activeTab === 'orphans' ? 'active' : ''}" onclick="UIStaging.setTab('orphans')">
    Falta Customer ID
    <span class="staging-tab-count">${orphans.length}</span>
  </button>
</div>

${_activeTab === 'orphans' ? renderOrphans(orphans) : renderReview(inReview)}
`;
  }

  function renderMatches(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✨</div>
  <h3>No hay matches recientes</h3>
  <p>Los productos que crucen exitosamente al descargar datos de Firebase aparecerán aquí.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">Total: <strong>${items.length}</strong> matches recientes</span>
  </div>
  <button class="btn-primary" onclick="UIStaging.exportToExcel('matches')">Exportar a Excel</button>
  <button class="btn-clear" onclick="UIStaging.clearMatches()">Limpiar historial</button>
</div>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre Master</th>
        <th>Categoría Vispera</th>
        <th>Holding / DMU</th>
        <th>Tipo de Match</th>
        <th>Fecha / Auditor</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">${esc(item.name)}</td>
        <td>${(Array.isArray(item.category) ? item.category : [item.category || '—']).map(c => `<span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[c] : '#888'}">${esc(c)}</span>`).join(' ')}</td>
        <td>
          <span class="holding-badge-sm">${esc(item.holdingId)}</span><br>
          <span style="font-size:12px; color:var(--text-sec)">DMU: ${esc(Array.isArray(item.dmu) ? item.dmu.join(', ') : (item.dmu || '—'))}</span>
        </td>
        <td><span class="status-badge ${item.type === 'NUEVO_SKU' ? 'new' : 'active'}">${esc(item.type)}</span></td>
        <td style="font-size:12px;">
          ${new Date(item.matchDate).toLocaleString('es-CL')}<br>
          <span style="color:var(--text-muted)">${esc(item.auditor)}</span>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
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
  <button class="btn-primary" onclick="UIStaging.exportToExcel('no_ean')">Exportar a Excel</button>
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
          <span style="font-size:12px; color:var(--text-sec)">DMU: ${esc(Array.isArray(item.dmu) ? item.dmu.join(', ') : (item.dmu || '—'))}</span>
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

  function renderReview(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Sin SKUs en revisión</h3>
  <p>Todos los SKUs están listos o tienen su Vispera ID asociado.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">SKUs en revisión: <strong>${items.length}</strong></span>
  </div>
</div>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre Master</th>
        <th>Categoría</th>
        <th>Creado</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(item.name || 'Sin nombre')}</a>
        </td>
        <td>${(Array.isArray(item.category) ? item.category : [item.category || '—']).map(c => `<span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[c] : '#888'}">${esc(c)}</span>`).join(' ')}</td>
        <td style="font-size:12px; color:var(--text-sec)">${new Date(item.createdAt).toLocaleDateString('es-CL')}</td>
        <td style="display:flex; gap:6px;">
          <button class="btn-primary btn-mini" style="background:#4CAF50" onclick="UIStaging.markAsReady('${esc(item.ean)}')">Marcar como Listo ✓</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
  }

  function renderOrphans(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Todos los Customer IDs configurados</h3>
  <p>Todos los SKUs tienen al menos un Holding con su Customer ID asignado.</p>
</div>`;
    }

    return `
<div class="staging-info-bar">
  <div class="staging-info-left">
    <span class="staging-info-label">SKUs sin Customer ID: <strong>${items.length}</strong></span>
  </div>
</div>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre Master</th>
        <th>Marca</th>
        <th>Holdings</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const hData = item.holdings || item.retailers || {};
        const hKeys = Object.keys(hData);
        let holdingsStr = '<span style="color:var(--danger)">Ninguno</span>';
        if (hKeys.length > 0) {
          holdingsStr = hKeys.map(k => {
             const missing = !hData[k].customerId && !hData[k].holdingInternalId;
             return missing ? `<span style="color:var(--danger); font-weight:bold;" title="Falta Customer ID">⚠️ ${esc(k)}</span>` : `<span style="color:var(--success)">✓ ${esc(k)}</span>`;
          }).join(', ');
        }
        return `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(item.name || 'Sin nombre')}</a>
        </td>
        <td>${esc(item.brand || '—')}</td>
        <td style="font-size:12px;">${holdingsStr}</td>
        <td>
          <button class="btn-primary btn-mini" onclick="UISheet.open('${esc(item.ean)}')">Asignar ID</button>
        </td>
      </tr>`;
      }).join('')}
    </tbody>
  </table>
</div>`;
  }

  function markAsReady(ean) {
    const p = DB.getProduct(ean);
    if (p) {
      p.is_ready_for_vispera = true;
      p.status = 'active'; // force out of review
      DB.saveProduct(p);
      App.showToast('Producto marcado como Listo', 'success');
      render();
    }
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

  function clearMatches() {
    if (!confirm('¿Seguro que deseas limpiar el historial de matches? Esto no afectará a los productos de la Master Data.')) return;
    DB.clearRecentMatches();
    render();
  }

  function exportToExcel(type) {
    let data = [];
    let filename = '';
    
    if (type === 'matches') {
      const items = DB.getRecentMatches();
      data = items.map(i => ({
        EAN: i.ean,
        Nombre: i.name,
        Categoria: i.category,
        Holding: i.holdingId,
        DMU: i.dmu,
        Auditor: i.auditor,
        Fecha: new Date(i.matchDate).toLocaleString('es-CL'),
        Tipo: i.type
      }));
      filename = 'auditoria_matches.csv';
    } else if (type === 'no_ean') {
      const items = DB.getStagingNoEan();
      data = items.map(i => ({
        Holding: i.holdingId,
        DMU: i.dmu,
        Categoria: i.category,
        Auditor: i.auditor,
        Fecha: new Date(i.timestamp).toLocaleString('es-CL'),
        NombreApp: i.firebaseName
      }));
      filename = 'auditoria_sin_ean.csv';
    } else if (type === 'batch') {
      const items = DB.getVisperaBatch();
      data = items.map(i => ({
        EAN: i.ean,
        Nombre: i.name,
        Categoria: i.dmuCategory,
        Motivo: i.reason,
        Status: i.status,
        Fecha: new Date(i.createdAt).toLocaleString('es-CL')
      }));
      filename = 'auditoria_tickets_vispera.csv';
    }

    if (data.length === 0) {
      App.showToast('No hay datos para exportar', 'warning');
      return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return {
    render,
    setTab,
    identifyEan,
    removeNoEan,
    clearNoEan,
    sendToVispera,
    rejectBatch,
    clearBatch,
    enrichAll,
    clearMatches,
    exportToExcel,
    markAsReady
  };
})();
