/**
 * Admin SQL Import Routes
 *
 * Placeholder for SQL database import functionality.
 * This module will handle imports from SQL databases.
 */

import type { Express, Request, Response } from "express";

/**
 * Register admin SQL import routes
 */
export function registerAdminImportSqlRoutes(app: Express): void {
  // Placeholder route - to be implemented
  app.get("/api/admin/import/sql/status", (_req: Request, res: Response) => {
    res.json({
      available: false,
      message: "SQL import functionality is not yet implemented",
    });
  });
}
