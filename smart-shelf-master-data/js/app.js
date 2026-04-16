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

  // ── routing ────────────────────────────────
  navigateTo(view) {
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
    // If we're not on the catalog view, navigate there
    if (!document.getElementById('view-catalog')?.classList.contains('active')) {
      this.navigateTo('catalog');
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
  init() {
    DB.init();
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

    // Start on catalog
    this.navigateTo('catalog');

    // Auto-enrich in background if any product is missing an image
    const needsEnrich = DB.getProductsArray().some(p => !p.imageUrl);
    if (needsEnrich) {
      // Small delay so the catalog renders first
      setTimeout(() => UICatalog.enrichAll(true), 800);
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
