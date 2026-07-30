import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSilentLogger } from "../helpers/silent-logger.js";

export default async function globalSetup() {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const dataDir = path.join(projectRoot, "tests", ".tmp", "e2e-data");
  const port = Number(process.env.E2E_PORT || 4173);

  process.env.NODE_ENV = "test";
  process.env.HOST = "127.0.0.1";
  process.env.PORT = String(port);
  process.env.DATA_DIR = path.relative(projectRoot, dataDir);
  process.env.FIREBASE_ENABLED = "false";
  process.env.DISABLE_FIREBASE_SYNC = "1";
  process.env.LOG_LEVEL = "silent";
  process.env.TRUST_PROXY = "false";
  process.env.RATE_LIMIT_MAX = "10000";

  await rm(dataDir, { recursive: true, force: true });
  await mkdir(dataDir, { recursive: true });

  const [{ createApp }, { config }, { createContainer }] = await Promise.all([
    import("../../src/app.js"),
    import("../../src/config/index.js"),
    import("../../src/container.js"),
  ]);
  const logger = createSilentLogger();
  const container = await createContainer(config, logger);
  const app = createApp({
    config,
    logger,
    controllers: container.controllers,
    schemas: container.schemas,
  });
  const server = await new Promise((resolve, reject) => {
    const instance = app.listen(port, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });

  return async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await container.services.firebase.close();
    container.services.externalCatalog.close();
    await container.services.storage.close();
    await rm(dataDir, { recursive: true, force: true });
  };
}
