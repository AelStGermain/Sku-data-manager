import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { createApp } from "../src/app.js";
import { config } from "../src/config/index.js";
import { createContainer } from "../src/container.js";

test("API modular conserva datos y aplica contratos de producción", async (t) => {
  const dataDir = await mkdtemp(path.join(tmpdir(), "sku-data-api-"));
  const testConfig = {
    ...config,
    env: "test",
    isProduction: false,
    port: 0,
    storage: {
      ...config.storage,
      dataDir,
      cacheTtlMs: 100,
      historyLimit: 10,
    },
    firebase: {
      ...config.firebase,
      enabled: false,
      serviceAccountPath: path.join(dataDir, "firebase-key.json"),
    },
    http: {
      ...config.http,
      corsOrigins: ["*"],
      rateLimitMax: 1000,
    },
  };
  const logger = pino({ enabled: false });
  const container = await createContainer(testConfig, logger);
  const app = createApp({
    config: testConfig,
    logger,
    controllers: container.controllers,
    schemas: container.schemas,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await container.services.firebase.close();
    await container.services.storage.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.ok(health.headers.get("x-content-type-options"));

  const holdingsPayload = await fetch(`${baseUrl}/api/holdings`).then(
    (response) => response.json(),
  );
  assert.equal(holdingsPayload.success, true);
  assert.ok(Array.isArray(holdingsPayload.data));

  const invalid = await fetch(`${baseUrl}/api/staging/../secret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([]),
  });
  const invalidPayload = await invalid.json();
  assert.equal(invalidPayload.success, false);
  assert.equal("stack" in invalidPayload, false);

  const imported = await fetch(`${baseUrl}/api/products/bulk`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user": "integration-test",
    },
    body: JSON.stringify({ products: [{ ean: " 780 123 ", name: "Test" }] }),
  });
  assert.equal(imported.status, 200);

  const productsPayload = await fetch(`${baseUrl}/api/products`).then(
    (response) => response.json(),
  );
  assert.equal(productsPayload.success, true);
  assert.equal(productsPayload.data.master_catalog[0].ean, "780123");

  const persisted = JSON.parse(
    await readFile(path.join(dataDir, "master_catalog.json"), "utf8"),
  );
  assert.ok(Array.isArray(persisted));
  assert.equal(persisted[0].name, "Test");

  const historyPayload = await fetch(`${baseUrl}/api/import-history`).then(
    (response) => response.json(),
  );
  assert.equal(historyPayload.data.length, 1);
  assert.deepEqual(
    Object.keys(historyPayload.data[0]).sort(),
    ["fecha", "duracionMs", "cantidad", "resultado", "usuario"].sort(),
  );
});
