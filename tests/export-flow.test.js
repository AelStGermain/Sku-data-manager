import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync("js/app.js", "utf8");
const bulkSource = readFileSync("js/ui-bulk.js", "utf8");

test("Exportar Datos entrega el catálogo actual al módulo de Excel", () => {
  const exportHelpers = appSource.slice(
    appSource.indexOf("exportCSV()"),
    appSource.indexOf("// Data refresh callback"),
  );
  assert.match(
    exportHelpers,
    /UIBulk\.exportExcel\(DB\.getProductsArray\(\)\)/,
  );
});

test("la exportación conserva un snapshot independiente de la vista masiva", () => {
  assert.match(
    bulkSource,
    /const hasExplicitProducts = Array\.isArray\(products\)/,
  );
  assert.match(
    bulkSource,
    /const isSelectionMode = !hasExplicitProducts && _selectedEans\.size > 0/,
  );
  assert.match(bulkSource, /_exportProducts = baseProducts/);
  assert.match(bulkSource, /let targetProducts = _exportProducts \|\| \[\]/);
});
