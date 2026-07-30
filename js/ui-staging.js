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

  function openProduct(ean) {
    const cleanEan = String(ean || '').trim();
    const product = DB.getProduct(cleanEan);
    if (!product) {
      console.error('Revisión no encontró el producto solicitado', { ean, cleanEan });
      App.showToast(`No se encontró el SKU ${cleanEan} en el catálogo cargado`, 'error');
      return;
    }
    UISheet.open(String(product.ean).trim());
  }

  function _getCategoryList(p) {
    const list = [];
    if (Array.isArray(p.universalCategory)) list.push(...p.universalCategory);
    else if (p.universalCategory) list.push(p.universalCategory);

    if (Array.isArray(p.category)) list.push(...p.category);
    else if (p.category) list.push(p.category);

    return list
      .map(c => String(c).trim())
      .filter(c => c && c !== 'General' && c !== 'Seleccionar...' && c !== 'Sin categoría' && c !== 'N/A' && c !== 'INDEFINIDO');
  }

  function _isNoUniversalCategory(p) {
    if (!p) return true;
    const cats = _getCategoryList(p);
    if (cats.length === 0) return true;
    return !cats.some(c => {
      if (DB.normalizeUniversalCategory && DB.normalizeUniversalCategory(c)) return true;
      const u = String(c).trim().toUpperCase();
      return (window.UNIVERSAL_CATEGORIES || []).includes(u) || (window.CATEGORY_ALIASES && window.CATEGORY_ALIASES[u]);
    });
  }

  function render() {
    const el = document.getElementById('view-revision');
    if (!el) return;

    // Tab 1: SKUs sin Vispera ID y no en tickets
    const visperaBatch = DB.getVisperaBatch() || [];
    const batchEans = new Set(visperaBatch.map(b => b.ean));
    let inReview = DB.getProductsArray().filter(p => !p.visperaId && p.status !== 'discontinued' && !batchEans.has(p.ean));

    // Tab 2: Tickets Vispera
    let inTickets = visperaBatch.filter(item => item.status !== 'AWAITING_VISPERA_ID');

    // Tab 1.5: SKUs cuyas categorías NO coinciden con las 18 categorías universales de Vispera
    let noCatProducts = DB.getProductsArray().filter(p => _isNoUniversalCategory(p));

    // Tab 3: SKUs que TIENEN al menos un holding pero a ese holding le falta customerId
    const orphans = DB.getProductsArray().filter(p => {
      const hData = p.holdings || p.retailers || {};
      const hKeys = Object.keys(hData);
      if (hKeys.length === 0) return false;
      return hKeys.some(k => {
        const h = hData[k];
        const hasData = h && (h.name || h.localProductName || h.dmu || h.category || h.relationStatus === 'pending');
        return hasData && !h.customerId && !h.holdingInternalId;
      });
    });

    // Tab 4: tickets ya exportados, a la espera del ID asignado por Vispera
    let inHistory = visperaBatch.filter(item => item.status === 'AWAITING_VISPERA_ID');

    // Obtener todos los auditores únicos
    const allAuditors = [...new Set(DB.getProductsArray().map(p => p.levantamientoMeta?.auditor).filter(Boolean))].sort();

    // Aplicar filtro de auditor global
    if (_auditorFilter !== 'all') {
      inReview = inReview.filter(p => p.levantamientoMeta?.auditor === _auditorFilter);
      noCatProducts = noCatProducts.filter(p => p.levantamientoMeta?.auditor === _auditorFilter);
      inTickets = inTickets.filter(b => {
        const p = DB.getProduct(b.ean) || {};
        return p.levantamientoMeta?.auditor === _auditorFilter;
      });
      inHistory = inHistory.filter(item => DB.getProduct(item.ean)?.levantamientoMeta?.auditor === _auditorFilter);
    }

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Revisión y Homologación</h1>
  </div>
</header>

<div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:1px solid var(--border); margin-bottom:24px;">
  <div class="staging-tabs" style="border-bottom:none; margin-bottom:0;">
    <button class="staging-tab ${_activeTab === 'review' ? 'active' : ''}" onclick="UIStaging.setTab('review')">
      Sin Vispera ID
      <span class="staging-tab-count">${inReview.length}</span>
    </button>
    <button class="staging-tab ${_activeTab === 'no-cat' ? 'active' : ''}" onclick="UIStaging.setTab('no-cat')">
      Sin Categoría Universal
      <span class="staging-tab-count">${noCatProducts.length}</span>
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
</div>

${_activeTab === 'no-cat' ? renderNoCategory(noCatProducts) : _activeTab === 'orphans' ? renderOrphans(orphans) : _activeTab === 'tickets' ? renderTickets(inTickets) : _activeTab === 'history' ? renderHistory(inHistory) : renderReview(inReview)}
`;
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
          <input type="text" inputmode="numeric" pattern="[0-9]*" id="noean-input-${esc(item.id)}" class="form-input" placeholder="Ingresar EAN numérico..." style="width:180px; padding:6px; font-family:monospace;">
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

    const allAuditors = [...new Set(DB.getProductsArray().map(p => p.levantamientoMeta?.auditor).filter(Boolean))].sort();

    let searchBar = `
      <div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
        <div class="staging-info-left" style="display:flex; align-items:center; gap:16px;">
          <span class="staging-info-label">SKUs sin Vispera ID: <strong>${filtered.length}</strong> ${items.length !== filtered.length ? `(de ${items.length})` : ''}</span>
          <button class="btn-primary btn-mini" onclick="UIStaging.cruzarDatos()" ${_enriching ? 'disabled' : ''} style="display:flex; align-items:center; gap:6px;">
            ${_enriching ? '<div class="spinning-loader" style="width:12px;height:12px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div> Cruzando...' : '🔍 Cruzar datos / Sugerir'}
          </button>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="display:flex; align-items:center; gap:6px; background:var(--accent-dim); padding:4px 10px; border-radius:6px; border:1px solid rgba(65,88,232,0.2);">
            <span style="font-size:12px; color:var(--accent); font-weight:600;">Filtrar Auditor:</span>
            <select class="form-input" style="padding:2px 6px; font-size:12px; width:auto; background:#fff; border:none;" onchange="UIStaging.setAuditorFilter(this.value)">
              <option value="all" ${_auditorFilter === 'all' ? 'selected' : ''}>Todos</option>
              ${allAuditors.map(a => `<option value="${esc(a)}" ${_auditorFilter === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}
            </select>
          </div>
          <input type="text" class="form-input" placeholder="Buscar EAN, Nombre..." value="${esc(_reviewSearch)}" oninput="UIStaging.handleSearchInput(this.value)" style="width: 220px;">
        </div>
      </div>
      <p class="highlight-text">
        <em>SKUs que aún no tienen un Vispera ID. Abre la ficha, revisa los datos obligatorios y confirma manualmente el envío a Tickets Vispera.</em>
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
        <th>Categoría / Subcategoría</th>
        <th>Holding</th>
        <th>Auditor</th>
        <th>Creado</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody>
      ${paginated.map(item => {
        const hasSuggestion = item.suggestedData ? `<span style="font-size:10px; background:var(--accent); color:#fff; padding:2px 4px; border-radius:4px; margin-left:6px;" title="Datos sugeridos por la API">💡 API</span>` : '';
        const duplicateBadge = item.duplicateConflicts?.length
          ? `<span style="font-size:10px; background:var(--warning); color:#111; padding:2px 4px; border-radius:4px; margin-left:6px;" title="${item.duplicateConflicts.length} campos requieren revisión">Duplicado consolidado</span>`
          : '';
        const holdingId = Object.keys(item.holdings || item.retailers || {})[0];
        const holding = DB.getHoldings().find(h => h.id === holdingId);
        const readiness = UISheet.getVisperaReadiness(item, holdingId);
        return `
      <tr>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <button type="button" class="link-button" onclick="UIStaging.openProduct('${esc(String(item.ean).trim())}')">${esc(item.name || 'Sin nombre')}</button>
          ${hasSuggestion}
          ${duplicateBadge}
        </td>
        <td>${(Array.isArray(item.universalCategory) ? item.universalCategory : [item.universalCategory || item.category || '—']).map(c => `<span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[c] : '#888'}">${esc(c)}</span>`).join(' ')}<br><span style="font-size:11px;color:var(--text-sec)">${esc(readiness.subCategory || '—')}</span></td>
        <td style="font-size:12px;">${esc(holding?.name || holdingId || '—')}</td>
        <td style="font-size:12px;">${esc(item.levantamientoMeta?.auditor || '—')}</td>
        <td style="font-size:12px; color:var(--text-sec)">${new Date(item.levantamientoMeta?.timestamp || item.createdAt || item.updatedAt || Date.now()).toLocaleDateString('es-CL')}</td>
        <td style="display:flex; gap:6px;">
          <button type="button" class="btn-mini" onclick="UIStaging.openProduct('${esc(String(item.ean).trim())}')">${readiness.ready ? 'Revisar y confirmar' : `Completar (${readiness.missing.length})`}</button>
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
  <p>No hay SKUs confirmados pendientes de exportación.</p>
</div>`;
    }

    return `
<div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
  <div class="staging-info-left">
    <span class="staging-info-label">Tickets Vispera: <strong>${items.length}</strong></span>
  </div>
  <button class="btn-primary" onclick="UIStaging.exportToExcel('tickets')">Exportar a Excel</button>
</div>
<p class="highlight-text">
  <em>Lista de espera para exportar a Excel y enviar al equipo de Vispera. Aquí <strong>nada es editable</strong>. Si notas un error, haz clic en "Volver a Revisión" para corregir los datos.</em>
</p>

<div class="preview-table-wrap" style="max-height:60vh;">
  <table class="preview-table">
    <thead>
      <tr>
        <th>EAN</th>
        <th>Nombre detectado</th>
        <th>Categoría</th>
        <th>Holding</th>
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
          ${esc(item.name || 'Sin nombre')}
        </td>
        <td>${esc(item.category || '—')}<br><span style="font-size:11px;color:var(--text-sec)">${esc(item.subCategory || '—')}</span></td>
        <td>${esc(DB.getHoldings().find(h => h.id === item.holdingId)?.name || item.holdingId || '—')}</td>
        <td style="font-size:12px;">
          ${esc(p.levantamientoMeta?.auditor || 'Desconocido')}<br>
          <span style="color:var(--text-sec)">${new Date(item.createdAt).toLocaleDateString('es-CL')}</span>
        </td>
        <td style="display:flex; gap:6px;">
          <button class="btn-mini" style="color:var(--danger)" onclick="UIStaging.rejectBatch('${esc(item.batchId)}')">Volver a Revisión</button>
        </td>
      </tr>`}).join('')}
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
<p class="highlight-text">
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
             const pending = hData[k].relationStatus === 'pending';
             return missing ? `<span style="color:var(--danger); font-weight:bold;" title="${pending ? 'Relación homologada pendiente de completar' : 'Falta Customer ID'}">⚠️ ${esc(k)}${pending ? ' (homologación pendiente)' : ''}</span>` : `<span style="color:var(--success)">✓ ${esc(k)}</span>`;
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
  <h3>No hay IDs pendientes</h3>
  <p>Los tickets exportados aparecerán aquí hasta que registres el ID entregado por Vispera.</p>
</div>`;
    }

    return `
<div class="staging-info-bar" style="display:flex; justify-content:space-between; align-items:center;">
  <div class="staging-info-left">
    <span class="staging-info-label">Nuevos ID Vispera: <strong>${items.length}</strong></span>
  </div>
</div>
<p class="highlight-text">
  <em>Estos SKUs ya fueron exportados. Ingresa el ID entregado por Vispera para cerrar el ticket y marcarlos como Nuevo lanzamiento.</em>
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
      ${items.map(item => { const p = DB.getProduct(item.ean) || {}; return `
      <tr>
        <td style="font-size:12px; color:var(--text-sec)">${new Date(p.levantamientoMeta?.timestamp || p.createdAt || item.createdAt || Date.now()).toLocaleString('es-CL')}</td>
        <td class="mono">${esc(item.ean)}</td>
        <td style="font-weight:500;">
          <a href="javascript:void(0)" onclick="UISheet.open('${esc(item.ean)}')">${esc(p.name || item.name || 'Sin nombre')}</a>
        </td>
        <td>
          <span class="vispera-cat-badge" style="--cat-color:${window.VISPERA_CATEGORY_COLORS ? window.VISPERA_CATEGORY_COLORS[p.universalCategory] : '#888'}">${esc(p.universalCategory || item.category || '—')}</span>
        </td>
        <td>
          <div style="display:flex; gap:6px; align-items:center;">
            <input type="text" id="vispera-edit-${esc(item.ean)}" value="" class="form-input" style="width:120px; padding:4px;" placeholder="ID Vispera">
            <button class="btn-outline btn-mini" onclick="UIStaging.actualizarVisperaId('${esc(item.ean)}')">Actualizar</button>
          </div>
        </td>
      </tr>`; }).join('')}
    </tbody>
  </table>
</div>`;
  }

  async function actualizarVisperaId(ean) {
    const input = document.getElementById(`vispera-edit-${ean}`);
    const vId = input ? input.value.trim() : '';
    if (!vId) {
      App.showToast('Vispera ID no puede estar vacío. Si deseas quitarlo, hazlo desde la ficha.', 'error');
      return;
    }
    const p = DB.getProduct(ean);
    if (p) {
      p.visperaId = vId;
      p.status = 'new';
      p.is_ready_for_vispera = true;
      p.visperaAssignedAt = new Date().toISOString();
      const persisted = await DB.saveProduct(p);
      if (!persisted) {
        App.showToast('El ID quedó guardado localmente, pero el servidor no lo confirmó. El ticket seguirá pendiente.', 'warning');
        render();
        return;
      }
      const ticket = DB.getVisperaBatch().find(item => item.ean === ean);
      if (ticket) DB.removeVisperaBatchItem(ticket.batchId);
      App.showToast('ID registrado. SKU marcado como Nuevo lanzamiento.', 'success');
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

  function identifyEan(id) {
    const input = document.getElementById(`noean-input-${id}`);
    const ean = input ? input.value.trim() : '';
    const validation = DB.validateEAN(ean);
    if (!validation.valid) {
      App.showToast(validation.reason, 'error');
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
      customerId: item.customerId || item.customer_id || '',
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
    } else if (type === 'tickets') {
      if (typeof XLSX === 'undefined') {
        App.showToast('Librería Excel no cargada', 'error');
        return;
      }
      const items = DB.getVisperaBatch().filter(item => item.status !== 'AWAITING_VISPERA_ID');
      if (items.length === 0) {
        App.showToast('No hay datos para exportar', 'warning');
        return;
      }
      const rows = [
        ['Fecha Levantamiento', 'Auditor', 'Pasillo', 'Customer ID', 'Producer / Manufacturer', 'Brand', 'Sub-Brand', 'SKU name', 'Category', 'Sub-Category', 'Barcode / EAN Code (must be unique)', 'Existe en Master Data?', 'Size', 'Size unit', 'Number of units inside (if multi-pack)', 'Width', 'Height', 'Depth', 'Public image link']
      ];
      const invalid = items.find(item => {
        const product = DB.getProduct(item.ean);
        const holdingId = item.holdingId || Object.keys(product?.holdings || product?.retailers || {})[0];
        return !product || !UISheet.getVisperaReadiness(product, holdingId).ready;
      });
      if (invalid) {
        App.showToast(`El SKU ${invalid.ean} ya no cumple los campos obligatorios. Devuélvelo a Revisión.`, 'error');
        return;
      }
      items.forEach(i => {
        const p = DB.getProduct(i.ean) || {};
        const holdings = p.holdings || p.retailers || {};
        let customerId = '';
        let localCat = '';
        const selectedHoldingId = i.holdingId || Object.keys(holdings)[0];
        if (selectedHoldingId && holdings[selectedHoldingId]) {
           const hd = holdings[selectedHoldingId];
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
          p.subBrand || '',
          i.name || p.name || '',
          p.universalCategory || i.category || '',
          localCat,
          DB.validateEAN(i.ean).normalized || i.ean,
          'No', // Aún no existe en la Master Data de Vispera
          p.weight_g || '',
          p.weight_unit || 'g',
          p.numberOfUnits || '',
          p.width_cm || '',
          p.height_cm || '',
          p.depth_cm || '',
          p.imageUrl || ''
        ]);
      });
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, "Tickets Vispera");
      XLSX.writeFile(wb, `Tickets_Vispera_${new Date().toISOString().slice(0,10)}.xlsx`);
      const exportedAt = new Date().toISOString();
      items.forEach(item => DB.updateVisperaBatchItem(item.batchId, { status: 'AWAITING_VISPERA_ID', exportedAt }));
      App.showToast(`${items.length} ticket${items.length === 1 ? '' : 's'} exportado${items.length === 1 ? '' : 's'}; ahora esperan ID Vispera.`, 'success');
      setTab('history');
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

  function renderNoCategory(items) {
    if (items.length === 0) {
      return `
<div class="empty-state" style="padding:40px; text-align:center;">
  <div class="empty-icon">✅</div>
  <h3>¡Todas las categorías están homologadas!</h3>
  <p style="color:var(--text-muted)">Todos los SKUs del catálogo tienen asignada una categoría universal Vispera válida.</p>
</div>`;
    }

    const start = (_reviewPage - 1) * _itemsPerPage;
    const paginated = items.slice(start, start + _itemsPerPage);
    const totalPages = Math.ceil(items.length / _itemsPerPage);

    return `
<div class="staging-info-bar" style="background:rgba(255,193,7,0.1); border:1px solid rgba(255,193,7,0.3); border-radius:10px; padding:16px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
  <div>
    <div style="font-weight:700; font-size:15px; color:var(--text); margin-bottom:4px;">
      ⚠️ ${items.length} SKU(s) requieren asignación de Categoría Universal Vispera
    </div>
    <div style="font-size:12px; color:var(--text-sec);">
      La categorización masiva o individual se realiza centralizadamente en el <strong>Modo Edición</strong> con vista previa y deshacer.
    </div>
  </div>
  <button class="btn-primary" style="padding:9px 18px; font-size:13px; font-weight:600; white-space:nowrap; gap:8px;" onclick="UIBulk.setErrorFilter('no-cat'); App.navigateTo('bulk');">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    Abrir en Modo Edición (${items.length} SKUs)
  </button>
</div>

<div class="preview-table-wrap" style="max-height:60vh; overflow-y:auto;">
  <table class="preview-table">
    <thead>
      <tr>
        <th width="40">Img</th>
        <th width="120">EAN</th>
        <th>Nombre del Producto</th>
        <th width="140">Marca</th>
        <th width="180">Categoría Actual (Inválida / Sin Asignar)</th>
        <th width="140">Acción</th>
      </tr>
    </thead>
    <tbody>
      ${paginated.map(p => {
        const catRaw = Array.isArray(p.category) ? p.category.join(', ') : (p.category || 'Sin categoría');
        return `
          <tr style="cursor:pointer" onclick="UISheet.open('${esc(p.ean)}')" title="Ver Ficha Técnica">
            <td>
              <div style="width:34px; height:34px; border-radius:6px; background-size:contain; background-repeat:no-repeat; background-position:center; background-image:url('${p.imageUrl || 'logo.png'}'); background-color:var(--surface-el); border:1px solid var(--border);"></div>
            </td>
            <td class="mono">${esc(p.ean)}</td>
            <td style="font-weight:500;">${esc(p.name || 'Sin Nombre')}</td>
            <td>${esc(p.brand || 'N/A')}</td>
            <td>
              <span class="vispera-cat-badge" style="background:rgba(255,193,7,0.15); color:var(--warning); border:1px solid var(--warning); padding:3px 8px; border-radius:6px; font-size:11px;">
                ⚠️ ${esc(catRaw)}
              </span>
            </td>
            <td style="display:flex; gap:6px; align-items:center;">
              <button class="btn-secondary-sm" style="font-size:11px; padding:4px 8px; background:var(--surface-modal); border:1px solid var(--border);" onclick="event.stopPropagation(); UISheet.open('${esc(p.ean)}')">
                📋 Ficha Técnica
              </button>
              <button class="btn-secondary-sm" style="font-size:11px; padding:4px 8px;" onclick="event.stopPropagation(); UIBulk.setErrorFilter('no-cat'); App.navigateTo('bulk');">
                ✏️ Categorizar en Bulk
              </button>
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</div>

${totalPages > 1 ? `
  <div class="pagination" style="margin-top:16px;">
    <span class="page-info">${items.length} SKUs &middot; Página ${_reviewPage} de ${totalPages}</span>
    <div class="page-controls">
      <button class="page-btn" ${_reviewPage === 1 ? 'disabled' : ''} onclick="UIStaging.setReviewPage(${_reviewPage - 1})">Anterior</button>
      <button class="page-btn" ${_reviewPage === totalPages ? 'disabled' : ''} onclick="UIStaging.setReviewPage(${_reviewPage + 1})">Siguiente</button>
    </div>
  </div>
` : ''}
`;
  }

  async function assignUniversalCategory(ean) {
    const sel = document.getElementById(`no-cat-sel-${ean}`);
    if (!sel || !sel.value) {
      App.showToast('Selecciona una categoría universal de la lista', 'warning');
      return;
    }
    const cat = sel.value;
    const prod = DB.getProduct(ean);
    if (prod) {
      prod.category = [cat];
      prod.universalCategory = [cat];
      await DB.saveProduct(prod);
      App.showToast(`Categoría ${cat} asignada al SKU ${ean}`, 'success');
      render();
    }
  }

  return {
    render,
    setTab,
    handleSearchInput,
    setReviewPage,
    setAuditorFilter,
    openProduct,
    exportToExcel,
    actualizarVisperaId,
    rejectBatch,
    clearBatch,
    enrichAll,
    cruzarDatos,
    clearMatches,
    identifyEan,
    removeNoEan,
    clearNoEan,
    renderNoCategory,
    assignUniversalCategory
  };
})();
