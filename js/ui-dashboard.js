'use strict';

const UIDashboard = (() => {
  let _catChart = null;
  let _holdingChart = null;
  let _statusChart = null;
  let _selectedHoldings = new Set(); // Empty means all

  function toggleHolding(hid) {
    if (_selectedHoldings.has(hid)) {
      _selectedHoldings.delete(hid);
    } else {
      _selectedHoldings.add(hid);
    }
    render();
  }

  function toggleAllHoldings() {
    _selectedHoldings.clear();
    render();
  }

  function exportReportExcel() {
    const allProducts = DB.getProductsArray();
    const holdings = DB.getHoldings();
    
    if (typeof XLSX === 'undefined') {
      if (App) App.showToast('Librería Excel no disponible', 'error');
      return;
    }

    const totalSKUs = allProducts.length;

    // 1. Holdings breakdown & No Holding
    const holdingCounts = holdings.map(h => {
      const hProds = allProducts.filter(p => (p.holdings || p.retailers || {})[h.id]);
      const withCustId = hProds.filter(p => {
        const hData = (p.holdings || p.retailers || {})[h.id];
        return hData && (hData.customerId || hData.holdingInternalId);
      }).length;
      return {
        name: h.name,
        total: hProds.length,
        active: hProds.filter(p => p.status !== 'discontinued').length,
        withCustId
      };
    });

    const noHoldingCount = allProducts.filter(p => {
      const hKeys = Object.keys(p.holdings || p.retailers || {});
      return hKeys.length === 0;
    }).length;

    // 2. Status breakdown
    const statusCounts = {
      active: allProducts.filter(p => p.status === 'active' || !p.status).length,
      new: allProducts.filter(p => p.status === 'new').length,
      review: allProducts.filter(p => p.status === 'review').length,
      discontinued: allProducts.filter(p => p.status === 'discontinued').length
    };

    // 3. Data origin breakdown
    const originCounts = {
      levantamiento: allProducts.filter(p => p.dataSource === 'levantamiento' || p.fromLevantamiento).length,
      apiEnriched: allProducts.filter(p => (p.dataSource && p.dataSource !== 'manual' && p.dataSource !== 'levantamiento') || (p.enrichmentSources && Object.keys(p.enrichmentSources).length > 0)).length,
      manual: allProducts.filter(p => (!p.dataSource || p.dataSource === 'manual') && (!p.enrichmentSources || Object.keys(p.enrichmentSources).length === 0) && !p.fromLevantamiento).length
    };

    // 4. Vispera breakdown
    const visperaCounts = {
      withId: allProducts.filter(p => p.visperaId).length,
      inTicket: allProducts.filter(p => p.is_ready_for_vispera && !p.visperaId).length,
      pending: allProducts.filter(p => !p.visperaId && !p.is_ready_for_vispera).length
    };

    // --- Sheet 1: Resumen Ejecutivo Master ---
    const summaryRows = [
      ['REPORTE EJECUTIVO MASTER DATA - FOLLOWUP'],
      ['Fecha de Generación', new Date().toLocaleString()],
      ['Total SKUs Registrados en Catálogo', totalSKUs],
      [''],
      ['1. DISTRIBUCIÓN POR HOLDING / CANAL'],
      ['Holding / Canal', 'Total SKUs', 'SKUs Activos', 'Con Customer ID Registrado'],
      ...holdingCounts.map(h => [h.name, h.total, h.active, h.withCustId]),
      ['SIN HOLDING (Huérfanos / No asignados)', noHoldingCount, noHoldingCount, 'N/A'],
      [''],
      ['2. ESTADO OPERATIVO DE SKUs'],
      ['Estado', 'Cantidad SKUs', 'Porcentaje del Catálogo'],
      ['Activos', statusCounts.active, `${Math.round(statusCounts.active / totalSKUs * 100 || 0)}%`],
      ['Nuevos Lanzamientos', statusCounts.new, `${Math.round(statusCounts.new / totalSKUs * 100 || 0)}%`],
      ['En Revisión', statusCounts.review, `${Math.round(statusCounts.review / totalSKUs * 100 || 0)}%`],
      ['Discontinuados', statusCounts.discontinued, `${Math.round(statusCounts.discontinued / totalSKUs * 100 || 0)}%`],
      [''],
      ['3. ORIGEN Y FUENTE DE INFORMACIÓN'],
      ['Origen de Datos', 'Cantidad SKUs', 'Descripción'],
      ['Levantamientos en Terreno', originCounts.levantamiento, 'Obtenidos desde capturas y levantamiento físico'],
      ['Enriquecidos por APIs Externas', originCounts.apiEnriched, 'Completados via Open Food Facts / SoloTodo'],
      ['Carga Manual / Directa', originCounts.manual, 'Ingresados por formulario o planilla simple'],
      [''],
      ['4. INTEGRACIÓN VISPERA'],
      ['Estado Vispera', 'Cantidad SKUs'],
      ['Con ID Vispera Asignado', visperaCounts.withId],
      ['En Ticket Pendiente a Vispera', visperaCounts.inTicket],
      ['Sin Vispera ID (Pendiente)', visperaCounts.pending]
    ];

    // --- Sheet 2: Detalle Completo de SKUs ---
    const detailHeaders = [
      'EAN', 'Nombre del Producto', 'Marca', 'Categoría Universal',
      'Holdings Asignados', 'Estado Operativo', 'Origen de Datos',
      'Vispera ID', 'Customer IDs por Holding', 'Completitud (%)'
    ];

    const detailRows = allProducts.map(p => {
      const hData = p.holdings || p.retailers || {};
      const holdingsList = Object.keys(hData);
      const holdingsStr = holdingsList.length > 0 ? holdingsList.join('; ') : 'SIN HOLDING';
      
      const custIdsStr = holdingsList.map(hId => {
        const item = hData[hId];
        return `${hId}: ${item?.customerId || item?.holdingInternalId || 'Sin ID'}`;
      }).join('; ');

      const statusMap = { active: 'Activo', new: 'Nuevo Lanzamiento', review: 'En Revisión', discontinued: 'Discontinued' };
      const statusStr = statusMap[p.status] || 'Activo';

      let originStr = 'Carga Manual';
      if (p.dataSource === 'levantamiento' || p.fromLevantamiento) originStr = 'Levantamiento (Terreno)';
      else if ((p.dataSource && p.dataSource !== 'manual') || (p.enrichmentSources && Object.keys(p.enrichmentSources).length > 0)) originStr = 'Enriquecido por API';

      return [
        p.ean,
        p.name || '',
        p.brand || '',
        Array.isArray(p.category) ? p.category.join('; ') : (p.category || 'General'),
        holdingsStr,
        statusStr,
        originStr,
        p.visperaId ? `ID: ${p.visperaId}` : (p.is_ready_for_vispera ? 'En Ticket' : 'Sin ID'),
        custIdsStr || 'Ninguno',
        `${DB.computeCompleteness(p)}%`
      ];
    });

    const wb = XLSX.utils.book_new();
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);

    wsSummary['!cols'] = [{ wch: 35 }, { wch: 20 }, { wch: 20 }, { wch: 25 }];
    wsDetail['!cols'] = [
      { wch: 15 }, { wch: 35 }, { wch: 18 }, { wch: 22 },
      { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 18 },
      { wch: 30 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Ejecutivo");
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle SKUs");

    XLSX.writeFile(wb, `Reporte_MasterData_FollowUp_${new Date().toISOString().slice(0,10)}.xlsx`);
    if (App) App.showToast('✓ Reporte Excel operativo exportado exitosamente', 'success');
  }

  function render() {
    const el = document.getElementById('view-dashboard');
    if (!el) return;

    const allProducts = DB.getProductsArray();
    const holdings = DB.getHoldings();
    const allTotal = allProducts.length;

    if (allTotal === 0) {
      el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Dashboard</h1>
    <p class="view-sub">Resumen general del estado del catálogo (FollowUp Master Data)</p>
  </div>
</header>
<div class="empty-state" style="padding:60px; text-align:center;">
  <div style="font-size:48px; margin-bottom:16px">📊</div>
  <h3>Sin datos aún</h3>
  <p style="color:var(--text-muted); margin-bottom:24px;">Importa productos para ver el dashboard.</p>
  <button class="btn-primary" onclick="App.navigateTo('import')">Importar datos</button>
</div>`;
      return;
    }

    // Filter products by selected holdings
    let products = allProducts;
    if (_selectedHoldings.size > 0) {
      products = allProducts.filter(p => {
        const pHoldings = p.holdings || p.retailers || {};
        return Array.from(_selectedHoldings).some(hid => pHoldings[hid]);
      });
    }

    const total = products.length;
    const enriched = products.filter(p => p.dataSource && p.dataSource !== 'manual').length;
    const withImage = products.filter(p => p.imageUrl).length;
    const noBrand = products.filter(p => !p.brand || p.brand === 'N/A').length;
    const noWeight = products.filter(p => !p.weight_g).length;
    const noCat = products.filter(p => (!p.universalCategory || p.universalCategory.length === 0) && (!p.category || p.category.length === 0)).length;
    const noImage = products.filter(p => !p.imageUrl).length;
    
    const noCustomerId = products.filter(p => {
      const hData = p.holdings || p.retailers || {};
      const hKeys = Object.keys(hData);
      if (hKeys.length === 0) return false;
      return hKeys.some(k => {
        const h = hData[k];
        const hasData = h && (h.name || h.localProductName || h.dmu || h.category);
        return hasData && !h.customerId && !h.holdingInternalId;
      });
    }).length;
    
    const avgCompleteness = total > 0 ? Math.round(products.reduce((s, p) => s + DB.computeCompleteness(p), 0) / total) : 0;
    const enrichRate = total > 0 ? Math.round(enriched / total * 100) : 0;
    const imgRate = total > 0 ? Math.round(withImage / total * 100) : 0;

    const catCount = {};
    products.forEach(p => {
      const catArray = Array.isArray(p.universalCategory) ? p.universalCategory : (p.universalCategory ? [p.universalCategory] : (Array.isArray(p.category) ? p.category : (p.category ? [p.category] : ['Sin categoría'])));
      catArray.forEach(c => {
        catCount[c] = (catCount[c] || 0) + 1;
      });
    });
    const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const holdingStats = holdings.map(h => {
      const hProds = products.filter(p => (p.holdings || p.retailers || {})[h.id]);
      const hAvg = hProds.length
        ? Math.round(hProds.reduce((s, p) => s + DB.computeCompleteness(p), 0) / hProds.length)
        : 0;
      return { ...h, count: hProds.length, avg: hAvg };
    }).filter(h => h.count > 0);
    holdingStats.sort((a, b) => b.count - a.count);

    const statusCounts = { withVispera: 0, withoutVispera: 0 };
    products.forEach(p => {
      if (p.status === 'discontinued') return;
      if (p.visperaId || p.is_ready_for_vispera) statusCounts.withVispera++;
      else statusCounts.withoutVispera++;
    });

    const noEanCount = DB.getStagingNoEan().length;
    const visperaCount = DB.getVisperaBatch().length;

    const alerts = [];
    if (noEanCount > 0) alerts.push({ icon: '🔍', label: `${noEanCount} producto(s) SIN EAN por identificar`, action: 'App.navigateTo("revision")' });
    if (visperaCount > 0) alerts.push({ icon: '🎫', label: `${visperaCount} ticket(s) pendientes a Vispera`, action: 'App.navigateTo("revision")' });
    if (statusCounts.withoutVispera > 0) alerts.push({ icon: '⚠️', label: `${statusCounts.withoutVispera} SKU(s) sin Vispera ID`, action: 'App.navigateTo("revision")' });
    if (noBrand > 0) alerts.push({ icon: '🏷️', label: `${noBrand} SKU${noBrand > 1 ? 's' : ''} sin marca`, action: "UIBulk.setErrorFilter('no-brand'); App.navigateTo('bulk');" });
    if (noImage > 0) alerts.push({ icon: '🖼️', label: `${noImage} SKU${noImage > 1 ? 's' : ''} sin imagen`, action: "UIBulk.setErrorFilter('no-img'); App.navigateTo('bulk');" });
    if (noCat > 0)   alerts.push({ icon: '🗂️', label: `${noCat} SKU${noCat > 1 ? 's' : ''} sin categoría Vispera validada`, action: "UIStaging.setTab('no-cat'); App.navigateTo('revision');" });
    if (noWeight > 0) alerts.push({ icon: '⚖️', label: `${noWeight} SKU${noWeight > 1 ? 's' : ''} sin peso registrado`, action: "UIBulk.setErrorFilter('incomplete'); App.navigateTo('bulk');" });

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Dashboard</h1>
    <p class="view-sub">Resumen general del catálogo &middot; FollowUp Master Data</p>
  </div>
  <div class="view-actions">
    <button class="btn-outline" onclick="UIDashboard.exportReportExcel()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar Reporte Excel
    </button>
  </div>
</header>

<div class="dash-holding-filters" style="margin-bottom:16px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
  <span style="font-size:12px; font-weight:600; color:var(--text-muted); margin-right:8px;">Filtrar Dashboard por Holdings:</span>
  <button class="btn-mini ${_selectedHoldings.size === 0 ? 'active' : ''}" onclick="UIDashboard.toggleAllHoldings()" style="${_selectedHoldings.size === 0 ? 'background:var(--accent); color:#fff; border-color:var(--accent);' : 'border-color:var(--border); color:var(--text);'}">Todos</button>
  ${holdings.map(h => {
    const isSelected = _selectedHoldings.has(h.id);
    return `<button class="btn-mini ${isSelected ? 'active' : ''}" onclick="UIDashboard.toggleHolding('${h.id}')" style="border-color:${h.color}; color:${isSelected ? '#fff' : h.color}; background:${isSelected ? h.color : 'transparent'};">${h.name}</button>`;
  }).join('')}
</div>

<div class="dash-kpi-grid">
  <div class="dash-kpi-card" style="cursor:pointer" onclick="App.navigateTo('catalog')" title="Ver todo el catálogo">
    <div class="dash-kpi-icon" style="background:rgba(79,110,247,0.12);color:#4F6EF7">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${total.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">SKUs en Catálogo</span>
    </div>
  </div>
  <div class="dash-kpi-card" style="cursor:pointer" onclick="UIBulk.setErrorFilter('incomplete'); App.navigateTo('bulk');" title="Filtrar SKUs incompletos en Modo Edición">
    <div class="dash-kpi-icon" style="background:rgba(74,201,155,0.12);color:#4ac99b">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${avgCompleteness}%</span>
      <span class="dash-kpi-label">Completitud Promedio</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${avgCompleteness}%;background:#4ac99b"></div></div>
    </div>
  </div>
  <div class="dash-kpi-card" style="cursor:pointer" onclick="App.navigateTo('revision');" title="Ir a Tickets / Vispera ID">
    <div class="dash-kpi-icon" style="background:rgba(255,193,7,0.12);color:#FFC107">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${statusCounts.withoutVispera.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">Falta Vispera ID</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${total ? Math.round(statusCounts.withoutVispera/total*100) : 0}%;background:#FFC107"></div></div>
    </div>
  </div>
  <div class="dash-kpi-card" style="cursor:pointer" onclick="App.navigateTo('holdings');" title="Gestionar Customer ID por Holding">
    <div class="dash-kpi-icon" style="background:rgba(229,57,53,0.1);color:var(--danger)">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${noCustomerId.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">Falta Customer ID</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${total ? Math.round(noCustomerId/total*100) : 0}%;background:var(--danger)"></div></div>
    </div>
  </div>
  <div class="dash-kpi-card" style="cursor:pointer" onclick="UIBulk.setErrorFilter('no-img'); App.navigateTo('bulk');" title="Filtrar SKUs sin imagen en Modo Edición">
    <div class="dash-kpi-icon" style="background:rgba(156,39,176,0.1);color:#9C27B0">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${noImage.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">Falta Imagen</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${total ? Math.round(noImage/total*100) : 0}%;background:#9C27B0"></div></div>
    </div>
  </div>
</div>

<div class="dash-main-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));">

  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      SKUs por Holding
    </h3>
    <div style="position:relative;height:200px;display:flex;justify-content:center;">
      <canvas id="dash-holding-chart" style="max-width:200px;"></canvas>
    </div>
    <div class="dash-cat-legend">
      ${holdingStats.map(h => `
        <div class="dash-cat-item">
          <span class="dash-cat-dot" style="background:${h.color}"></span>
          <span class="dash-cat-name">${h.name}</span>
          <span class="dash-cat-count">${h.count}</span>
        </div>`).join('')}
    </div>
  </div>

  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
      Distribución por Categoría
    </h3>
    <div style="position:relative;height:200px;display:flex;justify-content:center;">
      <canvas id="dash-cat-chart" style="max-width:200px;"></canvas>
    </div>
    <div class="dash-cat-legend">
      ${topCats.map(([cat, count]) => {
      const color = (window.VISPERA_CATEGORY_COLORS || {})[cat] || '#888';
      return `<div class="dash-cat-item">
          <span class="dash-cat-dot" style="background:${color}"></span>
          <span class="dash-cat-name">${cat}</span>
          <span class="dash-cat-count">${count}</span>
        </div>`;
    }).join('')}
    </div>
  </div>
  
  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      Asignación Vispera ID
    </h3>
    <div style="position:relative;height:200px;display:flex;justify-content:center;">
      <canvas id="dash-status-chart" style="max-width:200px;"></canvas>
    </div>
    <div class="dash-cat-legend">
      <div class="dash-cat-item">
        <span class="dash-cat-dot" style="background:#4ac99b"></span>
        <span class="dash-cat-name">Con ID o Ticket</span>
        <span class="dash-cat-count">${statusCounts.withVispera}</span>
      </div>
      <div class="dash-cat-item">
        <span class="dash-cat-dot" style="background:#FFC107"></span>
        <span class="dash-cat-name">Sin Vispera ID</span>
        <span class="dash-cat-count">${statusCounts.withoutVispera}</span>
      </div>
    </div>
  </div>

  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Completitud por Holding
    </h3>
    ${holdingStats.length === 0
        ? '<p style="color:var(--text-muted);font-size:13px;padding:20px 0">Sin holdings con productos.</p>'
        : holdingStats.map(h => `
      <div class="dash-holding-row" style="cursor:pointer" onclick="App.filterByHolding('${h.id}')" title="Filtrar catálogo por ${h.name}">
        <div class="dash-holding-name">
          <span style="width:10px;height:10px;border-radius:50%;background:${h.color};display:inline-block;flex-shrink:0;"></span>
          <span>${h.name}</span>
          <span class="dash-holding-count">${h.count} SKUs</span>
        </div>
        <div class="dash-holding-bar-wrap">
          <div class="dash-kpi-bar-track" style="flex:1;">
            <div class="dash-kpi-bar-fill" style="width:${h.avg}%;background:${h.color};"></div>
          </div>
          <span class="dash-holding-pct" style="color:${h.color}">${h.avg}%</span>
        </div>
      </div>`).join('')}
  </div>

  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Alertas de Calidad de Datos
    </h3>
    ${alerts.length === 0
      ? '<div style="padding:24px 0;text-align:center;color:var(--text-muted);"><div style="font-size:36px;margin-bottom:8px">✅</div><p>¡Catálogo en buen estado!</p></div>'
      : alerts.map(a => `
      <div class="dash-alert-item" onclick="${a.action || "App.navigateTo('bulk')"}" title="Ver detalles e interceder">
        <span class="dash-alert-icon">${a.icon}</span>
        <span class="dash-alert-label">${a.label}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('')}
  </div>
</div>
`;

    if (_catChart) { _catChart.destroy(); _catChart = null; }
    if (_holdingChart) { _holdingChart.destroy(); _holdingChart = null; }
    if (_statusChart) { _statusChart.destroy(); _statusChart = null; }

    const catCtx = document.getElementById('dash-cat-chart');
    if (catCtx && typeof Chart !== 'undefined' && topCats.length > 0) {
      _catChart = new Chart(catCtx, {
        type: 'doughnut',
        data: {
          labels: topCats.map(([c]) => c),
          datasets: [{
            data: topCats.map(([, n]) => n),
            backgroundColor: topCats.map(([c]) => (window.VISPERA_CATEGORY_COLORS || {})[c] || '#888'),
            borderWidth: 2,
            borderColor: 'transparent'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} SKUs` } } }
        }
      });
    }

    const holdCtx = document.getElementById('dash-holding-chart');
    if (holdCtx && typeof Chart !== 'undefined' && holdingStats.length > 0) {
      _holdingChart = new Chart(holdCtx, {
        type: 'doughnut',
        data: {
          labels: holdingStats.map(h => h.name),
          datasets: [{
            data: holdingStats.map(h => h.count),
            backgroundColor: holdingStats.map(h => h.color),
            borderWidth: 2,
            borderColor: 'transparent'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} SKUs` } } }
        }
      });
    }

    const statCtx = document.getElementById('dash-status-chart');
    if (statCtx && typeof Chart !== 'undefined' && (statusCounts.withVispera > 0 || statusCounts.withoutVispera > 0)) {
      _statusChart = new Chart(statCtx, {
        type: 'doughnut',
        data: {
          labels: ['Con ID o Ticket', 'Sin Vispera ID'],
          datasets: [{
            data: [statusCounts.withVispera, statusCounts.withoutVispera],
            backgroundColor: ['#4ac99b', '#FFC107'],
            borderWidth: 2,
            borderColor: 'transparent'
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} SKUs` } } }
        }
      });
    }

  }

  return { render, toggleHolding, toggleAllHoldings, exportReportExcel };
})();
