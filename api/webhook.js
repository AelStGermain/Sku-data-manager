// Endpoint Webhook para Vercel usando FETCH Nativo (Cero Dependencias)

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabaseHeaders = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates' // Para simular el UPSERT
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });

  try {
    const { holding_id, items, session_id } = req.body;

    if (!items || !Array.isArray(items)) return res.status(400).json({ error: 'Falta array "items".' });
    if (!holding_id) return res.status(400).json({ error: 'Falta "holding_id".' });

    console.log(`[Webhook] Recibiendo ${items.length} items (Holding: ${holding_id})`);

    const processedItems = [];
    const itemsToProcess = items.slice(0, 50);

    for (const item of itemsToProcess) {
      if (!item.ean || item.ean.trim() === '') continue;

      let enrichedData = {
        name: item.ocr_name || 'Nuevo SKU de Terreno',
        brand: 'MARCA DESCONOCIDA',
        category: 'Sin Categoría',
        imageUrl: item.foto_fleje_url || null
      };

      if (item.ean.length >= 8) {
        try {
          const offResponse = await fetch(`https://world.openfoodfacts.org/api/v0/product/${item.ean}.json`);
          if (offResponse.ok) {
            const offData = await offResponse.json();
            if (offData.status === 1 && offData.product) {
              const p = offData.product;
              enrichedData.name = p.product_name || enrichedData.name;
              enrichedData.brand = p.brands ? p.brands.split(',')[0] : enrichedData.brand;
              enrichedData.category = p.categories ? p.categories.split(',')[0] : enrichedData.category;
              enrichedData.imageUrl = p.image_front_url || enrichedData.imageUrl;
            }
          }
        } catch (e) { console.warn(`[Webhook] Fallo OFF EAN ${item.ean}`); }
      }

      // 2. Guardar en MASTER_CATALOG (Upsert via REST)
      const masterPayload = {
        ean: item.ean,
        product_name: enrichedData.name,
        brand: enrichedData.brand,
        category_master: enrichedData.category,
        image_url: enrichedData.imageUrl
      };

      const masterReq = await fetch(`${supabaseUrl}/rest/v1/master_catalog?on_conflict=ean`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify(masterPayload)
      });

      if (!masterReq.ok) {
        console.error(`[Webhook] Error Master:`, await masterReq.text());
        continue;
      }

      // 3. Crear relación en RETAILER_CATALOG
      const retailerPayload = {
        uuid: crypto.randomUUID(),
        ean: item.ean,
        retailer_id: holding_id.toLowerCase(),
        internal_sku_id: item.internal_id || item.ean,
        retailer_category: item.pasillo || 'Desconocido',
        is_trained: true
      };

      const retailerReq = await fetch(`${supabaseUrl}/rest/v1/retailer_catalog?on_conflict=uuid`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify(retailerPayload)
      });

      if (!retailerReq.ok) {
        console.error(`[Webhook] Error Retailer:`, await retailerReq.text());
      } else {
        processedItems.push({ ean: item.ean, status: 'success' });
      }

      await new Promise(r => setTimeout(r, 300));
    }

    return res.status(200).json({ 
      message: 'Ingesta procesada exitosamente.', 
      received: items.length,
      processed: processedItems.length,
      results: processedItems
    });

  } catch (err) {
    console.error('[Webhook] Error crítico:', err);
    return res.status(500).json({ error: 'Error interno procesando el Webhook.' });
  }
}
