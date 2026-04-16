'use strict';

const Importer = (() => {

  // ────────────────────────────────────────────
  //  NORMALIZATION  (accent-insensitive, case-insen.)
  // ────────────────────────────────────────────
  function normalize(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
      .replace(/[^a-z0-9]/g, '');                        // keep alphanumeric only
  }

  function findColumn(headers, ...candidates) {
    const norms = candidates.map(normalize);
    return headers.find(h => {
      const nh = normalize(h);
      return norms.some(c =>
        nh === c ||
        nh.includes(c) ||
        (c.length > 3 && c.includes(nh))
      );
    }) || '';
  }

  // ────────────────────────────────────────────
  //  AUTO-DETECT  (returns full mapping object)
  // ────────────────────────────────────────────
  function autoDetect(headers) {
    const f = (...c) => findColumn(headers, ...c);
    return {
      ean:          f('ean','barcode','codigo','codigobarra','codigobarras','codbar','codbarra','barras','gtin','upc','ean13','ean14','dun14','isbn'),
      name:         f('nombre','name','descripcion','description','producto','nom','desc','nombreproducto','nombredescripcion','nombrecomercial','articulo','item','titulo'),
      brand:        f('marca','brand','fabricante','proveedor','maker','manufacturer','lab','laboratorio'),
      packageType:  f('paquete','package','tipo','empaque','envase','presentacion','formato','tipoenvase','tipopaquete','tipoformato'),
      weight:       f('peso','weight','gramaje','gramos','g','kg','pesoneto','pesog','pesokge','contenido','neto','ml','litro'),
      width:        f('ancho','width','anchura','dim_ancho','dimw'),
      height:       f('alto','height','altura','dim_alto','dimh','long'),
      depth:        f('profundidad','depth','largo','fondo','din_prof','dimd'),
      customerId:   f('idretailer','retailerid','sku','idinterno','codinterno','codigointerno','skuinterno','articuloid','itemid','productid','customerid','codigocomercial','codcomercial','skucentral','codigocliente','idcliente','skuproveedor'),
      retailerName: f('nombreretailer','descripcionretailer','nombresupermercado','nombretienda','desctienda'),
      category:     f('categoria','category','departamento','department','seccion','rubro','linea','familia','sub','subcategoria','cat','depto'),
      retailerImage:f('imagen','image','foto','photo','url','imageurl','imgurl','fotoproducto','imagenproducto'),
    };
  }

  // How many fields were auto-detected (excluding required ean)
  function detectSummary(mapping, headers) {
    const all = Object.keys(mapping);
    const detected = all.filter(k => mapping[k] && headers.includes(mapping[k]));
    return { total: all.length, detected: detected.length, detectedKeys: detected };
  }

  // ────────────────────────────────────────────
  //  FILE READING
  // ────────────────────────────────────────────
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

  // ────────────────────────────────────────────
  //  APPLY MAPPING → product objects
  // ────────────────────────────────────────────
  function applyMapping(rows, mapping, retailerId) {
    const get = (row, col) => col ? (row[col] || '').toString().trim() : null;
    const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };

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
            customerId:  get(row, mapping.customerId)    || null,
            name:        rName,
            category:    get(row, mapping.category)      || null,
            stockStatus: true,
            imageUrl:    get(row, mapping.retailerImage) || null,
            updatedAt:   new Date().toISOString()
          };
        }

        return product;
      })
      .filter(Boolean);
  }

  // ────────────────────────────────────────────
  //  CONFLICT ANALYSIS
  // ────────────────────────────────────────────
  function analyzeConflicts(mappedProducts) {
    const conflicts = [];
    const news      = [];
    mappedProducts.forEach(p => {
      const existing = DB.getProduct(p.ean);
      if (existing) conflicts.push({ incoming: p, existing });
      else          news.push(p);
    });
    return { conflicts, news, total: mappedProducts.length };
  }

  // ────────────────────────────────────────────
  //  MERGE WITH MODE
  //    mode: 'fill_empty' | 'overwrite' | 'skip'
  // ────────────────────────────────────────────
  function mergeWithMode(existing, incoming, mode) {
    if (!existing) return { ...incoming, createdAt: new Date().toISOString() };
    if (mode === 'skip') return null;  // caller checks for null → skip

    const merged = { ...existing };
    const masterFields = ['name','brand','packageType','width_cm','height_cm','depth_cm','weight_g','imageUrl'];

    if (mode === 'overwrite') {
      masterFields.forEach(f => {
        if (incoming[f] !== null && incoming[f] !== undefined && incoming[f] !== '') merged[f] = incoming[f];
      });
    } else { // fill_empty
      masterFields.forEach(f => { if (!merged[f] && incoming[f]) merged[f] = incoming[f]; });
    }

    // Merge retailers
    merged.retailers = merged.retailers || {};
    Object.entries(incoming.retailers || {}).forEach(([rid, rData]) => {
      if (!merged.retailers[rid]) {
        merged.retailers[rid] = rData;
      } else if (mode === 'overwrite') {
        merged.retailers[rid] = { ...merged.retailers[rid], ...rData, updatedAt: new Date().toISOString() };
      } else {
        Object.keys(rData).forEach(k => {
          if (!merged.retailers[rid][k] && rData[k]) merged.retailers[rid][k] = rData[k];
        });
      }
    });

    return merged;
  }

  // ────────────────────────────────────────────
  //  IMPORT WITH MODE → detailed results
  // ────────────────────────────────────────────
  function importWithMode(mappedProducts, mode) {
    let created = 0, updated = 0, skipped = 0;
    const conflictLog = [];

    mappedProducts.forEach(incoming => {
      const existing = DB.getProduct(incoming.ean);
      if (existing) {
        if (mode === 'skip') {
          skipped++;
          conflictLog.push({ ean: incoming.ean, name: existing.name || incoming.name, action: 'skipped' });
          return;
        }
        const merged = mergeWithMode(existing, incoming, mode);
        if (!merged) { skipped++; return; }
        DB.saveProduct(merged);
        updated++;
        conflictLog.push({ ean: incoming.ean, name: merged.name || incoming.name, action: 'updated' });
      } else {
        DB.saveProduct({ ...incoming, createdAt: new Date().toISOString() });
        created++;
      }
    });

    return { created, updated, skipped, conflictLog };
  }

  // Legacy (kept for compatibility)
  function importProducts(mappedProducts) {
    return importWithMode(mappedProducts, 'fill_empty');
  }

  return {
    normalize, findColumn, autoDetect, detectSummary,
    readFile, applyMapping,
    analyzeConflicts, mergeWithMode, importWithMode, importProducts
  };
})();
