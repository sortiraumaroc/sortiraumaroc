/**
 * TOTP Client Library
 * Generates time-based one-time passwords for dynamic QR codes
 *
 * This runs entirely client-side once the secret is obtained from the server
 */

// ============================================================================
// Types
// ============================================================================

export interface TOTPConfig {
  /** Base32 encoded secret */
  secret: string;
  /** Algorithm (SHA1, SHA256, SHA512) - default: SHA1 */
  algorithm?: "SHA1" | "SHA256" | "SHA512";
  /** Number of digits in the OTP - default: 6 */
  digits?: number;
  /** Time step in seconds - default: 30 */
  period?: number;
}

export interface DynamicQRData {
  /** Reservation ID */
  reservationId: string;
  /** Current TOTP code */
  code: string;
  /** Full QR string */
  qrString: string;
  /** Seconds until code expires */
  expiresIn: number;
  /** Period in seconds */
  period: number;
}

// ============================================================================
// Constants
// ============================================================================

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_DIGITS = 6;
const DEFAULT_PERIOD = 30;

// ============================================================================
// Base32 Decoding
// ============================================================================

/**
 * Decode a Base32 string to a Uint8Array
 */
function base32Decode(encoded: string): Uint8Array {
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

  return new Uint8Array(bytes);
}

// ============================================================================
// HMAC-SHA1 Implementation (Web Crypto API)
// ============================================================================

/**
 * Generate HMAC using Web Crypto API
 */
async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
  return new Uint8Array(signature);
}

// ============================================================================
// TOTP Generation
// ============================================================================

/**
 * Convert a number to an 8-byte big-endian buffer
 */
function numberToBuffer(num: number): Uint8Array {
  const buffer = new Uint8Array(8);
  let n = num;
  for (let i = 7; i >= 0; i--) {
    buffer[i] = n & 0xff;
    n = Math.floor(n / 256);
  }
  return buffer;
}

/**
 * Generate HOTP for a given counter
 */
async function generateHOTP(
  secret: Uint8Array,
  counter: number,
  digits: number
): Promise<string> {
  const counterBuffer = numberToBuffer(counter);
  const hash = await hmacSha1(secret, counterBuffer);

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, "0");
}

/**
 * Generate a TOTP code for the current time
 */
export async function generateTOTP(config: TOTPConfig): Promise<string> {
  const { secret, digits = DEFAULT_DIGITS, period = DEFAULT_PERIOD } = config;

  const secretBytes = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / period);

  return generateHOTP(secretBytes, counter, digits);
}

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

// ============================================================================
// QR Code Payload
// ============================================================================

/**
 * Encode a dynamic QR payload
 * Format: SAM:v1:{reservationId}:{totpCode}:{timestamp}
 */
export function encodeQRPayload(
  reservationId: string,
  code: string
): string {
  const ts = Math.floor(Date.now() / 1000);
  return `SAM:v1:${reservationId}:${code}:${ts}`;
}

/**
 * Generate complete dynamic QR data
 */
export async function generateDynamicQR(
  reservationId: string,
  secret: string,
  period = DEFAULT_PERIOD
): Promise<DynamicQRData> {
  const code = await generateTOTP({ secret, period });
  const qrString = encodeQRPayload(reservationId, code);
  const expiresIn = getSecondsUntilNextPeriod(period);

  return {
    reservationId,
    code,
    qrString,
    expiresIn,
    period,
  };
}

// ============================================================================
// API Client Functions
// ============================================================================

export interface TOTPSecretResponse {
  ok: boolean;
  reservationId: string;
  bookingReference?: string;
  secret: string;
  algorithm: string;
  digits: number;
  period: number;
  secondsRemaining: number;
}

export interface TOTPCodeResponse {
  ok: boolean;
  code: string;
  qrString: string;
  reservationId: string;
  bookingReference?: string;
  expiresIn: number;
  period: number;
}

/**
 * Fetch TOTP secret for a reservation from the server
 */
export async function fetchTOTPSecret(
  reservationId: string
): Promise<TOTPSecretResponse | null> {
  try {
    const response = await fetch(`/api/totp/secret/${reservationId}`);
    if (!response.ok) {
      console.warn("[totp] Failed to fetch secret:", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("[totp] Error fetching secret:", error);
    return null;
  }
}

/**
 * Fetch current TOTP code from server (fallback if client-side fails)
 */
export async function fetchTOTPCode(
  reservationId: string
): Promise<TOTPCodeResponse | null> {
  try {
    const response = await fetch(`/api/totp/code/${reservationId}`);
    if (!response.ok) {
      console.warn("[totp] Failed to fetch code:", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("[totp] Error fetching code:", error);
    return null;
  }
}

/**
 * Regenerate TOTP secret (if compromised)
 */
export async function regenerateTOTPSecret(
  reservationId: string
): Promise<TOTPSecretResponse | null> {
  try {
    const response = await fetch(`/api/totp/regenerate/${reservationId}`, {
      method: "POST",
    });
    if (!response.ok) {
      console.warn("[totp] Failed to regenerate secret:", response.status);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("[totp] Error regenerating secret:", error);
    return null;
  }
}
