const fs = require('fs');

function processDb() {
  let code = fs.readFileSync('js/db.js', 'utf8');
  code = code.replace(/localStorage\.setItem\((.*?),\s*(.*?)\);/g, '_safeSetItem($1, $2);');
  
  const safeFunc = `const PRODUCTS_CACHE_KEY = 'ss_products_cache';

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
  }`;
  
  code = code.replace("const PRODUCTS_CACHE_KEY = 'ss_products_cache';", safeFunc);
  fs.writeFileSync('js/db.js', code);
}

function processUI(file) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/localStorage\.setItem\((.*?),\s*(.*?)\);/g, 
    "try { localStorage.setItem($1, $2); } catch (e) { localStorage.removeItem('ss_products_cache'); try { localStorage.setItem($1, $2); } catch(e2) {} }");
  fs.writeFileSync(file, code);
}

processDb();
processUI('js/ui-levantamiento.js');
processUI('js/ui-staging.js');
console.log('Fixed localStorage calls successfully.');
