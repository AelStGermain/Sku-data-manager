import { describe, expect, jest, test } from "@jest/globals";
import { ImportAuditService } from "../../src/services/ImportAuditService.js";

describe("ImportAuditService", () => {
  test("registra sólo los campos operacionales y omite usuario vacío", async () => {
    const storage = {
      appendImportHistory: jest.fn(async () => undefined),
      readImportHistory: jest.fn(async () => []),
    };
    const logger = { info: jest.fn() };
    const service = new ImportAuditService(storage, logger);

    await service.record({
      count: 3,
      user: "",
      durationMs: 12,
      result: "success",
    });

    expect(storage.appendImportHistory).toHaveBeenCalledWith({
      fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      cantidad: 3,
      duracionMs: 12,
      resultado: "success",
    });
    expect(await service.list()).toEqual([]);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });
});
