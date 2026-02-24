import crypto from "node:crypto";

const COOKIE_NAME = "sam_admin_session";

export type AdminSessionPayload = {
  v: 1;
  exp: number;
  sub?: string;
  collaborator_id?: string;
  role?: string;
  name?: string;
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecodeToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, "base64");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getAdminSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_API_KEY;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET or ADMIN_API_KEY is missing");
  return secret;
}

export function createAdminSessionToken(payload: AdminSessionPayload): string {
  const secret = getAdminSessionSecret();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(Buffer.from(payloadJson, "utf8"));
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  const sigB64 = base64UrlEncode(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  const secret = getAdminSessionSecret();
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;

  let sigProvided: Buffer;
  try {
    sigProvided = base64UrlDecodeToBuffer(sigB64);
  } catch { /* intentional: invalid base64 signature */
    return null;
  }

  const sigExpected = crypto.createHmac("sha256", secret).update(payloadB64).digest();
  if (!timingSafeEqual(sigProvided, sigExpected)) return null;

  let payload: AdminSessionPayload;
  try {
    const raw = base64UrlDecodeToBuffer(payloadB64).toString("utf8");
    payload = JSON.parse(raw) as AdminSessionPayload;
  } catch { /* intentional: invalid JSON in session token */
    return null;
  }

  if (!payload || payload.v !== 1 || typeof payload.exp !== "number") return null;
  if (Date.now() / 1000 >= payload.exp) return null;

  return payload;
}

export function getSessionCookieName(): string {
  return COOKIE_NAME;
}

export function buildSetCookieHeader(args: {
  name: string;
  value: string;
  maxAgeSeconds?: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Lax" | "Strict" | "None";
  path?: string;
}): string {
  const parts: string[] = [];
  parts.push(`${args.name}=${encodeURIComponent(args.value)}`);
  parts.push(`Path=${args.path ?? "/"}`);
  if (typeof args.maxAgeSeconds === "number") parts.push(`Max-Age=${Math.max(0, Math.floor(args.maxAgeSeconds))}`);
  if (args.httpOnly) parts.push("HttpOnly");
  parts.push(`SameSite=${args.sameSite}`);
  if (args.secure) parts.push("Secure");
  return parts.join("; ");
}

function headerValue(headers: Record<string, unknown>, name: string): string | null {
  const v = headers[name];
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch { /* intentional: invalid URL */
    return false;
  }
}

export function isRequestSecure(req: { secure?: boolean; headers: Record<string, unknown> }): boolean {
  if (req.secure) return true;

  const xfProto = headerValue(req.headers, "x-forwarded-proto");
  if (xfProto && xfProto.toLowerCase().includes("https")) return true;

  const origin = headerValue(req.headers, "origin");
  if (origin && isHttpsUrl(origin)) return true;

  const referer = headerValue(req.headers, "referer");
  if (referer && isHttpsUrl(referer)) return true;

  return false;
}
