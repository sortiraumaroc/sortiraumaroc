/**
 * Zod Validation Middleware for Express Routes
 *
 * Provides a generic middleware factory that validates request body, query,
 * and params against Zod schemas. Returns 400 with structured error details
 * on validation failure.
 *
 * Usage:
 *   import { validate, zBody, zQuery, zParams } from "../lib/validate";
 *   import { z } from "zod";
 *
 *   const CreateReservationSchema = z.object({
 *     establishmentId: z.string().uuid(),
 *     date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 *     people: z.number().int().min(1).max(50),
 *   });
 *
 *   app.post("/api/reservations",
 *     validate({ body: CreateReservationSchema }),
 *     createReservationHandler,
 *   );
 *
 *   // Or inline:
 *   app.post("/api/reservations",
 *     zBody(CreateReservationSchema),
 *     createReservationHandler,
 *   );
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z, type ZodSchema, ZodError } from "zod";

// =============================================================================
// Types
// =============================================================================

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

export interface ValidationErrorResponse {
  error: string;
  details: Array<{
    path: string;
    message: string;
  }>;
}

// =============================================================================
// Main validate middleware
// =============================================================================

/**
 * Express middleware factory that validates request data against Zod schemas.
 *
 * On success: attaches parsed (coerced/transformed) data to req.body/query/params.
 * On failure: returns 400 with structured error details.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        // Express may define req.query as a getter-only property;
        // Object.defineProperty safely overrides it with the parsed value.
        Object.defineProperty(req, "query", {
          value: parsed,
          writable: true,
          configurable: true,
        });
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        }));

        res.status(400).json({
          error: "Données invalides",
          details,
        } satisfies ValidationErrorResponse);
        return;
      }

      // Unexpected error — let Express error handler deal with it
      next(err);
    }
  };
}

// =============================================================================
// Shorthand helpers
// =============================================================================

/**
 * Validate only request body.
 * @example app.post("/api/foo", zBody(FooSchema), handler);
 */
export function zBody<T extends ZodSchema>(schema: T): RequestHandler {
  return validate({ body: schema });
}

/**
 * Validate only query parameters.
 * @example app.get("/api/foo", zQuery(FooQuerySchema), handler);
 */
export function zQuery<T extends ZodSchema>(schema: T): RequestHandler {
  return validate({ query: schema });
}

/**
 * Validate only route params.
 * @example app.get("/api/foo/:id", zParams(FooParamsSchema), handler);
 */
export function zParams<T extends ZodSchema>(schema: T): RequestHandler {
  return validate({ params: schema });
}

// =============================================================================
// Common reusable schemas
// =============================================================================

/** UUID v4 string */
export const zUuid = z.string().uuid("ID invalide");

/** Positive integer (from string or number) */
export const zPositiveInt = z.coerce.number().int().positive();

/** ISO date string (YYYY-MM-DD) */
export const zIsoDate = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "Format de date invalide (attendu: YYYY-MM-DD)",
);

/** ISO datetime string */
export const zIsoDateTime = z.string().datetime({ message: "Format de date/heure invalide" });

/** Email address */
export const zEmail = z.string().trim().toLowerCase().email("Adresse email invalide");

/** Phone number (basic international format) */
export const zPhone = z.string().regex(
  /^\+?[\d\s\-().]{6,20}$/,
  "Numéro de téléphone invalide",
);

/** Non-empty trimmed string */
export const zNonEmptyString = z.string().trim().min(1, "Ce champ est requis");

/** Pagination params (query string) */
export const zPagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});

/** Standard ID param */
export const zIdParam = z.object({
  id: zUuid,
});

export { z } from "zod";
