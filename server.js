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

const dataDir = path.join(__dirname, 'local_data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const masterFile = path.join(dataDir, 'master_catalog.json');
const retailerFile = path.join(dataDir, 'retailer_catalog.json');

if (!fs.existsSync(masterFile)) fs.writeFileSync(masterFile, '[]');
if (!fs.existsSync(retailerFile)) fs.writeFileSync(retailerFile, '[]');

function getMaster() { return JSON.parse(fs.readFileSync(masterFile, 'utf8')); }
function getRetailer() { return JSON.parse(fs.readFileSync(retailerFile, 'utf8')); }
function saveMaster(data) { fs.writeFileSync(masterFile, JSON.stringify(data, null, 2)); }
function saveRetailer(data) { fs.writeFileSync(retailerFile, JSON.stringify(data, null, 2)); }

app.get('/api/products', (req, res) => {
  const master = getMaster();
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
  
  let master = getMaster();
  let retailer = getRetailer();
  
  master = master.filter(p => !eans.includes(p.ean));
  retailer = retailer.filter(r => !eans.includes(r.ean));
  
  saveMaster(master);
  saveRetailer(retailer);
  
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Smart Shelf Local Backend running at http://localhost:${port}`);
  console.log(`Writing data to ${dataDir}`);
});
