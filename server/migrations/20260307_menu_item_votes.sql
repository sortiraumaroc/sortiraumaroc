-- =============================================================================
-- Menu Item Votes — Like/Dislike system for menu items
-- Created: 2026-03-07
-- Pattern: Based on review_votes (20260211_reviews_system_v2.sql)
-- =============================================================================

-- TABLE: menu_item_votes
-- Authenticated users can like/dislike menu items.
-- When an item gets ≥5 votes with ≥70% likes → "Coup de cœur des abonnés" badge.

CREATE TABLE IF NOT EXISTS public.menu_item_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core relationships
  item_id UUID NOT NULL REFERENCES public.pro_inventory_items(id) ON DELETE CASCADE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,

  -- Vote (like or dislike)
  vote TEXT NOT NULL CHECK (vote IN ('like', 'dislike')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One vote per user per item
  CONSTRAINT menu_item_votes_unique_user UNIQUE (item_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_menu_item_votes_item ON public.menu_item_votes(item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_votes_user ON public.menu_item_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_votes_establishment ON public.menu_item_votes(establishment_id);

-- Composite index for batch fetch (all votes for an establishment)
CREATE INDEX IF NOT EXISTS idx_menu_item_votes_est_item ON public.menu_item_votes(establishment_id, item_id);
