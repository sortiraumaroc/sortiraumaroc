# Conventions de Code - Sam'Booking

Ce document définit les conventions de codage pour le projet Sam'Booking.
Tous les contributeurs doivent suivre ces règles pour maintenir la cohérence du codebase.

---

## Table des matières

1. [API Backend](#api-backend)
2. [TypeScript & React](#typescript--react)
3. [Base de données](#base-de-données)
4. [Gestion des erreurs](#gestion-des-erreurs)
5. [Sécurité](#sécurité)
6. [Styles CSS](#styles-css)

---

## API Backend

### Format de réponse standard

Toutes les réponses API doivent suivre ce format :

#### Succès

```json
{
  "ok": true,
  "data": {
    // Données de la réponse
  }
}
```

#### Erreur

```json
{
  "ok": false,
  "error": "Message d'erreur lisible par l'utilisateur",
  "code": "ERROR_CODE",
  "details": {} // Optionnel, pour les infos de débogage
}
```

#### Réponse paginée

```json
{
  "ok": true,
  "data": [],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

### Codes d'erreur standardisés

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_REQUIRED` | 401 | Authentification requise |
| `AUTH_EXPIRED` | 401 | Session expirée |
| `AUTH_INVALID` | 401 | Credentials invalides |
| `PERMISSION_DENIED` | 403 | Accès refusé |
| `NOT_FOUND` | 404 | Ressource non trouvée |
| `VALIDATION_ERROR` | 400 | Données invalides |
| `MISSING_FIELD` | 400 | Champ requis manquant |
| `INVALID_FORMAT` | 400 | Format de données invalide |
| `CONFLICT` | 409 | Conflit (ressource existe déjà) |
| `RATE_LIMITED` | 429 | Trop de requêtes |
| `INTERNAL_ERROR` | 500 | Erreur serveur interne |
| `DATABASE_ERROR` | 500 | Erreur de base de données |
| `SERVICE_UNAVAILABLE` | 503 | Service externe indisponible |

### Utilisation des helpers de réponse

```typescript
// server/lib/apiResponse.ts

import { sendSuccess, sendPaginated, errors } from "../lib/apiResponse";

// Succès simple
sendSuccess(res, { user: userData });

// Succès avec création (201)
sendCreated(res, { id: newId });

// Réponse paginée
sendPaginated(res, items, { total: 100, limit: 20, offset: 0 });

// Erreurs courantes
errors.badRequest(res, "Email invalide");
errors.unauthorized(res, "Authentification requise");
errors.notFound(res, "Utilisateur");
errors.internal(res, errorObject);
```

### Nommage des endpoints

```
# Format: /api/{domaine}/{ressource}/{action?}

# Consumer
GET  /api/consumer/me
POST /api/consumer/me/update
GET  /api/consumer/reservations
POST /api/consumer/reservations/create

# Pro
GET  /api/pro/establishment
POST /api/pro/establishment/update
GET  /api/pro/reservations

# Admin
GET  /api/admin/users
POST /api/admin/users/:id/update
GET  /api/admin/establishments

# Public (sans auth)
GET  /api/public/establishments
POST /api/leads/establishment
```

---

## TypeScript & React

### Nommage des Props

```typescript
// ✅ CORRECT - Interface nommée avec suffixe Props
interface DatePickerInputProps {
  value: string;
  onChange: (date: string) => void;
  className?: string;
}

export function DatePickerInput({ value, onChange, className }: DatePickerInputProps) {
  // ...
}

// ❌ INCORRECT - Type générique "Props"
type Props = {
  value: string;
};
```

### Nommage des fichiers

```
# Composants React
components/DatePickerInput.tsx       # PascalCase
components/ui/button.tsx             # kebab-case pour UI primitifs

# Utilitaires
lib/shared/utils.ts                  # camelCase
lib/shared/apiClient.ts              # camelCase

# Routes serveur
server/routes/leads.ts               # camelCase
server/routes/lacaissepay.ts         # camelCase
```

### Imports

```typescript
// ✅ CORRECT - Imports organisés
import type { Request, Response } from "express";  // Types d'abord

import { useEffect, useState } from "react";       // React
import { useQuery } from "@tanstack/react-query";  // Librairies externes

import { Button } from "@/components/ui/button";   // Composants internes
import { formatDate } from "@/lib/utils";          // Utilitaires internes
```

### Utilitaires partagés

Utiliser les utilitaires de `client/lib/shared/` :

```typescript
import {
  isRecord,
  asString,
  asInt,
  extractErrorMessage,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from "@/lib/shared";
```

### Classes d'erreur

```typescript
import {
  ConsumerApiError,
  ProApiError,
  AdminApiError,
  createApiError,
} from "@/lib/shared/errors";

// Usage
throw new ConsumerApiError("Session expirée", 401);

// Ou avec factory
throw createApiError("consumer", "Session expirée", 401);
```

---

## Base de données

### Conventions de nommage

```sql
-- Tables: snake_case, pluriel
CREATE TABLE consumer_users (...);
CREATE TABLE media_jobs (...);

-- Colonnes: snake_case
user_id, created_at, establishment_name

-- Clés primaires: id (uuid par défaut)
id UUID PRIMARY KEY DEFAULT gen_random_uuid()

-- Clés étrangères: {table_singulier}_id
user_id, establishment_id, reservation_id

-- Index: idx_{table}_{colonnes}
CREATE INDEX idx_reservations_user_status ON reservations(user_id, status);

-- Index uniques: ux_{table}_{colonnes}
CREATE UNIQUE INDEX ux_consumer_promo_codes_code_lower ON consumer_promo_codes(LOWER(code));

-- Contraintes FK: fk_{table}_{table_reference}
ADD CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES consumer_users(id);

-- Contraintes CHECK: chk_{table}_{description}
ADD CONSTRAINT chk_status_valid CHECK (status IN ('pending', 'confirmed', 'cancelled'));
```

### Timestamps

```sql
-- Toujours inclure created_at
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- updated_at si la table est modifiable
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- Trigger pour auto-update
CREATE TRIGGER update_timestamp
  BEFORE UPDATE ON table_name
  FOR EACH ROW
  EXECUTE FUNCTION update_modified_column();
```

### Soft deletes

```sql
-- Option 1: deleted_at (préféré)
deleted_at TIMESTAMPTZ NULL

-- Option 2: status avec valeur 'deleted'
status TEXT CHECK (status IN ('active', 'inactive', 'deleted'))

-- NE PAS mélanger les deux approches dans la même table
```

### Types de données

```sql
-- IDs: UUID (pas TEXT)
user_id UUID NOT NULL

-- Montants: INTEGER en centimes OU NUMERIC(12,2)
amount_cents INTEGER NOT NULL  -- Préféré pour éviter les erreurs de float

-- Status: TEXT avec CHECK
status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled'))

-- JSON: JSONB (pas JSON)
metadata JSONB DEFAULT '{}'
```

---

## Gestion des erreurs

### Backend (Express)

```typescript
// Wrapper try-catch pour tous les handlers
export async function myHandler(req: Request, res: Response) {
  try {
    // Validation
    if (!isRecord(req.body)) {
      return errors.badRequest(res, "Corps de requête invalide");
    }

    // Logique métier
    const result = await doSomething();

    // Succès
    return sendSuccess(res, result);
  } catch (err) {
    // Erreur
    console.error("[MyHandler] Error:", err);
    return errors.internal(res, err);
  }
}
```

### Frontend (React Query)

```typescript
// Hook avec gestion d'erreur
const { data, error, isLoading } = useQuery({
  queryKey: ["user", userId],
  queryFn: () => fetchUser(userId),
  retry: (failureCount, error) => {
    // Ne pas retry sur erreurs 4xx
    if (error instanceof ApiError && error.isClientError) {
      return false;
    }
    return failureCount < 3;
  },
});
```

---

## Sécurité

### Rate Limiting

Tous les endpoints publics doivent avoir un rate limiter :

```typescript
import { leadsRateLimiter, paymentRateLimiter } from "../middleware/rateLimiter";

// Leads: 5 req / 15 min
app.post("/api/leads/establishment", leadsRateLimiter, submitEstablishmentLead);

// Paiements: 10 req / 1 min
app.post("/api/payments/session", paymentRateLimiter, createPaymentSession);
```

### Variables d'environnement

```bash
# NE JAMAIS committer .env
# Utiliser .env.example comme template

# Secrets à ne JAMAIS exposer côté client
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_API_KEY=...
ADMIN_DASHBOARD_PASSWORD=...

# Variables client (préfixe VITE_)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Validation des entrées

```typescript
// Toujours valider et sanitizer les entrées
const email = clamp(asString(body.email).toLowerCase(), 180);

if (!email || !isEmail(email)) {
  return errors.invalidFormat(res, "email", "adresse email valide");
}

// Utiliser Zod pour les validations complexes
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(180),
  name: z.string().min(2).max(120),
});

const result = schema.safeParse(req.body);
if (!result.success) {
  return errors.badRequest(res, "Données invalides", result.error.issues);
}
```

---

## Styles CSS

### Couleurs de marque

Utiliser les classes Tailwind au lieu des valeurs hardcodées :

```tsx
// ✅ CORRECT
<button className="bg-sambooking-primary hover:bg-sambooking-primary-hover">

// ❌ INCORRECT
<button className="bg-[#a3001d] hover:bg-[#8a0019]">
```

### Palette Sam'Booking

| Nom | Classe Tailwind | Hex |
|-----|----------------|-----|
| Primary | `bg-sambooking-primary` | #a3001d |
| Primary Hover | `bg-sambooking-primary-hover` | #8a0019 |
| Primary Light | `bg-sambooking-primary-light` | #c9002e |
| Secondary | `bg-sambooking-secondary` | #1a1a2e |
| Accent | `bg-sambooking-accent` | #f4a261 |
| Success | `bg-sambooking-success` | #10b981 |
| Warning | `bg-sambooking-warning` | #f59e0b |
| Error | `bg-sambooking-error` | #ef4444 |

### Composants UI

Privilégier les composants de `client/components/ui/` basés sur Radix UI.

---

## Checklist PR

Avant de soumettre une PR, vérifier :

- [ ] Les réponses API suivent le format standard
- [ ] Les Props des composants sont nommées `[Component]Props`
- [ ] Les entrées utilisateur sont validées et sanitizées
- [ ] Les endpoints publics ont un rate limiter
- [ ] Les couleurs utilisent les classes `sambooking-*`
- [ ] Le code compile sans erreur TypeScript
- [ ] Les nouveaux fichiers suivent les conventions de nommage
