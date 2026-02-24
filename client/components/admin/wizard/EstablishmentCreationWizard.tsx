"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronLeft, ChevronRight, SkipForward, Check, Pencil } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import { WizardProgressBar } from "./WizardProgressBar";
import { WIZARD_STEPS, createInitialWizardData, DAYS, type WizardData, type DaySchedule } from "./wizardConstants";

// Step components (default exports)
import WizardStepIdentity from "./steps/WizardStepIdentity";
import WizardStepLocation from "./steps/WizardStepLocation";
import WizardStepContact from "./steps/WizardStepContact";
import WizardStepDescriptions from "./steps/WizardStepDescriptions";
import WizardStepMedia from "./steps/WizardStepMedia";
import WizardStepHours from "./steps/WizardStepHours";
import WizardStepTags from "./steps/WizardStepTags";

// Import the API function
import { loadAdminSessionToken, getEstablishment, type EstablishmentSearchResult } from "@/lib/adminApi";

// Map DB universe values back to wizard UI values
const DB_TO_UNIVERSE: Record<string, string> = {
  restaurant: "restaurants",
  loisir: "loisirs",
  hebergement: "hebergement",
  wellness: "sport",
  culture: "culture",
};

/**
 * Convert DB hours (openingHours arrays or DaySchedule objects) to wizard v2 format.
 */
function dbHoursToWizardFormat(dbHours: unknown): Record<string, DaySchedule> {
  const result: Record<string, DaySchedule> = {};
  DAYS.forEach(d => {
    result[d.key] = { open: false, mode: "continu", ranges: [{ from: "09:00", to: "18:00" }] };
  });

  if (!dbHours || typeof dbHours !== "object") return result;

  for (const [dayKey, value] of Object.entries(dbHours as Record<string, unknown>)) {
    // Array of intervals (DB format) → convert to wizard v2
    if (Array.isArray(value)) {
      const intervals = value.filter(
        (v: unknown): v is { from: string; to: string } =>
          v != null && typeof v === "object" && "from" in v && "to" in v,
      );
      if (intervals.length === 0) {
        result[dayKey] = { open: false, mode: "continu", ranges: [{ from: "09:00", to: "18:00" }] };
      } else {
        result[dayKey] = {
          open: true,
          mode: intervals.length > 1 ? "coupure" : "continu",
          ranges: intervals.map(i => ({ from: i.from, to: i.to })),
        };
      }
      continue;
    }

    // DaySchedule object (v1 or v2) → normalize to v2
    if (value && typeof value === "object" && "open" in (value as Record<string, unknown>)) {
      const obj = value as Record<string, unknown>;
      if (Array.isArray(obj.ranges)) {
        result[dayKey] = {
          open: !!obj.open,
          mode: obj.mode === "coupure" ? "coupure" : "continu",
          ranges: (obj.ranges as { from: string; to: string }[]).map(r => ({ from: r.from, to: r.to })),
        };
      } else {
        // v1 format
        const ranges: { from: string; to: string }[] = [];
        const t1From = typeof obj.openTime1 === "string" ? obj.openTime1 : "";
        const t1To = typeof obj.closeTime1 === "string" ? obj.closeTime1 : "";
        if (t1From && t1To) ranges.push({ from: t1From, to: t1To });
        if (!obj.continuous) {
          const t2From = typeof obj.openTime2 === "string" ? obj.openTime2 : "";
          const t2To = typeof obj.closeTime2 === "string" ? obj.closeTime2 : "";
          if (t2From && t2To) ranges.push({ from: t2From, to: t2To });
        }
        result[dayKey] = {
          open: !!obj.open,
          mode: ranges.length > 1 ? "coupure" : "continu",
          ranges: ranges.length > 0 ? ranges : [{ from: "09:00", to: "18:00" }],
        };
      }
    }
  }

  return result;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void; // refresh list callback
  onSelectExisting?: (id: string) => void; // navigate to existing establishment
};

export function EstablishmentCreationWizard({ open, onOpenChange, onCreated, onSelectExisting }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [data, setData] = useState<WizardData>(createInitialWizardData());
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const { toast } = useToast();

  // Merge partial updates into data
  const handleChange = useCallback((updates: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...updates }));
  }, []);

  // Handle selecting an existing establishment → load data into wizard
  const handleSelectExisting = useCallback(async (est: EstablishmentSearchResult) => {
    setLoadingExisting(true);
    try {
      const sessionToken = loadAdminSessionToken();
      const result = await getEstablishment(sessionToken ?? undefined, est.id);
      const item = result?.item;
      if (!item) throw new Error("Établissement non trouvé");

      // Map DB data → wizard data
      const socialLinks = (item.social_links && typeof item.social_links === "object") ? item.social_links : {};
      const wizardData: WizardData = {
        ...createInitialWizardData(),
        name: item.name ?? "",
        universe: DB_TO_UNIVERSE[item.universe] ?? item.universe ?? "restaurants",
        category: item.category ?? "",
        subcategory: item.subcategory ?? "",
        specialties: Array.isArray(item.specialties) ? item.specialties : [],
        country: item.country ?? "Maroc",
        region: item.region ?? "",
        city: item.city ?? "",
        neighborhood: item.neighborhood ?? "",
        postal_code: item.postal_code ?? "",
        address: item.address ?? "",
        lat: item.lat != null ? String(item.lat) : "",
        lng: item.lng != null ? String(item.lng) : "",
        phone: item.phone ?? "",
        whatsapp: item.whatsapp ?? "",
        booking_email: item.email ?? "",
        google_maps_link: item.google_maps_url ?? "",
        website: item.website ?? "",
        owner_email: "",
        short_description: item.description_short ?? "",
        long_description: item.description_long ?? "",
        coverFile: null, // Can't pre-fill file objects
        galleryFiles: [],
        logoUrl: item.logo_url ?? null,
        coverUrl: item.cover_url ?? null,
        galleryUrls: Array.isArray(item.gallery_urls) ? item.gallery_urls : [],
        hours: dbHoursToWizardFormat(item.hours),
        ambiance_tags: Array.isArray(item.ambiance_tags) ? item.ambiance_tags : [],
        service_types: Array.isArray(item.service_types) ? item.service_types : [],
        general_tags: Array.isArray(item.tags) ? item.tags : [],
        amenities: Array.isArray(item.amenities) ? item.amenities : [],
        highlights: [],
        social_links: {
          instagram: socialLinks.instagram ?? "",
          facebook: socialLinks.facebook ?? "",
          snapchat: socialLinks.snapchat ?? "",
          youtube: socialLinks.youtube ?? "",
          tiktok: socialLinks.tiktok ?? "",
          tripadvisor: socialLinks.tripadvisor ?? "",
          waze: socialLinks.waze ?? "",
          google_maps: socialLinks.google_maps ?? "",
        },
      };

      setData(wizardData);
      setEditingId(est.id);
      setCurrentStep(1); // Stay on step 1 but data is pre-filled

      toast({
        title: "Établissement chargé",
        description: `Les données de "${est.name}" ont été chargées. Complétez et modifiez les informations puis cliquez sur Terminer.`,
      });
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Impossible de charger l'établissement",
        variant: "destructive",
      });
    } finally {
      setLoadingExisting(false);
    }
  }, [toast]);

  // Validate step — returns error message or null if valid
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 1:
        if (!data.name || data.name.length < 2) return "Le nom doit contenir au moins 2 caractères";
        if (!data.universe) return "L'univers est requis";
        return null;
      case 2:
        if (!data.city) return "La ville est requise";
        if (!data.address) return "L'adresse est requise";
        if (!data.lat) return "La latitude est requise";
        if (!data.lng) return "La longitude est requise";
        return null;
      case 3:
        if (!data.phone) return "Le téléphone est requis";
        // Google Maps link optional in edit mode (may already exist in DB)
        if (!editingId && !data.google_maps_link) return "Le lien Google Maps est requis";
        return null;
      case 4:
        if (!data.short_description) return "La description courte est requise";
        if (data.short_description.length > 160) return "La description courte ne doit pas dépasser 160 caractères";
        return null;
      case 5:
        // Cover file optional in edit mode (may already exist in DB)
        if (!editingId && !data.coverFile) return "L'image de couverture est requise";
        return null;
      case 6:
      case 7:
        return null;
      default:
        return null;
    }
  };

  // Navigate to next step
  const handleNext = () => {
    const error = validateStep(currentStep);
    if (error) {
      toast({ title: "Champs requis", description: error, variant: "destructive" });
      return;
    }
    setCompletedSteps(prev => [...new Set([...prev, currentStep])]);
    if (currentStep < 7) setCurrentStep(prev => prev + 1);
  };

  // Navigate to previous step
  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  // Skip optional steps (6 and 7)
  const handleSkip = () => {
    setCompletedSteps(prev => [...new Set([...prev, currentStep])]);
    if (currentStep < 7) setCurrentStep(prev => prev + 1);
    else handleSubmit();
  };

  // Final submission
  const handleSubmit = async () => {
    // Validate step 7 or current step first
    const error = validateStep(currentStep);
    if (error && WIZARD_STEPS[currentStep - 1].required) {
      toast({ title: "Champs requis", description: error, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const sessionToken = loadAdminSessionToken();

      // Build payload (exclude File objects)
      const payload = {
        name: data.name,
        universe: data.universe,
        category: data.category,
        subcategory: data.subcategory,
        specialties: data.specialties,
        country: data.country,
        region: data.region,
        city: data.city,
        neighborhood: data.neighborhood,
        postal_code: data.postal_code,
        address: data.address,
        lat: parseFloat(data.lat) || 0,
        lng: parseFloat(data.lng) || 0,
        phone: data.phone,
        whatsapp: data.whatsapp,
        booking_email: data.booking_email,
        google_maps_link: data.google_maps_link,
        website: data.website,
        owner_email: data.owner_email,
        short_description: data.short_description,
        long_description: data.long_description,
        hours: data.hours,
        ambiance_tags: data.ambiance_tags,
        service_types: data.service_types,
        general_tags: data.general_tags,
        amenities: data.amenities,
        highlights: data.highlights,
        social_links: data.social_links,
      };

      // Create or update establishment via API
      const isUpdate = !!editingId;
      const url = isUpdate
        ? `/api/admin/establishments/wizard/${editingId}`
        : "/api/admin/establishments/wizard";
      const res = await fetch(url, {
        method: isUpdate ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || err?.message || `Erreur HTTP ${res.status}`);
      }

      const result = await res.json();
      const establishmentId = isUpdate ? editingId : result?.item?.id;

      // Upload media if establishment created successfully
      if (establishmentId) {
        let logoUrl: string | null = null;
        let coverUrl: string | null = null;
        const galleryUrls: string[] = [];
        const mediaErrors: string[] = [];

        // Upload logo — capture returned URL
        if (data.logoFile) {
          try {
            const fd = new FormData();
            fd.append("image", data.logoFile);
            fd.append("type", "logo");
            const logoRes = await fetch(`/api/admin/establishments/${establishmentId}/gallery/upload`, {
              method: "POST",
              headers: sessionToken ? { "x-admin-session": sessionToken } : {},
              credentials: "include",
              body: fd,
            });
            if (logoRes.ok) {
              const logoData = await logoRes.json();
              logoUrl = logoData.url ?? null;
            } else {
              const errData = await logoRes.json().catch(() => null);
              // Logo upload failed
              mediaErrors.push(`Logo: ${errData?.error || `Erreur HTTP ${logoRes.status}`}`);
            }
          } catch (e) {
            console.error("[Wizard] Logo upload exception:", e);
            mediaErrors.push("Logo: erreur réseau");
          }
        }

        // Upload cover — capture returned URL
        if (data.coverFile) {
          try {
            const fd = new FormData();
            fd.append("image", data.coverFile);
            fd.append("type", "cover");
            const coverRes = await fetch(`/api/admin/establishments/${establishmentId}/gallery/upload`, {
              method: "POST",
              headers: sessionToken ? { "x-admin-session": sessionToken } : {},
              credentials: "include",
              body: fd,
            });
            if (coverRes.ok) {
              const coverData = await coverRes.json();
              coverUrl = coverData.url ?? null;
            } else {
              const errData = await coverRes.json().catch(() => null);
              // Cover upload failed
              mediaErrors.push(`Couverture: ${errData?.error || `Erreur HTTP ${coverRes.status}`}`);
            }
          } catch (e) {
            console.error("[Wizard] Cover upload exception:", e);
            mediaErrors.push("Couverture: erreur réseau");
          }
        }

        // Upload gallery — capture returned URLs
        for (const file of data.galleryFiles) {
          try {
            const fd = new FormData();
            fd.append("image", file);
            fd.append("type", "gallery");
            const gRes = await fetch(`/api/admin/establishments/${establishmentId}/gallery/upload`, {
              method: "POST",
              headers: sessionToken ? { "x-admin-session": sessionToken } : {},
              credentials: "include",
              body: fd,
            });
            if (gRes.ok) {
              const gData = await gRes.json();
              if (gData.url) galleryUrls.push(gData.url);
            } else {
              const errData = await gRes.json().catch(() => null);
              // Gallery upload failed
              mediaErrors.push(`Galerie (${file.name}): ${errData?.error || `Erreur HTTP ${gRes.status}`}`);
            }
          } catch (e) {
            console.error("[Wizard] Gallery upload exception:", e);
            mediaErrors.push(`Galerie (${file.name}): erreur réseau`);
          }
        }

        // Save URLs to database via PATCH
        if (logoUrl || coverUrl || galleryUrls.length > 0) {
          const patchBody: Record<string, unknown> = {};
          if (logoUrl) patchBody.logo_url = logoUrl;
          if (coverUrl) patchBody.cover_url = coverUrl;
          if (galleryUrls.length > 0) patchBody.gallery_urls = galleryUrls;
          const patchRes = await fetch(`/api/admin/establishments/${establishmentId}/gallery`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
            },
            credentials: "include",
            body: JSON.stringify(patchBody),
          });
          if (!patchRes.ok) {
            const errData = await patchRes.json().catch(() => null);
            // Gallery PATCH failed
            mediaErrors.push(`Sauvegarde URLs: ${errData?.error || `Erreur HTTP ${patchRes.status}`}`);
          }
        }

        // Notify user of media upload failures
        if (mediaErrors.length > 0) {
          toast({
            title: "Erreur lors de l'upload des médias",
            description: mediaErrors.join(" · "),
            variant: "destructive",
          });
        }
      }

      toast({
        title: isUpdate ? "Établissement mis à jour !" : "Établissement créé !",
        description: isUpdate
          ? `${data.name} a été mis à jour avec succès.`
          : `${data.name} a été ajouté avec succès.`,
      });

      // Reset and close
      setData(createInitialWizardData());
      setCurrentStep(1);
      setCompletedSteps([]);
      setEditingId(null);
      onCreated();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erreur",
        description: err.message || "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // When dialog closes, reset
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setData(createInitialWizardData());
      setCurrentStep(1);
      setCompletedSteps([]);
      setEditingId(null);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Edit mode banner */}
        {editingId && (
          <div className="flex items-center gap-2 bg-blue-50 border-b border-blue-200 px-6 py-2">
            <Pencil className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-700">
              Mode édition — {data.name}
            </span>
          </div>
        )}

        {/* Loading overlay when fetching existing establishment */}
        {loadingExisting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-6 py-4 shadow-md">
              <Loader2 className="h-5 w-5 animate-spin text-[#a3001d]" />
              <span className="text-sm font-medium text-slate-700">Chargement des données...</span>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-200">
          <WizardProgressBar currentStep={currentStep} completedSteps={completedSteps} />
        </div>

        {/* Scrollable step content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {currentStep === 1 && <WizardStepIdentity data={data} onChange={handleChange} onSelectExisting={handleSelectExisting} />}
          {currentStep === 2 && <WizardStepLocation data={data} onChange={handleChange} />}
          {currentStep === 3 && <WizardStepContact data={data} onChange={handleChange} />}
          {currentStep === 4 && <WizardStepDescriptions data={data} onChange={handleChange} />}
          {currentStep === 5 && <WizardStepMedia data={data} onChange={handleChange} />}
          {currentStep === 6 && <WizardStepHours data={data} onChange={handleChange} />}
          {currentStep === 7 && <WizardStepTags data={data} onChange={handleChange} />}
        </div>

        {/* Footer with navigation buttons */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
          <div>
            {currentStep > 1 && (
              <Button variant="ghost" onClick={handlePrev} disabled={submitting}>
                <ChevronLeft className="me-1 h-4 w-4" />
                Précédent
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Skip button for optional steps (6 & 7) */}
            {!WIZARD_STEPS[currentStep - 1].required && (
              <Button variant="ghost" onClick={handleSkip} disabled={submitting}>
                <SkipForward className="me-1 h-4 w-4" />
                Ignorer
              </Button>
            )}

            {/* Next / Submit button */}
            {currentStep < 7 ? (
              <Button onClick={handleNext} disabled={submitting} className="bg-[#a3001d] hover:bg-[#8a0018] text-white">
                Suivant
                <ChevronRight className="ms-1 h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} className="bg-[#a3001d] hover:bg-[#8a0018] text-white">
                {submitting ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {editingId ? "Mise à jour en cours..." : "Création en cours..."}
                  </>
                ) : (
                  <>
                    <Check className="me-1 h-4 w-4" />
                    {editingId ? "Mettre à jour" : "Terminer"}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
