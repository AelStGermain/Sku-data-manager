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
//  DATABASE (Supabase Backend + Local Cache)
// ──────────────────────────────────────────────
const DB = (() => {
  const SUPABASE_URL = window.NEXT_PUBLIC_SUPABASE_URL || 'https://vijowftfzwcbgkfsglhy.supabase.co';
  const SUPABASE_KEY = window.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_-5KjPgzE1FNDtoZyf8DbJA_cENpDqPV';
  
  const PRODUCTS_CACHE_KEY = 'ss_products_cache';
  const RETAILERS_KEY = 'ss_retailers';
  const STORES_KEY = 'ss_physical_stores';
  const PLANOGRAMS_KEY = 'ss_planograms';

  const DEFAULT_RETAILERS = [
    { id: 'tottus',  name: 'Tottus',  color: '#E8001C', logoUrl: 'tottus_logo.png' },
    { id: 'jumbo',   name: 'Jumbo',   color: '#009A44', logoUrl: 'jumbo_logo.png' },
    { id: 'unimarc', name: 'Unimarc', color: '#005BAC', logoUrl: 'unimarc_logo.png' }
  ];

  const DEFAULT_STORES = [
    { storeId: 'tkm_kennedy', retailerId: 'tottus', city: 'Santiago', branchName: 'Sucursal Kennedy' },
    { storeId: 'tottus_nunoa', retailerId: 'tottus', city: 'Santiago', branchName: 'Sucursal Ñuñoa' },
    { storeId: 'jumbo_bilbao', retailerId: 'jumbo', city: 'Santiago', branchName: 'Sucursal Francisco Bilbao' },
    { storeId: 'jumbo_kennedy', retailerId: 'jumbo', city: 'Santiago', branchName: 'Sucursal Portal La Reina' },
    { storeId: 'unimarc_los_leones', retailerId: 'unimarc', city: 'Santiago', branchName: 'Sucursal Los Leones' }
  ];

  let _supabase = null;
  let _memoryProducts = {};
  let _availableColumns = new Set();
  let _undoStack = [];

  async function init() {
     if (typeof supabase === 'undefined') {
       console.warn('Supabase SDK no cargado. Asegúrate de incluirlo en index.html');
       return;
     }
     _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
     console.log('⚡ Conectado a Master Data Hub (Supabase)');
     
     // Initialize retailers in localStorage if not set
     if (!localStorage.getItem(RETAILERS_KEY)) {
       localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
     }

     // Initialize stores in localStorage if not set
     if (!localStorage.getItem(STORES_KEY)) {
       localStorage.setItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
     }

     // Load initial data
     await fetchProducts();
  }

  async function fetchProducts() {
    try {
      const { data: masterData, error: masterError } = await _supabase
        .from('master_catalog')
        .select('*');
      
      if (masterError) {
        console.error('Error cargando catálogo maestro:', masterError);
        return;
      }

      // Check available columns on the remote database
      _availableColumns.clear();
      if (masterData && masterData.length > 0) {
        Object.keys(masterData[0]).forEach(k => _availableColumns.add(k));
      }

      // Try fetching retailer_catalog data
      let retailerData = [];
      try {
        const { data, error } = await _supabase
          .from('retailer_catalog')
          .select('*');
        if (!error && data) {
          retailerData = data;
        }
      } catch (err) {
        console.warn('retailer_catalog table fetch not supported or failed:', err);
      }

      // Get local storage cache to reconstruct missing fields and offline additions
      const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
      
      _memoryProducts = {};

      // 1. Map from remote database (Supabase is source of truth)
      masterData.forEach(p => {
        const local = localCache[p.ean] || {};
        _memoryProducts[p.ean] = {
          ean: p.ean,
          name: p.product_name || local.name || '',
          brand: p.brand || local.brand || 'N/A',
          category: p.category_master || local.category || 'Otro',
          imageUrl: p.image_url || local.imageUrl || null,
          status: p.product_name === 'Nuevo SKU de Terreno' || p.product_name.includes('UNDEFINED') ? 'review' : (local.status || 'active'),
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
          offAttempted: local.offAttempted || false,
          dataSource: p.dataSource || local.dataSource || 'manual',
          retailers: local.retailers || {}
        };
      });

      // 2. Map retailer relations from Supabase retailer_catalog
      retailerData.forEach(r => {
        const p = _memoryProducts[r.ean];
        if (p) {
          p.retailers = p.retailers || {};
          p.retailers[r.retailer_id] = p.retailers[r.retailer_id] || {};
          
          // Merge remote values over local values
          p.retailers[r.retailer_id] = {
            ...p.retailers[r.retailer_id],
            customerId: r.internal_sku_id || p.retailers[r.retailer_id].customerId || r.ean,
            category: r.retailer_category || p.retailers[r.retailer_id].category || p.category || 'General',
            stockStatus: r.is_trained !== false,
            updatedAt: r.updated_at || p.updatedAt
          };
        }
      });

      // Save merged database back to localStorage cache to align it
      localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(_memoryProducts));
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

    _memoryProducts[product.ean] = product;
    
    // Save to LocalStorage cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    localCache[product.ean] = product;
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));
    
    // Build master catalog payload dynamically based on database capabilities
    const payload = {
      ean: product.ean,
      product_name: product.name || 'Sin Nombre',
      brand: product.brand || 'N/A',
      category_master: product.category || 'General',
      image_url: product.imageUrl || null
    };

    if (_availableColumns.has('weight_g')) payload.weight_g = product.weight_g;
    if (_availableColumns.has('width_cm')) payload.width_cm = product.width_cm;
    if (_availableColumns.has('height_cm')) payload.height_cm = product.height_cm;
    if (_availableColumns.has('depth_cm')) payload.depth_cm = product.depth_cm;
    if (_availableColumns.has('package_type')) payload.package_type = product.packageType;

    try {
      // Upsert product in Supabase master_catalog
      const { error } = await _supabase
        .from('master_catalog')
        .upsert(payload, { onConflict: 'ean' });

      if (error) console.error('Error guardando en Supabase:', error);
      
      // Upsert relations in Supabase retailer_catalog
      if (product.retailers) {
        for (const [rid, rData] of Object.entries(product.retailers)) {
          await saveRetailerRelation(product.ean, rid, rData);
        }
      }
    } catch (err) {
      console.error('Supabase save failed:', err);
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveRetailerRelation(ean, rid, rData) {
    try {
      const { data, error } = await _supabase
        .from('retailer_catalog')
        .select('uuid')
        .eq('ean', ean)
        .eq('retailer_id', rid);
      
      const payload = {
        ean: ean,
        retailer_id: rid,
        internal_sku_id: rData.customerId || ean,
        retailer_category: rData.category || 'General',
        is_trained: rData.stockStatus !== false
      };

      if (data && data.length > 0) {
        await _supabase
          .from('retailer_catalog')
          .update(payload)
          .eq('uuid', data[0].uuid);
      } else {
        await _supabase
          .from('retailer_catalog')
          .insert({
            uuid: crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36)),
            ...payload
          });
      }
    } catch (err) {
      console.warn('Error syncing retailer relation to Supabase:', err);
    }
  }

  function getProduct(ean) {
    return _memoryProducts[ean] || null;
  }

  function getProductsArray() {
    return Object.values(_memoryProducts);
  }

  // ── retailers (stored in LocalStorage for customizable CRUD) ───
  function getRetailers() {
    return JSON.parse(localStorage.getItem(RETAILERS_KEY) || JSON.stringify(DEFAULT_RETAILERS));
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
    if (i !== -1) {
      list[i] = { ...list[i], ...updates };
      saveRetailers(list);
      return list[i];
    }
    return null;
  }
  
  function deleteRetailer(id) {
    saveRetailers(getRetailers().filter(r => r.id !== id));
  }

  function computeCompleteness(p) {
    if (!p) return 0;
    let score = 0;
    if (p.name)        score += 15;
    if (p.brand)       score += 15;
    if (p.category)    score += 10;
    if (p.packageType) score += 10;
    if (p.weight_g)    score += 10;
    if (p.imageUrl)    score += 20;
    if (p.width_cm && p.height_cm && p.depth_cm) score += 20;
    return Math.min(score, 100);
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
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    try {
      // Delete from master_catalog (retailer_catalog relation usually cascades or is deleted too)
      await _supabase.from('retailer_catalog').delete().eq('ean', ean);
      const { error } = await _supabase.from('master_catalog').delete().eq('ean', ean);
      if (error) console.error('Error borrando en Supabase:', error);
    } catch (err) {
      console.error('Supabase delete failed:', err);
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
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    try {
      await _supabase.from('retailer_catalog').delete().in('ean', eans);
      const { error } = await _supabase.from('master_catalog').delete().in('ean', eans);
      if (error) console.error('Error borrando bulk en Supabase:', error);
    } catch (err) {
      console.error('Supabase delete bulk failed:', err);
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
  }

  async function saveProducts(productsArray) {
    if (!productsArray || !productsArray.length) return;
    
    // 1. Update in-memory and local storage cache
    const localCache = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || '{}');
    productsArray.forEach(p => {
      _memoryProducts[p.ean] = p;
      localCache[p.ean] = p;
    });
    localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(localCache));

    // 2. Prepare payload for bulk upsert to master_catalog
    const payload = productsArray.map(p => {
      const masterRow = {
        ean: p.ean,
        product_name: p.name || 'Sin Nombre',
        brand: p.brand || 'N/A',
        category_master: p.category || 'General',
        image_url: p.imageUrl || null
      };
      
      if (_availableColumns.has('weight_g')) masterRow.weight_g = p.weight_g;
      if (_availableColumns.has('width_cm')) masterRow.width_cm = p.width_cm;
      if (_availableColumns.has('height_cm')) masterRow.height_cm = p.height_cm;
      if (_availableColumns.has('depth_cm')) masterRow.depth_cm = p.depth_cm;
      if (_availableColumns.has('package_type')) masterRow.package_type = p.packageType;
      
      return masterRow;
    });

    try {
      const { error } = await _supabase
        .from('master_catalog')
        .upsert(payload, { onConflict: 'ean' });
      
      if (error) console.error('Error upsert masivo en Supabase:', error);

      // Save retailer relations in background
      for (const p of productsArray) {
        if (p.retailers) {
          for (const [rid, rData] of Object.entries(p.retailers)) {
            await saveRetailerRelation(p.ean, rid, rData);
          }
        }
      }
    } catch (err) {
      console.error('Supabase bulk save failed:', err);
    }

    if (window.App && window.App.refreshData) window.App.refreshData();
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
    localStorage.setItem(RETAILERS_KEY, JSON.stringify(DEFAULT_RETAILERS));
    localStorage.setItem(STORES_KEY, JSON.stringify(DEFAULT_STORES));
    _memoryProducts = {};
    _undoStack = [];
    fetchProducts();
  }

  // ── physical stores ──────────────────────────
  function getStores(retailerId = 'all') {
    const list = JSON.parse(localStorage.getItem(STORES_KEY) || JSON.stringify(DEFAULT_STORES));
    if (retailerId === 'all') return list;
    return list.filter(s => s.retailerId === retailerId);
  }

  function getStore(storeId) {
    const list = getStores();
    return list.find(s => s.storeId === storeId) || null;
  }

  function saveStore(store) {
    const list = getStores();
    const idx = list.findIndex(s => s.storeId === store.storeId);
    if (idx !== -1) {
      list[idx] = store;
    } else {
      list.push(store);
    }
    localStorage.setItem(STORES_KEY, JSON.stringify(list));
    return store;
  }

  function deleteStore(storeId) {
    const list = getStores().filter(s => s.storeId !== storeId);
    localStorage.setItem(STORES_KEY, JSON.stringify(list));
  }

  function getStorePlanogram(storeId) {
    const explicit = JSON.parse(localStorage.getItem(PLANOGRAMS_KEY) || '[]');
    const storePlanogram = explicit.filter(item => item.storeId === storeId);
    if (storePlanogram.length > 0) return storePlanogram;

    const products = getProductsArray();
    const store = getStore(storeId);
    if (!store) return [];

    const planogram = [];
    const aisles = ['Aceites y Aderezos', 'Lácteos y Quesos', 'Limpieza del Hogar', 'Bebidas y Licores', 'Snacks y Galletas'];
    
    products.forEach((p, idx) => {
      if (!p.retailers || !p.retailers[store.retailerId]) return;
      
      const rData = p.retailers[store.retailerId];
      const aisle = rData.dmu || rData.category || aisles[idx % aisles.length];
      const shelf = `Góndola ${(idx % 4) + 1} - Repisa ${(idx % 3) + 1}`;
      
      planogram.push({
        planogramId: `PL-${storeId}-${p.ean.slice(-4)}`,
        storeId: storeId,
        ean: p.ean,
        productName: p.name || 'Sin Nombre',
        brand: p.brand || 'N/A',
        officialAisle: aisle,
        officialShelf: shelf,
        dmu: rData.dmu || aisle,
        position: rData.position || null,
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

    const products = getProductsArray().filter(p => p.retailers && p.retailers[store.retailerId]);
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
    localStorage.setItem('ss_capture_sessions', JSON.stringify(list));
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
    localStorage.setItem(PLANOGRAMS_KEY, JSON.stringify(list));
  }

  async function uploadProductImage(ean, blob, type = 'product') {
    if (!_supabase) {
      console.warn('Supabase not initialized.');
      return null;
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
        console.error('Supabase storage upload error:', error);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      }

      const { data: publicUrlData } = _supabase.storage
        .from('product-images')
        .getPublicUrl(filepath);
        
      return publicUrlData.publicUrl;
    } catch (err) {
      console.error('Failed to upload image:', err);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
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
    exportBackup,
    importBackup,
    resetToDefaults,
    getUndo,
    applyUndo,
    getStores,
    getStore,
    saveStore,
    deleteStore,
    getStorePlanogram,
    getStoreCaptureSessions,
    savePlanogram,
    saveCaptureSession,
    uploadProductImage
  };
})();
