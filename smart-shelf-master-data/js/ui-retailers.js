'use strict';

const UIRetailers = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render() {
    const el = document.getElementById('view-retailers');
    if (!el) return;
    const retailers = DB.getRetailers();
    const products  = DB.getProductsArray();

    el.innerHTML = `
<header class="view-header">
  <div>
    <h1 class="view-title">Retailers</h1>
    <p class="view-sub">${retailers.length} supermercado${retailers.length !== 1 ? 's' : ''} configurado${retailers.length !== 1 ? 's' : ''}</p>
  </div>
  <div class="view-actions">
    <button class="btn-primary" onclick="UIRetailers.showAddForm()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Agregar Retailer
    </button>
  </div>
</header>

<div class="retailers-grid">
  ${retailers.map(r => renderRetailerCard(r, products)).join('')}
  <div class="retailer-add-card" onclick="UIRetailers.showAddForm()">
    <div class="add-card-inner">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <p>Agregar nuevo retailer</p>
    </div>
  </div>
</div>

<!-- Add/Edit Form Modal -->
<div id="retailer-form-overlay" class="form-overlay hidden" onclick="if(event.target===this)UIRetailers.closeForm()">
  <div class="retailer-form-modal" id="retailer-form-modal"></div>
</div>
`;
  }

  function renderRetailerCard(r, products) {
    const sku_count  = products.filter(p => p.retailers?.[r.id]).length;
    const in_stock   = products.filter(p => p.retailers?.[r.id]?.stockStatus).length;
    const avg_comp   = sku_count > 0
      ? Math.round(products.filter(p => p.retailers?.[r.id]).reduce((s, p) => s + DB.computeCompleteness(p), 0) / sku_count)
      : 0;
    const compCol    = avg_comp >= 80 ? 'var(--success)' : avg_comp >= 50 ? 'var(--warning)' : 'var(--danger)';

    return `
<div class="retailer-card">
  <div class="retailer-card-header" style="border-top:3px solid ${r.color}">
    <div class="retailer-logo-circle" style="background:${r.color}22;border:2px solid ${r.color};color:${r.color}">
      ${esc(r.name[0])}
    </div>
    <div class="retailer-card-info">
      <h3>${esc(r.name)}</h3>
      <span class="retailer-id-badge">ID: ${esc(r.id)}</span>
    </div>
    <div class="retailer-card-actions">
      <button class="icon-btn" title="Editar" onclick="UIRetailers.showEditForm('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="icon-btn danger" title="Eliminar" onclick="UIRetailers.deleteRetailer('${esc(r.id)}')">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>
  </div>
  <div class="retailer-card-stats">
    <div class="rstat">
      <span class="rstat-v">${sku_count}</span>
      <span class="rstat-l">SKUs listados</span>
    </div>
    <div class="rstat">
      <span class="rstat-v">${in_stock}</span>
      <span class="rstat-l">En stock</span>
    </div>
    <div class="rstat">
      <span class="rstat-v" style="color:${compCol}">${avg_comp}%</span>
      <span class="rstat-l">Completitud prom.</span>
    </div>
  </div>
  <div class="retailer-comp-bar-track">
    <div class="retailer-comp-bar-fill" style="width:${avg_comp}%;background:${compCol}"></div>
  </div>
  <button class="btn-outline full-w" onclick="App.navigateTo('catalog');UICatalog.setRetailer('${esc(r.id)}')">
    Ver SKUs de ${esc(r.name)} →
  </button>
</div>`;
  }

  function showAddForm() {
    renderForm(null);
  }

  function showEditForm(id) {
    const retailer = DB.getRetailers().find(r => r.id === id);
    if (retailer) renderForm(retailer);
  }

  function renderForm(retailer) {
    const isEdit = !!retailer;
    const fmo = document.getElementById('retailer-form-overlay');
    const fm  = document.getElementById('retailer-form-modal');
    if (!fmo || !fm) return;

    fm.innerHTML = `
<div class="form-modal-header">
  <h2>${isEdit ? 'Editar Retailer' : 'Nuevo Retailer'}</h2>
  <button class="btn-close-sm" onclick="UIRetailers.closeForm()">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
  </button>
</div>
<div class="form-modal-body">
  <div class="form-group">
    <label>Nombre del Retailer *</label>
    <input type="text" id="rf-name" class="form-input" value="${esc(retailer?.name || '')}" placeholder="ej. Jumbo" maxlength="50">
  </div>
  <div class="form-group">
    <label>ID (slug único) *</label>
    <input type="text" id="rf-id" class="form-input" value="${esc(retailer?.id || '')}" placeholder="ej. jumbo" ${isEdit ? 'readonly' : ''} maxlength="30">
    ${!isEdit ? '<p class="form-hint">Solo letras minúsculas, números y guiones.</p>' : ''}
  </div>
  <div class="form-group">
    <label>Color de marca</label>
    <div class="color-pick-row">
      <input type="color" id="rf-color" class="color-picker" value="${esc(retailer?.color || '#4F6EF7')}">
      <span id="rf-color-label">${esc(retailer?.color || '#4F6EF7')}</span>
    </div>
  </div>
</div>
<div class="form-modal-footer">
  <button class="btn-outline" onclick="UIRetailers.closeForm()">Cancelar</button>
  <button class="btn-primary" onclick="UIRetailers.saveForm(${isEdit ? `'${esc(retailer.id)}'` : 'null'})">${isEdit ? 'Guardar cambios' : 'Agregar retailer'}</button>
</div>`;

    // Color input live update
    const colorInp = fm.querySelector('#rf-color');
    const colorLbl = fm.querySelector('#rf-color-label');
    colorInp?.addEventListener('input', () => { colorLbl.textContent = colorInp.value; });

    // Auto-slug from name
    if (!isEdit) {
      fm.querySelector('#rf-name')?.addEventListener('input', e => {
        const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        fm.querySelector('#rf-id').value = slug;
      });
    }

    fmo.classList.remove('hidden');
    setTimeout(() => fmo.classList.add('visible'), 10);
  }

  function saveForm(existingId) {
    const fm   = document.getElementById('retailer-form-modal');
    const name  = fm.querySelector('#rf-name')?.value.trim();
    const id    = fm.querySelector('#rf-id')?.value.trim();
    const color = fm.querySelector('#rf-color')?.value;

    if (!name) return App.showToast('El nombre es requerido', 'error');
    if (!id)   return App.showToast('El ID es requerido', 'error');
    if (!/^[a-z0-9-]+$/.test(id)) return App.showToast('El ID solo puede contener letras minúsculas, números y guiones', 'error');

    if (existingId) {
      DB.updateRetailer(existingId, { name, color });
      App.showToast(`Retailer "${name}" actualizado`, 'success');
    } else {
      const existing = DB.getRetailers().find(r => r.id === id);
      if (existing) return App.showToast('Ya existe un retailer con ese ID', 'error');
      DB.addRetailer({ id, name, color });
      App.showToast(`Retailer "${name}" agregado`, 'success');
    }

    closeForm();
    render();
    App.renderSidebar(); // refresh sidebar retailer filters
  }

  function closeForm() {
    const fmo = document.getElementById('retailer-form-overlay');
    if (!fmo) return;
    fmo.classList.remove('visible');
    setTimeout(() => fmo.classList.add('hidden'), 250);
  }

  function deleteRetailer(id) {
    const r = DB.getRetailers().find(r => r.id === id);
    if (!r) return;
    if (!confirm(`¿Eliminar el retailer "${r.name}"?\n\nLos datos de este retailer en cada producto serán borrados.`)) return;

    // Remove from all products
    const products = DB.getProductsArray();
    products.forEach(p => {
      if (p.retailers?.[id]) {
        delete p.retailers[id];
        DB.saveProduct(p);
      }
    });

    DB.deleteRetailer(id);
    App.showToast(`Retailer "${r.name}" eliminado`, 'success');
    render();
    App.renderSidebar();
  }

  return { render, showAddForm, showEditForm, saveForm, deleteRetailer, closeForm };
})();
