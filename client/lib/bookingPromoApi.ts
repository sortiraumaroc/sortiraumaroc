/**
 * API client for booking promo code validation.
 */

export type ValidatePromoCodeResponse = {
  valid: boolean;
  discount_bps?: number;
  discount_percent?: number;
  message?: string;
  promo_id?: string;
};

/**
 * Validate a promo code for a booking/reservation.
 *
 * @param code - The promo code to validate
 * @param establishmentId - Optional establishment ID for scoped validation
 * @returns Validation result with discount info if valid
 */
export async function validateBookingPromoCode(
  code: string,
  establishmentId?: string | null
): Promise<ValidatePromoCodeResponse> {
  try {
    const res = await fetch("/api/public/booking/promo/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: code.trim().toUpperCase(),
        establishmentId: establishmentId ?? undefined,
      }),
    });

    if (!res.ok) {
      return {
        valid: false,
        message: "Erreur lors de la validation du code promo",
      };
    }

    const data = await res.json();
    return data as ValidatePromoCodeResponse;
  } catch {
    return {
      valid: false,
      message: "Impossible de valider le code promo. Vérifiez votre connexion.",
    };
  }
}
