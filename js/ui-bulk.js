'use strict';

const UIBulk = (() => {
  let _allProducts = [];
  let _filteredProducts = [];
  let _selectedEans = new Set();
  
  let _page = 1;
  const _pageSize = 50; // Dense table can show 50 at a time easily
  
  let _filterState = {
    search: '',
    errorFilter: 'all', // 'all', 'no-cat', 'no-brand', 'incomplete', 'no-img'
    retailerFilter: 'all'
  };

  let _retailerId = 'all';

  function render() {
    const view = document.getElementById('view-bulk');
    if (!view) return;

    _allProducts = DB.getProductsArray();
    _applyFilters();

    view.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Modo Edición y Auditoría</h2>
          <p class="view-subtitle">${_allProducts.length} SKUs en la base de datos</p>
        </div>
        <div class="header-actions">
          <button class="btn-primary" onclick="UIBulk.saveSelected()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Guardar cambios
          </button>
        </div>
      </div>

      <div class="bulk-layout">
        <!-- Main Table Area -->
        <div class="bulk-main">
          <!-- Top filters -->
          <div class="bulk-filters">
            <div class="bulk-quick-filters">
              <button class="bulk-qf-btn ${_filterState.errorFilter==='all'?'active':''}" onclick="UIBulk.setErrorFilter('all')">Todos</button>
              <button class="bulk-qf-btn ${_filterState.errorFilter==='no-cat'?'active':''}" onclick="UIBulk.setErrorFilter('no-cat')">Sin Categoría</button>
              <button class="bulk-qf-btn ${_filterState.errorFilter==='no-brand'?'active':''}" onclick="UIBulk.setErrorFilter('no-brand')">Sin Marca</button>
              <button class="bulk-qf-btn ${_filterState.errorFilter==='incomplete'?'active':''}" onclick="UIBulk.setErrorFilter('incomplete')">Incompletos (< 50%)</button>
              <button class="bulk-qf-btn ${_filterState.errorFilter==='no-img'?'active':''}" onclick="UIBulk.setErrorFilter('no-img')">Sin Imagen</button>
            </div>
            <div class="bulk-search">
              <input type="text" class="form-input" id="bulk-search-inp" placeholder="Buscar por nombre o EAN..." value="${_filterState.search}" oninput="UIBulk.setSearch(this.value)">
            </div>
          </div>

          <!-- The Table -->
          <div class="bulk-table-container">
            ${_renderTable()}
          </div>
          
          <!-- Pagination -->
          ${_renderPagination()}
        </div>

        <!-- Right Panel: Batch Actions -->
        <div class="bulk-side-panel">
          <div class="bulk-panel-header">
            <h3>Acciones Masivas</h3>
            <span class="bulk-sel-count">${_selectedEans.size} seleccionados</span>
          </div>
          <div class="bulk-panel-body">
            
            <p class="bulk-hint">Aplica cambios a los ${_selectedEans.size} productos seleccionados simultáneamente.</p>

            <div class="form-group">
              <label>Marca</label>
              <input type="text" id="bulk-batch-brand" class="form-input" placeholder="Nueva marca (dejar vacío para ignorar)">
            </div>
            
            <div class="form-group">
              <label>Categoría Maestra</label>
              <select id="bulk-batch-cat" class="form-select">
                <option value="">-- No modificar --</option>
                ${window.CATEGORIES ? window.CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('') : ''}
              </select>
            </div>

            <div class="form-group">
              <label>Tipo de Empaque</label>
              <select id="bulk-batch-pkg" class="form-select">
                <option value="">-- No modificar --</option>
                ${window.PACKAGE_TYPES ? window.PACKAGE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('') : ''}
              </select>
            </div>

            <button class="btn-primary" style="width:100%" onclick="UIBulk.applyBatchPanel()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
              Aplicar a selección
            </button>

            <hr style="margin:20px 0; border:none; border-top:1px solid var(--border)">

            <h4>Buscar y Reemplazar</h4>
            <p class="bulk-hint" style="margin-bottom:12px">Busca y reemplaza texto en los Nombres de los productos seleccionados.</p>
            
            <div class="form-group">
              <input type="text" id="bulk-fr-find" class="form-input" placeholder="Buscar texto (ej. 'grs.')">
            </div>
            <div class="form-group">
              <input type="text" id="bulk-fr-replace" class="form-input" placeholder="Reemplazar con (ej. 'g')">
            </div>
            <button class="btn-secondary" style="width:100%" onclick="UIBulk.applyFindReplace()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
              Reemplazar en selección
            </button>

            <hr style="margin:20px 0; border:none; border-top:1px solid var(--border)">
            <button class="btn-danger-sm" style="width:100%" onclick="UIBulk.deleteSelected()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
              Eliminar seleccionados
            </button>
          </div>
        </div>
      </div>
    `;
    
    _attachEvents();
  }

  function _renderTable() {
    const start = (_page - 1) * _pageSize;
    const items = _filteredProducts.slice(start, start + _pageSize);

    if (items.length === 0) {
      return `<div class="empty-state" style="padding:40px;text-align:center;color:var(--text-muted)">No hay resultados para estos filtros.</div>`;
    }

    const allSelectedInPage = items.length > 0 && items.every(p => _selectedEans.has(p.ean));

    return `
      <table class="bulk-table">
        <thead>
          <tr>
            <th width="40"><input type="checkbox" id="bulk-sel-page" ${allSelectedInPage ? 'checked' : ''} onclick="UIBulk.togglePageSelection(this.checked)"></th>
            <th width="60">Img</th>
            <th width="120">EAN</th>
            <th>Nombre del Producto</th>
            <th width="140">Marca</th>
            <th width="160">Categoría</th>
            <th width="100">Completitud</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(p => `
            <tr class="${_selectedEans.has(p.ean) ? 'selected' : ''}">
              <td><input type="checkbox" class="bulk-sel-cb" data-ean="${p.ean}" ${Math.random() /* shift+click logic handled by js */} ${_selectedEans.has(p.ean) ? 'checked' : ''}></td>
              <td>
                <div class="bulk-img-cell" style="background-image:url('${p.imageUrl || 'logo.png'}')"></div>
              </td>
              <td class="td-ean">${p.ean}</td>
              <td><input type="text" class="bulk-inline-inp" data-ean="${p.ean}" data-field="name" value="${p.name || ''}"></td>
              <td><input type="text" class="bulk-inline-inp" data-ean="${p.ean}" data-field="brand" value="${p.brand || ''}"></td>
              <td>
                <select class="bulk-inline-sel" data-ean="${p.ean}" data-field="category">
                  <option value="">Seleccionar...</option>
                  ${window.CATEGORIES ? window.CATEGORIES.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('') : ''}
                  ${p.category && !window.CATEGORIES.includes(p.category) ? `<option value="${p.category}" selected>${p.category}</option>` : ''}
                </select>
              </td>
              <td>
                <div class="bulk-score-bar">
                  <div class="bulk-score-fill" style="width:${DB.computeCompleteness(p)}%; background:${DB.computeCompleteness(p)<50?'var(--danger)':'var(--success)'}"></div>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  function _renderPagination() {
    const totalPages = Math.ceil(_filteredProducts.length / _pageSize);
    if (totalPages <= 1) return '';

    return `
      <div class="pagination">
        <span class="page-info">${_filteredProducts.length} resultados &middot; Página ${_page} de ${totalPages}</span>
        <div class="page-controls">
          <button class="page-btn" ${_page === 1 ? 'disabled' : ''} onclick="UIBulk.setPage(${_page - 1})">Anterior</button>
          <button class="page-btn" ${_page === totalPages ? 'disabled' : ''} onclick="UIBulk.setPage(${_page + 1})">Siguiente</button>
        </div>
      </div>
    `;
  }

  let _lastCheckedCheckbox = null;

  function _attachEvents() {
    // Inline edits saving
    document.querySelectorAll('.bulk-inline-inp, .bulk-inline-sel').forEach(el => {
      el.addEventListener('change', (e) => {
        const ean = e.target.dataset.ean;
        const field = e.target.dataset.field;
        const val = e.target.value;
        const prod = DB.getProduct(ean);
        if (prod) {
          prod[field] = val;
          // Note: We don't save immediately to Supabase to avoid spam. We keep it in memory.
          // User clicks "Guardar cambios" to save the whole _allProducts or modified ones.
          // But actually DB.saveProduct saves locally and to SB. Let's buffer it.
          // Actually, saving individually on change is fine for small edits, but for bulk, 
          // we should perhaps collect them. We'll use DB.saveProduct(prod) which handles chunking soon? No, saveProduct is singular.
          // Let's just update memory, and user has to hit "Guardar Cambios".
          DB.saveProduct(prod); // Actually DB.saveProduct does call Supabase upsert.
        }
      });
    });

    // Checkbox selection with Shift+Click support
    document.querySelectorAll('.bulk-sel-cb').forEach(cb => {
      cb.addEventListener('click', (e) => {
        const ean = e.target.dataset.ean;
        
        if (e.shiftKey && _lastCheckedCheckbox) {
          // Find bounds
          const cbs = Array.from(document.querySelectorAll('.bulk-sel-cb'));
          const start = cbs.indexOf(_lastCheckedCheckbox);
          const end = cbs.indexOf(e.target);
          const slice = cbs.slice(Math.min(start, end), Math.max(start, end) + 1);
          
          slice.forEach(box => {
            box.checked = e.target.checked;
            if (box.checked) _selectedEans.add(box.dataset.ean);
            else _selectedEans.delete(box.dataset.ean);
          });
        } else {
          if (e.target.checked) _selectedEans.add(ean);
          else _selectedEans.delete(ean);
        }
        
        _lastCheckedCheckbox = e.target;
        render(); // Re-render to update the side panel counts and states
      });
    });
  }

  function _applyFilters() {
    _filteredProducts = _allProducts.filter(p => {
      // search
      const q = _filterState.search.toLowerCase();
      if (q && !(p.name?.toLowerCase().includes(q) || p.ean.includes(q) || p.brand?.toLowerCase().includes(q))) {
        return false;
      }
      
      // errors
      if (_filterState.errorFilter === 'no-cat' && p.category && p.category !== 'General') return false;
      if (_filterState.errorFilter === 'no-brand' && p.brand && p.brand !== 'N/A') return false;
      if (_filterState.errorFilter === 'incomplete' && DB.computeCompleteness(p) >= 50) return false;
      if (_filterState.errorFilter === 'no-img' && p.imageUrl && p.imageUrl.length > 5) return false;

      // retailer
      if (_retailerId !== 'all') {
        if (!p.retailers || !p.retailers[_retailerId]) return false;
      }

      return true;
    });

    // Handle page bounds
    const totalPages = Math.ceil(_filteredProducts.length / _pageSize);
    if (_page > totalPages && totalPages > 0) _page = totalPages;
    if (_page < 1) _page = 1;
  }

  // ── Public API ────────────────────────────
  return {
    render,
    setRetailer(rid) {
      _retailerId = rid;
      _page = 1;
      _selectedEans.clear();
      if (document.getElementById('view-bulk')?.classList.contains('active')) render();
    },
    setPage(p) {
      _page = p;
      render();
    },
    setSearch(q) {
      _filterState.search = q;
      _page = 1;
      let timer; clearTimeout(timer);
      timer = setTimeout(() => render(), 300);
    },
    setErrorFilter(f) {
      _filterState.errorFilter = f;
      _page = 1;
      _selectedEans.clear();
      render();
    },
    togglePageSelection(checked) {
      const start = (_page - 1) * _pageSize;
      const items = _filteredProducts.slice(start, start + _pageSize);
      items.forEach(p => {
        if (checked) _selectedEans.add(p.ean);
        else _selectedEans.delete(p.ean);
      });
      render();
    },
    applyBatchPanel() {
      if (_selectedEans.size === 0) return;
      const brand = document.getElementById('bulk-batch-brand').value.trim();
      const cat = document.getElementById('bulk-batch-cat').value;
      const pkg = document.getElementById('bulk-batch-pkg').value;
      
      let modified = 0;
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (p) {
          let changed = false;
          if (brand) { p.brand = brand; changed = true; }
          if (cat) { p.category = cat; changed = true; }
          if (pkg) { p.packageType = pkg; changed = true; }
          
          if (changed) {
            prodsToSave.push(p);
            modified++;
          }
        }
      });

      if (modified > 0) {
        DB.saveProducts(prodsToSave);
        if (App) App.showToast(`${modified} productos actualizados`, 'success');
        _selectedEans.clear();
        render();
      }
    },
    applyFindReplace() {
      if (_selectedEans.size === 0) return;
      const findText = document.getElementById('bulk-fr-find').value;
      const replaceText = document.getElementById('bulk-fr-replace').value;
      
      if (!findText) {
        if (App) App.showToast('Debe ingresar un texto a buscar', 'warning');
        return;
      }

      let modified = 0;
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (p && p.name && p.name.includes(findText)) {
          // Replace all occurrences using global regex safely
          const regex = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          p.name = p.name.replace(regex, replaceText);
          prodsToSave.push(p);
          modified++;
        }
      });

      if (modified > 0) {
        DB.saveProducts(prodsToSave);
        if (App) App.showToast(`${modified} nombres actualizados`, 'success');
        render();
      } else {
        if (App) App.showToast('No se encontró el texto en los nombres seleccionados', 'info');
      }
    },
    deleteSelected() {
      if (_selectedEans.size === 0) return;
      if (confirm(`¿Estás seguro de eliminar permanentemente ${_selectedEans.size} productos?`)) {
        DB.deleteProducts(Array.from(_selectedEans));
        if (App) App.showToast('Productos eliminados', 'success');
        _selectedEans.clear();
        render();
      }
    },
    saveSelected() {
      // Since inline edit saves directly to DB.saveProduct, this button is mostly a psychological reassurance,
      // but we could use it to force a full refresh or flush if we buffer.
      // For now, just trigger a refresh and toast.
      DB.fetchProducts().then(() => {
        if (App) App.showToast('Base de datos sincronizada', 'success');
        render();
      });
    }
  };
})();
