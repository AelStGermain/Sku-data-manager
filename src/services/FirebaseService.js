import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { consolidateMaster } from "../utils/ean.js";

const FIREBASE_FIELDS = [
  "ean",
  "fecha",
  "holding",
  "holdingId",
  "dmu",
  "pasillo",
  "categoria",
  "local",
  "auditor",
  "productoWeb",
  "marcaWeb",
  "imagenProductoWeb",
  "nombreProductoOCR",
  "precioWeb",
  "precioOCR",
  "estado",
];

export function formatFirestoreError(error, { projectId, databaseId }) {
  const code = String(error?.code ?? "").replace(/^firestore\//, "");
  const message = String(error?.message || "Error desconocido");
  if (code === "5" || /NOT_FOUND/i.test(message)) {
    return `Firestore no encontró la base "${databaseId}" en el proyecto "${projectId}". Verifique FIREBASE_PROJECT_ID, FIREBASE_DATABASE_ID y la credencial desplegada.`;
  }
  if (code === "7" || /PERMISSION_DENIED/i.test(message)) {
    return `La cuenta de servicio no tiene permiso para leer Firestore en el proyecto "${projectId}".`;
  }
  if (code === "9" || /FAILED_PRECONDITION/i.test(message)) {
    return `Firestore requiere configuración adicional para esta consulta: ${message}`;
  }
  if (code === "14" || /UNAVAILABLE|ECONN|ETIMEDOUT/i.test(message)) {
    return "Firestore no está disponible temporalmente o el servidor no tiene salida HTTPS.";
  }
  return `Firestore (${code || "sin código"}): ${message}`;
}

export class FirebaseService {
  #database = null;
  #isSyncing = false;
  #timer = null;
  #enabled;
  #initializationError = null;
  #projectId = null;

  constructor(firebaseConfig, storage, externalCatalog, logger) {
    this.config = firebaseConfig;
    this.storage = storage;
    this.externalCatalog = externalCatalog;
    this.logger = logger;
    this.#enabled = firebaseConfig.enabled;
  }

  get enabled() {
    return this.#enabled && this.#database !== null;
  }

  async initialize() {
    if (!this.#enabled) {
      this.logger.info(
        "Sincronización Firebase deshabilitada por configuración",
      );
      return false;
    }

    try {
      const serviceAccount = JSON.parse(
        await readFile(this.config.serviceAccountPath, "utf8"),
      );
      const credentialProjectId = serviceAccount.project_id;
      if (
        this.config.projectId &&
        credentialProjectId !== this.config.projectId
      ) {
        throw new Error(
          `La credencial pertenece a "${credentialProjectId}", pero FIREBASE_PROJECT_ID es "${this.config.projectId}"`,
        );
      }
      this.#projectId = this.config.projectId || credentialProjectId;
      const appName = "sku-data-manager";
      const app =
        getApps().find((candidate) => candidate.name === appName) ??
        initializeApp(
          { credential: cert(serviceAccount), projectId: this.#projectId },
          appName,
        );
      this.#database =
        this.config.databaseId === "(default)"
          ? getFirestore(app)
          : getFirestore(app, this.config.databaseId);
      this.logger.info(
        {
          projectId: this.#projectId,
          databaseId: this.config.databaseId,
          collection: this.config.collection,
        },
        "Firebase Admin SDK inicializado",
      );
      return true;
    } catch (error) {
      if (error.code === "ENOENT") {
        this.logger.info(
          "Firebase no configurado; la aplicación continuará sin sincronización",
        );
      } else {
        this.#initializationError = error.message;
        this.logger.warn(
          { err: error },
          "Firebase no pudo inicializarse; la aplicación continuará sin sincronización",
        );
      }
      this.#enabled = false;
      this.#database = null;
      return false;
    }
  }

  async query({ sinceDate = null } = {}) {
    let query = this.#database
      .collection(this.config.collection)
      .select(...FIREBASE_FIELDS)
      .orderBy("fecha", "desc")
      .limit(this.config.pageSize);
    if (sinceDate) query = query.where("fecha", ">=", sinceDate);

    const snapshot = await query.get();
    return snapshot.docs.map((document) => {
      const data = document.data();
      if (data.fecha && typeof data.fecha.toDate === "function") {
        data.fecha = data.fecha.toDate().toISOString();
      }
      return { _id: document.id, ...data };
    });
  }

  async sync({ force = false, since = null } = {}) {
    if (!this.enabled) {
      if (this.#initializationError) {
        return {
          success: false,
          enabled: false,
          error: `Firebase no pudo inicializarse: ${this.#initializationError}`,
        };
      }
      return {
        success: true,
        enabled: false,
        count: 0,
        added: 0,
        updated: 0,
        message: "Sincronización Firebase deshabilitada",
      };
    }
    if (this.#isSyncing)
      return { success: false, error: "Sync ya en progreso" };
    this.#isSyncing = true;

    try {
      const storedLastSync = force
        ? 0
        : await this.storage.readLastFirebaseSync();
      const lastSync = Number(storedLastSync) || 0;
      let sinceDate = null;
      if (since) {
        sinceDate = new Date(since);
        if (Number.isNaN(sinceDate.getTime()))
          return { success: false, error: "Fecha since inválida" };
      } else if (lastSync > 0) {
        sinceDate = new Date(lastSync);
      }

      this.logger.info(
        { since: sinceDate?.toISOString() ?? null },
        "Consultando Firebase",
      );
      let documents;
      try {
        documents = await this.query({ sinceDate });
      } catch (error) {
        this.logger.error({ err: error }, "Falló la consulta Firebase");
        return {
          success: false,
          error: formatFirestoreError(error, {
            projectId: this.#projectId,
            databaseId: this.config.databaseId,
          }),
        };
      }

      if (documents.length === 0) {
        return {
          success: true,
          count: 0,
          added: 0,
          updated: 0,
          message: "No hay nuevos datos en Firebase",
        };
      }

      return await this.storage.runExclusive(async () => {
        const [rawMaster, holdings] = await Promise.all([
          this.storage.readCatalog(),
          this.storage.readHoldings(),
        ]);
        const master = consolidateMaster(rawMaster);
        const holdingsByAlias = new Map();
        for (const holding of holdings) {
          holdingsByAlias.set(String(holding.id).toLowerCase(), holding.id);
          holdingsByAlias.set(String(holding.name).toLowerCase(), holding.id);
        }
        const productIndex = new Map(
          master.map((product, index) => [String(product.ean), index]),
        );
        const withoutEan = [];
        let added = 0;
        let updated = 0;

        for (const record of documents) {
          const timestamp =
            typeof record.fecha === "string"
              ? record.fecha
              : new Date().toISOString();
          const ean = String(record.ean || "")
            .trim()
            .replace(/\D/g, "");
          const holdingRaw = String(
            record.holdingId || record.holding || "tottus",
          ).trim();
          const holding =
            holdingsByAlias.get(holdingRaw.toLowerCase()) ||
            holdingRaw.toLowerCase();
          const dmu = record.dmu || record.pasillo || record.categoria || "";

          if (!ean) {
            withoutEan.push(
              this.#mapWithoutEan(record, { holding, dmu, timestamp }),
            );
            continue;
          }

          const index = productIndex.get(ean);
          const existing = index === undefined ? null : master[index];
          let name =
            record.productoWeb ||
            record.nombreProductoOCR ||
            existing?.name ||
            "";
          let category =
            existing?.universalCategory || record.categoria || "GROCERY STORE";
          let brand = record.marcaWeb || existing?.brand || "Por Definir";
          let imageUrl = record.imagenProductoWeb || existing?.imageUrl || null;

          if (!name && !existing && documents.length <= 100) {
            const apiData = await this.externalCatalog.fetchEnrichment(ean);
            if (apiData?.name) {
              name = apiData.name;
              if (apiData.masterCategory) category = apiData.masterCategory;
              if (apiData.brand && brand === "Por Definir")
                brand = apiData.brand;
              if (apiData.imageUrl && !imageUrl) imageUrl = apiData.imageUrl;
            }
          }
          if (!name) name = "Nuevo SKU de Terreno";

          const levantamientoMeta = {
            auditor: record.auditor || "App Terreno",
            dmu,
            pasillo: record.pasillo || "",
            local: record.local || "",
            holdingId: holding,
            timestamp,
            firebaseId: record._id,
            estado: record.estado || null,
          };
          const holdingData = {
            holdingInternalId: "",
            customerId: "",
            localProductName: name,
            name,
            localCategoryName: category,
            category,
            dmu,
            pasillo: record.pasillo || "",
            local: record.local || "",
            isActiveHolding: true,
            stockStatus: true,
            updatedAt: timestamp,
          };

          if (existing) {
            const updatedProduct = {
              ...existing,
              name:
                !existing.name || existing.name === "Nuevo SKU de Terreno"
                  ? name
                  : existing.name,
              brand:
                !existing.brand || existing.brand === "Por Definir"
                  ? brand
                  : existing.brand,
              imageUrl: existing.imageUrl || imageUrl,
              levantamientoMeta,
              fromLevantamiento: true,
              fromFirebase: true,
              dataSource:
                existing.dataSource === "firebase"
                  ? "firebase"
                  : existing.dataSource || "firebase",
              status: existing.status || "review",
            };
            updatedProduct.holdings ||= {};
            if (holding && !updatedProduct.holdings[holding])
              updatedProduct.holdings[holding] = holdingData;
            master[index] = updatedProduct;
            updated += 1;
          } else {
            const newProduct = {
              ean,
              name,
              brand,
              imageUrl,
              universalCategory: category,
              status: "review",
              dataSource: "firebase",
              fromLevantamiento: true,
              fromFirebase: true,
              offAttempted: false,
              createdAt: timestamp,
              updatedAt: timestamp,
              levantamientoMeta,
              holdings: {},
            };
            if (holding) newProduct.holdings[holding] = holdingData;
            productIndex.set(ean, master.length);
            master.push(newProduct);
            added += 1;
          }
        }

        await this.storage.saveCatalog(master);
        if (withoutEan.length > 0) {
          const existingWithoutEan =
            await this.storage.readStaging("ss_staging_no_ean");
          const byId = new Map(
            existingWithoutEan.map((item) => [
              item.id || item.firebaseId,
              item,
            ]),
          );
          for (const item of withoutEan)
            byId.set(item.id || item.firebaseId, item);
          await this.storage.saveStaging("ss_staging_no_ean", [
            ...byId.values(),
          ]);
        }

        const processedTimes = documents
          .map((document) => Date.parse(document.fecha))
          .filter(Number.isFinite);
        const checkpoint =
          processedTimes.length > 0 ? Math.max(...processedTimes) : lastSync;
        await this.storage.saveLastFirebaseSync(checkpoint);
        return {
          success: true,
          count: documents.length,
          added,
          updated,
          sinEanList: withoutEan,
        };
      });
    } catch (error) {
      this.logger.error({ err: error }, "Falló la sincronización Firebase");
      return { success: false, error: error.message };
    } finally {
      this.#isSyncing = false;
    }
  }

  #mapWithoutEan(record, context) {
    return {
      id: record._id,
      firebaseId: record._id,
      holdingId: context.holding,
      dmu: context.dmu,
      pasillo: record.pasillo || "",
      local: record.local || "",
      category: record.categoria || "",
      auditor: record.auditor || "App Terreno",
      timestamp: context.timestamp,
      firebaseName: record.productoWeb || record.nombreProductoOCR || "",
      firebasePrice: record.precioWeb || record.precioOCR || null,
      estado: record.estado || null,
      source: "Firebase",
    };
  }

  startSchedule() {
    if (!this.enabled || this.#timer) return;
    this.#timer = setInterval(() => {
      this.sync().then((result) => {
        if (result.success && (result.added > 0 || result.updated > 0)) {
          this.logger.info(
            { added: result.added, updated: result.updated },
            "Sincronización Firebase programada completada",
          );
        } else if (!result.success) {
          this.logger.warn(
            { error: result.error },
            "Falló la sincronización Firebase programada",
          );
        }
      });
    }, this.config.syncIntervalMs);
    this.#timer.unref();
  }

  async getLastSync() {
    if (!this.enabled) {
      return {
        lastSync: null,
        enabled: false,
        ...(this.#initializationError
          ? { initializationError: this.#initializationError }
          : {}),
      };
    }
    return {
      lastSync: Number(await this.storage.readLastFirebaseSync()) || 0,
      enabled: true,
      projectId: this.#projectId,
      databaseId: this.config.databaseId,
    };
  }

  async close() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
