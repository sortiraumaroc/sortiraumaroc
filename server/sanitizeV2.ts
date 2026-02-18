/**
 * Input Sanitization Utilities — Reservation V2
 *
 * Provides XSS-safe string sanitization and input validation helpers
 * for all V2 reservation endpoints. No external dependencies needed.
 */

// =============================================================================
// XSS / HTML sanitization
// =============================================================================

const DANGEROUS_PATTERNS = [
  /<script\b[^>]*>/gi,
  /<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,          // onclick=, onerror=, etc.
  /<iframe\b[^>]*>/gi,
  /<object\b[^>]*>/gi,
  /<embed\b[^>]*>/gi,
  /<link\b[^>]*>/gi,
  /<style\b[^>]*>/gi,
  /eval\s*\(/gi,
  /data:\s*text\/html/gi,
  /expression\s*\(/gi,
];

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
};

/**
 * Strip dangerous HTML/JS patterns and encode entities.
 * Use for user-provided text (reasons, messages, notes, etc.)
 */
export function sanitizeText(input: string, maxLength = 2000): string {
  if (!input || typeof input !== "string") return "";

  let sanitized = input.trim();

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Strip dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  // Encode HTML entities
  sanitized = sanitized.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char] ?? char);

  // Truncate
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitize for plain text (no HTML encoding, just strip dangerous content).
 * Use for fields that won't be rendered as HTML (e.g., DB-only fields).
 */
export function sanitizePlain(input: string, maxLength = 2000): string {
  if (!input || typeof input !== "string") return "";

  let sanitized = input.trim();
  sanitized = sanitized.replace(/\0/g, "");

  for (const pattern of DANGEROUS_PATTERNS) {
    sanitized = sanitized.replace(pattern, "");
  }

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

// =============================================================================
// Input validation helpers
// =============================================================================

/**
 * Validate and sanitize UUID (prevents SQL injection via ID fields).
 */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate ISO date string format (YYYY-MM-DD or full ISO).
 */
export function isValidDateStr(value: string): boolean {
  if (!value) return false;
  // Accept YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return !isNaN(new Date(value + "T00:00:00Z").getTime());
  }
  // Accept full ISO
  return !isNaN(new Date(value).getTime());
}

/**
 * Validate time string HH:MM
 */
export function isValidTimeStr(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

/**
 * Validate party size (1-15 for standard, up to 500 for quotes).
 */
export function isValidPartySize(value: number, forQuote = false): boolean {
  if (!Number.isInteger(value) || value < 1) return false;
  return forQuote ? value <= 500 : value <= 15;
}

/**
 * Validate establishment_id (UUID format required).
 */
export function validateEstablishmentId(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return isValidUUID(str) ? str : null;
}

/**
 * Validate reservation_id / dispute_id / quote_id (UUID format required).
 */
export function validateEntityId(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return isValidUUID(str) ? str : null;
}

/**
 * Validate and sanitize a payment type.
 */
export function validatePaymentType(value: unknown): "free" | "paid" | null {
  const str = String(value ?? "").trim().toLowerCase();
  if (str === "free" || str === "paid") return str;
  return null;
}

/**
 * Sanitize an object by sanitizing all string values recursively.
 * Use for meta/details objects.
 */
export function sanitizeObject(obj: unknown, maxDepth = 3): unknown {
  if (maxDepth <= 0) return null;
  if (typeof obj === "string") return sanitizePlain(obj, 500);
  if (typeof obj === "number" || typeof obj === "boolean" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.slice(0, 20).map((item) => sanitizeObject(item, maxDepth - 1));
  if (typeof obj === "object" && obj !== null) {
    const cleaned: Record<string, unknown> = {};
    const entries = Object.entries(obj as Record<string, unknown>);
    for (const [key, val] of entries.slice(0, 50)) {
      const cleanKey = sanitizePlain(key, 100);
      cleaned[cleanKey] = sanitizeObject(val, maxDepth - 1);
    }
    return cleaned;
  }
  return null;
}
