'use strict';

// ──────────────────────────────────────────────
//  SHARED CONSTANTS (global scope)
//  Categorías Universales Vispera (17 categorías globales)
// ──────────────────────────────────────────────
window.UNIVERSAL_CATEGORIES = [
  'GROCERY STORE', 'SWEET', 'ALCOHOL', 'CLEANING',
  'DAIRYS', 'FROZEN', 'BREAKFAST', 'SNACKS',
  'BABY', 'PET', 'DESSERT', 'CEREALS',
  'CANNED FOOD', 'DETERGENTS', 'DRINKS',
  'HEALTHY', 'PAPER ITEMS'
];

// Legacy alias for backward compat
window.CATEGORIES = window.UNIVERSAL_CATEGORIES;

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

// Vispera universal category colors (for badges)
window.VISPERA_CATEGORY_COLORS = {
  'GROCERY STORE': '#4CAF50', 'SWEET': '#E91E63', 'ALCOHOL': '#9C27B0',
  'CLEANING': '#00BCD4', 'DAIRYS': '#FFC107', 'FROZEN': '#2196F3',
  'BREAKFAST': '#FF9800', 'SNACKS': '#F44336', 'BABY': '#EC407A',
  'PET': '#8D6E63', 'DESSERT': '#AD1457', 'CEREALS': '#FF7043',
  'CANNED FOOD': '#607D8B', 'DETERGENTS': '#26A69A', 'DRINKS': '#42A5F5',
  'HEALTHY': '#66BB6A', 'PAPER ITEMS': '#BDBDBD'
};

// ──────────────────────────────────────────────
//  DATABASE (Supabase Backend + Local Cache)
//  Arquitectura: BigQuery Data Warehouse (Multi-Holding)
// ──────────────────────────────────────────────
const DB = (() => {
  const SUPABASE_URL = window.NEXT_PUBLIC_SUPABASE_URL || 'https://vijowftfzwcbgkfsglhy.supabase.co';
  const SUPABASE_KEY = window.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-5KjPgzE1FNDtoZyf8DbJA_cENpDqPV';
  
  const PRODUCTS_CACHE_KEY = 'ss_products_cache';

  function _safeSetItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('LocalStorage quota exceeded for ' + key);
      if (key !== PRODUCTS_CACHE_KEY) {
        localStorage.removeItem(PRODUCTS_CACHE_KEY);
        try {
          localStorage.setItem(key, value);
        } catch (e2) {
          console.warn('Still exceeded quota for ' + key);
        }
      }
    }
  }
  const HOLDINGS_KEY = 'ss_holdings';
  const STORES_KEY = 'ss_physical_stores';
  const PLANOGRAMS_KEY = 'ss_planograms';
  const STAGING_LEVANTAMIENTO_KEY = 'ss_staging_levantamiento';
  const STAGING_UNMATCHED_KEY = 'ss_staging_unmatched';
  const STAGING_NO_EAN_KEY = 'ss_staging_no_ean';
  const VISPERA_BATCH_KEY = 'ss_vispera_batch';
  const BRANDS_PRODUCERS_KEY = 'ss_brands_producers';
  const CATEGORY_MAPPING_KEY = 'ss_category_mapping';
  const RECENT_MATCHES_KEY = 'ss_recent_matches';

  const DEFAULT_HOLDINGS = [
    { id: 'tottus',  name: 'Tottus',  color: '#E8001C', logoUrl: 'tottus_logo.png' },
    { id: 'jumbo',   name: 'Jumbo',   color: '#009A44', logoUrl: 'jumbo_logo.png' },
    { id: 'unimarc', name: 'Unimarc', color: '#005BAC', logoUrl: 'unimarc_logo.png' }
  ];

  const DEFAULT_STORES = [
    { storeId: 'tkm_kennedy', retailerId: 'tottus', holdingId: 'tottus', city: 'Santiago', branchName: 'Sucursal Kennedy' },
    { storeId: 'tottus_nunoa', retailerId: 'tottus', holdingId: 'tottus', city: 'Santiago', branchName: 'Sucursal Ñuñoa' },
    { storeId: 'jumbo_bilbao', retailerId: 'jumbo', holdingId: 'jumbo', city: 'Santiago', branchName: 'Sucursal Francisco Bilbao' },
    { storeId: 'jumbo_kennedy', retailerId: 'jumbo', holdingId: 'jumbo', city: 'Santiago', branchName: 'Sucursal Portal La Reina' },
    { storeId: 'unimarc_los_leones', retailerId: 'unimarc', holdingId: 'unimarc', city: 'Santiago', branchName: 'Sucursal Los Leones' }
  ];

  let _supabase = null;
  let _memoryProducts = {};
  let _availableColumns = new Set();
  let _undoStack = [];

  // ── Staging & Pipeline data (in-memory + localStorage) ──
  let _stagingLevantamiento = [];
  let _stagingUnmatched = [];
  let _stagingNoEan = [];
  let _visperaBatch = [];
  let _brandsProducers = [];
  let _categoryMapping = [];
  let _recentMatches = [];

  async function init() {
     // Intentar inicializar Supabase solo si el SDK está disponible (opcional, no bloquea)
     if (typeof supabase !== 'undefined') {
       try {
         _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
         console.log('⚡ Supabase SDK inicializado (Multi-Holding DW)');
       } catch(e) {
         console.warn('Supabase SDK presente pero fallo al inicializar:', e.message);
       }
     } else {
       console.info('ℹ Supabase SDK no disponible. Modo 100% local/offline.');
     }

     // Intentar cargar Holdings desde el servidor local (fallback a localStorage)
     try {
       const res = await fetch('http://localhost:3000/api/holdings');
       if (res.ok) {
         const serverHoldings = await res.json();
         if (Array.isArray(serverHoldings) && serverHoldings.length > 0) {
           _safeSetItem(HOLDINGS_KEY, JSON.stringify(serverHoldings));
           console.log(`⚡ Holdings cargados desde servidor: ${serverHoldings.length}`);
         } else if (!localStorage.getItem(HOLDINGS_KEY)) {
           _safeSetItem(HOLDINGS_KEY, JSON.stringify(DEFAULT_HOLDINGS));
         }
       } else if (!localStorage.getItem(HOLDINGS_KEY)) {
         _safeSetItem(HOLDINGS_KEY, JSON.stringify(DEFAULT_HOLDINGS));
       }
     } catch (_) {
       // Servidor offline — inicializar desde localStorage o defaults
       if (!localStorage.getItem(HOLDINGS_KEY)) {
         _safeSetItem(HOLDINGS_KEY, JSON.stringify(DEFAULT_HOLDINGS));
       }
     }

     // Intentar cargar Stores desde el servidor local (fallback a localStorage)
     try {
       const res = await fetch('http://localhost:3000/api/stores');
       if (res.ok) {
         const serverStores = await res.json();
         if (Array.isArray(serverStores) && serverStores.length > 0) {
           _safeSetItem(STORES_KEY, JSON.stringify(serverStores));
           console.log(`⚡ Stores cargados desde servidor: ${serverStores.length}`);
         } else if (!localStorage.getItem(STORES_KEY)) {
           _safeSetItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
         }
       } else if (!localStorage.getItem(STORES_KEY)) {
         _safeSetItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
       }
     } catch (_) {
       if (!localStorage.getItem(STORES_KEY)) {
         _safeSetItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
       }
     }

     // Cargar datos de staging desde localStorage
     _stagingLevantamiento = JSON.parse(localStorage.getItem(STAGING_LEVANTAMIENTO_KEY) || '[]');
     _stagingUnmatched = JSON.parse(localStorage.getItem(STAGING_UNMATCHED_KEY) || '[]');
     _stagingNoEan = JSON.parse(localStorage.getItem(STAGING_NO_EAN_KEY) || '[]');
     _visperaBatch = JSON.parse(localStorage.getItem(VISPERA_BATCH_KEY) || '[]');
     _brandsProducers = JSON.parse(localStorage.getItem(BRANDS_PRODUCERS_KEY) || '[]');
     _categoryMapping = JSON.parse(localStorage.getItem(CATEGORY_MAPPING_KEY) || '[]');
     _recentMatches = JSON.parse(localStorage.getItem(RECENT_MATCHES_KEY) || '[]');

     // Cargar productos (siempre, independientemente de Supabase)
     await fetchProducts();
  }

  async function fetchProducts() {
    try {
      let masterData = [];
      let holdingData = [];

      try {
        const res = await fetch('http://localhost:3000/api/products');
        if (res.ok) {
          const data = await res.json();
          masterData = data.master_catalog || [];
          holdingData = data.retailer_catalog || [];
        } else {
          console.warn('Local server no respondió correctamente. Usando caché local.');
        }
      } catch (err) {
        console.warn('Servidor local apagado (http://localhost:3000). Usando caché local offline.');
      }

      // Get local storage cache to reconstruct missing fields and offline additions
      const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
      
      _memoryProducts = {};

      // 1. Map from remote database (Supabase is source of truth → Universal Products)
      masterData.forEach(p => {
        const local = localCache[p.ean] || {};
        _memoryProducts[p.ean] = {
          ean: p.ean,
          masterProductId: p.ean, // master_product_id = ean as PK
          visperaId: p.vispera_id || local.visperaId || null,
          name: p.product_name || local.name || '',
          brand: p.brand || local.brand || 'N/A',
          brandId: p.brand_id || local.brandId || null,
          producerId: p.producer_id || local.producerId || null,
          category: p.category_master || local.category || 'GROCERY STORE',
          universalCategory: p.category_master || local.universalCategory || local.category || 'GROCERY STORE',
          imageUrl: p.image_url || local.imageUrl || null,
          images: p.images || local.images || [],
          status: p.product_name === 'Nuevo SKU de Terreno' || (p.product_name && p.product_name.includes('UNDEFINED')) ? 'review' : (local.status || 'active'),
          updatedAt: p.updated_at || local.updatedAt || new Date().toISOString(),
          createdAt: local.createdAt || new Date().toISOString(),
          
          // Reconstruct dimensions/weights (fallback to local if not on Supabase)
          weight_g: p.weight_g !== undefined ? p.weight_g : (local.weight_g || null),
          width_cm: p.width_cm !== undefined ? p.width_cm : (local.width_cm || null),
          height_cm: p.height_cm !== undefined ? p.height_cm : (local.height_cm || null),
          depth_cm: p.depth_cm !== undefined ? p.depth_cm : (local.depth_cm || null),
          packageType: p.package_type !== undefined ? p.package_type : (p.packageType !== undefined ? p.packageType : (local.packageType || null)),
          
          // Fallbacks for OFF fields
          offImageUrl: local.offImageUrl || null,
          offAttempted: p.off_attempted !== undefined ? p.off_attempted : (local.offAttempted || false),
          dataSource: p.data_source || local.dataSource || 'manual',
          
          // Holdings (formerly retailers) - Holding-Specific SKU Data
          holdings: local.holdings || local.retailers || {}
        };
      });

      // 2. Map holding relations from Supabase holding_sku_catalog (retailer_catalog)
      holdingData.forEach(r => {
        const p = _memoryProducts[r.ean];
        if (p) {
          p.holdings = p.holdings || {};
          p.holdings[r.retailer_id] = p.holdings[r.retailer_id] || {};
          
          // Merge remote values over local values → Holding SKU Catalog fields
          p.holdings[r.retailer_id] = {
            ...p.holdings[r.retailer_id],
            holdingProductId: r.uuid || p.holdings[r.retailer_id].holdingProductId,
            masterProductId: r.ean,
            holdingInternalId: r.internal_sku_id || p.holdings[r.retailer_id].holdingInternalId || p.holdings[r.retailer_id].customerId || r.ean,
            customerId: r.internal_sku_id || p.holdings[r.retailer_id].customerId || r.ean,
            localProductName: r.local_product_name || p.holdings[r.retailer_id].localProductName || p.holdings[r.retailer_id].name || p.name,
            name: p.holdings[r.retailer_id].name || p.name,
            localCategoryName: r.retailer_category || p.holdings[r.retailer_id].localCategoryName || p.holdings[r.retailer_id].category || p.category || 'General',
            category: r.retailer_category || p.holdings[r.retailer_id].category || p.category || 'General',
            isActiveHolding: r.is_trained !== false,
            stockStatus: r.is_trained !== false,
            updatedAt: r.updated_at || p.updatedAt
          };
        }
      });

      // Save merged database back to localStorage cache to align it
      _safeSetItem(PRODUCTS_CACHE_KEY, JSON.stringify(_memoryProducts));
    } catch (err) {
      console.error('fetchProducts failed:', err);
    }
    
    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveProduct(product, skipUndo = false) {
    if (!product.ean) return;
    
    // Undo stack push
    if (!skipUndo) {
      const old = _memoryProducts[product.ean] ? JSON.parse(JSON.stringify(_memoryProducts[product.ean])) : null;
      pushUndo('guardar producto', 'save', old, product.ean);
    }

    // Normalize: ensure holdings exists (migrate from retailers if needed)
    if (!product.holdings && product.retailers) {
      product.holdings = product.retailers;
    }
    if (!product.holdings) product.holdings = {};

    _memoryProducts[product.ean] = product;
    
    // Save to LocalStorage cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    localCache[product.ean] = product;
    _safeSetItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));
    
    // Build Universal Products (master_catalog) payload
    const payload = {
      ean: product.ean,
      product_name: product.name || 'Sin Nombre',
      brand: product.brand || 'N/A',
      category_master: product.universalCategory || product.category || 'GROCERY STORE',
      image_url: product.imageUrl || null
    };

    if (_availableColumns.has('weight_g')) payload.weight_g = product.weight_g;
    if (_availableColumns.has('width_cm')) payload.width_cm = product.width_cm;
    if (_availableColumns.has('height_cm')) payload.height_cm = product.height_cm;
    if (_availableColumns.has('depth_cm')) payload.depth_cm = product.depth_cm;
    if (_availableColumns.has('package_type')) payload.package_type = product.packageType;
    if (_availableColumns.has('images')) payload.images = product.images || [];
    if (_availableColumns.has('data_source')) payload.data_source = product.dataSource || 'manual';
    if (_availableColumns.has('off_attempted')) payload.off_attempted = product.offAttempted || false;

    try {
      // Upsert product and relations to Local Server
      const holdingRelations = [];
      if (product.holdings) {
        for (const [hid, hData] of Object.entries(product.holdings)) {
          holdingRelations.push({
            ean: product.ean,
            retailer_id: hid,
            internal_sku_id: hData.holdingInternalId || hData.customerId || product.ean,
            retailer_category: hData.localCategoryName || hData.category || 'General',
            is_trained: hData.isActiveHolding !== false && hData.stockStatus !== false
          });
        }
      }

      try {
        await fetch('http://localhost:3000/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: payload, holdingRelations })
        });
      } catch (err) {
        console.warn('Servidor local apagado. Cambios guardados solo en LocalStorage.');
      }
    } catch (err) {
      console.error('Local save failed:', err);
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  // Legacy alias
  const saveHoldingRelation = () => {};

  // Legacy alias
  const saveRetailerRelation = saveHoldingRelation;

  function getProduct(ean) {
    return _memoryProducts[ean] || null;
  }

  function getProductsArray() {
    return Object.values(_memoryProducts);
  }

  // ── Holdings (formerly Retailers — stored in LocalStorage for customizable CRUD) ───
  function getHoldings() {
    return JSON.parse(localStorage.getItem(HOLDINGS_KEY) || JSON.stringify(DEFAULT_HOLDINGS));
  }
  // Legacy alias
  function getRetailers() { return getHoldings(); }
  
  function saveHoldings(h) {
    _safeSetItem(HOLDINGS_KEY, JSON.stringify(h));
    // Sincronizar con servidor local (best-effort, no bloquea)
    fetch('http://localhost:3000/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(h)
    }).catch(() => {});
  }
  function saveRetailers(h) { saveHoldings(h); }
  
  function addHolding(holding) {
    const list = getHoldings();
    list.push(holding);
    saveHoldings(list);
  }
  function addRetailer(r) { addHolding(r); }
  
  function updateHolding(id, updates) {
    const list = getHoldings();
    const i = list.findIndex(h => h.id === id);
    if (i !== -1) {
      list[i] = { ...list[i], ...updates };
      saveHoldings(list);
      return list[i];
    }
    return null;
  }
  function updateRetailer(id, u) { return updateHolding(id, u); }
  
  function deleteHolding(id) {
    saveHoldings(getHoldings().filter(h => h.id !== id));
  }
  function deleteRetailer(id) { deleteHolding(id); }

  function computeCompleteness(p) {
    if (!p) return 0;
    let score = 0;
    if (p.name)        score += 15;
    if (p.brand)       score += 15;
    if (p.universalCategory || p.category) score += 10;
    if (p.packageType) score += 10;
    if (p.weight_g)    score += 10;
    if (p.imageUrl || (p.images && p.images.length > 0)) score += 20;
    if (p.width_cm && p.height_cm && p.depth_cm) score += 20;
    return Math.min(score, 100);
  }

  // ── EAN-13 checksum validation ─────────────
  function validateEAN(ean) {
    const s = String(ean || '').trim().replace(/\D/g, '');
    if (s.length !== 13 && s.length !== 8) return { valid: false, reason: 'El EAN debe tener 8 o 13 dígitos' };
    // EAN-8 or EAN-13 checksum
    const digits = s.split('').map(Number);
    const len = digits.length;
    let sum = 0;
    for (let i = 0; i < len - 1; i++) {
      sum += digits[i] * (len === 13 ? (i % 2 === 0 ? 1 : 3) : (i % 2 === 0 ? 3 : 1));
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    if (checkDigit !== digits[len - 1]) {
      return { valid: false, reason: `Dígito de control incorrecto (esperado ${checkDigit})` };
    }
    return { valid: true, reason: null };
  }

  async function deleteProduct(ean, skipUndo = false) {
    if (!ean) return;
    
    // Undo stack push
    if (!skipUndo) {
      const old = _memoryProducts[ean] ? JSON.parse(JSON.stringify(_memoryProducts[ean])) : null;
      if (old) pushUndo('eliminar producto', 'delete', old);
    }

    delete _memoryProducts[ean];
    
    // Update local cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    delete localCache[ean];
    _safeSetItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    try {
      await fetch('http://localhost:3000/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eans: [ean] })
      });
    } catch (err) {
      console.warn('Servidor local apagado. Eliminado solo en LocalStorage.');
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function deleteProducts(eans, skipUndo = false) {
    if (!eans || !eans.length) return;
    
    if (!skipUndo) {
      const oldProducts = eans.map(ean => _memoryProducts[ean]).filter(Boolean);
      pushUndo('eliminar múltiples productos', 'delete', oldProducts);
    }

    eans.forEach(ean => delete _memoryProducts[ean]);

    // Update local cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    eans.forEach(ean => delete localCache[ean]);
    _safeSetItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    try {
      await fetch('http://localhost:3000/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eans })
      });
    } catch (err) {
      console.warn('Servidor local apagado. Eliminado bulk solo en LocalStorage.');
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveProducts(productsArray) {
    if (!productsArray || !productsArray.length) return;
    
    // 1. Update in-memory and local storage cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    productsArray.forEach(p => {
      // Normalize: ensure holdings exists
      if (!p.holdings && p.retailers) p.holdings = p.retailers;
      if (!p.holdings) p.holdings = {};
      _memoryProducts[p.ean] = p;
      localCache[p.ean] = p;
    });
    _safeSetItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    // 2. Prepare payload for bulk upsert to master_catalog (Universal Products)
    const payload = productsArray.map(p => {
      const masterRow = {
        ean: p.ean,
        product_name: p.name || 'Sin Nombre',
        brand: p.brand || 'N/A',
        category_master: p.universalCategory || p.category || 'GROCERY STORE',
        image_url: p.imageUrl || null
      };
      
      if (_availableColumns.has('weight_g')) masterRow.weight_g = p.weight_g;
      if (_availableColumns.has('width_cm')) masterRow.width_cm = p.width_cm;
      if (_availableColumns.has('height_cm')) masterRow.height_cm = p.height_cm;
      if (_availableColumns.has('depth_cm')) masterRow.depth_cm = p.depth_cm;
      if (_availableColumns.has('package_type')) masterRow.package_type = p.packageType;
      if (_availableColumns.has('images')) masterRow.images = p.images || [];
      if (_availableColumns.has('data_source')) masterRow.data_source = p.dataSource || 'manual';
      if (_availableColumns.has('off_attempted')) masterRow.off_attempted = p.offAttempted || false;
      
      return masterRow;
    });

    try {
      const holdingRelations = [];
      for (const p of productsArray) {
        const holdings = p.holdings || p.retailers || {};
        if (holdings) {
          for (const [hid, hData] of Object.entries(holdings)) {
            holdingRelations.push({
              ean: p.ean,
              retailer_id: hid,
              internal_sku_id: hData.holdingInternalId || hData.customerId || p.ean,
              local_product_name: hData.localProductName || hData.name || p.name,
              retailer_category: hData.localCategoryName || hData.category || 'General',
              is_trained: hData.isActiveHolding !== false && hData.stockStatus !== false,
              updated_at: hData.updatedAt || new Date().toISOString()
            });
          }
        }
      }

      await fetch('http://localhost:3000/api/products/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: payload, holdingRelations })
      });
    } catch (err) {
      console.warn('Servidor local apagado. Upsert masivo guardado solo en LocalStorage.');
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  // ── Staging: Levantamiento ────────────────────
  function getStagingLevantamiento() { return _stagingLevantamiento; }

  function addStagingLevantamiento(entry) {
    entry.id = entry.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    entry.timestamp = entry.timestamp || new Date().toISOString();
    _stagingLevantamiento.push(entry);
    
    _safeSetItem(STAGING_LEVANTAMIENTO_KEY, JSON.stringify(_stagingLevantamiento));
    return entry;
  }

  function clearStagingLevantamiento() {
    _stagingLevantamiento = [];
    _safeSetItem(STAGING_LEVANTAMIENTO_KEY, JSON.stringify([]));
  }

  // ── Staging: Unmatched EANs ─────────────────
  function getStagingUnmatched() { return _stagingUnmatched; }

  function addStagingUnmatched(entry) {
    entry.id = entry.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    _stagingUnmatched.push(entry);
    _safeSetItem(STAGING_UNMATCHED_KEY, JSON.stringify(_stagingUnmatched));
    return entry;
  }

  function updateStagingUnmatched(id, updates) {
    const idx = _stagingUnmatched.findIndex(e => e.id === id);
    if (idx !== -1) {
      _stagingUnmatched[idx] = { ..._stagingUnmatched[idx], ...updates };
      _safeSetItem(STAGING_UNMATCHED_KEY, JSON.stringify(_stagingUnmatched));
      return _stagingUnmatched[idx];
    }
    return null;
  }

  function updateStagingUnmatchedBatch(updatesArray) {
    let changed = false;
    for (const { id, updates } of updatesArray) {
      const idx = _stagingUnmatched.findIndex(e => e.id === id);
      if (idx !== -1) {
        _stagingUnmatched[idx] = { ..._stagingUnmatched[idx], ...updates };
        changed = true;
      }
    }
    if (changed) {
      _safeSetItem(STAGING_UNMATCHED_KEY, JSON.stringify(_stagingUnmatched));
    }
  }

  function removeStagingUnmatched(id) {
    _stagingUnmatched = _stagingUnmatched.filter(e => e.id !== id);
    _safeSetItem(STAGING_UNMATCHED_KEY, JSON.stringify(_stagingUnmatched));
  }

  function clearStagingUnmatched() {
    _stagingUnmatched = [];
    _safeSetItem(STAGING_UNMATCHED_KEY, JSON.stringify([]));
  }

  // ── Staging: Por Identificar (Sin EAN / Terreno) ───────
  function getStagingNoEan() { return _stagingNoEan; }

  function addStagingNoEan(entry) {
    entry.id = entry.id || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    entry.timestamp = entry.timestamp || new Date().toISOString();
    entry.status = entry.status || 'PENDING_EAN';
    _stagingNoEan.push(entry);
    _safeSetItem(STAGING_NO_EAN_KEY, JSON.stringify(_stagingNoEan));
    return entry;
  }

  function updateStagingNoEan(id, updates) {
    const idx = _stagingNoEan.findIndex(e => e.id === id);
    if (idx !== -1) {
      _stagingNoEan[idx] = { ..._stagingNoEan[idx], ...updates };
      _safeSetItem(STAGING_NO_EAN_KEY, JSON.stringify(_stagingNoEan));
      return _stagingNoEan[idx];
    }
    return null;
  }

  function removeStagingNoEan(id) {
    _stagingNoEan = _stagingNoEan.filter(e => e.id !== id);
    _safeSetItem(STAGING_NO_EAN_KEY, JSON.stringify(_stagingNoEan));
  }

  function clearStagingNoEan() {
    _stagingNoEan = [];
    _safeSetItem(STAGING_NO_EAN_KEY, JSON.stringify([]));
  }

  // ── Vispera Submission Batch ─────────────────
  function getVisperaBatch() { return _visperaBatch; }

  function addVisperaBatchItem(item) {
    item.batchId = item.batchId || (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36));
    item.status = item.status || 'PENDING_REVIEW';
    item.createdAt = item.createdAt || new Date().toISOString();
    _visperaBatch.push(item);
    _safeSetItem(VISPERA_BATCH_KEY, JSON.stringify(_visperaBatch));
    return item;
  }

  function updateVisperaBatchItem(batchId, updates) {
    const idx = _visperaBatch.findIndex(b => b.batchId === batchId);
    if (idx !== -1) {
      _visperaBatch[idx] = { ..._visperaBatch[idx], ...updates };
      _safeSetItem(VISPERA_BATCH_KEY, JSON.stringify(_visperaBatch));
      return _visperaBatch[idx];
    }
    return null;
  }

  function clearVisperaBatch() {
    _visperaBatch = [];
    _safeSetItem(VISPERA_BATCH_KEY, JSON.stringify([]));
  }

  // ── Brands & Producers ──────────────────────
  function getBrandsProducers() { return _brandsProducers; }

  function addBrandProducer(entry) {
    const existing = _brandsProducers.find(b => b.brandId === entry.brandId);
    if (existing) return existing;
    _brandsProducers.push(entry);
    _safeSetItem(BRANDS_PRODUCERS_KEY, JSON.stringify(_brandsProducers));
    return entry;
  }

  // ── Category Mapping ──────────────────────────
  function getCategoryMapping() { return _categoryMapping; }

  function addCategoryMapping(ean, visperaCategoryId) {
    const existing = _categoryMapping.findIndex(m => m.ean === ean);
    const entry = { ean, visperaCategoryId, categoryName: visperaCategoryId };
    if (existing !== -1) {
      _categoryMapping[existing] = entry;
    } else {
      _categoryMapping.push(entry);
    }
    _safeSetItem(CATEGORY_MAPPING_KEY, JSON.stringify(_categoryMapping));
    return entry;
  }

  function getRecentMatches() {
    return [..._recentMatches];
  }

  function addRecentMatch(match) {
    _recentMatches.unshift({ ...match, matchDate: new Date().toISOString() });
    if (_recentMatches.length > 500) _recentMatches = _recentMatches.slice(0, 500);
    _safeSetItem(RECENT_MATCHES_KEY, JSON.stringify(_recentMatches));
  }

  function clearRecentMatches() {
    _recentMatches = [];
    _safeSetItem(RECENT_MATCHES_KEY, JSON.stringify(_recentMatches));
  }

  // ── backup / restore ───────────────────────
  function exportBackup() {
    return JSON.stringify(getProductsArray(), null, 2);
  }

  function importBackup(jsonString) {
    try {
      const productsArray = JSON.parse(jsonString);
      if (!Array.isArray(productsArray)) throw new Error('El backup debe ser un arreglo de productos.');
      saveProducts(productsArray);
      return { products: productsArray.length };
    } catch (e) {
      throw new Error('Formato de backup inválido: ' + e.message);
    }
  }

  function resetToDefaults() {
    localStorage.removeItem(PRODUCTS_CACHE_KEY);
    localStorage.removeItem(PLANOGRAMS_KEY);
    localStorage.removeItem(STAGING_LEVANTAMIENTO_KEY);
    localStorage.removeItem(STAGING_UNMATCHED_KEY);
    localStorage.removeItem(STAGING_NO_EAN_KEY);
    localStorage.removeItem(VISPERA_BATCH_KEY);
    localStorage.removeItem(BRANDS_PRODUCERS_KEY);
    localStorage.removeItem(CATEGORY_MAPPING_KEY);
    _safeSetItem(HOLDINGS_KEY, JSON.stringify(DEFAULT_HOLDINGS));
    _safeSetItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
    _memoryProducts = {};
    _undoStack = [];
    _stagingLevantamiento = [];
    _stagingUnmatched = [];
    _stagingNoEan = [];
    _visperaBatch = [];
    _brandsProducers = [];
    _categoryMapping = [];
    fetchProducts();
  }

  // ── physical stores ──────────────────────────
  function getStores(holdingId = 'all') {
    const list = JSON.parse(localStorage.getItem(STORES_KEY) || JSON.stringify(DEFAULT_STORES));
    if (holdingId === 'all') return list;
    return list.filter(s => s.holdingId === holdingId || s.retailerId === holdingId);
  }

  function getStore(storeId) {
    const list = getStores();
    return list.find(s => s.storeId === storeId) || null;
  }

  function saveStore(store) {
    // Ensure holdingId is set (backward compat from retailerId)
    if (!store.holdingId && store.retailerId) store.holdingId = store.retailerId;
    if (!store.retailerId && store.holdingId) store.retailerId = store.holdingId;
    const list = getStores();
    const idx = list.findIndex(s => s.storeId === store.storeId);
    if (idx !== -1) {
      list[idx] = store;
    } else {
      list.push(store);
    }
    _safeSetItem(STORES_KEY, JSON.stringify(list));
    // Sincronizar con servidor local (best-effort)
    fetch('http://localhost:3000/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    }).catch(() => {});
    return store;
  }

  function deleteStore(storeId) {
    const list = getStores().filter(s => s.storeId !== storeId);
    _safeSetItem(STORES_KEY, JSON.stringify(list));
    // Sincronizar con servidor local (best-effort)
    fetch('http://localhost:3000/api/stores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    }).catch(() => {});
  }

  function getStorePlanogram(storeId) {
    const explicit = JSON.parse(localStorage.getItem(PLANOGRAMS_KEY) || '[]');
    const storePlanogram = explicit.filter(item => item.storeId === storeId);
    if (storePlanogram.length > 0) return storePlanogram;

    const products = getProductsArray();
    const store = getStore(storeId);
    if (!store) return [];

    const holdingId = store.holdingId || store.retailerId;
    const planogram = [];
    const aisles = ['Aceites y Aderezos', 'Lácteos y Quesos', 'Limpieza del Hogar', 'Bebidas y Licores', 'Snacks y Galletas'];
    
    products.forEach((p, idx) => {
      const holdings = p.holdings || p.retailers || {};
      if (!holdings[holdingId]) return;
      
      const hData = holdings[holdingId];
      const aisle = hData.dmu || hData.category || aisles[idx % aisles.length];
      const shelf = `Góndola ${(idx % 4) + 1} - Repisa ${(idx % 3) + 1}`;
      
      planogram.push({
        planogramId: `PL-${storeId}-${p.ean.slice(-4)}`,
        storeId: storeId,
        ean: p.ean,
        productName: p.name || 'Sin Nombre',
        brand: p.brand || 'N/A',
        officialAisle: aisle,
        officialShelf: shelf,
        dmu: hData.dmu || aisle,
        position: hData.position || null,
        isCertified: true
      });
    });
    return planogram;
  }

  function getStoreCaptureSessions(storeId) {
    const store = getStore(storeId);
    if (!store) return [];

    const localSessions = JSON.parse(localStorage.getItem('ss_capture_sessions') || '[]');
    const storeSessions = localSessions.filter(s => s.storeId === storeId);
    if (storeSessions.length > 0) return storeSessions;

    const holdingId = store.holdingId || store.retailerId;
    const products = getProductsArray().filter(p => {
      const holdings = p.holdings || p.retailers || {};
      return holdings[holdingId];
    });
    if (products.length === 0) return [];

    const sessions = [
      {
        sessionId: `SESS-${storeId}-001`,
        storeId: storeId,
        aisleId: 'ACEITES Y ADEREZOS',
        auditorId: 'Gabriel Hermosilla',
        startTime: new Date(Date.now() - 3600000 * 24).toISOString(),
        items: products.slice(0, Math.min(products.length, 5)).map((p, idx) => {
          const isDiscrepancy = idx === 1;
          return {
            itemUuid: `ITEM-${p.ean.slice(-4)}-1`,
            ean: p.ean,
            productName: p.name,
            rawOcrText: isDiscrepancy ? (p.name ? p.name.toUpperCase().slice(0, 12) + ' MODIF' : 'UNKNOWN') : (p.name ? p.name.toUpperCase() : 'OK'),
            photoUrl: p.imageUrl || 'logo.png',
            isDiscrepancy: isDiscrepancy
          };
        })
      },
      {
        sessionId: `SESS-${storeId}-002`,
        storeId: storeId,
        aisleId: 'LIMPIEZA Y CUIDADO',
        auditorId: 'Sofía Gómez',
        startTime: new Date(Date.now() - 3600000 * 48).toISOString(),
        items: products.slice(Math.max(0, products.length - 3)).map((p, idx) => {
          return {
            itemUuid: `ITEM-${p.ean.slice(-4)}-2`,
            ean: p.ean,
            productName: p.name,
            rawOcrText: p.name ? p.name.toUpperCase() : 'OK',
            photoUrl: p.imageUrl || 'logo.png',
            isDiscrepancy: false
          };
        })
      }
    ];

    return sessions;
  }

  function saveCaptureSession(session) {
    const list = JSON.parse(localStorage.getItem('ss_capture_sessions') || '[]');
    const idx = list.findIndex(s => s.sessionId === session.sessionId);
    if (idx !== -1) {
      list[idx] = session;
    } else {
      list.push(session);
    }
    _safeSetItem('ss_capture_sessions', JSON.stringify(list));
  }

  // ── undo/redo stack ────────────────────────
  function pushUndo(label, action, state, ean = null) {
    _undoStack.push({ label, action, state, ean, at: new Date().toISOString() });
    if (_undoStack.length > 15) _undoStack.shift(); // keep last 15
  }

  function getUndo() {
    return _undoStack[_undoStack.length - 1] || null;
  }

  function applyUndo() {
    const op = _undoStack.pop();
    if (!op) return false;

    if (op.action === 'save') {
      if (op.state) {
        saveProduct(op.state, true);
      } else if (op.ean) {
        deleteProduct(op.ean, true);
      }
    } else if (op.action === 'delete') {
      const products = Array.isArray(op.state) ? op.state : [op.state];
      saveProducts(products);
    }
    return true;
  }

  function savePlanogram(items) {
    const list = JSON.parse(localStorage.getItem(PLANOGRAMS_KEY) || '[]');
    items.forEach(item => {
      const idx = list.findIndex(x => x.storeId === item.storeId && x.ean === item.ean);
      if (idx !== -1) {
        list[idx] = item;
      } else {
        list.push(item);
      }
    });
    _safeSetItem(PLANOGRAMS_KEY, JSON.stringify(list));
  }

  // Convierte un Blob a Data URL (base64) — funciona siempre offline
  function _blobToDataURL(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  async function uploadProductImage(ean, blob, type = 'product') {
    // Fallback inmediato si no hay Supabase: usar Data URL (base64 local)
    if (!_supabase) {
      console.info('Supabase no disponible. Imagen guardada como Data URL local.');
      return _blobToDataURL(blob);
    }

    const fileExt = blob.type.split('/')[1] || 'png';
    const filepath = `${type}s/${ean}-${Date.now()}.${fileExt}`;
    
    try {
      const { data, error } = await _supabase.storage
        .from('product-images')
        .upload(filepath, blob, {
          contentType: blob.type || 'image/png',
          upsert: true
        });

      if (error) {
        console.warn('Supabase storage upload fallback a Data URL:', error.message);
        return _blobToDataURL(blob);
      }

      const { data: publicUrlData } = _supabase.storage
        .from('product-images')
        .getPublicUrl(filepath);
        
      return publicUrlData.publicUrl;
    } catch (err) {
      console.warn('uploadProductImage error, usando Data URL:', err.message);
      return _blobToDataURL(blob);
    }
  }

  return {
    init,
    fetchProducts,
    getProduct,
    getProductsArray,
    // Holdings (new) + legacy aliases
    getHoldings,
    getRetailers,
    saveHoldings,
    saveRetailers,
    addHolding,
    addRetailer,
    updateHolding,
    updateRetailer,
    deleteHolding,
    deleteRetailer,
    // Products
    saveProduct,
    saveProducts,
    deleteProduct,
    deleteProducts,
    computeCompleteness,
    validateEAN,
    exportBackup,
    importBackup,
    resetToDefaults,
    getUndo,
    applyUndo,
    // Stores
    getStores,
    getStore,
    saveStore,
    deleteStore,
    getStorePlanogram,
    getStoreCaptureSessions,
    savePlanogram,
    saveCaptureSession,
    uploadProductImage,
    // Staging & Pipeline
    getStagingLevantamiento,
    addStagingLevantamiento,
    clearStagingLevantamiento,
    getStagingUnmatched, addStagingUnmatched, updateStagingUnmatched, updateStagingUnmatchedBatch,
    removeStagingUnmatched,
    clearStagingUnmatched,
    getStagingNoEan, addStagingNoEan, updateStagingNoEan, removeStagingNoEan, clearStagingNoEan,
    getVisperaBatch,
    addVisperaBatchItem,
    updateVisperaBatchItem,
    clearVisperaBatch,
    // Brands & Producers
    getBrandsProducers,
    addBrandProducer,
    // Category Mapping
    getCategoryMapping,
    addCategoryMapping,
    // Recent Matches
    getRecentMatches,
    addRecentMatch,
    clearRecentMatches
  };
})();
