import { ValidationError } from "../errors/AppError.js";

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function assertSafe(value, path = "input", seen = new WeakSet()) {
  if (typeof value === "string" && value.includes("\0")) {
    throw new ValidationError(`Caracteres no permitidos en ${path}`);
  }
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key))
      throw new ValidationError(`Propiedad no permitida: ${key}`);
    assertSafe(value[key], `${path}.${key}`, seen);
  }
}

export function sanitizeInput(req, _res, next) {
  try {
    assertSafe(req.body, "body");
    assertSafe(req.query, "query");
    assertSafe(req.params, "params");
    next();
  } catch (error) {
    next(error);
  }
}
