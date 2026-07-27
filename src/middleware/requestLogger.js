import { randomUUID } from "node:crypto";

export const requestLogger = (logger) => (req, res, next) => {
  const startedAt = performance.now();
  req.id = req.get("x-request-id")?.slice(0, 128) || randomUUID();
  res.setHeader("x-request-id", req.id);
  res.on("finish", () => {
    const log =
      res.statusCode >= 500
        ? logger.error.bind(logger)
        : logger.info.bind(logger);
    log(
      {
        requestId: req.id,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      },
      "Petición HTTP",
    );
  });
  next();
};
