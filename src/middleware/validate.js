import { ValidationError } from "../errors/AppError.js";

export const validate =
  (schema, source = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return next(new ValidationError("Datos de entrada inválidos", details));
    }
    req.validated ||= {};
    req.validated[source] = result.data;
    return next();
  };
