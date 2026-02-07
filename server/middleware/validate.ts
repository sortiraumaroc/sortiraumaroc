/**
 * Validation Middleware - SAM
 *
 * Middleware de validation centralisé utilisant Zod.
 * Permet de valider les inputs des routes API de manière uniforme.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodError, ZodSchema } from "zod";

// ============================================
// TYPES
// ============================================

declare global {
  namespace Express {
    interface Request {
      /** Body validé et typé par Zod */
      validatedBody?: unknown;
      /** Query params validés et typés par Zod */
      validatedQuery?: unknown;
      /** Path params validés et typés par Zod */
      validatedParams?: unknown;
    }
  }
}

interface ValidationOptions {
  /** Si true, les erreurs détaillées sont retournées (défaut: false en prod) */
  exposeDetails?: boolean;
}

interface ValidationError {
  field: string;
  message: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Formate les erreurs Zod en un format lisible
 */
function formatZodErrors(error: ZodError): ValidationError[] {
  return error.errors.map((err) => ({
    field: err.path.join(".") || "body",
    message: err.message,
  }));
}

/**
 * Crée un message d'erreur générique (pour prod)
 */
function getGenericErrorMessage(errors: ValidationError[]): string {
  if (errors.length === 1) {
    const field = errors[0].field;
    if (field === "body") {
      return "Données invalides";
    }
    return `Le champ "${field}" est invalide`;
  }
  return `${errors.length} champs invalides`;
}

// ============================================
// MIDDLEWARE FACTORY
// ============================================

/**
 * Crée un middleware de validation pour le body de la requête
 *
 * @example
 * ```typescript
 * import { validateBody } from "../middleware/validate";
 * import { createReservationSchema } from "../schemas/reservation";
 *
 * router.post(
 *   "/reservations",
 *   validateBody(createReservationSchema),
 *   async (req, res) => {
 *     const data = req.validatedBody as CreateReservationInput;
 *     // data est typé et validé !
 *   }
 * );
 * ```
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  options: ValidationOptions = {}
): RequestHandler {
  const { exposeDetails = process.env.NODE_ENV !== "production" } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      const message = exposeDetails
        ? errors.map((e) => `${e.field}: ${e.message}`).join(", ")
        : getGenericErrorMessage(errors);

      res.status(400).json({
        error: message,
        ...(exposeDetails && { details: errors }),
      });
      return;
    }

    req.validatedBody = result.data;
    next();
  };
}

/**
 * Crée un middleware de validation pour les query params
 */
export function validateQuery<T extends ZodSchema>(
  schema: T,
  options: ValidationOptions = {}
): RequestHandler {
  const { exposeDetails = process.env.NODE_ENV !== "production" } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      const message = exposeDetails
        ? errors.map((e) => `${e.field}: ${e.message}`).join(", ")
        : getGenericErrorMessage(errors);

      res.status(400).json({
        error: message,
        ...(exposeDetails && { details: errors }),
      });
      return;
    }

    req.validatedQuery = result.data;
    next();
  };
}

/**
 * Crée un middleware de validation pour les path params
 */
export function validateParams<T extends ZodSchema>(
  schema: T,
  options: ValidationOptions = {}
): RequestHandler {
  const { exposeDetails = process.env.NODE_ENV !== "production" } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      const message = exposeDetails
        ? errors.map((e) => `${e.field}: ${e.message}`).join(", ")
        : getGenericErrorMessage(errors);

      res.status(400).json({
        error: message,
        ...(exposeDetails && { details: errors }),
      });
      return;
    }

    req.validatedParams = result.data;
    next();
  };
}

/**
 * Validation combinée body + query + params
 */
export function validate<
  TBody extends ZodSchema = ZodSchema,
  TQuery extends ZodSchema = ZodSchema,
  TParams extends ZodSchema = ZodSchema
>(
  schemas: {
    body?: TBody;
    query?: TQuery;
    params?: TParams;
  },
  options: ValidationOptions = {}
): RequestHandler {
  const { exposeDetails = process.env.NODE_ENV !== "production" } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const allErrors: ValidationError[] = [];

    // Valider body
    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error).map((e) => ({
          ...e,
          field: `body.${e.field}`.replace("body.body", "body"),
        })));
      } else {
        req.validatedBody = result.data;
      }
    }

    // Valider query
    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error).map((e) => ({
          ...e,
          field: `query.${e.field}`,
        })));
      } else {
        req.validatedQuery = result.data;
      }
    }

    // Valider params
    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        allErrors.push(...formatZodErrors(result.error).map((e) => ({
          ...e,
          field: `params.${e.field}`,
        })));
      } else {
        req.validatedParams = result.data;
      }
    }

    if (allErrors.length > 0) {
      const message = exposeDetails
        ? allErrors.map((e) => `${e.field}: ${e.message}`).join(", ")
        : getGenericErrorMessage(allErrors);

      res.status(400).json({
        error: message,
        ...(exposeDetails && { details: allErrors }),
      });
      return;
    }

    next();
  };
}
