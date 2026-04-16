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
  { value: 'bottle',     label: 'Botella'       },
  { value: 'can',        label: 'Lata / Tarro'  },
  { value: 'box',        label: 'Caja'           },
  { value: 'bag',        label: 'Bolsa'          },
  { value: 'jar',        label: 'Frasco'         },
  { value: 'sachet',     label: 'Sachet / Sobre' },
  { value: 'tray',       label: 'Bandeja'        },
  { value: 'tetrapack',  label: 'Tetra Pak'      },
  { value: 'tube',       label: 'Tubo'           },
  { value: 'other',      label: 'Otro'           }
];

// ──────────────────────────────────────────────
//  DATABASE  (localStorage)
// ──────────────────────────────────────────────
const DB = (() => {
  const PRODUCTS_KEY  = 'ss_products';
  const RETAILERS_KEY = 'ss_retailers';

  // ── default retailers ──────────────────────
  const DEFAULT_RETAILERS = [
    { id: 'tottus',  name: 'Tottus',  color: '#E8001C' },
    { id: 'jumbo',   name: 'Jumbo',   color: '#009A44' },
    { id: 'unimarc', name: 'Unimarc', color: '#005BAC' }
  ];

  // ── sample / seed products ─────────────────
  const SAMPLE_PRODUCTS = {
    '3017620422003': {
      ean: '3017620422003',
      name: 'Nutella Crema de Avellanas con Cacao',
      brand: 'Ferrero',
      packageType: 'jar',
      width_cm: 11.5, height_cm: 10.0, depth_cm: 11.5,
      weight_g: 400,
      imageUrl: null,
      dataSource: 'open_food_facts',
      createdAt: '2024-01-10T09:00:00Z', updatedAt: '2024-01-10T09:00:00Z',
      retailers: {
        tottus:  { customerId: 'TOT-83221', name: 'Nutella 400g',                    category: 'Dulces y Chocolates',   stockStatus: true,  imageUrl: null, updatedAt: '2024-01-15T14:00:00Z' },
        jumbo:   { customerId: 'JUM-12039', name: 'NUTELLA Crema de Avellanas 400g', category: 'Cereales y Desayuno',   stockStatus: true,  imageUrl: null, updatedAt: '2024-01-18T11:00:00Z' },
        unimarc: { customerId: 'UNI-4421',  name: 'Nutella Ferrero 400g',            category: 'Dulces y Chocolates',   stockStatus: false, imageUrl: null, updatedAt: '2024-02-01T08:00:00Z' }
      }
    },
    '7613035537378': {
      ean: '7613035537378',
      name: 'Nescafé Clásico Instantáneo',
      brand: 'Nestlé',
      packageType: 'jar',
      width_cm: 9.0, height_cm: 13.5, depth_cm: 9.0,
      weight_g: 170,
      imageUrl: null,
      dataSource: 'manual',
      createdAt: '2024-01-12T10:00:00Z', updatedAt: '2024-01-12T10:00:00Z',
      retailers: {
        tottus:  { customerId: 'TOT-44921', name: 'Nescafé Clásico 170g',          category: 'Café, Té e Infusiones', stockStatus: true, imageUrl: null, updatedAt: '2024-01-12T10:00:00Z' },
        unimarc: { customerId: 'UNI-8830',  name: 'Nescafé Clásico Nestlé 170g',  category: 'Café, Té e Infusiones', stockStatus: true, imageUrl: null, updatedAt: '2024-01-20T10:00:00Z' }
      }
    },
    '5449000131836': {
      ean: '5449000131836',
      name: 'Coca-Cola Original 1.5L',
      brand: 'The Coca-Cola Company',
      packageType: 'bottle',
      width_cm: null, height_cm: null, depth_cm: null,
      weight_g: 1500,
      imageUrl: null,
      dataSource: 'open_food_facts',
      createdAt: '2024-01-08T10:00:00Z', updatedAt: '2024-01-08T10:00:00Z',
      retailers: {
        jumbo:   { customerId: 'JUM-00231', name: 'Coca-Cola 1.5L',          category: 'Bebidas y Jugos', stockStatus: true, imageUrl: null, updatedAt: '2024-01-08T10:00:00Z' },
        unimarc: { customerId: 'UNI-0091',  name: 'Coca Cola Original 1.5L', category: 'Bebidas y Jugos', stockStatus: true, imageUrl: null, updatedAt: '2024-01-15T10:00:00Z' }
      }
    },
    '8718215866510': {
      ean: '8718215866510',
      name: 'Quaker Avena Tradicional',
      brand: 'Quaker',
      packageType: 'box',
      width_cm: 18.0, height_cm: 25.0, depth_cm: 8.0,
      weight_g: 500,
      imageUrl: null,
      dataSource: 'manual',
      createdAt: '2024-01-20T10:00:00Z', updatedAt: '2024-01-20T10:00:00Z',
      retailers: {
        tottus:  { customerId: 'TOT-99112', name: 'Quaker Avena 500g',              category: 'Cereales y Desayuno', stockStatus: true,  imageUrl: null, updatedAt: '2024-01-20T10:00:00Z' },
        jumbo:   { customerId: 'JUM-44321', name: 'QUAKER Avena Tradicional 500g',  category: 'Cereales y Desayuno', stockStatus: false, imageUrl: null, updatedAt: '2024-02-05T10:00:00Z' },
        unimarc: { customerId: 'UNI-3312',  name: 'Avena Quaker 500g',              category: 'Cereales y Desayuno', stockStatus: true,  imageUrl: null, updatedAt: '2024-02-10T10:00:00Z' }
      }
    },
    '7622400023422': {
      ean: '7622400023422',
      name: 'Milo Bebida Achocolatada en Polvo',
      brand: 'Nestlé',
      packageType: 'can',
      width_cm: null, height_cm: null, depth_cm: null,
      weight_g: 400,
      imageUrl: null,
      dataSource: 'manual',
      createdAt: '2024-02-01T10:00:00Z', updatedAt: '2024-02-01T10:00:00Z',
      retailers: {
        tottus: { customerId: 'TOT-77401', name: 'Milo 400g', category: 'Cereales y Desayuno', stockStatus: true, imageUrl: null, updatedAt: '2024-02-01T10:00:00Z' }
      }
    },
    '8000500037560': {
      ean: '8000500037560',
      name: 'Ferrero Rocher 16 unidades',
      brand: 'Ferrero',
      packageType: 'box',
      width_cm: null, height_cm: null, depth_cm: null,
      weight_g: 200,
      imageUrl: null,
      dataSource: 'manual',
      createdAt: '2024-02-10T10:00:00Z', updatedAt: '2024-02-10T10:00:00Z',
      retailers: {}
    }
  };

  // ── init ───────────────────────────────────
  function init() {
    // One-time migration: wipe cached data that has the old broken OFF image URLs
    const cached = localStorage.getItem(PRODUCTS_KEY);
    if (cached && cached.includes('front_en.252.400') || cached && cached.includes('front_en.3.400')) {
      localStorage.removeItem(PRODUCTS_KEY);
    }
    if (!localStorage.getItem(RETAILERS_KEY)) {
      localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
    }
    if (!localStorage.getItem(PRODUCTS_KEY)) {
      localStorage.setItem(PRODUCTS_KEY, JSON.stringify(SAMPLE_PRODUCTS));
    }
  }

  function resetToDefaults() {
    localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(SAMPLE_PRODUCTS));
  }

  // ── retailers ──────────────────────────────
  function getRetailers() {
    return JSON.parse(localStorage.getItem(RETAILERS_KEY) || '[]');
  }
  function saveRetailers(r) {
    localStorage.setItem(RETAILERS_KEY, JSON.stringify(r));
  }
  function addRetailer(retailer) {
    const list = getRetailers();
    list.push(retailer);
    saveRetailers(list);
  }
  function updateRetailer(id, updates) {
    const list = getRetailers();
    const i = list.findIndex(r => r.id === id);
    if (i !== -1) { list[i] = { ...list[i], ...updates }; saveRetailers(list); return list[i]; }
    return null;
  }
  function deleteRetailer(id) {
    saveRetailers(getRetailers().filter(r => r.id !== id));
  }

  // ── products ───────────────────────────────
  function getProducts() {
    return JSON.parse(localStorage.getItem(PRODUCTS_KEY) || '{}');
  }
  function getProduct(ean) {
    return getProducts()[ean] || null;
  }
  function saveProduct(product) {
    const all = getProducts();
    product.updatedAt = new Date().toISOString();
    if (!product.createdAt) product.createdAt = product.updatedAt;
    all[product.ean] = product;
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
    return product;
  }
  function deleteProduct(ean) {
    const all = getProducts();
    delete all[ean];
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(all));
  }
  function getProductsArray() {
    return Object.values(getProducts());
  }

  // ── completeness score (0-100) ─────────────
  function computeCompleteness(product) {
    let score = 0;
    if (product.name)        score += 15;
    if (product.brand)       score += 15;
    if (product.packageType) score += 10;
    if (product.weight_g)    score += 10;
    if (product.imageUrl)    score += 15;
    if (product.width_cm && product.height_cm && product.depth_cm) score += 15;
    if (Object.keys(product.retailers || {}).length > 0)           score += 20;
    return Math.min(score, 100);
  }

  return {
    init, resetToDefaults,
    getRetailers, saveRetailers, addRetailer, updateRetailer, deleteRetailer,
    getProducts, getProduct, saveProduct, deleteProduct, getProductsArray,
    computeCompleteness
  };
})();
