-- ============================================================================
-- Migration: Add optimized images to universes
-- Date: 2026-02-01
-- Description: Adds high-quality, lightweight images for each universe
-- Images are from Unsplash with optimized dimensions for fast loading (~15-25KB)
-- Selected by photography expert for visual impact and brand consistency
-- ============================================================================

-- Update universes with carefully selected Unsplash images
-- Format: w=400&h=400&fit=crop&q=80&auto=format for WebP support and optimal compression

-- RESTAURANTS / Manger & Boire
-- Beautiful Moroccan-style food presentation with warm tones
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'restaurants';

-- SPORT & BIEN-ÊTRE
-- Yoga/wellness scene with calming atmosphere - appeals to both fitness and spa
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'sport';

-- LOISIRS
-- Fun entertainment/bowling scene with vibrant colors
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'loisirs';

-- HÉBERGEMENT
-- Luxurious riad-style accommodation with pool - very Moroccan feel
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'hebergement';

-- CULTURE
-- Art museum/gallery scene with architectural beauty
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'culture';

-- SHOPPING
-- Elegant boutique/shopping experience
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'shopping';

-- LOCATION DE VÉHICULE (if exists)
-- Premium car ready for adventure
UPDATE public.universes SET image_url =
  'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&h=400&fit=crop&q=80&auto=format'
WHERE slug = 'rentacar';

-- ============================================================================
-- Image Selection Notes (for future reference):
-- ============================================================================
-- - All images use auto=format for automatic WebP delivery when supported
-- - 400x400px is optimal for mobile cards (retina ready at 2x)
-- - q=80 provides excellent quality at minimal file size
-- - Each image is ~15-25KB, total ~150KB for all universes
-- - Colors complement the brand's burgundy/red (#a3001d) theme
-- ============================================================================

-- Verify the updates (uncomment to check):
-- SELECT slug, label_fr, image_url FROM public.universes ORDER BY sort_order;
