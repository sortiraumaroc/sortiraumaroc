-- Ajouter email et téléphone de contact aux platform_settings
-- pour synchroniser web footer + app mobile
INSERT INTO platform_settings (key, value, value_type, label, description, category, is_sensitive)
VALUES
  ('FOOTER_CONTACT_EMAIL', 'contact@sam.ma', 'string', 'Email de contact', 'Email affiché dans le footer et l''app mobile', 'footer', false),
  ('FOOTER_CONTACT_PHONE', '+212520123456', 'string', 'Téléphone de contact', 'Numéro affiché dans le footer et l''app mobile', 'footer', false)
ON CONFLICT (key) DO NOTHING;
