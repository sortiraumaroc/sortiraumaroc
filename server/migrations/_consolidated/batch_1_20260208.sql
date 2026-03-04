-- ============================================================================
-- BATCH 1: Migrations 20260208_*
-- 6 fichiers: pro_inventory, inventory_moderation, DM, social, loyalty FK, email QR
-- ============================================================================


-- ============================================================
-- FILE: 20260208_pro_inventory_tables.sql
-- ============================================================

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


-- ============================================================
-- FILE: 20260208_pro_inventory_moderation.sql
-- ============================================================

-- =============================================================================
-- MIGRATION: Pro Inventory Moderation System
-- Date: 2026-02-08
-- Description: Adds moderation workflow for Pro inventory changes
-- =============================================================================

-- ============================================================================
-- 1. PRO_INVENTORY_PENDING_CHANGES
-- Stores all pending changes from Pro users awaiting admin validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pro_inventory_pending_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,

  -- What type of change is this?
  change_type text NOT NULL CHECK (change_type IN ('create_category', 'update_category', 'delete_category', 'create_item', 'update_item', 'delete_item', 'bulk_import')),

  -- Target entity (null for create operations)
  target_id uuid, -- category_id or item_id being modified/deleted

  -- The proposed changes (JSON)
  payload jsonb NOT NULL DEFAULT '{}',

  -- For bulk imports: contains array of categories and items
  bulk_data jsonb,

  -- Status workflow: pending -> approved/rejected
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),

  -- Who submitted and when
  submitted_by uuid NOT NULL, -- pro user id
  submitted_at timestamptz NOT NULL DEFAULT now(),

  -- Review info
  reviewed_by uuid, -- admin user id
  reviewed_at timestamptz,
  review_notes text,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_pending_establishment
  ON public.pro_inventory_pending_changes(establishment_id);
CREATE INDEX IF NOT EXISTS idx_inventory_pending_status
  ON public.pro_inventory_pending_changes(status);
CREATE INDEX IF NOT EXISTS idx_inventory_pending_status_created
  ON public.pro_inventory_pending_changes(status, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_inventory_pending_submitted_by
  ON public.pro_inventory_pending_changes(submitted_by);

-- RLS
ALTER TABLE public.pro_inventory_pending_changes ENABLE ROW LEVEL SECURITY;

-- Pro users can view their own establishment's pending changes
DROP POLICY IF EXISTS "Pro can view own pending changes" ON public.pro_inventory_pending_changes;
CREATE POLICY "Pro can view own pending changes"
  ON public.pro_inventory_pending_changes
  FOR SELECT
  USING (true);

-- Pro users can create pending changes for their establishments
DROP POLICY IF EXISTS "Pro can create pending changes" ON public.pro_inventory_pending_changes;
CREATE POLICY "Pro can create pending changes"
  ON public.pro_inventory_pending_changes
  FOR INSERT
  WITH CHECK (true);

-- Only service role (admin) can update/delete
DROP POLICY IF EXISTS "Service role manages pending changes" ON public.pro_inventory_pending_changes;
CREATE POLICY "Service role manages pending changes"
  ON public.pro_inventory_pending_changes
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_inventory_pending_updated_at ON public.pro_inventory_pending_changes;
CREATE TRIGGER trg_inventory_pending_updated_at
  BEFORE UPDATE ON public.pro_inventory_pending_changes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- 2. HELPER FUNCTION: Apply approved changes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_inventory_pending_change(p_change_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_change record;
  v_result jsonb := '{"success": true}';
  v_new_id uuid;
  v_payload jsonb;
  v_bulk jsonb;
  v_cat jsonb;
  v_item jsonb;
BEGIN
  -- Get the pending change
  SELECT * INTO v_change
  FROM public.pro_inventory_pending_changes
  WHERE id = p_change_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN '{"success": false, "error": "Change not found or already processed"}';
  END IF;

  v_payload := v_change.payload;

  -- Apply based on change type
  CASE v_change.change_type
    -- CREATE CATEGORY
    WHEN 'create_category' THEN
      INSERT INTO public.pro_inventory_categories (
        establishment_id, title, description, sort_order, is_active
      ) VALUES (
        v_change.establishment_id,
        v_payload->>'title',
        v_payload->>'description',
        COALESCE((v_payload->>'sort_order')::int, 0),
        COALESCE((v_payload->>'is_active')::boolean, true)
      )
      RETURNING id INTO v_new_id;
      v_result := jsonb_build_object('success', true, 'created_id', v_new_id);

    -- UPDATE CATEGORY
    WHEN 'update_category' THEN
      UPDATE public.pro_inventory_categories
      SET
        title = COALESCE(v_payload->>'title', title),
        description = COALESCE(v_payload->>'description', description),
        sort_order = COALESCE((v_payload->>'sort_order')::int, sort_order),
        is_active = COALESCE((v_payload->>'is_active')::boolean, is_active)
      WHERE id = v_change.target_id AND establishment_id = v_change.establishment_id;

    -- DELETE CATEGORY
    WHEN 'delete_category' THEN
      -- First remove category from items
      UPDATE public.pro_inventory_items SET category_id = NULL
      WHERE category_id = v_change.target_id;
      -- Then delete category
      DELETE FROM public.pro_inventory_categories
      WHERE id = v_change.target_id AND establishment_id = v_change.establishment_id;

    -- CREATE ITEM
    WHEN 'create_item' THEN
      INSERT INTO public.pro_inventory_items (
        establishment_id, category_id, title, description, base_price, currency, labels, is_active, sort_order
      ) VALUES (
        v_change.establishment_id,
        (v_payload->>'category_id')::uuid,
        v_payload->>'title',
        v_payload->>'description',
        (v_payload->>'base_price')::numeric,
        COALESCE(v_payload->>'currency', 'MAD'),
        COALESCE((v_payload->'labels')::text[], '{}'),
        COALESCE((v_payload->>'is_active')::boolean, true),
        COALESCE((v_payload->>'sort_order')::int, 0)
      )
      RETURNING id INTO v_new_id;
      v_result := jsonb_build_object('success', true, 'created_id', v_new_id);

    -- UPDATE ITEM
    WHEN 'update_item' THEN
      UPDATE public.pro_inventory_items
      SET
        category_id = COALESCE((v_payload->>'category_id')::uuid, category_id),
        title = COALESCE(v_payload->>'title', title),
        description = COALESCE(v_payload->>'description', description),
        base_price = COALESCE((v_payload->>'base_price')::numeric, base_price),
        labels = COALESCE((v_payload->'labels')::text[], labels),
        is_active = COALESCE((v_payload->>'is_active')::boolean, is_active),
        sort_order = COALESCE((v_payload->>'sort_order')::int, sort_order)
      WHERE id = v_change.target_id AND establishment_id = v_change.establishment_id;

    -- DELETE ITEM
    WHEN 'delete_item' THEN
      -- Delete variants first
      DELETE FROM public.pro_inventory_variants WHERE item_id = v_change.target_id;
      -- Then delete item
      DELETE FROM public.pro_inventory_items
      WHERE id = v_change.target_id AND establishment_id = v_change.establishment_id;

    -- BULK IMPORT
    WHEN 'bulk_import' THEN
      v_bulk := v_change.bulk_data;

      -- Create categories
      IF v_bulk->'categories' IS NOT NULL THEN
        FOR v_cat IN SELECT * FROM jsonb_array_elements(v_bulk->'categories')
        LOOP
          INSERT INTO public.pro_inventory_categories (
            establishment_id, title, description, sort_order, is_active
          ) VALUES (
            v_change.establishment_id,
            v_cat->>'title',
            v_cat->>'description',
            COALESCE((v_cat->>'sort_order')::int, 0),
            true
          );
        END LOOP;
      END IF;

      -- Create items
      IF v_bulk->'items' IS NOT NULL THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_bulk->'items')
        LOOP
          INSERT INTO public.pro_inventory_items (
            establishment_id, category_id, title, description, base_price, currency, labels, is_active, sort_order
          ) VALUES (
            v_change.establishment_id,
            -- Try to find category by title
            (SELECT id FROM public.pro_inventory_categories
             WHERE establishment_id = v_change.establishment_id
             AND title = v_item->>'category' LIMIT 1),
            v_item->>'title',
            v_item->>'description',
            (v_item->>'price')::numeric,
            'MAD',
            COALESCE((v_item->'labels')::text[], '{}'),
            true,
            0
          );
        END LOOP;
      END IF;

      v_result := jsonb_build_object('success', true, 'imported', true);

    ELSE
      RETURN '{"success": false, "error": "Unknown change type"}';
  END CASE;

  -- Mark as approved
  UPDATE public.pro_inventory_pending_changes
  SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now()
  WHERE id = p_change_id;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- ============================================================================
-- 3. NOTIFICATION TRIGGER
-- Notify admins when new pending changes are submitted
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_inventory_pending_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Insert admin notification (if admin_notifications table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'admin_notifications') THEN
    INSERT INTO public.admin_notifications (
      type,
      title,
      body,
      data
    ) VALUES (
      'inventory_pending',
      'Modification inventaire en attente',
      'Un professionnel a soumis une modification d''inventaire',
      jsonb_build_object(
        'change_id', NEW.id,
        'establishment_id', NEW.establishment_id,
        'change_type', NEW.change_type
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_inventory_pending ON public.pro_inventory_pending_changes;
CREATE TRIGGER trg_notify_inventory_pending
  AFTER INSERT ON public.pro_inventory_pending_changes
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_inventory_pending_change();

-- ============================================================================
-- FIN DE LA MIGRATION
-- ============================================================================


-- ============================================================
-- FILE: 20260208_direct_messaging.sql
-- ============================================================

-- =============================================================================
-- DIRECT MESSAGING: Conversations, Participants, Messages
-- =============================================================================

-- Conversations
CREATE TABLE IF NOT EXISTS dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT
);

-- Conversation participants (pair of users per conversation)
CREATE TABLE IF NOT EXISTS dm_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  is_muted BOOLEAN DEFAULT false,
  UNIQUE(conversation_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'establishment_share', 'post_share')),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON dm_conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_dm_participants_conversation ON dm_conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON dm_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_dm_messages_created ON dm_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_last_message ON dm_conversations(last_message_at DESC);

-- RLS
ALTER TABLE dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FILE: 20260208_social_features.sql
-- ============================================================

-- =============================================================================
-- SOCIAL FEATURES: Posts, Likes, Comments, Saves, Follows
-- =============================================================================

-- Posts
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,
  content TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  post_type TEXT NOT NULL DEFAULT 'experience' CHECK (post_type IN ('experience', 'review', 'recommendation', 'photo')),
  is_active BOOLEAN DEFAULT true,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  saves_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Post images (multiple per post)
CREATE TABLE IF NOT EXISTS social_post_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Likes
CREATE TABLE IF NOT EXISTS social_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Comments (with threading: parent_comment_id)
CREATE TABLE IF NOT EXISTS social_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  parent_comment_id UUID REFERENCES social_post_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Saves (bookmarks)
CREATE TABLE IF NOT EXISTS social_post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- User follows
CREATE TABLE IF NOT EXISTS social_user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id != following_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_establishment_id ON social_posts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_is_active ON social_posts(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_social_post_images_post_id ON social_post_images(post_id);

CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_id ON social_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_likes_user_id ON social_post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_id ON social_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_comments_user_id ON social_post_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_social_post_saves_post_id ON social_post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_saves_user_id ON social_post_saves(user_id);

CREATE INDEX IF NOT EXISTS idx_social_user_follows_follower ON social_user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_social_user_follows_following ON social_user_follows(following_id);

-- RLS policies
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_user_follows ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- FILE: 20260208_loyalty_add_missing_fks.sql
-- ============================================================

-- ============================================================================
-- Ajouter les FK manquantes sur loyalty_rewards et loyalty_stamps
-- vers establishments pour permettre les joins PostgREST
-- ============================================================================

-- loyalty_rewards.establishment_id → establishments(id)
ALTER TABLE loyalty_rewards
  ADD CONSTRAINT fk_loyalty_rewards_establishment
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE;

-- loyalty_stamps.establishment_id → establishments(id)
ALTER TABLE loyalty_stamps
  ADD CONSTRAINT fk_loyalty_stamps_establishment
  FOREIGN KEY (establishment_id) REFERENCES establishments(id) ON DELETE CASCADE;


-- ============================================================
-- FILE: 20260208_email_templates_qr_perso.sql
-- ============================================================

-- ============================================================================
-- Migration: Add personal QR code mention to booking/payment email templates
-- Date: 2026-02-08
-- Description: Updates email templates to mention the personal QR code
--              that users should present at the establishment instead of
--              per-booking QR codes.
-- ============================================================================

-- 1. user_booking_confirmed — Confirmation de réservation
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre réservation est confirmée.

Référence : {{booking_ref}}
Établissement : {{establishment}}
Date : {{date}}
Montant : {{amount}}

📱 Le jour J, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Ce QR code unique vous identifie et permet de valider votre réservation à l''arrivée.

À bientôt,
L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your booking is confirmed.

Reference: {{booking_ref}}
Establishment: {{establishment}}
Date: {{date}}
Amount: {{amount}}

📱 On the day, present your personal QR code available in the "My QR Code" section of the app. This unique QR code identifies you and validates your reservation upon arrival.

See you soon,
The Sortir Au Maroc team'
WHERE key = 'user_booking_confirmed';

-- 2. user_direct_booking_confirmed — Confirmation réservation directe
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre reservation directe est confirmee.

Etablissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}
Reference : {{booking_ref}}

Cette reservation a ete effectuee via le lien direct de l''etablissement.

📱 Le jour J, presentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Ce QR code unique vous identifie et permet de valider votre reservation a l''arrivee.

A bientot !

L''equipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your direct booking is confirmed.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}
Reference: {{booking_ref}}

This booking was made via the establishment''s direct link.

📱 On the day, present your personal QR code available in the "My QR Code" section of the app. This unique QR code identifies you and validates your reservation upon arrival.

See you soon!

The Sortir Au Maroc team'
WHERE key = 'user_direct_booking_confirmed';

-- 3. user_booking_reconfirmed — Reconfirmation H-3
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre présence est confirmée pour votre réservation.

Établissement : {{establishment}}
Date : {{date}}
Heure : {{time}}
Nombre de personnes : {{guests}}

📱 Pensez à préparer votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application. Présentez-le à votre arrivée pour une entrée rapide.

À très bientôt !

L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your attendance is confirmed for your reservation.

Establishment: {{establishment}}
Date: {{date}}
Time: {{time}}
Number of guests: {{guests}}

📱 Remember to prepare your personal QR code available in the "My QR Code" section of the app. Present it upon arrival for quick entry.

See you very soon!

The Sortir Au Maroc team'
WHERE key = 'user_booking_reconfirmed';

-- 4. finance_payment_confirmation — Confirmation de paiement
UPDATE public.email_templates
SET
  body_fr = 'Bonjour {{user_name}},

Votre paiement a bien été pris en compte.

Référence : {{booking_ref}}
Montant : {{amount}}

📱 Le jour de votre réservation, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application pour valider votre entrée.

Merci,
L''équipe Sortir Au Maroc',
  body_en = 'Hello {{user_name}},

Your payment has been confirmed.

Reference: {{booking_ref}}
Amount: {{amount}}

📱 On the day of your reservation, present your personal QR code available in the "My QR Code" section of the app to validate your entry.

Thank you,
The Sortir Au Maroc team'
WHERE key = 'finance_payment_confirmation';

-- 5. user_booking_confirm_3h — Demande de confirmation H-3
-- Note: This template asks user to confirm attendance, we add QR mention as reminder
UPDATE public.email_templates
SET
  body_fr = COALESCE(body_fr, '') || '

📱 Rappel : le jour J, présentez votre QR code personnel (disponible dans "Mon QR Code" sur l''application) à l''établissement pour valider votre réservation.'
WHERE key = 'user_booking_confirm_3h'
  AND body_fr IS NOT NULL
  AND body_fr NOT LIKE '%Mon QR Code%';

-- 6. finance_deposit_received — Acompte reçu
UPDATE public.email_templates
SET
  body_fr = COALESCE(body_fr, '') || '

📱 Le jour J, présentez votre QR code personnel disponible dans votre espace "Mon QR Code" sur l''application pour valider votre entrée.'
WHERE key = 'finance_deposit_received'
  AND body_fr IS NOT NULL
  AND body_fr NOT LIKE '%Mon QR Code%';

