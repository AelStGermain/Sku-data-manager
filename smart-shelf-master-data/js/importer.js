'use strict';

const Importer = (() => {

  // ── file reading ───────────────────────────
  function readFile(file) {
    return new Promise((resolve, reject) => {
      const ext = file.name.split('.').pop().toLowerCase();
      const reader = new FileReader();

      if (ext === 'csv') {
        reader.onload = e => {
          try {
            const results = Papa.parse(e.target.result, { header: true, skipEmptyLines: true });
            resolve({ headers: results.meta.fields || [], rows: results.data });
          } catch (err) { reject(err); }
        };
        reader.readAsText(file, 'UTF-8');

      } else if (ext === 'xlsx' || ext === 'xls') {
        reader.onload = e => {
          try {
            const wb = XLSX.read(e.target.result, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
            if (!raw.length) return resolve({ headers: [], rows: [] });
            const headers = raw[0].map(String);
            const rows = raw.slice(1).map(row => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = String(row[i] ?? ''); });
              return obj;
            });
            resolve({ headers, rows });
          } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);

      } else {
        reject(new Error('Formato no soportado. Use CSV o Excel (.xlsx, .xls)'));
      }
    });
  }

  // ── apply column mapping → product objects ──
  function applyMapping(rows, mapping, retailerId) {
    const get = (row, col) => col ? (row[col] || '').toString().trim() : null;
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };

    return rows
      .map(row => {
        const ean = get(row, mapping.ean);
        if (!ean || ean.length < 6) return null;

        const product = {
          ean,
          name:        get(row, mapping.name)        || null,
          brand:       get(row, mapping.brand)       || null,
          packageType: get(row, mapping.packageType) || null,
          width_cm:    num(get(row, mapping.width)),
          height_cm:   num(get(row, mapping.height)),
          depth_cm:    num(get(row, mapping.depth)),
          weight_g:    num(get(row, mapping.weight)),
          imageUrl:    null,
          dataSource:  'manual',
          retailers:   {}
        };

        if (retailerId) {
          const rName = get(row, mapping.retailerName) || product.name;
          product.retailers[retailerId] = {
            customerId:  get(row, mapping.customerId) || null,
            name:        rName,
            category:    get(row, mapping.category)   || null,
            stockStatus: true,
            imageUrl:    get(row, mapping.retailerImage) || null,
            updatedAt:   new Date().toISOString()
          };
        }

        return product;
      })
      .filter(Boolean);
  }

  // ── merge new product into existing one ────
  function merge(existing, incoming) {
    if (!existing) {
      return { ...incoming, createdAt: new Date().toISOString() };
    }
    const merged = { ...existing };
    // Master fields: only fill if empty
    const masterFields = ['name', 'brand', 'packageType', 'width_cm', 'height_cm', 'depth_cm', 'weight_g', 'imageUrl'];
    masterFields.forEach(f => { if (!merged[f] && incoming[f]) merged[f] = incoming[f]; });

    // Merge retailer entries
    merged.retailers = merged.retailers || {};
    Object.entries(incoming.retailers || {}).forEach(([rid, rData]) => {
      if (!merged.retailers[rid]) {
        merged.retailers[rid] = rData;
      } else {
        // Only fill empty retailer fields
        Object.keys(rData).forEach(k => {
          if (!merged.retailers[rid][k] && rData[k]) merged.retailers[rid][k] = rData[k];
        });
      }
    });

    return merged;
  }

  // ── import array of mapped products to DB ──
  function importProducts(mappedProducts) {
    let created = 0, updated = 0;
    mappedProducts.forEach(incoming => {
      const existing = DB.getProduct(incoming.ean);
      const merged   = merge(existing, incoming);
      DB.saveProduct(merged);
      existing ? updated++ : created++;
    });
    return { created, updated };
  }

  return { readFile, applyMapping, merge, importProducts };
})();
