/**
 * QR Code generation utility
 * Uses QR Server API for Phase 1 (no external dependencies)
 * Can be replaced with a library in Phase 2 if needed
 */

export const generateQRCode = (text: string): string => {
  // QR Server API - free, no auth required
  // Returns a PNG image URL
  const encodedText = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodedText}`;
};

/**
 * Generate a booking QR code payload
 * Format: SAM:<bookingReference>
 */
export type BookingQrMeta = {
  partySize?: number;
  unitMad?: number;
  totalMad?: number;
};

export type PackQrMeta = {
  packId?: string;
  validUntilIso?: string;
  totalMad?: number;
};

/**
 * @deprecated Use personal TOTP QR code instead
 */
export const generateBookingQRPayload = (bookingReference: string, meta?: BookingQrMeta): string => {
  const ref = String(bookingReference ?? "").trim();
  const parts: string[] = [`ref=${ref}`];

  const partySize = meta?.partySize;
  const unitMad = meta?.unitMad;
  const totalMad = meta?.totalMad;

  if (typeof partySize === "number" && Number.isFinite(partySize) && partySize > 0) parts.push(`pers=${Math.round(partySize)}`);
  if (typeof unitMad === "number" && Number.isFinite(unitMad) && unitMad > 0) parts.push(`prepay_unit_mad=${Math.round(unitMad)}`);
  if (typeof totalMad === "number" && Number.isFinite(totalMad) && totalMad > 0) parts.push(`prepay_total_mad=${Math.round(totalMad)}`);

  return `SAM:${parts.join("|")}`;
};

/**
 * Get complete QR code image URL for a booking
 * @deprecated Use personal TOTP QR code via /mon-qr instead
 */
export const getBookingQRCodeUrl = (bookingReference: string, meta?: BookingQrMeta): string => {
  const payload = generateBookingQRPayload(bookingReference, meta);
  return generateQRCode(payload);
};

/**
 * @deprecated Use personal TOTP QR code instead
 */
export const generatePackQRPayload = (purchaseId: string, meta?: PackQrMeta): string => {
  const ref = String(purchaseId ?? "").trim();
  const parts: string[] = [`ref=${ref}`];

  const packId = meta?.packId;
  const validUntilIso = meta?.validUntilIso;
  const totalMad = meta?.totalMad;

  if (typeof packId === "string" && packId.trim()) parts.push(`pack=${packId.trim()}`);

  if (typeof validUntilIso === "string" && validUntilIso.trim()) {
    const t = validUntilIso.trim();
    parts.push(`valid_until=${t}`);
  }

  if (typeof totalMad === "number" && Number.isFinite(totalMad) && totalMad > 0) parts.push(`total_mad=${Math.round(totalMad)}`);

  return `SAMPACK:${parts.join("|")}`;
};

/**
 * @deprecated Use personal TOTP QR code via /mon-qr instead
 */
export const getPackQRCodeUrl = (purchaseId: string, meta?: PackQrMeta): string => {
  const payload = generatePackQRPayload(purchaseId, meta);
  return generateQRCode(payload);
};
