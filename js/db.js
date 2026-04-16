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
//  DATABASE  (localStorage)
// ──────────────────────────────────────────────
const DB = (() => {
  const PRODUCTS_KEY  = 'ss_products';
  const RETAILERS_KEY = 'ss_retailers';
  const UNDO_KEY      = 'ss_undo';
  const DATA_VERSION  = 'v4'; // kept at v4 to preserve existing imported data

  // ── EAN-13 validator ────────────────────────
  function validateEAN13(ean) {
    const s = String(ean || '').replace(/\D/g, '');
    if (s.length !== 13) return false;
    const sum = s.split('').reduce((acc, d, i) =>
      acc + parseInt(d) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }

  // ── default retailers ──────────────────────
  const DEFAULT_RETAILERS = [
    { id: 'tottus',  name: 'Tottus',  color: '#E8001C', logoUrl: 'tottus_logo.png',  categories: [] },
    { id: 'jumbo',   name: 'Jumbo',   color: '#009A44', logoUrl: 'jumbo_logo.png',   categories: [] },
    { id: 'unimarc', name: 'Unimarc', color: '#005BAC', logoUrl: 'unimarc_logo.png', categories: [] }
  ];

  // ── seed products ─────────────────────────
  const mkProduct = (ean, name, brand, pkg, wg, ds, retailers) => ({
    ean, name, brand, packageType: pkg,
    status: 'active', nameSource: ds === 'open_food_facts' ? 'off' : 'manual',
    masterCategory: null, offAttempted: false,
    width_cm: null, height_cm: null, depth_cm: null, weight_g: wg,
    imageUrl: null, dataSource: ds, history: [],
    planogram: {},
    createdAt: '2024-01-10T09:00:00Z', updatedAt: '2024-01-10T09:00:00Z',
    retailers
  });

  const SAMPLE_PRODUCTS = {
    '3017620422003': mkProduct('3017620422003','Nutella Crema de Avellanas con Cacao','Ferrero','jar',400,'open_food_facts',{
      tottus:  { customerId:'TOT-83221', name:'Nutella 400g',                    category:'Dulces y Chocolates', stockStatus:true,  planogram:{}, imageUrl:null, updatedAt:'2024-01-15T14:00:00Z' },
      jumbo:   { customerId:'JUM-12039', name:'NUTELLA Crema de Avellanas 400g', category:'Cereales y Desayuno', stockStatus:true,  planogram:{}, imageUrl:null, updatedAt:'2024-01-18T11:00:00Z' },
      unimarc: { customerId:'UNI-4421',  name:'Nutella Ferrero 400g',            category:'Dulces y Chocolates', stockStatus:false, planogram:{}, imageUrl:null, updatedAt:'2024-02-01T08:00:00Z' }
    }),
    '7613035537378': mkProduct('7613035537378','Nescafé Clásico Instantáneo','Nestlé','jar',170,'manual',{
      tottus:  { customerId:'TOT-44921', name:'Nescafé Clásico 170g',         category:'Café, Té e Infusiones', stockStatus:true, planogram:{}, imageUrl:null, updatedAt:'2024-01-12T10:00:00Z' },
      unimarc: { customerId:'UNI-8830',  name:'Nescafé Clásico Nestlé 170g', category:'Café, Té e Infusiones', stockStatus:true, planogram:{}, imageUrl:null, updatedAt:'2024-01-20T10:00:00Z' }
    }),
    '5449000131836': mkProduct('5449000131836','Coca-Cola Original 1.5L','The Coca-Cola Company','bottle',1500,'open_food_facts',{
      jumbo:   { customerId:'JUM-00231', name:'Coca-Cola 1.5L',          category:'Bebidas y Jugos', stockStatus:true, planogram:{}, imageUrl:null, updatedAt:'2024-01-08T10:00:00Z' },
      unimarc: { customerId:'UNI-0091',  name:'Coca Cola Original 1.5L', category:'Bebidas y Jugos', stockStatus:true, planogram:{}, imageUrl:null, updatedAt:'2024-01-15T10:00:00Z' }
    }),
    '8718215866510': mkProduct('8718215866510','Quaker Avena Tradicional','Quaker','box',500,'manual',{
      tottus:  { customerId:'TOT-99112', name:'Quaker Avena 500g',             category:'Cereales y Desayuno', stockStatus:true,  planogram:{}, imageUrl:null, updatedAt:'2024-01-20T10:00:00Z' },
      jumbo:   { customerId:'JUM-44321', name:'QUAKER Avena Tradicional 500g', category:'Cereales y Desayuno', stockStatus:false, planogram:{}, imageUrl:null, updatedAt:'2024-02-05T10:00:00Z' },
      unimarc: { customerId:'UNI-3312',  name:'Avena Quaker 500g',             category:'Cereales y Desayuno', stockStatus:true,  planogram:{}, imageUrl:null, updatedAt:'2024-02-10T10:00:00Z' }
    }),
    '7622400023422': mkProduct('7622400023422','Milo Bebida Achocolatada en Polvo','Nestlé','can',400,'manual',{
      tottus: { customerId:'TOT-77401', name:'Milo 400g', category:'Cereales y Desayuno', stockStatus:true, planogram:{}, imageUrl:null, updatedAt:'2024-02-01T10:00:00Z' }
    }),
    '8000500037560': mkProduct('8000500037560','Ferrero Rocher 16 unidades','Ferrero','box',200,'manual',{})
  };

  // ── audit trail ────────────────────────────
  function recordChange(product, field, oldVal, newVal, source = 'manual') {
    if (String(oldVal) === String(newVal)) return;
    if (!product.history) product.history = [];
    product.history.unshift({ field, oldVal, newVal, source, at: new Date().toISOString() });
    if (product.history.length > 20) product.history = product.history.slice(0, 20);
  }

  // ── undo stack (single level) ──────────────
  function saveUndo(label = '') {
    try { localStorage.setItem(UNDO_KEY, JSON.stringify({ snapshot: getProducts(), label, at: new Date().toISOString() })); }
    catch { /* silent */ }
  }
  function getUndo()   { try { return JSON.parse(localStorage.getItem(UNDO_KEY) || 'null'); } catch { return null; } }
  function clearUndo() { localStorage.removeItem(UNDO_KEY); }
  function applyUndo() {
    const u = getUndo();
    if (!u) return false;
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(u.snapshot));
    clearUndo();
    return true;
  }

  // ── backup / restore ───────────────────────
  function exportBackup() {
    return JSON.stringify({
      _type: 'smart-shelf-backup',
      version: DATA_VERSION,
      exportedAt: new Date().toISOString(),
      products: getProducts(),
      retailers: getRetailers()
    }, null, 2);
  }
  function importBackup(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data._type || data._type !== 'smart-shelf-backup') throw new Error('Archivo no reconocido como backup de Smart Shelf.');
    if (!data.products) throw new Error('El backup no contiene productos.');
    saveUndo('antes de restaurar backup');
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(data.products));
    if (data.retailers) localStorage.setItem(RETAILERS_KEY, JSON.stringify(data.retailers));
    return { products: Object.keys(data.products).length };
  }

  // ── CSV template ───────────────────────────
  function generateCSVTemplate() {
    const retailers = getRetailers();
    const headers = [
      'EAN','Nombre','Marca','Tipo_Paquete','Ancho_cm','Alto_cm','Prof_cm',
      'Peso_g','Categoria_Maestra','Estado',
      ...retailers.flatMap(r => [`${r.name}_ID`,`${r.name}_Nombre`,`${r.name}_Categoria`,`${r.name}_Stock`])
    ];
    const example = [
      '7801580001234','Nombre del producto','Marca','bottle','10','20','8',
      '500','Bebidas y Aguas','active',
      ...retailers.flatMap(() => ['ID-001','Nombre en tienda','Categoría','SI'])
    ];
    return [headers, example].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  }

  // ── init ───────────────────────────────────
  function init() {
    if (localStorage.getItem('ss_version') !== DATA_VERSION) {
      localStorage.removeItem(PRODUCTS_KEY);
      localStorage.removeItem(RETAILERS_KEY);
      localStorage.setItem('ss_version', DATA_VERSION);
    }
    if (!localStorage.getItem(RETAILERS_KEY)) localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
    if (!localStorage.getItem(PRODUCTS_KEY))  localStorage.setItem(PRODUCTS_KEY,  JSON.stringify(SAMPLE_PRODUCTS));
  }

  function resetToDefaults() {
    localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
    localStorage.setItem(PRODUCTS_KEY,  JSON.stringify(SAMPLE_PRODUCTS));
    clearUndo();
  }

  // ── retailers ──────────────────────────────
  function getRetailers() {
    const raw = JSON.parse(localStorage.getItem(RETAILERS_KEY) || '[]');
    let retailers = raw.length ? raw : DEFAULT_RETAILERS;
    
    const products = getProductsArray();
    retailers.forEach(r => {
      if (!r.logoUrl) {
        if (r.id === 'tottus')  r.logoUrl = 'tottus_logo.png';
        if (r.id === 'jumbo')   r.logoUrl = 'jumbo_logo.png';
        if (r.id === 'unimarc') r.logoUrl = 'unimarc_logo.png';
      }
      const cats = new Set();
      products.forEach(p => {
        const c = p.retailers?.[r.id]?.category;
        if (c) cats.add(c);
      });
      r.categories = Array.from(cats).sort();
    });
    return retailers;
  }
  function saveRetailers(r)     { localStorage.setItem(RETAILERS_KEY, JSON.stringify(r)); }
  function addRetailer(retailer){ const l=getRetailers(); l.push(retailer); saveRetailers(l); }
  function updateRetailer(id, u){ const l=getRetailers(), i=l.findIndex(r=>r.id===id); if(i!==-1){l[i]={...l[i],...u};saveRetailers(l);return l[i];} return null; }
  function deleteRetailer(id)   { saveRetailers(getRetailers().filter(r=>r.id!==id)); }

  // ── products ───────────────────────────────
  function getProducts()  { return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '{}'); }
  function getProduct(ean){ return getProducts()[ean] || null; }
  function saveProduct(product) {
    const all = getProducts();
    product.updatedAt = new Date().toISOString();
    if (!product.createdAt) product.createdAt = product.updatedAt;
    all[product.ean] = product;
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return product;
  }
  function saveProducts(productsArray) {
    const all = getProducts();
    const now = new Date().toISOString();
    productsArray.forEach(p => {
      p.updatedAt = now;
      if (!p.createdAt) p.createdAt = now;
      all[p.ean] = p;
    });
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }
  function deleteProduct(ean) {
    saveUndo(`eliminar ${ean}`);
    const all = getProducts(); delete all[ean];
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }
  function deleteProducts(eans) {
    saveUndo(`eliminar ${eans.length} productos`);
    const all = getProducts();
    eans.forEach(e => delete all[e]);
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }
  function getProductsArray() { return Object.values(getProducts()); }

  // ── completeness score (0-100) ─────────────
  function computeCompleteness(product) {
    let score = 0;
    if (product.name)          score += 13;
    if (product.brand)         score += 13;
    if (product.packageType)   score += 8;
    if (product.weight_g)      score += 8;
    if (product.imageUrl)      score += 13;
    if (product.masterCategory)score += 7;
    if (product.status)        score += 3;
    if (product.width_cm && product.height_cm && product.depth_cm) score += 13;
    if (Object.keys(product.retailers || {}).length > 0) score += 22;
    return Math.min(score, 100);
  }

  return {
    validateEAN13, exportBackup, importBackup, generateCSVTemplate,
    init, resetToDefaults,
    getRetailers, saveRetailers, addRetailer, updateRetailer, deleteRetailer,
    getProducts, getProduct, saveProduct, saveProducts, deleteProduct, deleteProducts, getProductsArray,
    computeCompleteness, recordChange, saveUndo, applyUndo, getUndo, clearUndo
  };
})();
