# 🎯 PLAN D'ACTION - CORRECTIONS SAM'BOOKING

> **Objectif** : Corriger toutes les incohérences identifiées dans l'audit
> **Durée estimée totale** : 4-6 semaines (selon ressources disponibles)
> **Priorité** : Sécurité → Stabilité → Maintenabilité → Optimisation

---

## 📅 PHASE 1 : URGENCE SÉCURITÉ (Semaine 1)

### 1.1 🔴 Rotation des secrets exposés
**Priorité** : CRITIQUE | **Effort** : 2-4h

#### Actions immédiates :
```bash
# 1. Créer .env.example (template sans valeurs sensibles)
cp .env .env.example

# 2. Nettoyer .env.example
```

#### Fichier `.env.example` à créer :
```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Admin
ADMIN_API_KEY=generate-secure-key-here
ADMIN_DASHBOARD_PASSWORD=generate-secure-password-here

# LacaissePay
LACAISSEPAY_CHECKOUT_URL=https://checkout.lacaissepay.ma
LACAISSEPAY_SESSION_URL=https://api.lacaissepay.ma

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SECURE=false
EMAIL_FROM_NAME=Sam'Booking
EMAIL_DOMAIN=sambooking.ma

# Application
PUBLIC_BASE_URL=https://sambooking.ma
NODE_ENV=development
```

#### Checklist :
- [ ] Rotater `SUPABASE_SERVICE_ROLE_KEY` dans Supabase Dashboard
- [ ] Générer nouveau `ADMIN_API_KEY` (32 caractères minimum)
- [ ] Changer `ADMIN_DASHBOARD_PASSWORD` (utiliser un gestionnaire de mots de passe)
- [ ] Vérifier que `.env` est dans `.gitignore`
- [ ] Supprimer l'historique Git si les secrets ont été committés

```bash
# Si secrets committés, nettoyer l'historique (ATTENTION: destructif)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all
```

---

### 1.2 🔴 Ajouter l'authentification aux endpoints exposés
**Priorité** : CRITIQUE | **Effort** : 4-6h

#### Fichier : `server/routes/leads.ts`

```typescript
// AVANT (ligne ~132)
export async function submitEstablishmentLead(req: Request, res: Response) {
  // Pas de vérification...
}

// APRÈS
import { rateLimit } from 'express-rate-limit';

// Ajouter un rate limiter pour les leads
const leadsRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requêtes max par IP
  message: { error: "Trop de demandes. Réessayez dans 15 minutes." }
});

// Ajouter validation CSRF ou captcha
export async function submitEstablishmentLead(req: Request, res: Response) {
  try {
    // 1. Vérifier le rate limit (géré par middleware)

    // 2. Valider les données d'entrée
    const schema = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      phone: z.string().optional(),
      establishmentName: z.string().min(2).max(200),
      message: z.string().max(2000).optional(),
    });

    const validated = schema.safeParse(req.body);
    if (!validated.success) {
      return res.status(400).json({ error: "Données invalides" });
    }

    // 3. Continuer le traitement...
  } catch (error) {
    console.error("Lead submission error:", error);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
```

#### Fichier : `server/routes/lacaissepay.ts`

```typescript
// AVANT (ligne ~241)
export async function createLacaissePaySession(req: Request, res: Response) {
  // Traitement direct sans auth...
}

// APRÈS
export async function createLacaissePaySession(req: Request, res: Response) {
  try {
    // 1. Vérifier l'authentification utilisateur
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: "Authentification requise" });
    }

    // 2. Valider le token avec Supabase
    const { data: user, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Session invalide" });
    }

    // 3. Valider les données de paiement
    const schema = z.object({
      amount: z.number().positive().max(1000000), // Max 10,000 MAD
      currency: z.literal("MAD"),
      orderId: z.string().uuid(),
      // ... autres champs
    });

    // 4. Continuer le traitement...
  } catch (error) {
    console.error("Payment session error:", error);
    return res.status(500).json({ error: "Erreur de création de session" });
  }
}
```

---

## 📅 PHASE 2 : DETTE TECHNIQUE MAJEURE (Semaines 2-3)

### 2.1 🟠 Centraliser les utilitaires dupliqués
**Priorité** : HAUTE | **Effort** : 8-12h

#### Créer : `client/lib/shared/utils.ts`

```typescript
/**
 * Utilitaires partagés - Sam'Booking
 * Centralise les fonctions dupliquées dans le codebase
 */

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Vérifie si une valeur est un objet Record
 * @note Version stricte qui exclut les arrays
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Vérifie si une valeur est un objet (version permissive)
 */
export function isObject(v: unknown): v is object {
  return !!v && typeof v === "object";
}

// ============================================
// ERROR HANDLING
// ============================================

/**
 * Extrait le message d'erreur d'un payload API
 */
export function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const msg = typeof payload.error === "string" ? payload.error : null;
  return msg?.trim() || null;
}

/**
 * Messages d'erreur centralisés
 */
export const ERROR_MESSAGES = {
  // Authentification
  NOT_AUTHENTICATED: "Not authenticated",
  SESSION_EXPIRED_PRO: "Session PRO expirée. Veuillez vous reconnecter.",
  SESSION_EXPIRED_CONSUMER: "Session expirée. Veuillez vous reconnecter.",

  // Réseau
  NETWORK_ERROR: "Impossible de contacter le serveur. Vérifiez votre connexion.",
  SERVICE_UNAVAILABLE: "Service temporairement indisponible. Réessayez dans un instant.",

  // Validation
  INVALID_DATA: "Données invalides",
  MISSING_REQUIRED_FIELD: "Champ requis manquant",

  // Générique
  UNKNOWN_ERROR: "Une erreur inattendue s'est produite.",
} as const;

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Convertit une valeur en string sécurisé
 */
export function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Convertit une valeur en string optionnel
 */
export function asOptionalString(v: unknown): string | null {
  const s = asString(v);
  return s || null;
}

/**
 * Convertit une valeur en entier
 */
export function asInt(v: unknown, defaultValue = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string") {
    const parsed = parseInt(v, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}

/**
 * Convertit une valeur en booléen
 */
export function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return !!v;
}

// ============================================
// PAGINATION
// ============================================

export const PAGINATION = {
  MIN_LIMIT: 1,
  MAX_LIMIT: 500,
  DEFAULT_LIMIT: 50,
} as const;

/**
 * Normalise une limite de pagination
 */
export function normalizeLimit(limit: unknown): number {
  const n = asInt(limit, PAGINATION.DEFAULT_LIMIT);
  return Math.min(PAGINATION.MAX_LIMIT, Math.max(PAGINATION.MIN_LIMIT, n));
}

/**
 * Normalise un offset de pagination
 */
export function normalizeOffset(offset: unknown): number {
  return Math.max(0, asInt(offset, 0));
}

// ============================================
// HTTP STATUS CODES
// ============================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

// ============================================
// CURRENCY & LOCALE
// ============================================

export const DEFAULTS = {
  CURRENCY: "MAD" as const,
  LOCALE: "fr-MA" as const,
  TIMEZONE: "Africa/Casablanca" as const,
} as const;

export type SupportedCurrency = "MAD" | "EUR" | "USD";
export type SupportedLocale = "fr-MA" | "fr-FR" | "en-US";
```

#### Créer : `client/lib/shared/errors.ts`

```typescript
/**
 * Classes d'erreur centralisées - Sam'Booking
 */

import { HTTP_STATUS, ERROR_MESSAGES } from "./utils";

/**
 * Erreur API de base
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = "ApiError";
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
}

/**
 * Erreur API Consumer
 */
export class ConsumerApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown) {
    super(message, status, payload);
    this.name = "ConsumerApiError";
  }
}

/**
 * Erreur API Pro
 */
export class ProApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown) {
    super(message, status, payload);
    this.name = "ProApiError";
  }
}

/**
 * Erreur API Admin
 */
export class AdminApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown) {
    super(message, status, payload);
    this.name = "AdminApiError";
  }
}

/**
 * Erreur API Publique
 */
export class PublicApiError extends ApiError {
  constructor(message: string, status?: number, payload?: unknown) {
    super(message, status, payload);
    this.name = "PublicApiError";
  }
}

/**
 * Factory pour créer l'erreur appropriée selon le contexte
 */
export function createApiError(
  context: "consumer" | "pro" | "admin" | "public",
  message: string,
  status?: number,
  payload?: unknown
): ApiError {
  switch (context) {
    case "consumer":
      return new ConsumerApiError(message, status, payload);
    case "pro":
      return new ProApiError(message, status, payload);
    case "admin":
      return new AdminApiError(message, status, payload);
    case "public":
      return new PublicApiError(message, status, payload);
  }
}
```

#### Créer : `client/lib/shared/apiClient.ts`

```typescript
/**
 * Client API de base - Sam'Booking
 * Centralise la logique de requêtes HTTP
 */

import { extractErrorMessage, ERROR_MESSAGES, HTTP_STATUS } from "./utils";
import { ApiError, createApiError } from "./errors";

type ApiContext = "consumer" | "pro" | "admin" | "public";

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

/**
 * Client API générique
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: RequestOptions & { context: ApiContext; token?: string | null }
): Promise<T> {
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
    throw createApiError(context, ERROR_MESSAGES.NETWORK_ERROR, 0, error);
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
      throw createApiError(context, ERROR_MESSAGES.SERVICE_UNAVAILABLE, res.status, payload);
    }

    // Extract error message from payload
    const errorMsg = extractErrorMessage(payload) || ERROR_MESSAGES.UNKNOWN_ERROR;
    throw createApiError(context, errorMsg, res.status, payload);
  }

  return payload as T;
}

/**
 * Helpers pour chaque contexte
 */
export const consumerApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "consumer", token, method: "GET" }),
  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "consumer", token, method: "POST", body }),
  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "consumer", token, method: "PUT", body }),
  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "consumer", token, method: "DELETE" }),
};

export const proApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "pro", token, method: "GET" }),
  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "pro", token, method: "POST", body }),
  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "pro", token, method: "PUT", body }),
  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "pro", token, method: "DELETE" }),
};

export const adminApi = {
  get: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "admin", token, method: "GET" }),
  post: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "admin", token, method: "POST", body }),
  put: <T>(url: string, token: string | null, body: unknown) =>
    apiRequest<T>(url, { context: "admin", token, method: "PUT", body }),
  delete: <T>(url: string, token: string | null) =>
    apiRequest<T>(url, { context: "admin", token, method: "DELETE" }),
};

export const publicApi = {
  get: <T>(url: string) =>
    apiRequest<T>(url, { context: "public", method: "GET" }),
  post: <T>(url: string, body: unknown) =>
    apiRequest<T>(url, { context: "public", method: "POST", body }),
};
```

---

### 2.2 🟠 Standardiser les réponses API
**Priorité** : HAUTE | **Effort** : 6-8h

#### Créer : `server/lib/apiResponse.ts`

```typescript
/**
 * Utilitaires de réponse API standardisées
 */

import { Response } from "express";

// Types de réponse standardisés
interface SuccessResponse<T = unknown> {
  ok: true;
  data: T;
}

interface ErrorResponse {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
}

interface PaginatedResponse<T = unknown> {
  ok: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

// Codes d'erreur standardisés
export const ERROR_CODES = {
  // Auth
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_INVALID: "AUTH_INVALID",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  PERMISSION_DENIED: "PERMISSION_DENIED",

  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_FORMAT: "INVALID_FORMAT",

  // Resources
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  CONFLICT: "CONFLICT",

  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  DATABASE_ERROR: "DATABASE_ERROR",
} as const;

/**
 * Envoie une réponse de succès
 */
export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data } satisfies SuccessResponse<T>);
}

/**
 * Envoie une réponse paginée
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { total: number; limit: number; offset: number }
): void {
  res.status(200).json({
    ok: true,
    data,
    pagination: {
      ...pagination,
      hasMore: pagination.offset + data.length < pagination.total,
    },
  } satisfies PaginatedResponse<T>);
}

/**
 * Envoie une réponse d'erreur
 */
export function sendError(
  res: Response,
  message: string,
  status = 500,
  code?: string,
  details?: unknown
): void {
  const response: ErrorResponse = { ok: false, error: message };
  if (code) response.code = code;
  if (details) response.details = details;
  res.status(status).json(response);
}

// Helpers pour erreurs courantes
export const errors = {
  unauthorized: (res: Response, message = "Authentification requise") =>
    sendError(res, message, 401, ERROR_CODES.AUTH_REQUIRED),

  forbidden: (res: Response, message = "Accès refusé") =>
    sendError(res, message, 403, ERROR_CODES.PERMISSION_DENIED),

  notFound: (res: Response, resource = "Ressource") =>
    sendError(res, `${resource} non trouvé(e)`, 404, ERROR_CODES.NOT_FOUND),

  badRequest: (res: Response, message: string, details?: unknown) =>
    sendError(res, message, 400, ERROR_CODES.VALIDATION_ERROR, details),

  conflict: (res: Response, message: string) =>
    sendError(res, message, 409, ERROR_CODES.CONFLICT),

  internal: (res: Response, error?: unknown) => {
    console.error("Internal error:", error);
    sendError(res, "Erreur serveur interne", 500, ERROR_CODES.INTERNAL_ERROR);
  },

  serviceUnavailable: (res: Response) =>
    sendError(res, "Service temporairement indisponible", 503, ERROR_CODES.SERVICE_UNAVAILABLE),
};
```

---

### 2.3 🟠 Supprimer les composants inutilisés
**Priorité** : MOYENNE | **Effort** : 1-2h

```bash
# Composants à supprimer
rm client/components/EstablishmentModal.tsx
rm client/components/DateTimePickerInput.tsx
rm client/components/DrawerDatePicker.tsx
rm client/components/DrawerTimePicker.tsx
```

---

### 2.4 🟠 Nettoyer les dépendances npm
**Priorité** : MOYENNE | **Effort** : 1h

```bash
# Supprimer les dépendances inutilisées
pnpm remove html2canvas embla-carousel-react globals serverless-http

# Déplacer @types/multer vers devDependencies
pnpm remove @types/multer
pnpm add -D @types/multer
```

---

## 📅 PHASE 3 : BASE DE DONNÉES (Semaine 3-4)

### 3.1 🟠 Ajouter les Foreign Keys manquantes
**Priorité** : HAUTE | **Effort** : 4-6h

#### Créer : `server/migrations/20260127_add_missing_foreign_keys.sql`

```sql
-- Migration: Ajout des Foreign Keys manquantes
-- Date: 2026-01-27
-- Auteur: Sam'Booking Team

BEGIN;

-- ============================================
-- 1. consumer_promo_code_redemptions
-- ============================================
ALTER TABLE public.consumer_promo_code_redemptions
  ADD CONSTRAINT fk_consumer_promo_redemptions_user
  FOREIGN KEY (user_id)
  REFERENCES public.consumer_users(id)
  ON DELETE CASCADE;

-- Index pour la performance
CREATE INDEX IF NOT EXISTS idx_consumer_promo_redemptions_user_id
  ON public.consumer_promo_code_redemptions(user_id);

-- ============================================
-- 2. email_campaign_recipients
-- ============================================
-- Note: Cette table a un recipient_type polymorphique
-- On ne peut pas ajouter de FK directe, mais on ajoute une contrainte CHECK

ALTER TABLE public.email_campaign_recipients
  ADD CONSTRAINT chk_recipient_type_valid
  CHECK (recipient_type IN ('consumer', 'pro'));

-- Index pour les requêtes par type
CREATE INDEX IF NOT EXISTS idx_email_recipients_type_status
  ON public.email_campaign_recipients(recipient_type, status);

-- ============================================
-- 3. media_jobs - responsible_admin_id
-- ============================================
-- Convertir de TEXT à UUID et ajouter FK
-- Note: Migration en plusieurs étapes pour sécurité

-- 3.1 Créer nouvelle colonne
ALTER TABLE public.media_jobs
  ADD COLUMN responsible_admin_uuid UUID;

-- 3.2 Migrer les données (si possible)
UPDATE public.media_jobs
SET responsible_admin_uuid = responsible_admin_id::uuid
WHERE responsible_admin_id IS NOT NULL
  AND responsible_admin_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3.3 Supprimer l'ancienne colonne et renommer
ALTER TABLE public.media_jobs DROP COLUMN responsible_admin_id;
ALTER TABLE public.media_jobs RENAME COLUMN responsible_admin_uuid TO responsible_admin_id;

-- 3.4 Ajouter la FK
ALTER TABLE public.media_jobs
  ADD CONSTRAINT fk_media_jobs_admin
  FOREIGN KEY (responsible_admin_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- ============================================
-- 4. consumer_data_export_requests
-- ============================================
-- Convertir user_id de TEXT à UUID
ALTER TABLE public.consumer_data_export_requests
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

ALTER TABLE public.consumer_data_export_requests
  ADD CONSTRAINT fk_export_requests_user
  FOREIGN KEY (user_id)
  REFERENCES public.consumer_users(id)
  ON DELETE CASCADE;

COMMIT;
```

---

### 3.2 🟡 Ajouter les index manquants
**Priorité** : MOYENNE | **Effort** : 2-3h

#### Créer : `server/migrations/20260128_add_missing_indexes.sql`

```sql
-- Migration: Ajout des index manquants
-- Date: 2026-01-28
-- Objectif: Améliorer les performances des requêtes fréquentes

BEGIN;

-- ============================================
-- Tables Consumer
-- ============================================

-- Filtrage par statut de compte
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consumer_users_account_status
  ON public.consumer_users(account_status);

-- Score de fiabilité (tri fréquent)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_consumer_user_stats_reliability
  ON public.consumer_user_stats(reliability_score DESC);

-- ============================================
-- Tables Media Factory
-- ============================================

-- Jobs par statut (dashboard admin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_jobs_status
  ON public.media_jobs(status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_jobs_status_created
  ON public.media_jobs(status, created_at DESC);

-- Deliverables par statut
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_deliverables_status
  ON public.media_deliverables(status);

-- Factures par admin
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_invoices_admin
  ON public.media_invoices(created_by_admin_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_media_quotes_admin
  ON public.media_quotes(created_by_admin_id);

-- ============================================
-- Tables Email
-- ============================================

-- Campagnes par audience et statut
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_campaigns_audience_status
  ON public.email_campaigns(audience, status);

-- Events par recipient (tracking engagement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_email_events_recipient_kind
  ON public.email_events(recipient_id, kind);

-- ============================================
-- Tables Finance
-- ============================================

-- Factures par statut
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_invoices_status
  ON finance.invoices(status);

-- Payout requests (dashboard admin)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_finance_payout_requests_status_created
  ON finance.payout_requests(status, created_at DESC);

-- ============================================
-- Tables Pro
-- ============================================

-- Campagnes actives
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_campaigns_status
  ON public.pro_campaigns(status);

-- Events par type et date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pro_campaign_events_type_created
  ON public.pro_campaign_events(event_type, created_at DESC);

-- ============================================
-- Tables Blog
-- ============================================

-- Auteurs actifs
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_authors_active
  ON public.blog_authors(is_active) WHERE is_active = true;

-- Catégories par ordre d'affichage
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_blog_categories_order
  ON public.blog_categories(display_order);

COMMIT;
```

---

### 3.3 🟡 Corriger les incohérences de nommage
**Priorité** : MOYENNE | **Effort** : 3-4h

#### Créer : `server/migrations/20260129_naming_consistency.sql`

```sql
-- Migration: Uniformisation du nommage
-- Date: 2026-01-29
-- Objectif: Cohérence dans les conventions de nommage

BEGIN;

-- ============================================
-- 1. Renommer visibility_promo_codes → pro_promo_codes
-- (pour cohérence avec consumer_promo_codes)
-- ============================================

-- Créer la nouvelle table
CREATE TABLE IF NOT EXISTS public.pro_promo_codes (
  LIKE public.visibility_promo_codes INCLUDING ALL
);

-- Copier les données
INSERT INTO public.pro_promo_codes
SELECT * FROM public.visibility_promo_codes;

-- Créer une vue pour rétrocompatibilité
CREATE OR REPLACE VIEW public.visibility_promo_codes_v AS
SELECT * FROM public.pro_promo_codes;

-- Note: La suppression de l'ancienne table sera faite
-- dans une migration ultérieure après mise à jour du code

-- ============================================
-- 2. Standardiser les codes promo (case-insensitive)
-- ============================================

-- Consumer promo codes
CREATE UNIQUE INDEX IF NOT EXISTS ux_consumer_promo_codes_code_lower
  ON public.consumer_promo_codes(LOWER(code));

-- Pro promo codes
CREATE UNIQUE INDEX IF NOT EXISTS ux_pro_promo_codes_code_lower
  ON public.pro_promo_codes(LOWER(code));

-- ============================================
-- 3. Documentation des conventions
-- ============================================

COMMENT ON TABLE public.consumer_promo_codes IS
  'Codes promo pour les consommateurs (B2C)';

COMMENT ON TABLE public.pro_promo_codes IS
  'Codes promo pour les professionnels (B2B) - anciennement visibility_promo_codes';

COMMIT;
```

---

## 📅 PHASE 4 : QUALITÉ DE CODE (Semaines 4-5)

### 4.1 🟡 Activer TypeScript strict progressivement
**Priorité** : MOYENNE | **Effort** : 8-12h

#### Étape 1 : Créer `tsconfig.strict.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": [
    "client/lib/shared/**/*"
  ]
}
```

#### Étape 2 : Script de migration progressive

```bash
#!/bin/bash
# scripts/migrate-to-strict.sh

# Fichiers à migrer en premier (utilitaires partagés)
STRICT_DIRS=(
  "client/lib/shared"
  "shared"
)

echo "🔍 Vérification TypeScript strict sur les fichiers ciblés..."

for dir in "${STRICT_DIRS[@]}"; do
  echo "Checking $dir..."
  npx tsc --project tsconfig.strict.json --noEmit
done

echo "✅ Migration strict terminée pour les fichiers ciblés"
```

---

### 4.2 🟡 Standardiser les Props React
**Priorité** : BASSE | **Effort** : 4-6h

#### Script de refactoring : `scripts/fix-props-naming.ts`

```typescript
/**
 * Script pour renommer "type Props" en "[Component]Props"
 * Usage: npx tsx scripts/fix-props-naming.ts
 */

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

async function fixPropsNaming() {
  const files = await glob("client/components/pro/tabs/*.tsx");

  for (const file of files) {
    const content = fs.readFileSync(file, "utf-8");
    const componentName = path.basename(file, ".tsx");

    // Remplacer "type Props = {" par "interface [Component]Props {"
    const newContent = content
      .replace(
        /type Props = \{/g,
        `interface ${componentName}Props {`
      )
      .replace(
        /\}: Props\)/g,
        `}: ${componentName}Props)`
      );

    if (content !== newContent) {
      fs.writeFileSync(file, newContent);
      console.log(`✅ Fixed: ${file}`);
    }
  }
}

fixPropsNaming().catch(console.error);
```

---

### 4.3 🟡 Extraire les couleurs hardcodées
**Priorité** : BASSE | **Effort** : 2-3h

#### Modifier : `tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

export default {
  // ... existing config
  theme: {
    extend: {
      colors: {
        // Couleurs de marque Sam'Booking
        sambooking: {
          primary: "#a3001d",      // Rouge principal
          "primary-hover": "#8a0019",
          "primary-light": "#d4003a",
          secondary: "#1a1a2e",    // Bleu foncé
          accent: "#f4a261",       // Orange accent
        },
      },
    },
  },
} satisfies Config;
```

#### Remplacer dans les composants :

```typescript
// AVANT
className="bg-[#a3001d]"

// APRÈS
className="bg-sambooking-primary"
```

---

## 📅 PHASE 5 : DOCUMENTATION & TESTS (Semaine 5-6)

### 5.1 Documenter les conventions

#### Créer : `docs/CONVENTIONS.md`

```markdown
# Conventions de Code - Sam'Booking

## API

### Format de réponse standard

#### Succès
```json
{
  "ok": true,
  "data": { ... }
}
```

#### Erreur
```json
{
  "ok": false,
  "error": "Message d'erreur",
  "code": "ERROR_CODE"
}
```

### Codes d'erreur
| Code | HTTP | Description |
|------|------|-------------|
| AUTH_REQUIRED | 401 | Authentification requise |
| AUTH_EXPIRED | 401 | Session expirée |
| PERMISSION_DENIED | 403 | Accès refusé |
| NOT_FOUND | 404 | Ressource non trouvée |
| VALIDATION_ERROR | 400 | Données invalides |

## TypeScript

### Props de composants
```typescript
// ✅ Correct
interface MyComponentProps {
  title: string;
  onClick?: () => void;
}

// ❌ Incorrect
type Props = { ... }
```

## Base de données

### Conventions de nommage
- Tables: `snake_case`, pluriel (`consumer_users`, `media_jobs`)
- Colonnes: `snake_case` (`created_at`, `user_id`)
- Index: `idx_[table]_[columns]`
- FK: `fk_[table]_[referenced_table]`
- Unique: `ux_[table]_[columns]`
```

---

### 5.2 Ajouter des tests pour les utilitaires

#### Créer : `client/lib/shared/__tests__/utils.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import {
  isRecord,
  extractErrorMessage,
  asString,
  asInt,
  normalizeLimit,
} from "../utils";

describe("isRecord", () => {
  it("returns true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: "value" })).toBe(true);
  });

  it("returns false for arrays", () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it("returns false for null and undefined", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("extractErrorMessage", () => {
  it("extracts error from valid payload", () => {
    expect(extractErrorMessage({ error: "Test error" })).toBe("Test error");
  });

  it("returns null for invalid payload", () => {
    expect(extractErrorMessage(null)).toBeNull();
    expect(extractErrorMessage("string")).toBeNull();
    expect(extractErrorMessage({ other: "field" })).toBeNull();
  });

  it("trims whitespace", () => {
    expect(extractErrorMessage({ error: "  trimmed  " })).toBe("trimmed");
  });
});

describe("asString", () => {
  it("returns trimmed string for string input", () => {
    expect(asString("  hello  ")).toBe("hello");
  });

  it("returns empty string for non-string input", () => {
    expect(asString(123)).toBe("");
    expect(asString(null)).toBe("");
    expect(asString(undefined)).toBe("");
  });
});

describe("asInt", () => {
  it("parses valid integers", () => {
    expect(asInt(42)).toBe(42);
    expect(asInt("42")).toBe(42);
    expect(asInt(42.9)).toBe(42); // Floor
  });

  it("returns default for invalid input", () => {
    expect(asInt("invalid")).toBe(0);
    expect(asInt("invalid", 10)).toBe(10);
    expect(asInt(null)).toBe(0);
  });
});

describe("normalizeLimit", () => {
  it("clamps to valid range", () => {
    expect(normalizeLimit(0)).toBe(1);
    expect(normalizeLimit(1000)).toBe(500);
    expect(normalizeLimit(50)).toBe(50);
  });
});
```

---

## 📊 TABLEAU DE SUIVI

| Phase | Tâche | Priorité | Effort | Status |
|-------|-------|----------|--------|--------|
| 1.1 | Rotation des secrets | 🔴 CRITIQUE | 2-4h | ⬜ À faire |
| 1.2 | Auth endpoints exposés | 🔴 CRITIQUE | 4-6h | ⬜ À faire |
| 2.1 | Centraliser utilitaires | 🟠 HAUTE | 8-12h | ⬜ À faire |
| 2.2 | Standardiser réponses API | 🟠 HAUTE | 6-8h | ⬜ À faire |
| 2.3 | Supprimer composants inutilisés | 🟠 MOYENNE | 1-2h | ⬜ À faire |
| 2.4 | Nettoyer dépendances | 🟠 MOYENNE | 1h | ⬜ À faire |
| 3.1 | Ajouter Foreign Keys | 🟠 HAUTE | 4-6h | ⬜ À faire |
| 3.2 | Ajouter index manquants | 🟡 MOYENNE | 2-3h | ⬜ À faire |
| 3.3 | Corriger nommage tables | 🟡 MOYENNE | 3-4h | ⬜ À faire |
| 4.1 | TypeScript strict | 🟡 MOYENNE | 8-12h | ⬜ À faire |
| 4.2 | Standardiser Props | 🔵 BASSE | 4-6h | ⬜ À faire |
| 4.3 | Extraire couleurs | 🔵 BASSE | 2-3h | ⬜ À faire |
| 5.1 | Documentation | 🟡 MOYENNE | 4-6h | ⬜ À faire |
| 5.2 | Tests utilitaires | 🟡 MOYENNE | 4-6h | ⬜ À faire |

---

## 🚀 COMMANDES RAPIDES

```bash
# Phase 1 - Sécurité
cp .env .env.backup
# Éditer .env avec nouveaux secrets

# Phase 2 - Nettoyage
pnpm remove html2canvas embla-carousel-react globals serverless-http
rm client/components/EstablishmentModal.tsx
rm client/components/DateTimePickerInput.tsx
rm client/components/DrawerDatePicker.tsx
rm client/components/DrawerTimePicker.tsx

# Phase 3 - Base de données
pnpm run migrate # Après avoir créé les fichiers SQL

# Phase 4 - TypeScript
npx tsc --project tsconfig.strict.json --noEmit

# Phase 5 - Tests
pnpm test client/lib/shared
```

---

> **Note** : Ce plan est conçu pour être exécuté progressivement. Chaque phase peut être réalisée indépendamment, mais l'ordre recommandé maximise l'impact sur la qualité et la sécurité du projet.
