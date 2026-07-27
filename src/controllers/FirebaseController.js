export class FirebaseController {
  constructor(firebaseService) {
    this.firebaseService = firebaseService;
  }

  sync = async (req, res) => {
    const result = await this.firebaseService.sync(req.validated.body);
    res.json({
      success: result.success,
      data: result,
      ...(result.error ? { error: result.error } : {}),
    });
  };

  lastSync = async (_req, res) => {
    res.json({ success: true, data: await this.firebaseService.getLastSync() });
  };
}
