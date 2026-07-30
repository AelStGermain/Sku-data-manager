import { describe, expect, jest, test } from "@jest/globals";
import { ReferenceDataService } from "../../src/services/ReferenceDataService.js";

function createStorage() {
  const state = {
    holdings: [
      { id: "jumbo", name: "Jumbo" },
      { id: "tottus", name: "Tottus" },
    ],
    relations: [
      { ean: "1", retailer_id: "jumbo" },
      { ean: "2", retailer_id: "tottus" },
    ],
    stores: [
      { storeId: "1", holdingId: "jumbo" },
      { storeId: "2", retailerId: "tottus" },
    ],
  };
  return {
    state,
    readHoldings: jest.fn(async () => structuredClone(state.holdings)),
    saveHoldings: jest.fn(async (value) => {
      state.holdings = structuredClone(value);
    }),
    readRetailerCatalog: jest.fn(async () => structuredClone(state.relations)),
    saveRetailerCatalog: jest.fn(async (value) => {
      state.relations = structuredClone(value);
    }),
    readStores: jest.fn(async () => structuredClone(state.stores)),
    saveStores: jest.fn(async (value) => {
      state.stores = structuredClone(value);
    }),
    readCategoryHierarchy: jest.fn(async () => ({ GROCERY: {} })),
    saveCategoryHierarchy: jest.fn(async () => undefined),
    runExclusive: jest.fn((operation) => operation()),
  };
}

describe("ReferenceDataService", () => {
  test("filtra tiendas por holdingId o retailerId", async () => {
    const service = new ReferenceDataService(createStorage());

    await expect(service.getStores("jumbo")).resolves.toEqual([
      { storeId: "1", holdingId: "jumbo" },
    ]);
    await expect(service.getStores("tottus")).resolves.toEqual([
      { storeId: "2", retailerId: "tottus" },
    ]);
    await expect(service.getStores("all")).resolves.toHaveLength(2);
  });

  test("eliminar un holding también elimina sus relaciones", async () => {
    const storage = createStorage();
    const service = new ReferenceDataService(storage);

    await service.deleteHolding("jumbo");

    expect(storage.state.holdings).toEqual([{ id: "tottus", name: "Tottus" }]);
    expect(storage.state.relations).toEqual([
      { ean: "2", retailer_id: "tottus" },
    ]);
    expect(storage.runExclusive).toHaveBeenCalledTimes(1);
  });
});
