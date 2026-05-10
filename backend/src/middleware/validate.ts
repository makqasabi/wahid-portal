import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";

/**
 * Validates `req.body` against the provided Zod schema.
 * Returns 400 with structured error details on failure.
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
      return;
    }

    // Replace body with the parsed (and potentially transformed) data
    req.body = result.data;
    next();
  };
}

/**
 * Validates `req.query` against the provided Zod schema.
 * Returns 400 with structured error details on failure.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: "Validation failed",
        details: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
          code: issue.code,
        })),
      });
      return;
    }

    // Overwrite query with parsed values so downstream handlers get typed data
    (req as Request & { query: Record<string, unknown> }).query = result.data;
    next();
  };
}
