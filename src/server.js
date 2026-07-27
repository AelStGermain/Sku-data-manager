import { pathToFileURL } from "node:url";
import { createApp } from "./app.js";
import { config } from "./config/index.js";
import { logger } from "./config/logger.js";
import { createContainer } from "./container.js";

export async function startServer() {
  const container = await createContainer(config, logger);
  const app = createApp({
    config,
    logger,
    controllers: container.controllers,
    schemas: container.schemas,
  });
  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { host: config.host, port: config.port, dataDir: config.storage.dataDir },
      "Smart Shelf backend iniciado",
    );
  });
  server.requestTimeout = config.http.requestTimeoutMs;
  server.headersTimeout = Math.min(
    config.http.headersTimeoutMs,
    config.http.requestTimeoutMs,
  );

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Iniciando apagado elegante");

    const forceTimer = setTimeout(() => {
      logger.error("El apagado excedió el tiempo máximo");
      process.exitCode = 1;
      server.closeAllConnections?.();
    }, config.http.shutdownTimeoutMs);
    forceTimer.unref();

    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([
      container.services.firebase.close(),
      container.services.storage.close(),
    ]);
    container.services.externalCatalog.close();
    clearTimeout(forceTimer);
    logger.info("Apagado completo");
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("uncaughtException", (error) => {
    logger.fatal({ err: error }, "Excepción no capturada");
    process.exitCode = 1;
    void shutdown("uncaughtException");
  });
  process.on("unhandledRejection", (error) => {
    logger.error({ err: error }, "Promesa rechazada sin manejar");
  });

  if (container.services.firebase.enabled) {
    const firstRun = !(await container.services.storage.hasLastFirebaseSync());
    container.services.firebase.startSchedule();
    void container.services.firebase
      .sync({
        force: firstRun,
        since: firstRun ? config.firebase.initialSince : null,
      })
      .then((result) =>
        logger.info({ result }, "Sincronización Firebase de inicio finalizada"),
      );
  }

  return { app, server, shutdown, container };
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMainModule) {
  startServer().catch((error) => {
    logger.fatal({ err: error }, "No fue posible iniciar el servidor");
    process.exitCode = 1;
  });
}
