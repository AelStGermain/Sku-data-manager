import { createClient } from '@supabase/supabase-js';

// Inicializar Supabase (Variables de Entorno en Vercel)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  // CORS Headers para permitir que el frontend lo llame
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Manejar preflight request (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { holding_id, items, session_id } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'El payload debe contener un arreglo "items".' });
    }

    if (!holding_id) {
      return res.status(400).json({ error: 'El payload debe contener un "holding_id" (ej. "tottus").' });
    }

    console.log(`[Webhook] Recibiendo ${items.length} items de sesión ${session_id || 'N/A'} (Holding: ${holding_id})`);

    const processedItems = [];

    // Límite de seguridad: Procesar máximo 50 items por llamada para no exceder tiempo en Vercel
    const itemsToProcess = items.slice(0, 50);

    for (const item of itemsToProcess) {
      if (!item.ean || item.ean.trim() === '') continue;

      let enrichedData = {
        name: item.ocr_name || 'Nuevo SKU de Terreno',
        brand: 'MARCA DESCONOCIDA',
        category: 'Sin Categoría',
        imageUrl: item.foto_fleje_url || null
      };

      // 1. Enriquecer con Open Food Facts (Si es un EAN-13 válido)
      if (item.ean.length >= 8) { // Filtramos códigos muy cortos
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
        } catch (e) {
          console.warn(`[Webhook] Fallo al consultar API externa para EAN ${item.ean}`);
        }
      }

      const status = enrichedData.name === 'Nuevo SKU de Terreno' || item.ocr_name === 'UNDEFINED_BARCODE' ? 'review' : 'active';

      // 2. Guardar en MASTER_CATALOG (Upsert)
      const { error: masterError } = await supabase
        .from('master_catalog')
        .upsert({
          ean: item.ean,
          product_name: enrichedData.name,
          brand: enrichedData.brand,
          category_master: enrichedData.category,
          image_url: enrichedData.imageUrl
        }, { onConflict: 'ean' });

      if (masterError) {
        console.error(`[Webhook] Error guardando EAN ${item.ean} en Master:`, masterError);
        continue; // Saltar si falla el maestro
      }

      // 3. Crear relación en RETAILER_CATALOG
      // Nota: Generamos un UUID simple para la PK (o usamos un composite si la BD lo permite, pero asumimos genérico)
      const uuid = crypto.randomUUID();
      const { error: retailerError } = await supabase
        .from('retailer_catalog')
        .upsert({
          uuid: uuid,
          ean: item.ean,
          retailer_id: holding_id.toLowerCase(),
          internal_sku_id: item.internal_id || item.ean, // Fallback al ean si Víspera no manda ID interno
          retailer_category: item.pasillo || 'Desconocido',
          is_trained: true
        }, { onConflict: 'uuid' }); // Asumiendo que uuid es único, o onConflict: 'ean, retailer_id' idealmente

      if (retailerError) {
        console.error(`[Webhook] Error creando relación Retailer para ${item.ean}:`, retailerError);
      } else {
        processedItems.push({ ean: item.ean, status: 'success' });
      }

      // Throttling: Pausa de 300ms entre items para no saturar APIs
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
