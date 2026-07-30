import { afterEach, beforeEach, describe, expect, test } from "@jest/globals";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { StorageService } from "../../src/storage/StorageService.js";
import { createSilentLogger } from "../helpers/silent-logger.js";

const files = {
  master: "master.json",
  retailer: "retailer.json",
  holdings: "holdings.json",
  stores: "stores.json",
  categoryHierarchy: "hierarchy.json",
  lastFirebaseSync: "last-sync.json",
  importHistory: "history.json",
};

describe("StorageService", () => {
  let dataDir;
  let storage;

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "sku-storage-test-"));
    storage = new StorageService(
      { dataDir, cacheTtlMs: 60_000, historyLimit: 2, files },
      createSilentLogger(),
    );
    await storage.initialize({
      holdings: [{ id: "test" }],
      stores: [{ storeId: "store-1" }],
      categoryHierarchy: { GROCERY: {} },
    });
  });

  afterEach(async () => {
    await storage.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  test("inicializa todos los archivos requeridos con valores seguros", async () => {
    await expect(storage.readCatalog()).resolves.toEqual([]);
    await expect(storage.readRetailerCatalog()).resolves.toEqual([]);
    await expect(storage.readHoldings()).resolves.toEqual([{ id: "test" }]);
    await expect(storage.readStores()).resolves.toEqual([
      { storeId: "store-1" },
    ]);
    await expect(storage.readCategoryHierarchy()).resolves.toEqual({
      GROCERY: {},
    });
  });

  test("escribe JSON de forma atómica y entrega clones desde caché", async () => {
    const input = [{ ean: "7801", nested: { name: "Original" } }];
    await storage.saveCatalog(input);
    input[0].nested.name = "Mutado afuera";

    const firstRead = await storage.readCatalog();
    firstRead[0].nested.name = "Mutado por consumidor";
    expect(await storage.readCatalog()).toEqual([
      { ean: "7801", nested: { name: "Original" } },
    ]);

    const persisted = JSON.parse(
      await readFile(path.join(dataDir, files.master), "utf8"),
    );
    expect(persisted).toEqual([{ ean: "7801", nested: { name: "Original" } }]);
  });

  test("staging usa fallback y bloquea llaves que pueden escapar del directorio", async () => {
    await expect(storage.readStaging("cola_segura-1")).resolves.toEqual([]);
    await storage.saveStaging("cola_segura-1", [{ id: 1 }]);
    await expect(storage.readStaging("cola_segura-1")).resolves.toEqual([
      { id: 1 },
    ]);
    expect(() => storage.readStaging("../secret")).toThrow("Llave inválida");
    expect(() => storage.saveStaging("a/b", [])).toThrow("Llave inválida");
  });

  test("limita el historial y serializa operaciones exclusivas", async () => {
    await Promise.all([
      storage.appendImportHistory({ id: 1 }),
      storage.appendImportHistory({ id: 2 }),
      storage.appendImportHistory({ id: 3 }),
    ]);

    await expect(storage.readImportHistory()).resolves.toEqual([
      { id: 2 },
      { id: 3 },
    ]);

    const execution = [];
    await Promise.all([
      storage.runExclusive(async () => {
        execution.push("start-1");
        await Promise.resolve();
        execution.push("end-1");
      }),
      storage.runExclusive(async () => {
        execution.push("start-2");
        execution.push("end-2");
      }),
    ]);
    expect(execution).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  test("reporta JSON persistido inválido sin filtrar el error interno", async () => {
    const uncachedStorage = new StorageService(
      { dataDir, cacheTtlMs: 0, historyLimit: 2, files },
      createSilentLogger(),
    );
    await writeFile(path.join(dataDir, files.master), "{mal-json", "utf8");

    await expect(uncachedStorage.readCatalog()).rejects.toMatchObject({
      message: expect.stringContaining("JSON inválido"),
      statusCode: 500,
    });
    await uncachedStorage.close();
  });
});
