/**
 * Menu Item Votes — Zod Validation Schemas
 */

import { z, zUuid } from "../lib/validate";

/** Body for POST /api/consumer/menu-items/:itemId/vote */
export const menuItemVoteBody = z.object({
  vote: z.enum(["like", "dislike"]),
});

/** Params for :itemId routes */
export const menuItemIdParams = z.object({
  itemId: zUuid,
});

/** Params for :estId routes */
export const establishmentIdParams = z.object({
  estId: zUuid,
});
