import { z } from "zod";

const jsonObject = z.object({}).passthrough();
const ean = z.union([z.string().trim().min(1), z.number().finite()]);

export const createSchemas = (limits) => ({
  productMutation: z.object({
    product: jsonObject.extend({ ean }),
    holdingRelations: z
      .array(jsonObject)
      .max(limits.maxImportRecords)
      .optional(),
  }),
  bulkProductMutation: z.object({
    products: z.array(jsonObject.extend({ ean })).max(limits.maxImportRecords),
    holdingRelations: z
      .array(jsonObject)
      .max(limits.maxImportRecords)
      .optional(),
    user: z.string().trim().max(200).optional(),
  }),
  productDeletion: z.object({
    eans: z.array(ean).min(1).max(limits.maxImportRecords),
  }),
  holdings: z.array(jsonObject).max(10000),
  stores: z.array(jsonObject).max(100000),
  hierarchy: z.record(z.string(), z.unknown()),
  stagingKey: z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]+$/, "Llave inválida"),
  }),
  stagingBody: z.array(z.unknown()).max(limits.maxImportRecords),
  storesQuery: z.object({
    holdingId: z.string().max(200).optional(),
  }),
  holdingId: z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]+$/, "ID inválido"),
  }),
  firebaseSync: z.object({
    force: z.boolean().optional().default(false),
    since: z
      .string()
      .trim()
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "Fecha since inválida",
      )
      .optional(),
  }),
});
