/**
 * Sam AI — Système de mood dynamique
 *
 * Détermine l'expression du Memoji de Sam en fonction du contexte du message.
 * Les 4 moods correspondent aux 4 avatars dans public/ :
 *
 *   joyeux     → conversation normale, salutations, réponses positives
 *   clin_doeil → Sam a trouvé des résultats, recommandations, réservation confirmée
 *   triste     → pas de résultat, impossible d'effectuer une tâche, erreur
 *   surpris    → question hors sujet, Sam ne sait pas, sujet inattendu
 */

export type SamMood = "joyeux" | "clin_doeil" | "triste" | "surpris";

/** Map mood → chemin de l'image avatar */
export const SAM_AVATARS: Record<SamMood, string> = {
  joyeux: "/avatar_joyeux.png",
  clin_doeil: "/avatar_clin_d'oeil.png",
  triste: "/avatar_triste.png",
  surpris: "/avatar_supris.png",
};

/** Avatar par défaut (joyeux) */
export const SAM_DEFAULT_AVATAR = SAM_AVATARS.joyeux;

// ---------------------------------------------------------------------------
// Détection du mood à partir du contenu du message
// ---------------------------------------------------------------------------

const TRISTE_PATTERNS = [
  /aucun résultat/i,
  /pas trouvé/i,
  /pas de résultat/i,
  /rien trouvé/i,
  /malheureusement/i,
  /désolé/i,
  /impossible/i,
  /pas disponible/i,
  /pas possible/i,
  /aucun établissement/i,
  /aucune disponibilit/i,
  /pas d['']établissement/i,
  /je ne peux pas/i,
  /indisponible/i,
  /complet/i,
  /fermé/i,
  /ma3endish/i,
  /ma3raftsh/i,
  /makaynsh/i,
  /sorry/i,
  /unfortunately/i,
  /no results?/i,
  /not found/i,
  /couldn['']t find/i,
  /not available/i,
];

const SURPRIS_PATTERNS = [
  /hors.?sujet/i,
  /ne concerne pas/i,
  /pas dans mes compétences/i,
  /je suis un concierge/i,
  /je suis spécialisé/i,
  /je ne suis pas en mesure/i,
  /pas mon domaine/i,
  /intéressant comme question/i,
  /bonne question/i,
  /drôle/i,
  /haha/i,
  /wow/i,
  /oh/i,
  /c['']est une question/i,
  /I['']m a concierge/i,
  /that['']s outside/i,
  /not something I/i,
];

const CLIN_DOEIL_PATTERNS = [
  /voici/i,
  /j['']ai trouvé/i,
  /je te recommande/i,
  /je te propose/i,
  /excellente? choix/i,
  /bonne? choix/i,
  /parfait/i,
  /réservation.*confirmée?/i,
  /réservé/i,
  /c['']est fait/i,
  /et voilà/i,
  /bon appétit/i,
  /profite/i,
  /ta réservation/i,
  /tendance/i,
  /populaire/i,
  /coup de cœur/i,
  /incontournable/i,
  /3endek/i,
  /hak/i,
  /here.*are/i,
  /found.*for you/i,
  /I recommend/i,
  /check.*out/i,
  /confirmed/i,
];

/**
 * Détermine le mood de Sam à partir du contenu du message.
 *
 * @param content - Le texte du message assistant
 * @param hasEstablishments - Si le message contient des cartes d'établissements
 * @param isError - Si le message est une erreur
 */
export function detectSamMood(
  content: string,
  hasEstablishments = false,
  isError = false,
): SamMood {
  // Erreurs → triste
  if (isError) return "triste";

  // Message vide ou en cours de chargement → joyeux par défaut
  if (!content.trim()) return "joyeux";

  // Si des établissements sont affichés → clin d'oeil (il a trouvé !)
  if (hasEstablishments) return "clin_doeil";

  // Vérifier les patterns triste en premier (priorité sur les autres)
  if (TRISTE_PATTERNS.some((p) => p.test(content))) return "triste";

  // Vérifier hors sujet / surprise
  if (SURPRIS_PATTERNS.some((p) => p.test(content))) return "surpris";

  // Vérifier clin d'oeil (résultats, recommandations)
  if (CLIN_DOEIL_PATTERNS.some((p) => p.test(content))) return "clin_doeil";

  // Par défaut → joyeux
  return "joyeux";
}

/**
 * Retourne le chemin de l'avatar correspondant au mood.
 */
export function getSamAvatarForMood(mood: SamMood): string {
  return SAM_AVATARS[mood];
}
