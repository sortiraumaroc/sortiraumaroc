/**
 * Server-side validation utilities
 *
 * SECURITY: These validators should be used for all user input validation
 */

/**
 * Robust email validation following RFC 5322 with practical restrictions
 *
 * This regex:
 * - Validates standard email format
 * - Prevents common injection patterns
 * - Allows international domain names
 * - Restricts dangerous characters
 */
const EMAIL_REGEX =
  /^(?=[a-zA-Z0-9@.!#$%&'*+/=?^_`{|}~-]{6,254}$)(?=[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@)[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:(?=[a-zA-Z0-9-]{1,63}\.)[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;

/**
 * Simple but effective email validation for most use cases
 */
const SIMPLE_EMAIL_REGEX = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-zA-Z]{2,}$/;

/**
 * Dangerous email patterns that could indicate injection attempts
 */
const DANGEROUS_EMAIL_PATTERNS = [
  /[<>]/,           // HTML injection
  /\r|\n/,          // Header injection (CRLF)
  /\0/,             // Null byte injection
  /\.{2,}/,         // Multiple consecutive dots (invalid)
  /^-|@-|-@|-$/,    // Starts/ends with hyphen in wrong places
  /`|'/,            // Backticks and single quotes (potential SQL/JS injection)
];

/**
 * Validate email address with security checks
 *
 * @param email - The email address to validate
 * @returns Object with validation result and sanitized email
 */
export function validateEmail(email: unknown): {
  valid: boolean;
  email: string | null;
  error?: string;
} {
  // Type check
  if (typeof email !== "string") {
    return { valid: false, email: null, error: "Email must be a string" };
  }

  // Trim and lowercase
  const sanitized = email.trim().toLowerCase();

  // Length check
  if (sanitized.length < 5) {
    return { valid: false, email: null, error: "Email too short" };
  }

  if (sanitized.length > 254) {
    return { valid: false, email: null, error: "Email too long" };
  }

  // Check for dangerous patterns (security)
  for (const pattern of DANGEROUS_EMAIL_PATTERNS) {
    if (pattern.test(sanitized)) {
      return { valid: false, email: null, error: "Invalid email format" };
    }
  }

  // Basic format validation
  if (!SIMPLE_EMAIL_REGEX.test(sanitized)) {
    return { valid: false, email: null, error: "Invalid email format" };
  }

  // Strict RFC validation (optional, for high-security contexts)
  // if (!EMAIL_REGEX.test(sanitized)) {
  //   return { valid: false, email: null, error: "Invalid email format" };
  // }

  // Check local part length (before @)
  const atIndex = sanitized.indexOf("@");
  if (atIndex > 64) {
    return { valid: false, email: null, error: "Email local part too long" };
  }

  // Additional domain validation
  const domain = sanitized.slice(atIndex + 1);
  if (domain.length > 255) {
    return { valid: false, email: null, error: "Email domain too long" };
  }

  // Check for valid TLD (at least 2 characters, only letters)
  const tld = domain.split(".").pop() || "";
  if (tld.length < 2 || !/^[a-z]+$/i.test(tld)) {
    return { valid: false, email: null, error: "Invalid email domain" };
  }

  return { valid: true, email: sanitized };
}

/**
 * Quick email validation (returns boolean only)
 */
export function isValidEmail(email: unknown): boolean {
  return validateEmail(email).valid;
}

/**
 * Validate and sanitize phone number (E.164 format)
 *
 * @param phone - The phone number to validate
 * @param defaultCountryCode - Default country code if not provided (e.g., "+212" for Morocco)
 * @returns Object with validation result and sanitized phone
 */
export function validatePhone(
  phone: unknown,
  defaultCountryCode: string = "+212"
): {
  valid: boolean;
  phone: string | null;
  error?: string;
} {
  if (typeof phone !== "string") {
    return { valid: false, phone: null, error: "Phone must be a string" };
  }

  // Remove all non-digit characters except +
  let sanitized = phone.replace(/[^\d+]/g, "");

  // If starts with 0, assume local number and add country code
  if (sanitized.startsWith("0")) {
    sanitized = defaultCountryCode + sanitized.slice(1);
  }

  // If doesn't start with +, add country code
  if (!sanitized.startsWith("+")) {
    // Check if it's a valid Moroccan number format (6 or 7 followed by 8 digits)
    if (/^[67]\d{8}$/.test(sanitized)) {
      sanitized = defaultCountryCode + sanitized;
    } else {
      sanitized = "+" + sanitized;
    }
  }

  // E.164 format validation: + followed by 10-15 digits
  if (!/^\+\d{10,15}$/.test(sanitized)) {
    return { valid: false, phone: null, error: "Invalid phone number format" };
  }

  return { valid: true, phone: sanitized };
}

/**
 * Quick phone validation (returns boolean only)
 */
export function isValidPhone(phone: unknown): boolean {
  return validatePhone(phone).valid;
}

/**
 * Sanitize string input to prevent XSS and injection attacks
 *
 * @param input - The string to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized string
 */
export function sanitizeString(input: unknown, maxLength: number = 1000): string {
  if (typeof input !== "string") return "";

  return input
    .trim()
    .slice(0, maxLength)
    // Remove null bytes
    .replace(/\0/g, "")
    // Escape HTML entities
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Validate UUID format
 */
export function isValidUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate ISO date string
 */
export function isValidIsoDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && value.includes("-");
}

/**
 * Validate that a date is in the future
 */
export function isFutureDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.getTime() > Date.now();
}

/**
 * Validate that a date is not too far in the past
 * (useful for preventing manipulation of booking dates)
 */
export function isRecentDate(value: unknown, maxDaysInPast: number = 1): boolean {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  if (isNaN(date.getTime())) return false;

  const cutoff = Date.now() - maxDaysInPast * 24 * 60 * 60 * 1000;
  return date.getTime() >= cutoff;
}
