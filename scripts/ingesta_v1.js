const { createClient } = require('@supabase/supabase-js');

// Configuración de conexión (Tus credenciales de Fase 2)
const SUPABASE_URL = 'https://vijowftfzwcbgkfsglhy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-5KjPgzE1FNDtoZyf8DbJA_cENpDqPV';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Data extraída de tus capturas de pantalla de Víspera
const mockVisperaData = [
    { 
        ean: '1102260', 
        product_name: 'PIZZA ARGENTINA ACEITUN VER DFAB 510 G', 
        brand: 'DFAB', 
        category_master: 'FROZEN' 
    },
    { 
        ean: '42277132', 
        product_name: 'DESMA. OJOS BIFASICO 125ML NIVEA', 
        brand: 'NIVEA', 
        category_master: 'HYGIENE' 
    },
    { 
        ean: '50196388', 
        product_name: 'WHISKY BUCHANANS DE LUXE 750CC 12 AÑOS', 
        brand: 'BUCHANANS', 
        category_master: 'ALCOHOL' 
    },
    { 
        ean: '75062828', 
        product_name: 'DOVE DEO STICK CALENDULA 12X45G', 
        brand: 'DOVE', 
        category_master: 'HYGIENE' 
    },
    { 
        ean: '7501300010014', 
        product_name: 'COCA COLA ORIGINAL 2.5L', 
        brand: 'COCA COLA', 
        category_master: 'BEVERAGES' 
    }
];

async function startIngestion() {
    console.log('🚀 Iniciando pipeline de ingesta hacia la Master Data (Supabase)...');
    
    for (const item of mockVisperaData) {
        console.log(` -> Procesando EAN: ${item.ean} (${item.product_name})...`);
        
        const { data, error } = await supabase
            .from('master_catalog')
            .upsert(item, { onConflict: 'ean' });

        if (error) {
            console.error(` ❌ Error al insertar ${item.ean}:`, error.message);
        } else {
            console.log(` ✅ Item sincronizado correctamente.`);
        }
    }

    console.log('\n--- Tarea finalizada ---');
    console.log('Revisa tu Table Editor en Supabase para ver la Master Data en vivo.');
}

startIngestion();
