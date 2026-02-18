-- Prompt 13 — Search fallback analytics columns for search_history
-- Tracks when fallback suggestions were shown and which type

BEGIN;

ALTER TABLE public.search_history
  ADD COLUMN IF NOT EXISTS fallback_shown boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_type text;

-- Partial index: only rows where fallback was shown (analytics queries)
CREATE INDEX IF NOT EXISTS idx_search_history_fallback
  ON public.search_history (fallback_shown, fallback_type)
  WHERE fallback_shown = true;

COMMIT;
