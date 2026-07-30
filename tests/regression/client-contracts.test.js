import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";

const source = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

describe("contratos críticos del cliente", () => {
  test("exportar usa el catálogo actual y conserva un snapshot independiente", () => {
    const app = source("js/app.js");
    const bulk = source("js/ui-bulk.js");
    const exportHelpers = app.slice(
      app.indexOf("exportCSV()"),
      app.indexOf("// Data refresh callback"),
    );

    expect(exportHelpers).toMatch(
      /UIBulk\.exportExcel\(DB\.getProductsArray\(\)\)/,
    );
    expect(bulk).toMatch(
      /const hasExplicitProducts = Array\.isArray\(products\)/,
    );
    expect(bulk).toMatch(
      /const isSelectionMode = !hasExplicitProducts && _selectedEans\.size > 0/,
    );
    expect(bulk).toMatch(/_exportProducts = baseProducts/);
    expect(bulk).toMatch(/let targetProducts = _exportProducts \|\| \[\]/);
  });

  test("homologación no inventa datos y mantiene procedencia pendiente", () => {
    const retailers = source("js/ui-retailers.js");
    const db = source("js/db.js");

    expect(retailers).not.toMatch(/HOM-\$\{p\.ean\}/);
    expect(retailers).toMatch(/holdingInternalId:\s*'',\s*customerId:\s*''/);
    expect(retailers).toMatch(/localProductName:\s*'',\s*name:\s*''/);
    expect(retailers).toMatch(/localCategoryName:\s*null,\s*category:\s*null/);
    expect(retailers).toMatch(
      /isActiveHolding:\s*false,\s*stockStatus:\s*false/,
    );
    expect(retailers).toMatch(/relationStatus:\s*'pending'/);
    expect(retailers).toMatch(/sourceType:\s*'homologation'/);
    expect(retailers).toMatch(/!p\.fieldLocks\?\.\[field\]/);
    expect(db).toMatch(/relation_status:\s*hData\.relationStatus/);
    expect(db).toMatch(/source_holding_id:\s*hData\.sourceHoldingId/);
  });

  test("guardar una ficha no la envía a Vispera y el ticket espera ID", () => {
    const sheet = source("js/ui-sheet.js");
    const staging = source("js/ui-staging.js");
    const saveBody = sheet.slice(
      sheet.indexOf("async function save()"),
      sheet.indexOf("function discard()"),
    );

    expect(saveBody).not.toMatch(/addVisperaBatchItem/);
    expect(sheet).toMatch(/function confirmToVispera\(\)/);
    expect(staging).toMatch(/AWAITING_VISPERA_ID/);
    expect(staging).toMatch(/p\.status = 'new'/);
    expect(staging).toMatch(/removeVisperaBatchItem\(ticket\.batchId\)/);
  });

  test("el servidor no expone el repositorio y staging no duplica rutas", () => {
    const app = source("src/app.js");
    const routes = source("src/routes/index.js");

    expect(app).not.toMatch(/express\.static\(config\.projectRoot/);
    expect(app).toMatch(/app\.use\(\s*["']\/css["']/);
    expect(app).toMatch(/app\.use\(\s*["']\/js["']/);
    expect(
      routes.match(/router\.get\(\s*["']\/staging\/:key["']/g),
    ).toHaveLength(1);
    expect(
      routes.match(/router\.post\(\s*["']\/staging\/:key["']/g),
    ).toHaveLength(1);
  });
});
