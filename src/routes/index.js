import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { openApiDocument } from "../docs/openapi.js";

export function createApiRouter({ controllers, schemas }) {
  const router = Router();
  const { products, references, staging, firebase, system } = controllers;

  router.get("/openapi.json", (_req, res) => res.json(openApiDocument));
  router.get("/products", asyncHandler(products.list));
  router.post(
    "/products",
    validate(schemas.productMutation),
    asyncHandler(products.upsert),
  );
  router.post(
    "/products/bulk",
    validate(schemas.bulkProductMutation),
    asyncHandler(products.bulkUpsert),
  );
  router.delete(
    "/products",
    validate(schemas.productDeletion),
    asyncHandler(products.delete),
  );

  router.get("/holdings", asyncHandler(references.listHoldings));
  router.post(
    "/holdings",
    validate(schemas.holdings),
    asyncHandler(references.saveHoldings),
  );
  router.delete(
    "/holdings/:id",
    validate(schemas.holdingId, "params"),
    asyncHandler(references.deleteHolding),
  );

  router.get("/category-hierarchy", asyncHandler(references.getHierarchy));
  router.post(
    "/category-hierarchy",
    validate(schemas.hierarchy),
    asyncHandler(references.saveHierarchy),
  );

  router.get(
    "/stores",
    validate(schemas.storesQuery, "query"),
    asyncHandler(references.listStores),
  );
  router.post(
    "/stores",
    validate(schemas.stores),
    asyncHandler(references.saveStores),
  );

  router.get(
    "/staging/:key",
    validate(schemas.stagingKey, "params"),
    asyncHandler(staging.get),
  );
  router.post(
    "/staging/:key",
    validate(schemas.stagingKey, "params"),
    validate(schemas.stagingBody),
    asyncHandler(staging.save),
  );

  router.post(
    "/sync-firebase",
    validate(schemas.firebaseSync),
    asyncHandler(firebase.sync),
  );
  router.get("/last-sync", asyncHandler(firebase.lastSync));
  router.get("/import-history", asyncHandler(system.importHistory));
  return router;
}
