/**
 * Get the placeId from localStorage (stored during login)
 * Returns the numeric placeId or null if not found
 */
export function getPlaceIdFromStorage(): number | null {
  try {
    const userStr = localStorage.getItem("client_user");
    if (!userStr) return null;

    const user = JSON.parse(userStr);
    return user.placeId || null;
  } catch {
    return null;
  }
}
