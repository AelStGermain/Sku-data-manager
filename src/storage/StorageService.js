import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { AppError, ValidationError } from "../errors/AppError.js";

const clone = (value) => structuredClone(value);
const FILE_EXISTS = (error) => error?.code !== "ENOENT";

export class StorageService {
  #cache = new Map();
  #writeQueues = new Map();
  #transactionQueue = Promise.resolve();

  constructor(storageConfig, logger) {
    this.config = storageConfig;
    this.logger = logger;
  }

  async initialize(defaults) {
    await mkdir(this.config.dataDir, { recursive: true });
    await Promise.all([
      this.#ensureJson("master", []),
      this.#ensureJson("retailer", []),
      this.#ensureJson("holdings", defaults.holdings),
      this.#ensureJson("stores", defaults.stores),
      this.#ensureJson("categoryHierarchy", defaults.categoryHierarchy),
    ]);
  }

  runExclusive(operation) {
    const result = this.#transactionQueue
      .catch(() => undefined)
      .then(operation);
    this.#transactionQueue = result;
    return result;
  }

  async #ensureJson(name, initialValue) {
    const filePath = this.#pathFor(name);
    try {
      await access(filePath);
    } catch (error) {
      if (FILE_EXISTS(error)) throw error;
      await this.#atomicWrite(filePath, initialValue);
    }
  }

  #pathFor(name) {
    const filename = this.config.files[name];
    if (!filename)
      throw new AppError(`Nombre de almacenamiento desconocido: ${name}`);
    return path.join(this.config.dataDir, filename);
  }

  #stagingPath(key) {
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
      throw new ValidationError("Llave inválida");
    }
    const resolved = path.resolve(this.config.dataDir, `${key}.json`);
    const root = `${path.resolve(this.config.dataDir)}${path.sep}`;
    if (!resolved.startsWith(root))
      throw new ValidationError("Ruta de almacenamiento inválida");
    return resolved;
  }

  async #readJson(cacheKey, filePath, fallback) {
    const pendingWrite = this.#writeQueues.get(cacheKey);
    if (pendingWrite) await pendingWrite;

    const cached = this.#cache.get(cacheKey);
    if (cached && cached.expiresAt >= Date.now()) return clone(cached.value);

    let raw;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT" && fallback !== undefined)
        return clone(fallback);
      throw new AppError("No fue posible leer los datos persistidos", {
        cause: error,
      });
    }

    try {
      const value = JSON.parse(raw);
      this.#cache.set(cacheKey, {
        value: clone(value),
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });
      return value;
    } catch (error) {
      throw new AppError(
        `El archivo ${path.basename(filePath)} contiene JSON inválido`,
        { cause: error },
      );
    }
  }

  async #writeJson(cacheKey, filePath, value) {
    const previous = this.#writeQueues.get(cacheKey) ?? Promise.resolve();
    const pending = previous
      .catch(() => undefined)
      .then(() => this.#atomicWrite(filePath, value));
    this.#writeQueues.set(cacheKey, pending);

    try {
      await pending;
      this.#cache.set(cacheKey, {
        value: clone(value),
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });
    } finally {
      if (this.#writeQueues.get(cacheKey) === pending)
        this.#writeQueues.delete(cacheKey);
    }
  }

  async #atomicWrite(filePath, value) {
    const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(value, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      await rename(temporaryPath, filePath);
    } catch (error) {
      if (!["EPERM", "EBUSY", "EEXIST"].includes(error.code)) {
        await unlink(temporaryPath).catch(() => undefined);
        throw error;
      }
      await copyFile(temporaryPath, filePath);
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  readCatalog() {
    return this.#readJson("master", this.#pathFor("master"), []);
  }

  saveCatalog(data) {
    return this.#writeJson("master", this.#pathFor("master"), data);
  }

  readRetailerCatalog() {
    return this.#readJson("retailer", this.#pathFor("retailer"), []);
  }

  saveRetailerCatalog(data) {
    return this.#writeJson("retailer", this.#pathFor("retailer"), data);
  }

  readHoldings() {
    return this.#readJson("holdings", this.#pathFor("holdings"), []);
  }

  saveHoldings(data) {
    return this.#writeJson("holdings", this.#pathFor("holdings"), data);
  }

  readStores() {
    return this.#readJson("stores", this.#pathFor("stores"), []);
  }

  saveStores(data) {
    return this.#writeJson("stores", this.#pathFor("stores"), data);
  }

  readCategoryHierarchy() {
    return this.#readJson(
      "categoryHierarchy",
      this.#pathFor("categoryHierarchy"),
      {},
    );
  }

  saveCategoryHierarchy(data) {
    return this.#writeJson(
      "categoryHierarchy",
      this.#pathFor("categoryHierarchy"),
      data,
    );
  }

  readStaging(key) {
    return this.#readJson(`staging:${key}`, this.#stagingPath(key), []);
  }

  saveStaging(key, data) {
    return this.#writeJson(`staging:${key}`, this.#stagingPath(key), data);
  }

  readLastFirebaseSync() {
    return this.#readJson(
      "lastFirebaseSync",
      this.#pathFor("lastFirebaseSync"),
      0,
    );
  }

  saveLastFirebaseSync(timestamp) {
    return this.#writeJson(
      "lastFirebaseSync",
      this.#pathFor("lastFirebaseSync"),
      timestamp,
    );
  }

  readImportHistory() {
    return this.#readJson("importHistory", this.#pathFor("importHistory"), []);
  }

  async appendImportHistory(entry) {
    return this.runExclusive(async () => {
      const history = await this.readImportHistory();
      history.push(entry);
      const compactHistory = history.slice(-this.config.historyLimit);
      await this.#writeJson(
        "importHistory",
        this.#pathFor("importHistory"),
        compactHistory,
      );
      return compactHistory;
    });
  }

  async hasLastFirebaseSync() {
    try {
      await access(this.#pathFor("lastFirebaseSync"));
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }

  async close() {
    await this.#transactionQueue.catch(() => undefined);
    await Promise.allSettled(this.#writeQueues.values());
    this.#cache.clear();
  }
}
