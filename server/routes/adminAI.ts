import type { RequestHandler, Router } from "express";
import { parseCookies, getSessionCookieName, verifyAdminSessionToken, type AdminSessionPayload } from "../adminSession";
import { getAdminSupabase } from "../supabaseAdmin";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type AIAction =
  | "write_paragraph"
  | "improve_text"
  | "translate_to_english"
  | "translate_to_french"
  | "generate_title"
  | "generate_excerpt"
  | "expand_text"
  | "simplify_text";

const ACTION_PROMPTS: Record<AIAction, string> = {
  write_paragraph: `Tu es un rédacteur web professionnel pour Sortir Au Maroc, une plateforme de réservation au Maroc.
Écris un paragraphe engageant et informatif basé sur le sujet donné.
Le texte doit être optimisé SEO, fluide et professionnel.
Réponds UNIQUEMENT avec le paragraphe, sans introduction ni explication.`,

  improve_text: `Tu es un rédacteur web professionnel.
Améliore le texte fourni en le rendant plus engageant, fluide et professionnel.
Corrige les fautes d'orthographe et de grammaire.
Garde le même sens et la même longueur approximative.
Réponds UNIQUEMENT avec le texte amélioré, sans introduction ni explication.`,

  translate_to_english: `Tu es un traducteur professionnel.
Traduis le texte français suivant en anglais.
Garde le même style et le même ton.
Réponds UNIQUEMENT avec la traduction, sans introduction ni explication.`,

  translate_to_french: `Tu es un traducteur professionnel.
Traduis le texte anglais suivant en français.
Garde le même style et le même ton.
Réponds UNIQUEMENT avec la traduction, sans introduction ni explication.`,

  generate_title: `Tu es un rédacteur web SEO professionnel pour Sortir Au Maroc.
Génère un titre accrocheur et optimisé SEO pour un article de blog basé sur le contenu fourni.
Le titre doit être entre 50 et 60 caractères.
Réponds UNIQUEMENT avec le titre, sans guillemets ni introduction.`,

  generate_excerpt: `Tu es un rédacteur web professionnel pour Sortir Au Maroc.
Génère un extrait/résumé accrocheur pour un article de blog basé sur le contenu fourni.
L'extrait doit être entre 120 et 160 caractères, optimisé pour le SEO.
Réponds UNIQUEMENT avec l'extrait, sans guillemets ni introduction.`,

  expand_text: `Tu es un rédacteur web professionnel pour Sortir Au Maroc.
Développe et enrichis le texte fourni avec plus de détails, exemples et explications.
Garde le même style et le même ton.
Réponds UNIQUEMENT avec le texte développé, sans introduction ni explication.`,

  simplify_text: `Tu es un rédacteur web professionnel.
Simplifie le texte fourni pour le rendre plus accessible et facile à lire.
Utilise des phrases courtes et un vocabulaire simple.
Réponds UNIQUEMENT avec le texte simplifié, sans introduction ni explication.`,
};

// Roles that have access to the AI assistant
// Only SAM admin team members, not partners/bloggers
const ALLOWED_ROLES = ["superadmin", "admin", "ops", "content", "marketing"];

function getAdminSessionToken(req: Parameters<RequestHandler>[0]): string | null {
  const cookies = parseCookies(req.header("cookie") ?? undefined);
  const cookieToken = cookies[getSessionCookieName()];
  if (cookieToken) return cookieToken;

  const headerToken = req.header("x-admin-session") ?? undefined;
  if (headerToken && headerToken.trim()) return headerToken.trim();

  const authHeader = req.header("authorization") ?? undefined;
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  return null;
}

function requireAdminSession(req: Parameters<RequestHandler>[0]): AdminSessionPayload | null {
  const token = getAdminSessionToken(req);
  if (!token) return null;

  const session = verifyAdminSessionToken(token);
  if (!session) return null;

  return session;
}

function hasAIAccess(session: AdminSessionPayload): boolean {
  // Superadmin always has access (legacy login without collaborator)
  if (!session.collaborator_id && session.role === "superadmin") {
    return true;
  }

  // Check if the role is in the allowed list
  const role = session.role?.toLowerCase() ?? "";
  return ALLOWED_ROLES.includes(role);
}

export function registerAdminAIRoutes(router: Router): void {
  // AI text generation endpoint - SAM admins only
  router.post("/api/admin/ai/generate", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user has AI access (SAM admin only, not partners)
      if (!hasAIAccess(session)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "L'assistant IA est réservé aux administrateurs SAM"
        });
      }

      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "AI service not configured" });
      }

      const { action, text, context } = req.body as {
        action: AIAction;
        text: string;
        context?: string;
      };

      if (!action || !ACTION_PROMPTS[action]) {
        return res.status(400).json({ error: "Invalid action" });
      }

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "Text is required" });
      }

      const systemPrompt = ACTION_PROMPTS[action];
      let userMessage = text.trim();

      if (context && typeof context === "string" && context.trim()) {
        userMessage = `Contexte: ${context.trim()}\n\nTexte: ${userMessage}`;
      }

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: userMessage,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[AI] Anthropic API error:", response.status, errorData);
        return res.status(500).json({ error: "AI service error" });
      }

      const data = await response.json();
      const generatedText = data.content?.[0]?.text ?? "";

      return res.json({
        success: true,
        result: generatedText.trim(),
      });
    } catch (error) {
      console.error("[AI] Generate error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // AI menu extraction endpoint - SAM admins only
  router.post("/api/admin/ai/extract-menu", (async (req, res) => {
    try {
      // Debug: log cookies and headers
      const cookieHeader = req.header("cookie") ?? "";
      console.log("[AI Menu Extraction] Cookie header:", cookieHeader ? `${cookieHeader.slice(0, 100)}...` : "(empty)");
      console.log("[AI Menu Extraction] x-admin-session header:", req.header("x-admin-session") ? "present" : "absent");

      const session = requireAdminSession(req);
      if (!session) {
        console.log("[AI Menu Extraction] No session found - Unauthorized");
        return res.status(401).json({ error: "Unauthorized", debug: "No valid session token found in cookies or headers" });
      }

      console.log("[AI Menu Extraction] Session found:", { role: session.role, collaborator_id: session.collaborator_id });

      // Allow SAM admin team members to use this feature
      if (!hasAIAccess(session)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "L'extraction IA de menu est réservée aux administrateurs SAM"
        });
      }

      if (!ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: "ai_not_configured", message: "Le service IA n'est pas configuré" });
      }

      const { establishmentId, text } = req.body as {
        establishmentId?: string;
        text?: string;
      };

      if (!establishmentId) {
        return res.status(400).json({ error: "establishmentId is required" });
      }

      // Get establishment info for context
      const supabase = getAdminSupabase();
      const { data: establishment, error: estError } = await supabase
        .from("establishments")
        .select("universe, name, subcategory")
        .eq("id", establishmentId)
        .single();

      if (estError || !establishment) {
        return res.status(404).json({ error: "Établissement non trouvé" });
      }

      const universe = (establishment as any)?.universe ?? "restaurant";
      const establishmentName = (establishment as any)?.name ?? "";

      if (!text || typeof text !== "string" || text.trim().length === 0) {
        return res.status(400).json({ error: "text is required" });
      }

      if (text.length > 50000) {
        return res.status(400).json({
          error: "content_too_long",
          message: "Le texte dépasse 50000 caractères"
        });
      }

      const AI_EXTRACTION_SYSTEM_PROMPT = `Tu es un assistant spécialisé dans l'extraction de données de menus et catalogues pour Sortir Au Maroc.

Ta mission est d'analyser le contenu fourni (texte ou image) et d'en extraire :
1. Les catégories (entrées, plats, desserts, boissons, etc.)
2. Les produits/services avec leurs détails (nom, description, prix)

IMPORTANT: Adapte ton analyse au type d'établissement:
- Restaurant: Catégories de plats (Entrées, Plats, Desserts, Boissons, etc.)
- Hôtel/Hébergement: Types de chambres (Simple, Double, Suite, etc.)
- Sport/Bien-être: Types de prestations (Cours, Abonnements, Soins, etc.)
- Location: Types de véhicules (Citadine, SUV, Berline, etc.)
- Loisirs: Types d'activités (Adultes, Enfants, Famille, etc.)

Règles d'extraction:
1. Extrait TOUS les éléments visibles
2. Pour les prix, convertis toujours en nombre (sans "DH", "MAD", etc.)
3. Si un prix contient une fourchette (ex: "50-80 DH"), utilise le prix le plus bas
4. Les descriptions doivent être concises (max 200 caractères)
5. Déduis les catégories logiques si elles ne sont pas explicites
6. Si tu détectes des labels courants (végétarien, épicé, nouveau, etc.), ajoute-les

Réponds UNIQUEMENT avec un objet JSON valide de la forme:
{
  "categories": [
    { "title": "Nom catégorie", "description": "Description optionnelle" }
  ],
  "items": [
    {
      "title": "Nom du produit",
      "description": "Description optionnelle",
      "price": 99.00,
      "category": "Nom de la catégorie",
      "labels": ["label1", "label2"]
    }
  ],
  "confidence": 0.95
}

Labels valides pour restaurants: vegetarien, epice, fruits_de_mer, healthy, traditionnel, specialite, best_seller, nouveaute
Labels valides pour autres: debutant, intermediaire, avance, famille, enfants, adultes, vip, luxe`;

      const userContent = `Établissement: ${establishmentName}\nUnivers: ${universe}\n\nContenu du menu/catalogue à analyser:\n\n${text.trim()}`;

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 8192,
          system: AI_EXTRACTION_SYSTEM_PROMPT,
          messages: [
            {
              role: "user",
              content: userContent,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("[AI Menu Extraction] Anthropic API error:", response.status, errorData);
        return res.status(500).json({ error: "ai_error", message: "Erreur du service IA" });
      }

      const data = await response.json();
      const generatedText = data.content?.[0]?.text ?? "";

      // Parse the JSON response
      type ExtractedMenuItem = {
        title: string;
        description?: string;
        price?: number;
        category?: string;
        labels?: string[];
      };

      type ExtractedCategory = {
        title: string;
        description?: string;
      };

      type AIExtractionResult = {
        categories: ExtractedCategory[];
        items: ExtractedMenuItem[];
        confidence: number;
      };

      let extraction: AIExtractionResult;
      try {
        // Try to extract JSON from the response (handle potential markdown code blocks)
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("No JSON found in response");
        }
        extraction = JSON.parse(jsonMatch[0]);
      } catch (parseError) {
        console.error("[AI Menu Extraction] Parse error:", parseError, generatedText);
        return res.status(500).json({
          error: "parse_error",
          message: "Impossible de parser la réponse de l'IA",
          rawResponse: generatedText.slice(0, 500)
        });
      }

      // Validate and clean the extraction
      const categories = Array.isArray(extraction.categories)
        ? extraction.categories.filter(c => c && typeof c.title === "string" && c.title.trim())
        : [];

      const items = Array.isArray(extraction.items)
        ? extraction.items.filter(i => i && typeof i.title === "string" && i.title.trim()).map(item => ({
            title: item.title.trim(),
            description: typeof item.description === "string" ? item.description.trim().slice(0, 500) : undefined,
            price: typeof item.price === "number" && item.price > 0 ? item.price : undefined,
            category: typeof item.category === "string" ? item.category.trim() : undefined,
            labels: Array.isArray(item.labels) ? item.labels.filter(l => typeof l === "string") : []
          }))
        : [];

      const confidence = typeof extraction.confidence === "number"
        ? Math.min(1, Math.max(0, extraction.confidence))
        : 0.5;

      return res.json({
        ok: true,
        extraction: {
          categories,
          items,
          confidence,
          itemCount: items.length,
          categoryCount: categories.length
        }
      });

    } catch (error) {
      console.error("[AI Menu Extraction] Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);

  // AI image generation endpoint (placeholder for future implementation)
  router.post("/api/admin/ai/generate-image", (async (req, res) => {
    try {
      const session = requireAdminSession(req);
      if (!session) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user has AI access
      if (!hasAIAccess(session)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "L'assistant IA est réservé aux administrateurs SAM"
        });
      }

      // Note: Anthropic ne génère pas d'images directement.
      // Pour la génération d'images, il faudrait intégrer DALL-E, Midjourney API, ou Stable Diffusion.
      return res.status(501).json({
        error: "Image generation not yet implemented",
        message: "Cette fonctionnalité nécessite l'intégration d'un service de génération d'images (DALL-E, Stable Diffusion, etc.)"
      });
    } catch (error) {
      console.error("[AI] Generate image error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }) as RequestHandler);
}
