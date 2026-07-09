'use strict';

const UILevantamiento = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
  <div class="view-actions">
    <span class="badge" style="background:var(--accent)">${staging.length} registros en Staging</span>
    <button class="btn-teal" onclick="UILevantamiento.processStaging()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      Ejecutar Matching Pipeline
    </button>
  </div>
</header>

<div class="levantamiento-layout">
  <!-- Input Panel -->
  <div class="lev-panel lev-input-panel">
    <div class="lev-panel-header">
      <h3>📱 Staging_Levantamiento</h3>
      <p class="lev-panel-sub">Capturar datos de levantamiento (DMU, EAN)</p>
    </div>
    <div class="lev-form">
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
          <input type="text" class="form-input" id="lev-dmu" placeholder="Ej: ACEITES">
        </div>
        <div class="form-group" style="flex:1">
          <label>Categoría Levantamiento</label>
          <select class="form-select" id="lev-cat">${catOpts}</select>
        </div>
      </div>
      <div class="form-group">
        <label>Auditor</label>
        <input type="text" class="form-input" id="lev-auditor" placeholder="Nombre del auditor" value="Gabriel Hermosilla">
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px;">
        <button class="btn-outline" onclick="UILevantamiento.clearForm()">Limpiar</button>
        <button class="btn-primary" onclick="UILevantamiento.addEntry()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Agregar a Staging
        </button>
      </div>
    </div>
  </div>

  <!-- Raw Data Panel -->
  <div class="lev-panel lev-raw-panel">
    <div class="lev-panel-header">
      <h3>📋 Levantamiento Raw Data</h3>
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
                <th>DMU</th>
                <th>Categoría</th>
                <th>Auditor</th>
                <th>Timestamp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${staging.map((s, i) => `
              <tr>
                <td class="mono" style="font-weight:600;">${esc(s.ean)}</td>
                <td><span class="holding-badge-sm">${esc(s.holdingId)}</span></td>
                <td>${esc(s.dmu || '—')}</td>
                <td><span class="vispera-cat-badge" style="--cat-color:${VISPERA_CATEGORY_COLORS[s.category] || '#888'}">${esc(s.category)}</span></td>
                <td>${esc(s.auditor)}</td>
                <td style="font-size:11px; color:var(--text-muted)">${new Date(s.timestamp).toLocaleString('es-CL')}</td>
                <td><button class="btn-mini" style="color:var(--danger)" onclick="UILevantamiento.removeEntry(${i})">✕</button></td>
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
  <h3 style="margin-bottom:16px;">Matching & Enrichment Pipeline</h3>
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
  }

  function addEntry() {
    const ean = document.getElementById('lev-ean')?.value.trim();
    const holdingId = document.getElementById('lev-holding')?.value;
    const dmu = document.getElementById('lev-dmu')?.value.trim();
    const category = document.getElementById('lev-cat')?.value;
    const auditor = document.getElementById('lev-auditor')?.value.trim();

    if (!ean || ean.length < 6) {
      App.showToast('EAN debe tener al menos 6 dígitos', 'error');
      return;
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
    localStorage.setItem('ss_staging_levantamiento', JSON.stringify(staging));
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

  async function processStaging() {
    const staging = DB.getStagingLevantamiento();
    if (staging.length === 0) {
      App.showToast('No hay registros en staging para procesar', 'warning');
      return;
    }

    App.showToast(`Procesando ${staging.length} registros a través del Pipeline...`, 'info');

    let matched = 0;
    let unmatched = 0;

    for (const entry of staging) {
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
        matched++;
      } else {
        // Step 2: Unmatched → send to staging_unmatched_eans
        DB.addStagingUnmatched({
          ean: entry.ean,
          holdingId: entry.holdingId,
          dmuCategory: entry.dmu || entry.category,
          apiRawName: null,
          apiBrand: null,
          apiWeight: null,
          apiUniversalCategory: null,
          confidenceScore: null,
          status: 'PENDING_ENRICHMENT'
        });
        unmatched++;
      }
    }

    // Clear staging after processing
    DB.clearStagingLevantamiento();

    App.showToast(`Pipeline completado: ${matched} matcheados, ${unmatched} enviados a staging`, 'success');

    // Navigate to staging view if there are unmatched
    if (unmatched > 0) {
      App.navigateTo('staging');
    } else {
      render();
    }
  }

  return {
    render,
    addEntry,
    removeEntry,
    clearForm,
    clearStaging,
    processStaging
  };
})();
