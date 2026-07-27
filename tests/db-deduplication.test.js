import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

test("colapsa EAN duplicados con saltos de línea y conserva metadatos Firebase", async () => {
  const master = JSON.parse(
    fs.readFileSync(
      new URL("../local_data/master_catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const retailer = JSON.parse(
    fs.readFileSync(
      new URL("../local_data/retailer_catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const holdings = JSON.parse(
    fs.readFileSync(
      new URL("../local_data/holdings.json", import.meta.url),
      "utf8",
    ),
  );
  const storage = new Map();
  const response = (data) => ({ ok: true, json: async () => data });
  const context = {
    console,
    window: {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    fetch: async (url) => {
      if (url === "/api/products")
        return response({ master_catalog: master, retailer_catalog: retailer });
      if (url === "/api/holdings") return response(holdings);
      if (url === "/api/stores") return response([]);
      if (String(url).startsWith("/api/staging/")) return response([]);
      return { ok: false };
    },
    setTimeout,
    clearTimeout,
    Blob,
    FileReader: class {},
  };
  context.window = context;
  const source = `${fs.readFileSync(new URL("../js/db.js", import.meta.url), "utf8")}\nglobalThis.__db = DB;`;
  vm.runInNewContext(source, context);
  await context.__db.init();

  for (const ean of ["7804675731015", "7804675731039"]) {
    const matches = context.__db
      .getProductsArray()
      .filter((product) => String(product.ean).trim() === ean);
    assert.equal(matches.length, 1, ean);
    assert.equal(matches[0].levantamientoMeta?.auditor, "XIOMARA");
    assert.match(matches[0].levantamientoMeta?.timestamp || "", /^2026-07-01/);
  }

  const uppercaseAliases = context.__db
    .getProductsArray()
    .flatMap((product) =>
      Object.keys(product.holdings || {}).filter(
        (holdingId) => holdingId === "TOTTUS",
      ),
    );
  assert.equal(uppercaseAliases.length, 0);

  const duplicatedHoldingProduct = context.__db.getProduct("75076313");
  assert.ok(duplicatedHoldingProduct);
  assert.equal(
    Object.keys(duplicatedHoldingProduct.holdings).filter(
      (id) => id.toLowerCase() === "tottus",
    ).length,
    1,
  );

  const missingCustomerId = context.__db.getProductsArray().filter((product) =>
    Object.values(product.holdings || {}).some((holding) => {
      const hasData =
        holding &&
        (holding.name ||
          holding.localProductName ||
          holding.dmu ||
          holding.category);
      return hasData && !holding.customerId && !holding.holdingInternalId;
    }),
  );
  assert.ok(
    missingCustomerId.length < 6155,
    `el conteo siguió inflado: ${missingCustomerId.length}`,
  );
});
