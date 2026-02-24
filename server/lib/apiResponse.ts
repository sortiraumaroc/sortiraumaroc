/**
 * Utilitaires de réponse API standardisées - SAM
 * Ce module fournit des fonctions pour envoyer des réponses cohérentes
 */

import type { Response } from "express";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("apiResponse");

// ============================================
// TYPES DE RÉPONSE
// ============================================

interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

interface PaginatedResponse<T = unknown> {
  ok: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// ============================================
// CODES D'ERREUR STANDARDISÉS
// ============================================

export const ERROR_CODES = {
  // Authentification
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID: "AUTH_INVALID",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  PERMISSION_DENIED: "PERMISSION_DENIED",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",
  INVALID_VALUE: "INVALID_VALUE",

  // Resources
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Rate limiting
  RATE_LIMITED: "RATE_LIMITED",

  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================
// FONCTIONS DE RÉPONSE
// ============================================

/**
 * Envoie une réponse de succès
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  const response: SuccessResponse<T> = { ok: true, data };
  res.status(status).json(response);
}

/**
 * Envoie une réponse de succès sans données (204 No Content)
 */
export function sendNoContent(res: Response): void {
  res.status(204).end();
}

/**
 * Envoie une réponse de création réussie (201 Created)
 */
export function sendCreated<T>(res: Response, data: T): void {
  sendSuccess(res, data, 201);
}

/**
 * Envoie une réponse paginée
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { total: number; limit: number; offset: number }
): void {
  const response: PaginatedResponse<T> = {
    ok: true,
    data,
    pagination: {
      ...pagination,
      hasMore: pagination.offset + data.length < pagination.total,
    },
  };
  res.status(200).json(response);
}

/**
 * Envoie une réponse d'erreur
 */
export function sendError(
  res: Response,
  message: string,
  status = 500,
  code?: ErrorCode,
  details?: unknown
): void {
  const response: ErrorResponse = { ok: false, error: message };
  if (code) response.code = code;
  if (details !== undefined) response.details = details;
  res.status(status).json(response);
}

// ============================================
// HELPERS POUR ERREURS COURANTES
// ============================================

export const errors = {
  /**
   * 400 Bad Request - Données invalides
   */
  badRequest: (res: Response, message: string, details?: unknown) =>
    sendError(res, message, 400, ERROR_CODES.VALIDATION_ERROR, details),

  /**
   * 400 Bad Request - Champ manquant
   */
  missingField: (res: Response, fieldName: string) =>
    sendError(res, `Champ requis manquant: ${fieldName}`, 400, ERROR_CODES.MISSING_FIELD, { field: fieldName }),

  /**
   * 400 Bad Request - Format invalide
   */
  invalidFormat: (res: Response, fieldName: string, expectedFormat?: string) =>
    sendError(
      res,
      `Format invalide pour: ${fieldName}${expectedFormat ? ` (attendu: ${expectedFormat})` : ""}`,
      400,
      ERROR_CODES.INVALID_FORMAT,
      { field: fieldName, expectedFormat }
    ),

  /**
   * 401 Unauthorized - Authentification requise
   */
  unauthorized: (res: Response, message = "Authentification requise") =>
    sendError(res, message, 401, ERROR_CODES.AUTH_REQUIRED),

  /**
   * 401 Unauthorized - Session expirée
   */
  sessionExpired: (res: Response, message = "Session expirée. Veuillez vous reconnecter.") =>
    sendError(res, message, 401, ERROR_CODES.AUTH_EXPIRED),

  /**
   * 403 Forbidden - Accès refusé
   */
  forbidden: (res: Response, message = "Accès refusé") =>
    sendError(res, message, 403, ERROR_CODES.PERMISSION_DENIED),

  /**
   * 404 Not Found - Ressource non trouvée
   */
  notFound: (res: Response, resource = "Ressource") =>
    sendError(res, `${resource} non trouvé(e)`, 404, ERROR_CODES.NOT_FOUND),

  /**
   * 409 Conflict - Conflit
   */
  conflict: (res: Response, message: string) =>
    sendError(res, message, 409, ERROR_CODES.CONFLICT),

  /**
   * 409 Conflict - Ressource existe déjà
   */
  alreadyExists: (res: Response, resource = "Ressource") =>
    sendError(res, `${resource} existe déjà`, 409, ERROR_CODES.ALREADY_EXISTS),

  /**
   * 422 Unprocessable Entity - Données invalides
   */
  unprocessable: (res: Response, message: string, details?: unknown) =>
    sendError(res, message, 422, ERROR_CODES.INVALID_VALUE, details),

  /**
   * 429 Too Many Requests - Rate limited
   */
  rateLimited: (res: Response, message = "Trop de requêtes. Veuillez patienter.") =>
    sendError(res, message, 429, ERROR_CODES.RATE_LIMITED),

  /**
   * 500 Internal Server Error - Erreur serveur
   */
  internal: (res: Response, error?: unknown) => {
    // Log l'erreur côté serveur
    if (error) {
      log.error({ err: error }, "Internal error");
    }
    sendError(res, "Erreur serveur interne", 500, ERROR_CODES.INTERNAL_ERROR);
  },

  /**
   * 500 Internal Server Error - Erreur base de données
   */
  database: (res: Response, error?: unknown) => {
    if (error) {
      log.error({ err: error }, "Database error");
    }
    sendError(res, "Erreur de base de données", 500, ERROR_CODES.DATABASE_ERROR);
  },

  /**
   * 502 Bad Gateway - Service externe en erreur
   */
  externalService: (res: Response, serviceName: string, error?: unknown) => {
    if (error) {
      log.error({ err: error, serviceName }, "External service error");
    }
    sendError(res, `Erreur du service externe: ${serviceName}`, 502, ERROR_CODES.EXTERNAL_SERVICE_ERROR);
  },

  /**
   * 503 Service Unavailable - Service indisponible
   */
  serviceUnavailable: (res: Response, message = "Service temporairement indisponible") =>
    sendError(res, message, 503, ERROR_CODES.SERVICE_UNAVAILABLE),
};

// ============================================
// UTILITAIRES
// ============================================

/**
 * Wrapper try-catch pour les handlers Express
 */
export function asyncHandler(
  handler: (req: any, res: Response) => Promise<void>
): (req: any, res: Response) => void {
  return (req, res) => {
    handler(req, res).catch((error) => {
      errors.internal(res, error);
    });
  };
}

/**
 * Vérifie si une réponse a déjà été envoyée
 */
export function isResponseSent(res: Response): boolean {
  return res.headersSent;
}
