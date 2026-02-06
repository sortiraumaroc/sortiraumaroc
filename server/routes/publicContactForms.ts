/**
 * Public Contact Forms Routes
 * Handles public-facing contact form retrieval and submission
 */

import type { RequestHandler } from "express";

// ---------------------------------------------------------------------------
// Public Contact Form Endpoints
// ---------------------------------------------------------------------------

export const getPublicContactForm: RequestHandler = async (req, res) => {
  // TODO: Implement getting a contact form by slug/ID for public display
  res.status(501).json({ error: "Not implemented" });
};

export const submitPublicContactForm: RequestHandler = async (req, res) => {
  // TODO: Implement submitting a contact form (public endpoint)
  res.status(501).json({ error: "Not implemented" });
};

export const getPublicCountriesList: RequestHandler = async (req, res) => {
  // TODO: Implement getting list of countries for form dropdowns
  res.status(501).json({ error: "Not implemented" });
};
