export class SystemController {
  constructor(auditService) {
    this.auditService = auditService;
  }

  health = (_req, res) => {
    res.json({
      success: true,
      data: {
        status: "ok",
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  };

  importHistory = async (_req, res) => {
    res.json({ success: true, data: await this.auditService.list() });
  };
}
