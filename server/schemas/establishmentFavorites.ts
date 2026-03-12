import { z } from "zod";

// POST /api/consumer/establishments/:id/favorite (toggle)
export const EstablishmentFavoriteParams = z.object({
  id: z.string().uuid("ID établissement invalide"),
});

// GET /api/consumer/me/favorite-establishments
export const FavoriteEstablishmentsQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

// GET /api/consumer/establishments/:id/is-favorite
export const CheckFavoriteParams = z.object({
  id: z.string().uuid("ID établissement invalide"),
});
