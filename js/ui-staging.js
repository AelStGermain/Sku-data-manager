'use strict';

const UIStaging = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _enriching = false;
  let _activeTab = 'review'; // 'review' | 'tickets' | 'orphans' | 'history'
  let _reviewPage = 1;
  let _reviewSearch = '';
  let _auditorFilter = 'all';
  let _searchTimeout = null;
  const _itemsPerPage = 50;

  function handleSearchInput(val) {
    if (_searchTimeout) clearTimeout(_searchTimeout);
    _searchTimeout = setTimeout(() => {
      _reviewSearch = (val || '').toLowerCase();
      _reviewPage = 1;
      render();
    }, 400);
  }

  function setReviewPage(p) {
    _reviewPage = p;
    render();
  }

  function setAuditorFilter(val) {
    _auditorFilter = val;
    _reviewPage = 1;
    render();
  }

  function render() {
    const el = document.getElementById('view-auditoria');
    if (!el) return;

    const matches = DB.getRecentMatches ? DB.getRecentMatches() : [];
    const noEan = DB.getStagingNoEan();

    // Tab 1: SKUs sin Vispera ID y no en tickets
    const visperaBatch = DB.getVisperaBatch() || [];
    const batchEans = new Set(visperaBatch.map(b => b.ean));
    let inReview = DB.getProductsArray().filter(p => !p.visperaId && p.status !== 'discontinued' && !batchEans.has(p.ean));

    // Tab 2: Tickets Vispera
    let inTickets = visperaBatch;

    // Tab 3: SKUs que TIENEN al menos un holding pero a ese holding le falta customerId
    // (Productos sin ningún holding no van aquí — eso es otro problema)
    const orphans = DB.getProductsArray().filter(p => {
      const hData = p.holdings || p.retailers || {};
      const hKeys = Object.keys(hData);
      if (hKeys.length === 0) return false; // Sin holdings → no aplica
      // Solo si ALGÚN holding tiene datos pero le falta customerId
      return hKeys.some(k => {
        const h = hData[k];
        const hasData = h && (h.name || h.localProductName || h.dmu || h.category);
        return hasData && !h.customerId && !h.holdingInternalId;
      });
    });


    // Tab 4: Nuevos ID Vispera (Historial) - Solo los procesados recientemente en la UI
    let inHistory = DB.getProductsArray().filter(p => p.is_ready_for_vispera === true && p.visperaId);

    // Obtener todos los auditores únicos
    const allAuditors = [...new Set(DB.getProductsArray().map(p => p.levantamientoMeta?.auditor).filter(Boolean))].sort();

    // Aplicar filtro de auditor global
    if (_auditorFilter !== 'all') {
      inReview = inReview.filter(p => p.levantamientoMeta?.auditor === _auditorFilter);
      inTickets = inTickets.filter(b => {
        const p = DB.getProduct(b.ean) || {};
        return p.levantamientoMeta?.auditor === _auditorFilter;
      });
      inHistory = inHistory.filter(p => p.levantamientoMeta?.auditor === _auditorFilter);
      // Opcional: no filtrar orphans, o sí. Asumamos que sí.
      // orphans = orphans.filter(p => p.levantamientoMeta?.auditor === _auditorFilter);
    }

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Revisión</h1>
  </div>
</header>

<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); margin-bottom:24px;">
  <div class="staging-tabs" style="border-bottom:none; margin-bottom:0;">
    <button class="staging-tab ${_activeTab === 'review' ? 'active' : ''}" onclick="UIStaging.setTab('review')">
      Sin Vispera ID
      <span class="staging-tab-count">${inReview.length}</span>
    </button>
    <button class="staging-tab ${_activeTab === 'tickets' ? 'active' : ''}" onclick="UIStaging.setTab('tickets')">
      Tickets Vispera
      <span class="staging-tab-count">${inTickets.length}</span>
    </button>
    <button class="staging-tab ${_activeTab === 'history' ? 'active' : ''}" onclick="UIStaging.setTab('history')">
      Nuevos ID Vispera
      <span class="staging-tab-count">${inHistory.length}</span>
    </button>
    <button class="staging-tab ${_activeTab === 'orphans' ? 'active' : ''}" onclick="UIStaging.setTab('orphans')">
      Falta Customer ID
      <span class="staging-tab-count">${orphans.length}</span>
    </button>
  </div>
  
  <div style="padding-bottom:12px; display:flex; align-items:center; gap:8px;">
    <span style="font-size:13px; color:var(--text-sec); font-weight:500;">Auditor:</span>
    <select class="form-input" style="padding:4px 8px; font-size:13px; width:auto; background:#fff;" onchange="UIStaging.setAuditorFilter(this.value)">
      <option value="all" ${_auditorFilter === 'all' ? 'selected' : ''}>Todos los Auditores</option>
      ${allAuditors.map(a => `<option value="${esc(a)}" ${_auditorFilter === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
    </select>
  </div>
</div>
</div>

${_activeTab === 'orphans' ? renderOrphans(orphans) : _activeTab === 'tickets' ? renderTickets(inTickets) : _activeTab === 'history' ? renderHistory(inHistory) : renderReview(inReview)}
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
    let filtered = items;
    if (_reviewSearch) {
      filtered = filtered.filter(i => {
        const d = i.createdAt || i.levantamientoMeta?.timestamp || i.updatedAt || Date.now();
        const dateStr = new Date(d).toLocaleDateString('es-CL');
        return (i.ean || '').toLowerCase().includes(_reviewSearch) ||
        (i.name || '').toLowerCase().includes(_reviewSearch) ||
        (i.levantamientoMeta?.auditor || '').toLowerCase().includes(_reviewSearch) ||
        dateStr.includes(_reviewSearch);
      });
    }

    // Ordenar por fecha de levantamiento descendente (los más recientes primero)
    filtered.sort((a, b) => {
      const dateA = new Date(a.levantamientoMeta?.timestamp || a.createdAt || a.updatedAt || 0).getTime();
      const dateB = new Date(b.levantamientoMeta?.timestamp || b.createdAt || b.updatedAt || 0).getTime();
      return dateB - dateA;
    });
    
    const totalPages = Math.ceil(filtered.length / _itemsPerPage) || 1;
    if (_reviewPage > totalPages) _reviewPage = totalPages;
    if (_reviewPage < 1) _reviewPage = 1;
    
    const start = (_reviewPage - 1) * _itemsPerPage;
    const paginated = filtered.slice(start, start + _itemsPerPage);

    let searchBar = `
      <div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="staging-info-left" style="display:flex; align-items:center; gap:16px;">
          <span class="staging-info-label">SKUs sin Vispera ID: <strong>${filtered.length}</strong> ${items.length !== filtered.length ? `(de ${items.length})` : ''}</span>
          <button class="btn-primary btn-mini" onclick="UIStaging.cruzarDatos()" ${_enriching ? 'disabled' : ''} style="display:flex; align-items:center; gap:6px;">
            ${_enriching ? '<div class="spinning-loader" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div> Cruzando...' : '🔍 Cruzar datos / Sugerir'}
          </button>
        </div>
        <div>
          <input type="text" class="form-input" placeholder="Buscar EAN, Nombre, Auditor, Fecha..." value="${esc(_reviewSearch)}" oninput="UIStaging.handleSearchInput(this.value)" style="width: 300px;">
        </div>
      </div>
      <p style="font-size: 13px; color: var(--text-sec); margin-top: -8px; margin-bottom: 16px;">
        <em>SKUs nuevos detectados en terreno que aún no tienen un Vispera ID. Asegúrate de que sus datos estén correctos antes de enviarlos a Tickets Vispera.</em>
      </p>
    `;

    if (filtered.length === 0 && items.length === 0) {
      return searchBar + `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Todos los SKUs tienen Vispera ID</h3>
  <p>No hay SKUs pendientes de asignar su Vispera ID.</p>
</div>`;
    } else if (filtered.length === 0) {
      return searchBar + `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">🔍</div>
  <h3>Sin resultados</h3>
  <p>No hay SKUs que coincidan con la búsqueda.</p>
</div>`;
    }

    let paginationControls = '';
    if (totalPages > 1) {
      paginationControls = `
        <div style="display:flex; justify-content:center; gap:8px; margin-top:12px; align-items:center;">
          <button class="btn-outline btn-mini" ${_reviewPage === 1 ? 'disabled' : ''} onclick="UIStaging.setReviewPage(${_reviewPage - 1})">← Ant</button>
          <span style="font-size:12px; color:var(--text-sec)">Página ${_reviewPage} de ${totalPages}</span>
          <button class="btn-outline btn-mini" ${_reviewPage === totalPages ? 'disabled' : ''} onclick="UIStaging.setReviewPage(${_reviewPage + 1})">Sig →</button>
        </div>
      `;
    }

    return searchBar + `
<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre detectado</th>
        <th>Categoría</th>
        <th>Auditor</th>
        <th>Creado</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${paginated.map(item => {
        const hasSuggestion = item.suggestedData ? `<span style="font-size:10px; background:var(--accent); color:#fff; padding:2px 4px; border-radius:4px; margin-left:6px;" title="Datos sugeridos por la API">💡 API</span>` : '';
        return `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(item.name || 'Sin nombre')}</a>
          ${hasSuggestion}
        </td>
        <td>${(Array.isArray(item.category) ? item.category : [item.category || '—']).map(c => `<span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[c] : '#888'}">${esc(c)}</span>`).join(' ')}</td>
        <td style="font-size:12px;">${esc(item.levantamientoMeta?.auditor || '—')}</td>
        <td style="font-size:12px; color:var(--text-sec)">${new Date(item.levantamientoMeta?.timestamp || item.createdAt || item.updatedAt || Date.now()).toLocaleDateString('es-CL')}</td>
        <td style="display:flex; gap:6px;">
          <button class="btn-primary btn-mini" style="background:#FF9800; color:white;" onclick="UIStaging.enviarATicket('${esc(item.ean)}')">Enviar a Ticket ➡️</button>
        </td>
      </tr>`}).join('')}
    </tbody>
  </table>
</div>
${paginationControls}`;
  }

  function renderTickets(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>No hay tickets pendientes</h3>
  <p>Todos los SKUs han sido identificados con Vispera ID.</p>
</div>`;
    }

    return `
<div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
  <div class="staging-info-left">
    <span class="staging-info-label">Tickets Vispera: <strong>${items.length}</strong></span>
  </div>
  <button class="btn-primary" onclick="UIStaging.exportToExcel('tickets')">Exportar a Excel</button>
</div>
<p style="font-size: 13px; color: var(--text-sec); margin-top: -8px; margin-bottom: 16px;">
  <em>Lista de espera para exportar a Excel y enviar al equipo de Vispera. Marca como "Listo" los SKUs que tengan toda su información completa antes de exportar.</em>
</p>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre detectado</th>
        <th>Categoría</th>
        <th>Auditor / Fecha</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => {
        const p = DB.getProduct(item.ean) || {};
        return `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(item.name || 'Sin nombre')}</a>
        </td>
        <td>${esc(item.dmuCategory || item.category || '—')}</td>
        <td style="font-size:12px;">
          ${esc(p.levantamientoMeta?.auditor || 'Desconocido')}<br>
          <span style="color:var(--text-sec)">${new Date(item.createdAt).toLocaleDateString('es-CL')}</span>
        </td>
        <td style="display:flex; gap:6px;">
          ${(()=>{
            const isComplete = p.name && p.brand && p.universalCategory && p.imageUrl;
            if (!isComplete) {
              return `<button class="btn-outline btn-mini" title="Faltan datos (Nombre, Marca, Categoría o Imagen)" onclick="App.showToast('Debes completar Nombre, Marca, Categoría e Imagen antes de marcar como listo.', 'error')" style="opacity:0.5;">Listo</button>`;
            }
            if (item.isListo) {
              return `<button class="btn-primary btn-mini" style="background:#4CAF50" onclick="UIStaging.toggleListo('${esc(item.batchId)}')">Listo ✓</button>`;
            } else {
              return `<button class="btn-outline btn-mini" onclick="UIStaging.toggleListo('${esc(item.batchId)}')">Marcar Listo</button>`;
            }
          })()}
          <button class="btn-mini" style="color:var(--danger)" onclick="UIStaging.rejectBatch('${esc(item.batchId)}')">Volver a Revisión</button>
        </td>
      </tr>`}).join('')}
    </tbody>
  </table>
</div>`;
  }

  function enviarATicket(ean) {
    const p = DB.getProduct(ean);
    if (p) {
      DB.addVisperaBatchItem({
        ean: p.ean,
        name: p.name,
        category: p.universalCategory,
        dmuCategory: p.universalCategory,
        reason: 'NEW_SKU_NO_VISPERA_ID',
        createdAt: new Date().toISOString()
      });
      App.showToast('Producto enviado a Tickets Vispera', 'success');
      render();
    }
  }

  function toggleListo(batchId) {
    const batch = DB.getVisperaBatch();
    const item = batch.find(i => i.batchId === batchId);
    if (item) {
      item.isListo = !item.isListo;
      DB.saveVisperaBatch(batch);
      render();
    }
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
<p style="font-size: 13px; color: var(--text-sec); margin-top: -8px; margin-bottom: 16px;">
  <em>SKUs que carecen del código interno del holding (Customer ID). Este código es crucial para que Vispera envíe reportes correctos a la cadena.</em>
</p>

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

  function renderHistory(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px;">
  <div class="empty-icon">✅</div>
  <h3>Historial Vacío</h3>
  <p>Todavía no hay SKUs levantados que tengan Vispera ID asignado.</p>
</div>`;
    }

    return `
<div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
  <div class="staging-info-left">
    <span class="staging-info-label">Nuevos ID Vispera: <strong>${items.length}</strong></span>
  </div>
  <button class="btn-primary" onclick="UIStaging.exportToExcel('history')">Exportar a Excel</button>
</div>
<p style="font-size: 13px; color: var(--text-sec); margin-top: -8px; margin-bottom: 16px;">
  <em>Historial de SKUs que ya fueron exportados. Aquí puedes ingresar su nuevo Vispera ID una vez que el equipo de Vispera te lo asigne.</em>
</p>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>Fecha Levantamiento</th>
        <th>EAN</th>
        <th>Nombre Master</th>
        <th>Categoría Vispera</th>
        <th>Vispera ID Asignado</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td style="font-size:12px; color:var(--text-sec)">${new Date(item.levantamientoMeta?.timestamp || item.createdAt || item.updatedAt || Date.now()).toLocaleString('es-CL')}</td>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(item.name || 'Sin nombre')}</a>
        </td>
        <td>
          <span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[item.universalCategory] : '#888'}">${esc(item.universalCategory || '—')}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="text" id="vispera-edit-${esc(item.ean)}" value="${esc(item.visperaId)}" class="form-input" style="width:120px; padding:4px;">
            <button class="btn-outline btn-mini" onclick="UIStaging.actualizarVisperaId('${esc(item.ean)}')">Actualizar</button>
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
</div>`;
  }

  function actualizarVisperaId(ean) {
    const input = document.getElementById(`vispera-edit-${ean}`);
    const vId = input ? input.value.trim() : '';
    if (!vId) {
      App.showToast('Vispera ID no puede estar vacío. Si deseas quitarlo, hazlo desde la ficha.', 'error');
      return;
    }
    const p = DB.getProduct(ean);
    if (p) {
      p.visperaId = vId;
      DB.saveProduct(p);
      App.showToast('Vispera ID actualizado correctamente', 'success');
      render();
    }
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

  async function cruzarDatos() {
    const inReview = DB.getProductsArray().filter(p => !p.visperaId && p.status !== 'discontinued');
    if (inReview.length === 0) {
      App.showToast('No hay SKUs en Revisión para cruzar datos', 'info');
      return;
    }

    _enriching = true;
    render();
    App.showToast(`Cruzando datos para ${inReview.length} SKUs... Esto puede tomar un momento.`, 'info');

    let enriched = 0;
    const chunkSize = 5; // Lotes más pequeños para no saturar la API
    
    for (let i = 0; i < inReview.length; i += chunkSize) {
      const chunk = inReview.slice(i, i + chunkSize);
      
      await Promise.all(chunk.map(async (item) => {
        const apiData = await API.enrichProduct(item.ean);
        if (apiData && apiData.name) {
          item.suggestedData = {
            name: apiData.name,
            brand: apiData.brand,
            category: apiData.masterCategory || apiData.category,
            imageUrl: apiData.imageUrl
          };
          DB.saveProduct(item);
          enriched++;
        }
      }));
      
      await new Promise(r => setTimeout(r, 1000)); // Pausa entre lotes para respetar rate limits
    }
    
    _enriching = false;
    App.showToast(`Cruce terminado. ${enriched} SKUs tienen sugerencias de la API.`, 'success');
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
    if (confirm('¿Deshacer este cambio y devolver el SKU a la cola de Revisión?')) {
      DB.removeVisperaBatchItem(batchId);
      App.showToast('SKU devuelto a Revisión', 'info');
      render();
    }
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
    } else if (type === 'tickets' || type === 'history') {
      if (typeof XLSX === 'undefined') {
        App.showToast('Librería Excel no cargada', 'error');
        return;
      }
      const items = type === 'tickets' ? DB.getVisperaBatch() : DB.getProductsArray().filter(p => p.visperaId && (p.dataSource === 'levantamiento' || p.fromLevantamiento === true));
      if (items.length === 0) {
        App.showToast('No hay datos para exportar', 'warning');
        return;
      }
      const rows = [
        ['Fecha Levantamiento', 'Auditor', 'Pasillo', 'Customer ID', 'Producer / Manufacturer', 'Brand', 'Sub-Brand', 'SKU name', 'Category', 'Sub-Category', 'Barcode / EAN Code (must be unique)', 'Existe en Master Data?', 'Size', 'Size unit', 'Number of units inside (if multi-pack)', 'Width', 'Height', 'Depth', 'Public image link']
      ];
      items.forEach(i => {
        if (type === 'tickets' && i.isListo) {
          const pp = DB.getProduct(i.ean);
          if (pp) {
            pp.is_ready_for_vispera = true;
            pp.status = 'active';
            DB.saveProduct(pp);
          }
          DB.removeVisperaBatchItem(i.batchId);
        }
        const p = DB.getProduct(i.ean) || {};
        const holdings = p.holdings || p.retailers || {};
        let customerId = '';
        let localCat = '';
        const hKeys = Object.keys(holdings);
        if (hKeys.length > 0) {
           const hd = holdings[hKeys[0]];
           customerId = hd.holdingInternalId || hd.customerId || '';
           localCat = Array.isArray(hd.localCategoryName) ? hd.localCategoryName.join(', ') : (Array.isArray(hd.category) ? hd.category.join(', ') : (hd.localCategoryName || hd.category || ''));
        }
        rows.push([
          new Date(p.levantamientoMeta?.timestamp || p.createdAt || p.updatedAt || Date.now()).toLocaleString('es-CL'),
          p.levantamientoMeta?.auditor || '',
          p.levantamientoMeta?.pasillo || p.levantamientoMeta?.aisle || '',
          customerId,
          p.producer || '',
          p.brand || '',
          '', // Sub-Brand
          i.name || p.name || '',
          p.universalCategory || i.category || '',
          localCat,
          i.ean,
          type === 'history' ? 'Sí (Asignado)' : 'No', // Existe en Master Data?
          p.weight_g || '',
          p.weight_unit || 'g',
          '', '', '', '', // Number of units, Width, Height, Depth
          p.imageUrl || ''
        ]);
      });
      if (type === 'tickets') setTimeout(render, 500);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, type === 'history' ? "Historial Vispera" : "Tickets Vispera");
      XLSX.writeFile(wb, `${type === 'history' ? 'Historial' : 'Tickets'}_Vispera_${new Date().toISOString().slice(0,10)}.xlsx`);
      return;
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
    handleSearchInput,
    setReviewPage,
    setAuditorFilter,
    exportToExcel,
    actualizarVisperaId,
    toggleListo,
    rejectBatch,
    clearBatch,
    enrichAll,
    cruzarDatos,
    clearMatches,
    identifyEan,
    removeNoEan,
    clearNoEan,
    sendToVispera,
    markAsReady,
    enviarATicket
  };
})();
