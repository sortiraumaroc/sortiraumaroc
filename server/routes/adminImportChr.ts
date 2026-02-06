/**
 * Admin CHR Import Routes
 *
 * Placeholder for CHR (Cafés, Hôtels, Restaurants) import functionality.
 * This module will handle bulk imports from various data sources.
 */

import type { Express, Request, Response } from "express";

/**
 * Register admin CHR import routes
 */
export function registerAdminImportChrRoutes(app: Express): void {
  // Placeholder route - to be implemented
  app.get("/api/admin/import/chr/status", (_req: Request, res: Response) => {
    res.json({
      available: false,
      message: "CHR import functionality is not yet implemented",
    });
  });
}
