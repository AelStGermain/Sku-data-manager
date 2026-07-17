import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Firebase Config ───────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, onSnapshot, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD486cV5aa3chf6zeq8Cr28dnXT5XAbQgY",
  authDomain: "levantamiento-sku.firebaseapp.com",
  projectId: "levantamiento-sku",
  storageBucket: "levantamiento-sku.firebasestorage.app",
  messagingSenderId: "322919219291",
  appId: "1:322919219291:web:1ead3108065ea1e66d7f7e",
};

const fbApp = initializeApp(firebaseConfig);
const fbDb = getFirestore(fbApp);
// ──────────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

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

// ── Helper: Open Food Facts Enrichment ─────────────────────────────────────
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
          name: p.product_name || p.product_name_es || null,
          brand: p.brands || null,
          imageUrl: p.image_url || null,
          masterCategory: p.categories ? p.categories.split(',')[0].trim().toUpperCase() : null
        };
      }
    }
  } catch(e) {
    console.warn(`[API] Falla al enriquecer ${ean}: ${e.message}`);
  }
  return null;
}

// ── Servicio: Sincronización Firebase a SQLite ────────────────────────────
let isSyncing = false;
async function syncFirebaseToCatalog(force = false) {
  if (isSyncing) return { success: false, error: 'Sync ya en progreso' };
  isSyncing = true;
  
  try {
    const master = getMaster();
    // Guardar timestamp del último sync local para no traer todo de nuevo si no es force
    const lastSyncFile = path.join(dataDir, 'last_fb_sync.json');
    let lastSync = 0;
    if (fs.existsSync(lastSyncFile) && !force) {
      lastSync = Number(fs.readFileSync(lastSyncFile, 'utf8'));
    }
    
    let fbQuery;
    if (lastSync > 0) {
      // Filtrar solo creados recientemente
      fbQuery = query(collection(fbDb, "levantamientos"), where("timestamp", ">", new Date(lastSync).toISOString()));
    } else {
      // Fetch completo
      fbQuery = collection(fbDb, "levantamientos");
    }

    const snapshot = await getDocs(fbQuery);
    if (snapshot.empty) {
      fs.writeFileSync(lastSyncFile, String(Date.now()));
      return { success: true, count: 0, message: 'No hay nuevos datos' };
    }

    let added = 0;
    let updated = 0;
    const sinEanList = [];

    for (const doc of snapshot.docs) {
      const reg = { id: doc.id, ...doc.data() };
      const eanStr = String(reg.ean || '').trim().replace(/\D/g, '');
      const timestamp = reg.timestamp || new Date().toISOString();
      const holding = reg.holdingId || reg.holding || 'tottus'; // Default o resuelto
      const dmu = reg.dmu || reg.pasillo || reg.categoria || '';

      if (!eanStr || eanStr.length < 8) {
        // Ignorar sin EAN de master_catalog, pero devolverlos al frontend para staging
        sinEanList.push({
          firebaseId: reg.id,
          holdingId: holding,
          dmu,
          pasillo: reg.pasillo || '',
          local: reg.local || '',
          category: reg.categoria || '',
          auditor: reg.auditor || 'App Terreno',
          timestamp,
          firebaseName: reg.productoWeb || reg.nombreProductoOCR || '',
          firebasePrice: reg.precioWeb || reg.precioOCR || null,
          estado: reg.estado || null,
          source: 'Firebase'
        });
        continue;
      }
      
      const idx = master.findIndex(p => p.ean === eanStr);
      let existing = idx > -1 ? master[idx] : null;

      let nombre = reg.productoWeb || reg.nombreProductoOCR || (existing ? existing.name : '');
      let category = existing?.universalCategory || reg.categoria || 'GROCERY STORE';
      let brand = reg.marcaWeb || (existing ? existing.brand : null) || 'Por Definir';
      let imageUrl = reg.imagenProductoWeb || (existing ? existing.imageUrl : null) || null;

      if (!nombre && !existing) {
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
        auditor: reg.auditor || 'App Terreno',
        dmu,
        pasillo: reg.pasillo || '',
        local: reg.local || '',
        holdingId: holding,
        timestamp,
        firebaseId: reg.id,
        estado: reg.estado || null
      };

      if (existing) {
        master[idx] = {
          ...existing,
          name: (!existing.name || existing.name === 'Nuevo SKU de Terreno') ? nombre : existing.name,
          brand: (!existing.brand || existing.brand === 'Por Definir') ? brand : existing.brand,
          imageUrl: !existing.imageUrl ? imageUrl : existing.imageUrl,
          levantamientoMeta,
          fromLevantamiento: true,
          dataSource: 'levantamiento'
        };
        updated++;
      } else {
        master.push({
          ean: eanStr,
          name: nombre,
          brand,
          imageUrl,
          universalCategory: category,
          visperaId: null,
          status: 'review',
          dataSource: 'levantamiento',
          fromLevantamiento: true,
          offAttempted: false,
          levantamientoMeta,
          holdings: {}
        });
        added++;
      }
    }

    saveMaster(master);
    fs.writeFileSync(lastSyncFile, String(Date.now()));
    return { success: true, count: snapshot.size, added, updated, sinEanList };

  } catch(e) {
    console.error('[Firebase Sync Error]', e.message);
    return { success: false, error: e.message };
  } finally {
    isSyncing = false;
  }
}

// Background Cron Job (cada 1 hora = 3600000 ms)
setInterval(() => {
  console.log('⏰ [Cron] Ejecutando auto-sync Firebase...');
  syncFirebaseToCatalog().then(res => console.log('   Resultado:', res));
}, 3600000);

// ── API: Sync Endpoint ────────────────────────────────────────────────────
app.post('/api/sync-firebase', async (req, res) => {
  const { force } = req.body || {};
  const result = await syncFirebaseToCatalog(force);
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

// ── Ruta catch-all: devolver index.html para navegación SPA ───────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`\n🟢 Smart Shelf Local Backend ON`);
  console.log(`   → App:  http://localhost:${port}`);
  console.log(`   → API:  http://localhost:${port}/api/products`);
  console.log(`   → Data: ${dataDir}\n`);
});
