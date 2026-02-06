/**
 * Claim Requests Routes
 * Handles establishment claim requests from users
 */

import type { RequestHandler } from "express";

// ---------------------------------------------------------------------------
// Claim Request Endpoints
// ---------------------------------------------------------------------------

export const submitClaimRequest: RequestHandler = async (req, res) => {
  // TODO: Implement submitting a claim request for an establishment
  res.status(501).json({ error: "Not implemented" });
};
