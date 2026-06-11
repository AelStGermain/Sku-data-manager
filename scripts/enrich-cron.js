// ═══════════════════════════════════════════════════════════
//  SMART SHELF — SKU Enrichment CRON Script
//  Runs via GitHub Actions 2x/day.
//  Fetches unenriched products from Supabase master_catalog,
//  queries Open Food Facts + Open Products Facts,
//  and saves enriched data back.
// ═══════════════════════════════════════════════════════════
import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // service role key (not anon)
const CONCURRENCY  = 5;   // parallel requests
const TIMEOUT_MS   = 9000; // per-request timeout
const DELAY_MS     = 120;  // polite delay between chunks (ms)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── EAN padding (UPC-A → EAN-13) ────────────────────────
function padEAN(ean) {
  const s = String(ean || '').trim();
  if (s.length === 11) return '00' + s;
  if (s.length === 12) return '0'  + s;
  return s;
}

// ── Fetch with timeout ───────────────────────────────────
async function fetchJSON(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = await res.json();
    return data.status === 1 ? data.product : null;
  } catch {
    clearTimeout(id);
    return null;
  }
}

// ── Query a single EAN against one base URL ──────────────
async function queryBase(baseUrl, ean) {
  const padded = padEAN(ean);
  let p = await fetchJSON(`${baseUrl}/${padded}.json`);
  if (!p && padded !== String(ean)) p = await fetchJSON(`${baseUrl}/${ean}.json`);
  return p;
}

// ── Parse product from OFF/OPF response ─────────────────
function parseProduct(p, source) {
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : Math.round(n * 10) / 10; };

  // Package type
  let packageType = null;
  const pkg = (p.packaging || p.packaging_tags?.[0] || '').toLowerCase();
  if      (pkg.includes('bottle') || pkg.includes('botella'))   packageType = 'bottle';
  else if (pkg.includes('can')    || pkg.includes('lata'))       packageType = 'can';
  else if (pkg.includes('box')    || pkg.includes('caja'))       packageType = 'box';
  else if (pkg.includes('bag')    || pkg.includes('bolsa'))      packageType = 'bag';
  else if (pkg.includes('jar')    || pkg.includes('tarro'))      packageType = 'jar';
  else if (pkg.includes('tetra')  || pkg.includes('brick'))      packageType = 'tetrapack';
  else if (pkg.includes('tray')   || pkg.includes('bandeja'))    packageType = 'tray';
  else if (pkg.includes('tube')   || pkg.includes('tubo'))       packageType = 'tube';
  else if (pkg)                                                   packageType = 'other';

  // Weight
  let weight_g = null;
  const qty  = num(p.product_quantity);
  const unit = (p.product_quantity_unit || '').toLowerCase();
  if (qty) {
    if      (['g','','gr','grams','ml','cc'].includes(unit)) weight_g = qty;
    else if (unit === 'kg' || unit === 'l')                  weight_g = qty * 1000;
    else if (unit === 'mg')                                  weight_g = qty / 1000;
  }
  if (!weight_g && p.quantity) {
    const m = String(p.quantity).toLowerCase().replace(',','.').match(/([\d.]+)\s*(g|kg|ml|l|gr|cc)/);
    if (m) {
      const val = parseFloat(m[1]);
      weight_g = ['kg','l'].includes(m[2]) ? val * 1000 : val;
    }
  }

  // Category from tags
  const tags = (p.categories_tags || []).map(x => x.toLowerCase()).join(' ');
  let masterCategory = null;
  if (tags.match(/beverage|drink|bebida|juice|soda/))              masterCategory = 'Bebidas y Jugos';
  else if (tags.match(/dairy|milk|lacteo|yogurt|cheese/))          masterCategory = 'Lácteos y Huevos';
  else if (tags.match(/snack|chip|cracker|galleta|biscuit/))       masterCategory = 'Snacks y Galletas';
  else if (tags.match(/cereal|oat|avena|breakfast/))               masterCategory = 'Cereales y Desayuno';
  else if (tags.match(/pasta|rice|arroz|legume/))                  masterCategory = 'Pasta, Arroz y Legumbres';
  else if (tags.match(/oil|aceite|sauce|salsa|condiment/))         masterCategory = 'Aceites, Salsas y Condimentos';
  else if (tags.match(/candy|chocolate|sweet|dulce/))              masterCategory = 'Dulces y Chocolates';
  else if (tags.match(/coffee|cafe|tea|infusion/))                 masterCategory = 'Café, Té e Infusiones';
  else if (tags.match(/frozen|congelado/))                         masterCategory = 'Congelados';
  else if (tags.match(/cleaning|limpieza|detergent|household/))    masterCategory = 'Limpieza del Hogar';
  else if (tags.match(/personal|hygiene|shampoo|soap/))            masterCategory = 'Cuidado Personal';
  else if (tags.match(/pet|dog|cat|mascota/))                      masterCategory = 'Mascotas';
  else if (tags.match(/baby|infant|bebe/))                         masterCategory = 'Bebé y Maternidad';

  return {
    name:          p.product_name_es || p.product_name || p.generic_name_es || null,
    brand:         p.brands ? p.brands.split(',')[0].trim() : null,
    packageType,
    weight_g,
    width_cm:      num(p.width)  || null,
    height_cm:     num(p.height) || null,
    depth_cm:      num(p.depth)  || null,
    imageUrl:      p.image_front_url || p.image_url || null,
    masterCategory,
    dataSource:    source,
    offAttempted:  true,
    enrichFailed:  false,
    updatedAt:     new Date().toISOString()
  };
}

// ── Enrich a single EAN ──────────────────────────────────
async function enrichEAN(ean) {
  const OFF = 'https://world.openfoodfacts.org/api/v2/product';
  const OPF = 'https://world.openproductsfacts.org/api/v2/product';

  let p = await queryBase(OFF, ean);
  if (p) return parseProduct(p, 'open_food_facts');

  p = await queryBase(OPF, ean);
  if (p) return parseProduct(p, 'open_products_facts');

  return null; // not found in either
}

// ── Merge: only fill missing fields, never overwrite ─────
function mergeData(existing, incoming) {
  const out = {};
  const fill = f => {
    if (incoming[f] != null && incoming[f] !== '' && !existing[f]) out[f] = incoming[f];
  };
  ['name','brand','packageType','weight_g','width_cm','height_cm','depth_cm','image_url','masterCategory'].forEach(fill);

  // Always update these metadata fields
  out.off_attempted  = true;
  out.enrich_failed  = !incoming;
  out.updated_at     = new Date().toISOString();
  if (incoming?.dataSource) out.data_source = incoming.dataSource;

  return out;
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Smart Shelf — SKU Enrichment CRON');
  console.log(`   ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Fetch products that haven't been enriched yet
  //    Filter: off_attempted is null or false
  const { data: products, error } = await supabase
    .from('master_catalog')
    .select('ean, product_name, brand, image_url, off_attempted')
    .or('off_attempted.is.null,off_attempted.eq.false')
    .limit(200); // cap per run to avoid rate limits

  if (error) {
    console.error('❌ Error fetching products from Supabase:', error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log('✅ All products are already enriched. Nothing to do.');
    return;
  }

  console.log(`\n📦 Found ${products.length} products to enrich\n`);

  let found = 0, notFound = 0, errors = 0;
  const eans = products.map(p => p.ean);

  // 2. Process in parallel chunks
  for (let i = 0; i < eans.length; i += CONCURRENCY) {
    const chunk = eans.slice(i, i + CONCURRENCY);

    await Promise.all(chunk.map(async ean => {
      try {
        const existing = products.find(p => p.ean === ean) || {};
        const apiData  = await enrichEAN(ean);

        if (apiData) {
          // Build the update payload — only fill empty fields
          const update = {};
          if (!existing.product_name && apiData.name)   update.product_name    = apiData.name;
          if (!existing.brand        && apiData.brand)  update.brand           = apiData.brand;
          if (!existing.image_url    && apiData.imageUrl) update.image_url     = apiData.imageUrl;
          if (apiData.weight_g)   update.weight_g     = apiData.weight_g;
          if (apiData.packageType) update.package_type = apiData.packageType;
          if (apiData.width_cm)   update.width_cm     = apiData.width_cm;
          if (apiData.height_cm)  update.height_cm    = apiData.height_cm;
          if (apiData.depth_cm)   update.depth_cm     = apiData.depth_cm;
          update.off_attempted  = true;
          update.enrich_failed  = false;
          update.data_source    = apiData.dataSource;
          update.updated_at     = new Date().toISOString();

          const { error: saveErr } = await supabase
            .from('master_catalog')
            .update(update)
            .eq('ean', ean);

          if (saveErr) {
            console.error(`  ✗ ${ean} — Save error: ${saveErr.message}`);
            errors++;
          } else {
            console.log(`  ✓ ${ean}  →  ${apiData.name || '(sin nombre)'}  [${apiData.dataSource}]`);
            found++;
          }
        } else {
          // Mark as attempted (failed) so we don't retry every run
          await supabase
            .from('master_catalog')
            .update({ off_attempted: true, enrich_failed: true, updated_at: new Date().toISOString() })
            .eq('ean', ean);

          console.log(`  ✗ ${ean}  —  no encontrado en APIs`);
          notFound++;
        }
      } catch (err) {
        console.error(`  ⚠ ${ean}  —  error: ${err.message}`);
        errors++;
      }
    }));

    // Polite delay between chunks
    if (i + CONCURRENCY < eans.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  // 3. Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Enrichment complete`);
  console.log(`   ✓ Enriquecidos:    ${found}`);
  console.log(`   ✗ No encontrados:  ${notFound}`);
  console.log(`   ⚠ Errores:         ${errors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
