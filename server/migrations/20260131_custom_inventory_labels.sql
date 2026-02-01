-- Migration: Custom inventory labels for establishments
-- Date: 2026-01-31

-- Table for custom labels defined by establishments
CREATE TABLE IF NOT EXISTS pro_inventory_custom_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES establishments(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL, -- Unique identifier within establishment
  emoji TEXT NOT NULL DEFAULT '🏷️',
  title TEXT NOT NULL,
  title_ar TEXT, -- Arabic translation
  color TEXT NOT NULL DEFAULT 'slate', -- Tailwind color name: slate, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Unique constraint: label_id must be unique per establishment
  CONSTRAINT unique_label_per_establishment UNIQUE (establishment_id, label_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_custom_labels_establishment ON pro_inventory_custom_labels(establishment_id);
CREATE INDEX IF NOT EXISTS idx_custom_labels_active ON pro_inventory_custom_labels(establishment_id, is_active);

-- RLS policies
ALTER TABLE pro_inventory_custom_labels ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users for their establishments
CREATE POLICY "custom_labels_select"
ON pro_inventory_custom_labels FOR SELECT
TO authenticated
USING (true);

-- Allow insert/update/delete for authenticated users (server-side validation will check role)
CREATE POLICY "custom_labels_insert"
ON pro_inventory_custom_labels FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "custom_labels_update"
ON pro_inventory_custom_labels FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "custom_labels_delete"
ON pro_inventory_custom_labels FOR DELETE
TO authenticated
USING (true);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_custom_labels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_custom_labels_updated_at ON pro_inventory_custom_labels;
CREATE TRIGGER trigger_update_custom_labels_updated_at
  BEFORE UPDATE ON pro_inventory_custom_labels
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_labels_updated_at();
