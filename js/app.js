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
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.textContent = icons[type] || 'ℹ';
    const message = document.createElement('span');
    message.textContent = String(msg);
    t.append(icon, message);
    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add('visible'));
    setTimeout(() => {
      t.classList.remove('visible');
      setTimeout(() => t.remove(), 350);
    }, type === 'error' ? 5000 : 3000);
  },

  // Data refresh callback (used by DB after saves)
  refreshData() {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'catalog' && typeof UICatalog !== 'undefined') UICatalog.render();
  },

  // ── routing ────────────────────────────────
  navigateTo(view) {
    if (view === 'retailers') view = 'holdings';
    if (view === 'staging' || view === 'pipeline' || view === 'auditoria') view = 'revision';

    if (window.location.hash !== `#${view}`) {
      window.location.hash = view;
    }
    
    // hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(`view-${view}`);
    if (target) {
      target.classList.add('active');
    } else {
      console.warn(`No se encontró el contenedor DOM #view-${view}`);
    }

    // update nav items
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));

    // render appropriate view safely
    try {
      if (view === 'catalog')        UICatalog.render();
      else if (view === 'bulk')      UIBulk.render();
      else if (view === 'import')    UIImport.render();
      else if (view === 'holdings')  { if (typeof UIHoldings !== 'undefined') UIHoldings.render(); else if (typeof UIRetailers !== 'undefined') UIRetailers.render(); }
      else if (view === 'levantamiento') UILevantamiento.render();
      else if (view === 'revision')  UIStaging.render();
      else if (view === 'avistamientos') UIAvistamientos.render();
      else if (view === 'dashboard') UIDashboard.render();
    } catch (err) {
      console.error(`Error al renderizar la vista '${view}':`, err);
      this.showToast(`Error al cargar la vista ${view}`, 'error');
    }
  },

  openSheet(ean) {
    UISheet.open(ean);
  },

  // ── sidebar ───────────────────────────────
  renderSidebar() {
    const holdings = DB.getHoldings();
    const el = document.getElementById('sidebar-holding-filters');
    if (!el) return;

    el.replaceChildren();
    const addButton = (id, name, color, active = false) => {
      const button = document.createElement('button');
      button.className = `sidebar-r-btn${active ? ' active' : ''}`;
      button.dataset.hid = id;
      const dot = document.createElement('span');
      dot.className = 'r-dot';
      dot.style.background = color;
      button.append(dot, document.createTextNode(` ${name}`));
      button.addEventListener('click', () => this.filterByHolding(id));
      el.appendChild(button);
    };
    addButton('all', 'Todos', 'var(--text-muted)', true);
    holdings.forEach(h => addButton(String(h.id), String(h.name), /^#[0-9a-f]{6}$/i.test(h.color) ? h.color : '#4F6EF7'));
  },

  filterByHolding(hid) {
    document.querySelectorAll('.sidebar-r-btn').forEach(b => b.classList.toggle('active', b.dataset.hid === hid));
    UICatalog.setRetailer(hid);
    if (!document.getElementById('view-catalog')?.classList.contains('active')) {
      this.navigateTo('catalog');
    }
  },

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

  // ── server status ──────────────────────────
  async checkServerStatus() {
    const dot = document.getElementById('status-dot');
    const lbl = document.getElementById('status-label');
    try {
      const res = await fetch('/api/holdings', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        if (dot) dot.className = 'status-dot online';
        if (lbl) lbl.textContent = 'Servidor local activo';
      } else {
        if (dot) dot.className = 'status-dot offline';
        if (lbl) lbl.textContent = 'Servidor inaccesible';
      }
    } catch {
      if (dot) dot.className = 'status-dot offline';
      if (lbl) lbl.textContent = 'Modo offline (LocalStorage)';
    }
  },

  exportBackup() {
    const data = DB.exportBackup();
    const str = JSON.stringify(data, null, 2);
    const blob = new Blob([str], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `smart_shelf_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.showToast('Backup descargado exitosamente', 'success');
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
        const json = JSON.parse(e.target.result);
        if (DB.importBackup(json)) {
          this.showToast('Backup restaurado correctamente', 'success');
          this.navigateTo('catalog');
        } else {
          this.showToast('El archivo de backup no tiene un formato válido', 'error');
        }
      } catch (err) {
        this.showToast(`Error al leer archivo JSON: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
  },

  // ── init ──────────────────────────────────
  async init() {
    const loader = document.getElementById('global-loader') || document.getElementById('app-loader');
    const hideLoader = () => {
      if (loader) {
        loader.style.opacity = '0';
        loader.style.transition = 'opacity 0.4s ease';
        setTimeout(() => loader.remove(), 400);
      }
    };

    try {
      const initRes = await DB.init() || {};
      const sources = initRes.sources || {};
      const counts = initRes.counts || { products: (DB.getProductsArray() || []).length };

      if (sources.catalog === 'server') {
        this.showToast(`Catálogo cargado desde Servidor Local (${counts.products} SKUs)`, 'success');
      } else {
        this.showToast(`Catálogo cargado desde caché local (${counts.products} SKUs)`, 'info');
      }
    } catch (err) {
      console.error('Error durante la inicialización de la base de datos:', err);
    } finally {
      hideLoader();
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

    // Reload catalog button
    document.getElementById('reset-btn')?.addEventListener('click', () => {
      DB.reloadCatalog().then(() => {
        this.navigateTo('catalog');
        this.showToast('Catálogo recargado desde la fuente disponible', 'info');
      });
    });

    // Hash tracking for F5 refreshes
    const validViews = ['dashboard', 'catalog', 'import', 'holdings', 'bulk', 'levantamiento', 'revision', 'auditoria', 'staging', 'avistamientos'];
    window.addEventListener('hashchange', () => {
      let hash = window.location.hash.replace('#', '');
      if (hash === 'retailers') hash = 'holdings';
      this.navigateTo(validViews.includes(hash) ? hash : 'dashboard');
    });

    // Start on requested hash or default to dashboard
    let startHash = window.location.hash.replace('#', '');
    if (startHash === 'retailers') startHash = 'holdings';
    this.navigateTo(validViews.includes(startHash) ? startHash : 'dashboard');

    this.checkServerStatus();
    setInterval(() => this.checkServerStatus(), 30000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
