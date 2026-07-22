import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadApi(fetchImpl = async () => ({ ok: false })) {
  const source = `${fs.readFileSync(new URL('../js/api.js', import.meta.url), 'utf8')}\nglobalThis.__api = API;`;
  const context = {
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    DB: { getProduct: () => null, saveProduct: () => {} }
  };
  vm.runInNewContext(source, context);
  return context.__api;
}

test('SoloTodo acepta solamente la coincidencia exacta de EAN', async () => {
  const api = loadApi(async () => ({
    ok: true,
    json: async () => ({ results: [
      { id: 1, name: 'Incorrecto', specs: { ean: '1111111111111' } },
      { id: 2, name: 'Correcto', picture_url: 'https://img.test/2.jpg', last_updated: '2026-01-01T00:00:00Z', specs: { ean: '7804330010134', brand_name: 'Marca', net_content: 1500, net_content_unit_suffix: 'mL.', unit_count: 2 } }
    ] })
  }));

  const result = await api.fetchFromCustomAPI('7804330010134');
  assert.equal(result.name, 'Correcto');
  assert.equal(result.sourceProductId, 2);
  assert.equal(result.weight_g, 1500);
  assert.equal(result.weight_unit, 'ml');
  assert.equal(result.numberOfUnits, 2);
});

test('merge conserva campos protegidos y guarda sugerencias e imágenes', () => {
  const api = loadApi();
  const product = {
    ean: '7804330010134',
    name: 'Nombre revisado',
    imageUrl: 'https://img.test/manual.jpg',
    images: ['https://img.test/manual.jpg'],
    fieldLocks: { name: true, imageUrl: true }
  };
  const sources = {
    solotodo: { dataSource: 'solotodo', name: 'Nombre API', brand: 'Marca API', imageUrl: 'https://img.test/api.jpg', images: ['https://img.test/api.jpg'] }
  };

  const merged = api.mergeEnriched(product, { ...sources.solotodo, sources, images: sources.solotodo.images });
  assert.equal(merged.name, 'Nombre revisado');
  assert.equal(merged.brand, 'Marca API');
  assert.equal(merged.imageUrl, 'https://img.test/manual.jpg');
  assert.deepEqual(Array.from(merged.images), ['https://img.test/manual.jpg', 'https://img.test/api.jpg']);
  assert.equal(merged.enrichmentSources.solotodo.name, 'Nombre API');
});
