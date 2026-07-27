import { consolidateMaster, normalizeEanKey } from "../utils/ean.js";

const createRelationId = () =>
  `${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;

export class ProductService {
  constructor(storage) {
    this.storage = storage;
  }

  async getProducts() {
    const [master, retailer] = await Promise.all([
      this.storage.readCatalog(),
      this.storage.readRetailerCatalog(),
    ]);
    return {
      master_catalog: consolidateMaster(master),
      retailer_catalog: retailer,
    };
  }

  upsert(product, holdingRelations) {
    return this.#serializeMutation(async () => {
      const normalizedProduct = {
        ...product,
        ean: normalizeEanKey(product.ean),
      };
      const normalizedRelations = holdingRelations?.map((relation) => ({
        ...relation,
        ean: normalizeEanKey(relation.ean),
        retailer_id: String(relation.retailer_id || "").toLowerCase(),
      }));

      const master = consolidateMaster(await this.storage.readCatalog());
      const index = master.findIndex(
        (item) => normalizeEanKey(item.ean) === normalizedProduct.ean,
      );
      if (index >= 0)
        master[index] = { ...master[index], ...normalizedProduct };
      else master.push(normalizedProduct);
      await this.storage.saveCatalog(master);

      if (normalizedRelations?.length)
        await this.#upsertRelations(normalizedRelations);
    });
  }

  bulkUpsert(products, holdingRelations) {
    return this.#serializeMutation(async () => {
      const normalizedProducts = products.map((product) => ({
        ...product,
        ean: normalizeEanKey(product.ean),
      }));
      const normalizedRelations = holdingRelations?.map((relation) => ({
        ...relation,
        ean: normalizeEanKey(relation.ean),
        retailer_id: String(relation.retailer_id || "").toLowerCase(),
      }));
      const master = consolidateMaster(await this.storage.readCatalog());
      const indexByEan = new Map(
        master.map((product, index) => [normalizeEanKey(product.ean), index]),
      );

      for (const product of normalizedProducts) {
        const index = indexByEan.get(product.ean);
        if (index === undefined) {
          indexByEan.set(product.ean, master.length);
          master.push(product);
        } else {
          master[index] = { ...master[index], ...product };
        }
      }
      await this.storage.saveCatalog(master);
      if (normalizedRelations?.length)
        await this.#upsertRelations(normalizedRelations);
    });
  }

  deleteByEans(eans) {
    return this.#serializeMutation(async () => {
      const normalized = new Set(eans.map(normalizeEanKey));
      const [master, retailer] = await Promise.all([
        this.storage.readCatalog(),
        this.storage.readRetailerCatalog(),
      ]);
      await Promise.all([
        this.storage.saveCatalog(
          consolidateMaster(master).filter(
            (product) => !normalized.has(normalizeEanKey(product.ean)),
          ),
        ),
        this.storage.saveRetailerCatalog(
          retailer.filter(
            (relation) => !normalized.has(normalizeEanKey(relation.ean)),
          ),
        ),
      ]);
    });
  }

  async #upsertRelations(relations) {
    const retailer = await this.storage.readRetailerCatalog();
    const relationIndex = new Map(
      retailer.map((relation, index) => [
        `${normalizeEanKey(relation.ean)}\0${relation.retailer_id}`,
        index,
      ]),
    );
    for (const relation of relations) {
      const key = `${relation.ean}\0${relation.retailer_id}`;
      const index = relationIndex.get(key);
      if (index === undefined) {
        relation.uuid ||= createRelationId();
        relationIndex.set(key, retailer.length);
        retailer.push(relation);
      } else {
        retailer[index] = { ...retailer[index], ...relation };
      }
    }
    await this.storage.saveRetailerCatalog(retailer);
  }

  #serializeMutation(operation) {
    return this.storage.runExclusive(operation);
  }
}
