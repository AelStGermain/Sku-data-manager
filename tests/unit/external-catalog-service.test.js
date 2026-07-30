import { afterEach, describe, expect, jest, test } from "@jest/globals";
import { ExternalCatalogService } from "../../src/services/ExternalCatalogService.js";

const config = {
  openFoodUrl: "https://catalog.test/product",
  timeoutMs: 500,
};

describe("ExternalCatalogService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test("consulta Open Food Facts, normaliza campos y cachea una copia", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        status: 1,
        product: {
          product_name: "Producto API",
          brands: "Marca API",
          image_url: "https://img.test/product.jpg",
          categories: "snacks, chips",
        },
      }),
    }));
    const service = new ExternalCatalogService(config, { warn: jest.fn() });

    const first = await service.fetchEnrichment("123456789012");
    first.name = "Mutación local";
    const second = await service.fetchEnrichment("123456789012");

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://catalog.test/product/0123456789012",
      expect.objectContaining({
        headers: { "user-agent": "sku-data-manager/1.0" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(second).toEqual({
      name: "Producto API",
      brand: "Marca API",
      imageUrl: "https://img.test/product.jpg",
      masterCategory: "SNACKS",
    });
  });

  test("devuelve null ante respuestas sin producto o errores de red", async () => {
    const logger = { warn: jest.fn() };
    const service = new ExternalCatalogService(config, logger);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error("network down"));

    await expect(service.fetchEnrichment("1")).resolves.toBeNull();
    await expect(service.fetchEnrichment("2")).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  test("devuelve null cuando la API informa que el producto no existe", async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ status: 0 }),
    }));
    const service = new ExternalCatalogService(config, { warn: jest.fn() });

    await expect(service.fetchEnrichment("3")).resolves.toBeNull();
  });
});
