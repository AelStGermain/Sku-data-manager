import { ProductController } from "./controllers/ProductController.js";
import { ReferenceDataController } from "./controllers/ReferenceDataController.js";
import { StagingController } from "./controllers/StagingController.js";
import { FirebaseController } from "./controllers/FirebaseController.js";
import { SystemController } from "./controllers/SystemController.js";
import {
  DEFAULT_CATEGORY_HIERARCHY,
  DEFAULT_HOLDINGS,
  DEFAULT_STORES,
} from "./config/defaults.js";
import { StorageService } from "./storage/StorageService.js";
import { ExternalCatalogService } from "./services/ExternalCatalogService.js";
import { FirebaseService } from "./services/FirebaseService.js";
import { ImportAuditService } from "./services/ImportAuditService.js";
import { ProductService } from "./services/ProductService.js";
import { ReferenceDataService } from "./services/ReferenceDataService.js";
import { createSchemas } from "./validators/schemas.js";

export async function createContainer(config, logger) {
  const storage = new StorageService(config.storage, logger);
  await storage.initialize({
    holdings: DEFAULT_HOLDINGS,
    stores: DEFAULT_STORES,
    categoryHierarchy: DEFAULT_CATEGORY_HIERARCHY,
  });

  const externalCatalog = new ExternalCatalogService(
    config.externalApi,
    logger,
  );
  const productService = new ProductService(storage);
  const referenceService = new ReferenceDataService(storage);
  const auditService = new ImportAuditService(storage, logger);
  const firebaseService = new FirebaseService(
    config.firebase,
    storage,
    externalCatalog,
    logger,
  );
  await firebaseService.initialize();

  return {
    controllers: {
      products: new ProductController(productService, auditService, logger),
      references: new ReferenceDataController(referenceService),
      staging: new StagingController(storage),
      firebase: new FirebaseController(firebaseService),
      system: new SystemController(auditService),
    },
    schemas: createSchemas(config.limits),
    services: { storage, externalCatalog, firebase: firebaseService },
  };
}
