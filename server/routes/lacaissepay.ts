/**
 * LacaissePay Payment Integration - Sortir Au Maroc
 *
 * - Session creation: POST /api/payments/lacaissepay/session
 * - Webhook handler: handled in payments.ts (unified webhook)
 *
 * Webhook payload example:
 * {
 *   "OperationStatus": 2,        // 2 = SUCCESS
 *   "ExternalId": "ORDER_...",   // externalReference we sent
 *   "OperationId": "...",        // LacaissePay transaction ID
 *   "Amount": 999.5,             // amount in MAD
 *   "GatewayTrackId": "...",
 *   "GatewayOrderId": "...",
 *   "GatewayReferenceId": "...",
 *   "CreatedAt": "2024-01-21..."
 * }
 */

import type { Request, Response } from "express";
import type { Express } from "express";
import { sendSuccess, errors } from "../lib/apiResponse";
import { paymentRateLimiter } from "../middleware/rateLimiter";
import { validateEmail, validatePhone } from "../lib/validation";
import { resilientFetch } from "../lib/resilientFetch";
import { createModuleLogger } from "../lib/logger";
import { zBody } from "../lib/validate";
import { CreateLacaissePaySessionSchema } from "../schemas/lacaissepayRoutes";

const log = createModuleLogger("lacaissepay");

// Re-export du rate limiter pour l'utiliser dans le router
export { paymentRateLimiter };

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asString(value: unknown): string | null {
  const s = safeTrim(value);
  return s || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isProduction(): boolean {
  const env = safeTrim(process.env.NODE_ENV).toLowerCase();
  return env === "production" || env === "prod";
}

function getLacaissePaySessionUrl(): string {
  // Permettre de forcer l'endpoint via variable d'environnement
  const forcedUrl = safeTrim(process.env.LACAISSEPAY_SESSION_URL);
  if (forcedUrl) {
    log.info({ url: forcedUrl }, "Using forced endpoint from LACAISSEPAY_SESSION_URL");
    return forcedUrl;
  }

  // Sinon, utiliser la logique normale (PROD vs DEV)
  const isProd = isProduction();
  const url = process.env.LACAISSEPAY_SESSION_URL; // DEV endpoint

  log.info({ env: isProd ? "PRODUCTION" : "DEVELOPMENT", url }, "LacaissePay endpoint resolved");

  return url;
}

function expectedWebhookKey(): string {
  // Prefer a dedicated secret, but keep ADMIN_API_KEY as fallback for dev environments.
  return (
    process.env.PAYMENTS_WEBHOOK_KEY ||
    process.env.ADMIN_API_KEY ||
    ""
  ).trim();
}

function buildNotificationUrl(args: {
  acceptUrl: string;
  fallback: string | null;
}): string | null {
  const expected = expectedWebhookKey();
  const acceptUrl = safeTrim(args.acceptUrl);

  try {
    const origin = acceptUrl ? new URL(acceptUrl).origin : "";
    if (origin && expected) {
      return `${origin}/api/payments/webhook?webhook_key=${encodeURIComponent(expected)}`;
    }
  } catch { /* intentional: URL may be invalid */
  }

  // Fallback to whatever the client sent, if any.
  const fb = safeTrim(args.fallback);
  return fb || null;
}

function getLacaissePayCheckoutBaseUrl(): string {
  // If you want to override explicitly, set VITE_LACAISSEPAY_CHECKOUT_URL for client; server falls back to env + NODE_ENV.
  const env = safeTrim(process.env.VITE_LACAISSEPAY_CHECKOUT_URL);
  if (env) return env;
  return isProduction()
    ? "https://pay.lacaissepay.ma"
    : "https://paydev.lacaissepay.ma";
}

export function buildLacaissePayCheckoutUrlServer(args: {
  sessionId: string;
  sessionToken: string;
  config: Record<string, unknown>;
}): string {
  const baseUrl = getLacaissePayCheckoutBaseUrl();

  const configBase64 = Buffer.from(
    JSON.stringify(args.config),
    "utf8",
  ).toString("base64");

  const params = new URLSearchParams({
    sessionId: args.sessionId,
    token: args.sessionToken,
    config: configBase64,
  });

  return `${baseUrl}?${params.toString()}`;
}

export async function createLacaissePaySessionInternal(args: {
  orderId: string;
  externalReference: string;
  amountMad: number;
  customerEmail: string;
  customerPhone: string;
  customerFirstName: string;
  customerLastName: string;
  acceptUrl: string;
  declineUrl: string;
  notificationUrl: string;
  companyName: string;
}): Promise<{
  sessionId: string;
  sessionToken: string;
  externalReference: string;
}> {
  const orderId = safeTrim(args.orderId);
  const externalReference = safeTrim(args.externalReference);
  const amountMad =
    typeof args.amountMad === "number" && Number.isFinite(args.amountMad)
      ? args.amountMad
      : 0;

  const customerEmail = safeTrim(args.customerEmail);
  const customerPhone = safeTrim(args.customerPhone);
  const customerFirstName = safeTrim(args.customerFirstName) || "Customer";
  const customerLastName = safeTrim(args.customerLastName) || "Account";

  const acceptUrl = safeTrim(args.acceptUrl);
  const declineUrl = safeTrim(args.declineUrl);
  const notificationUrl = safeTrim(args.notificationUrl);

  const companyName = safeTrim(args.companyName) || "Sortir Au Maroc";

  if (
    !orderId ||
    !externalReference ||
    !amountMad ||
    !customerEmail ||
    !customerPhone ||
    !acceptUrl ||
    !declineUrl ||
    !notificationUrl
  ) {
    throw new Error("Missing required LacaissePay session fields");
  }

  // DEV: enforce phone = +212611159538
  const devPhoneOverride = safeTrim(process.env.LACAISSEPAY_DEV_PHONE);
  const phoneToUse =
    !isProduction() && devPhoneOverride ? devPhoneOverride : customerPhone;

  const payload = {
    amount: amountMad,
    orderId,
    config: {
      customer: {
        email: customerEmail,
        phone: phoneToUse,
        firstName: customerFirstName,
        lastName: customerLastName,
        phoneClient: customerPhone, // Display the real phone to customer
      },
      urls: {
        accept: acceptUrl,
        decline: declineUrl,
        notification: notificationUrl,
        externalReference,
      },
      keepAlive: false,
      frontend: {
        theme: "default",
        companyName,
      },
    },
    singleUse: true,
  };

  const sessionUrl = getLacaissePaySessionUrl();
  const sessionResponse = await resilientFetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }, { timeoutMs: 15_000, maxRetries: 2 });

  if (!sessionResponse.ok) {
    const errText = await sessionResponse.text();
    throw new Error(
      `Failed to create payment session: ${errText.slice(0, 200)}`,
    );
  }

  const sessionData = (await sessionResponse.json()) as any;
  if (!sessionData?.sessionId || !sessionData?.sessionToken) {
    throw new Error("Invalid response from payment provider");
  }

  return {
    sessionId: String(sessionData.sessionId),
    sessionToken: String(sessionData.sessionToken),
    externalReference,
  };
}

/**
 * Crée une session de paiement LacaissePay
 * POST /api/payments/lacaissepay/session
 *
 * Rate limited: 10 requêtes par minute
 */
export async function createLacaissePaySession(req: Request, res: Response) {
  // Log minimal en production
  const isProd = isProduction();
  if (!isProd) {
    log.info({ bodyPresent: !!req.body }, "Session creation request received");
  }

  try {
    // Validation du body
    if (!isRecord(req.body)) {
      log.error("Invalid request body");
      return errors.badRequest(res, "Corps de requête invalide");
    }

    const body = req.body as Record<string, unknown>;

    // Extraction des champs
    const orderId = asString(body.orderId);
    const externalReference = asString(body.externalReference);
    const amountMad = typeof body.amount === "number" ? body.amount : null;
    const customerEmail = asString(body.customerEmail);
    const customerPhone = asString(body.customerPhone);
    const customerFirstName = asString(body.customerFirstName);
    const customerLastName = asString(body.customerLastName);
    const acceptUrl = asString(body.acceptUrl);
    const declineUrl = asString(body.declineUrl);
    const notificationUrlRaw = asString(body.notificationUrl);
    const companyName = asString(body.companyName) || "Sortir Au Maroc";

    // Validation des champs requis
    const missingFields: string[] = [];
    if (!orderId) missingFields.push("orderId");
    if (!externalReference) missingFields.push("externalReference");
    if (!amountMad || amountMad <= 0) missingFields.push("amount");
    if (!customerEmail) missingFields.push("customerEmail");
    if (!customerPhone) missingFields.push("customerPhone");
    if (!acceptUrl) missingFields.push("acceptUrl");
    if (!declineUrl) missingFields.push("declineUrl");

    if (missingFields.length > 0) {
      return errors.badRequest(res, `Champs requis manquants: ${missingFields.join(", ")}`, {
        missingFields,
      });
    }

    // Validation du montant (minimum 1 MAD, maximum 100,000 MAD)
    if (amountMad! < 1 || amountMad! > 100000) {
      return errors.badRequest(res, "Montant invalide (doit être entre 1 et 100,000 MAD)", {
        amount: amountMad,
        min: 1,
        max: 100000,
      });
    }

    // Validation robuste de l'email (sécurité)
    const emailValidation = validateEmail(customerEmail);
    if (!emailValidation.valid) {
      return errors.invalidFormat(res, "customerEmail", "adresse email valide");
    }
    const validatedEmail = emailValidation.email!;

    // Validation robuste du téléphone (sécurité)
    const phoneValidation = validatePhone(customerPhone);
    if (!phoneValidation.valid) {
      return errors.invalidFormat(res, "customerPhone", "numéro de téléphone valide");
    }
    const validatedPhone = phoneValidation.phone!;

    // Construction de l'URL de notification
    const notificationUrl = buildNotificationUrl({
      acceptUrl: acceptUrl!,
      fallback: notificationUrlRaw,
    });

    if (!notificationUrl) {
      log.error("PAYMENTS_WEBHOOK_KEY is missing");
      return errors.serviceUnavailable(res, "Configuration de paiement incomplète");
    }

    // Création de la session LacaissePay avec valeurs validées
    const session = await createLacaissePaySessionInternal({
      orderId: orderId!,
      externalReference: externalReference!,
      amountMad: amountMad!,
      customerEmail: validatedEmail,
      customerPhone: validatedPhone,
      customerFirstName: customerFirstName || "Customer",
      customerLastName: customerLastName || "Account",
      acceptUrl: acceptUrl!,
      declineUrl: declineUrl!,
      notificationUrl,
      companyName,
    });

    return sendSuccess(res, session);
  } catch (e) {
    log.error({ err: e }, "Session creation error");

    // Ne pas exposer les détails en production
    if (isProduction()) {
      return errors.externalService(res, "LacaissePay", e);
    }

    // En dev, retourner plus de détails
    return errors.internal(res, e);
  }
}

/**
 * Parse LacaissePay webhook and convert to unified webhook format
 * LacaissePay sends:
 * - OperationStatus: 2 = SUCCESS, other = failure
 * - ExternalId: our externalReference (matches meta.payment_external_reference)
 * - OperationId: LacaissePay transaction ID
 * - Amount: payment amount
 * - CreatedAt: timestamp
 */
export function parseLacaissePayWebhook(body: unknown): {
  provider: string;
  externalId: string;
  operationId: string;
  status: "paid" | "failed" | "pending";
  amount: number;
  createdAt: string;
  rawPayload: Record<string, unknown>;
} | null {
  if (!isRecord(body)) return null;

  const operationStatus =
    typeof body.OperationStatus === "number" ? body.OperationStatus : null;
  const externalId = asString(body.ExternalId);
  const operationId = asString(body.OperationId);
  const amount = typeof body.Amount === "number" ? body.Amount : 0;
  const createdAt = asString(body.CreatedAt);

  if (!externalId || !operationId || !createdAt) {
    log.warn("Webhook missing required fields");
    return null;
  }

  const status =
    operationStatus === 2
      ? ("paid" as const)
      : operationStatus === 3
        ? ("failed" as const)
        : ("pending" as const);

  return {
    provider: "lacaissepay",
    externalId,
    operationId,
    status,
    amount,
    createdAt: new Date(createdAt).toISOString(),
    rawPayload: body as Record<string, unknown>,
  };
}

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerLacaissePayRoutes(app: Express) {
  app.post("/api/payments/lacaissepay/session", paymentRateLimiter, zBody(CreateLacaissePaySessionSchema), createLacaissePaySession);
}
