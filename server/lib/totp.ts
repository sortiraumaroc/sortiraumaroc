/**
 * TOTP (Time-based One-Time Password) Library
 * Implements RFC 6238 for dynamic QR codes
 *
 * Used for secure, time-limited QR codes that change every 30 seconds
 */

import * as crypto from "crypto";

// ============================================================================
// Types
// ============================================================================

export interface TOTPConfig {
  /** Base32 encoded secret */
  secret: string;
  /** Algorithm (SHA1, SHA256, SHA512) */
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  /** Number of digits in the OTP */
  digits?: number;
  /** Time step in seconds */
  period?: number;
  /** Number of periods to check before/after current (for clock drift) */
  window?: number;
}

export interface TOTPValidationResult {
  valid: boolean;
  /** Which time window matched (-1 = previous, 0 = current, 1 = next) */
  timeWindow?: number;
  /** The expected code at current time */
  expectedCode?: string;
  /** Reason for failure */
  reason?: string;
}

export interface DynamicQRPayload {
  /** Reservation ID */
  rid: string;
  /** TOTP code (6 digits) */
  code: string;
  /** Timestamp when generated (Unix seconds) */
  ts: number;
  /** Version for future compatibility */
  v: number;
}

// ============================================================================
// Constants
// ============================================================================

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;
const DEFAULT_ALGORITHM = "SHA1";
const DEFAULT_WINDOW = 1; // Check ±1 period for clock drift

// ============================================================================
// Base32 Encoding/Decoding
// ============================================================================

/**
 * Decode a Base32 string to a Buffer
 */
function base32Decode(encoded: string): Buffer {
  // Remove padding and convert to uppercase
  const str = encoded.replace(/=+$/, "").toUpperCase();

  let bits = "";
  for (const char of str) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    bits += val.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }

  return Buffer.from(bytes);
}

/**
 * Generate a random Base32 secret
 */
export function generateSecret(length = 20): string {
  const bytes = crypto.randomBytes(length);
  let result = "";

  // Convert bytes to base32
  let bits = "";
  for (const byte of bytes) {
    bits += byte.toString(2).padStart(8, "0");
  }

  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const val = parseInt(bits.slice(i, i + 5), 2);
    result += BASE32_ALPHABET[val];
  }

  return result;
}

// ============================================================================
// TOTP Core Functions
// ============================================================================

/**
 * Generate HMAC-based OTP for a given counter
 */
function generateHOTP(
  secret: Buffer,
  counter: bigint,
  digits: number,
  algorithm: string
): string {
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(counter);

  // Map algorithm names
  const algoMap: Record<string, string> = {
    SHA1: "sha1",
    SHA256: "sha256",
    SHA512: "sha512",
  };

  const algo = algoMap[algorithm] || "sha1";

  // Calculate HMAC
  const hmac = crypto.createHmac(algo, secret);
  hmac.update(counterBuffer);
  const hash = hmac.digest();

  // Dynamic truncation (RFC 4226)
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  // Generate OTP
  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Generate a TOTP code for the current time
 */
export function generateTOTP(config: TOTPConfig): string {
  const {
    secret,
    algorithm = DEFAULT_ALGORITHM,
    digits = DEFAULT_DIGITS,
    period = DEFAULT_PERIOD,
  } = config;

  const secretBuffer = base32Decode(secret);
  const counter = BigInt(Math.floor(Date.now() / 1000 / period));

  return generateHOTP(secretBuffer, counter, digits, algorithm);
}

/**
 * Generate TOTP for a specific timestamp
 */
export function generateTOTPAt(config: TOTPConfig, timestamp: number): string {
  const {
    secret,
    algorithm = DEFAULT_ALGORITHM,
    digits = DEFAULT_DIGITS,
    period = DEFAULT_PERIOD,
  } = config;

  const secretBuffer = base32Decode(secret);
  const counter = BigInt(Math.floor(timestamp / 1000 / period));

  return generateHOTP(secretBuffer, counter, digits, algorithm);
}

/**
 * Validate a TOTP code
 */
export function validateTOTP(
  code: string,
  config: TOTPConfig
): TOTPValidationResult {
  const {
    secret,
    algorithm = DEFAULT_ALGORITHM,
    digits = DEFAULT_DIGITS,
    period = DEFAULT_PERIOD,
    window = DEFAULT_WINDOW,
  } = config;

  // Validate code format
  if (!code || code.length !== digits || !/^\d+$/.test(code)) {
    return {
      valid: false,
      reason: "invalid_format",
    };
  }

  const secretBuffer = base32Decode(secret);
  const currentCounter = BigInt(Math.floor(Date.now() / 1000 / period));

  // Check current time and window
  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + BigInt(i);
    const expectedCode = generateHOTP(secretBuffer, counter, digits, algorithm);

    if (code === expectedCode) {
      return {
        valid: true,
        timeWindow: i,
        expectedCode,
      };
    }
  }

  // Not valid
  const expectedCode = generateHOTP(
    secretBuffer,
    currentCounter,
    digits,
    algorithm
  );

  return {
    valid: false,
    reason: "invalid_code",
    expectedCode,
  };
}

// ============================================================================
// Dynamic QR Code Functions
// ============================================================================

/**
 * Generate a dynamic QR code payload
 * Format: SAM:{reservationId}:{totpCode}:{timestamp}
 */
export function generateDynamicQRPayload(
  reservationId: string,
  secret: string
): DynamicQRPayload {
  const code = generateTOTP({ secret });
  const ts = Math.floor(Date.now() / 1000);

  return {
    rid: reservationId,
    code,
    ts,
    v: 1,
  };
}

/**
 * Encode payload to QR string
 * Format: SAM:v1:{reservationId}:{totpCode}:{timestamp}
 */
export function encodeQRPayload(payload: DynamicQRPayload): string {
  return `SAM:v${payload.v}:${payload.rid}:${payload.code}:${payload.ts}`;
}

/**
 * Decode QR string to payload
 */
export function decodeQRPayload(qrString: string): DynamicQRPayload | null {
  // Support both formats:
  // New: SAM:v1:{rid}:{code}:{ts}
  // Legacy: Just the booking reference (e.g., SAM-1234)

  const trimmed = qrString.trim();

  // Check for new dynamic format
  if (trimmed.startsWith("SAM:v")) {
    const parts = trimmed.split(":");
    if (parts.length >= 5) {
      const version = parseInt(parts[1].replace("v", ""), 10);
      return {
        v: version,
        rid: parts[2],
        code: parts[3],
        ts: parseInt(parts[4], 10),
      };
    }
  }

  // Legacy format - return null (will be handled differently)
  return null;
}

/**
 * Check if a QR payload is still within valid time window
 * (prevents replay attacks with old screenshots)
 */
export function isPayloadFresh(
  payload: DynamicQRPayload,
  maxAgeSeconds = 60
): boolean {
  const now = Math.floor(Date.now() / 1000);
  const age = now - payload.ts;
  return age >= 0 && age <= maxAgeSeconds;
}

/**
 * Validate a complete dynamic QR code
 */
export function validateDynamicQR(
  qrString: string,
  secret: string,
  options: {
    maxAgeSeconds?: number;
    window?: number;
  } = {}
): TOTPValidationResult & { payload?: DynamicQRPayload; isLegacy?: boolean } {
  const { maxAgeSeconds = 90, window = 1 } = options;

  const payload = decodeQRPayload(qrString);

  // If not a dynamic QR, it might be legacy
  if (!payload) {
    return {
      valid: false,
      reason: "legacy_format",
      isLegacy: true,
    };
  }

  // Check if payload is fresh (not a replay)
  if (!isPayloadFresh(payload, maxAgeSeconds)) {
    return {
      valid: false,
      reason: "expired",
      payload,
    };
  }

  // Validate the TOTP code
  const result = validateTOTP(payload.code, {
    secret,
    window,
  });

  return {
    ...result,
    payload,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get seconds until next TOTP period
 */
export function getSecondsUntilNextPeriod(period = DEFAULT_PERIOD): number {
  const now = Date.now() / 1000;
  const currentPeriodStart = Math.floor(now / period) * period;
  const nextPeriodStart = currentPeriodStart + period;
  return Math.ceil(nextPeriodStart - now);
}

/**
 * Get current period start timestamp
 */
export function getCurrentPeriodStart(period = DEFAULT_PERIOD): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / period) * period;
}

/**
 * Generate a URI for authenticator apps (otpauth://)
 * This can be used to let users add the code to Google Authenticator, etc.
 */
export function generateOTPAuthURI(
  secret: string,
  options: {
    issuer?: string;
    accountName?: string;
    algorithm?: string;
    digits?: number;
    period?: number;
  } = {}
): string {
  const {
    issuer = "Sortir au Maroc",
    accountName = "Reservation",
    algorithm = "SHA1",
    digits = 6,
    period = 30,
  } = options;

  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm,
    digits: digits.toString(),
    period: period.toString(),
  });

  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(accountName);

  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?${params.toString()}`;
}
