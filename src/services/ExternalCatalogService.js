export class ExternalCatalogService {
  #cache = new Map();

  constructor(apiConfig, logger) {
    this.config = apiConfig;
    this.logger = logger;
  }

  async fetchEnrichment(ean) {
    const cached = this.#cache.get(ean);
    if (cached && cached.expiresAt > Date.now())
      return structuredClone(cached.value);

    const paddedEan = ean.length === 12 ? `0${ean}` : ean;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(
        `${this.config.openFoodUrl}/${encodeURIComponent(paddedEan)}`,
        {
          signal: controller.signal,
          headers: { "user-agent": "sku-data-manager/1.0" },
        },
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (data.status !== 1 || !data.product) return null;

      const product = data.product;
      const value = {
        name: product.product_name || product.product_name_es || null,
        brand: product.brands || null,
        imageUrl: product.image_url || null,
        masterCategory: product.categories
          ? product.categories.split(",")[0].trim().toUpperCase()
          : null,
      };
      this.#cache.set(ean, { value, expiresAt: Date.now() + 3600000 });
      return structuredClone(value);
    } catch (error) {
      this.logger.warn({ err: error, ean }, "Falló el enriquecimiento externo");
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  close() {
    this.#cache.clear();
  }
}
