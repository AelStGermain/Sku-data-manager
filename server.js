import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
