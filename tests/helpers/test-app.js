import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.js";
import { config } from "../../src/config/index.js";
import { createContainer } from "../../src/container.js";
import { createSilentLogger } from "./silent-logger.js";

export async function createTestApp(overrides = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), "sku-data-test-"));
  const logger = overrides.logger ?? createSilentLogger();
  const testConfig = {
    ...config,
    ...overrides,
    env: "test",
    isProduction: false,
    port: 0,
    storage: {
      ...config.storage,
      dataDir,
      cacheTtlMs: 0,
      historyLimit: 10,
      ...overrides.storage,
    },
    firebase: {
      ...config.firebase,
      enabled: false,
      serviceAccountPath: path.join(dataDir, "firebase-key.json"),
      ...overrides.firebase,
    },
    http: {
      ...config.http,
      corsOrigins: ["*"],
      trustProxy: false,
      rateLimitMax: 1000,
      ...overrides.http,
    },
    limits: {
      ...config.limits,
      ...overrides.limits,
    },
  };
  const container = await createContainer(testConfig, logger);
  const app = createApp({
    config: testConfig,
    logger,
    controllers: container.controllers,
    schemas: container.schemas,
  });

  return {
    app,
    config: testConfig,
    container,
    dataDir,
    async close() {
      await container.services.firebase.close();
      container.services.externalCatalog.close();
      await container.services.storage.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
