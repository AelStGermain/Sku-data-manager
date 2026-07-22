import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('server.js', 'utf8');

test('el servidor no publica la raíz completa del repositorio', () => {
  assert.doesNotMatch(source, /express\.static\(path\.join\(__dirname\)\)/);
  assert.match(source, /app\.use\('\/css'/);
  assert.match(source, /app\.use\('\/js'/);
});

test('staging tiene una sola pareja de rutas', () => {
  assert.equal(source.match(/app\.get\('\/api\/staging\/:key'/g)?.length, 1);
  assert.equal(source.match(/app\.post\('\/api\/staging\/:key'/g)?.length, 1);
});
