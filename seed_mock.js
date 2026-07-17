import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const masterFile = path.join(__dirname, 'local_data', 'master_catalog.json');

const masterData = JSON.parse(fs.readFileSync(masterFile, 'utf8'));

const mocks = [
  {
    ean: "9990001110001",
    product_name: "Mock Bebida Energética",
    brand: "MockBrand",
    category_master: "BEBIDAS",
    data_source: "levantamiento",
    levantamientoMeta: {
      auditor: "Test Auditor 1",
      dmu: "BEBIDAS",
      pasillo: "Pasillo 1",
      local: "Sucursal Kennedy",
      holdingId: "tottus",
      timestamp: new Date().toISOString()
    }
  },
  {
    ean: "9990001110002",
    product_name: "Mock Galletas Chocolate",
    brand: "MockBrand",
    category_master: "SNACKS",
    data_source: "levantamiento",
    levantamientoMeta: {
      auditor: "Test Auditor 2",
      dmu: "SNACKS",
      pasillo: "Pasillo 4",
      local: "Sucursal Ñuñoa",
      holdingId: "jumbo",
      timestamp: new Date().toISOString()
    }
  },
  {
    ean: "9990001110003",
    product_name: "Mock Detergente Ropa",
    brand: "MockBrand",
    category_master: "LIMPIEZA",
    data_source: "levantamiento",
    levantamientoMeta: {
      auditor: "Test Auditor 1",
      dmu: "LIMPIEZA",
      pasillo: "Pasillo 8",
      local: "Sucursal Los Leones",
      holdingId: "unimarc",
      timestamp: new Date().toISOString()
    }
  }
];

mocks.forEach(m => {
  const idx = masterData.findIndex(p => p.ean === m.ean);
  if (idx > -1) {
    masterData[idx] = m;
  } else {
    masterData.push(m);
  }
});

fs.writeFileSync(masterFile, JSON.stringify(masterData, null, 2));
console.log('Mock data seeded successfully!');
