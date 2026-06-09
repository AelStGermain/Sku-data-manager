'use strict';

const UIApi = (function () {
  const MOCK_GABRIEL_JSON = `{
  "origen": "PWA Offline GABOLab",
  "dmu_session_id": "DMU-90214",
  "auditor": "Gabriel Hermosilla",
  "timestamp": "2026-04-21T10:00:00Z",
  "holding_id": "tottus",
  "tienda_id": "tkm_kennedy",
  "pasillo": "ACEITES",
  "items": [
    {
      "ean": "7801320242247",
      "ocr_name": "ACEITE OLIVA TALL",
      "foto_fleje_url": "https://img.ejemplo/fleje.jpg"
    },
    {
      "ean": "7801420002192",
      "ocr_name": "ACEITE ARROZ TUCAP",
      "foto_fleje_url": "https://img.ejemplo/fleje2.jpg"
    },
    {
      "ean": "",
      "ocr_name": "UNDEFINED_BARCODE"
    }
  ]
}`;

  let _terminalLines = [];
  let _terminalElement = null;

  function render() {
    const el = document.getElementById('view-api');
    if (!el) return;

    el.innerHTML = `
      <header class="app-header">
        <div class="hdr-left">
          <h1 class="app-title">API & Integraciones (ETL)</h1>
          <span class="badge" style="background:var(--accent)">Developer Sandbox</span>
        </div>
      </header>
      <div class="main-content" style="padding: 20px; display:flex; flex-direction:column; gap: 20px; height: calc(100vh - 60px);">
        
        <div style="display:flex; gap:20px; flex:1; overflow:hidden;">
          <!-- Left Panel: Webhook Input -->
          <div style="flex:1; display:flex; flex-direction:column; gap:10px; background:var(--card-bg); padding:20px; border-radius:12px; border:1px solid var(--border);">
            <h3>📥 Simular Entrada (Webhook de Captura)</h3>
            <p style="color:var(--text-light); font-size:13px; margin:0;">Inyecta un JSON Payload para probar el flujo de asimilación relacional hacia la Base de Datos Central.</p>
            <textarea id="api-payload-input" style="flex:1; width:100%; border-radius:8px; border:1px solid var(--border); background:#1e1e1e; color:#d4d4d4; padding:15px; font-family:monospace; font-size:13px; resize:none;">${MOCK_GABRIEL_JSON}</textarea>
            <div style="display:flex; justify-content:flex-end; gap:10px;">
              <button class="btn-clear" onclick="document.getElementById('api-payload-input').value=''">Limpiar</button>
              <button class="btn-teal" onclick="UIApi.simulateWebhook()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Procesar Ingesta
              </button>
            </div>
          </div>

          <!-- Right Panel: Terminal Log -->
          <div style="flex:1; display:flex; flex-direction:column; gap:10px; background:var(--card-bg); padding:20px; border-radius:12px; border:1px solid var(--border);">
            <h3>⚙️ Consola de Extracción (Log ETL)</h3>
            <p style="color:var(--text-light); font-size:13px; margin:0;">Registros del Backend de Fase 2 particionando datos hacia MASTER_SKU y HOLDING_SKU.</p>
            <div id="api-terminal" style="flex:1; border-radius:8px; background:#0f0f15; padding:15px; overflow-y:auto; font-family:monospace; font-size:12px; color:#4af; line-height:1.5;">
               > Base de Datos a la espera de peticiones...
            </div>
          </div>
        </div>
        
        <!-- Bottom Strip: Clean Data Output -->
        <div style="padding: 20px; border-radius:12px; border:1px solid var(--border); background:var(--card-bg);">
           <div style="display:flex; justify-content:space-between; align-items:center;">
             <div>
               <h3 style="margin:0 0 5px 0;">📤 Consultar Endpoint de Datos Limpios (Fase 3/4)</h3>
               <p style="color:var(--text-light); font-size:13px; margin:0;">Exportar las Vistas Rest API Limpias consumidas por los Dashboards de Josip o escaneadas por Sebas.</p>
             </div>
             <button class="btn-outline" style="min-width:200px; font-weight:600;" onclick="UIApi.generateOutputJSON()">
               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
               GET /master-data
             </button>
           </div>
        </div>
      </div>
    `;
    _terminalElement = document.getElementById('api-terminal');
    _terminalLines = [];
    printLog('Sistema en Línea, Puerto 8080 listo.', '#aaa');
  }

  function printLog(msg, color = '#4af') {
    if (!_terminalElement) return;
    const time = new Date().toLocaleTimeString('es-CL', { hour12: false });
    _terminalLines.push(`<span style="color:#666">[${time}]</span> <span style="color:${color}">${msg}</span>`);
    _terminalElement.innerHTML = _terminalLines.join('<br>');
    _terminalElement.scrollTop = _terminalElement.scrollHeight;
  }

  async function simulateWebhook() {
    const input = document.getElementById('api-payload-input')?.value;
    if (!input) { App.showToast('No hay payload para probar', 'warning'); return; }

    _terminalLines = [];
    printLog('>> POST /webhook/vispera/ingest', '#fff');
    printLog('Iniciando pipeline de Ingesta ETL...', '#ffb74d');

    let data;
    try {
      data = JSON.parse(input);
    } catch {
      printLog('❌ ERROR HTTP 400: JSON Payload inválido. Rechazando petición.', '#f44');
      return;
    }

    printLog('Payload parsing OK. Validando estructura relacional...');
    await new Promise(r => setTimeout(r, 600));

    if (!data.items || !Array.isArray(data.items)) {
      printLog('❌ ERROR: Estructura incorrecta. No se encontró array \`items\`.', '#f44');
      return;
    }

    let processed = 0;
    
    try {
      printLog(`Autenticado: [${esc(data.origen)}]`);
      printLog(`Identificado Captura DMU: ${esc(data.dmu_session_id)} por Auditor: ${esc(data.auditor)}`);
      printLog(`Enviando ${data.items.length} SKUs al Endpoint Backend Vercel...`, '#aaa');
      
      const response = await fetch('/api/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok) {
        processed = result.processed;
        printLog(`  ➔ Respuesta 200 OK recibida desde el Servidor.`, '#6f6');
        
        // Log detallado de los resultados retornados por el servidor
        result.results.forEach(resItem => {
           printLog(`  ➔ SKU ${resItem.ean} asimilado en Master Catalog & Retailer Catalog.`, '#4af');
        });

        printLog('────────────────────────────────────────');
        printLog(`✅ Tarea ETL Satisfactoria. ${processed} registros procesados remotamente y guardados en Supabase.`, '#0f0');
        
        App.showToast('Ingesta procesada en la base de datos central', 'success');
        if (window.App) window.App.refreshData(); // Refrescar catálogos
      } else {
        printLog(`❌ ERROR HTTP ${response.status}: ${result.error}`, '#f44');
      }

    } catch (err) {
      printLog(`❌ ERROR DE RED: No se pudo contactar al endpoint /api/webhook. Verifica si estás ejecutando en Vercel o un entorno compatible.`, '#f44');
      console.error(err);
    }
  }

  function generateOutputJSON() {
    printLog('>> GET /api/v1/master-data', '#fff');
    printLog('Alistando vista materializada "Data Limpia" para consumo externo (Josip/Sebas)...', '#ffb74d');
    
    setTimeout(() => {
      const data = DB.exportBackup();
      const blob = new Blob([data], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = `data_limpia_output_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      App.showToast('Endpoint JSON emitido correctamente', 'success');
      printLog(`✅ Respuesta HTTP 200 OK. JSON descargado por el cliente.`, '#0f0');
    }, 600);
  }

  function esc(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
  }

  return {
    render,
    simulateWebhook,
    generateOutputJSON
  };
})();
