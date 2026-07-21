'use strict';

const API = (() => {
  const OFF_BASE = 'https://world.openfoodfacts.org/api/v2/product';
  const OPF_BASE = 'https://world.openproductsfacts.org/api/v2/product';

  // ── Request timeout helper ────────────────────
  function _fetchWithTimeout(url, ms = 8000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(id));
  }

  const _sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── Low-level fetch ────────────────────────────
  async function _fetch(url, retries = 5) {
    let delay = 1000;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await _fetchWithTimeout(url, 10000);
        if (res.ok) {
          const data = await res.json();
          if (data.status !== 1) return null;
          return data.product;
        }
        
        if (res.status === 429 || res.status >= 500) {
          console.warn(`API retry ${i+1}/${retries} for ${url} due to ${res.status}`);
          const jitter = Math.random() * 500;
          await _sleep(delay + jitter);
          delay *= 1.5; // Less aggressive backoff
          continue;
        }
        return null;
      } catch (err) {
        console.warn(`API network error ${i+1}/${retries} for ${url}`, err);
        // Fail fast on CORS or severe network errors to prevent UI freezing
        if (i >= 1) return null; 
        const jitter = Math.random() * 500;
        await _sleep(delay + jitter);
        delay *= 1.5;
      }
    }
    return null;
  }

  // Pad EAN to 13 digits (UPC-A → EAN-13)
  function padEAN(ean) {
    let s = String(ean || '').trim();
    if (s.length === 11) return '00' + s;
    if (s.length === 12) return '0' + s;
    return s;
  }

  async function fetchFromOFF(ean) {
    const padded = padEAN(ean);
    let p = await _fetch(`${OFF_BASE}/${padded}.json`);
    if (!p && padded !== ean) p = await _fetch(`${OFF_BASE}/${ean}.json`);
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

  // ── Category detection from OFF tags ──────────
  function _detectCategoryFromTags(tags = []) {
    const t = (tags || []).map(x => x.toLowerCase()).join(' ');
    if (t.includes('beverage') || t.includes('drink') || t.includes('bebida') || t.includes('juice') || t.includes('soda')) return 'Bebidas y Jugos';
    if (t.includes('dairy') || t.includes('milk') || t.includes('lacteo') || t.includes('yogurt') || t.includes('cheese')) return 'Lácteos y Huevos';
    if (t.includes('meat') || t.includes('carne') || t.includes('sausage') || t.includes('embutido')) return 'Carnes y Embutidos';
    if (t.includes('snack') || t.includes('chip') || t.includes('cracker') || t.includes('galleta') || t.includes('biscuit')) return 'Snacks y Galletas';
    if (t.includes('cereal') || t.includes('oat') || t.includes('avena') || t.includes('breakfast')) return 'Cereales y Desayuno';
    if (t.includes('pasta') || t.includes('rice') || t.includes('arroz') || t.includes('legume')) return 'Pasta, Arroz y Legumbres';
    if (t.includes('oil') || t.includes('aceite') || t.includes('sauce') || t.includes('salsa') || t.includes('condiment')) return 'Aceites, Salsas y Condimentos';
    if (t.includes('candy') || t.includes('chocolate') || t.includes('sweet') || t.includes('dulce')) return 'Dulces y Chocolates';
    if (t.includes('coffee') || t.includes('cafe') || t.includes('tea') || t.includes('te ') || t.includes('infusion')) return 'Café, Té e Infusiones';
    if (t.includes('frozen') || t.includes('congelado')) return 'Congelados';
    if (t.includes('bread') || t.includes('pan ') || t.includes('bakery') || t.includes('cake')) return 'Panadería y Repostería';
    if (t.includes('preserve') || t.includes('canned') || t.includes('conserva') || t.includes('enlatado')) return 'Conservas y Enlatados';
    if (t.includes('cleaning') || t.includes('limpieza') || t.includes('detergent') || t.includes('household')) return 'Limpieza del Hogar';
    if (t.includes('personal') || t.includes('hygiene') || t.includes('shampoo') || t.includes('soap') || t.includes('higiene')) return 'Cuidado Personal';
    if (t.includes('pet') || t.includes('dog') || t.includes('cat') || t.includes('mascota')) return 'Mascotas';
    if (t.includes('baby') || t.includes('infant') || t.includes('bebe')) return 'Bebé y Maternidad';
    return null;
  }

  // ── Parser ─────────────────────────────────────
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
    else if (pkg)                                                                        packageType = 'other';

    // Dimensions
    const width_cm  = num(p.width)  || null;
    const height_cm = num(p.height) || null;
    const depth_cm  = num(p.depth)  || null;

    // Weight
    let weight_g = null;
    const qty  = num(p.product_quantity);
    const unit = (p.product_quantity_unit || '').toLowerCase();
    if (qty) {
      if      (unit === 'g'  || unit === '') weight_g = qty;
      else if (unit === 'kg')                weight_g = qty * 1000;
      else if (unit === 'mg')                weight_g = qty / 1000;
      else                                   weight_g = qty;
    }
    if (!weight_g && p.quantity) {
      const qStr = String(p.quantity).toLowerCase().replace(',', '.');
      const m = qStr.match(/([\d\.]+)\s*(g|kg|ml|l|gr|grams|kilograms|litros|cc)/);
      if (m) {
        const val = parseFloat(m[1]);
        const u = m[2];
        if (['g','gr','grams','ml','cc'].includes(u)) weight_g = val;
        else if (['kg','kilograms','l','litros'].includes(u)) weight_g = val * 1000;
      }
    }

    // Category from tags
    const masterCategory = _detectCategoryFromTags(p.categories_tags || p.categories_hierarchy);

    return {
      name:          p.product_name_es || p.product_name || p.generic_name_es || p.generic_name || null,
      brand:         p.brands ? p.brands.split(',')[0].trim() : null,
      packageType,
      width_cm,
      height_cm,
      depth_cm,
      weight_g,
      masterCategory,
      imageUrl:      p.image_front_url || p.image_url || p.image_small_url || p.image_thumb_url || null
    };
  }

  // ── Nueva API Personalizada (Solotodo) ────────────────────
  async function fetchFromCustomAPI(ean) {
    try {
      const response = await fetch(`https://publicapi.solotodo.com/products/?search=${ean}`);
      if (!response.ok) return null;
      const json = await response.json();
      if (!json.results || json.results.length === 0) return null;
      
      const item = json.results[0];
      const specs = item.specs || {};
      
      // Verificar coincidencia estricta de EAN si la API devuelve algo parecido
      if (specs.ean && String(specs.ean) !== String(ean)) return null;

      // Calcular peso/volumen en gramos/ml
      let weight_g = null;
      if (specs.net_content) {
        const val = parseFloat(specs.net_content);
        const unit = (specs.net_content_unit_name || '').toLowerCase();
        if (unit.includes('mili') || unit === 'ml' || unit === 'g' || unit.includes('gramo') || unit === 'cc') {
          weight_g = val;
        } else if (unit.includes('litro') || unit === 'l' || unit === 'kg' || unit.includes('kilo')) {
          weight_g = val * 1000;
        }
      }
      
      return {
        name: item.name || null,
        brand: specs.brand_name || null,
        masterCategory: specs.subcategory_name || null,
        imageUrl: item.picture_url || null,
        weight_g: weight_g
      };
    } catch (err) {
      console.error("Error en Solotodo API:", err);
      return null;
    }
  }

  // ── Enrich single product ──────────────────────
  async function enrichProduct(ean) {
    let data = await fetchFromCustomAPI(ean); // PRIORIDAD 1: Tu nueva API
    if (!data) data = await fetchFromOFF(ean); // PRIORIDAD 2: Open Food Facts
    if (!data) data = await fetchFromOPF(ean); // PRIORIDAD 3: Open Products Facts
    return data; // null si no se encuentra en ninguna
  }

  // Enrich and save single product from DB
  async function enrichAndSave(ean) {
    const product = DB.getProduct(ean);
    if (!product) return null;
    const apiData = await enrichProduct(ean);
    const merged  = mergeEnriched(product, apiData);
    merged.offAttempted = true;
    DB.saveProduct(merged);
    return merged;
  }

  // ── Parallel batch enrichment ─────────────────
  // concurrency: how many simultaneous requests (default 5)
  // onItemDone(ean, apiData, idx, total): called as each item finishes
  async function enrichBatch(eans, onProgress, concurrency = 5) {
    const results = {};
    let completed = 0;
    const total = eans.length;

    // Process in chunks of `concurrency`
    for (let i = 0; i < total; i += concurrency) {
      const chunk = eans.slice(i, i + concurrency);
      const chunkResults = await Promise.all(
        chunk.map(async ean => {
          const data = await enrichProduct(ean);
          completed++;
          if (onProgress) onProgress(completed, total, ean, data);
          return { ean, data };
        })
      );
      chunkResults.forEach(({ ean, data }) => {
        results[ean] = data;
      });
    }
    return results;
  }

  // ── Merge API data into existing product ───────
  // Only fills in null/missing fields; never overwrites existing data
  function mergeEnriched(product, apiData) {
    if (!apiData) return product;
    const merged = { ...product };
    const fill = (field) => { if (!merged[field] && apiData[field]) merged[field] = apiData[field]; };
    ['name', 'brand', 'packageType', 'width_cm', 'height_cm', 'depth_cm', 'weight_g', 'imageUrl'].forEach(fill);

    // Fill masterCategory only if missing
    if (apiData.masterCategory && !merged.masterCategory) merged.masterCategory = apiData.masterCategory;

    // Track name source
    if (apiData.name && !product.name && merged.nameSource !== 'manual') merged.nameSource = 'off';
    if (apiData.dataSource && merged.dataSource !== 'manual') merged.dataSource = apiData.dataSource;

    // Store OFF image URL separately for the image tabs
    if (apiData.imageUrl) merged.offImageUrl = apiData.imageUrl;

    merged.offAttempted = true;
    merged.enrichFailed = false;
    return merged;
  }

  return { fetchFromCustomAPI, fetchFromOFF, fetchFromOPF, enrichProduct, enrichAndSave, enrichBatch, mergeEnriched };
})();
