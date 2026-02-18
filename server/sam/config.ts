/**
 * Sam AI Assistant — Configuration centralisée
 */

export const SAM_CONFIG = {
  /** Modèle OpenAI à utiliser */
  model: "gpt-4o-mini" as const,

  /** Tokens max par réponse */
  maxTokens: 500,

  /** Température (créativité) */
  temperature: 0.7,

  /** Nombre max de messages d'historique envoyés à GPT pour le contexte */
  maxConversationContext: 20,

  /** Nombre max de messages par conversation avant de forcer une nouvelle */
  maxMessagesPerConversation: 50,

  /** Rate limit : messages par utilisateur par heure */
  rateLimitPerHour: 30,

  /** Feature flag global */
  enabled: process.env.SAM_ENABLED === "true",

  /** Version du system prompt (pour tracking analytics) */
  systemPromptVersion: "1.0",

  /** Nom de l'assistant affiché côté client */
  displayName: "Sam",

  /** Message d'accueil par défaut */
  welcomeMessage: {
    fr: "Salut ! Je suis Sam, ton concierge intelligent. Comment puis-je t'aider ? 🍽️",
    en: "Hi! I'm Sam, your smart concierge. How can I help you? 🍽️",
    ar: "سلام! أنا سام، المساعد الذكي ديالك. كيفاش نقدر نعاونك؟ 🍽️",
  },
} as const;
