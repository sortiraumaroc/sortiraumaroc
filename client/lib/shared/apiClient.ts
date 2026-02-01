/**
 * Client API de base - SAM
 * Centralise la logique de requêtes HTTP
 */

import { extractErrorMessage, ERROR_MESSAGES, HTTP_STATUS, isRecord } from "./utils";
import {
  ApiError,
  createApiError,
  createNetworkError,
  createServiceUnavailableError,
  type ApiContext,
} from "./errors";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

interface ApiRequestOptions extends RequestOptions {
  context: ApiContext;
  token?: string | null;
}

/**
 * Client API générique
 */
export async function apiRequest<T = unknown>(url: string, options: ApiRequestOptions): Promise<T> {
  const { context, token, body, headers: customHeaders, ...init } = options;

  // Construction des headers
  const headers: Record<string, string> = {
    ...(customHeaders as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    throw createNetworkError(context);
  }

  // Parse response
  let payload: unknown = null;
  const contentType = res.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      payload = await res.json();
    } else {
      payload = await res.text();
    }
  } catch {
    payload = null;
  }

  // Handle errors
  if (!res.ok) {
    // Service unavailable
    if (res.status === HTTP_STATUS.SERVICE_UNAVAILABLE || res.status === HTTP_STATUS.GATEWAY_TIMEOUT) {
      throw createServiceUnavailableError(context);
    }

    // Rate limited
    if (res.status === HTTP_STATUS.TOO_MANY_REQUESTS) {
      throw createApiError(
        context,
        ERROR_MESSAGES.TOO_MANY_REQUESTS,
        res.status,
        payload,
        "RATE_LIMITED"
      );
    }

    // Extract error message from payload
    const errorMsg = extractErrorMessage(payload) || ERROR_MESSAGES.UNKNOWN_ERROR;

    // Determine error code from status
    let code: string | undefined;
    if (res.status === HTTP_STATUS.UNAUTHORIZED) {
      code = "AUTH_REQUIRED";
    } else if (res.status === HTTP_STATUS.FORBIDDEN) {
      code = "FORBIDDEN";
    } else if (res.status === HTTP_STATUS.NOT_FOUND) {
      code = "NOT_FOUND";
    } else if (res.status === HTTP_STATUS.BAD_REQUEST) {
      code = "BAD_REQUEST";
    }

    throw createApiError(context, errorMsg, res.status, payload, code);
  }

  return payload as T;
}

/**
 * Interface de réponse standard
 */
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

/**
 * Interface de réponse paginée
 */
export interface PaginatedResponse<T = unknown> {
  ok: boolean;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

/**
 * Helper pour les requêtes Consumer
 */
export const consumerApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "consumer", token, method: "GET" }),

  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "consumer", token, method: "POST", body }),

  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "consumer", token, method: "PUT", body }),

  patch: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "consumer", token, method: "PATCH", body }),

  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "consumer", token, method: "DELETE" }),
};

/**
 * Helper pour les requêtes Pro
 */
export const proApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "pro", token, method: "GET" }),

  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "pro", token, method: "POST", body }),

  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "pro", token, method: "PUT", body }),

  patch: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "pro", token, method: "PATCH", body }),

  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "pro", token, method: "DELETE" }),
};

/**
 * Helper pour les requêtes Admin
 */
export const adminApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "admin", token, method: "GET" }),

  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "admin", token, method: "POST", body }),

  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "admin", token, method: "PUT", body }),

  patch: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "admin", token, method: "PATCH", body }),

  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "admin", token, method: "DELETE" }),
};

/**
 * Helper pour les requêtes Publiques (sans authentification)
 */
export const publicApi = {
  get: <T>(url: string) => apiRequest<T>(url, { context: "public", method: "GET" }),

  post: <T>(url: string, body: unknown) =>
    apiRequest<T>(url, { context: "public", method: "POST", body }),
};
