import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const targetEans = new Set(["7804675731015", "7804675731039"]);
const products = JSON.parse(
  fs.readFileSync(
    new URL("../local_data/master_catalog.json", import.meta.url),
    "utf8",
  ),
).filter((product) => targetEans.has(String(product.ean)));

function renderProduct(product) {
  const elements = {
    "sheet-content": { innerHTML: "" },
    "sheet-overlay": { classList: { add() {}, remove() {} } },
    "sheet-modal": { style: {} },
  };
  const holdings = [
    { id: "tottus", name: "Tottus", color: "#e00" },
    { id: "jumbo", name: "Jumbo", color: "#090" },
  ];
  const context = {
    console,
    window: {},
    PACKAGE_TYPES: [{ value: "other", label: "Otro" }],
    UNIVERSAL_CATEGORIES: ["GROCERY STORE", "FROZEN"],
    localStorage: { getItem: () => null },
    requestAnimationFrame: (callback) => callback(),
    confirm: () => true,
    document: { getElementById: (id) => elements[id] || null },
    App: { showToast() {} },
    DB: {
      getProduct: (ean) =>
        String(product.ean) === String(ean) ? product : null,
      getHoldings: () => holdings,
      getVisperaBatch: () => [],
      computeCompleteness: () => 0,
      validateEAN: () => ({
        valid: true,
        normalized: String(product.ean),
        legacy: false,
      }),
    },
  };
  const source = `${fs.readFileSync(new URL("../js/ui-sheet.js", import.meta.url), "utf8")}\nglobalThis.__sheet = UISheet;`;
  vm.runInNewContext(source, context);
  context.__sheet.open(String(product.ean));
  return elements["sheet-content"].innerHTML;
}

test("las fichas Firebase problemáticas se pueden renderizar", () => {
  assert.equal(products.length, 2);
  for (const product of products) {
    const html = renderProduct(product);
    assert.match(html, new RegExp(String(product.ean)));
    assert.match(html, /Nuevo SKU de Terreno/);
  }
});
