'use strict';

const API = (() => {
  const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
  const OPF_BASE = 'https://world.openproductsfacts.org/api/v2/product';

  // ── fetch helpers ──────────────────────────
  async function _fetch(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 1) return null;
      return data.product;
    } catch {
      return null;
    }
  }
  // Pad EAN to 13 digits if it's 11 or 12 digits (UPC to EAN-13 conversion)
  function padEAN(ean) {
    let s = String(ean || '').trim();
    if (s.length === 11) return '00' + s;
    if (s.length === 12) return '0' + s;
    return s;
  }

  async function fetchFromOFF(ean) {
    const padded = padEAN(ean);
    let p = await _fetch(`${OFF_BASE}/${padded}.json`);
    if (!p && padded !== ean) p = await _fetch(`${OFF_BASE}/${ean}.json`); // fallback to literal
    if (!p) return null;
    return { ...parseProduct(p), dataSource: 'open_food_facts' };
  }

  async function fetchFromOPF(ean) {
    const padded = padEAN(ean);
    let p = await _fetch(`${OPF_BASE}/${padded}.json`);
    if (!p && padded !== ean) p = await _fetch(`${OPF_BASE}/${ean}.json`);
    if (!p) return null;
    return { ...parseProduct(p), dataSource: 'open_products_facts' };
  }

  // ── parser ─────────────────────────────────
  function parseProduct(p) {
    const num = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 10) / 10; };

    // Package type mapping
    let packageType = null;
    const pkg = (p.packaging || p.packaging_en || p.packaging_tags?.[0] || '').toLowerCase();
    if      (pkg.includes('bottle') || pkg.includes('botella'))                         packageType = 'bottle';
    else if (pkg.includes('can')    || pkg.includes('lata'))                            packageType = 'can';
    else if (pkg.includes('box')    || pkg.includes('caja') || pkg.includes('carton'))  packageType = 'box';
    else if (pkg.includes('bag')    || pkg.includes('bolsa') || pkg.includes('sachet')) packageType = 'bag';
    else if (pkg.includes('jar')    || pkg.includes('tarro') || pkg.includes('glass'))  packageType = 'jar';
    else if (pkg.includes('tetra')  || pkg.includes('brick'))                           packageType = 'tetrapack';
    else if (pkg.includes('tray')   || pkg.includes('bandeja'))                         packageType = 'tray';
    else if (pkg.includes('tube')   || pkg.includes('tubo'))                            packageType = 'tube';
    else if (pkg)                                                                       packageType = 'other';

    // Dimensions (OFF stores them in various fields)
    const width_cm  = num(p.product_quantity_unit === 'cm' ? null : p.width)  || null;
    const height_cm = num(p.height)  || null;
    const depth_cm  = num(p.depth)   || null;

    // Weight – prefer numeric quantity when unit is g
    let weight_g = null;
    const qty  = num(p.product_quantity);
    const unit = (p.product_quantity_unit || '').toLowerCase();
    if (qty) {
      if      (unit === 'g'  || unit === '') weight_g = qty;
      else if (unit === 'kg')                weight_g = qty * 1000;
      else if (unit === 'mg')                weight_g = qty / 1000;
      else                                   weight_g = qty; // unknown unit, store as-is
    }

    return {
      name:       p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || null,
      brand:      p.brands ? p.brands.split(',')[0].trim() : null,
      packageType,
      width_cm,
      height_cm,
      depth_cm,
      weight_g,
      imageUrl:   p.image_front_url || p.image_url || p.image_small_url || p.image_thumb_url || null
    };
  }

  // ── enrich single product ──────────────────
  async function enrichProduct(ean) {
    let data = await fetchFromOFF(ean);
    if (!data) data = await fetchFromOPF(ean);
    return data; // null if not found anywhere
  }

  // Enrich and mark offAttempted on the DB product
  async function enrichAndSave(ean) {
    const product = DB.getProduct(ean);
    if (!product) return null;
    const apiData = await enrichProduct(ean);
    const merged  = mergeEnriched(product, apiData);
    merged.offAttempted = true;
    DB.saveProduct(merged);
    return merged;
  }

  // ── batch enrichment with progress callback ─
  async function enrichBatch(eans, onProgress) {
    const results = {};
    for (let i = 0; i < eans.length; i++) {
      const ean = eans[i];
      results[ean] = await enrichProduct(ean);
      if (onProgress) onProgress(i + 1, eans.length, ean, results[ean]);
      await new Promise(r => setTimeout(r, 250)); // polite delay
    }
    return results;
  }

  // ── merge API data into existing product ───
  // Only fills in null/missing fields; never overwrites existing data
  function mergeEnriched(product, apiData) {
    if (!apiData) return product;
    const merged = { ...product };
    const fill = (field) => { if (!merged[field] && apiData[field]) merged[field] = apiData[field]; };
    ['name', 'brand', 'packageType', 'width_cm', 'height_cm', 'depth_cm', 'weight_g', 'imageUrl'].forEach(fill);
    // Track name source: only upgrade to 'off' if name was previously empty/import
    if (apiData.name && !product.name && merged.nameSource !== 'manual') merged.nameSource = 'off';
    if (apiData.dataSource && merged.dataSource === 'manual') merged.dataSource = apiData.dataSource;
    
    // Almacenar imagen explícita de OFF para la pestaña de fotos independiente
    if (apiData.imageUrl) merged.offImageUrl = apiData.imageUrl;
    
    merged.offAttempted = true;
    return merged;
  }

  return { fetchFromOFF, fetchFromOPF, enrichProduct, enrichAndSave, enrichBatch, mergeEnriched };
})();
