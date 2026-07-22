'use strict';

const UIAvistamientos = (() => {
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function render() {
    const el = document.getElementById('view-avistamientos');
    if (!el) return;

    // Get all items that were captured in the field without EAN
    const unmatched = DB.getStagingUnmatched() || [];
    const items = unmatched.filter(p => p.isTentativeEAN === true || p.type === 'field_discovery');

    // CSS specific to avistamientos (can be inline since it's only here)
    const cardStyles = `
      <style>
        .avis-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .avis-row {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
          display: flex;
          align-items: stretch;
          transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
          cursor: pointer;
        }
        .avis-row:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.05);
          border-color: #d1d5db;
        }
        .avis-img-wrap {
          width: 140px;
          min-width: 140px;
          background: var(--surface-el);
          display: flex;
          align-items: center;
          justify-content: center;
          border-right: 1px solid var(--border);
          padding: 8px;
        }
        .avis-img-wrap img {
          max-width: 100%;
          max-height: 120px;
          object-fit: contain;
          border-radius: 6px;
        }
        .avis-body {
          padding: 16px;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .avis-title {
          font-weight: 700;
          font-size: 16px;
          color: var(--text-main);
          margin-bottom: 6px;
        }
        .avis-meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px 16px;
          font-size: 12px;
          color: var(--text-sec);
        }
        .avis-meta-grid strong {
          color: var(--text-main);
        }
        .avis-action {
          width: 280px;
          min-width: 280px;
          background: var(--bg-tertiary);
          border-left: 1px solid var(--border);
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .avis-action label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-sec);
          margin-bottom: 8px;
          display: block;
        }
      </style>
    `;

    // Removed double quotes inside onerror to avoid breaking the img tag
    const noImgHtml = "&lt;div style='color:#9ca3af;font-size:12px;text-align:center'&gt;Sin imagen&lt;/div&gt;";

    let cardsHtml = '';
    if (items.length === 0) {
      cardsHtml = `
        <div class="empty-state" style="padding:60px;">
          <div class="empty-icon">🔎</div>
          <h3>No hay avistamientos pendientes</h3>
          <p>Todos los SKUs de terreno han sido identificados con su EAN correspondiente.</p>
        </div>`;
    } else {
      // Usamos JSON.stringify para pasar el item a la funcion openEditField
      cardsHtml = `
        <div class="avis-list">
          ${items.map(item => `
            <div class="avis-row">
              <div class="avis-img-wrap" onclick='if(typeof UISheet !== "undefined") UISheet.openEditField(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                ${item.imageUrl 
                  ? `<img src="${esc(item.imageUrl)}" onerror="this.outerHTML='${noImgHtml}'">` 
                  : `<div style="color:var(--text-muted); text-align:center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`}
              </div>
              
              <div class="avis-body" onclick='if(typeof UISheet !== "undefined") UISheet.openEditField(${JSON.stringify(item).replace(/'/g, "&apos;")})'>
                <div class="avis-title">
                  ${esc(item.description || item.apiRawName || 'SKU Desconocido')}
                  <span style="font-size:11px; font-weight:normal; background:var(--accent-dim); color:var(--accent); padding:2px 6px; border-radius:4px; margin-left:8px; vertical-align:middle;">
                    ${esc(item.holdingId || 'Sin Holding')}
                  </span>
                </div>
                
                <div class="avis-meta-grid">
                  <div><strong>Marca:</strong> ${esc(item.brand || '—')}</div>
                  <div><strong>Pasillo / Góndola:</strong> ${esc(item.aisle || '—')}</div>
                  <div><strong>DMU:</strong> ${esc(item.dmu || '—')}</div>
                  <div><strong>ID Temp:</strong> <span class="mono" style="font-size:11px;">${esc(item.ean)}</span></div>
                  <div><strong>Nombre DMU:</strong> ${esc(item.dmuName || '—')}</div>
                  <div><strong>Fecha:</strong> ${new Date(item.timestamp || item.createdAt).toLocaleDateString('es-CL')}</div>
                </div>
              </div>
              
              <div class="avis-action" onclick="event.stopPropagation()">
                <label>ASIGNAR EAN DEFINITIVO:</label>
                <div style="display:flex; gap:6px; margin-bottom:12px;">
                  <input type="text" id="inline-ean-${esc(item.ean)}" class="form-input" style="flex:1; padding:8px; font-family:monospace; font-size:13px;" placeholder="Ej: 7801234...">
                  <button class="btn-primary" style="padding:8px 14px;" onclick="UIAvistamientos.resolveInline('${esc(item.ean)}')">OK</button>
                </div>
                <button class="btn-clear" style="width:100%; color:var(--danger); font-size:12px; padding:4px;" onclick="UIAvistamientos.deleteItem('${esc(item.ean)}')">
                  Descartar avistamiento
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    el.innerHTML = `
      ${cardStyles}
      <header class="view-header" style="margin-bottom:20px;">
        <div>
          <h1 class="view-title">Avistamientos (SKUs de Terreno)</h1>
        </div>
      </header>

      <div style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:24px; align-items:flex-start;">
        <div class="highlight-text" style="flex:1; min-width:300px; background-color:#fff3cd; border-left-color:#ffc107; color:#856404; margin:0;">
          <h4 style="margin:0 0 6px 0; font-size:14px; color:#856404;">¿Qué es esta sección?</h4>
          <p style="margin:0; font-size:13px;">
            Aquí se alojan productos fotografiados en góndola durante los entrenamientos que <strong>no pudieron ser identificados (no tienen EAN)</strong>. 
            Cualquier miembro del equipo puede revisar las fotos y descripciones de estos "avistamientos". Al descubrir el EAN real de un producto, ingrésalo en la tarjeta. 
            El sistema automáticamente buscará sus datos en internet, triangulará su Vispera ID y lo completará, enviándolo al Catálogo Maestro o a Revisión.
          </p>
        </div>
        
        <button class="btn-primary" style="padding:16px 24px; font-size:15px; font-weight:600; white-space:nowrap; background:#FF9800; border:none; box-shadow:0 4px 12px rgba(255,152,0,0.3); border-radius:8px;" onclick="if(typeof UISheet !== 'undefined') UISheet.openCreate('field')">
          + Reportar Avistamiento
        </button>
      </div>

      ${cardsHtml}
    `;
  }

  async function resolveInline(tempId) {
    const eanInput = document.getElementById(`inline-ean-${tempId}`);
    if (!eanInput) return;
    const realEan = eanInput.value.trim();
    if (!realEan) { App.showToast('Ingresa un EAN', 'error'); return; }

    const v = DB.validateEAN(realEan);
    if (!v.valid && !confirm('El EAN parece inválido. ¿Continuar de todos modos?')) return;

    const items = DB.getStagingUnmatched() || [];
    const item = items.find(i => i.ean === tempId);
    if (!item) return;

    if (typeof UISheet !== 'undefined') {
      UISheet.resolveAvistamiento(item, realEan);
    }
  }

  function deleteItem(tempId) {
    if (!confirm('¿Estás seguro de eliminar este avistamiento? No se puede recuperar.')) return;
    DB.removeStagingUnmatched(tempId);
    App.showToast('Avistamiento eliminado', 'info');
    render();
  }

  return {
    render,
    render,
    resolveInline,
    deleteItem
  };
})();
