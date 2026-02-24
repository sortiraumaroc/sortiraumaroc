/**
 * Sam AI Assistant — Tools (Functions) pour GPT-4o-mini
 *
 * Chaque tool est défini avec son schéma OpenAI + sa fonction d'exécution.
 * Les tools appellent samDataAccess.ts pour accéder à la base de données.
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import {
  searchEstablishments,
  getEstablishmentDetails,
  getAvailableSlots,
  createReservation,
  getUserReservations,
  getTrendingEstablishments,
  getCategories,
  getUserProfile,
  getPopularSearches,
  getEstablishmentReviews,
  getEstablishmentPacks,
} from "../lib/samDataAccess";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("samTools");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolContext {
  userId: string | null;
  isAuthenticated: boolean;
  /** ID de la conversation — utilisé par la gate de confirmation create_booking */
  conversationId?: string;
}

// ---------------------------------------------------------------------------
// Gate de confirmation — vérifie les derniers messages avant de réserver
// ---------------------------------------------------------------------------

const CONFIRMATION_KEYWORDS = [
  "oui", "yes", "confirme", "confirmer", "go", "d'accord", "daccord",
  "okay", "ok", "c'est bon", "c bon", "parfait", "valide", "reserve",
  "réserve", "je confirme", "allez", "yep", "yup", "envoie", "lance",
];

/**
 * Vérifie que l'utilisateur a donné une confirmation explicite dans les
 * derniers messages de la conversation AVANT d'appeler create_booking.
 */
async function hasUserConfirmation(conversationId: string): Promise<boolean> {
  try {
    const supabase = getAdminSupabase();
    // Récupérer les 4 derniers messages (assistant recap + user confirm + éventuels intermédiaires)
    const { data: msgs } = await supabase
      .from("sam_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(4);

    if (!msgs || msgs.length === 0) return false;

    // Chercher un message "user" contenant un mot de confirmation
    const userMsgs = msgs.filter((m: any) => m.role === "user" && m.content);
    for (const msg of userMsgs) {
      const lower = (msg.content as string).toLowerCase().trim();
      if (CONFIRMATION_KEYWORDS.some((kw) => lower.includes(kw))) {
        return true;
      }
    }
    return false;
  } catch (err) {
    log.warn({ err }, "Best-effort: booking confirmation check failed, allowing");
    return true;
  }
}

export interface ToolResult {
  data: unknown;
  /** Si true, le frontend doit afficher des cartes d'établissements */
  hasEstablishments?: boolean;
  /** Si true, l'utilisateur doit se connecter pour continuer */
  authRequired?: boolean;
}

// ---------------------------------------------------------------------------
// Définitions OpenAI (JSON Schema pour function calling)
// ---------------------------------------------------------------------------

export const SAM_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_establishments",
      description:
        "Chercher des établissements (restaurants, hôtels, spas, loisirs, etc.) par critères. Utilise cette fonction dès que l'utilisateur cherche un lieu.",
      parameters: {
        type: "object",
        properties: {
          q: {
            type: "string",
            description:
              "Terme de recherche libre : nom d'établissement, quartier, ambiance. NE PAS mettre le type de cuisine ici — utilise 'category' pour ça.",
          },
          city: {
            type: "string",
            description:
              "Ville (ex: Marrakech, Casablanca, Rabat, Agadir, Tanger, Fès...)",
          },
          universe: {
            type: "string",
            enum: [
              "restaurants",
              "hebergement",
              "wellness",
              "loisirs",
              "culture",
              "shopping",
            ],
            description: "Type d'établissement",
          },
          category: {
            type: "string",
            description:
              "Type de cuisine ou sous-catégorie. OBLIGATOIRE quand l'utilisateur mentionne une cuisine (ex: marocain, italien, japonais, chinois, libanais, thaï, indien, français, pizza, sushi, burger) ou un type de lieu (spa, hammam, musée, galerie, riad, boutique). Exemples : 'marocain', 'italien', 'sushi', 'spa'.",
          },
          sort: {
            type: "string",
            enum: ["best", "recent", "promo"],
            description: "Tri des résultats",
          },
          promo_only: {
            type: "boolean",
            description: "Ne montrer que les établissements avec des promotions",
          },
          limit: {
            type: "number",
            description: "Nombre max de résultats (1-10, défaut 5)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_establishment_details",
      description:
        "Obtenir les détails complets d'un établissement : description, horaires, adresse, téléphone, créneaux disponibles, note Google.",
      parameters: {
        type: "object",
        properties: {
          establishment_ref: {
            type: "string",
            description: "ID (UUID), slug ou nom de l'établissement",
          },
        },
        required: ["establishment_ref"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Vérifier les créneaux disponibles pour un établissement à une date donnée.",
      parameters: {
        type: "object",
        properties: {
          establishment_id: {
            type: "string",
            description: "ID de l'établissement",
          },
          date: {
            type: "string",
            description: "Date au format YYYY-MM-DD",
          },
        },
        required: ["establishment_id", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_booking",
      description:
        "Créer une réservation. ATTENTION : n'appeler cette fonction QUE après avoir reçu une confirmation EXPLICITE de l'utilisateur (oui, confirme, go, d'accord).",
      parameters: {
        type: "object",
        properties: {
          establishment_id: {
            type: "string",
            description: "ID de l'établissement",
          },
          slot_id: {
            type: "string",
            description: "ID du créneau choisi",
          },
          starts_at: {
            type: "string",
            description: "Date et heure ISO du créneau",
          },
          party_size: {
            type: "number",
            description: "Nombre de personnes",
          },
        },
        required: ["establishment_id", "slot_id", "starts_at", "party_size"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_bookings",
      description:
        "Obtenir les réservations de l'utilisateur connecté (à venir, passées ou toutes).",
      parameters: {
        type: "object",
        properties: {
          filter: {
            type: "string",
            enum: ["upcoming", "past", "all"],
            description: "Filtrer par statut temporel (défaut: upcoming)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trending",
      description:
        "Obtenir les établissements tendance et populaires du moment.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "Filtrer par ville",
          },
          universe: {
            type: "string",
            enum: [
              "restaurants",
              "hebergement",
              "wellness",
              "loisirs",
              "culture",
              "shopping",
            ],
            description: "Filtrer par type",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_categories",
      description:
        "Obtenir la liste des catégories disponibles (types de cuisine, activités, etc.) avec le nombre d'établissements.",
      parameters: {
        type: "object",
        properties: {
          universe: {
            type: "string",
            enum: [
              "restaurants",
              "hebergement",
              "wellness",
              "loisirs",
              "culture",
              "shopping",
            ],
            description: "Filtrer par univers",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_profile",
      description:
        "Obtenir le profil de l'utilisateur connecté (nom, ville, préférences, score).",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_popular_searches",
      description:
        "Obtenir les recherches populaires du moment pour inspirer l'utilisateur.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "Filtrer par ville",
          },
          universe: {
            type: "string",
            enum: [
              "restaurants",
              "hebergement",
              "wellness",
              "loisirs",
              "culture",
              "shopping",
            ],
            description: "Filtrer par univers",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_establishment_reviews",
      description:
        "Obtenir les avis des utilisateurs sam.ma pour un établissement. Inclut la note moyenne et les derniers commentaires.",
      parameters: {
        type: "object",
        properties: {
          establishment_id: {
            type: "string",
            description: "ID de l'établissement",
          },
          limit: {
            type: "number",
            description: "Nombre max d'avis à retourner (1-10, défaut 5)",
          },
        },
        required: ["establishment_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_establishment_packs",
      description:
        "Obtenir les packs et offres disponibles d'un établissement (menus, forfaits, expériences achetables en ligne). Utilise cette fonction quand l'utilisateur demande les offres, promotions, packs ou deals d'un lieu.",
      parameters: {
        type: "object",
        properties: {
          establishment_id: {
            type: "string",
            description: "ID de l'établissement",
          },
        },
        required: ["establishment_id"],
      },
    },
  },
  // --- Intelligence tools ---
  {
    type: "function",
    function: {
      name: "update_user_preferences",
      description:
        "Mettre à jour les préférences de l'utilisateur que tu as inférées au fil de la conversation (cuisines préférées, budget, quartiers, allergies, taille de groupe habituelle). Appelle cette fonction quand l'utilisateur mentionne des goûts ou des contraintes.",
      parameters: {
        type: "object",
        properties: {
          cuisines: {
            type: "array",
            items: { type: "string" },
            description: "Cuisines préférées (ex: marocain, japonais, italien)",
          },
          budget: {
            type: "string",
            enum: ["economique", "moyen", "haut_de_gamme"],
            description: "Niveau de budget",
          },
          quartiers: {
            type: "array",
            items: { type: "string" },
            description: "Quartiers préférés (ex: Guéliz, Hivernage, Maarif)",
          },
          allergies: {
            type: "array",
            items: { type: "string" },
            description: "Allergies ou restrictions alimentaires",
          },
          party_size_usual: {
            type: "number",
            description: "Nombre de personnes habituel",
          },
          occasion: {
            type: "string",
            description: "Type d'occasion mentionné (romantique, business, famille, amis, anniversaire)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "surprise_me",
      description:
        "Mode 'Surprise-moi' : recommander 1-2 établissements basés sur les préférences de l'utilisateur, en évitant ceux qu'il a déjà visités. Utilise cette fonction quand l'utilisateur dit 'surprise-moi', 'choisis pour moi', 'je ne sais pas', ou exprime de l'indécision.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: "Ville (utilise celle de l'utilisateur si connue)",
          },
          universe: {
            type: "string",
            enum: [
              "restaurants",
              "hebergement",
              "wellness",
              "loisirs",
              "culture",
              "shopping",
            ],
            description: "Type d'établissement (défaut: restaurants)",
          },
          exclude_ids: {
            type: "array",
            items: { type: "string" },
            description: "IDs d'établissements déjà recommandés dans cette conversation à éviter",
          },
        },
        required: [],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool selection by mode (general vs establishment-scoped)
// ---------------------------------------------------------------------------

/**
 * Retourne les tools appropriés selon le mode.
 * En mode scoped (establishment page), on retire les tools de recherche générale
 * car toutes les infos sont déjà injectées dans le system prompt.
 */
export function getToolsForMode(
  establishmentId?: string,
): ChatCompletionTool[] {
  if (!establishmentId) return SAM_TOOLS;

  const SCOPED_EXCLUDED = new Set([
    "search_establishments",
    "get_trending",
    "get_categories",
    "get_popular_searches",
    "surprise_me",
    "get_establishment_details", // Déjà dans le prompt
    "get_establishment_packs", // Déjà dans le prompt
  ]);

  return SAM_TOOLS.filter(
    (t) => !SCOPED_EXCLUDED.has(t.function.name),
  );
}

// ---------------------------------------------------------------------------
// Exécution des tools
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "search_establishments": {
      const result = await searchEstablishments({
        q: args.q as string | undefined,
        city: args.city as string | undefined,
        universe: args.universe as string | undefined,
        category: args.category as string | undefined,
        sort: args.sort as string | undefined,
        promoOnly: args.promo_only as boolean | undefined,
        limit: args.limit as number | undefined,
      });
      return { data: result, hasEstablishments: result.establishments.length > 0 };
    }

    case "get_establishment_details": {
      const ref = args.establishment_ref as string;
      if (!ref) return { data: { error: "missing_establishment_ref" } };
      const result = await getEstablishmentDetails(ref);
      if (!result) return { data: { error: "establishment_not_found" } };
      return { data: result };
    }

    case "check_availability": {
      const estId = args.establishment_id as string;
      const date = args.date as string;
      if (!estId || !date) return { data: { error: "missing_params" } };
      const result = await getAvailableSlots(estId, date);
      if (!result) return { data: { error: "no_slots_found", message: "Aucun créneau disponible pour cette date." } };
      return { data: result };
    }

    case "create_booking": {
      // 1. Auth check
      if (!context.isAuthenticated || !context.userId) {
        return { data: { error: "auth_required", message: "L'utilisateur doit se connecter pour réserver." }, authRequired: true };
      }

      // 2. Gate de confirmation — vérifier que l'utilisateur a dit "oui"
      if (context.conversationId) {
        const confirmed = await hasUserConfirmation(context.conversationId);
        if (!confirmed) {
          return {
            data: {
              error: "missing_confirmation",
              message: "L'utilisateur n'a pas encore confirmé la réservation. Demande-lui explicitement avant de réserver.",
            },
          };
        }
      }

      // 3. Validate params
      const estId = args.establishment_id as string;
      const slotId = args.slot_id as string;
      const startsAt = args.starts_at as string;
      const partySize = args.party_size as number;

      if (!estId || !slotId || !startsAt || !partySize) {
        return { data: { error: "missing_params" } };
      }

      // 4. Create reservation
      const result = await createReservation({
        userId: context.userId,
        establishmentId: estId,
        slotId,
        startsAt,
        partySize,
        meta: { source: "sam_assistant" },
      });

      return { data: result };
    }

    case "get_user_bookings": {
      if (!context.isAuthenticated || !context.userId) {
        return { data: { error: "auth_required", message: "L'utilisateur doit se connecter pour voir ses réservations." }, authRequired: true };
      }
      const filter = (args.filter as "upcoming" | "past" | "all") ?? "upcoming";
      const result = await getUserReservations(context.userId, filter);
      return { data: { reservations: result } };
    }

    case "get_trending": {
      const result = await getTrendingEstablishments(
        args.city as string | undefined,
        args.universe as string | undefined,
      );
      return { data: { establishments: result }, hasEstablishments: result.length > 0 };
    }

    case "get_categories": {
      const result = await getCategories(args.universe as string | undefined);
      return { data: { categories: result } };
    }

    case "get_user_profile": {
      if (!context.isAuthenticated || !context.userId) {
        return { data: { error: "auth_required" }, authRequired: true };
      }
      const result = await getUserProfile(context.userId);
      return { data: result ?? { error: "profile_not_found" } };
    }

    case "get_popular_searches": {
      const result = await getPopularSearches(
        args.city as string | undefined,
        args.universe as string | undefined,
      );
      return { data: { searches: result } };
    }

    case "get_establishment_reviews": {
      const estId = args.establishment_id as string;
      if (!estId) return { data: { error: "missing_establishment_id" } };
      const lim = Math.min(10, Math.max(1, (args.limit as number) ?? 5));
      const result = await getEstablishmentReviews(estId, lim);
      return { data: result };
    }

    case "get_establishment_packs": {
      const estId = args.establishment_id as string;
      if (!estId) return { data: { error: "missing_establishment_id" } };
      const result = await getEstablishmentPacks(estId);
      return { data: result };
    }

    // --- Intelligence tools ---

    case "update_user_preferences": {
      // Stocker les préférences inférées dans sam_conversations.metadata
      if (!context.conversationId) {
        return { data: { ok: true, note: "No conversation to store preferences" } };
      }
      try {
        const supabase = getAdminSupabase();
        // Récupérer les metadata existantes
        const { data: conv } = await supabase
          .from("sam_conversations")
          .select("metadata")
          .eq("id", context.conversationId)
          .single();

        const existing = (conv?.metadata as Record<string, unknown>) ?? {};
        const preferences = (existing.preferences as Record<string, unknown>) ?? {};

        // Merger les nouvelles préférences (ajouter, pas remplacer les arrays)
        const updated: Record<string, unknown> = { ...preferences };
        if (args.cuisines) {
          const prev = (preferences.cuisines as string[]) ?? [];
          updated.cuisines = [...new Set([...prev, ...(args.cuisines as string[])])];
        }
        if (args.budget) updated.budget = args.budget;
        if (args.quartiers) {
          const prev = (preferences.quartiers as string[]) ?? [];
          updated.quartiers = [...new Set([...prev, ...(args.quartiers as string[])])];
        }
        if (args.allergies) {
          const prev = (preferences.allergies as string[]) ?? [];
          updated.allergies = [...new Set([...prev, ...(args.allergies as string[])])];
        }
        if (args.party_size_usual) updated.party_size_usual = args.party_size_usual;
        if (args.occasion) updated.last_occasion = args.occasion;

        await supabase
          .from("sam_conversations")
          .update({ metadata: { ...existing, preferences: updated } })
          .eq("id", context.conversationId);

        return { data: { ok: true, preferences: updated } };
      } catch (err) {
        log.warn({ err }, "Failed to persist user preferences");
        return { data: { ok: true, note: "Failed to persist preferences" } };
      }
    }

    case "surprise_me": {
      // Chercher les meilleurs établissements en filtrant les déjà recommandés
      const city = args.city as string | undefined;
      const universe = (args.universe as string) ?? "restaurants";
      const excludeIds = (args.exclude_ids as string[]) ?? [];

      // Récupérer les préférences de la conversation si disponibles
      let preferences: Record<string, unknown> = {};
      if (context.conversationId) {
        try {
          const supabase = getAdminSupabase();
          const { data: conv } = await supabase
            .from("sam_conversations")
            .select("metadata")
            .eq("id", context.conversationId)
            .single();
          preferences = ((conv?.metadata as any)?.preferences as Record<string, unknown>) ?? {};
        } catch { /* intentional: conversation metadata may not exist */ }
      }

      // Recherche avec tri "best" pour avoir les mieux notés
      const result = await searchEstablishments({
        city,
        universe,
        category: preferences.cuisines
          ? (preferences.cuisines as string[])[0]
          : undefined,
        sort: "best",
        limit: 5,
      });

      // Filtrer les exclus et prendre 1-2
      const filtered = result.establishments
        .filter((e: any) => !excludeIds.includes(e.id))
        .slice(0, 2);

      return {
        data: {
          establishments: filtered,
          total: filtered.length,
          surprise: true,
          used_preferences: Object.keys(preferences).length > 0,
        },
        hasEstablishments: filtered.length > 0,
      };
    }

    default:
      return { data: { error: "unknown_tool", name } };
  }
}
