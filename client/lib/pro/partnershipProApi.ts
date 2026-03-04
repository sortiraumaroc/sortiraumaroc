/**
 * Partnership Pro API — Pro-side helpers for viewing & managing partnership agreements
 *
 * Reuses proApiFetch for authentication + error handling.
 */

import type {
  ProAgreementView,
  ProAgreementLineView,
} from "../../../shared/partnershipTypes";
import { proApiFetch } from "./api";

// =============================================================================
// Read
// =============================================================================

/** GET /api/pro/partnership — Retrieve the agreement for the given establishment */
export async function getProPartnership(
  establishmentId: string,
): Promise<{ ok: true; data: ProAgreementView }> {
  return proApiFetch(`/api/pro/partnership?establishment_id=${encodeURIComponent(establishmentId)}`);
}

/** GET /api/pro/partnership/lines — Retrieve agreement lines for the given establishment */
export async function getProPartnershipLines(
  establishmentId: string,
): Promise<{ ok: true; data: ProAgreementLineView[] }> {
  return proApiFetch(`/api/pro/partnership/lines?establishment_id=${encodeURIComponent(establishmentId)}`);
}

// =============================================================================
// Actions
// =============================================================================

/** POST /api/pro/partnership/accept — Accept the agreement */
export async function acceptProPartnership(
  establishmentId: string,
): Promise<{ ok: true }> {
  return proApiFetch("/api/pro/partnership/accept", {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId }),
  });
}

/** POST /api/pro/partnership/refuse — Refuse the agreement */
export async function refuseProPartnership(
  establishmentId: string,
  reason?: string,
): Promise<{ ok: true }> {
  return proApiFetch("/api/pro/partnership/refuse", {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId, reason }),
  });
}

/** POST /api/pro/partnership/request-modification — Request modification */
export async function requestProPartnershipModification(
  establishmentId: string,
  comment: string,
): Promise<{ ok: true }> {
  return proApiFetch("/api/pro/partnership/request-modification", {
    method: "POST",
    body: JSON.stringify({ establishment_id: establishmentId, comment }),
  });
}

/** PUT /api/pro/partnership/lines/:lineId/toggle — Toggle a line on/off */
export async function toggleProPartnershipLine(
  lineId: string,
  establishmentId: string,
): Promise<{ ok: true }> {
  return proApiFetch(`/api/pro/partnership/lines/${encodeURIComponent(lineId)}/toggle`, {
    method: "PUT",
    body: JSON.stringify({ establishment_id: establishmentId }),
  });
}
