-- =============================================================================
-- MIGRATION: Pro Inventory Tables (Categories, Items, Variants, Custom Labels)
-- Date: 2026-02-08
-- Description: Creates the complete inventory system for establishments
-- =============================================================================

-- ============================================================================
-- 1. PRO_INVENTORY_CATEGORIES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_inventory_categories_establishment
  ON public.pro_inventory_categories(establishment_id);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_categories_sort
  ON public.pro_inventory_categories(establishment_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_categories_active
  ON public.pro_inventory_categories(establishment_id, is_active);

-- RLS
ALTER TABLE public.pro_inventory_categories ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory categories read access' AND tablename = 'pro_inventory_categories') THEN
    CREATE POLICY "Pro inventory categories read access"
      ON public.pro_inventory_categories
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory categories write access' AND tablename = 'pro_inventory_categories') THEN
    CREATE POLICY "Pro inventory categories write access"
      ON public.pro_inventory_categories
      FOR ALL
      USING (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      )
      WITH CHECK (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 2. PRO_INVENTORY_ITEMS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.pro_inventory_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  base_price numeric(10,2),
  currency text NOT NULL DEFAULT 'MAD',
  labels text[] DEFAULT '{}',
  photos text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  popularity_score integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_inventory_items_establishment
  ON public.pro_inventory_items(establishment_id);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_items_category
  ON public.pro_inventory_items(category_id);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_items_sort
  ON public.pro_inventory_items(establishment_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_items_active
  ON public.pro_inventory_items(establishment_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_items_popularity
  ON public.pro_inventory_items(establishment_id, popularity_score DESC);

-- RLS
ALTER TABLE public.pro_inventory_items ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory items read access' AND tablename = 'pro_inventory_items') THEN
    CREATE POLICY "Pro inventory items read access"
      ON public.pro_inventory_items
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory items write access' AND tablename = 'pro_inventory_items') THEN
    CREATE POLICY "Pro inventory items write access"
      ON public.pro_inventory_items
      FOR ALL
      USING (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      )
      WITH CHECK (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 3. PRO_INVENTORY_VARIANTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_inventory_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.pro_inventory_items(id) ON DELETE CASCADE,
  title text,
  price numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'MAD',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pro_inventory_variants_item
  ON public.pro_inventory_variants(item_id);
CREATE INDEX IF NOT EXISTS idx_pro_inventory_variants_active
  ON public.pro_inventory_variants(item_id, is_active);

-- RLS
ALTER TABLE public.pro_inventory_variants ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory variants read access' AND tablename = 'pro_inventory_variants') THEN
    CREATE POLICY "Pro inventory variants read access"
      ON public.pro_inventory_variants
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Pro inventory variants write access' AND tablename = 'pro_inventory_variants') THEN
    CREATE POLICY "Pro inventory variants write access"
      ON public.pro_inventory_variants
      FOR ALL
      USING (
        item_id IN (
          SELECT i.id FROM public.pro_inventory_items i
          WHERE i.establishment_id IN (
            SELECT establishment_id FROM public.pro_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
          )
        )
      )
      WITH CHECK (
        item_id IN (
          SELECT i.id FROM public.pro_inventory_items i
          WHERE i.establishment_id IN (
            SELECT establishment_id FROM public.pro_memberships
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
          )
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 4. PRO_INVENTORY_CUSTOM_LABELS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_inventory_custom_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  label_id text NOT NULL,
  emoji text NOT NULL DEFAULT '',
  title text NOT NULL,
  title_ar text,
  color text NOT NULL DEFAULT 'slate',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT unique_label_per_establishment UNIQUE (establishment_id, label_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_custom_labels_establishment
  ON public.pro_inventory_custom_labels(establishment_id);
CREATE INDEX IF NOT EXISTS idx_custom_labels_active
  ON public.pro_inventory_custom_labels(establishment_id, is_active);

-- RLS
ALTER TABLE public.pro_inventory_custom_labels ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'custom_labels_select' AND tablename = 'pro_inventory_custom_labels') THEN
    CREATE POLICY "custom_labels_select"
      ON public.pro_inventory_custom_labels
      FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'custom_labels_write' AND tablename = 'pro_inventory_custom_labels') THEN
    CREATE POLICY "custom_labels_write"
      ON public.pro_inventory_custom_labels
      FOR ALL
      USING (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      )
      WITH CHECK (
        establishment_id IN (
          SELECT establishment_id FROM public.pro_memberships
          WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
      );
  END IF;
END $$;

-- ============================================================================
-- 5. HELPER FUNCTIONS
-- ============================================================================

-- Function to increment item popularity
CREATE OR REPLACE FUNCTION public.increment_pro_inventory_popularity(p_item_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.pro_inventory_items
  SET popularity_score = popularity_score + 1
  WHERE id = p_item_id;
END;
$$;

-- Function to apply reactivations (when inventory items are re-enabled)
CREATE OR REPLACE FUNCTION public.apply_pro_inventory_reactivations(p_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This function can be extended to handle any reactivation logic
  -- For now, it just ensures the establishment has valid inventory
  NULL;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.increment_pro_inventory_popularity(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_pro_inventory_reactivations(uuid) TO authenticated;

-- ============================================================================
-- 6. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Generic set_updated_at function if not exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pro_inventory_categories_updated_at') THEN
    CREATE TRIGGER trg_pro_inventory_categories_updated_at
      BEFORE UPDATE ON public.pro_inventory_categories
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pro_inventory_items_updated_at') THEN
    CREATE TRIGGER trg_pro_inventory_items_updated_at
      BEFORE UPDATE ON public.pro_inventory_items
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pro_inventory_variants_updated_at') THEN
    CREATE TRIGGER trg_pro_inventory_variants_updated_at
      BEFORE UPDATE ON public.pro_inventory_variants
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pro_inventory_custom_labels_updated_at') THEN
    CREATE TRIGGER trg_pro_inventory_custom_labels_updated_at
      BEFORE UPDATE ON public.pro_inventory_custom_labels
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================
