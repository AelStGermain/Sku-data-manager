import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Firestore Admin SDK ──────────────────────────────────────────────────────────────────
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, 'local_data', 'firebase-key.json');
let db = null;
try {
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount)
    });
    db = getFirestore();
    console.log('[Firebase] Admin SDK inicializado correctamente.');
  } else {
    console.warn('[Firebase] Archivo firebase-key.json no encontrado. Las consultas fallarán.');
  }
} catch (e) {
  console.error('[Firebase] Error inicializando Admin SDK:', e.message);
}

// Consulta la colección levantamientos via Admin SDK. Devuelve array de documentos planos.
async function firestoreQuery({ sinceDate = null, pageSize = 2000 } = {}) {
  if (!db) throw new Error("Firebase Admin SDK no está inicializado. Falta firebase-key.json.");
  
  try {
    let query = db.collection('levantamientos')
      .select('ean', 'fecha', 'holding', 'holdingId', 'dmu', 'pasillo', 'categoria', 'local', 'auditor', 'productoWeb', 'marcaWeb', 'imagenProductoWeb', 'nombreProductoOCR', 'precioWeb', 'precioOCR', 'estado')
      .orderBy('fecha', 'desc');

    if (sinceDate) {
      query = query.where('fecha', '>=', sinceDate);
    }

    const snapshot = await query.get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      if (data.fecha && typeof data.fecha.toDate === 'function') {
        data.fecha = data.fecha.toDate().toISOString();
      }
      return { _id: doc.id, ...data };
    });

  } catch (e) {
    throw new Error(`Firestore SDK Error: ${e.message}`);
  }
}
// ──────────────────────────────────────────────────────────────────────────

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Servir archivos estáticos del frontend (on-premises) ──────────────────
app.use(express.static(path.join(__dirname)));

const dataDir = path.join(__dirname, 'local_data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// ── Rutas de archivos de datos ──────────────────────────────────────────
const masterFile    = path.join(dataDir, 'master_catalog.json');
const retailerFile  = path.join(dataDir, 'retailer_catalog.json');
const holdingsFile  = path.join(dataDir, 'holdings.json');
const storesFile    = path.join(dataDir, 'stores.json');

// Holdings por defecto (se usan si no hay archivo aún)
const DEFAULT_HOLDINGS = [
  { id: 'tottus',  name: 'Tottus',  color: '#E8001C', logoUrl: 'tottus_logo.png' },
  { id: 'jumbo',   name: 'Jumbo',   color: '#009A44', logoUrl: 'jumbo_logo.png' },
  { id: 'unimarc', name: 'Unimarc', color: '#005BAC', logoUrl: 'unimarc_logo.png' }
];

const DEFAULT_STORES = [
  { storeId: 'tkm_kennedy',         holdingId: 'tottus',  retailerId: 'tottus',  city: 'Santiago', branchName: 'Sucursal Kennedy' },
  { storeId: 'tottus_nunoa',        holdingId: 'tottus',  retailerId: 'tottus',  city: 'Santiago', branchName: 'Sucursal Ñuñoa' },
  { storeId: 'jumbo_bilbao',        holdingId: 'jumbo',   retailerId: 'jumbo',   city: 'Santiago', branchName: 'Sucursal Francisco Bilbao' },
  { storeId: 'jumbo_kennedy',       holdingId: 'jumbo',   retailerId: 'jumbo',   city: 'Santiago', branchName: 'Sucursal Portal La Reina' },
  { storeId: 'unimarc_los_leones',  holdingId: 'unimarc', retailerId: 'unimarc', city: 'Santiago', branchName: 'Sucursal Los Leones' }
];

// ── Inicializar archivos de datos si no existen ───────────────────────────
if (!fs.existsSync(masterFile))   fs.writeFileSync(masterFile,   '[]');
if (!fs.existsSync(retailerFile)) fs.writeFileSync(retailerFile, '[]');
if (!fs.existsSync(holdingsFile)) fs.writeFileSync(holdingsFile, JSON.stringify(DEFAULT_HOLDINGS, null, 2));
if (!fs.existsSync(storesFile))   fs.writeFileSync(storesFile,   JSON.stringify(DEFAULT_STORES,   null, 2));

// ── Helpers de lectura/escritura ───────────────────────────────────────────
function getMaster()   { return JSON.parse(fs.readFileSync(masterFile,   'utf8')); }
function getRetailer() { return JSON.parse(fs.readFileSync(retailerFile, 'utf8')); }
function getHoldings() { return JSON.parse(fs.readFileSync(holdingsFile, 'utf8')); }
function getStores()   { return JSON.parse(fs.readFileSync(storesFile,   'utf8')); }

function saveMaster(data)   { fs.writeFileSync(masterFile,   JSON.stringify(data, null, 2)); }
function saveRetailer(data) { fs.writeFileSync(retailerFile, JSON.stringify(data, null, 2)); }
function saveHoldings(data) { fs.writeFileSync(holdingsFile, JSON.stringify(data, null, 2)); }
function saveStores(data)   { fs.writeFileSync(storesFile,   JSON.stringify(data, null, 2)); }

// ── API: Productos (Master Catalog + Holding SKU Catalog) ─────────────────
app.get('/api/products', (req, res) => {
  const master   = getMaster();
  const retailer = getRetailer();
  res.json({ master_catalog: master, retailer_catalog: retailer });
});

app.post('/api/products', (req, res) => {
  const { product, holdingRelations } = req.body;
  const master = getMaster();
  
  const idx = master.findIndex(p => p.ean === product.ean);
  if (idx > -1) {
    // Merge preservando todos los campos, incluyendo status, data_source, etc.
    master[idx] = { ...master[idx], ...product };
  } else {
    master.push(product);
  }
  saveMaster(master);

  if (holdingRelations && holdingRelations.length > 0) {
    const retailer = getRetailer();
    holdingRelations.forEach(r => {
      const ridx = retailer.findIndex(rel => rel.ean === r.ean && rel.retailer_id === r.retailer_id);
      if (ridx > -1) {
        retailer[ridx] = { ...retailer[ridx], ...r };
      } else {
        r.uuid = r.uuid || (Math.random().toString(36).substring(2) + Date.now().toString(36));
        retailer.push(r);
      }
    });
    saveRetailer(retailer);
  }
  
  res.json({ success: true });
});

app.post('/api/products/bulk', (req, res) => {
  const { products, holdingRelations } = req.body;
  
  const master = getMaster();
  products.forEach(product => {
    const idx = master.findIndex(p => p.ean === product.ean);
    if (idx > -1) master[idx] = { ...master[idx], ...product };
    else master.push(product);
  });
  saveMaster(master);

  if (holdingRelations && holdingRelations.length > 0) {
    const retailer = getRetailer();
    holdingRelations.forEach(r => {
      const ridx = retailer.findIndex(rel => rel.ean === r.ean && rel.retailer_id === r.retailer_id);
      if (ridx > -1) retailer[ridx] = { ...retailer[ridx], ...r };
      else {
        r.uuid = r.uuid || (Math.random().toString(36).substring(2) + Date.now().toString(36));
        retailer.push(r);
      }
    });
    saveRetailer(retailer);
  }
  
  res.json({ success: true });
});

app.delete('/api/products', (req, res) => {
  const { eans } = req.body;
  if (!eans || !eans.length) return res.json({ success: false });
  
  let master   = getMaster();
  let retailer = getRetailer();
  
  master   = master.filter(p   => !eans.includes(p.ean));
  retailer = retailer.filter(r => !eans.includes(r.ean));
  
  saveMaster(master);
  saveRetailer(retailer);
  
  res.json({ success: true });
});

// ── API: Holdings ─────────────────────────────────────────────────────────
app.get('/api/holdings', (req, res) => {
  res.json(getHoldings());
});

app.post('/api/holdings', (req, res) => {
  // El body es directamente el array de holdings
  const holdings = req.body;
  if (!Array.isArray(holdings)) {
    return res.status(400).json({ success: false, error: 'Body debe ser un array de holdings' });
  }
  saveHoldings(holdings);
  res.json({ success: true, count: holdings.length });
});

// ── API: Stores (Sucursales Físicas) ──────────────────────────────────────
app.get('/api/stores', (req, res) => {
  const stores = getStores();
  const { holdingId } = req.query;
  if (holdingId && holdingId !== 'all') {
    return res.json(stores.filter(s => s.holdingId === holdingId || s.retailerId === holdingId));
  }
  res.json(stores);
});

app.post('/api/stores', (req, res) => {
  // El body es directamente el array de stores
  const stores = req.body;
  if (!Array.isArray(stores)) {
    return res.status(400).json({ success: false, error: 'Body debe ser un array de stores' });
  }
  saveStores(stores);
  res.json({ success: true, count: stores.length });
});

// ── Helper: Open Food Facts Enrichment ────────────────────────────────────
async function fetchEnrichment(ean) {
  try {
    const paddedEan = ean.length === 12 ? '0' + ean : ean;
    const url = `https://world.openfoodfacts.org/api/v2/product/${paddedEan}`;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id));
    if (res.ok) {
      const data = await res.json();
      if (data.status === 1 && data.product) {
        const p = data.product;
        return {
          name:           p.product_name || p.product_name_es || null,
          brand:          p.brands || null,
          imageUrl:       p.image_url || null,
          masterCategory: p.categories ? p.categories.split(',')[0].trim().toUpperCase() : null
        };
      }
    }
  } catch(e) {
    console.warn(`[API] Falla al enriquecer ${ean}: ${e.message}`);
  }
  return null;
}


// ── Servicio: Sincronización Firebase → Catalogo Maestro ─────────────────────
let isSyncing = false;
async function syncFirebaseToCatalog(force = false, since = null) {
  if (isSyncing) return { success: false, error: 'Sync ya en progreso' };
  isSyncing = true;

  try {
    const master = getMaster();
    const lastSyncFile = path.join(dataDir, 'last_fb_sync.json');
    let lastSync = 0;
    if (fs.existsSync(lastSyncFile) && !force) {
      lastSync = Number(fs.readFileSync(lastSyncFile, 'utf8'));
    }

    let sinceDate = null;
    if (since) {
      sinceDate = new Date(since);
    } else if (lastSync > 0) {
      sinceDate = new Date(lastSync);
    }

    console.log(`[Firebase Sync] Consultando via Admin SDK${sinceDate ? ` desde ${sinceDate.toISOString()}` : ' (todos)'}...`);
    let docs;
    try {
      docs = await firestoreQuery({ sinceDate, pageSize: 2000 });
    } catch(fetchErr) {
      console.error('[Firebase Sync] Error de red:', fetchErr.message);
      return { success: false, error: `Error de red: ${fetchErr.message}` };
    }
    console.log(`[Firebase Sync] Documentos encontrados: ${docs.length}`);

    if (docs.length === 0) {
      fs.writeFileSync(lastSyncFile, String(Date.now()));
      return { success: true, count: 0, added: 0, updated: 0, message: 'No hay nuevos datos en Firebase' };
    }

    let added = 0;
    let updated = 0;
    const sinEanList = [];

    for (const reg of docs) {
      // El campo de fecha es `fecha` (Timestamp), lo tratamos como string ISO
      const fechaRaw = reg.fecha;
      let timestamp;
      if (typeof fechaRaw === 'string') {
        timestamp = fechaRaw;
      } else {
        timestamp = new Date().toISOString();
      }
      
      const eanStr = String(reg.ean || '').trim().replace(/\D/g, '');
      const holding = reg.holdingId || reg.holding || 'tottus';
      const dmu = reg.dmu || reg.pasillo || reg.categoria || '';

      if (!eanStr || eanStr.length < 8) {
        sinEanList.push({
          firebaseId: reg.id,
          holdingId:  holding,
          dmu,
          pasillo:  reg.pasillo || '',
          local:    reg.local   || '',
          category: reg.categoria || '',
          auditor:  reg.auditor   || 'App Terreno',
          timestamp,
          firebaseName:  reg.productoWeb || reg.nombreProductoOCR || '',
          firebasePrice: reg.precioWeb   || reg.precioOCR         || null,
          estado: reg.estado || null,
          source: 'Firebase'
        });
        continue;
      }
      
      const idx = master.findIndex(p => p.ean === eanStr);
      let existing = idx > -1 ? master[idx] : null;

      let nombre    = reg.productoWeb || reg.nombreProductoOCR || (existing ? existing.name : '');
      let category  = existing?.universalCategory || reg.categoria || 'GROCERY STORE';
      let brand     = reg.marcaWeb || (existing ? existing.brand : null) || 'Por Definir';
      let imageUrl  = reg.imagenProductoWeb || (existing ? existing.imageUrl : null) || null;

      if (!nombre && !existing && docs.length <= 100) {
        const apiData = await fetchEnrichment(eanStr);
        if (apiData?.name) {
          nombre = apiData.name;
          if (apiData.masterCategory) category = apiData.masterCategory;
          if (apiData.brand && brand === 'Por Definir') brand = apiData.brand;
          if (apiData.imageUrl && !imageUrl) imageUrl = apiData.imageUrl;
        }
      }

      if (!nombre) nombre = 'Nuevo SKU de Terreno';

      const levantamientoMeta = {
        auditor:   reg.auditor || 'App Terreno',
        dmu,
        pasillo:   reg.pasillo || '',
        local:     reg.local   || '',
        holdingId: holding,
        timestamp,
        firebaseId: reg._id,
        estado: reg.estado || null
      };

      const holdingObj = {
        holdingInternalId: '',
        customerId: '',
        localProductName: nombre,
        name: nombre,
        localCategoryName: category,
        category: category,
        dmu: dmu,
        pasillo: reg.pasillo || '',
        local: reg.local || '',
        isActiveHolding: true,
        stockStatus: true,
        updatedAt: timestamp
      };

      if (existing) {
        const updatedProduct = {
          ...existing,
          name: (!existing.name || existing.name === 'Nuevo SKU de Terreno') ? nombre : existing.name,
          brand: (!existing.brand || existing.brand === 'Por Definir') ? brand : existing.brand,
          imageUrl: !existing.imageUrl ? imageUrl : existing.imageUrl,
          levantamientoMeta,
          fromLevantamiento: true,
          fromFirebase: true,
          dataSource: existing.dataSource === 'firebase' ? 'firebase' : (existing.dataSource || 'firebase'),
          // Preservar el status existente — no sobreescribir
          status: existing.status || 'review'
        };
        
        updatedProduct.holdings = updatedProduct.holdings || {};
        if (holding && !updatedProduct.holdings[holding]) {
          updatedProduct.holdings[holding] = holdingObj;
        }
        
        master[idx] = updatedProduct;
        updated++;
      } else {
        const newProduct = {
          ean: eanStr,
          name: nombre,
          brand,
          imageUrl,
          universalCategory: category,
          status: 'review',
          dataSource: 'firebase',
          fromLevantamiento: true,
          fromFirebase: true,
          offAttempted: false,
          levantamientoMeta,
          holdings: {}
        };
        
        if (holding) {
          newProduct.holdings[holding] = holdingObj;
        }
        
        master.push(newProduct);
        added++;
      }
    }

    saveMaster(master);
    fs.writeFileSync(lastSyncFile, String(Date.now()));
    return { success: true, count: docs.length, added, updated, sinEanList };

  } catch(e) {
    console.error('[Firebase Sync Error]', e.message);
    return { success: false, error: e.message };
  } finally {
    isSyncing = false;
  }
}

// ── Cron Job: Sync incremental cada 1 hora ──────────────────────────────
// El servidor es la fuente de verdad — los clientes solo leen, no sincronizan.
setInterval(() => {
  console.log('⏰ [Cron] Ejecutando sync incremental Firebase...');
  syncFirebaseToCatalog(false).then(res => {
    if (res.success && (res.added > 0 || res.updated > 0)) {
      console.log(`   ✅ Sync: +${res.added} nuevos, ~${res.updated} actualizados`);
    } else if (!res.success) {
      console.warn('   ⚠ Sync falló:', res.error);
    }
  });
}, 3600000); // 1 hora

// ── API: Sync Endpoint (solo para uso administrativo) ────────────────────
app.post('/api/sync-firebase', async (req, res) => {
  const { force, since } = req.body || {};
  // `since` puede ser una fecha ISO string (e.g. '2025-05-01') para traer
  // todos los registros desde esa fecha, ignorando el lastSync guardado
  const result = await syncFirebaseToCatalog(force, since || null);
  res.json(result);
});

app.get('/api/last-sync', (req, res) => {
  const lastSyncFile = path.join(dataDir, 'last_fb_sync.json');
  let lastSync = 0;
  if (fs.existsSync(lastSyncFile)) {
    lastSync = Number(fs.readFileSync(lastSyncFile, 'utf8'));
  }
  res.json({ lastSync });
});

// ── API: Staging Queues (Global Persistence) ──────────────────────────────
app.get('/api/staging/:key', (req, res) => {
  const key = req.params.key;
  // Sanitizamos el key para evitar path traversal
  const safeKey = key.replace(/[^a-z0-9_]/gi, '');
  const filePath = path.join(dataDir, `${safeKey}.json`);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  } else {
    res.json([]);
  }
});

app.post('/api/staging/:key', (req, res) => {
  const key = req.params.key;
  const safeKey = key.replace(/[^a-z0-9_]/gi, '');
  const filePath = path.join(dataDir, `${safeKey}.json`);
  const data = req.body;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  res.json({ success: true });
});

// ── Ruta catch-all: devolver index.html para navegación SPA ───────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`\n🟢 Smart Shelf Local Backend ON`);
  console.log(`   → App:  http://localhost:${port}`);
  console.log(`   → API:  http://localhost:${port}/api/products`);
  console.log(`   → Data: ${dataDir}\n`);

  // ── Sync inicial al arrancar el servidor ────────────────────────────────
  // El servidor es la fuente de verdad. Si nunca hubo sync (first run),
  // se traen TODOS los registros desde Mayo 2025 automáticamente.
  // Si ya hubo sync previo, solo se actualizan los nuevos (incremental).
  const lastSyncFile = path.join(dataDir, 'last_fb_sync.json');
  const isFirstRun = !fs.existsSync(lastSyncFile);

  if (isFirstRun) {
    console.log('🔄 [Startup] Primera ejecución: sincronizando Firebase desde Mayo 2025...');
    syncFirebaseToCatalog(true, '2025-05-01').then(res => {
      if (res.success) {
        console.log(`✅ [Startup] Sync inicial completo: +${res.added} SKUs nuevos, ~${res.updated} actualizados`);
        if (res.sinEanList && res.sinEanList.length > 0) {
          console.log(`   ${res.sinEanList.length} registros sin EAN (staging)`);
        }
      } else {
        console.warn('⚠ [Startup] Sync inicial falló:', res.error);
      }
    });
  } else {
    // Ya hubo sync: hacer un incremental rápido para traer lo más reciente
    console.log('🔄 [Startup] Verificando nuevos registros en Firebase...');
    syncFirebaseToCatalog(false).then(res => {
      if (res.success) {
        if (res.added > 0 || res.updated > 0) {
          console.log(`✅ [Startup] Sync incremental: +${res.added} nuevos, ~${res.updated} actualizados`);
        } else {
          console.log('✅ [Startup] Catálogo al día (sin cambios nuevos en Firebase)');
        }
      } else {
        console.warn('⚠ [Startup] Sync incremental falló:', res.error);
      }
    });
  }
});
