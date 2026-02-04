-- Migration: Add email column to establishments table
-- This email is required for booking functionality - without it, the "Réserver" button won't appear

-- Add email column to establishments table
ALTER TABLE public.establishments
ADD COLUMN IF NOT EXISTS email TEXT DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_establishments_email ON public.establishments(email) WHERE email IS NOT NULL;

-- Add comment to explain the purpose
COMMENT ON COLUMN public.establishments.email IS 'Contact email for reservations. Required for the booking button to appear on establishment pages.';
