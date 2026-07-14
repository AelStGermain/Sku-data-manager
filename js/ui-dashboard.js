'use strict';

const UIDashboard = (() => {
  let _catChart = null;

  function render() {
    const el = document.getElementById('view-dashboard');
    if (!el) return;

    const products = DB.getProductsArray();
    const holdings = DB.getHoldings();
    const total = products.length;

    if (total === 0) {
      el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Dashboard</h1>
    <p class="view-sub">Resumen general del estado del catálogo</p>
  </div>
</header>
<div class="empty-state" style="padding:60px; text-align:center;">
  <div style="font-size:48px; margin-bottom:16px">??</div>
  <h3>Sin datos aún</h3>
  <p style="color:var(--text-muted); margin-bottom:24px;">Importa productos para ver el dashboard.</p>
  <button class="btn-primary" onclick="App.navigateTo('import')">Importar datos</button>
</div>`;
      return;
    }

    const enriched    = products.filter(p => p.dataSource && p.dataSource !== 'manual').length;
    const withImage   = products.filter(p => p.imageUrl).length;
    const noBrand     = products.filter(p => !p.brand || p.brand === 'N/A').length;
    const noWeight    = products.filter(p => !p.weight_g).length;
    const noCat       = products.filter(p => !p.universalCategory && !p.category).length;
    const noImage     = products.filter(p => !p.imageUrl).length;
    const avgCompleteness = Math.round(products.reduce((s, p) => s + DB.computeCompleteness(p), 0) / total);
    const enrichRate  = Math.round(enriched / total * 100);
    const imgRate     = Math.round(withImage / total * 100);

    const catCount = {};
    products.forEach(p => {
      const c = p.universalCategory || p.category || 'Sin categoría';
      catCount[c] = (catCount[c] || 0) + 1;
    });
    const topCats = Object.entries(catCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const holdingStats = holdings.map(h => {
      const hProds = products.filter(p => (p.holdings || p.retailers || {})[h.id]);
      const hAvg   = hProds.length
        ? Math.round(hProds.reduce((s, p) => s + DB.computeCompleteness(p), 0) / hProds.length)
        : 0;
      return { ...h, count: hProds.length, avg: hAvg };
    });

    const alerts = [];
    if (noBrand > 0)  alerts.push({ icon: '???', label: `${noBrand} SKU${noBrand > 1 ? 's' : ''} sin marca` });
    if (noImage > 0)  alerts.push({ icon: '???', label: `${noImage} SKU${noImage > 1 ? 's' : ''} sin imagen` });
    if (noCat > 0)    alerts.push({ icon: '???', label: `${noCat} SKU${noCat > 1 ? 's' : ''} sin categoría Vispera` });
    if (noWeight > 0) alerts.push({ icon: '??', label: `${noWeight} SKU${noWeight > 1 ? 's' : ''} sin peso registrado` });

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Dashboard</h1>
    <p class="view-sub">Resumen general del estado del catálogo</p>
  </div>
  <div class="view-actions">
    <button class="btn-outline" onclick="App.exportCSV()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Exportar CSV Master
    </button>
  </div>
</header>

<div class="dash-kpi-grid">
  <div class="dash-kpi-card">
    <div class="dash-kpi-icon" style="background:rgba(79,110,247,0.12);color:#4F6EF7">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${total.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">SKUs en Catálogo</span>
    </div>
  </div>
  <div class="dash-kpi-card" style="cursor:pointer" onclick="App.navigateTo('bulk')">
    <div class="dash-kpi-icon" style="background:rgba(74,201,155,0.12);color:#4ac99b">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${avgCompleteness}%</span>
      <span class="dash-kpi-label">Completitud Promedio</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${avgCompleteness}%;background:#4ac99b"></div></div>
    </div>
  </div>
  <div class="dash-kpi-card">
    <div class="dash-kpi-icon" style="background:rgba(255,193,7,0.12);color:#FFC107">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${enriched.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">Enriquecidos vía API (${enrichRate}%)</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${enrichRate}%;background:#FFC107"></div></div>
    </div>
  </div>
  <div class="dash-kpi-card">
    <div class="dash-kpi-icon" style="background:rgba(229,57,53,0.1);color:var(--danger)">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    </div>
    <div class="dash-kpi-body">
      <span class="dash-kpi-val">${withImage.toLocaleString('es-CL')}</span>
      <span class="dash-kpi-label">Con imagen (${imgRate}%)</span>
      <div class="dash-kpi-bar-track"><div class="dash-kpi-bar-fill" style="width:${imgRate}%;background:var(--danger)"></div></div>
    </div>
  </div>
</div>

<div class="dash-main-grid">

  <div class="dash-panel">
    <h3 class="dash-panel-title">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      Distribución por Categoría Vispera
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      Completitud por Holding
    </h3>
    ${holdingStats.length === 0
      ? '<p style="color:var(--text-muted);font-size:13px;padding:20px 0">Sin holdings configurados.</p>'
      : holdingStats.map(h => `
      <div class="dash-holding-row" onclick="App.filterByHolding('${h.id}')" title="Ver SKUs de ${h.name}">
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
      ? '<div style="padding:24px 0;text-align:center;color:var(--text-muted);"><div style="font-size:36px;margin-bottom:8px">?</div><p>¡Catálogo en buen estado!</p></div>'
      : alerts.map(a => `
      <div class="dash-alert-item" onclick="App.navigateTo('bulk')" title="Ver en Modo Edición">
        <span class="dash-alert-icon">${a.icon}</span>
        <span class="dash-alert-label">${a.label}</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;color:var(--text-muted)"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('')}
  </div>
</div>
`;

    if (_catChart) { _catChart.destroy(); _catChart = null; }
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
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw} SKUs` } }
          }
        }
      });
    }
  }

  return { render };
})();
