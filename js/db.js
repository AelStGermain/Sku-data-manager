'use strict';

// ──────────────────────────────────────────────
//  SHARED CONSTANTS (global scope)
// ──────────────────────────────────────────────
window.CATEGORIES = [
  'Bebidas y Jugos', 'Lácteos y Huevos', 'Carnes y Embutidos',
  'Frutas y Verduras', 'Panadería y Repostería', 'Snacks y Galletas',
  'Cereales y Desayuno', 'Conservas y Enlatados',
  'Aceites, Salsas y Condimentos', 'Pasta, Arroz y Legumbres',
  'Café, Té e Infusiones', 'Dulces y Chocolates', 'Congelados',
  'Limpieza del Hogar', 'Cuidado Personal', 'Bebé y Maternidad',
  'Mascotas', 'Farmacia y Salud', 'Otro'
];

window.PACKAGE_TYPES = [
  { value: 'bottle',    label: 'Botella'       },
  { value: 'can',       label: 'Lata / Tarro'  },
  { value: 'box',       label: 'Caja'           },
  { value: 'bag',       label: 'Bolsa'          },
  { value: 'jar',       label: 'Frasco'         },
  { value: 'sachet',    label: 'Sachet / Sobre' },
  { value: 'tray',      label: 'Bandeja'        },
  { value: 'tetrapack', label: 'Tetra Pak'      },
  { value: 'tube',      label: 'Tubo'           },
  { value: 'other',     label: 'Otro'           }
];

window.SKU_STATUSES = [
  { value: 'active',       label: 'Activo',            color: 'var(--success)' },
  { value: 'new',          label: 'Nuevo lanzamiento', color: 'var(--accent)'  },
  { value: 'discontinued', label: 'Discontinuado',     color: 'var(--danger)'  },
  { value: 'review',       label: 'En revisión',       color: 'var(--warning)' },
];

window.MASTER_TAXONOMY = [
  'Frutas y Verduras','Carnes y Pescados','Lácteos y Derivados',
  'Congelados','Despensa','Bebidas y Aguas','Bebidas Alcohólicas',
  'Panadería y Pastelería','Snacks, Chocolates y Galletas',
  'Quesos y Fiambres','Limpieza del Hogar','Higiene y Cuidado Personal',
  'Mascotas','Bebé e Infantil','Farmacia y Salud','Electro y Hogar','Otro'
];

// ──────────────────────────────────────────────
//  DATABASE (Supabase Backend)
// ──────────────────────────────────────────────
const DB = (() => {
  // Configuración de conexión con Vercel fallback
  const SUPABASE_URL = window.NEXT_PUBLIC_SUPABASE_URL || 'https://vijowftfzwcbgkfsglhy.supabase.co';
  const SUPABASE_KEY = window.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-5KjPgzE1FNDtoZyf8DbJA_cENpDqPV';
  
  let _supabase = null;
  let _memoryProducts = {};
  let _memoryRetailers = [];

  async function init() {
     if (typeof supabase === 'undefined') {
       console.warn('Supabase SDK no cargado. Asegúrate de incluirlo en index.html');
       return;
     }
     _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
     console.log('⚡ Conectado a Master Data Hub (Supabase)');
     
     // Cargar datos iniciales
     await fetchProducts();
  }

  async function fetchProducts() {
    const { data, error } = await _supabase
      .from('master_catalog')
      .select('*');
    
    if (error) {
      console.error('Error cargando catálogo:', error);
      return;
    }

    _memoryProducts = {};
    data.forEach(p => {
      _memoryProducts[p.ean] = {
        ean: p.ean,
        name: p.product_name,
        brand: p.brand,
        category: p.category_master,
        // Leer la URL real de la base de datos, en lugar de forzar a Falabella
        imageUrl: p.image_url || null,
        status: p.product_name === 'Nuevo SKU de Terreno' || p.product_name.includes('UNDEFINED') ? 'review' : 'active',
        updatedAt: p.updated_at
      };
    });
    
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveProduct(product) {
    if (!product.ean) return;
    
    _memoryProducts[product.ean] = product;
    
    const { error } = await _supabase
      .from('master_catalog')
      .upsert({
        ean: product.ean,
        product_name: product.name,
        brand: product.brand,
        category_master: product.category,
        image_url: product.imageUrl || null
      }, { onConflict: 'ean' });

    if (error) console.error('Error guardando en Supabase:', error);
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  function getProduct(ean) {
    return _memoryProducts[ean] || null;
  }

  function getProductsArray() {
    return Object.values(_memoryProducts);
  }

  function getRetailers() {
    return [
      { id: 'tottus',  name: 'Tottus',  color: '#E8001C', logoUrl: 'tottus_logo.png' },
      { id: 'jumbo',   name: 'Jumbo',   color: '#009A44', logoUrl: 'jumbo_logo.png' },
      { id: 'unimarc', name: 'Unimarc', color: '#005BAC', logoUrl: 'unimarc_logo.png' }
    ];
  }

  function computeCompleteness(p) {
    if (!p) return 0;
    const fields = ['name', 'brand', 'category'];
    const filled = fields.filter(f => p[f] && p[f] !== '—').length;
    return Math.round((filled / fields.length) * 100);
  }

  async function deleteProduct(ean) {
    if (!ean) return;
    delete _memoryProducts[ean];
    const { error } = await _supabase.from('master_catalog').delete().eq('ean', ean);
    if (error) console.error('Error borrando en Supabase:', error);
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function deleteProducts(eans) {
    if (!eans || !eans.length) return;
    eans.forEach(ean => delete _memoryProducts[ean]);
    const { error } = await _supabase.from('master_catalog').delete().in('ean', eans);
    if (error) console.error('Error borrando bulk en Supabase:', error);
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveProducts(productsArray) {
    if (!productsArray || !productsArray.length) return;
    
    // Preparar el arreglo masivo para Supabase
    const payload = productsArray.map(p => {
      _memoryProducts[p.ean] = p; // Actualizar UI local inmediatamente
      return {
        ean: p.ean,
        product_name: p.name || 'Sin Nombre',
        brand: p.brand || 'N/A',
        category_master: p.category || 'General'
      };
    });

    const { error } = await _supabase
      .from('master_catalog')
      .upsert(payload, { onConflict: 'ean' });
      
    if (error) console.error('Error upsert masivo en Supabase:', error);
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  function exportBackup() {
    return JSON.stringify(getProductsArray(), null, 2);
  }

  return {
    init,
    fetchProducts,
    getProduct,
    getProductsArray,
    getRetailers,
    saveProduct,
    saveProducts,
    deleteProduct,
    deleteProducts,
    computeCompleteness,
    exportBackup
  };
})();
