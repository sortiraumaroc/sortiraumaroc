-- Countries table for multi-country support
-- Allows the platform to operate in multiple countries with automatic detection

CREATE TABLE IF NOT EXISTS countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_en TEXT, -- English name for international users
  code TEXT NOT NULL UNIQUE, -- ISO 3166-1 alpha-2 code (MA, FR, AE, etc.)
  flag_emoji TEXT, -- 🇲🇦, 🇫🇷, etc.
  currency_code TEXT DEFAULT 'MAD', -- ISO 4217 currency code
  phone_prefix TEXT, -- +212, +33, etc.
  default_locale TEXT DEFAULT 'fr', -- Default language
  timezone TEXT DEFAULT 'Africa/Casablanca',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Only one country can be default
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default country
CREATE UNIQUE INDEX idx_countries_default ON countries (is_default) WHERE is_default = true;

-- Index for active countries sorted
CREATE INDEX idx_countries_active_sorted ON countries (is_active, sort_order);

-- Index for country code lookup
CREATE INDEX idx_countries_code ON countries (code);

-- Add country_code to home_cities
ALTER TABLE home_cities ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'MA';

-- Index for cities by country
CREATE INDEX IF NOT EXISTS idx_home_cities_country ON home_cities (country_code, is_active, sort_order);

-- Enable RLS
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

-- Public read access for active countries
CREATE POLICY "Public read access for active countries"
  ON countries FOR SELECT
  USING (is_active = true);

-- Admin full access via service role
CREATE POLICY "Service role full access for countries"
  ON countries FOR ALL
  USING (auth.role() = 'service_role');

-- Insert default country (Morocco)
INSERT INTO countries (name, name_en, code, flag_emoji, currency_code, phone_prefix, default_locale, timezone, is_active, is_default, sort_order)
VALUES
  ('Maroc', 'Morocco', 'MA', '🇲🇦', 'MAD', '+212', 'fr', 'Africa/Casablanca', true, true, 0)
ON CONFLICT (code) DO NOTHING;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_countries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER countries_updated_at
  BEFORE UPDATE ON countries
  FOR EACH ROW
  EXECUTE FUNCTION update_countries_updated_at();

-- Comments
COMMENT ON TABLE countries IS 'Countries where the platform operates, with automatic detection support';
COMMENT ON COLUMN countries.code IS 'ISO 3166-1 alpha-2 country code';
COMMENT ON COLUMN countries.is_default IS 'Only one country can be the default (for users not detected)';
COMMENT ON COLUMN home_cities.country_code IS 'ISO 3166-1 alpha-2 country code this city belongs to';
