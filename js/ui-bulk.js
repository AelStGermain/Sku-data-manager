'use strict';

const UIBulk = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let _allProducts = [];
  let _filteredProducts = [];
  let _selectedEans = new Set();
  let _selectAllFiltered = false;
  
  let _page = 1;
  const _pageSize = 50;
  
  let _filterState = {
    search: '',
    errorFilter: 'all', // 'all', 'no-cat', 'no-brand', 'incomplete', 'no-img'
    retailerFilter: 'all'
  };

  let _retailerId = 'all';
  let _lastCheckedCheckbox = null;
  let _activeCategoryTarget = 'universal'; // 'universal' or holding id
  let _searchTimer = null;

  function render() {
    const view = document.getElementById('view-bulk');
    if (!view) return;

    // Preservar la posición del scroll antes de re-renderizar
    const mainContent = document.querySelector('.main-content');
    const mainScrollTop = mainContent ? mainContent.scrollTop : 0;
    const tableContainer = document.querySelector('.bulk-table-container');
    const tableScrollTop = tableContainer ? tableContainer.scrollTop : 0;

    _allProducts = DB.getProductsArray();
    _applyFilters();

    const undoOp = DB.getUndo();

    view.innerHTML = `
      <div class="view-header">
        <div>
          <h2 class="view-title">Modo Edición, Auditoría y Seguridad Masiva</h2>
          <p class="view-subtitle" id="bulk-header-subtitle">${_allProducts.length} SKUs en catálogo &middot; ${_filteredProducts.length} filtrados &middot; ${_selectedEans.size} seleccionados</p>
        </div>
        <div class="header-actions">
          ${undoOp ? `
            <button class="btn-warning" onclick="UIBulk.triggerUndo()" style="margin-right: 8px;" title="Revertir última acción">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
              </svg>
              Deshacer: ${undoOp.label}
            </button>
          ` : ''}
          <button class="btn-primary" onclick="UIBulk.saveTableChanges()" style="margin-right: 8px;" id="btn-save-table-changes" title="Guardar todos los cambios realizados en las celdas de la tabla">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            💾 Guardar Cambios de Tabla
          </button>
          <button class="btn-outline" id="btn-bulk-export" onclick="UIBulk.exportExcel()" style="margin-right: 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar Excel ${_selectedEans.size > 0 ? `(${_selectedEans.size} sel.)` : `(${_filteredProducts.length})`}
          </button>
          <button class="btn-primary" onclick="UIBulk.saveSelected()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            Sincronizar Base de Datos
          </button>
        </div>
      </div>

      <div class="stats-bar" style="margin-bottom: 16px;">
        <div class="stat-card accent" style="cursor:pointer" onclick="UIBulk.setErrorFilter('all')">
          <span class="stat-v">${_allProducts.length}</span>
          <span class="stat-l">Total SKUs</span>
        </div>
        <div class="stat-card warn" style="cursor:pointer" onclick="UIBulk.setErrorFilter('no-cat')" title="Filtrar sin categoría universal">
          <span class="stat-v">${_allProducts.filter(p => _isNoUniversalCategory(p)).length}</span>
          <span class="stat-l">Sin Categoría</span>
        </div>
        <div class="stat-card warn" style="cursor:pointer" onclick="UIBulk.setErrorFilter('no-brand')" title="Filtrar sin marca">
          <span class="stat-v">${_allProducts.filter(p => _isNoBrand(p)).length}</span>
          <span class="stat-l">Sin Marca</span>
        </div>
        <div class="stat-card danger" style="cursor:pointer" onclick="UIBulk.setErrorFilter('incomplete')" title="Filtrar incompletos">
          <span class="stat-v">${_allProducts.filter(p => DB.computeCompleteness(p) < 50).length}</span>
          <span class="stat-l">Incompletos (< 50%)</span>
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

            <div style="display:flex; gap:8px; align-items:center;">
              <button class="btn-secondary-sm" style="font-size:12px; padding:6px 12px; font-weight:600; display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--border);" onclick="UICategoryManager.openModal()" title="Abrir Gestor de Jerarquía de Categorías Vispera">
                🗂️ Jerarquía de Categorías
              </button>
              <select class="form-select" style="width:160px; padding:6px 10px; font-size:12px;" onchange="UIBulk.setRetailer(this.value)">
                <option value="all" ${_retailerId==='all'?'selected':''}>Todos los Holdings</option>
                ${DB.getHoldings().map(h => `<option value="${h.id}" ${_retailerId===h.id?'selected':''}>${h.name}</option>`).join('')}
              </select>

              <div class="bulk-search">
                <input type="text" class="form-input" id="bulk-search-inp" placeholder="Buscar por nombre, EAN o marca..." value="${_filterState.search}" oninput="UIBulk.setSearch(this.value)">
              </div>
            </div>
          </div>

          <!-- Selection Banner (Multi-page) -->
          <div id="bulk-selection-banner-wrap">
            ${_renderSelectionBanner()}
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
            <div>
              <h3>Acciones Masivas</h3>
              <p class="bulk-hint" style="margin:2px 0 0 0;">Configura y aplica cambios seguros</p>
            </div>
            <span class="bulk-sel-count">${_selectedEans.size} seleccionados</span>
          </div>

          <div class="bulk-panel-body">
            
            <div style="display:flex; gap:8px;">
              <button class="btn-outline-sm" style="flex:1; font-size:11px;" onclick="UIBulk.selectAllFiltered()">Seleccionar Todo (${_filteredProducts.length})</button>
              <button class="btn-outline-sm" style="flex:1; font-size:11px;" onclick="UIBulk.clearSelection()">Limpiar Selección</button>
            </div>

            <!-- Accordion 1: Atributos Básicos -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>🏷️ Marca, Empaque y Estado</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <div class="form-group">
                  <label>Nueva Marca</label>
                  <input type="text" id="bulk-batch-brand" class="form-input" placeholder="Ej. Soprole (dejar vacío para no cambiar)">
                </div>

                <div class="form-group">
                  <label>Tipo de Empaque</label>
                  <select id="bulk-batch-pkg" class="form-select">
                    <option value="">-- No modificar --</option>
                    ${window.PACKAGE_TYPES ? window.PACKAGE_TYPES.map(c => `<option value="${c.value}">${c.label}</option>`).join('') : ''}
                  </select>
                </div>

                <div class="form-group">
                  <label>Estado del SKU</label>
                  <select id="bulk-batch-status" class="form-select">
                    <option value="">-- No modificar --</option>
                    ${window.SKU_STATUSES ? window.SKU_STATUSES.map(s => `<option value="${s.value}">${s.label}</option>`).join('') : ''}
                  </select>
                </div>

                <button class="btn-primary" style="width:100%" onclick="UIBulk.applyBatchPanel()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
                  Aplicar Atributos
                </button>
              </div>
            </div>

            <!-- Accordion 2: Gestión Avanzada de Categorías -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>🗂️ Categorías (Universales y Holding)</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <div class="form-group">
                  <label>Tipo de Categoría</label>
                  <select id="bulk-cat-target-type" class="form-select" onchange="UIBulk.onCatTargetTypeChange(this.value)">
                    <option value="universal">Categoría Universal (Vispera Master)</option>
                    ${DB.getHoldings().map(h => `<option value="holding_${h.id}">Categoría Holding: ${h.name}</option>`).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label>Modo de Edición</label>
                  <select id="bulk-cat-mode" class="form-select">
                    <option value="replace">Reemplazar categorías</option>
                    <option value="add">Añadir a categorías existentes (Multi-Cat)</option>
                    <option value="remove">Remover categoría específica</option>
                    <option value="clear">Vaciar todas las categorías</option>
                  </select>
                </div>

                <div class="form-group" id="bulk-cat-select-group">
                  <label>Categoría Objetivo</label>
                  <select id="bulk-batch-cat" class="form-select">
                    <option value="">-- Seleccionar Categoría --</option>
                    ${window.UNIVERSAL_CATEGORIES ? window.UNIVERSAL_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('') : ''}
                  </select>
                </div>

                <button class="btn-primary" style="width:100%" onclick="UIBulk.applyCategoryBatch()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
                  Aplicar Cambio de Categoría
                </button>
              </div>
            </div>

            <!-- Accordion 3: Buscar y Reemplazar -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>🔍 Buscar y Reemplazar en Nombres</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <div class="form-group">
                  <label>Buscar Texto</label>
                  <input type="text" id="bulk-fr-find" class="form-input" placeholder="Ej. 'grs.' o 'Ltr'">
                </div>
                <div class="form-group">
                  <label>Reemplazar con</label>
                  <input type="text" id="bulk-fr-replace" class="form-input" placeholder="Ej. 'g' o 'L'">
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; font-size:11px; margin-bottom:6px;">
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" id="bulk-fr-match-case"> Coincidir mayúsculas / minúsculas
                  </label>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" id="bulk-fr-whole-word"> Solo palabras completas
                  </label>
                </div>
                <button class="btn-secondary" style="width:100%" onclick="UIBulk.applyFindReplace()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
                  Reemplazar Texto
                </button>
              </div>
            </div>

            <!-- Accordion 4: Normalización de Nombres -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>✨ Normalización de Nombres</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <p class="bulk-hint">Estandariza el formato del texto de los SKUs seleccionados.</p>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
                  <button class="btn-outline-sm" onclick="UIBulk.applyNormalization('uppercase')" ${_selectedEans.size === 0 ? 'disabled' : ''}>MAYÚSCULAS</button>
                  <button class="btn-outline-sm" onclick="UIBulk.applyNormalization('lowercase')" ${_selectedEans.size === 0 ? 'disabled' : ''}>minúsculas</button>
                  <button class="btn-outline-sm" onclick="UIBulk.applyNormalization('titlecase')" ${_selectedEans.size === 0 ? 'disabled' : ''}>Nombre Propio</button>
                  <button class="btn-outline-sm" onclick="UIBulk.applyNormalization('trim')" ${_selectedEans.size === 0 ? 'disabled' : ''}>Limpiar Espacios</button>
                </div>
              </div>
            </div>

            <!-- Accordion 5: Asociación de Holdings -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>🏢 Asociar / Quitar de Holding</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <div class="form-group">
                  <label>Holding Objetivo</label>
                  <select id="bulk-batch-holding" class="form-select">
                    <option value="">-- Seleccionar Holding --</option>
                    ${DB.getHoldings().map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
                  </select>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <button class="btn-secondary" style="width:100%" onclick="UIBulk.applyBulkHolding('assign')" ${_selectedEans.size === 0 ? 'disabled' : ''}>
                    Asignar a Holding
                  </button>
                  <button class="btn-danger-sm" style="width:100%" onclick="UIBulk.applyBulkHolding('unassign')" ${_selectedEans.size === 0 ? 'disabled' : ''}>
                    Quitar / Desasociar de Holding
                  </button>
                </div>
              </div>
            </div>

            <!-- Accordion 6: Descontinuación Masiva de Holding -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>🚫 Descontinuar de Holding</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <p class="bulk-hint">Marca SKUs como descontinuados en un holding. Se preserva el Customer ID y los datos históricos.</p>
                <div class="form-group">
                  <label>Holding Objetivo</label>
                  <select id="bulk-disc-holding" class="form-select">
                    <option value="">-- Seleccionar Holding --</option>
                    ${DB.getHoldings().map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
                  </select>
                </div>

                <div class="form-group">
                  <label>Modo de Descontinuación</label>
                  <select id="bulk-disc-mode" class="form-select" onchange="UIBulk.toggleDiscBrandFilter(this.value)">
                    <option value="selected">Productos seleccionados (${_selectedEans.size})</option>
                    <option value="brand">Todos los SKUs de una marca</option>
                  </select>
                </div>

                <div class="form-group" id="bulk-disc-brand-group" style="display:none;">
                  <label>Marca a descontinuar</label>
                  <select id="bulk-disc-brand" class="form-select">
                    <option value="">-- Seleccionar Marca --</option>
                    ${[...new Set(DB.getProductsArray().map(p => p.brand).filter(Boolean))].sort()
                      .map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}
                  </select>
                </div>

                <button class="btn-danger-sm" style="width:100%; padding:10px;" onclick="UIBulk.applyBulkDiscontinue()">
                  🚫 Descontinuar de Holding
                </button>
              </div>
            </div>

            <!-- Accordion 7: Gestión de Categorías Universales -->
            <div class="bulk-accordion-item">
              <div class="bulk-accordion-header" onclick="UIBulk.toggleAccordion(this)">
                <span>⚙️ Gestión Categorías Universales</span>
                <span>▼</span>
              </div>
              <div class="bulk-accordion-body">
                <p class="bulk-hint">Administra las categorías universales Vispera del sistema. Agregar o eliminar afecta el catálogo completo.</p>
                <div style="max-height:180px; overflow-y:auto; margin-bottom:10px; border:1px solid var(--border); border-radius:8px; padding:6px;">
                  ${(window.UNIVERSAL_CATEGORIES || []).map(cat => {
                    const count = DB.getProductsArray().filter(p => {
                      const uCat = Array.isArray(p.universalCategory) ? p.universalCategory : (p.universalCategory ? [p.universalCategory] : []);
                      return uCat.includes(cat);
                    }).length;
                    return `<div style="display:flex; justify-content:space-between; align-items:center; padding:4px 6px; border-bottom:1px solid var(--border);">
                      <span style="font-size:12px; font-weight:500;">${esc(cat)} <span style="color:var(--text-muted); font-weight:400;">(${count})</span></span>
                      <button class="btn-mini" style="color:var(--danger); font-size:10px; padding:2px 6px;" onclick="UIBulk.removeUniversalCategory('${esc(cat)}')" title="Eliminar categoría">✕</button>
                    </div>`;
                  }).join('')}
                </div>
                <div style="display:flex; gap:6px;">
                  <input type="text" id="bulk-new-ucat" class="form-input" placeholder="Nueva categoría..." style="flex:1; font-size:12px;">
                  <button class="btn-primary btn-mini" onclick="UIBulk.addUniversalCategory()" style="white-space:nowrap;">+ Agregar</button>
                </div>
              </div>
            </div>

            <hr style="margin:10px 0; border:none; border-top:1px solid var(--border)">
            
            <button class="btn-danger-sm" style="width:100%; padding:10px;" onclick="UIBulk.deleteSelected()" ${_selectedEans.size === 0 ? 'disabled' : ''}>
              🗑️ Eliminar SKUs Seleccionados (${_selectedEans.size})
            </button>
          </div>
        </div>
      </div>

      <!-- Container for safety modal dynamically injected -->
      <div id="bulk-safety-modal-container"></div>
    `;
    
    _attachEvents();
  }

  function toggleAccordion(headerEl) {
    if (!headerEl) return;
    const item = headerEl.closest('.bulk-accordion-item');
    if (item) {
      item.classList.toggle('open');
    }
  }

  function _attachEvents() {
    const firstItem = document.querySelector('.bulk-accordion-item');
    if (firstItem && !document.querySelector('.bulk-accordion-item.open')) {
      firstItem.classList.add('open');
    }
  }

  function _renderSelectionBanner() {
    const start = (_page - 1) * _pageSize;
    const pageItems = _filteredProducts.slice(start, start + _pageSize);
    const countInPage = pageItems.filter(p => _selectedEans.has(p.ean)).length;

    if (countInPage === 0 && !_selectAllFiltered && _selectedEans.size === 0) return '';

    if (_selectAllFiltered) {
      return `
        <div class="bulk-select-banner">
          <span class="bulk-select-banner-text">✓ Todos los <strong>${_selectedEans.size} SKUs filtrados</strong> están seleccionados.</span>
          <button class="bulk-select-banner-action" onclick="UIBulk.clearSelection()">Limpiar Selección</button>
        </div>
      `;
    }

    if (countInPage > 0 && _filteredProducts.length > pageItems.length) {
      return `
        <div class="bulk-select-banner">
          <span class="bulk-select-banner-text">Tienes <strong>${countInPage} SKUs</strong> seleccionados en esta página.</span>
          <button class="bulk-select-banner-action" onclick="UIBulk.selectAllFiltered()">
            Seleccionar los ${_filteredProducts.length} SKUs filtrados en total
          </button>
        </div>
      `;
    }

    return '';
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
            <th width="50">Img</th>
            <th width="120">EAN</th>
            <th>Nombre del Producto</th>
            <th width="140">Marca</th>
            <th width="180">Categoría Vispera</th>
            <th width="140">Holdings</th>
            <th width="90">Completitud</th>
            <th width="75" style="text-align:center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((p, idx) => {
            const isSel = _selectedEans.has(p.ean);
            const prodCats = _getCategoryList(p);
            const currentUniversalCat = prodCats.length > 0 ? (DB.normalizeUniversalCategory ? DB.normalizeUniversalCategory(prodCats[0]) : prodCats[0]) : '';
            const holdingsList = p.holdings ? Object.keys(p.holdings) : [];
            const completeness = DB.computeCompleteness(p);

            return `
              <tr class="${isSel ? 'selected' : ''}" data-ean="${p.ean}">
                <td><input type="checkbox" class="bulk-sel-cb" data-ean="${p.ean}" ${isSel ? 'checked' : ''}></td>
                <td>
                  <div class="bulk-img-cell" style="background-image:url('${p.imageUrl || 'logo.png'}'); cursor:pointer;" onclick="App.openSheet('${p.ean}')" title="Ver Ficha Técnica"></div>
                </td>
                <td class="td-ean">
                  <button type="button" class="link-button mono" style="font-weight:600; text-decoration:underline;" onclick="App.openSheet('${p.ean}')" title="Ver Ficha Técnica de ${p.ean}">${p.ean}</button>
                </td>
                <td>
                  <div style="display:flex; align-items:center; gap:6px;">
                    <input type="text" class="bulk-inline-inp" data-ean="${p.ean}" data-field="name" value="${_escapeHtml(p.name || '')}">
                  </div>
                </td>
                <td><input type="text" class="bulk-inline-inp" data-ean="${p.ean}" data-field="brand" value="${_escapeHtml(p.brand || '')}"></td>
                <td>
                  <select class="bulk-inline-sel" data-ean="${p.ean}" data-field="category">
                    <option value="" ${!currentUniversalCat ? 'selected' : ''}>Seleccionar...</option>
                    ${window.UNIVERSAL_CATEGORIES ? window.UNIVERSAL_CATEGORIES.map(c => `<option value="${c}" ${c === currentUniversalCat ? 'selected' : ''}>${c}</option>`).join('') : ''}
                  </select>
                </td>
                <td>
                  <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    ${holdingsList.length > 0 ? holdingsList.map(h => `<span style="font-size:10px; background:var(--accent-dim); color:var(--accent); padding:2px 6px; border-radius:4px; text-transform:uppercase;">${h}</span>`).join('') : '<span style="font-size:11px; color:var(--text-muted)">Ninguno</span>'}
                  </div>
                </td>
                <td>
                  <div class="bulk-score-bar" title="${completeness}% completo">
                    <div class="bulk-score-fill" style="width:${completeness}%; background:${completeness < 50 ? 'var(--danger)' : 'var(--success)'}"></div>
                  </div>
                </td>
                <td style="text-align:center;">
                  <button type="button" class="btn-outline-sm btn-mini" onclick="App.openSheet('${p.ean}')" title="Ver Ficha Técnica completa">📄 Ficha</button>
                </td>
              </tr>
            `;
          }).join('')}
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

  function _updateSelectionUI() {
    // 1. Update header subtitle count
    const subtitle = document.getElementById('bulk-header-subtitle');
    if (subtitle) {
      subtitle.innerHTML = `${_allProducts.length} SKUs en catálogo &middot; ${_filteredProducts.length} filtrados &middot; ${_selectedEans.size} seleccionados`;
    }

    // 2. Update export button
    const exportBtn = document.getElementById('btn-bulk-export');
    if (exportBtn) {
      exportBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Exportar Excel ${_selectedEans.size > 0 ? `(${_selectedEans.size} sel.)` : `(${_filteredProducts.length})`}
      `;
    }

    // 3. Update side panel count badge
    const selCountLabel = document.querySelector('.bulk-sel-count');
    if (selCountLabel) selCountLabel.textContent = `${_selectedEans.size} seleccionados`;

    // 4. Update banner
    const bannerWrap = document.getElementById('bulk-selection-banner-wrap');
    if (bannerWrap) bannerWrap.innerHTML = _renderSelectionBanner();

    // 5. Update header checkbox
    const start = (_page - 1) * _pageSize;
    const pageItems = _filteredProducts.slice(start, start + _pageSize);
    const pageHeaderCb = document.getElementById('bulk-sel-page');
    if (pageHeaderCb) {
      pageHeaderCb.checked = pageItems.length > 0 && pageItems.every(p => _selectedEans.has(p.ean));
    }
  }

  function _attachEvents() {
    document.querySelectorAll('.bulk-inline-inp, .bulk-inline-sel').forEach(el => {
      el.addEventListener('change', (e) => {
        const ean = e.target.dataset.ean;
        const field = e.target.dataset.field;
        const val = e.target.value;
        const prod = DB.getProduct(ean);
        if (prod) {
          if (field === 'category') {
            prod.category = val ? [val] : [];
            prod.universalCategory = prod.category;
          } else {
            prod[field] = val;
          }
          DB.saveProduct(prod, true);
        }
      });
    });

    document.querySelectorAll('.bulk-sel-cb').forEach(cb => {
      cb.addEventListener('click', (e) => {
        const ean = e.target.dataset.ean;
        
        if (e.shiftKey && _lastCheckedCheckbox) {
          const cbs = Array.from(document.querySelectorAll('.bulk-sel-cb'));
          const start = cbs.indexOf(_lastCheckedCheckbox);
          const end = cbs.indexOf(e.target);
          const slice = cbs.slice(Math.min(start, end), Math.max(start, end) + 1);
          
          slice.forEach(box => {
            box.checked = e.target.checked;
            if (box.checked) _selectedEans.add(box.dataset.ean);
            else { _selectedEans.delete(box.dataset.ean); _selectAllFiltered = false; }
            const tr = box.closest('tr');
            if (tr) tr.classList.toggle('selected', box.checked);
          });
        } else {
          if (e.target.checked) _selectedEans.add(ean);
          else { _selectedEans.delete(ean); _selectAllFiltered = false; }
          const tr = cb.closest('tr');
          if (tr) tr.classList.toggle('selected', cb.checked);
        }
        
        _lastCheckedCheckbox = e.target;
        _updateSelectionUI();
      });
    });
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

  function _isNoBrand(p) {
    const b = String(p.brand || '').trim().toUpperCase();
    return !b || b === 'N/A' || b === 'INDEFINIDO' || b === 'SIN MARCA' || b === 'SELECCIONAR...';
  }

  function _isNoImage(p) {
    const img = String(p.imageUrl || '').trim();
    return !img || img.length < 5 || img.includes('logo.png');
  }

  function normalizeStr(s) {
    return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  }

  function _applyFilters() {
    _filteredProducts = _allProducts.filter(p => {
      const q = normalizeStr(_filterState.search);
      if (q) {
        const matchName     = normalizeStr(p.name).includes(q);
        const matchEan      = String(p.ean || '').includes(q);
        const matchBrand    = normalizeStr(p.brand).includes(q);
        const matchProducer = normalizeStr(p.producer).includes(q);
        const matchVispera  = normalizeStr(p.visperaId).includes(q);
        const matchHoldings = Object.values(p.holdings || p.retailers || {}).some(h => 
          normalizeStr(h.customerId || h.holdingInternalId || h.localProductName || h.name).includes(q)
        );
        if (!matchName && !matchEan && !matchBrand && !matchProducer && !matchVispera && !matchHoldings) {
          return false;
        }
      }
      
      if (_filterState.errorFilter === 'no-cat' && !_isNoUniversalCategory(p)) return false;
      if (_filterState.errorFilter === 'no-brand' && !_isNoBrand(p)) return false;
      if (_filterState.errorFilter === 'incomplete' && DB.computeCompleteness(p) >= 50) return false;
      if (_filterState.errorFilter === 'no-img' && !_isNoImage(p)) return false;

      if (_retailerId !== 'all') {
        if (!p.holdings || !p.holdings[_retailerId]) return false;
      }

      return true;
    });

    const totalPages = Math.ceil(_filteredProducts.length / _pageSize);
    if (_page > totalPages && totalPages > 0) _page = totalPages;
    if (_page < 1) _page = 1;
  }

  function _escapeHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Safety Confirmation Modal System ────────────────────────
  function _showSafetyModal({ title, badgeText, description, affectedItems, actionType = 'warning', requiresConfirmationKey = false, onConfirm }) {
    const container = document.getElementById('bulk-safety-modal-container');
    if (!container) return;

    const sampleItems = affectedItems.slice(0, 5);

    container.innerHTML = `
      <div class="bulk-modal-backdrop">
        <div class="bulk-safety-card">
          <div class="bulk-modal-header">
            <div class="bulk-modal-title">
              <span>${actionType === 'danger' ? '⚠️' : '🛡️'}</span>
              <span>${title}</span>
            </div>
            <span class="bulk-sel-count" style="${actionType==='danger'?'background:rgba(244,67,54,0.15);color:var(--danger)':''}">${badgeText}</span>
          </div>

          <div class="bulk-modal-body">
            <p>${description}</p>

            <div class="bulk-diff-preview">
              <div style="font-weight:700; margin-bottom:6px; color:var(--text-sec); font-size:11px; text-transform:uppercase;">
                Previsualización del cambio (${affectedItems.length} SKUs en total):
              </div>
              ${sampleItems.map(item => `
                <div class="bulk-diff-item">
                  <span class="bulk-diff-ean">EAN: ${item.ean} - ${_escapeHtml(item.name)}</span>
                  <div class="bulk-diff-change">
                    <span class="bulk-diff-old">${_escapeHtml(item.oldVal || 'Anterior')}</span>
                    <span class="bulk-diff-arrow">&rarr;</span>
                    <span class="bulk-diff-new">${_escapeHtml(item.newVal || 'Nuevo')}</span>
                  </div>
                </div>
              `).join('')}
              ${affectedItems.length > 5 ? `<div style="text-align:center; padding-top:6px; font-size:11px; color:var(--text-muted)">... y ${affectedItems.length - 5} productos más.</div>` : ''}
            </div>

            ${requiresConfirmationKey ? `
              <div class="bulk-confirm-input-wrap">
                <span class="bulk-confirm-input-label">Escribe "ELIMINAR" para habilitar la eliminación:</span>
                <input type="text" id="bulk-confirm-text-inp" class="form-input" placeholder="ELIMINAR" oninput="UIBulk.checkConfirmKey(this.value)">
              </div>
            ` : ''}
          </div>

          <div class="bulk-modal-footer">
            <button class="btn-outline" onclick="UIBulk.closeSafetyModal()">Cancelar</button>
            <button id="bulk-modal-confirm-btn" class="${actionType === 'danger' ? 'btn-danger-sm' : 'btn-primary'}" ${requiresConfirmationKey ? 'disabled' : ''} onclick="UIBulk.executeModalConfirm()">
              Confirmar y Aplicar
            </button>
          </div>
        </div>
      </div>
    `;

    window._pendingModalConfirm = onConfirm;
  }

  // ── Public API ────────────────────────────
  return {
    render,
    setRetailer(rid) {
      _retailerId = rid;
      _page = 1;
      _selectedEans.clear();
      _selectAllFiltered = false;
      render();
    },
    setPage(p) {
      _page = p;
      render();
    },
    setSearch(q) {
      _filterState.search = q;
      _page = 1;
      _selectAllFiltered = false;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        const activeId = document.activeElement ? document.activeElement.id : null;
        const selectionStart = document.activeElement && document.activeElement.selectionStart;
        render();
        if (activeId) {
          const el = document.getElementById(activeId);
          if (el) {
            el.focus();
            if (selectionStart !== null && el.setSelectionRange) {
              el.setSelectionRange(selectionStart, selectionStart);
            }
          }
        }
      }, 200);
    },
    setErrorFilter(f) {
      _filterState.errorFilter = f;
      _page = 1;
      _selectedEans.clear();
      _selectAllFiltered = false;
      render();
    },
    toggleAccordion(headerEl) {
      const body = headerEl.nextElementSibling;
      const arrow = headerEl.querySelector('span:last-child');
      if (body.style.display === 'none' || !body.style.display) {
        body.style.display = 'flex';
        arrow.textContent = '▲';
      } else {
        body.style.display = 'none';
        arrow.textContent = '▼';
      }
    },
    togglePageSelection(checked) {
      const start = (_page - 1) * _pageSize;
      const items = _filteredProducts.slice(start, start + _pageSize);
      items.forEach(p => {
        if (checked) _selectedEans.add(p.ean);
        else { _selectedEans.delete(p.ean); _selectAllFiltered = false; }
      });
      render();
    },
    selectAllFiltered() {
      _selectAllFiltered = true;
      _filteredProducts.forEach(p => _selectedEans.add(p.ean));
      render();
    },
    clearSelection() {
      _selectedEans.clear();
      _selectAllFiltered = false;
      render();
    },
    closeSafetyModal() {
      const container = document.getElementById('bulk-safety-modal-container');
      if (container) container.innerHTML = '';
      window._pendingModalConfirm = null;
    },
    checkConfirmKey(val) {
      const btn = document.getElementById('bulk-modal-confirm-btn');
      if (btn) {
        btn.disabled = val.trim().toUpperCase() !== 'ELIMINAR';
      }
    },
    executeModalConfirm() {
      if (typeof window._pendingModalConfirm === 'function') {
        const fn = window._pendingModalConfirm;
        UIBulk.closeSafetyModal();
        fn();
      }
    },
    triggerUndo() {
      const res = DB.applyUndo();
      if (res) {
        if (App) App.showToast('Último cambio deshecho exitosamente', 'success');
        render();
      } else {
        if (App) App.showToast('No hay cambios recientes para deshacer', 'info');
      }
    },
    
    // Batch Operations
    applyBatchPanel() {
      if (_selectedEans.size === 0) return;
      const brand = document.getElementById('bulk-batch-brand').value.trim();
      const pkg = document.getElementById('bulk-batch-pkg').value;
      const status = document.getElementById('bulk-batch-status').value;

      if (!brand && !pkg && !status) {
        if (App) App.showToast('Selecciona al menos un atributo para modificar', 'warning');
        return;
      }

      const affected = [];
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (p) {
          const clone = JSON.parse(JSON.stringify(p));
          let changed = false;
          if (brand) { clone.brand = brand; changed = true; }
          if (pkg) { clone.packageType = pkg; changed = true; }
          if (status) { clone.status = status; changed = true; }

          if (changed) {
            affected.push({
              ean: p.ean,
              name: p.name,
              oldVal: `Marca: ${p.brand || 'N/A'}, Empaque: ${p.packageType || 'N/A'}`,
              newVal: `Marca: ${clone.brand || 'N/A'}, Empaque: ${clone.packageType || 'N/A'}`
            });
            prodsToSave.push(clone);
          }
        }
      });

      _showSafetyModal({
        title: 'Confirmar Modificación de Atributos',
        badgeText: `${affected.length} SKUs`,
        description: `Se actualizarán los atributos de ${affected.length} productos seleccionados simultáneamente.`,
        affectedItems: affected,
        actionType: 'warning',
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${prodsToSave.length} productos actualizados`, 'success');
          _selectedEans.clear();
          _selectAllFiltered = false;
          render();
        }
      });
    },

    onCatTargetTypeChange(val) {
      const selectGroup = document.getElementById('bulk-cat-select-group');
      const catSelect = document.getElementById('bulk-batch-cat');
      if (!catSelect) return;

      if (val === 'universal') {
        catSelect.innerHTML = `<option value="">-- Seleccionar Categoría Universal --</option>` +
          (window.UNIVERSAL_CATEGORIES ? window.UNIVERSAL_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('') : '');
      } else if (val.startsWith('holding_')) {
        const hid = val.replace('holding_', '');
        const hInfo = DB.getHoldings().find(h => h.id === hid);
        const cats = hInfo?.categories || window.UNIVERSAL_CATEGORIES || [];
        catSelect.innerHTML = `<option value="">-- Seleccionar Categoría Holding --</option>` +
          cats.map(c => `<option value="${c}">${c}</option>`).join('');
      }
    },

    applyCategoryBatch() {
      if (_selectedEans.size === 0) return;
      const targetType = document.getElementById('bulk-cat-target-type').value;
      const mode = document.getElementById('bulk-cat-mode').value;
      const catVal = document.getElementById('bulk-batch-cat').value;

      if (mode !== 'clear' && !catVal) {
        if (App) App.showToast('Selecciona una categoría para aplicar', 'warning');
        return;
      }

      const affected = [];
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (!p) return;
        const clone = JSON.parse(JSON.stringify(p));
        let changed = false;

        if (targetType === 'universal') {
          let curCats = Array.isArray(clone.category) ? [...clone.category] : (clone.category ? [clone.category] : []);

          if (mode === 'replace') {
            curCats = [catVal];
            changed = true;
          } else if (mode === 'add') {
            if (!curCats.includes(catVal)) { curCats.push(catVal); changed = true; }
          } else if (mode === 'remove') {
            if (curCats.includes(catVal)) { curCats = curCats.filter(c => c !== catVal); changed = true; }
          } else if (mode === 'clear') {
            curCats = [];
            changed = true;
          }

          if (changed) {
            clone.category = curCats;
            clone.universalCategory = curCats;
            affected.push({
              ean: p.ean,
              name: p.name,
              oldVal: Array.isArray(p.category) ? p.category.join(', ') : (p.category || 'Sin categoría'),
              newVal: curCats.length > 0 ? curCats.join(', ') : 'Ninguna'
            });
            prodsToSave.push(clone);
          }
        } else if (targetType.startsWith('holding_')) {
          const hid = targetType.replace('holding_', '');
          clone.holdings = clone.holdings || {};
          if (!clone.holdings[hid]) {
            // Initialize holding if not present
            clone.holdings[hid] = { localCategoryName: catVal, localProductName: clone.name || '', isActiveHolding: true };
          }
          const hObj = clone.holdings[hid];
          let curCat = Array.isArray(hObj.localCategoryName) ? [...hObj.localCategoryName] : (hObj.localCategoryName ? [hObj.localCategoryName] : []);

          if (mode === 'replace') { curCat = [catVal]; changed = true; }
          else if (mode === 'add') { if (!curCat.includes(catVal)) { curCat.push(catVal); changed = true; } }
          else if (mode === 'remove') { curCat = curCat.filter(c => c !== catVal); changed = true; }
          else if (mode === 'clear') { curCat = []; changed = true; }

          if (changed) {
            hObj.localCategoryName = curCat;
            hObj.category = curCat;
            affected.push({
              ean: p.ean,
              name: p.name,
              oldVal: `Holding ${hid}: ${Array.isArray(p.holdings?.[hid]?.localCategoryName) ? p.holdings[hid].localCategoryName.join(', ') : (p.holdings?.[hid]?.localCategoryName || 'Sin cat')}`,
              newVal: `Holding ${hid}: ${curCat.join(', ') || 'Ninguna'}`
            });
            prodsToSave.push(clone);
          }
        }
      });

      _showSafetyModal({
        title: 'Confirmar Modificación de Categorías',
        badgeText: `${affected.length} SKUs`,
        description: `Se actualizarán las categorías (${targetType === 'universal' ? 'Universal' : targetType}) con modo "${mode}".`,
        affectedItems: affected,
        actionType: 'warning',
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${prodsToSave.length} productos actualizados`, 'success');
          _selectedEans.clear();
          _selectAllFiltered = false;
          render();
        }
      });
    },

    applyFindReplace() {
      if (_selectedEans.size === 0) return;
      const findText = document.getElementById('bulk-fr-find').value;
      const replaceText = document.getElementById('bulk-fr-replace').value;
      const matchCase = document.getElementById('bulk-fr-match-case').checked;
      const wholeWord = document.getElementById('bulk-fr-whole-word').checked;

      if (!findText) {
        if (App) App.showToast('Ingresa el texto a buscar', 'warning');
        return;
      }

      const affected = [];
      const prodsToSave = [];

      let flags = 'g';
      if (!matchCase) flags += 'i';

      let patternStr = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) patternStr = `\\b${patternStr}\\b`;

      const regex = new RegExp(patternStr, flags);

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (p && p.name && regex.test(p.name)) {
          const clone = JSON.parse(JSON.stringify(p));
          clone.name = clone.name.replace(regex, replaceText);
          affected.push({ ean: p.ean, name: p.name, oldVal: p.name, newVal: clone.name });
          prodsToSave.push(clone);
        }
      });

      if (affected.length === 0) {
        if (App) App.showToast('No se encontraron coincidencias en los nombres seleccionados', 'info');
        return;
      }

      _showSafetyModal({
        title: 'Confirmar Reemplazo de Texto',
        badgeText: `${affected.length} SKUs`,
        description: `Se reemplazará "${findText}" por "${replaceText}" en los nombres de ${affected.length} SKUs.`,
        affectedItems: affected,
        actionType: 'warning',
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${prodsToSave.length} nombres de productos actualizados`, 'success');
          render();
        }
      });
    },

    applyNormalization(type) {
      if (_selectedEans.size === 0) return;
      const affected = [];
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (!p || !p.name) return;
        const clone = JSON.parse(JSON.stringify(p));
        let newName = clone.name;

        if (type === 'uppercase') {
          newName = newName.toUpperCase();
        } else if (type === 'lowercase') {
          newName = newName.toLowerCase();
        } else if (type === 'titlecase') {
          newName = newName.toLowerCase().replace(/(?:^|\s|-)\S/g, match => match.toUpperCase());
        } else if (type === 'trim') {
          newName = newName.replace(/\s+/g, ' ').trim();
        }

        if (newName !== p.name) {
          clone.name = newName;
          affected.push({ ean: p.ean, name: p.name, oldVal: p.name, newVal: newName });
          prodsToSave.push(clone);
        }
      });

      if (affected.length === 0) {
        if (App) App.showToast('Los nombres ya tienen el formato correcto', 'info');
        return;
      }

      _showSafetyModal({
        title: `Confirmar Normalización (${type.toUpperCase()})`,
        badgeText: `${affected.length} SKUs`,
        description: `Se cambiará el formato del texto de ${affected.length} productos.`,
        affectedItems: affected,
        actionType: 'warning',
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${prodsToSave.length} nombres normalizados`, 'success');
          render();
        }
      });
    },

    applyBulkHolding(action = 'assign') {
      if (_selectedEans.size === 0) return;
      const hid = document.getElementById('bulk-batch-holding')?.value;
      if (!hid) { if (App) App.showToast('Selecciona un holding primero', 'warning'); return; }
      const hInfo = DB.getHoldings().find(h => h.id === hid);
      const hName = hInfo?.name || hid;

      const affected = [];
      const prodsToSave = [];

      _selectedEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (!p) return;
        const clone = JSON.parse(JSON.stringify(p));
        clone.holdings = clone.holdings || {};

        if (action === 'assign') {
          if (!clone.holdings[hid]) {
            clone.holdings[hid] = {
              holdingInternalId: p.ean, localProductName: p.name || '',
              localCategoryName: 'GROCERY STORE', isActiveHolding: true,
              updatedAt: new Date().toISOString()
            };
            affected.push({ ean: p.ean, name: p.name, oldVal: 'Sin asociación', newVal: `Asignado a ${hName}` });
            prodsToSave.push(clone);
          }
        } else if (action === 'unassign') {
          if (clone.holdings[hid]) {
            delete clone.holdings[hid];
            affected.push({ ean: p.ean, name: p.name, oldVal: `Asociado a ${hName}`, newVal: 'Desasociado' });
            prodsToSave.push(clone);
          }
        }
      });

      if (affected.length === 0) {
        if (App) App.showToast(`Los SKUs ya están ${action === 'assign' ? 'asignados a' : 'desasociados de'} ${hName}`, 'info');
        return;
      }

      _showSafetyModal({
        title: action === 'assign' ? `Asignar a Holding ${hName}` : `Desasociar de Holding ${hName}`,
        badgeText: `${affected.length} SKUs`,
        description: action === 'assign' ? `Se vincularán ${affected.length} SKUs al holding ${hName}.` : `Se desvincularán ${affected.length} SKUs del holding ${hName} (no borra del catálogo maestro).`,
        affectedItems: affected,
        actionType: action === 'unassign' ? 'danger' : 'warning',
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${affected.length} SKUs procesados para ${hName}`, 'success');
          _selectedEans.clear();
          _selectAllFiltered = false;
          await DB.fetchProducts();
          render();
        }
      });
    },

    deleteSelected() {
      if (_selectedEans.size === 0) return;
      const count = _selectedEans.size;
      const eans = Array.from(_selectedEans);

      const affected = eans.map(ean => {
        const p = DB.getProduct(ean);
        return { ean, name: p?.name || 'Desconocido', oldVal: 'Activo en Catálogo', newVal: '⚠️ ELIMINADO' };
      });

      _showSafetyModal({
        title: '⚠️ Confirmar Eliminación Masiva Permamente',
        badgeText: `${count} SKUs`,
        description: `Estás a punto de eliminar <strong>${count} productos</strong> de forma permanente del catálogo maestro y holdings.`,
        affectedItems: affected,
        actionType: 'danger',
        requiresConfirmationKey: count > 5,
        onConfirm: async () => {
          await DB.deleteProducts(eans);
          if (App) App.showToast(`${count} productos eliminados del sistema`, 'success');
          _selectedEans.clear();
          _selectAllFiltered = false;
          render();
        }
      });
    },

    toggleDiscBrandFilter(mode) {
      const group = document.getElementById('bulk-disc-brand-group');
      if (group) group.style.display = mode === 'brand' ? '' : 'none';
    },

    applyBulkDiscontinue() {
      const hid = document.getElementById('bulk-disc-holding')?.value;
      if (!hid) { if (App) App.showToast('Selecciona un holding primero', 'warning'); return; }
      const hInfo = DB.getHoldings().find(h => h.id === hid);
      const hName = hInfo?.name || hid;

      const mode = document.getElementById('bulk-disc-mode')?.value || 'selected';
      let targetEans;

      if (mode === 'brand') {
        const brand = document.getElementById('bulk-disc-brand')?.value;
        if (!brand) { if (App) App.showToast('Selecciona una marca', 'warning'); return; }
        targetEans = DB.getProductsArray()
          .filter(p => p.brand === brand && (p.holdings || {})[hid] && !(p.holdings[hid]).isDiscontinued)
          .map(p => p.ean);
        if (targetEans.length === 0) {
          if (App) App.showToast(`No hay SKUs activos de la marca "${brand}" en ${hName}`, 'info');
          return;
        }
      } else {
        if (_selectedEans.size === 0) { if (App) App.showToast('Selecciona productos primero', 'warning'); return; }
        targetEans = [..._selectedEans];
      }

      const affected = [];
      const prodsToSave = [];

      targetEans.forEach(ean => {
        const p = DB.getProduct(ean);
        if (!p) return;
        const clone = JSON.parse(JSON.stringify(p));
        clone.holdings = clone.holdings || {};
        if (!clone.holdings[hid]) return;
        if (clone.holdings[hid].isDiscontinued) return; // ya descontinuado

        // Marcar como descontinuado pero PRESERVAR customer_id y holdingInternalId
        clone.holdings[hid].isDiscontinued = true;
        clone.holdings[hid].discontinuedAt = new Date().toISOString();
        clone.holdings[hid].isActiveHolding = false;

        const custId = clone.holdings[hid].customerId || clone.holdings[hid].holdingInternalId || '—';
        affected.push({
          ean: p.ean,
          name: p.name || 'Sin nombre',
          oldVal: `Activo en ${hName} (ID: ${custId})`,
          newVal: `Descontinuado en ${hName} (ID preservado: ${custId})`
        });
        prodsToSave.push(clone);
      });

      if (affected.length === 0) {
        if (App) App.showToast(`No hay SKUs activos para descontinuar en ${hName}`, 'info');
        return;
      }

      const brandLabel = mode === 'brand' ? ` de marca "${document.getElementById('bulk-disc-brand')?.value}"` : '';
      _showSafetyModal({
        title: `🚫 Descontinuar${brandLabel} de ${hName}`,
        badgeText: `${affected.length} SKUs`,
        description: `Se marcarán <strong>${affected.length} SKUs</strong>${brandLabel} como descontinuados en ${hName}. Los Customer IDs se conservarán intactos por si la marca regresa.`,
        affectedItems: affected,
        actionType: 'danger',
        requiresConfirmationKey: affected.length > 10,
        onConfirm: async () => {
          await DB.saveProducts(prodsToSave);
          if (App) App.showToast(`${affected.length} SKUs descontinuados de ${hName}`, 'success');
          _selectedEans.clear();
          _selectAllFiltered = false;
          await DB.fetchProducts();
          render();
        }
      });
    },

    addUniversalCategory() {
      const input = document.getElementById('bulk-new-ucat');
      const name = (input?.value || '').trim().toUpperCase();
      if (!name) { if (App) App.showToast('Ingresa un nombre para la nueva categoría', 'warning'); return; }
      if ((window.UNIVERSAL_CATEGORIES || []).includes(name)) {
        if (App) App.showToast(`La categoría "${name}" ya existe`, 'info');
        return;
      }
      window.UNIVERSAL_CATEGORIES = [...(window.UNIVERSAL_CATEGORIES || []), name].sort();
      localStorage.setItem('ss_universal_categories', JSON.stringify(window.UNIVERSAL_CATEGORIES));
      if (App) App.showToast(`Categoría "${name}" agregada al sistema`, 'success');
      render();
    },

    removeUniversalCategory(cat) {
      const affected = DB.getProductsArray().filter(p => {
        const uCat = Array.isArray(p.universalCategory) ? p.universalCategory : (p.universalCategory ? [p.universalCategory] : []);
        return uCat.includes(cat);
      });

      const doRemove = () => {
        window.UNIVERSAL_CATEGORIES = (window.UNIVERSAL_CATEGORIES || []).filter(c => c !== cat);
        localStorage.setItem('ss_universal_categories', JSON.stringify(window.UNIVERSAL_CATEGORIES));
        if (App) App.showToast(`Categoría "${cat}" eliminada del sistema`, 'success');
        render();
      };

      if (affected.length === 0) {
        doRemove();
        return;
      }

      _showSafetyModal({
        title: `⚠️ Eliminar Categoría Universal "${cat}"`,
        badgeText: `${affected.length} SKUs afectados`,
        description: `Al eliminar la categoría "<strong>${cat}</strong>", ${affected.length} SKU(s) quedarán sin categoría universal válida y aparecerán en la bandeja de Revisión → Sin Categoría Universal.`,
        affectedItems: affected.slice(0, 50).map(p => ({
          ean: p.ean,
          name: p.name || 'Sin nombre',
          oldVal: cat,
          newVal: 'Sin Categoría Universal'
        })),
        actionType: 'danger',
        requiresConfirmationKey: affected.length > 5,
        onConfirm: doRemove
      });
    },

    exportExcel() {
      const isSelectionMode = _selectedEans.size > 0;
      const baseProducts = isSelectionMode
        ? _filteredProducts.filter(p => _selectedEans.has(p.ean))
        : _filteredProducts;

      if (!baseProducts || baseProducts.length === 0) {
        if (App) App.showToast('No hay productos para exportar', 'warning');
        return;
      }

      const holdings = DB.getHoldings();
      const categories = window.UNIVERSAL_CATEGORIES || [];

      const modalHtml = `
        <div class="modal-backdrop" id="export-modal-backdrop" style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
          <div class="modal-card" style="background:var(--surface); border-radius:12px; padding:24px; max-width:520px; width:90%; box-shadow:0 10px 25px rgba(0,0,0,0.2); border:1px solid var(--border);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="margin:0; font-size:18px; font-weight:700;">📊 Exportación Avanzada a Excel</h3>
              <button onclick="document.getElementById('export-modal-backdrop').remove()" style="background:none; border:none; font-size:18px; cursor:pointer; color:var(--text-muted);">✕</button>
            </div>
            
            <p style="font-size:12px; color:var(--text-sec); margin-bottom:16px;">
              Configura los filtros de exportación sobre los <strong>${baseProducts.length} SKUs</strong> ${isSelectionMode ? 'seleccionados' : 'filtrados'}.
            </p>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Filtrar por Holding Específico</label>
              <select id="export-filter-holding" class="form-select" style="width:100%;">
                <option value="all">Todos los holdings</option>
                ${holdings.map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom:12px;">
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Filtrar por Categoría Universal</label>
              <select id="export-filter-category" class="form-select" style="width:100%;">
                <option value="all">Todas las categorías</option>
                ${categories.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
              </select>
            </div>

            <div class="form-group" style="margin-bottom:16px;">
              <label style="font-size:12px; font-weight:600; display:block; margin-bottom:4px;">Filtrar por Origen de Datos / Integración</label>
              <select id="export-filter-origin" class="form-select" style="width:100%;">
                <option value="all">Todos los orígenes</option>
                <option value="api">Solo Enriquecidos por API (SoloTodo / OFF / OPF)</option>
                <option value="levantamiento">Solo Levantamiento en Terreno</option>
                <option value="manual">Solo Carga Manual</option>
              </select>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
              <button class="btn-outline" onclick="document.getElementById('export-modal-backdrop').remove()">Cancelar</button>
              <button class="btn-primary" onclick="UIBulk._doExportExcel()">📥 Generar Excel</button>
            </div>
          </div>
        </div>
      `;

      const existing = document.getElementById('export-modal-backdrop');
      if (existing) existing.remove();
      document.body.insertAdjacentHTML('beforeend', modalHtml);
    },

    _doExportExcel() {
      const isSelectionMode = _selectedEans.size > 0;
      let targetProducts = isSelectionMode
        ? _filteredProducts.filter(p => _selectedEans.has(p.ean))
        : _filteredProducts;

      const holdingFilter = document.getElementById('export-filter-holding')?.value || 'all';
      const categoryFilter = document.getElementById('export-filter-category')?.value || 'all';
      const originFilter = document.getElementById('export-filter-origin')?.value || 'all';

      // Aplicar filtros avanzados del modal
      if (holdingFilter !== 'all') {
        targetProducts = targetProducts.filter(p => (p.holdings || p.retailers || {})[holdingFilter]);
      }
      if (categoryFilter !== 'all') {
        targetProducts = targetProducts.filter(p => {
          const uCat = Array.isArray(p.universalCategory) ? p.universalCategory : (p.universalCategory ? [p.universalCategory] : []);
          return uCat.includes(categoryFilter);
        });
      }
      if (originFilter !== 'all') {
        targetProducts = targetProducts.filter(p => {
          if (originFilter === 'levantamiento') return p.dataSource === 'levantamiento' || p.fromLevantamiento;
          if (originFilter === 'api') return (p.dataSource && p.dataSource !== 'manual' && p.dataSource !== 'levantamiento') || (p.enrichmentSources && Object.keys(p.enrichmentSources).length > 0);
          if (originFilter === 'manual') return p.dataSource === 'manual' && (!p.enrichmentSources || Object.keys(p.enrichmentSources).length === 0);
          return true;
        });
      }

      const modal = document.getElementById('export-modal-backdrop');
      if (modal) modal.remove();

      if (!targetProducts || targetProducts.length === 0) {
        if (App) App.showToast('No hay productos que coincidan con los filtros seleccionados', 'warning');
        return;
      }

      const headers = [
        'Fecha de Carga',
        'Barcode / EAN Code',
        'Vispera ID',
        'Customer ID',
        'SKU Name (Nombre)',
        'Brand (Marca)',
        'Producer / Manufacturer (Marca Universal)',
        'Category (Categoría Universal Vispera)',
        'Sub-Category (Categoría Holding)',
        'Holdings Asignados',
        'Size (Peso / Contenido)',
        'Size Unit (Unidad)',
        'Number of Units (Unidades)',
        'Width (Ancho cm)',
        'Height (Alto cm)',
        'Depth (Profundidad cm)',
        'Public Image Link (URL Imagen)',
        'Tipo de Empaque',
        'Estado Operativo',
        'Origen de Datos',
        'Completitud (%)'
      ];

      const rows = targetProducts.map(p => {
        const dateStr = p.createdAt || p.updatedAt ? new Date(p.createdAt || p.updatedAt).toLocaleDateString('es-CL') : '—';
        const hData = p.holdings || p.retailers || {};
        const holdingsList = Object.keys(hData);
        const holdingsStr = holdingsList.length > 0 ? holdingsList.join('; ') : 'SIN HOLDING';
        
        const custIdsStr = holdingsList.map(hId => {
          const item = hData[hId];
          const cid = item?.customerId || item?.holdingInternalId;
          return cid ? `${hId}: ${cid}` : null;
        }).filter(Boolean).join('; ') || 'Ninguno';

        const localCatsStr = holdingsList.map(hId => {
          const item = hData[hId];
          const lcat = Array.isArray(item?.localCategoryName) ? item.localCategoryName.join(', ') : (item?.localCategoryName || item?.category);
          return lcat ? `${hId}: ${lcat}` : null;
        }).filter(Boolean).join('; ') || (Array.isArray(p.category) ? p.category.join('; ') : (p.category || 'General'));

        const uCatStr = Array.isArray(p.universalCategory) 
          ? p.universalCategory.join('; ') 
          : (p.universalCategory || p.masterCategory || 'General');

        const statusMap = { active: 'Activo', new: 'Nuevo Lanzamiento', review: 'En Revisión', discontinued: 'Discontinuado' };
        const statusStr = statusMap[p.status] || 'Activo';

        let originStr = 'Carga Manual';
        if (p.dataSource === 'levantamiento' || p.fromLevantamiento) originStr = 'Levantamiento (Terreno)';
        else if ((p.dataSource && p.dataSource !== 'manual') || (p.enrichmentSources && Object.keys(p.enrichmentSources).length > 0)) originStr = 'Enriquecido por API';

        const pkgObj = window.PACKAGE_TYPES?.find(pkg => pkg.value === p.packageType);
        const pkgLabel = pkgObj ? pkgObj.label : (p.packageType || 'N/A');

        return [
          dateStr,
          p.ean || '',
          p.visperaId || 'Sin ID',
          custIdsStr,
          p.name || '',
          p.brand || '',
          p.producer || '',
          uCatStr,
          localCatsStr,
          holdingsStr,
          p.weight_g !== null && p.weight_g !== undefined ? p.weight_g : '',
          p.weight_unit || (p.weight_g ? 'g' : ''),
          p.numberOfUnits || 1,
          p.width_cm !== null && p.width_cm !== undefined ? p.width_cm : '',
          p.height_cm !== null && p.height_cm !== undefined ? p.height_cm : '',
          p.depth_cm !== null && p.depth_cm !== undefined ? p.depth_cm : '',
          p.imageUrl || '',
          pkgLabel,
          statusStr,
          originStr,
          `${DB.computeCompleteness(p)}%`
        ];
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `sku-audit-export-${targetProducts.length}-${dateStr}.xlsx`;

      if (typeof XLSX !== 'undefined') {
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Auditoría SKUs");
        XLSX.writeFile(wb, filename);
        if (App) App.showToast(`✓ Exportados ${targetProducts.length} SKUs a Excel (.xlsx)`, 'success');
      } else {
        const csvRows = [headers, ...rows].map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','));
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename.replace('.xlsx', '.csv');
        link.click();
        if (App) App.showToast(`Exportados ${targetProducts.length} SKUs a CSV`, 'success');
      }
    },

    saveTableChanges() {
      let savedCount = 0;
      document.querySelectorAll('.bulk-inline-inp, .bulk-inline-sel').forEach(el => {
        const ean = el.dataset.ean;
        const field = el.dataset.field;
        const val = el.value;
        const prod = DB.getProduct(ean);
        if (prod) {
          let changed = false;
          if (field === 'category') {
            const currentCat = Array.isArray(prod.category) ? prod.category[0] : prod.category;
            if (currentCat !== val) {
              prod.category = val ? [val] : [];
              prod.universalCategory = prod.category;
              changed = true;
            }
          } else {
            if (prod[field] !== val) {
              prod[field] = val;
              changed = true;
            }
          }
          if (changed) {
            DB.saveProduct(prod, true);
            savedCount++;
          }
        }
      });

      if (App) {
        if (savedCount > 0) {
          App.showToast(`✓ Cambios guardados correctamente en ${savedCount} celda(s)`, 'success');
        } else {
          App.showToast('Los datos de la tabla están al día con la Base de Datos', 'info');
        }
      }
      render();
    },

    saveSelected() {
      DB.fetchProducts().then(() => {
        if (App) App.showToast('Base de datos sincronizada', 'success');
        render();
      });
    },

    toggleAccordion
  };
})();
