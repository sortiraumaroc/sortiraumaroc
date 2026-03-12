/**
 * Sam AI — Classificateur de messages (sync, < 1ms)
 *
 * Pré-filtre chaque message utilisateur AVANT l'appel OpenAI.
 * 3 classes :
 *   - off_topic  → réponse canned immédiate, 0 coût LLM
 *   - simple     → gpt-4o-mini sans tools (~$0.003)
 *   - complex    → gpt-4o avec tools (~$0.02-0.05)
 *
 * Principe : en cas de doute → "complex" (jamais de faux positif).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageClass = "simple" | "off_topic" | "complex";

// ---------------------------------------------------------------------------
// Mots-clés sam.ma — si présents, on ne bloque JAMAIS le message
// ---------------------------------------------------------------------------

const SAMA_KEYWORDS =
  /resto|restaurant|h[oô]tel|h[eé]bergement|riad|spa|hammam|wellness|r[eé]serv|book|cr[eé]neau|slot|menu|plat|cuisine|manger|d[iî]ner|d[eé]jeuner|brunch|ftour|shour|ramadan|iftar|caf[eé]|bar|lounge|rooftop|terrasse|activit[eé]|loisir|culture|shopping|mus[eé]e|sortie|sam\.ma|pack|promo|offre|note|avis|review|chef|gastronomie|couscous|tajine|pastilla|harira|sushi|pizza|burger|italien|marocain|japonais|fran[cç]ais|chinois|libanais|tha[ïi]|indien|m[eé]diterran/i;

// ---------------------------------------------------------------------------
// Patterns off-topic (hors domaine sam.ma)
// ---------------------------------------------------------------------------

const OFF_TOPIC_PATTERNS: RegExp[] = [
  // Météo
  /m[eé]t[eé]o|temps\s+qu.il\s+fait|pr[eé]vision|pluie\s+demain|temp[eé]rature\s+(?:de|du|[àa])/i,
  // Politique
  /politique|[eé]lection|gouvernement|parlement|parti\s+(?:politique|du)|d[eé]put[eé]|ministre|pr[eé]sident\s+(?:de|du)/i,
  // Code / programmation
  /\b(?:python|javascript|typescript|java|c\+\+|html|css|react|angular|vue\.js|docker|kubernetes)\b/i,
  /(?:code|programm|compil|d[eé]bug|variable|function\s*\(|class\s+\w|import\s+\w|console\.log)/i,
  // Maths / sciences
  /[eé]quation|racine\s+carr[eé]|int[eé]grale|d[eé]riv[eé]e|th[eé]or[eè]me|\d+\s*[\+\-\*\/\^]\s*\d+\s*=/i,
  // Médical
  /m[eé]decin|m[eé]dicament|sympt[oô]me|maladie|ordonnance|h[oô]pital|pharmacie|diagnostic/i,
  // Culture générale déconnectée
  /qui\s+(?:est|a\s+[eé]t[eé])\s+(?:le|la)\s+(?:pr[eé]sident|reine|roi\s+de\s+france|inventeur)/i,
  /capitale\s+(?:de|du)\s+(?:la|le)?\s*\w+\s*\?/i,
  /combien\s+(?:fait|mesure|p[eè]se)\s+/i,
  // Sport (hors contexte)
  /match\s+(?:de|du)|score\s+(?:de|du)|coupe\s+du\s+monde|(?:football|foot|soccer|basket|tennis)\s+(?:ce|aujourd)/i,
  // Finance / crypto
  /bitcoin|crypto|bourse|action\s+(?:en|de)\s+bourse|taux\s+de\s+change|forex/i,
  // Blagues / jeux
  /raconte.+(?:blague|histoire|joke)|devine|jouer\s+[àa]\s+un\s+jeu|[eé]nigme/i,
];

// ---------------------------------------------------------------------------
// Patterns "simple" — messages courts sans intention de recherche
// ---------------------------------------------------------------------------

const GREETING_PATTERN =
  /^(?:bonjour|bonsoir|salut|hello|hi|hey|yo|coucou|salam|slm|wesh|hola|bsr|bjr|ahlan|marhaba)[\s!.,?]*$/i;

const CONFIRMATION_PATTERN =
  /^(?:oui|non|nope|ok|okay|d'accord|daccord|merci|thanks|shukran|choukran|parfait|super|cool|nice|top|g[eé]nial|excellent|c'est\s*bon|c\s*bon|bien\s*re[cç]u|compris|entendu|pas\s*de\s*souci|no\s*worries)[\s!.,?]*$/i;

const FAREWELL_PATTERN =
  /^(?:bye|au\s*revoir|[àa]\s*(?:plus|bient[oô]t|la\s*prochaine)|ciao|bonne\s*(?:soir[eé]e|journ[eé]e|nuit)|merci\s*(?:beaucoup|bien)?[\s!.,]*)$/i;

const SHORT_FILLER_PATTERN =
  /^(?:et\s*\??|ah|oh|hm+|euh|ok[eé]?|ben|bon|bah|voil[àa]|ouais|wé|d'ac|dac|hmm*|lol|mdr|haha|xd)[\s!.,?]*$/i;

// ---------------------------------------------------------------------------
// Classificateur principal
// ---------------------------------------------------------------------------

/**
 * Classifie un message utilisateur en < 1ms.
 *
 * @param message       - Texte brut du message
 * @param lastAssistantHadTools - true si le dernier message assistant avait des tool_calls
 *                                (indique un flow de recherche en cours)
 */
export function classifyMessage(
  message: string,
  lastAssistantHadTools: boolean,
): MessageClass {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // --- Messages très courts (1-2 chars) → simple
  if (trimmed.length <= 2) return "simple";

  // --- Contient des mots-clés sam.ma → JAMAIS off-topic
  const hasSamaContext = SAMA_KEYWORDS.test(trimmed);

  // --- Off-topic check (seulement si pas de contexte sam.ma)
  if (!hasSamaContext) {
    for (const pattern of OFF_TOPIC_PATTERNS) {
      if (pattern.test(trimmed)) {
        return "off_topic";
      }
    }
  }

  // --- Simple : greeting, confirmation, farewell, filler
  if (GREETING_PATTERN.test(trimmed)) return "simple";
  if (CONFIRMATION_PATTERN.test(trimmed)) return "simple";
  if (FAREWELL_PATTERN.test(trimmed)) return "simple";
  if (SHORT_FILLER_PATTERN.test(trimmed)) return "simple";

  // --- Messages courts (< 15 chars) sans mots-clés de recherche
  if (trimmed.length < 15 && !hasSamaContext && !lastAssistantHadTools) {
    return "simple";
  }

  // --- Si le dernier assistant avait des tools → le follow-up est potentiellement complex
  // (ex: "et à Casablanca ?" après une recherche)
  // On laisse passer comme complex pour ne pas perdre le contexte de recherche

  // --- Par défaut → complex (jamais de faux positif)
  return "complex";
}

// ---------------------------------------------------------------------------
// Réponses off-topic (variées pour ne pas être robotique)
// ---------------------------------------------------------------------------

const OFF_TOPIC_RESPONSES = [
  "Je suis Sam, ton concierge intelligent pour les meilleures adresses au Maroc ! Dis-moi ce que tu cherches : restaurant, hôtel, spa, activité... je m'occupe de tout.",
  "Hmm, ça sort un peu de mon domaine ! Moi je suis là pour te trouver les meilleurs restos, hôtels et activités au Maroc. Qu'est-ce qui te ferait plaisir ?",
  "Je suis spécialisé dans les bonnes adresses marocaines ! Restaurant, hôtel, spa, loisirs... dis-moi ce que tu cherches et je te trouve ça.",
  "Ce n'est pas vraiment mon rayon ! Par contre, si tu cherches un bon restaurant, un hôtel ou une activité au Maroc, je suis ton homme. Qu'est-ce qui t'intéresse ?",
];

let _offTopicIdx = 0;

/** Retourne une réponse off-topic cyclique (pas de random → déterministe pour les tests) */
export function getOffTopicResponse(): string {
  const response = OFF_TOPIC_RESPONSES[_offTopicIdx % OFF_TOPIC_RESPONSES.length];
  _offTopicIdx++;
  return response;
}
