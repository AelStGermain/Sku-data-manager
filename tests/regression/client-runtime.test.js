import { describe, expect, test } from "@jest/globals";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function loadApi(fetchImpl = async () => ({ ok: false })) {
  const source = `${readFileSync(new URL("../../js/api.js", import.meta.url), "utf8")}\nglobalThis.__api = API;`;
  const context = {
    AbortController,
    clearTimeout,
    console,
    DB: { getProduct: () => null, saveProduct: () => {} },
    fetch: fetchImpl,
    setTimeout,
  };
  vm.runInNewContext(source, context);
  return context.__api;
}

function loadDb(fetchImpl = async () => ({ ok: false })) {
  const storage = new Map();
  const context = {
    Blob,
    clearTimeout,
    console,
    fetch: fetchImpl,
    FileReader: class {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      removeItem: (key) => storage.delete(key),
      setItem: (key, value) => storage.set(key, value),
    },
    setTimeout,
    window: {},
  };
  context.window = context;
  const source = `${readFileSync(new URL("../../js/db.js", import.meta.url), "utf8")}\nglobalThis.__db = DB;`;
  vm.runInNewContext(source, context);
  return context.__db;
}

describe("runtime clásico del navegador", () => {
  test("SoloTodo acepta solamente la coincidencia exacta de EAN", async () => {
    const api = loadApi(async () => ({
      ok: true,
      json: async () => ({
        results: [
          { id: 1, name: "Incorrecto", specs: { ean: "1111111111111" } },
          {
            id: 2,
            name: "Correcto",
            picture_url: "https://img.test/2.jpg",
            last_updated: "2026-01-01T00:00:00Z",
            specs: {
              ean: "7804330010134",
              brand_name: "Marca",
              net_content: 1500,
              net_content_unit_suffix: "mL.",
              unit_count: 2,
            },
          },
        ],
      }),
    }));

    const result = await api.fetchFromCustomAPI("7804330010134");
    expect(result).toMatchObject({
      name: "Correcto",
      sourceProductId: 2,
      weight_g: 1500,
      weight_unit: "ml",
      numberOfUnits: 2,
    });
  });

  test("merge conserva campos bloqueados y agrega sugerencias e imágenes", () => {
    const api = loadApi();
    const merged = api.mergeEnriched(
      {
        ean: "7804330010134",
        name: "Nombre revisado",
        imageUrl: "https://img.test/manual.jpg",
        images: ["https://img.test/manual.jpg"],
        fieldLocks: { name: true, imageUrl: true },
      },
      {
        dataSource: "solotodo",
        name: "Nombre API",
        brand: "Marca API",
        imageUrl: "https://img.test/api.jpg",
        images: ["https://img.test/api.jpg"],
        sources: {
          solotodo: {
            name: "Nombre API",
            imageUrl: "https://img.test/api.jpg",
          },
        },
      },
    );

    expect(merged.name).toBe("Nombre revisado");
    expect(merged.brand).toBe("Marca API");
    expect(merged.imageUrl).toBe("https://img.test/manual.jpg");
    expect(Array.from(merged.images)).toEqual([
      "https://img.test/manual.jpg",
      "https://img.test/api.jpg",
    ]);
    expect(merged.enrichmentSources.solotodo.name).toBe("Nombre API");
  });

  test("acepta cualquier EAN numérico sin exigir largo ni checksum", () => {
    const db = loadDb();

    for (const code of [
      "1",
      "123456",
      "78895710922",
      "96385074",
      "036000291452",
      "4006381333931",
      "4006381333932",
      "10012345678902",
    ]) {
      expect(db.validateEAN(code).valid).toBe(true);
    }
    expect(db.validateEAN(" 12 34 ")).toMatchObject({
      valid: true,
      legacy: false,
      normalized: "1234",
    });
    for (const code of ["", "ABC12345", "12-34"]) {
      expect(db.validateEAN(code)).toMatchObject({ valid: false });
    }
  });

  test("DB colapsa EAN duplicados y conserva metadatos de terreno", async () => {
    const response = (data) => ({
      ok: true,
      json: async () => ({ success: true, data }),
    });
    const db = loadDb(async (url) => {
      if (url === "/api/products") {
        return response({
          master_catalog: [
            { ean: "780 123 45", name: "Placeholder" },
            {
              ean: "78012345",
              name: "Producto terreno",
              fromFirebase: true,
              levantamientoMeta: { auditor: "QA" },
            },
          ],
          retailer_catalog: [],
        });
      }
      if (url === "/api/holdings")
        return response([{ id: "tottus", name: "Tottus" }]);
      if (url === "/api/stores") return response([]);
      if (url === "/api/category-hierarchy") return response({});
      if (String(url).startsWith("/api/staging/")) return response([]);
      return { ok: false };
    });

    await db.init();
    const products = db.getProductsArray();

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      ean: "78012345",
      name: "Producto terreno",
      status: "review",
      levantamientoMeta: { auditor: "QA" },
    });
  });

  test("la ficha técnica renderiza productos provenientes de Firebase", () => {
    const product = {
      ean: "7804675731015",
      name: "Nuevo SKU de Terreno",
      fromFirebase: true,
      levantamientoMeta: { auditor: "QA" },
      holdings: {},
    };
    const elements = {
      "sheet-content": { innerHTML: "" },
      "sheet-modal": { style: {} },
      "sheet-overlay": { classList: { add() {}, remove() {} } },
    };
    const context = {
      App: { showToast() {} },
      console,
      DB: {
        computeCompleteness: () => 0,
        getHoldings: () => [{ id: "tottus", name: "Tottus", color: "#e00" }],
        getProduct: (ean) => (ean === product.ean ? product : null),
        getVisperaBatch: () => [],
        validateEAN: () => ({
          valid: true,
          normalized: product.ean,
          legacy: false,
        }),
      },
      document: { getElementById: (id) => elements[id] ?? null },
      localStorage: { getItem: () => null },
      PACKAGE_TYPES: [{ value: "other", label: "Otro" }],
      requestAnimationFrame: (callback) => callback(),
      UNIVERSAL_CATEGORIES: ["GROCERY STORE", "FROZEN"],
      window: {},
    };
    const source = `${readFileSync(new URL("../../js/ui-sheet.js", import.meta.url), "utf8")}\nglobalThis.__sheet = UISheet;`;
    vm.runInNewContext(source, context);

    context.__sheet.open(product.ean);

    expect(elements["sheet-content"].innerHTML).toMatch(/7804675731015/);
    expect(elements["sheet-content"].innerHTML).toMatch(/Nuevo SKU de Terreno/);
  });
});
