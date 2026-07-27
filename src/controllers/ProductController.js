export class ProductController {
  constructor(productService, auditService, logger) {
    this.productService = productService;
    this.auditService = auditService;
    this.logger = logger;
  }

  list = async (_req, res) => {
    res.json({ success: true, data: await this.productService.getProducts() });
  };

  upsert = async (req, res) => {
    const { product, holdingRelations } = req.validated.body;
    await this.productService.upsert(product, holdingRelations);
    res.json({ success: true });
  };

  bulkUpsert = async (req, res) => {
    const startedAt = performance.now();
    const { products, holdingRelations, user: bodyUser } = req.validated.body;
    const user = req.get("x-user")?.trim().slice(0, 200) || bodyUser;
    try {
      await this.productService.bulkUpsert(products, holdingRelations);
      await this.#recordAudit(products.length, user, startedAt, "success");
      res.json({ success: true });
    } catch (error) {
      await this.#recordAudit(products.length, user, startedAt, "error");
      throw error;
    }
  };

  delete = async (req, res) => {
    await this.productService.deleteByEans(req.validated.body.eans);
    res.json({ success: true });
  };

  #recordAudit(count, user, startedAt, result) {
    return this.auditService
      .record({
        count,
        user,
        durationMs: Math.round(performance.now() - startedAt),
        result,
      })
      .catch((error) =>
        this.logger.warn(
          { err: error },
          "No se pudo guardar la auditoría de importación",
        ),
      );
  }
}
