import type { RequestHandler, Router } from "express";
import { parseCookies, getSessionCookieName, verifyAdminSessionToken, type AdminSessionPayload } from "../adminSession";

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
