-- Ajout d'une colonne 'title' optionnelle à pro_slots.
-- Permet de personnaliser le titre affiché sur les offres Ramadan.
-- Si NULL, le titre par défaut "Ftour — {nom établissement}" est utilisé.

ALTER TABLE public.pro_slots ADD COLUMN IF NOT EXISTS title TEXT DEFAULT NULL;
