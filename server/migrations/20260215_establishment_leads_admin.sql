-- Migration: Add admin columns to lead_establishment_requests
-- Date: 2026-02-15
-- Purpose: Allow admin to track/process leads from "Ajouter mon établissement" form

ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE lead_establishment_requests ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Index for admin listing (filter by status, order by date)
CREATE INDEX IF NOT EXISTS idx_lead_establishment_requests_status ON lead_establishment_requests (status);
CREATE INDEX IF NOT EXISTS idx_lead_establishment_requests_created_at ON lead_establishment_requests (created_at DESC);
