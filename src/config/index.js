import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const booleanValue = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATA_DIR: z.string().default("local_data"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .optional(),
  CORS_ORIGINS: z.string().default("*"),
  TRUST_PROXY: z.string().default("1"),
  JSON_BODY_LIMIT: z.string().default("50mb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  STORAGE_CACHE_TTL_MS: z.coerce.number().int().min(0).default(5000),
  MAX_IMPORT_RECORDS: z.coerce.number().int().positive().default(100000),
  IMPORT_HISTORY_LIMIT: z.coerce.number().int().min(1).max(5000).default(200),
  FIREBASE_ENABLED: booleanValue.default("true"),
  DISABLE_FIREBASE_SYNC: z.enum(["0", "1"]).default("0"),
  FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
  FIREBASE_DATABASE_ID: z.string().trim().min(1).default("(default)"),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().default("firebase-key.json"),
  FIREBASE_COLLECTION: z.string().default("levantamientos"),
  FIREBASE_PAGE_SIZE: z.coerce.number().int().min(1).max(10000).default(2000),
  FIREBASE_SYNC_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(60000)
    .default(3600000),
  FIREBASE_INITIAL_SINCE: z.string().default("2025-05-01"),
  EXTERNAL_API_URL: z
    .string()
    .url()
    .default("https://world.openfoodfacts.org/api/v2/product"),
  OPEN_PRODUCTS_API_URL: z
    .string()
    .url()
    .default("https://world.openproductsfacts.org/api/v2/product"),
  SOLOTODO_API_URL: z
    .string()
    .url()
    .default("https://publicapi.solotodo.com/products/"),
  EXTERNAL_API_TIMEOUT_MS: z.coerce.number().int().min(100).default(8000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10000),
  SERVER_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120000),
  SERVER_HEADERS_TIMEOUT_MS: z.coerce.number().int().min(1000).default(65000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Configuración inválida: ${details}`);
}

const env = parsed.data;
const dataDir = path.resolve(projectRoot, env.DATA_DIR);
const resolveTrustProxy = (value) => {
  if (value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
};

export const StorageConfig = Object.freeze({
  dataDir,
  cacheTtlMs: env.STORAGE_CACHE_TTL_MS,
  historyLimit: env.IMPORT_HISTORY_LIMIT,
  files: Object.freeze({
    master: "master_catalog.json",
    retailer: "retailer_catalog.json",
    holdings: "holdings.json",
    stores: "stores.json",
    categoryHierarchy: "category_hierarchy.json",
    lastFirebaseSync: "last_fb_sync.json",
    firebaseKey: env.FIREBASE_SERVICE_ACCOUNT_PATH,
    importHistory: "import_history.json",
  }),
});

export const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  host: env.HOST,
  port: env.PORT,
  projectRoot,
  public: Object.freeze({
    cssDir: path.join(projectRoot, "css"),
    jsDir: path.join(projectRoot, "js"),
    indexFile: path.join(projectRoot, "index.html"),
    assets: [
      "logo.png",
      "jumbo_logo.png",
      "tottus_logo.png",
      "unimarc_logo.png",
    ],
  }),
  http: Object.freeze({
    corsOrigins: env.CORS_ORIGINS.split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    trustProxy: resolveTrustProxy(env.TRUST_PROXY),
    jsonBodyLimit: env.JSON_BODY_LIMIT,
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: env.RATE_LIMIT_MAX,
    shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    requestTimeoutMs: env.SERVER_REQUEST_TIMEOUT_MS,
    headersTimeoutMs: env.SERVER_HEADERS_TIMEOUT_MS,
  }),
  limits: Object.freeze({ maxImportRecords: env.MAX_IMPORT_RECORDS }),
  logLevel: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
  storage: StorageConfig,
  firebase: Object.freeze({
    enabled: env.FIREBASE_ENABLED && env.DISABLE_FIREBASE_SYNC !== "1",
    projectId: env.FIREBASE_PROJECT_ID,
    databaseId: env.FIREBASE_DATABASE_ID,
    serviceAccountPath: path.resolve(
      dataDir,
      env.FIREBASE_SERVICE_ACCOUNT_PATH,
    ),
    collection: env.FIREBASE_COLLECTION,
    pageSize: env.FIREBASE_PAGE_SIZE,
    syncIntervalMs: env.FIREBASE_SYNC_INTERVAL_MS,
    initialSince: env.FIREBASE_INITIAL_SINCE,
  }),
  externalApi: Object.freeze({
    openFoodUrl: env.EXTERNAL_API_URL.replace(/\/$/, ""),
    openProductsUrl: env.OPEN_PRODUCTS_API_URL.replace(/\/$/, ""),
    solotodoUrl: env.SOLOTODO_API_URL,
    timeoutMs: env.EXTERNAL_API_TIMEOUT_MS,
  }),
});
