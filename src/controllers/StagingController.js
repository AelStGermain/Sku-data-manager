export class StagingController {
  constructor(storage) {
    this.storage = storage;
  }

  get = async (req, res) => {
    res.json({
      success: true,
      data: await this.storage.readStaging(req.validated.params.key),
    });
  };

  save = async (req, res) => {
    await this.storage.saveStaging(
      req.validated.params.key,
      req.validated.body,
    );
    res.json({ success: true });
  };
}
