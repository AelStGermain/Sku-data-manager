import pino from "pino";
import { config } from "./index.js";

export const logger = pino({
  level: config.logLevel,
  enabled: config.logLevel !== "silent",
  base: { service: "sku-data-manager", env: config.env },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.password",
      "*.token",
      "*.credential",
    ],
    censor: "[REDACTED]",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
