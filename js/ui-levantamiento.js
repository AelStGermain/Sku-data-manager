'use strict';

// ──────────────────────────────────────────────────────────────────────────────
//  UI LEVANTAMIENTO — Arquitectura correcta
//
//  Fuente de verdad: Catálogo Maestro (servidor localhost:3000 + localStorage cache)
//  Staging: cola temporal de procesamiento (se vacía al procesar)
//
//  Flujo:
//    Firebase onSnapshot → nuevos docs → _processIncomingData()
//      ↓
//    Por cada EAN válido:
//      - Match catálogo maestro → MATCHED  → actualizar holdings + levantamientoMeta
//      - Sin match → API externas → guardar producto nuevo → levantamientoMeta
//      - Sin EAN  → staging noEan (permanece hasta asignar EAN manual)
//      ↓
//    Staging temporal auto-limpiado tras procesar
//      ↓
//    renderTable() lee SIEMPRE del catálogo maestro (dataSource='levantamiento')
//    filtrado localmente por levantamientoMeta: auditor, dmu, pasillo, fecha, holding
//
//  Al recargar la página sin sincronizar:
//    → DB.init() carga el catálogo desde el servidor → la vista ya tiene datos
//    → Firebase onSnapshot conecta y trae solo lo NUEVO
// ──────────────────────────────────────────────────────────────────────────────

const UILevantamiento = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // ── Estado interno ──────────────────────────
  let _lastSyncStr = '● Verificando...';
  let _isSyncing = false;
  let _syncProgress = { total: 0, done: 0 };
  let _showAll = false;  // false = últimos 25, true = todos

  // Filtros (se aplican localmente sobre catálogo maestro)
  let _filterDateFrom = '';
  let _filterDateTo   = '';
  let _filterAuditor  = '';
  let _filterDmu      = '';
  let _filterPasillo  = '';
  let _filterCategoria = '';
  let _filterHolding  = '';

  // Datalists de Firebase
  let _auditoresFetched = false;
  let _auditoresOpts = '';
  let _dmusOpts = '';

  // IDs de Firebase ya procesados (evita reprocesar al reconectar)
  const PROCESSED_IDS_KEY = 'ss_lev_processed_ids';
  function _getProcessedIds() {
    try { return new Set(JSON.parse(localStorage.getItem(PROCESSED_IDS_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function _markAsProcessed(ids) {
    const existing = _getProcessedIds();
    ids.forEach(id => existing.add(id));
    const arr = [...existing].slice(-5000); // límite razonable
    try { localStorage.setItem(PROCESSED_IDS_KEY, JSON.stringify(arr)); } catch {}
  }

  // ── Helpers ─────────────────────────────────

  function _resolveHolding(reg) {
    // Campo confirmado en Firestore: `holding` (puede ser nombre o id)
    const raw = reg.holding || reg.holdingId || '';
    if (!raw) return null;
    const holdings = DB.getHoldings();
    const rawLower = String(raw).toLowerCase().trim();
    let match = holdings.find(h => h.id.toLowerCase() === rawLower);
    if (match) return match.id;
    match = holdings.find(h => h.name.toLowerCase() === rawLower);
    if (match) return match.id;
    return rawLower; // fallback: usar el valor raw como id provisional
  }

  function _parseTimestamp(reg) {
    try {
      if (reg.fecha && typeof reg.fecha.toDate === 'function') return reg.fecha.toDate().toISOString();
      if (reg.fecha && typeof reg.fecha === 'string') {
        const m = reg.fecha.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
        if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00Z`).toISOString();
        return new Date(reg.fecha).toISOString();
      }
      if (reg.timestamp && typeof reg.timestamp === 'string') return new Date(reg.timestamp).toISOString();
    } catch {}
    return new Date().toISOString();
  }

  function _cleanName(s) {
    if (!s) return '';
    return String(s).replace(/\$?\d+(?:[.,]\d+)?\s*POR\s*KG/gi, '').trim();
  }

  // Prioridad nombre: productoWeb > nombreProductoOCR > fallback
  function _resolveName(reg, fallback = '') {
    const web = _cleanName(reg.productoWeb);
    if (web) return web;
    const ocr = _cleanName(reg.nombreProductoOCR);
    if (ocr) return ocr;
    return fallback;
  }

  // ── Fetch catálogos (auditores, DMUs para datalists) desde el catálogo local ──
  async function _fetchMetadata() {
    try {
    const productos = DB.getProductsArray().filter(p =>
      p.dataSource === 'levantamiento' ||
      p.dataSource === 'firebase' ||
      p.fromLevantamiento === true ||
      p.fromFirebase === true
    );
      const auditoresSet = new Set();
      const dmusSet = new Set();
      
      productos.forEach(p => {
        if (p.levantamientoMeta) {
          if (p.levantamientoMeta.auditor) auditoresSet.add(p.levantamientoMeta.auditor);
          if (p.levantamientoMeta.dmu) dmusSet.add(p.levantamientoMeta.dmu);
        }
      });
      
      _auditoresOpts = Array.from(auditoresSet).map(a => `<option value="${esc(a)}">`).join('');
      _dmusOpts = Array.from(dmusSet).map(d => `<option value="${esc(d)}">`).join('');
      _auditoresFetched = true;
      _refreshDataLists();
    } catch(e) {
      console.warn('[Levantamiento] No se pudieron cargar catálogos locales:', e);
    }
  }

  function _refreshDataLists() {
    ['fb-auditores-list','lev-auditores-list'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = _auditoresOpts; });
    ['fb-dmus-list','lev-dmus-list'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = _dmusOpts; });
  }

  // ──────────────────────────────────────────────────────────────────
  //  renderTable(): lee del CATÁLOGO MAESTRO, no del staging
  //  Filtra por dataSource='levantamiento' y aplica filtros locales
  // ──────────────────────────────────────────────────────────────────
  function renderTable() {
    const wrap = document.querySelector('.lev-raw-table-wrap');
    const countSpan = document.getElementById('lev-raw-count');
    if (!wrap) return;

    // Fuente de verdad: catálogo maestro
    // Incluye todos los SKUs provenientes de Firebase o Levantamiento de Terreno
    let productos = DB.getProductsArray().filter(p =>
      p.dataSource === 'levantamiento' ||
      p.dataSource === 'firebase' ||
      p.fromLevantamiento === true ||
      p.fromFirebase === true
    );

    // ── Filtros sobre levantamientoMeta
    if (_filterAuditor) {
      productos = productos.filter(p => (p.levantamientoMeta?.auditor || '').toLowerCase().includes(_filterAuditor.toLowerCase()));
    }
    if (_filterDmu) {
      productos = productos.filter(p => (p.levantamientoMeta?.dmu || '').toLowerCase().includes(_filterDmu.toLowerCase()));
    }
    if (_filterPasillo) {
      productos = productos.filter(p => (p.levantamientoMeta?.pasillo || '').toLowerCase().includes(_filterPasillo.toLowerCase()));
    }
    if (_filterCategoria) {
      productos = productos.filter(p => {
        const cat = p.universalCategory || p.category || [];
        if (Array.isArray(cat)) return cat.includes(_filterCategoria);
        return cat === _filterCategoria;
      });
    }
    if (_filterHolding) {
      productos = productos.filter(p => p.levantamientoMeta?.holdingId === _filterHolding || Object.keys(p.holdings || {}).includes(_filterHolding));
    }
    if (_filterDateFrom) {
      productos = productos.filter(p => (p.levantamientoMeta?.timestamp || p.updatedAt || '').substring(0, 10) >= _filterDateFrom);
    }
    if (_filterDateTo) {
      productos = productos.filter(p => (p.levantamientoMeta?.timestamp || p.updatedAt || '').substring(0, 10) <= _filterDateTo);
    }

    // Ordenar: más recientes primero (por timestamp de levantamiento)
    productos.sort((a, b) => {
      const ta = a.levantamientoMeta?.timestamp || a.updatedAt || '';
      const tb = b.levantamientoMeta?.timestamp || b.updatedAt || '';
      return tb.localeCompare(ta);
    });

    const totalFiltrado = productos.length;
    const mostrar = _showAll ? productos : productos.slice(0, 25);

    // Stats de todo el histórico de levantamiento (sin filtro)
    const todoLev = DB.getProductsArray().filter(p =>
      p.dataSource === 'levantamiento' ||
      p.dataSource === 'firebase' ||
      p.fromLevantamiento === true ||
      p.fromFirebase === true
    );
    const matched    = todoLev.filter(p => p.status === 'active' || p.status === 'review').length;
    const sinVispera = todoLev.filter(p => !p.visperaId).length;
    const vispTickets = DB.getVisperaBatch().length;

    if (countSpan) {
      countSpan.innerHTML = `
        <span style="color:var(--text-muted)">${totalFiltrado} producto(s) — mostrando ${mostrar.length}</span>
        &nbsp;·&nbsp;
        <span style="color:var(--success);font-weight:600">${matched} en catálogo</span>
        &nbsp;·&nbsp;
        <span style="color:var(--danger)">${sinVispera} sin Vispera ID</span>
      `;
    }

    if (mostrar.length === 0) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:40px;">
          <div class="empty-icon">📡</div>
          <h3>${todoLev.length === 0 ? 'Sin datos de levantamiento' : 'Sin resultados para los filtros'}</h3>
          <p>${todoLev.length === 0
            ? 'Haz clic en <strong>↺ Sincronizar Firebase</strong> para descargar los levantamientos.<br>Una vez sincronizados, los datos quedan permanentemente en el catálogo.'
            : 'Ajusta los filtros para ver más registros.'}</p>
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="preview-table-wrap" style="max-height:52vh; overflow-y:auto;">
        <table class="preview-table">
          <thead>
            <tr>
              <th>Fecha Scan</th>
              <th>Holding</th>
              <th>DMU / Pasillo</th>
              <th>EAN</th>
              <th>Nombre (Catálogo)</th>
              <th>Marca</th>
              <th>Categoría</th>
              <th>Auditor</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${mostrar.map(p => {
              const meta = p.levantamientoMeta || {};
              const statusColor = p.visperaId ? '#28a745' : (p.status === 'review' ? '#ffc107' : '#4F6EF7');
              const statusBg    = p.visperaId ? 'rgba(40,167,69,0.06)' : (p.status === 'review' ? 'rgba(255,193,7,0.06)' : 'rgba(79,110,247,0.05)');
              const statusLabel = p.visperaId ? '✔ Vispera OK' : (p.status === 'review' ? '⚠ Sin Vispera ID' : '⊕ Nuevo');
              const statusTextColor = p.status === 'review' && !p.visperaId ? '#856404' : '#fff';
              const holdingId = meta.holdingId || Object.keys(p.holdings || {})[0] || '—';

              return `
              <tr style="background:${statusBg}; cursor:pointer;" onclick="App.openSheet('${esc(p.ean)}')">
                <td style="white-space:nowrap; font-size:12px;">${meta.timestamp ? new Date(meta.timestamp).toLocaleDateString('es-CL') : '—'}</td>
                <td><span class="holding-badge-sm">${esc(holdingId)}</span></td>
                <td>
                  <span style="font-weight:500">${esc(meta.dmu || '—')}</span>
                  ${meta.pasillo ? `<br><span style="font-size:11px;color:var(--text-muted)">🛒 ${esc(meta.pasillo)}</span>` : ''}
                  ${meta.local ? `<br><span style="font-size:10px;color:var(--text-muted)">📍 ${esc(meta.local)}</span>` : ''}
                </td>
                <td class="mono" style="font-weight:600;">${esc(p.ean)}</td>
                <td style="max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${esc(p.name)}">
                  ${esc(p.name || '—')}
                </td>
                <td style="font-size:12px;color:var(--text-sec);">${esc(p.brand || '—')}</td>
                <td>
                  <span class="vispera-cat-badge" style="--cat-color:${VISPERA_CATEGORY_COLORS[Array.isArray(p.universalCategory || p.category) ? (p.universalCategory || p.category)[0] : (p.universalCategory || p.category)] || '#888'}">
                    ${esc(Array.isArray(p.universalCategory || p.category) ? (p.universalCategory || p.category).join(', ') : (p.universalCategory || p.category || '—'))}
                  </span>
                </td>
                <td style="font-size:12px;">${esc(meta.auditor || '—')}</td>
                <td>
                  <span class="badge" style="background:${statusColor};color:${statusTextColor};font-size:11px;">
                    ${statusLabel}
                  </span>
                </td>
                <td onclick="event.stopPropagation()">
                  <button class="btn-mini" style="color:var(--accent);font-size:11px;" onclick="App.openSheet('${esc(p.ean)}')">Ver →</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${!_showAll && totalFiltrado > 25 ? `
        <div style="text-align:center; margin-top:12px;">
          <button class="btn-outline" onclick="UILevantamiento.showAll()">
            Ver los ${totalFiltrado - 25} registros restantes
          </button>
        </div>` : ''}`;
  }

  // ── Render principal ─────────────────────────
  function render() {
    const el = document.getElementById('view-levantamiento');
    if (!el) return;

    const holdings = DB.getHoldings();
    const holdingOpts = holdings.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
    const holdingFilterOpts = `<option value="">Todos los Holdings</option>` + holdings.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
    const catOpts = UNIVERSAL_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    const todoLev = DB.getProductsArray().filter(p =>
      p.dataSource === 'levantamiento' ||
      p.dataSource === 'firebase' ||
      p.fromLevantamiento === true ||
      p.fromFirebase === true
    );
    const vispTickets = DB.getVisperaBatch().length;
    const noEanCount = DB.getStagingNoEan().length;
    const pendingStaging = DB.getStagingLevantamiento().filter(s => s.status === 'PENDING' || !s.status).length;

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Levantamiento de Terreno</h1>
    <p class="view-sub">Datos sincronizados desde Firebase · Permanentes en el catálogo maestro</p>
  </div>
  <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
    ${_isSyncing ? `
      <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--accent);">
        <div class="spinning-loader" style="width:16px;height:16px;border:2px solid #eaeaea;border-top-color:var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>
        Sincronizando… ${_syncProgress.done}/${_syncProgress.total}
      </div>
    ` : `
      <button class="btn-primary" onclick="UILevantamiento.syncFirebase()" style="gap:6px; display:flex; align-items:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M1 4v6h6"/><path d="M23 20v-6h-6"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
        ↺ Sincronizar Firebase
      </button>
    `}
    <button class="btn-outline" onclick="App.navigateTo('auditoria')" style="gap:6px; display:flex; align-items:center; position:relative;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      Tickets Vispera
      ${vispTickets > 0 ? `<span style="position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;border-radius:10px;font-size:10px;padding:1px 5px;font-weight:700;">${vispTickets}</span>` : ''}
    </button>
  </div>
</header>

<!-- Stats chips -->
<div style="display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap;">
  <div class="stat-chip" style="background:rgba(79,110,247,0.1); border:1px solid rgba(79,110,247,0.2); color:#4F6EF7;">
    <strong>${todoLev.length}</strong> en catálogo
  </div>
  <div class="stat-chip" style="background:rgba(40,167,69,0.1); border:1px solid rgba(40,167,69,0.2); color:#28a745;">
    <strong>${todoLev.filter(p => p.visperaId).length}</strong> con Vispera ID
  </div>
  <div class="stat-chip" style="background:rgba(255,193,7,0.15); border:1px solid rgba(255,193,7,0.3); color:#856404;">
    <strong>${todoLev.filter(p => !p.visperaId).length}</strong> sin Vispera ID
  </div>
  <div class="stat-chip" style="background:rgba(220,53,69,0.1); border:1px solid rgba(220,53,69,0.2); color:var(--danger);">
    <strong>${vispTickets}</strong> tickets Vispera
  </div>
  ${noEanCount > 0 ? `
  <div class="stat-chip" style="background:var(--surface); border:1px solid var(--border); color:var(--text-sec);">
    <strong>${noEanCount}</strong> sin EAN
  </div>` : ''}
  ${pendingStaging > 0 ? `
  <div class="stat-chip" style="background:rgba(255,193,7,0.1); border:1px solid rgba(255,193,7,0.2); color:#856404;">
    <div class="spinning-loader" style="width:10px;height:10px;border:2px solid rgba(255,193,7,0.3);border-top-color:#856404;border-radius:50%;animation:spin 1s linear infinite;display:inline-block;margin-right:4px;"></div>
    <strong>${pendingStaging}</strong> procesando…
  </div>` : ''}
</div>

<div class="levantamiento-layout">
  <!-- Panel izquierdo: Filtros -->
  <div class="lev-panel lev-input-panel">
    <div class="lev-panel-header">
      <h3>🔍 Filtros</h3>
      <p class="lev-panel-sub">Filtra sobre todos los SKUs ya guardados en el catálogo</p>
    </div>
    <div class="lev-form">
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Rango de Fechas (Captura)</label>
          <input type="text" id="fb-filter-date-range" class="form-input" placeholder="Ej: 2026-07-01 a 2026-07-15" readonly>
        </div>
        <div class="form-group" style="flex:1">
          <label>Auditor</label>
          <input type="text" list="fb-auditores-list" id="fb-filter-auditor" class="form-input" placeholder="Todos los Auditores..." value="${_filterAuditor}" oninput="UILevantamiento.setFilters()">
          <datalist id="fb-auditores-list">${_auditoresOpts}</datalist>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>DMU / Góndola</label>
          <input type="text" list="fb-dmus-list" id="fb-filter-dmu" class="form-input" placeholder="Todos los DMUs..." value="${_filterDmu}" oninput="UILevantamiento.setFilters()">
          <datalist id="fb-dmus-list">${_dmusOpts}</datalist>
        </div>
        <div class="form-group" style="flex:1">
          <label>Pasillo</label>
          <input type="text" id="fb-filter-pasillo" class="form-input" placeholder="Ej: Pasillo 3" value="${_filterPasillo}" oninput="UILevantamiento.setFilters()">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>Categoría</label>
          <select id="fb-filter-cat" class="form-select" onchange="UILevantamiento.setFilters()">
            <option value="">Todas las Categorías</option>
            ${catOpts}
          </select>
        </div>
        <div class="form-group" style="flex:1">
          <label>Holding</label>
          <select id="fb-filter-holding" class="form-select" onchange="UILevantamiento.setFilters()">
            ${holdingFilterOpts}
          </select>
        </div>
      </div>
      <div style="display:flex; gap:8px; margin-top:4px;">
        <button class="btn-clear" style="flex:1" onclick="UILevantamiento.clearFilters()">Limpiar Filtros</button>
      </div>
    </div>
  </div>


  <!-- Panel derecho: Tabla desde catálogo maestro -->
  <div class="lev-panel lev-raw-panel">
    <div class="lev-panel-header" style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <h3>
          SKUs de Levantamiento
          <span id="realtime-badge" style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--success);color:white;vertical-align:middle;margin-left:8px;">
            ${_lastSyncStr}
          </span>
        </h3>
        <p class="lev-panel-sub">Fuente: Catálogo Maestro · Permanente · Clic en una fila para ver ficha completa</p>
      </div>
    </div>
    <div class="lev-raw-table-wrap">
      <!-- Se llena por renderTable() →→ lee del catálogo maestro -->
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text-muted)" id="lev-raw-count">Cargando…</span>
      <button class="btn-outline" style="font-size:12px;" onclick="App.navigateTo('auditoria')">
        Ver auditoría completa →
      </button>
    </div>
  </div>
</div>`;

    _fetchMetadata();
    _fetchLastSync();
    renderTable();

    // Init flatpickr date range picker
    setTimeout(() => {
      if (window.flatpickr) {
        flatpickr("#fb-filter-date-range", {
          mode: "range",
          locale: "es",
          dateFormat: "Y-m-d",
          maxDate: "today",
          defaultDate: _filterDateFrom && _filterDateTo ? [_filterDateFrom, _filterDateTo] : [],
          onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
              _filterDateFrom = instance.formatDate(selectedDates[0], "Y-m-d");
              _filterDateTo = instance.formatDate(selectedDates[1], "Y-m-d");
              UILevantamiento.setFilters();
            } else if (selectedDates.length === 0) {
              _filterDateFrom = '';
              _filterDateTo = '';
              UILevantamiento.setFilters();
            }
          }
        });
      }
    }, 100);
  }

  async function _fetchLastSync() {
    try {
      const res = await fetch('/api/last-sync');
      if (res.ok) {
        const data = await res.json();
        if (data.lastSync > 0) {
          const dt = new Date(data.lastSync);
          _lastSyncStr = 'Última act: ' + dt.toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
        } else {
          _lastSyncStr = 'Nunca sincronizado';
        }
        const badge = document.getElementById('realtime-badge');
        if (badge) {
          badge.textContent = _lastSyncStr;
          badge.style.background = 'var(--success)';
        }
      }
    } catch(e) {
      _lastSyncStr = 'Error conexión';
      const badge = document.getElementById('realtime-badge');
      if (badge) { badge.textContent = _lastSyncStr; badge.style.background = '#888'; }
    }
  }

  // ── Sincronización con el Backend ────────────────────
  async function syncFirebase(force = false) {
    if (_isSyncing) return;
    _isSyncing = true;
    _syncProgress = { total: 0, done: 0 };
    render();
    try {
      App.showToast('⬇️ Sincronizando con el servidor...', 'info');
      
      const res = await fetch('/api/sync-firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El servidor decide qué registros traer según su propio estado (last_fb_sync.json)
        // No se pasa 'since' desde el cliente — el servidor es la fuente de verdad
        body: JSON.stringify({ force: force })
      });
      
      const result = await res.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Error desconocido del servidor');
      }
      
      // Update local catalog to reflect backend changes
      await DB.init();
      
      // Add items without EAN to local staging
      if (result.sinEanList && result.sinEanList.length > 0) {
        result.sinEanList.forEach(item => {
          const exists = DB.getStagingNoEan().find(s => s.firebaseId === item.firebaseId);
          if (!exists) {
            DB.addStagingNoEan(item);
          }
        });
      }

      const vispCount = DB.getVisperaBatch().length;
      App.showToast(`✅ Sync Completado: ${result.added} nuevos, ${result.updated} actualizados. ${vispCount} tickets Vispera.`, 'success');
      
    } catch(e) {
      console.error('[Levantamiento] Error sync:', e);
      App.showToast('Error al sincronizar: ' + e.message, 'error');
    } finally {
      _isSyncing = false;
      renderTable();
      render();
    }
  }


  // ── Filtros ──────────────────────────────────
  function setFilters() {
    // Note: _filterDateFrom and _filterDateTo are now managed by flatpickr onChange callback.
    // We don't overwrite them here.

    _filterAuditor   = document.getElementById('fb-filter-auditor')?.value || '';
    _filterDmu       = document.getElementById('fb-filter-dmu')?.value || '';
    _filterPasillo   = document.getElementById('fb-filter-pasillo')?.value || '';
    _filterCategoria = document.getElementById('fb-filter-cat')?.value || '';
    _filterHolding   = document.getElementById('fb-filter-holding')?.value || '';
    _showAll = false;
    renderTable();
  }

  function clearFilters() {
    _filterDateFrom = _filterDateTo = _filterAuditor = _filterDmu = _filterPasillo = _filterCategoria = _filterHolding = '';
    ['fb-filter-auditor','fb-filter-dmu','fb-filter-pasillo']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cat = document.getElementById('fb-filter-cat');
    if (cat) cat.value = '';
    const hold = document.getElementById('fb-filter-holding');
    if (hold) hold.value = '';
    
    // Clear flatpickr
    const dp = document.getElementById('fb-filter-date-range');
    if (dp && dp._flatpickr) dp._flatpickr.clear();
    
    _showAll = false;
    renderTable();
  }

  function showAll() {
    _showAll = true;
    renderTable();
  }

  // ── Agregar entrada manual ───────────────────
  async function addEntry() {
    const ean = document.getElementById('lev-ean')?.value.trim().replace(/\D/g, '');
    const holdingId = document.getElementById('lev-holding')?.value;
    const dmu = document.getElementById('lev-dmu')?.value.trim();
    const pasillo = document.getElementById('lev-pasillo')?.value.trim();
    const category = document.getElementById('lev-cat')?.value;
    const auditor = document.getElementById('lev-auditor')?.value.trim();

    if (!ean) {
      DB.addStagingNoEan({ holdingId, dmu, pasillo, category, auditor, source: 'Manual' });
      App.showToast('Registro sin EAN agregado a "Por Identificar"', 'info');
      _clearForm();
      return;
    }
    if (ean.length < 6) { App.showToast('EAN debe tener al menos 6 dígitos', 'error'); return; }

    const check = DB.validateEAN(ean);
    if (!check.valid) App.showToast(`⚠️ EAN ${ean}: ${check.reason}`, 'warning');

    App.showToast(`Buscando EAN ${ean}...`, 'info');
    
    const existing = DB.getProduct(ean);
    let product;
    
    const timestamp = new Date().toISOString();
    const levantamientoMeta = {
      auditor: auditor || 'Usuario Manual',
      dmu: dmu || '',
      pasillo: pasillo || '',
      local: '',
      holdingId,
      timestamp,
      firebaseId: 'manual_' + Date.now(),
      estado: 'PENDING'
    };

    if (existing) {
      product = { ...existing };
      product.levantamientoMeta = levantamientoMeta;
      product.fromLevantamiento = true;
      product.dataSource = 'levantamiento';
    } else {
      product = {
        ean,
        name: 'Nuevo SKU Manual',
        brand: 'Por Definir',
        imageUrl: null,
        universalCategory: category ? [category] : ['GROCERY STORE'],
        visperaId: null,
        status: 'review',
        dataSource: 'levantamiento',
        fromLevantamiento: true,
        offAttempted: false,
        levantamientoMeta,
        holdings: {}
      };
    }

    if (holdingId) {
      product.holdings = product.holdings || {};
      product.holdings[holdingId] = {
        holdingInternalId: '',
        customerId: '',
        localProductName: product.name,
        name: product.name,
        localCategoryName: category,
        category,
        dmu: dmu || '',
        pasillo: pasillo || '',
        local: '',
        isActiveHolding: true,
        stockStatus: true,
        updatedAt: timestamp
      };
    }

    await DB.saveProduct(product, true);
    
    App.showToast(`EAN ${ean} guardado en el catálogo`, 'success');
    _clearForm();
    renderTable();
  }

  function _clearForm() {
    ['lev-ean','lev-dmu','lev-pasillo','lev-auditor'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  }

  // ── API pública ──────────────────────────────
  return {
    render,
    setFilters,
    clearFilters,
    showAll,
    addEntry,
    syncFirebase,
    // Alias legacy por compatibilidad
    removeEntry: () => {},
    clearStaging: () => {
      if (!confirm('¿Limpiar la cola de staging temporal? Los datos del catálogo NO se borran.')) return;
      DB.clearStagingLevantamiento();
      try { localStorage.removeItem(PROCESSED_IDS_KEY); } catch {}
      App.showToast('Cola de staging limpiada. Los datos permanecen en el catálogo.', 'info');
      renderTable();
    },
    processStaging: syncFirebase
  };
})();
