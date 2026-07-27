'use strict';

const UICategoryManager = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function openModal() {
    let container = document.getElementById('category-manager-modal-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'category-manager-modal-container';
      document.body.appendChild(container);
    }
    renderModal(container);
  }

  function closeModal() {
    const container = document.getElementById('category-manager-modal-container');
    if (container) container.innerHTML = '';
  }

  function renderModal(container) {
    const hierarchy = DB.getCategoryHierarchy() || {};
    const holdings = DB.getHoldings() || [];
    const products = DB.getProductsArray() || [];

    // Computar conteo de productos por Categoría Universal
    const productCounts = {};
    products.forEach(p => {
      const uCats = Array.isArray(p.universalCategory) ? p.universalCategory : (p.universalCategory ? [p.universalCategory] : (Array.isArray(p.category) ? p.category : ['Sin categoría']));
      uCats.forEach(c => {
        const norm = (DB.normalizeUniversalCategory && DB.normalizeUniversalCategory(c)) || c;
        productCounts[norm] = (productCounts[norm] || 0) + 1;
      });
    });

    const entries = Object.entries(hierarchy);

    container.innerHTML = `
      <div class="modal-overlay" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); z-index:9999; backdrop-filter:blur(4px); padding:20px;">
        <div class="modal-card" style="background:var(--surface); border:1px solid var(--border); border-radius:14px; width:100%; max-width:1100px; max-height:90vh; display:flex; flex-direction:column; box-shadow:0 20px 40px rgba(0,0,0,0.4); overflow:hidden;">
          
          <!-- Header -->
          <div style="padding:20px 24px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; background:var(--surface-el);">
            <div>
              <h2 style="margin:0; font-size:18px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:8px;">
                <span>🗂️</span> Gestor de Jerarquía de Categorías Vispera
              </h2>
              <p style="margin:4px 0 0 0; font-size:12px; color:var(--text-sec);">
                Asocia las Categorías Universales Máster con las Subcategorías locales de cada Holding (Tottus, Jumbo, Unimarc, Pronto).
              </p>
            </div>
            <button class="btn-icon" onclick="UICategoryManager.closeModal()" style="font-size:18px; padding:6px 12px; background:transparent; border:none; color:var(--text-muted); cursor:pointer;">✕</button>
          </div>

          <!-- Toolbar -->
          <div style="padding:14px 24px; background:rgba(79,70,229,0.06); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="btn-primary-sm" style="padding:8px 14px; font-weight:600; font-size:12px; display:flex; align-items:center; gap:6px;" onclick="UICategoryManager.showAddCategoryDialog()">
                <span>➕</span> Crear Categoría Universal
              </button>
              <button class="btn-secondary-sm" style="padding:8px 14px; font-weight:600; font-size:12px; display:flex; align-items:center; gap:6px; background:var(--surface); border:1px solid var(--border);" onclick="UICategoryManager.applyAutoMapping()">
                <span>⚡</span> Auto-Homologar Todo el Catálogo
              </button>
            </div>
            <div style="font-size:12px; color:var(--text-sec);">
              Total de Categorías Universales: <strong>${entries.length}</strong>
            </div>
          </div>

          <!-- Body Grid -->
          <div style="padding:24px; overflow-y:auto; flex:1;">
            <div style="display:flex; flex-direction:column; gap:16px;">
              ${entries.length === 0 ? `
                <div style="padding:40px; text-align:center; color:var(--text-muted);">
                  <div style="font-size:36px; margin-bottom:8px;">📁</div>
                  <p>No hay categorías registradas aún.</p>
                </div>
              ` : entries.map(([uCatKey, uData]) => {
                const color = uData.color || '#4F46E5';
                const count = productCounts[uCatKey] || 0;
                const hMap = uData.holdings || {};

                return `
                  <div style="background:var(--surface-el); border:1px solid var(--border); border-left:5px solid ${color}; border-radius:10px; padding:16px;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
                      <div>
                        <div style="display:flex; align-items:center; gap:10px;">
                          <span style="font-size:15px; font-weight:700; color:var(--text);">${esc(uCatKey)}</span>
                          <span style="background:${color}22; color:${color}; border:1px solid ${color}44; padding:2px 8px; border-radius:12px; font-size:11px; font-weight:600;">
                            ${count} SKUs
                          </span>
                        </div>
                        <div style="font-size:12px; color:var(--text-sec); margin-top:2px;">
                          ${esc(uData.description || 'Sin descripción')}
                        </div>
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button class="btn-secondary-sm" style="font-size:11px; padding:4px 8px;" onclick="UICategoryManager.showEditCategoryDialog('${esc(uCatKey)}')">
                          ✏️ Editar
                        </button>
                      </div>
                    </div>

                    <!-- Mapeo por Holdings -->
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px; background:var(--surface); padding:12px; border-radius:8px; border:1px solid var(--border);">
                      ${holdings.map(h => {
                        const subCats = hMap[h.id] || [];
                        return `
                          <div style="display:flex; flex-direction:column; gap:6px;">
                            <div style="font-size:11px; font-weight:700; color:var(--text-muted); display:flex; align-items:center; justify-content:space-between;">
                              <span style="display:flex; align-items:center; gap:4px;">
                                <span style="width:8px; height:8px; border-radius:50%; background:${h.color}; display:inline-block;"></span>
                                ${esc(h.name)}
                              </span>
                              <button class="btn-icon-xs" style="font-size:12px; cursor:pointer; background:none; border:none; color:var(--text-muted);" title="Agregar subcategoría para ${h.name}" onclick="UICategoryManager.promptAddSubcategory('${esc(uCatKey)}', '${h.id}')">
                                ➕
                              </button>
                            </div>
                            <div style="display:flex; flex-wrap:wrap; gap:4px; min-height:24px;">
                              ${subCats.length === 0 ? `
                                <span style="font-size:11px; color:var(--text-muted); font-style:italic;">Sin asignación</span>
                              ` : subCats.map(sub => `
                                <span style="background:var(--surface-modal); border:1px solid var(--border); padding:2px 6px; border-radius:4px; font-size:10px; font-weight:600; color:var(--text); display:inline-flex; align-items:center; gap:4px;">
                                  ${esc(sub)}
                                  <span style="cursor:pointer; color:var(--text-muted); font-size:10px;" onclick="UICategoryManager.removeSubcategory('${esc(uCatKey)}', '${h.id}', '${esc(sub)}')">✕</span>
                                </span>
                              `).join('')}
                            </div>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Footer -->
          <div style="padding:14px 24px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; background:var(--surface-el);">
            <button class="btn-secondary" onclick="UICategoryManager.closeModal()">Cerrar</button>
          </div>

        </div>
      </div>
    `;
  }

  function showAddCategoryDialog() {
    const name = prompt('Nombre de la nueva Categoría Universal Vispera (ej. HYGIENE, FROZEN, PET):');
    if (!name || !name.trim()) return;
    const cleanName = name.trim().toUpperCase();

    const hierarchy = DB.getCategoryHierarchy() || {};
    if (hierarchy[cleanName]) {
      alert(`La categoría "${cleanName}" ya existe.`);
      return;
    }

    const desc = prompt(`Descripción corta para "${cleanName}":`) || 'Categoría Universal Vispera';
    const color = prompt('Color HEX (ej. #8E24AA, #4CAF50):') || '#4F46E5';

    hierarchy[cleanName] = {
      color: color.trim(),
      description: desc.trim(),
      holdings: { tottus: [], jumbo: [], unimarc: [], pronto: [] }
    };

    DB.saveCategoryHierarchy(hierarchy);
    openModal();
  }

  function showEditCategoryDialog(uCatKey) {
    const hierarchy = DB.getCategoryHierarchy() || {};
    const uData = hierarchy[uCatKey];
    if (!uData) return;

    const newDesc = prompt(`Editar descripción de "${uCatKey}":`, uData.description || '');
    if (newDesc !== null) uData.description = newDesc.trim();

    const newColor = prompt(`Editar color HEX de "${uCatKey}":`, uData.color || '#4F46E5');
    if (newColor !== null) uData.color = newColor.trim();

    DB.saveCategoryHierarchy(hierarchy);
    openModal();
  }

  function promptAddSubcategory(uCatKey, holdingId) {
    const hierarchy = DB.getCategoryHierarchy() || {};
    const uData = hierarchy[uCatKey];
    if (!uData) return;

    uData.holdings = uData.holdings || {};
    uData.holdings[holdingId] = uData.holdings[holdingId] || [];

    const sub = prompt(`Ingrese nombre de la subcategoría local para ${holdingId.toUpperCase()} (asociada a ${uCatKey}):`);
    if (!sub || !sub.trim()) return;
    const cleanSub = sub.trim().toUpperCase();

    if (!uData.holdings[holdingId].includes(cleanSub)) {
      uData.holdings[holdingId].push(cleanSub);
      DB.saveCategoryHierarchy(hierarchy);
      openModal();
    }
  }

  function removeSubcategory(uCatKey, holdingId, subCat) {
    const hierarchy = DB.getCategoryHierarchy() || {};
    const uData = hierarchy[uCatKey];
    if (!uData || !uData.holdings || !uData.holdings[holdingId]) return;

    uData.holdings[holdingId] = uData.holdings[holdingId].filter(s => s !== subCat);
    DB.saveCategoryHierarchy(hierarchy);
    openModal();
  }

  function applyAutoMapping() {
    const updatedCount = DB.applyAutoCategoryMappingToAll();
    alert(`⚡ Proceso completado. Se auto-homologaron subcategorías en ${updatedCount} productos del catálogo.`);
    openModal();
  }

  return {
    openModal,
    closeModal,
    showAddCategoryDialog,
    showEditCategoryDialog,
    promptAddSubcategory,
    removeSubcategory,
    applyAutoMapping
  };
})();
