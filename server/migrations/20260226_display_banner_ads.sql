-- ============================================================================
-- Display Banner Ads (IAB) — Seed auction config
-- ============================================================================
-- Ajoute le type display_banner dans la configuration d'enchères.
-- Les tables pro_campaigns, ad_creatives, ad_impressions, ad_clicks existent déjà.
-- Le type est stocké en texte (pas d'enum Postgres), donc aucune migration DDL nécessaire.

INSERT INTO ad_auction_config (
  product_type,
  min_bid_cents,
  suggested_bid_cents,
  max_bid_cents,
  demand_multiplier,
  min_budget_cents,
  min_daily_budget_cents,
  max_positions,
  is_active
) VALUES (
  'display_banner',
  150,       -- 1.50 MAD min bid
  300,       -- 3.00 MAD suggested bid
  NULL,      -- pas de plafond max
  1.0,       -- demand multiplier baseline
  30000,     -- 300 MAD budget minimum
  5000,      -- 50 MAD daily budget minimum
  2,         -- 2 emplacements par page
  true
) ON CONFLICT (product_type) DO NOTHING;
