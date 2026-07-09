'use strict';

const App = {
  // ── utils ──────────────────────────────────
  formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    } catch { return iso; }
  },

  showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icons = { success:'✓', error:'✕', info:'ℹ', warning:'⚠' };
    t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ'}</span><span>${msg}</span>`;
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 350);
    }, type === 'error' ? 5000 : 3000);
  },

  // Data refresh callback (used by DB after saves)
  refreshData() {
    // Re-render current view if visible
    const hash = window.location.hash.replace('#', '');
    if (hash === 'catalog' && typeof UICatalog !== 'undefined') UICatalog.render();
  },

  // ── routing ────────────────────────────────
  navigateTo(view) {
    // Map legacy 'retailers' to 'holdings'
    if (view === 'retailers') view = 'holdings';

    if (window.location.hash !== `#${view}`) {
      window.location.hash = view; 
      return; // hashchange listener will trigger the actual render
    }
    
    // hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${view}`);
    if (target) target.classList.add('active');

    // update nav
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));

    // render appropriate view
    if (view === 'catalog')        UICatalog.render();
    if (view === 'bulk')           UIBulk.render();
    if (view === 'import')         UIImport.render();
    if (view === 'holdings')       { if (typeof UIHoldings !== 'undefined') UIHoldings.render(); else if (typeof UIRetailers !== 'undefined') UIRetailers.render(); }
    if (view === 'levantamiento')  UILevantamiento.render();
    if (view === 'staging')        UIStaging.render();
    if (view === 'api')            UIApi.render();
  },

  // ── Technical Sheet modal ──────────────────
  openSheet(ean) {
    UISheet.open(ean);
  },

  // ── sidebar ───────────────────────────────
  renderSidebar() {
    const holdings = DB.getHoldings();
    const el = document.getElementById('sidebar-holding-filters');
    if (!el) return;

    el.innerHTML = `
      <button class="sidebar-r-btn active" data-hid="all" onclick="App.filterByHolding('all')">
        <span class="r-dot" style="background:var(--text-muted)"></span> Todos
      </button>
      ${holdings.map(h => `
        <button class="sidebar-r-btn" data-hid="${h.id}" onclick="App.filterByHolding('${h.id}')">
          <span class="r-dot" style="background:${h.color}"></span> ${h.name}
        </button>
      `).join('')}
    `;
  },

  filterByHolding(hid) {
    document.querySelectorAll('.sidebar-r-btn').forEach(b => b.classList.toggle('active', b.dataset.hid === hid));
    UICatalog.setRetailer(hid);
    if (!document.getElementById('view-catalog')?.classList.contains('active')) {
      this.navigateTo('catalog');
    }
  },

  // Legacy alias
  filterByRetailer(rid) { this.filterByHolding(rid); },

  // ── theme ─────────────────────────────────
  toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = dark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('ss_theme', next);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = next === 'dark'
      ? `<span class="theme-icon">☀️</span> Modo claro`
      : `<span class="theme-icon">🌙</span> Modo oscuro`;
  },

  applyTheme() {
    const saved = localStorage.getItem('ss_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = saved === 'dark'
      ? `<span class="theme-icon">☀️</span> Modo claro`
      : `<span class="theme-icon">🌙</span> Modo oscuro`;
  },

  // ── add product (create mode) ──────────────
  addProduct() {
    UISheet.openCreate();
  },

  // ── backup / restore ───────────────────────
  exportBackup() {
    const json = DB.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `smart-shelf-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('Backup descargado correctamente', 'success');
  },

  importBackup() {
    const input = document.getElementById('backup-file-input');
    if (input) input.click();
  },

  handleBackupFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = DB.importBackup(e.target.result);
        this.showToast(`Backup restaurado: ${result.products} productos`, 'success');
        this.renderSidebar();
        UICatalog.render();
        this.checkUndo();
      } catch (err) {
        this.showToast(`Error al restaurar: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  },

  // ── undo ───────────────────────────────────
  checkUndo() {
    const u = DB.getUndo();
    let btn = document.getElementById('undo-float-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'undo-float-btn';
      btn.className = 'undo-float-btn';
      btn.onclick = () => this.undo();
      document.body.appendChild(btn);
    }
    if (u) {
      btn.innerHTML = `↩ Deshacer: ${u.label || 'cambios'}  <span class="undo-time">${this.formatDate(u.at)}</span>`;
      btn.classList.add('visible');
    } else {
      btn.classList.remove('visible');
    }
  },

  undo() {
    if (DB.applyUndo()) {
      this.showToast('Cambios deshechos correctamente', 'success');
      UICatalog.render();
      this.checkUndo();
    } else {
      this.showToast('No hay nada que deshacer', 'info');
    }
  },

  // ── export CSV ────────────────────────────
  exportCSV() {
    const products  = DB.getProductsArray();
    const holdings = DB.getHoldings();

    const rows = [
      // Header
      ['EAN','Nombre','Marca','Categoría Vispera','Tipo Paquete','Ancho cm','Alto cm','Prof cm','Peso g','Imagen URL','Fuente',
       ...holdings.flatMap(h => [`${h.name}_ID`,`${h.name}_Nombre`,`${h.name}_Categoria`,`${h.name}_Activo`])
      ]
    ];

    products.forEach(p => {
      const hlds = p.holdings || p.retailers || {};
      const row = [
        p.ean, p.name||'', p.brand||'', p.universalCategory || p.category || '', p.packageType||'',
        p.width_cm||'', p.height_cm||'', p.depth_cm||'', p.weight_g||'',
        p.imageUrl||'', p.dataSource||''
      ];
      holdings.forEach(h => {
        const hd = hlds[h.id];
        if (hd) {
          row.push(hd.holdingInternalId || hd.customerId||'', hd.localProductName || hd.name||'', hd.localCategoryName || hd.category||'', hd.isActiveHolding !== false ? 'SI':'NO');
        } else {
          row.push('','','','');
        }
      });
      rows.push(row);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `smart-shelf-master-data-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast('CSV exportado correctamente', 'success');
  },

  // ── export DMU Excel (one sheet per DMU) ──────────────
  exportDMUExcel(holdingId) {
    if (typeof XLSX === 'undefined') {
      this.showToast('Librería Excel no cargada', 'error');
      return;
    }
    const products  = DB.getProductsArray().filter(p => {
      const hlds = p.holdings || p.retailers || {};
      return hlds[holdingId];
    });
    const holdings = DB.getHoldings();
    const hInfo     = holdings.find(h => h.id === holdingId);
    if (!hInfo) return;

    // Group by DMU
    const groups = {};
    products.forEach(p => {
      const hlds = p.holdings || p.retailers || {};
      const hd  = hlds[holdingId];
      const dmu = hd.dmu || hd.localCategoryName || hd.category || 'Sin DMU';
      if (!groups[dmu]) groups[dmu] = [];
      groups[dmu].push({ p, hd });
    });

    const wb = XLSX.utils.book_new();
    const headers = ['EAN', 'Nombre', 'Marca', 'ID Holding', 'Categoría', 'DMU', 'Posición', 'Peso (g)', 'Tipo Envase', 'Imagen URL'];

    Object.entries(groups).forEach(([dmu, items]) => {
      items.sort((a, b) => (a.hd.position || 9999) - (b.hd.position || 9999));
      const rows = [headers];
      items.forEach(({ p, hd }) => {
        rows.push([
          p.ean,
          hd.localProductName || hd.name || p.name || '',
          p.brand || '',
          hd.holdingInternalId || hd.customerId || '',
          hd.localCategoryName || hd.category || '',
          hd.dmu || '',
          hd.position || '',
          p.weight_g || '',
          p.packageType || '',
          hd.imageUrl || p.imageUrl || ''
        ]);
      });
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const sheetName = String(dmu).replace(/[\\/*?:[\]]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'DMU');
    });

    const fname = `${hInfo.name.replace(/\s+/g,'-')}-DMUs-${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    this.showToast(`Excel DMU de ${hInfo.name} exportado`, 'success');
  },

  exportRetailerCSV(holdingId) {
    const products = DB.getProductsArray();
    const holdings = DB.getHoldings();
    const hInfo = holdings.find(h => h.id === holdingId);
    if (!hInfo) return;

    const filteredProducts = products.filter(p => {
      const hlds = p.holdings || p.retailers || {};
      return hlds[holdingId];
    });

    const rows = [
      ['EAN', `Nombre (${hInfo.name})`, `ID SKU (${hInfo.name})`, `Categoría (${hInfo.name})`, `Activo (${hInfo.name})`, 'Marca', 'Peso/Gramaje (g)', 'Tipo Envase', 'Imagen URL', 'Ancho cm', 'Alto cm', 'Profundidad cm']
    ];

    filteredProducts.forEach(p => {
      const hlds = p.holdings || p.retailers || {};
      const hd = hlds[holdingId];
      const row = [
        p.ean,
        hd.localProductName || hd.name || p.name || '',
        hd.holdingInternalId || hd.customerId || '',
        hd.localCategoryName || hd.category || '',
        hd.isActiveHolding !== false ? 'SI' : 'NO',
        p.brand || '',
        p.weight_g || '',
        p.packageType || '',
        hd.imageUrl || p.imageUrl || '',
        p.width_cm || '',
        p.height_cm || '',
        p.depth_cm || ''
      ];
      rows.push(row);
    });

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `smart-shelf-export-${holdingId}-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast(`CSV de ${hInfo.name} exportado correctamente`, 'success');
  },

  // ── init ──────────────────────────────────
  async init() {
    // Wait for DB download into memory
    await DB.init();
    
    // Hide global loader overlay
    const loader = document.getElementById('global-loader');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.transition = 'opacity 0.5s ease';
      setTimeout(() => loader.remove(), 500);
    }
    this.applyTheme();
    this.renderSidebar();

    // Nav clicks
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.navigateTo(btn.dataset.view));
    });

    // Modal overlay click-outside to close
    const overlay = document.getElementById('sheet-overlay');
    overlay?.addEventListener('click', e => {
      if (e.target === overlay) UISheet.close();
    });

    // Keyboard: ESC to close modal
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('sheet-overlay');
        if (!overlay?.classList.contains('hidden')) UISheet.close();
      }
    });

    // Bottom reset button (dev helper)
    document.getElementById('reset-btn')?.addEventListener('click', () => {
      if (confirm('¿Resetear todos los datos a los valores de demostración?')) {
        DB.resetToDefaults();
        this.navigateTo('catalog');
        this.showToast('Datos reseteados a demo', 'info');
      }
    });

    // Hash tracking for F5 refreshes
    const validViews = ['catalog', 'import', 'holdings', 'bulk', 'levantamiento', 'staging', 'api'];
    window.addEventListener('hashchange', () => {
      let hash = window.location.hash.replace('#', '');
      if (hash === 'retailers') hash = 'holdings'; // legacy redirect
      this.navigateTo(validViews.includes(hash) ? hash : 'catalog');
    });

    // Start on requested hash or default to catalog
    let startHash = window.location.hash.replace('#', '');
    if (startHash === 'retailers') startHash = 'holdings';
    this.navigateTo(validViews.includes(startHash) ? startHash : 'catalog');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
