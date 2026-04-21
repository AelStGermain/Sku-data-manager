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

  formatDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}); }
    catch { return iso.slice(0,16); }
  },

  // ── routing ────────────────────────────────
  navigateTo(view) {
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
    if (view === 'catalog')   UICatalog.render();
    if (view === 'import')    UIImport.render();
    if (view === 'retailers') UIRetailers.render();
    if (view === 'api')       UIApi.render();
  },

  // ── Technical Sheet modal ──────────────────
  openSheet(ean) {
    UISheet.open(ean);
  },

  // ── sidebar ───────────────────────────────
  renderSidebar() {
    const retailers = DB.getRetailers();
    const el = document.getElementById('sidebar-retailer-filters');
    if (!el) return;

    el.innerHTML = `
      <button class="sidebar-r-btn active" data-rid="all" onclick="App.filterByRetailer('all')">
        <span class="r-dot" style="background:var(--text-muted)"></span> Todos
      </button>
      ${retailers.map(r => `
        <button class="sidebar-r-btn" data-rid="${r.id}" onclick="App.filterByRetailer('${r.id}')">
          <span class="r-dot" style="background:${r.color}"></span> ${r.name}
        </button>
      `).join('')}
    `;
  },

  filterByRetailer(rid) {
    document.querySelectorAll('.sidebar-r-btn').forEach(b => b.classList.toggle('active', b.dataset.rid === rid));
    UICatalog.setRetailer(rid);
    if (!document.getElementById('view-catalog')?.classList.contains('active')) {
      this.navigateTo('catalog');
    }
  },

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
    const retailers = DB.getRetailers();

    const rows = [
      // Header
      ['EAN','Nombre','Marca','Tipo Paquete','Ancho cm','Alto cm','Prof cm','Peso g','Imagen URL','Fuente',
       ...retailers.flatMap(r => [`${r.name}_ID`,`${r.name}_Nombre`,`${r.name}_Categoria`,`${r.name}_Stock`])
      ]
    ];

    products.forEach(p => {
      const row = [
        p.ean, p.name||'', p.brand||'', p.packageType||'',
        p.width_cm||'', p.height_cm||'', p.depth_cm||'', p.weight_g||'',
        p.imageUrl||'', p.dataSource||''
      ];
      retailers.forEach(r => {
        const rd = p.retailers?.[r.id];
        if (rd) {
          row.push(rd.customerId||'', rd.name||'', rd.category||'', rd.stockStatus?'SI':'NO');
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

  // ── init ──────────────────────────────────
  async init() {
    // Wait for Firebase download into memory
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
    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '');
      const validViews = ['catalog', 'import', 'retailers'];
      this.navigateTo(validViews.includes(hash) ? hash : 'catalog');
    });

    // Start on requested hash or default to catalog
    const startHash = window.location.hash.replace('#', '');
    const validViews = ['catalog', 'import', 'retailers'];
    this.navigateTo(validViews.includes(startHash) ? startHash : 'catalog');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
