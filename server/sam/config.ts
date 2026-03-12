/**
 * Sam AI Assistant — Configuration centralisée
 */

export const SAM_CONFIG = {
  // ── Modèles ──

  /** Modèle pour les requêtes complexes (recherche, réservation, tool calls) */
  model: "gpt-4o" as const,

  /** Modèle pour les requêtes simples (greetings, confirmations, follow-ups) */
  modelSimple: "gpt-4o-mini" as const,

  // ── Paramètres GPT ──

  /** Tokens max par réponse (complex) */
  maxTokens: 800,

  /** Tokens max par réponse (simple — plus court = moins cher) */
  maxTokensSimple: 300,

  /** Température complex */
  temperature: 0.7,

  /** Température simple (moins créatif, plus direct) */
  temperatureSimple: 0.5,

  // ── Contexte ──

  /** Nombre max de messages fetchés depuis la DB */
  maxConversationContext: 20,

  /** Nombre de messages récents envoyés à GPT (le reste est résumé) */
  maxRecentMessages: 6,

  /** Nombre max de messages par conversation avant de forcer une nouvelle */
  maxMessagesPerConversation: 50,

  // ── Limites ──

  /** Rate limit : messages par utilisateur par heure */
  rateLimitPerHour: 30,

  // ── Feature flags ──

  /** Feature flag global */
  enabled: process.env.SAM_ENABLED === "true",

  /** Activer le pré-screening off-topic (F3) */
  offTopicScreeningEnabled: true,

  /** Activer le routage adaptatif gpt-4o / gpt-4o-mini (F9) */
  adaptiveRoutingEnabled: true,

  /** Version du system prompt (pour tracking analytics) */
  systemPromptVersion: "2.0",

  /** Nom de l'assistant affiché côté client */
  displayName: "Sam",

  /** Message d'accueil par défaut */
  welcomeMessage: {
    fr: "Salut ! Je suis Sam, ton concierge intelligent. Comment puis-je t'aider ? 🍽️",
    en: "Hi! I'm Sam, your smart concierge. How can I help you? 🍽️",
    ar: "سلام! أنا سام، المساعد الذكي ديالك. كيفاش نقدر نعاونك؟ 🍽️",
  },
} as const;
