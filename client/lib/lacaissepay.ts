/**
 * LacaissePay integration
 *
 * Flow:
 * 1. Backend creates payment session via POST /api/payments/lacaissepay/session
 * 2. Client redirects to checkout URL (paydev.lacaissepay.ma or pay.lacaissepay.ma)
 * 3. Success: Webhook calls /api/payments/webhook with OperationStatus=2
 * 4. Frontend monitors status via polling or real-time updates
 */

function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface LacaissePaySessionRequest {
  orderId: string;
  externalReference: string;
  amount: number; // in MAD
  customerEmail: string;
  customerPhone: string; // DEV: must be +212611159538
  customerFirstName: string;
  customerLastName: string;
  acceptUrl: string;
  declineUrl: string;
  notificationUrl: string;
  companyName?: string;
}

export interface LacaissePaySessionResponse {
  sessionId: string;
  sessionToken: string;
}

const API_SESSION_URL = "/api/payments/lacaissepay/session";

export async function createLacaissePaySession(
  args: LacaissePaySessionRequest,
): Promise<LacaissePaySessionResponse> {
  try {
    const response = await fetch(API_SESSION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      credentials: "same-origin",
    });

    // Lire la réponse comme texte d'abord pour vérifier le type
    const text = await response.text();
    const contentType = response.headers.get("Content-Type") ?? "";

    // Vérifier si la réponse est du HTML (Apache/nginx a intercepté la requête)
    const isHtml = 
      contentType.includes("text/html") || 
      text.trim().toLowerCase().startsWith("<!doctype") || 
      text.trim().toLowerCase().startsWith("<html") ||
      text.trim().toLowerCase().includes("<html");

    if (isHtml) {
      // API returned HTML instead of JSON — request did not reach Node.js
      throw new Error(
        "L'API de paiement n'a pas répondu correctement (réponse HTML reçue). " +
          "Cela indique que la requête n'a pas atteint Node.js. " +
          "Vérifiez la configuration du reverse proxy et les timeouts Apache.",
      );
    }

    // Si la réponse n'est pas OK, essayer de parser comme JSON pour obtenir le message d'erreur
    if (!response.ok) {
      let errMsg = text;
      try {
        const parsed = JSON.parse(text) as { error?: string; message?: string; details?: string };
        errMsg = parsed.message ?? parsed.error ?? parsed.details ?? text;
      } catch (parseError) {
        // Si on ne peut pas parser comme JSON, utiliser le texte brut
        // Non-JSON error response received
        errMsg = text.length > 200 ? text.substring(0, 200) + "..." : text;
      }
      throw new Error(`LacaissePay session creation failed: ${errMsg}`);
    }

    // Parser la réponse JSON
    try {
      return JSON.parse(text) as LacaissePaySessionResponse;
    } catch (parseError) {
      // Failed to parse response as JSON
      throw new Error(
        "L'API de paiement a renvoyé une réponse invalide (non-JSON). " +
          "Vérifiez les logs du serveur pour plus de détails.",
      );
    }
  } catch (e) {
    // Si c'est déjà notre erreur personnalisée, la renvoyer telle quelle
    if (e instanceof Error && e.message.includes("LacaissePay")) {
      throw e;
    }
    
    // Sinon, gérer les erreurs de réseau ou autres
    if (e instanceof SyntaxError || (e instanceof Error && e.message?.includes("JSON"))) {
      // JSON parsing error
      throw new Error(
        "L'API de paiement a renvoyé une réponse invalide. " +
          "Vérifiez que les routes /api/* sont bien servies par Node.js.",
      );
    }
    
    // Session creation error
    throw e;
  }
}

export function buildLacaissePayCheckoutUrl(args: {
  sessionId: string;
  sessionToken: string;
  config: Record<string, unknown>; // config object from LacaissePay docs
}): string {
  const env = safeTrim((import.meta as any).env?.VITE_LACAISSEPAY_CHECKOUT_URL);
  const baseUrl = env || "https://paydev.lacaissepay.ma"; // DEV default

  // Encode config as Base64
  const configBase64 = btoa(JSON.stringify(args.config));

  // Build URL with query params
  const params = new URLSearchParams({
    sessionId: args.sessionId,
    token: args.sessionToken,
    config: configBase64,
  });

  return `${baseUrl}?${params.toString()}`;
}

export async function requestLacaissePayCheckoutUrl(args: {
  orderId: string;
  externalReference: string;
  amount: number;
  customerEmail: string;
  customerPhone: string;
  customerFirstName: string;
  customerLastName: string;
  acceptUrl: string;
  declineUrl: string;
  notificationUrl: string;
  companyName?: string;
}): Promise<string> {
  try {
    // Step 1: Create session on backend
    const session = await createLacaissePaySession(args);

    // Step 2: Build checkout config
    const config = {
      customer: {
        email: args.customerEmail,
        phone: args.customerPhone,
        firstName: args.customerFirstName,
        lastName: args.customerLastName,
        phoneClient: args.customerPhone,
      },
      urls: {
        accept: args.acceptUrl,
        decline: args.declineUrl,
        notification: args.notificationUrl,
        externalReference: args.externalReference,
      },
      frontend: {
        theme: "default",
        companyName: args.companyName || "Sortir Au Maroc",
      },
    };

    // Step 3: Build and return checkout URL
    return buildLacaissePayCheckoutUrl({
      sessionId: session.sessionId,
      sessionToken: session.sessionToken,
      config,
    });
  } catch (e) {
    // LacaissePay checkout URL generation failed
    throw e;
  }
}
