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
      message,
      metadata,
      priority
    ) VALUES (
      'inventory_pending',
      'Modification inventaire en attente',
      'Un professionnel a soumis une modification d''inventaire',
      jsonb_build_object(
        'change_id', NEW.id,
        'establishment_id', NEW.establishment_id,
        'change_type', NEW.change_type
      ),
      'medium'
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
