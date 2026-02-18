-- ============================================================================
-- FIX: search_path vide sur les fonctions SECURITY DEFINER
--
-- Problème : Les fonctions search_establishments_scored, count_establishments_scored,
-- et expand_search_query ont search_path = '' (vide) car Supabase le force sur les
-- fonctions SECURITY DEFINER. Cela empêche ces fonctions de résoudre :
--   1. expand_search_query() (dans le schéma public)
--   2. similarity() de pg_trgm (dans le schéma extensions)
--
-- Résultat : Sam retourne toujours "Je n'ai rien trouvé" car la RPC crash silencieusement.
--
-- Fix : SET search_path TO public, extensions sur toutes les fonctions concernées.
-- ============================================================================

ALTER FUNCTION public.search_establishments_scored(text, text, text, int, int, real, uuid, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.count_establishments_scored(text, text, text, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.expand_search_query(text, text, text)
  SET search_path TO public, extensions;

ALTER FUNCTION public.expand_search_query(text, text)
  SET search_path TO public, extensions;

-- ============================================================================
-- FIX: search_path vide sur le trigger et les fonctions de génération de vecteur
--
-- Problème : La fonction trigger update_establishment_search_vector() a
-- search_path = '' (vide), ce qui empêche le trigger de résoudre les fonctions
-- generate_establishment_search_vector_v2() et generate_establishment_search_vector_en()
-- lors d'un INSERT/UPDATE sur la table establishments.
--
-- Résultat : Impossible de valider/créer/modifier un établissement.
-- Erreur : "function generate_establishment_search_vector_v2(...) does not exist"
--
-- Fix : SET search_path TO public, extensions sur la fonction trigger et les
-- fonctions de génération de vecteur de recherche.
-- ============================================================================

ALTER FUNCTION public.update_establishment_search_vector()
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_v2(text, text, text, text, text[], text[], text[], text, text[], text[])
  SET search_path TO public, extensions;

ALTER FUNCTION public.generate_establishment_search_vector_en(text, text, text, text, text[], text[], text[], text, text[], text[])
  SET search_path TO public, extensions;
