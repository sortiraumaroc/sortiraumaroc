-- ============================================================================
-- Migration: Security Advisor Fixes
-- Date: 2026-03-07
-- Description: Corrige les 4 erreurs + 3 warnings du Security Advisor Supabase
--
-- ERREURS (RLS Disabled in Public) :
--   1. public.storage_transfers
--   2. public.storage_transfer_files
--   3. public.storage_transfer_downloads
--   4. public.menu_item_votes
--
-- WARNINGS (Function Search Path Mutable) :
--   1. public.trigger_set_updated_at
--   2. public.get_ftour_slots_price_types
--   3. public.get_top_search_patterns
--
-- NOTE SÉCURITÉ :
--   Le serveur Express utilise SUPABASE_SERVICE_ROLE_KEY qui bypass RLS.
--   Ces policies ne protègent que contre l'accès direct via anon/authenticated keys.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 1 : Activer RLS + Policies
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1a. storage_transfers ──────────────────────────────────────────────────
-- Table admin/collaborateurs uniquement. Accès via service_role côté serveur.

ALTER TABLE public.storage_transfers ENABLE ROW LEVEL SECURITY;

-- Authenticated : lecture de ses propres transferts
CREATE POLICY "storage_transfers_select_own"
  ON public.storage_transfers
  FOR SELECT
  TO authenticated
  USING (auth.uid() = created_by);

-- Authenticated : création de transferts
CREATE POLICY "storage_transfers_insert_own"
  ON public.storage_transfers
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Authenticated : suppression de ses propres transferts
CREATE POLICY "storage_transfers_delete_own"
  ON public.storage_transfers
  FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);


-- ── 1b. storage_transfer_files ─────────────────────────────────────────────
-- Fichiers liés à un transfert. Accès via service_role côté serveur.

ALTER TABLE public.storage_transfer_files ENABLE ROW LEVEL SECURITY;

-- Authenticated : lecture via jointure (le transfert appartient à l'utilisateur)
CREATE POLICY "storage_transfer_files_select_via_transfer"
  ON public.storage_transfer_files
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id AND t.created_by = auth.uid()
    )
  );

-- Authenticated : insertion (le transfert appartient à l'utilisateur)
CREATE POLICY "storage_transfer_files_insert_via_transfer"
  ON public.storage_transfer_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id AND t.created_by = auth.uid()
    )
  );

-- Authenticated : suppression (le transfert appartient à l'utilisateur)
CREATE POLICY "storage_transfer_files_delete_via_transfer"
  ON public.storage_transfer_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id AND t.created_by = auth.uid()
    )
  );


-- ── 1c. storage_transfer_downloads ─────────────────────────────────────────
-- Logs de téléchargement. Accès via service_role côté serveur.

ALTER TABLE public.storage_transfer_downloads ENABLE ROW LEVEL SECURITY;

-- Authenticated : lecture des downloads de ses propres transferts
CREATE POLICY "storage_transfer_downloads_select_via_transfer"
  ON public.storage_transfer_downloads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id AND t.created_by = auth.uid()
    )
  );

-- Authenticated : insertion (logging downloads — le transfert doit exister)
CREATE POLICY "storage_transfer_downloads_insert_authenticated"
  ON public.storage_transfer_downloads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id
    )
  );

-- Authenticated : suppression (propriétaire du transfert)
CREATE POLICY "storage_transfer_downloads_delete_via_transfer"
  ON public.storage_transfer_downloads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.storage_transfers t
      WHERE t.id = transfer_id AND t.created_by = auth.uid()
    )
  );


-- ── 1d. menu_item_votes ────────────────────────────────────────────────────
-- Votes like/dislike sur les plats. Lecture publique, écriture authentifiée.

ALTER TABLE public.menu_item_votes ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut lire les votes (statistiques publiques)
CREATE POLICY "menu_item_votes_select_public"
  ON public.menu_item_votes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated : voter (son propre vote uniquement)
CREATE POLICY "menu_item_votes_insert_own"
  ON public.menu_item_votes
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Authenticated : modifier son propre vote
CREATE POLICY "menu_item_votes_update_own"
  ON public.menu_item_votes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Authenticated : supprimer son propre vote (toggle)
CREATE POLICY "menu_item_votes_delete_own"
  ON public.menu_item_votes
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- PARTIE 2 : Corriger search_path des fonctions
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2a. trigger_set_updated_at ─────────────────────────────────────────────
-- ⚠️ NE PAS MODIFIER cette fonction ! Elle est attachée comme trigger à
-- de nombreuses tables (sam_conversations, sam_messages, etc.).
-- Changer son search_path provoque des erreurs d'INSERT/UPDATE sur ces tables.
-- Le warning "Function Search Path Mutable" est accepté pour cette fonction.
-- ALTER FUNCTION public.trigger_set_updated_at()
--   SET search_path = 'public';  -- REVERTÉ le 2026-03-07 (cassait le chatbot)

-- ── 2b. get_ftour_slots_price_types ────────────────────────────────────────
-- RPC Ramadan. Fixer le search_path sans toucher au body.
ALTER FUNCTION public.get_ftour_slots_price_types()
  SET search_path = 'public';

-- ── 2c. get_top_search_patterns ────────────────────────────────────────────
-- Agrégation search history. Fixer le search_path sans toucher au body.
ALTER FUNCTION public.get_top_search_patterns(int, int, int)
  SET search_path = 'public';
