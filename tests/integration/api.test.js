import { afterEach, describe, expect, test } from "@jest/globals";
import request from "supertest";
import { createTestApp } from "../helpers/test-app.js";

const contexts = [];

async function setup(overrides) {
  const context = await createTestApp(overrides);
  contexts.push(context);
  return context;
}

afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

describe("API HTTP con Supertest", () => {
  test("publica health, OpenAPI, SPA y sólo los assets previstos", async () => {
    const { app } = await setup();

    const health = await request(app)
      .get("/health")
      .set("x-request-id", "integration-request");
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      success: true,
      data: {
        status: "ok",
        uptimeSeconds: expect.any(Number),
        timestamp: expect.any(String),
      },
    });
    expect(health.headers["x-request-id"]).toBe("integration-request");
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-powered-by"]).toBeUndefined();

    const openApi = await request(app).get("/api/openapi.json").expect(200);
    expect(openApi.body.openapi).toBe("3.1.0");
    expect(openApi.body.paths).toHaveProperty("/api/products");

    const runtimeConfig = await request(app)
      .get("/runtime-config.js")
      .expect("Content-Type", /javascript/)
      .expect(200);
    expect(runtimeConfig.text).toMatch(
      /^globalThis\.SMART_SHELF_CONFIG=\{.*\};$/,
    );

    await request(app)
      .get("/")
      .expect("Content-Type", /html/)
      .expect(200)
      .expect(/Smart Shelf/);
    await request(app)
      .get("/js/app.js")
      .expect(200)
      .expect(/const App/);
    await request(app).get("/css/styles.css").expect(200);

    const privateFile = await request(app).get("/package.json").expect(404);
    expect(privateFile.body).toEqual({
      success: false,
      error: "Ruta no encontrada: GET /package.json",
      code: "NOT_FOUND",
    });
  });

  test("crea, actualiza, importa y elimina productos con sus relaciones", async () => {
    const { app } = await setup();

    await request(app)
      .post("/api/products")
      .send({
        product: { ean: " 780 123 ", name: "Producto inicial" },
        holdingRelations: [
          {
            ean: " 780 123 ",
            retailer_id: "JUMBO",
            customer_id: "J-1",
          },
        ],
      })
      .expect(200, { success: true });

    let response = await request(app).get("/api/products").expect(200);
    expect(response.body.data.master_catalog).toEqual([
      { ean: "780123", name: "Producto inicial" },
    ]);
    expect(response.body.data.retailer_catalog).toEqual([
      expect.objectContaining({
        ean: "780123",
        retailer_id: "jumbo",
        customer_id: "J-1",
        uuid: expect.any(String),
      }),
    ]);

    await request(app)
      .post("/api/products/bulk")
      .set("x-user", "integration-user")
      .send({
        products: [
          { ean: "780123", name: "Producto actualizado" },
          { ean: 456, name: "Producto nuevo" },
        ],
      })
      .expect(200, { success: true });

    response = await request(app).get("/api/products").expect(200);
    expect(response.body.data.master_catalog).toEqual([
      { ean: "780123", name: "Producto actualizado" },
      { ean: "456", name: "Producto nuevo" },
    ]);

    const history = await request(app).get("/api/import-history").expect(200);
    expect(history.body.data).toEqual([
      {
        fecha: expect.any(String),
        cantidad: 2,
        usuario: "integration-user",
        duracionMs: expect.any(Number),
        resultado: "success",
      },
    ]);

    await request(app)
      .delete("/api/products")
      .send({ eans: [" 780 123 "] })
      .expect(200, { success: true });
    response = await request(app).get("/api/products").expect(200);
    expect(response.body.data.master_catalog).toEqual([
      { ean: "456", name: "Producto nuevo" },
    ]);
    expect(response.body.data.retailer_catalog).toEqual([]);
  });

  test("persiste holdings, tiendas y jerarquía, y mantiene integridad al borrar", async () => {
    const { app } = await setup();
    const holdings = [
      { id: "jumbo", name: "Jumbo", color: "#009A44" },
      { id: "tottus", name: "Tottus", color: "#E8001C" },
    ];
    const stores = [
      { storeId: "j-1", holdingId: "jumbo", branchName: "Bilbao" },
      { storeId: "t-1", retailerId: "tottus", branchName: "Kennedy" },
    ];
    const hierarchy = {
      GROCERY: { description: "Abarrotes", holdings: { jumbo: ["Despensa"] } },
    };

    await request(app)
      .post("/api/holdings")
      .send(holdings)
      .expect(200, { success: true, count: 2 });
    expect((await request(app).get("/api/holdings")).body.data).toEqual(
      holdings,
    );

    await request(app)
      .post("/api/stores")
      .send(stores)
      .expect(200, { success: true, count: 2 });
    expect(
      (await request(app).get("/api/stores?holdingId=jumbo")).body.data,
    ).toEqual([stores[0]]);
    expect((await request(app).get("/api/stores")).body.data).toEqual(stores);

    await request(app)
      .post("/api/category-hierarchy")
      .send(hierarchy)
      .expect(200, { success: true });
    expect(
      (await request(app).get("/api/category-hierarchy")).body.data,
    ).toEqual(hierarchy);

    await request(app)
      .post("/api/products")
      .send({
        product: { ean: "1", name: "Relacionado" },
        holdingRelations: [{ ean: "1", retailer_id: "jumbo" }],
      })
      .expect(200);
    await request(app).delete("/api/holdings/jumbo").expect(200, {
      success: true,
    });

    expect((await request(app).get("/api/holdings")).body.data).toEqual([
      holdings[1],
    ]);
    expect(
      (await request(app).get("/api/products")).body.data.retailer_catalog,
    ).toEqual([]);
  });

  test("opera colas de staging y Firebase deshabilitado sin servicios externos", async () => {
    const { app } = await setup();
    const staging = [{ id: "ticket-1", status: "new" }];

    await request(app)
      .get("/api/staging/ss_queue")
      .expect(200, { success: true, data: [] });
    await request(app)
      .post("/api/staging/ss_queue")
      .send(staging)
      .expect(200, { success: true });
    await request(app)
      .get("/api/staging/ss_queue")
      .expect(200, { success: true, data: staging });

    const sync = await request(app)
      .post("/api/sync-firebase")
      .send({})
      .expect(200);
    expect(sync.body).toMatchObject({
      success: true,
      data: { success: true, enabled: false, count: 0 },
    });
    await request(app)
      .get("/api/last-sync")
      .expect(200, {
        success: true,
        data: { lastSync: null, enabled: false },
      });
  });

  test("rechaza entradas inválidas y nunca expone stack traces", async () => {
    const { app } = await setup({ limits: { maxImportRecords: 2 } });

    const invalidProduct = await request(app)
      .post("/api/products")
      .send({ product: { name: "Sin EAN" } })
      .expect(400);
    expect(invalidProduct.body).toMatchObject({
      success: false,
      error: "Datos de entrada inválidos",
      code: "VALIDATION_ERROR",
      details: expect.any(Array),
    });
    expect(invalidProduct.body).not.toHaveProperty("stack");

    await request(app)
      .post("/api/products/bulk")
      .send({
        products: [{ ean: "1" }, { ean: "2" }, { ean: "3" }],
      })
      .expect(400);
    await request(app).delete("/api/products").send({ eans: [] }).expect(400);
    await request(app)
      .post("/api/products")
      .send({ product: { ean: "ABC-123", name: "No numérico" } })
      .expect(400);
    await request(app).get("/api/staging/bad%2Fkey").expect(400);
    await request(app)
      .post("/api/sync-firebase")
      .send({ since: "no-es-fecha" })
      .expect(400);

    const malformed = await request(app)
      .post("/api/products")
      .set("content-type", "application/json")
      .send('{"product":')
      .expect(400);
    expect(malformed.body).toEqual({
      success: false,
      error: "JSON inválido",
    });

    const dangerous = await request(app)
      .post("/api/products")
      .set("content-type", "application/json")
      .send(
        '{"product":{"ean":"1","constructor":{"prototype":{"polluted":true}}}}',
      )
      .expect(400);
    expect(dangerous.body.error).toMatch(/Propiedad no permitida/);

    const missing = await request(app).get("/api/no-existe").expect(404);
    expect(missing.body).not.toHaveProperty("stack");
  });

  test("aplica CORS configurable y rate limit sólo bajo /api", async () => {
    const { app } = await setup({
      http: {
        corsOrigins: ["https://allowed.test"],
        rateLimitMax: 1,
        rateLimitWindowMs: 60_000,
      },
    });

    await request(app).get("/health").expect(200);
    await request(app).get("/health").expect(200);

    const allowed = await request(app)
      .get("/api/holdings")
      .set("origin", "https://allowed.test")
      .expect(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://allowed.test",
    );

    const limited = await request(app).get("/api/holdings").expect(429);
    expect(limited.body).toEqual({
      success: false,
      error: "Demasiadas solicitudes. Intente nuevamente más tarde.",
    });
  });
});
