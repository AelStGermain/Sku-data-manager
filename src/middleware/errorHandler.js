import { AppError, NotFoundError } from "../errors/AppError.js";

export function notFoundHandler(req, _res, next) {
  next(
    new NotFoundError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`),
  );
}

export const errorHandler = (logger) => (error, req, res, _next) => {
  const isBodyParseError =
    error instanceof SyntaxError && error.status === 400 && "body" in error;
  const operational = error instanceof AppError;
  const statusCode = isBodyParseError
    ? 400
    : operational
      ? error.statusCode
      : 500;
  const publicMessage =
    statusCode === 500 && !operational
      ? "Error interno del servidor"
      : isBodyParseError
        ? "JSON inválido"
        : error.message;

  logger[statusCode >= 500 ? "error" : "warn"](
    {
      err: error,
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
    },
    "Petición fallida",
  );

  const response = {
    success: false,
    error: publicMessage,
    ...(operational && error.code ? { code: error.code } : {}),
    ...(operational && error.details ? { details: error.details } : {}),
  };
  res.status(statusCode).json(response);
};
