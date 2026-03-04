-- Clear related_links for "À propos" page to remove the "Découvrir" link
UPDATE content_pages
SET related_links = '[]'::jsonb,
    updated_at = NOW()
WHERE slug_fr = 'a-propos';
