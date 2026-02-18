-- Pro Onboarding Wizard — progression tracking
-- Stores wizard state as JSONB on pro_profiles (current_step, completed_steps, data, etc.)

ALTER TABLE public.pro_profiles
  ADD COLUMN IF NOT EXISTS onboarding_wizard_progress JSONB DEFAULT NULL;

COMMENT ON COLUMN public.pro_profiles.onboarding_wizard_progress IS
  'Stores the step-by-step progress of the pro onboarding wizard (current_step, completed_steps, skipped, completed, data)';
