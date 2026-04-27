const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch'); // Asegúrate de tenerlo o usar fetch nativo en Node 18+

const SUPABASE_URL = 'https://vijowftfzwcbgkfsglhy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-5KjPgzE1FNDtoZyf8DbJA_cENpDqPV';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Nueva Lógica de Imágenes Falabella/Tottus (SKU ID + _1)
const getTottusFalabellaUrl = (skuId) => 
    skuId ? `https://media.falabella.com/tottusCL/${skuId}_1` : null;

// Función para consultar Open Food Facts
async function fetchOpenFoodFacts(ean) {
    try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`);
        const data = await res.json();
        if (data.status === 1) {
            return {
                brand: data.product.brands ? data.product.brands.split(',')[0].trim() : null,
                category: data.product.categories_tags?.[0]?.replace('en:', '') || null,
                image: data.product.image_url || null,
                fullName: data.product.product_name || null
            };
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function processData() {
    console.log('✨ Iniciando Motor de Enriquecimiento (Fase 2 - Falabella Media)...');

    // Datos simulados (Incluyendo IDs internos de Tottus para las fotos)
    const visperaIncoming = [
        { ean: '7501031311309', name: 'ARIEL LIQUIDO 1.9L', tottusId: '12345678' },
        { ean: '3017620422003', name: 'NUTELLA 400G', tottusId: '80231234' },
        { ean: '7801320242247', name: 'ACEITE OLIVA 500ML', tottusId: '80007833' } // Ejemplo Takis corregido
    ];

    for (const raw of visperaIncoming) {
        console.log(`\n🔍 Procesando: ${raw.name} [${raw.ean}]`);

        // 1. Enriquecer con Open Food Facts
        const enriched = await fetchOpenFoodFacts(raw.ean);
        
        // 2. Resolver Imagen (Falabella Tottus es prioridad)
        let finalImage = getTottusFalabellaUrl(raw.tottusId) || enriched?.image;

        // 3. Preparar objeto para PostgreSQL
        const productData = {
            ean: raw.ean,
            product_name: enriched?.fullName || raw.name,
            brand: enriched?.brand || 'MARCA DESCONOCIDA',
            category_master: enriched?.category || 'General',
        };

        // 4. Upsert en Master Catalog
        const { error: masterErr } = await supabase
            .from('master_catalog')
            .upsert(productData, { onConflict: 'ean' });

        if (masterErr) {
            console.error(' ❌ Error en Master Catalog:', masterErr.message);
        } else {
            console.log(` ✅ Catalogado: ${productData.product_name}`);
        }

        // 5. Guardar metadata de imagen (opcional, podrías tener una tabla de assets)
        // Por ahora, lo guardamos en el log de éxito
        console.log(` 🖼️ Imagen asignada: ${finalImage.substring(0, 50)}...`);
    }

    console.log('\n✅ Pipeline completado. Tu base de datos en Supabase está enriquecida.');
}

processData();
