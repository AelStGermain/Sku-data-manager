export class AppError extends Error {
  constructor(
    message,
    { statusCode = 500, code = "INTERNAL_ERROR", details, cause } = {},
  ) {
    super(message, { cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
  }
}

export class ValidationError extends AppError {
  constructor(message, details) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR", details });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso no encontrado") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message) {
    super(message, { statusCode: 503, code: "SERVICE_UNAVAILABLE" });
  }
}
