-- ============================================================================
-- FOOTER SOCIAL LINKS - Social media URLs managed via admin
-- ============================================================================
-- Adds 6 social media URL settings to platform_settings with category 'footer'.
-- These are read by the public platform-settings endpoint and displayed in the footer.
-- ============================================================================

INSERT INTO public.platform_settings (key, value, value_type, label, description, category)
VALUES
  ('FOOTER_SOCIAL_INSTAGRAM', '', 'string', 'Instagram', 'URL du compte Instagram officiel', 'footer'),
  ('FOOTER_SOCIAL_TIKTOK', '', 'string', 'TikTok', 'URL du compte TikTok officiel', 'footer'),
  ('FOOTER_SOCIAL_FACEBOOK', '', 'string', 'Facebook', 'URL de la page Facebook officielle', 'footer'),
  ('FOOTER_SOCIAL_YOUTUBE', '', 'string', 'YouTube', 'URL de la chaîne YouTube officielle', 'footer'),
  ('FOOTER_SOCIAL_SNAPCHAT', '', 'string', 'Snapchat', 'URL du compte Snapchat officiel', 'footer'),
  ('FOOTER_SOCIAL_LINKEDIN', '', 'string', 'LinkedIn', 'URL de la page LinkedIn officielle', 'footer')
ON CONFLICT (key) DO NOTHING;
