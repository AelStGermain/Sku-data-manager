import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const retailers = readFileSync("js/ui-retailers.js", "utf8");
const db = readFileSync("js/db.js", "utf8");

test("homologación no inventa Customer ID ni copia nombre o categoría local", () => {
  assert.doesNotMatch(retailers, /HOM-\$\{p\.ean\}/);
  assert.match(retailers, /holdingInternalId:\s*'',\s*customerId:\s*''/);
  assert.match(retailers, /localProductName:\s*'',\s*name:\s*''/);
  assert.match(retailers, /localCategoryName:\s*null,\s*category:\s*null/);
});

test("relación homologada queda pendiente e inactiva con procedencia", () => {
  assert.match(retailers, /isActiveHolding:\s*false,\s*stockStatus:\s*false/);
  assert.match(retailers, /relationStatus:\s*'pending'/);
  assert.match(retailers, /sourceType:\s*'homologation'/);
  assert.match(db, /relation_status:\s*hData\.relationStatus/);
  assert.match(db, /source_holding_id:\s*hData\.sourceHoldingId/);
});

test("homologación respeta campos universales protegidos", () => {
  assert.match(retailers, /!p\.fieldLocks\?\.\[field\]/);
  assert.match(retailers, /!p\.fieldLocks\?\.imageUrl/);
});
