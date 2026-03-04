/**
 * Zod Schemas for Admin AI Routes
 */
import { z } from "zod";

// POST /api/admin/ai/generate
export const AdminAIGenerateSchema = z.object({
  action: z.enum([
    "write_paragraph",
    "improve_text",
    "translate_to_english",
    "translate_to_french",
    "generate_title",
    "generate_excerpt",
    "expand_text",
    "simplify_text",
  ]),
  text: z.string().min(1, "Texte requis"),
  context: z.string().optional(),
});

// POST /api/admin/ai/extract-menu
export const AdminAIExtractMenuSchema = z.object({
  establishmentId: z.string().uuid("ID établissement invalide"),
  text: z.string().min(1, "Texte requis").max(50000, "Le texte dépasse 50000 caractères"),
});
