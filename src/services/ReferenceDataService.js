export class ReferenceDataService {
  constructor(storage) {
    this.storage = storage;
  }

  getHoldings() {
    return this.storage.readHoldings();
  }

  saveHoldings(holdings) {
    return this.storage.saveHoldings(holdings);
  }

  async deleteHolding(id) {
    await this.storage.runExclusive(async () => {
      const [holdings, retailer] = await Promise.all([
        this.storage.readHoldings(),
        this.storage.readRetailerCatalog(),
      ]);
      await Promise.all([
        this.storage.saveHoldings(
          holdings.filter((holding) => holding.id !== id),
        ),
        this.storage.saveRetailerCatalog(
          retailer.filter((relation) => relation.retailer_id !== id),
        ),
      ]);
    });
  }

  getCategoryHierarchy() {
    return this.storage.readCategoryHierarchy();
  }

  saveCategoryHierarchy(hierarchy) {
    return this.storage.saveCategoryHierarchy(hierarchy);
  }

  async getStores(holdingId) {
    const stores = await this.storage.readStores();
    if (holdingId && holdingId !== "all") {
      return stores.filter(
        (store) =>
          store.holdingId === holdingId || store.retailerId === holdingId,
      );
    }
    return stores;
  }

  saveStores(stores) {
    return this.storage.saveStores(stores);
  }
}
