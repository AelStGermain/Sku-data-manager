import { describe, expect, jest, test } from "@jest/globals";
import { ProductService } from "../../src/services/ProductService.js";

function createStorage({ master = [], retailer = [] } = {}) {
  const state = {
    master: structuredClone(master),
    retailer: structuredClone(retailer),
  };
  return {
    state,
    readCatalog: jest.fn(async () => structuredClone(state.master)),
    saveCatalog: jest.fn(async (value) => {
      state.master = structuredClone(value);
    }),
    readRetailerCatalog: jest.fn(async () => structuredClone(state.retailer)),
    saveRetailerCatalog: jest.fn(async (value) => {
      state.retailer = structuredClone(value);
    }),
    runExclusive: jest.fn((operation) => operation()),
  };
}

describe("ProductService", () => {
  test("lista el maestro consolidado y conserva las relaciones", async () => {
    const storage = createStorage({
      master: [
        { ean: "780 1", name: "" },
        { ean: "7801", name: "Producto" },
      ],
      retailer: [{ ean: "7801", retailer_id: "jumbo" }],
    });

    const result = await new ProductService(storage).getProducts();

    expect(result.master_catalog).toEqual([{ ean: "7801", name: "Producto" }]);
    expect(result.retailer_catalog).toEqual([
      { ean: "7801", retailer_id: "jumbo" },
    ]);
  });

  test("upsert normaliza EAN y holding, actualiza el producto y crea UUID", async () => {
    const storage = createStorage({
      master: [{ ean: "7801", name: "Anterior", brand: "Marca" }],
    });
    const service = new ProductService(storage);

    await service.upsert({ ean: " 780 1 ", name: "Actualizado" }, [
      { ean: " 780 1 ", retailer_id: "JUMBO", customer_id: "C-1" },
    ]);

    expect(storage.state.master).toEqual([
      { ean: "7801", name: "Actualizado", brand: "Marca" },
    ]);
    expect(storage.state.retailer).toHaveLength(1);
    expect(storage.state.retailer[0]).toMatchObject({
      ean: "7801",
      retailer_id: "jumbo",
      customer_id: "C-1",
    });
    expect(storage.state.retailer[0].uuid).toEqual(expect.any(String));
  });

  test("bulk upsert no duplica productos ni relaciones existentes", async () => {
    const storage = createStorage({
      master: [{ ean: "1", name: "Uno" }],
      retailer: [
        {
          ean: "1",
          retailer_id: "jumbo",
          uuid: "estable",
          customer_id: "old",
        },
      ],
    });
    const service = new ProductService(storage);

    await service.bulkUpsert(
      [
        { ean: "1", name: "Uno nuevo" },
        { ean: " 2 ", name: "Dos" },
      ],
      [{ ean: "1", retailer_id: "JUMBO", customer_id: "new" }],
    );

    expect(storage.state.master).toEqual([
      { ean: "1", name: "Uno nuevo" },
      { ean: "2", name: "Dos" },
    ]);
    expect(storage.state.retailer).toEqual([
      {
        ean: "1",
        retailer_id: "jumbo",
        uuid: "estable",
        customer_id: "new",
      },
    ]);
  });

  test("elimina el producto y todas sus relaciones usando EAN normalizado", async () => {
    const storage = createStorage({
      master: [
        { ean: "780 1", name: "Eliminar" },
        { ean: "2", name: "Conservar" },
      ],
      retailer: [
        { ean: "7801", retailer_id: "jumbo" },
        { ean: "2", retailer_id: "jumbo" },
      ],
    });

    await new ProductService(storage).deleteByEans([" 780 1 "]);

    expect(storage.state.master).toEqual([{ ean: "2", name: "Conservar" }]);
    expect(storage.state.retailer).toEqual([
      { ean: "2", retailer_id: "jumbo" },
    ]);
  });
});
