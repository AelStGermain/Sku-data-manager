import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync("src/app.js", "utf8");
const routesSource = readFileSync("src/routes/index.js", "utf8");

test("el servidor no publica la raíz completa del repositorio", () => {
  assert.doesNotMatch(appSource, /express\.static\(config\.projectRoot/);
  assert.match(appSource, /app\.use\(\s*["']\/css["']/);
  assert.match(appSource, /app\.use\(\s*["']\/js["']/);
});

test("staging tiene una sola pareja de rutas", () => {
  assert.equal(
    routesSource.match(/router\.get\(\s*["']\/staging\/:key["']/g)?.length,
    1,
  );
  assert.equal(
    routesSource.match(/router\.post\(\s*["']\/staging\/:key["']/g)?.length,
    1,
  );
});

test("la aplicación instala controles HTTP y un manejador global de errores", () => {
  assert.match(appSource, /helmet\(/);
  assert.match(appSource, /rateLimit\(/);
  assert.match(appSource, /express\.json\(\{ limit:/);
  assert.match(appSource, /errorHandler\(logger\)/);
});
