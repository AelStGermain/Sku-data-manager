export class ReferenceDataController {
  constructor(service) {
    this.service = service;
  }

  listHoldings = async (_req, res) => {
    res.json({ success: true, data: await this.service.getHoldings() });
  };

  saveHoldings = async (req, res) => {
    const holdings = req.validated.body;
    await this.service.saveHoldings(holdings);
    res.json({ success: true, count: holdings.length });
  };

  deleteHolding = async (req, res) => {
    await this.service.deleteHolding(req.validated.params.id);
    res.json({ success: true });
  };

  getHierarchy = async (_req, res) => {
    res.json({
      success: true,
      data: await this.service.getCategoryHierarchy(),
    });
  };

  saveHierarchy = async (req, res) => {
    await this.service.saveCategoryHierarchy(req.validated.body);
    res.json({ success: true });
  };

  listStores = async (req, res) => {
    res.json({
      success: true,
      data: await this.service.getStores(req.validated.query.holdingId),
    });
  };

  saveStores = async (req, res) => {
    const stores = req.validated.body;
    await this.service.saveStores(stores);
    res.json({ success: true, count: stores.length });
  };
}
