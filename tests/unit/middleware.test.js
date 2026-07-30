import { describe, expect, jest, test } from "@jest/globals";
import { z } from "zod";
import {
  errorHandler,
  notFoundHandler,
} from "../../src/middleware/errorHandler.js";
import { requestLogger } from "../../src/middleware/requestLogger.js";
import { sanitizeInput } from "../../src/middleware/sanitizeInput.js";
import { validate } from "../../src/middleware/validate.js";

describe("middleware", () => {
  test("validate guarda la versión parseada y describe entradas inválidas", () => {
    const middleware = validate(
      z.object({ count: z.coerce.number().int().positive() }),
    );
    const next = jest.fn();
    const req = { body: { count: "2" } };

    middleware(req, {}, next);
    expect(req.validated.body).toEqual({ count: 2 });
    expect(next).toHaveBeenCalledWith();

    const invalidNext = jest.fn();
    middleware({ body: { count: "no" } }, {}, invalidNext);
    expect(invalidNext.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details: [{ path: "count", message: expect.any(String) }],
    });
  });

  test("sanitizeInput bloquea NUL y claves peligrosas", () => {
    const next = jest.fn();
    sanitizeInput(
      {
        body: JSON.parse('{"safe":1,"constructor":{"polluted":true}}'),
        query: {},
        params: {},
      },
      {},
      next,
    );
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 400,
      message: "Propiedad no permitida: constructor",
    });

    const nulNext = jest.fn();
    sanitizeInput(
      { body: { name: "mal\0dato" }, query: {}, params: {} },
      {},
      nulNext,
    );
    expect(nulNext.mock.calls[0][0].message).toContain(
      "Caracteres no permitidos",
    );
  });

  test("requestLogger conserva request ID y registra al finalizar", () => {
    const finishHandlers = [];
    const logger = { info: jest.fn(), error: jest.fn() };
    const req = {
      originalUrl: "/health",
      method: "GET",
      get: jest.fn(() => "request-123"),
    };
    const res = {
      statusCode: 200,
      setHeader: jest.fn(),
      on: jest.fn((event, handler) => {
        if (event === "finish") finishHandlers.push(handler);
      }),
    };
    const next = jest.fn();

    requestLogger(logger)(req, res, next);
    finishHandlers[0]();

    expect(req.id).toBe("request-123");
    expect(res.setHeader).toHaveBeenCalledWith("x-request-id", "request-123");
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        path: "/health",
        statusCode: 200,
      }),
      "Petición HTTP",
    );
  });

  test("errorHandler oculta errores internos y publica errores operacionales", () => {
    const logger = { warn: jest.fn(), error: jest.fn() };
    const req = { id: "r1", method: "GET", originalUrl: "/boom" };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    errorHandler(logger)(new Error("secreto"), req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: "Error interno del servidor",
    });

    const next = jest.fn();
    notFoundHandler({ method: "GET", originalUrl: "/missing" }, {}, next);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
});
