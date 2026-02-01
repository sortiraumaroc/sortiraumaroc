/**
 * Classes d'erreur centralisées - SAM
 */

import { HTTP_STATUS, ERROR_MESSAGES } from "./utils";

/**
 * Erreur API de base
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly payload: unknown;
  public readonly code: string | null;

  constructor(
    message: string,
    status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    payload?: unknown,
    code?: string
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.code = code ?? null;

    // Maintient le prototype chain pour instanceof
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isAuthError(): boolean {
    return this.status === HTTP_STATUS.UNAUTHORIZED || this.status === HTTP_STATUS.FORBIDDEN;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  get isRateLimited(): boolean {
    return this.status === HTTP_STATUS.TOO_MANY_REQUESTS;
  }

  get isServiceUnavailable(): boolean {
    return this.status === HTTP_STATUS.SERVICE_UNAVAILABLE || this.status === HTTP_STATUS.GATEWAY_TIMEOUT;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
    };
  }
}

/**
 * Erreur API Consumer
 */
export class ConsumerApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown, code?: string) {
    super(message, status, payload, code);
    this.name = "ConsumerApiError";
  }
}

/**
 * Erreur API Pro
 */
export class ProApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown, code?: string) {
    super(message, status, payload, code);
    this.name = "ProApiError";
  }
}

/**
 * Erreur API Admin
 */
export class AdminApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown, code?: string) {
    super(message, status, payload, code);
    this.name = "AdminApiError";
  }
}

/**
 * Erreur API Publique
 */
export class PublicApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown, code?: string) {
    super(message, status, payload, code);
    this.name = "PublicApiError";
  }
}

/**
 * Contextes d'API supportés
 */
export type ApiContext = "consumer" | "pro" | "admin" | "public";

/**
 * Factory pour créer l'erreur appropriée selon le contexte
 */
export function createApiError(
  context: ApiContext,
  message: string,
  status?: number,
  payload?: unknown,
  code?: string
): ApiError {
  switch (context) {
    case "consumer":
      return new ConsumerApiError(message, status, payload, code);
    case "pro":
      return new ProApiError(message, status, payload, code);
    case "admin":
      return new AdminApiError(message, status, payload, code);
    case "public":
      return new PublicApiError(message, status, payload, code);
  }
}

/**
 * Crée une erreur d'authentification
 */
export function createAuthError(context: ApiContext): ApiError {
  const message =
    context === "pro"
      ? ERROR_MESSAGES.SESSION_EXPIRED_PRO
      : context === "admin"
        ? ERROR_MESSAGES.SESSION_EXPIRED_ADMIN
        : ERROR_MESSAGES.SESSION_EXPIRED_CONSUMER;

  return createApiError(context, message, HTTP_STATUS.UNAUTHORIZED, null, "AUTH_EXPIRED");
}

/**
 * Crée une erreur réseau
 */
export function createNetworkError(context: ApiContext): ApiError {
  return createApiError(context, ERROR_MESSAGES.NETWORK_ERROR, 0, null, "NETWORK_ERROR");
}

/**
 * Crée une erreur de service indisponible
 */
export function createServiceUnavailableError(context: ApiContext): ApiError {
  return createApiError(
    context,
    ERROR_MESSAGES.SERVICE_UNAVAILABLE,
    HTTP_STATUS.SERVICE_UNAVAILABLE,
    null,
    "SERVICE_UNAVAILABLE"
  );
}

/**
 * Crée une erreur de rate limiting
 */
export function createRateLimitError(context: ApiContext): ApiError {
  return createApiError(
    context,
    ERROR_MESSAGES.TOO_MANY_REQUESTS,
    HTTP_STATUS.TOO_MANY_REQUESTS,
    null,
    "RATE_LIMITED"
  );
}
