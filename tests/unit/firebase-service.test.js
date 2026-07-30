import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from "@jest/globals";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let documents = [];
const query = {
  collection: jest.fn(() => query),
  get: jest.fn(async () => ({ docs: documents })),
  limit: jest.fn(() => query),
  orderBy: jest.fn(() => query),
  select: jest.fn(() => query),
  where: jest.fn(() => query),
};
const fakeApp = { name: "sku-data-manager" };

jest.unstable_mockModule("firebase-admin/app", () => ({
  cert: jest.fn((credential) => credential),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(() => fakeApp),
}));
jest.unstable_mockModule("firebase-admin/firestore", () => ({
  getFirestore: jest.fn(() => query),
}));

const { FirebaseService, formatFirestoreError } =
  await import("../../src/services/FirebaseService.js");

function createStorage() {
  const state = {
    catalog: [],
    staging: [],
    checkpoint: 0,
  };
  return {
    state,
    runExclusive: jest.fn((operation) => operation()),
    readCatalog: jest.fn(async () => structuredClone(state.catalog)),
    saveCatalog: jest.fn(async (value) => {
      state.catalog = structuredClone(value);
    }),
    readHoldings: jest.fn(async () => [
      { id: "jumbo", name: "Jumbo" },
      { id: "tottus", name: "Tottus" },
    ]),
    readStaging: jest.fn(async () => structuredClone(state.staging)),
    saveStaging: jest.fn(async (_key, value) => {
      state.staging = structuredClone(value);
    }),
    readLastFirebaseSync: jest.fn(async () => state.checkpoint),
    saveLastFirebaseSync: jest.fn(async (value) => {
      state.checkpoint = value;
    }),
  };
}

function createLogger() {
  return {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  };
}

describe("FirebaseService", () => {
  let dataDir;
  let credentialPath;

  beforeEach(async () => {
    jest.clearAllMocks();
    documents = [];
    dataDir = await mkdtemp(path.join(tmpdir(), "sku-firebase-test-"));
    credentialPath = path.join(dataDir, "firebase-key.json");
    await writeFile(
      credentialPath,
      JSON.stringify({ project_id: "project-test" }),
      "utf8",
    );
  });

  afterEach(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  test.each([
    [{ code: 5, message: "NOT_FOUND" }, /FIREBASE_DATABASE_ID/],
    [{ code: "firestore/7", message: "denied" }, /no tiene permiso/],
    [{ code: 9, message: "FAILED_PRECONDITION" }, /configuración adicional/],
    [{ code: 14, message: "UNAVAILABLE" }, /temporalmente/],
    [{ code: 99, message: "otro" }, /Firestore \(99\): otro/],
  ])("clasifica errores de Firestore %#", (error, expected) => {
    expect(
      formatFirestoreError(error, {
        projectId: "project-test",
        databaseId: "(default)",
      }),
    ).toMatch(expected);
  });

  test("deshabilitado no intenta inicializar y responde como operación inocua", async () => {
    const service = new FirebaseService(
      {
        enabled: false,
        serviceAccountPath: credentialPath,
        databaseId: "(default)",
      },
      createStorage(),
      { fetchEnrichment: jest.fn() },
      createLogger(),
    );

    await expect(service.initialize()).resolves.toBe(false);
    await expect(service.sync()).resolves.toMatchObject({
      success: true,
      enabled: false,
      count: 0,
    });
    await expect(service.getLastSync()).resolves.toEqual({
      lastSync: null,
      enabled: false,
    });
  });

  test("sincroniza registros, resuelve aliases, enriquece y separa filas sin EAN", async () => {
    documents = [
      {
        id: "doc-valid",
        data: () => ({
          ean: "123",
          fecha: {
            toDate: () => new Date("2026-07-01T10:00:00.000Z"),
          },
          holding: "Jumbo",
          categoria: "SNACKS",
          auditor: "QA",
        }),
      },
      {
        id: "doc-no-ean",
        data: () => ({
          ean: "",
          fecha: "2026-07-02T11:00:00.000Z",
          holdingId: "tottus",
          productoWeb: "Sin EAN",
        }),
      },
    ];
    const storage = createStorage();
    const externalCatalog = {
      fetchEnrichment: jest.fn(async () => ({
        name: "Producto enriquecido",
        brand: "Marca API",
        imageUrl: "https://img.test/product.jpg",
        masterCategory: "SWEET",
      })),
    };
    const service = new FirebaseService(
      {
        enabled: true,
        serviceAccountPath: credentialPath,
        projectId: "project-test",
        databaseId: "(default)",
        collection: "levantamientos",
        pageSize: 100,
        syncIntervalMs: 60_000,
      },
      storage,
      externalCatalog,
      createLogger(),
    );

    await expect(service.initialize()).resolves.toBe(true);
    const result = await service.sync({ force: true });

    expect(result).toMatchObject({
      success: true,
      count: 2,
      added: 1,
      updated: 0,
    });
    expect(storage.state.catalog[0]).toMatchObject({
      ean: "123",
      name: "Producto enriquecido",
      brand: "Marca API",
      universalCategory: "SWEET",
      fromFirebase: true,
      holdings: {
        jumbo: expect.objectContaining({ isActiveHolding: true }),
      },
    });
    expect(storage.state.staging).toEqual([
      expect.objectContaining({
        id: "doc-no-ean",
        holdingId: "tottus",
        source: "Firebase",
      }),
    ]);
    expect(storage.state.checkpoint).toBe(
      Date.parse("2026-07-02T11:00:00.000Z"),
    );
    expect(externalCatalog.fetchEnrichment).toHaveBeenCalledWith("123");
  });

  test("expone un diagnóstico cuando la consulta de Firestore falla", async () => {
    const service = new FirebaseService(
      {
        enabled: true,
        serviceAccountPath: credentialPath,
        projectId: "project-test",
        databaseId: "inventory",
        collection: "levantamientos",
        pageSize: 100,
      },
      createStorage(),
      { fetchEnrichment: jest.fn() },
      createLogger(),
    );
    await service.initialize();
    query.get.mockRejectedValueOnce({
      code: 5,
      message: "5 NOT_FOUND: missing",
    });

    await expect(service.sync({ force: true })).resolves.toMatchObject({
      success: false,
      error: expect.stringMatching(/inventory.*project-test/),
    });
  });

  test("rechaza una credencial de otro proyecto y conserva la causa", async () => {
    const service = new FirebaseService(
      {
        enabled: true,
        serviceAccountPath: credentialPath,
        projectId: "otro-proyecto",
        databaseId: "(default)",
      },
      createStorage(),
      { fetchEnrichment: jest.fn() },
      createLogger(),
    );

    await expect(service.initialize()).resolves.toBe(false);
    await expect(service.sync()).resolves.toMatchObject({
      success: false,
      enabled: false,
      error: expect.stringContaining("otro-proyecto"),
    });
  });
});
