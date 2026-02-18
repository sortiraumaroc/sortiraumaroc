-- Migration: Ramadan & Ftour platform settings
-- Adds configurable Ramadan dates to platform_settings (replaces RAMADAN_START/RAMADAN_END env vars)

INSERT INTO public.platform_settings (key, value, value_type, label, description, category)
VALUES
  ('RAMADAN_ENABLED', 'false', 'boolean', 'Mode Ramadan',
   'Activer les fonctionnalités spéciales Ramadan (section Ftour sur la page d''accueil, badges, etc.)', 'ramadan'),
  ('RAMADAN_START_DATE', '2026-02-28', 'string', 'Date début Ramadan',
   'Date de début du Ramadan (YYYY-MM-DD)', 'ramadan'),
  ('RAMADAN_END_DATE', '2026-03-30', 'string', 'Date fin Ramadan',
   'Date de fin du Ramadan (YYYY-MM-DD)', 'ramadan')
ON CONFLICT (key) DO NOTHING;
