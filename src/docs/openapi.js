export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Smart Shelf SKU Data Manager API",
    version: "1.0.0",
    description:
      "API de catálogos JSON, datos de referencia, staging, auditoría y sincronización opcional con Firebase.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": {
      get: {
        summary: "Comprobar disponibilidad",
        responses: { 200: { description: "Servicio disponible" } },
      },
    },
    "/api/products": {
      get: {
        summary: "Obtener catálogos maestro y por holding",
        responses: { 200: { description: "Catálogos" } },
      },
      post: {
        summary: "Crear o actualizar un producto",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProductMutation" },
            },
          },
        },
        responses: {
          200: { description: "Producto guardado" },
          400: { $ref: "#/components/responses/ValidationError" },
        },
      },
      delete: {
        summary: "Eliminar productos por EAN",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["eans"],
                properties: {
                  eans: {
                    type: "array",
                    minItems: 1,
                    items: { $ref: "#/components/schemas/Ean" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Productos eliminados" },
          400: { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/products/bulk": {
      post: {
        summary: "Importar o actualizar productos en lote",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["products"],
                properties: {
                  products: {
                    type: "array",
                    items: { $ref: "#/components/schemas/Product" },
                  },
                  holdingRelations: {
                    type: "array",
                    items: { type: "object", additionalProperties: true },
                  },
                  user: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Lote guardado" },
          400: { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/holdings": {
      get: {
        summary: "Listar holdings",
        responses: { 200: { description: "Holdings" } },
      },
      post: {
        summary: "Reemplazar holdings",
        responses: { 200: { description: "Holdings guardados" } },
      },
    },
    "/api/holdings/{id}": {
      delete: {
        summary: "Eliminar un holding",
        parameters: [
          {
            in: "path",
            name: "id",
            required: true,
            schema: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
          },
        ],
        responses: { 200: { description: "Holding eliminado" } },
      },
    },
    "/api/category-hierarchy": {
      get: {
        summary: "Obtener jerarquía de categorías",
        responses: { 200: { description: "Jerarquía" } },
      },
      post: {
        summary: "Reemplazar jerarquía de categorías",
        responses: { 200: { description: "Jerarquía guardada" } },
      },
    },
    "/api/stores": {
      get: {
        summary: "Listar sucursales",
        parameters: [
          { in: "query", name: "holdingId", schema: { type: "string" } },
        ],
        responses: { 200: { description: "Sucursales" } },
      },
      post: {
        summary: "Reemplazar sucursales",
        responses: { 200: { description: "Sucursales guardadas" } },
      },
    },
    "/api/staging/{key}": {
      get: {
        summary: "Obtener una cola de staging",
        parameters: [{ $ref: "#/components/parameters/StagingKey" }],
        responses: { 200: { description: "Cola" } },
      },
      post: {
        summary: "Reemplazar una cola de staging",
        parameters: [{ $ref: "#/components/parameters/StagingKey" }],
        responses: { 200: { description: "Cola guardada" } },
      },
    },
    "/api/sync-firebase": {
      post: {
        summary: "Ejecutar sincronización Firebase si está habilitada",
        responses: { 200: { description: "Resultado de sincronización" } },
      },
    },
    "/api/last-sync": {
      get: {
        summary: "Obtener último checkpoint Firebase",
        responses: { 200: { description: "Checkpoint" } },
      },
    },
    "/api/import-history": {
      get: {
        summary: "Listar historial compacto de importaciones",
        responses: { 200: { description: "Historial" } },
      },
    },
  },
  components: {
    schemas: {
      Product: {
        type: "object",
        required: ["ean"],
        properties: { ean: { $ref: "#/components/schemas/Ean" } },
        additionalProperties: true,
      },
      Ean: {
        description:
          "Identificador numérico flexible. No requiere un largo ni checksum GTIN específico.",
        oneOf: [
          { type: "string", pattern: "^\\d+$" },
          { type: "integer", minimum: 0 },
        ],
      },
      ProductMutation: {
        type: "object",
        required: ["product"],
        properties: {
          product: { $ref: "#/components/schemas/Product" },
          holdingRelations: {
            type: "array",
            items: { type: "object", additionalProperties: true },
          },
        },
      },
      Error: {
        type: "object",
        required: ["success", "error"],
        properties: {
          success: { const: false },
          error: { type: "string" },
          code: { type: "string" },
        },
      },
    },
    parameters: {
      StagingKey: {
        in: "path",
        name: "key",
        required: true,
        schema: { type: "string", pattern: "^[a-zA-Z0-9_-]+$" },
      },
    },
    responses: {
      ValidationError: {
        description: "Entrada inválida",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/Error" },
          },
        },
      },
    },
  },
};
