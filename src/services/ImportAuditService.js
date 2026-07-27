export class ImportAuditService {
  constructor(storage, logger) {
    this.storage = storage;
    this.logger = logger;
  }

  list() {
    return this.storage.readImportHistory();
  }

  async record({ count, user, durationMs, result }) {
    const entry = {
      fecha: new Date().toISOString(),
      cantidad: count,
      ...(user ? { usuario: user } : {}),
      duracionMs: durationMs,
      resultado: result,
    };
    await this.storage.appendImportHistory(entry);
    this.logger.info({ import: entry }, "Importación registrada");
  }
}
