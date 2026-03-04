import { useState, useCallback, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Send, AlertCircle } from "lucide-react";
import type { ProWizardData, OnboardingWizardProgress } from "../../../lib/pro/types";
import {
  saveOnboardingWizardProgress,
  submitEstablishmentProfileUpdate,
} from "../../../lib/pro/api";
import { ProWizardProgressBar } from "./ProWizardProgressBar";
import {
  PRO_WIZARD_STEPS,
  TOTAL_PRO_WIZARD_STEPS,
  createInitialProWizardData,
} from "./proWizardConstants";
import { ProWizardStepIdentity } from "./steps/ProWizardStepIdentity";
import { ProWizardStepLocation } from "./steps/ProWizardStepLocation";
import { ProWizardStepContact } from "./steps/ProWizardStepContact";
import { ProWizardStepDescription } from "./steps/ProWizardStepDescription";
import { ProWizardStepMedia } from "./steps/ProWizardStepMedia";
import { ProWizardStepHours } from "./steps/ProWizardStepHours";

type Props = {
  establishment: Record<string, unknown>;
  initialProgress: OnboardingWizardProgress | null;
  onClose: () => void;
  onCompleted: () => void;
};

export function ProOnboardingWizard({
  establishment,
  initialProgress,
  onClose,
  onCompleted,
}: Props) {
  const establishmentId = establishment.id as string;

  const [currentStep, setCurrentStep] = useState(
    initialProgress?.current_step ?? 1,
  );
  const [completedSteps, setCompletedSteps] = useState<number[]>(
    initialProgress?.completed_steps ?? [],
  );
  const [data, setData] = useState<Partial<ProWizardData>>(() => {
    const initial = createInitialProWizardData(establishment);
    return initialProgress?.data
      ? { ...initial, ...initialProgress.data }
      : initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save progress on step change
  const saveProgress = useCallback(
    async (
      step: number,
      completed: number[],
      wizardData: Partial<ProWizardData>,
      extra?: Partial<OnboardingWizardProgress>,
    ) => {
      try {
        await saveOnboardingWizardProgress({
          establishment_id: establishmentId,
          current_step: step,
          completed_steps: completed,
          skipped: false,
          completed: false,
          submitted_at: null,
          data: wizardData,
          ...extra,
        });
      } catch {
        // Silent fail — progression will be saved next time
      }
    },
    [establishmentId],
  );

  // Debounced save on data change
  const debouncedSave = useCallback(
    (wizardData: Partial<ProWizardData>) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveProgress(currentStep, completedSteps, wizardData);
      }, 2000);
    },
    [currentStep, completedSteps, saveProgress],
  );

  const handleDataChange = useCallback(
    (patch: Partial<ProWizardData>) => {
      setData((prev) => {
        const next = { ...prev, ...patch };
        debouncedSave(next);
        return next;
      });
    },
    [debouncedSave],
  );

  // Validate step (soft validation — warnings, not blocking)
  const getStepWarnings = (step: number): string[] => {
    const warnings: string[] = [];
    switch (step) {
      case 1:
        if (!data.name?.trim()) warnings.push("Nom requis");
        if (!data.universe) warnings.push("Univers requis");
        if (!data.category) warnings.push("Catégorie requise");
        break;
      case 2:
        if (!data.city) warnings.push("Ville requise");
        if (!data.address?.trim()) warnings.push("Adresse requise");
        break;
      case 4:
        if (!data.description_short?.trim())
          warnings.push("Description courte requise");
        break;
    }
    return warnings;
  };

  const goNext = () => {
    // Mark current step as completed
    const newCompleted = completedSteps.includes(currentStep)
      ? completedSteps
      : [...completedSteps, currentStep];
    setCompletedSteps(newCompleted);

    if (currentStep < TOTAL_PRO_WIZARD_STEPS) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      saveProgress(nextStep, newCompleted, data);
    }
  };

  const goPrev = () => {
    if (currentStep > 1) {
      const prevStep = currentStep - 1;
      setCurrentStep(prevStep);
      saveProgress(prevStep, completedSteps, data);
    }
  };

  const handleSkipClose = () => {
    // Save progress as skipped
    saveProgress(currentStep, completedSteps, data, { skipped: true });
    onClose();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);

    // Build the data payload for moderation
    const phone =
      data.phone_national?.trim()
        ? `${data.phone_country ?? "+212"}${data.phone_national.trim()}`
        : null;
    const whatsapp =
      data.whatsapp_national?.trim()
        ? `${data.whatsapp_country ?? "+212"}${data.whatsapp_national.trim()}`
        : null;

    const socialLinks: Record<string, string> = {};
    if (data.social_instagram?.trim())
      socialLinks.instagram = data.social_instagram.trim();
    if (data.social_facebook?.trim())
      socialLinks.facebook = data.social_facebook.trim();
    if (data.social_tiktok?.trim())
      socialLinks.tiktok = data.social_tiktok.trim();
    if (data.social_snapchat?.trim())
      socialLinks.snapchat = data.social_snapchat.trim();
    if (data.social_youtube?.trim())
      socialLinks.youtube = data.social_youtube.trim();
    if (data.social_tripadvisor?.trim())
      socialLinks.tripadvisor = data.social_tripadvisor.trim();
    if (data.google_maps_url?.trim())
      socialLinks.google_maps = data.google_maps_url.trim();

    const updatePayload: Record<string, unknown> = {
      name: data.name?.trim() || null,
      universe: data.universe || null,
      category: data.category || null,
      subcategory: data.subcategory || null,
      specialties: data.specialties?.length ? data.specialties : null,
      city: data.city || null,
      region: data.region || null,
      postal_code: data.postal_code?.trim() || null,
      address: data.address?.trim() || null,
      phone,
      whatsapp,
      email: data.email?.trim() || null,
      website: data.website?.trim() || null,
      description_short: data.description_short?.trim() || null,
      description_long: data.description_long?.trim() || null,
      cover_url: data.cover_url?.trim() || null,
      logo_url: data.logo_url?.trim() || null,
      gallery_urls: data.gallery_urls?.length ? data.gallery_urls : null,
      hours: data.hours ?? null,
      social_links: Object.keys(socialLinks).length ? socialLinks : null,
    };

    // Include neighborhood in extra
    if (data.neighborhood?.trim()) {
      const existingExtra =
        (establishment.extra as Record<string, unknown>) ?? {};
      updatePayload.extra = {
        ...existingExtra,
        neighborhood: data.neighborhood.trim(),
      };
    }

    try {
      await submitEstablishmentProfileUpdate({
        establishmentId,
        data: updatePayload,
      });

      // Mark wizard as completed
      await saveOnboardingWizardProgress({
        establishment_id: establishmentId,
        current_step: currentStep,
        completed_steps: [...new Set([...completedSteps, currentStep])],
        skipped: false,
        completed: true,
        submitted_at: new Date().toISOString(),
        data,
      });

      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Erreur lors de la soumission",
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Render step content
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return <ProWizardStepIdentity data={data} onChange={handleDataChange} />;
      case 2:
        return <ProWizardStepLocation data={data} onChange={handleDataChange} />;
      case 3:
        return <ProWizardStepContact data={data} onChange={handleDataChange} />;
      case 4:
        return (
          <ProWizardStepDescription data={data} onChange={handleDataChange} />
        );
      case 5:
        return (
          <ProWizardStepMedia
            data={data}
            onChange={handleDataChange}
            establishmentId={establishmentId}
          />
        );
      case 6:
        return <ProWizardStepHours data={data} onChange={handleDataChange} />;
      default:
        return null;
    }
  };

  const warnings = getStepWarnings(currentStep);
  const isLastStep = currentStep === TOTAL_PRO_WIZARD_STEPS;

  // Success screen
  if (submitSuccess) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">
            Fiche soumise avec succès !
          </h2>
          <p className="mb-6 text-sm text-gray-500">
            Votre fiche d'établissement a été envoyée pour modération. L'équipe
            SAM la vérifiera dans les plus brefs délais.
          </p>
          <button
            type="button"
            onClick={onCompleted}
            className="rounded-lg bg-[#a3001d] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8a0018]"
          >
            Accéder à mon espace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 sm:text-lg">
            Compléter ma fiche
          </h2>
          <p className="text-xs text-gray-400">
            Étape {currentStep}/{TOTAL_PRO_WIZARD_STEPS}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSkipClose}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Quitter (votre progression sera sauvegardée)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="border-b px-4 py-3">
        <ProWizardProgressBar
          currentStep={currentStep}
          completedSteps={completedSteps}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-2xl">{renderStep()}</div>
      </div>

      {/* Footer navigation */}
      <div className="border-t bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          {/* Left: Back or skip */}
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={goPrev}
                className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
                Précédent
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkipClose}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                Plus tard
              </button>
            )}
          </div>

          {/* Center: Warnings */}
          {warnings.length > 0 && (
            <div className="hidden items-center gap-1 text-xs text-orange-500 sm:flex">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>{warnings[0]}</span>
            </div>
          )}

          {/* Right: Next or Submit */}
          <div>
            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-[#a3001d] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8a0018] disabled:opacity-50"
              >
                {submitting ? (
                  "Envoi en cours..."
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Soumettre ma fiche
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={goNext}
                className="flex items-center gap-1 rounded-lg bg-[#a3001d] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8a0018]"
              >
                Suivant
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {submitError && (
          <p className="mt-2 text-center text-sm text-red-500">
            {submitError}
          </p>
        )}
      </div>
    </div>
  );
}
