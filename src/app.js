import path from "node:path";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { sanitizeInput } from "./middleware/sanitizeInput.js";
import { createApiRouter } from "./routes/index.js";

export function createApp({ config, logger, controllers, schemas }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.http.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.http.corsOrigins.includes("*")
        ? "*"
        : (origin, callback) =>
            callback(null, !origin || config.http.corsOrigins.includes(origin)),
      optionsSuccessStatus: 204,
    }),
  );
  app.use(requestLogger(logger));
  app.use(express.json({ limit: config.http.jsonBodyLimit, strict: true }));
  app.use(sanitizeInput);

  const apiLimiter = rateLimit({
    windowMs: config.http.rateLimitWindowMs,
    limit: config.http.rateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        success: false,
        error: "Demasiadas solicitudes. Intente nuevamente más tarde.",
      }),
  });
  app.use("/api", apiLimiter, createApiRouter({ controllers, schemas }));

  app.get("/health", controllers.system.health);
  app.get("/runtime-config.js", (_req, res) => {
    const publicConfig = {
      openFoodApiUrl: config.externalApi.openFoodUrl,
      openProductsApiUrl: config.externalApi.openProductsUrl,
      solotodoApiUrl: config.externalApi.solotodoUrl,
      externalApiTimeoutMs: config.externalApi.timeoutMs,
    };
    res
      .type("application/javascript")
      .send(`globalThis.SMART_SHELF_CONFIG=${JSON.stringify(publicConfig)};`);
  });
  app.use(
    "/css",
    express.static(config.public.cssDir, {
      dotfiles: "deny",
      maxAge: config.isProduction ? "1d" : 0,
    }),
  );
  app.use(
    "/js",
    express.static(config.public.jsDir, {
      dotfiles: "deny",
      maxAge: config.isProduction ? "1d" : 0,
    }),
  );
  for (const asset of config.public.assets) {
    app.get(`/${asset}`, (_req, res) =>
      res.sendFile(path.join(config.projectRoot, asset), { dotfiles: "allow" }),
    );
  }
  app.get("/", (_req, res) =>
    res.sendFile(config.public.indexFile, { dotfiles: "allow" }),
  );
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
