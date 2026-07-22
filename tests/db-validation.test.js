import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
const context = vm.createContext({
  window: {},
  console,
  fetch: async () => ({ ok: false }),
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  },
  Blob,
  FileReader: class {}
});

vm.runInContext(readFileSync('js/db.js', 'utf8'), context);
const validateEAN = vm.runInContext('DB.validateEAN', context);

test('acepta GTIN con checksum correcto', () => {
  for (const code of ['96385074', '036000291452', '4006381333931', '10012345678902']) {
    assert.equal(validateEAN(code).valid, true, code);
  }
});

test('recupera UPC-A heredado que perdió el cero inicial en Excel', () => {
  const result = validateEAN('78895710922');
  assert.equal(result.valid, true);
  assert.equal(result.legacy, true);
  assert.equal(result.normalized, '078895710922');
});

test('rechaza formatos y checksums incorrectos', () => {
  for (const code of ['', 'ABC12345', '123456', '4006381333932']) {
    assert.equal(validateEAN(code).valid, false, code);
  }
});
