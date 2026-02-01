/**
 * Exports centralisés - Sortir Au Maroc (SAM) Shared Utilities
 */

// Utilitaires de base
export {
  // Type guards
  isRecord,
  isObject,

  // Error handling
  extractErrorMessage,
  ERROR_MESSAGES,

  // String utilities
  asString,
  asOptionalString,
  asInt,
  asFloat,
  asBool,
  clamp,

  // Validation
  isEmail,
  isPhone,
  isUuid,

  // Pagination
  PAGINATION,
  normalizeLimit,
  normalizeOffset,

  // HTTP
  HTTP_STATUS,

  // Defaults
  DEFAULTS,

  // Date utilities
  formatDateFr,
  formatDateShortFr,

  // Types
  type SupportedCurrency,
  type SupportedLocale,
} from "./utils";

// Erreurs
export {
  ApiError,
  ConsumerApiError,
  ProApiError,
  AdminApiError,
  PublicApiError,
  createApiError,
  createAuthError,
  createNetworkError,
  createServiceUnavailableError,
  createRateLimitError,
  type ApiContext,
} from "./errors";

// Client API
export {
  apiRequest,
  consumerApi,
  proApi,
  adminApi,
  publicApi,
  type ApiResponse,
  type PaginatedResponse,
} from "./apiClient";
