import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sheet = readFileSync("js/ui-sheet.js", "utf8");
const staging = readFileSync("js/ui-staging.js", "utf8");

test("el guardado de ficha no envía automáticamente a Vispera", () => {
  const saveBody = sheet.slice(
    sheet.indexOf("async function save()"),
    sheet.indexOf("function discard()"),
  );
  assert.doesNotMatch(saveBody, /addVisperaBatchItem/);
  assert.match(sheet, /function confirmToVispera\(\)/);
});

test("el flujo conserva tickets exportados hasta recibir ID", () => {
  assert.match(staging, /AWAITING_VISPERA_ID/);
  assert.match(staging, /p\.status = 'new'/);
  assert.match(staging, /removeVisperaBatchItem\(ticket\.batchId\)/);
});
