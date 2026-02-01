export const PRO_SELECTED_ESTABLISHMENT_ID_KEY = "sam_pro_selected_establishment_id_v1";

export function readSelectedEstablishmentId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const v = window.localStorage.getItem(PRO_SELECTED_ESTABLISHMENT_ID_KEY);
    const trimmed = v?.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export function writeSelectedEstablishmentId(id: string | null) {
  if (typeof window === "undefined") return;

  try {
    const trimmed = id?.trim();
    if (!trimmed) {
      window.localStorage.removeItem(PRO_SELECTED_ESTABLISHMENT_ID_KEY);
      return;
    }

    window.localStorage.setItem(PRO_SELECTED_ESTABLISHMENT_ID_KEY, trimmed);
  } catch {
    // ignore storage errors
  }
}
