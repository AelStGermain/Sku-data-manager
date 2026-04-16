const fs = require('fs');
const csv = require('csv-parser');
const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Necesario para conexiones a Neon
});

async function importar() {
  await client.connect();
  console.log("Conectado a Neon. Iniciando carga de Excels...");

  // --- 1. CARGAR JUMBO ---
  fs.createReadStream('jumbo.csv')
    .pipe(csv())
    .on('data', async (row) => {
      try {
        const ean = row.barcode;
        
        // Insertar en Maestro (Solo EAN, Marca y Categoría)
        await client.query(
          `INSERT INTO "Producto_Maestro" ("EAN", "Brand_Name", "Category") 
           VALUES ($1, $2, $3) ON CONFLICT ("EAN") DO NOTHING`,
          [ean, row.brand, row.category_name]
        );
        
        // Insertar en Retailer (ID 2 = Jumbo)
        await client.query(
          `INSERT INTO "SKU_Retailer" ("EAN", "Retailer_ID", "Retailer_SKU_ID", "Product_Name_Retailer") 
           VALUES ($1, 2, $2, $3) ON CONFLICT DO NOTHING`,
          [ean, row.id_retail, row.display_name]
        );
      } catch (e) { 
        console.error("Error en fila de Jumbo:", e.message); 
      }
    })
    .on('end', () => {
      console.log("✅ Jumbo procesado.");
      
      // --- 2. CARGAR TOTTUS (Se ejecuta al terminar Jumbo para no chocar) ---
      fs.createReadStream('tottus.csv')
        .pipe(csv())
        .on('data', async (row) => {
          try {
            const ean = row.barcode;
            
            // Actualizar Maestro (Tottus trae el package y gramaje, así que actualizamos el registro)
            await client.query(
              `INSERT INTO "Producto_Maestro" ("EAN", "Brand_Name", "Category", "package", "gramaje") 
               VALUES ($1, $2, $3, $4, $5) 
               ON CONFLICT ("EAN") DO UPDATE SET "package" = EXCLUDED.package, "gramaje" = EXCLUDED.gramaje`,
              [ean, row.brand, row.category_name_tottus, row.package, row.gramaje]
            );
            
            // Insertar en Retailer (ID 1 = Tottus)
            await client.query(
              `INSERT INTO "SKU_Retailer" ("EAN", "Retailer_ID", "Retailer_SKU_ID", "Product_Name_Retailer") 
               VALUES ($1, 1, $2, $3) ON CONFLICT DO NOTHING`,
              [ean, row.id_tottus, row.display_name_tottus]
            );
          } catch (e) { 
            console.error("Error en fila de Tottus:", e.message); 
          }
        })
        .on('end', () => {
          console.log("✅ Tottus procesado. ¡Carga masiva finalizada!");
        });
    });
}

importar();