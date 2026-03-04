/**
 * ramadanFlag.ts — Flag localStorage pour le thème Ramadan
 *
 * Permet aux composants hors de l'arbre Index.tsx (ex: Footer)
 * de savoir si le thème Ramadan est actif.
 *
 * Utilise localStorage (au lieu de sessionStorage) pour que le thème
 * soit immédiatement connu au chargement de la page, évitant le flash
 * de thème par défaut (blanc/rouge) avant le retour de l'API.
 */

const RAMADAN_FLAG_KEY = "sam_ramadan_active";
const HOME_THEME_KEY = "sam_home_theme";

/**
 * Marque le thème Ramadan comme actif ou inactif.
 * Appelé depuis Index.tsx après chargement du feed.
 */
export function setRamadanActive(active: boolean): void {
  try {
    if (active) {
      localStorage.setItem(RAMADAN_FLAG_KEY, "1");
    } else {
      localStorage.removeItem(RAMADAN_FLAG_KEY);
    }
  } catch {
    // localStorage peut être indisponible (mode privé, etc.)
  }
}

/**
 * Vérifie si le thème Ramadan est actif.
 * Utilisé par Footer.tsx et autres composants hors arbre Index.tsx.
 */
export function isRamadanActive(): boolean {
  try {
    return localStorage.getItem(RAMADAN_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Persiste le thème courant (ex: "ftour_shour") dans localStorage.
 * Au prochain chargement, getCachedHomeTheme() retourne cette valeur
 * pour éviter le flash de thème par défaut.
 */
export function setCachedHomeTheme(theme: string | null): void {
  try {
    if (theme) {
      localStorage.setItem(HOME_THEME_KEY, theme);
    } else {
      localStorage.removeItem(HOME_THEME_KEY);
    }
  } catch {
    // silent
  }
}

/**
 * Récupère le thème persisté en cache.
 * Retourne null si aucun thème n'est en cache.
 */
export function getCachedHomeTheme(): string | null {
  try {
    return localStorage.getItem(HOME_THEME_KEY);
  } catch {
    return null;
  }
}
