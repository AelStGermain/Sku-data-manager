import fs from 'fs';
import xlsx from 'xlsx';

// URL del backend local (asegúrate de que server.js esté corriendo)
const LOCAL_API_URL = 'http://localhost:3000/api/products/bulk';

async function importExcel(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ El archivo no existe: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n⏳ Leyendo archivo Excel: ${filePath}...`);
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  // Convertir a JSON
  const rows = xlsx.utils.sheet_to_json(sheet);
  console.log(`✅ Se encontraron ${rows.length} filas en la hoja "${sheetName}".`);

  const products = [];
  const holdingRelations = [];

  rows.forEach((row, index) => {
    // Requerimos al menos un EAN
    const ean = (row['ean'] || row['EAN'] || row['Ean'] || row['barcode'] || row['Barcode'] || '')?.toString().trim();
    if (!ean) {
      console.warn(`⚠️ Fila ${index + 2} ignorada: No tiene EAN.`);
      return;
    }

    const name = row['name'] || row['Name'] || row['Nombre'] || row['Descripción'] || row['display_name'] || 'SKU Importado';
    const brand = row['brand'] || row['Brand'] || row['Marca'] || row['brand_name'] || 'N/A';
    const category = row['category'] || row['Category'] || row['Categoría'] || row['category_name'] || 'GROCERY STORE';
    const visperaId = row['Vispera ID'] || row['vispera_id'] || row['Vispera Id'] || null;
    
    // Holding data (Opcional)
    const holdingId = (row['holding_id'] || row['Holding'] || '')?.toString().trim().toLowerCase();
    const customerId = (row['customer_id'] || row['Customer ID'] || '')?.toString().trim();
    const holdingCat = row['holding_category'] || row['Categoría Holding'] || category;

    // 1. Añadir al Master Catalog
    const productData = {
      ean,
      product_name: name,
      brand,
      category_master: category,
      weight_g: row['weight_g'] || row['Peso (g)'] || null,
      package_type: row['package_type'] || row['Envase'] || 'other',
      status: 'active',
      updated_at: new Date().toISOString()
    };

    if (visperaId) {
      productData.visperaId = visperaId;
    }

    products.push(productData);

    // 2. Si se especificó un Holding, añadir la relación al Retailer Catalog
    if (holdingId) {
      holdingRelations.push({
        ean,
        retailer_id: holdingId,
        customer_id: customerId || null,
        local_product_name: name,
        local_category_name: holdingCat,
        stock_status: true,
        updated_at: new Date().toISOString()
      });
    }
  });

  console.log(`\n📦 Preparando envío a la base de datos local:`);
  console.log(` - Master SKUs: ${products.length}`);
  console.log(` - Relaciones de Holding: ${holdingRelations.length}`);

  // Dividir en lotes (chunks) para no saturar la API
  const CHUNK_SIZE = 5000;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const pChunk = products.slice(i, i + CHUNK_SIZE);
    const rChunk = holdingRelations.filter(r => pChunk.find(p => p.ean === r.ean));
    
    console.log(`\n🚀 Enviando lote ${Math.floor(i / CHUNK_SIZE) + 1} de ${Math.ceil(products.length / CHUNK_SIZE)}...`);
    
    try {
      const response = await fetch(LOCAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: pChunk,
          holdingRelations: rChunk
        })
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status} - ${await response.text()}`);
      }
      
      console.log(`✅ Lote guardado con éxito.`);
    } catch (err) {
      console.error(`❌ Falló la importación del lote:`, err.message);
    }
  }
  
  console.log(`\n🎉 Importación finalizada. Recarga la página en http://localhost:3000`);
}

// Ejecución desde línea de comandos
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Uso: node scripts/import-excel.js <ruta_al_archivo_excel>");
  console.log("Ejemplo: node scripts/import-excel.js skus_masivos.xlsx");
  process.exit(1);
}

importExcel(args[0]);
