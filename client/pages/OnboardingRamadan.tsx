/**
 * OnboardingRamadan — Formulaire public multi-étapes
 * Route: /onboarding/ramadan (standalone, hors LocaleLayout)
 *
 * Step 0: Bienvenue
 * Step 1: Sélection établissement
 * Step 2: Vérification email (OTP 6 chiffres)
 * Step 3: Identité & contact
 * Step 4: Création offre Ramadan
 * Step 5: Détails de l'offre
 * Step 6: Confirmation + bouton commercial
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CrescentMoonSvg } from "@/components/ramadan/ramadan-assets";
import { RamadanStarryBackground } from "@/components/ramadan/RamadanStarryBackground";
import { Check, ChevronLeft, ChevronRight, Loader2, Search, Phone, Mail, Gift, Clock, Users, MapPin, Star, Plus, Link, Instagram, ChevronDown } from "lucide-react";
import { CUISINE_TYPES } from "@/lib/taxonomy";

// =============================================================================
// Constants
// =============================================================================

const API_BASE = "/api/public/onboarding";

const RAMADAN_COLORS = {
  night: "#0A1628",
  deep: "#1B2A4A",
  gold: "#D4AF37",
  cream: "#FFF8E7",
  bordeaux: "#5C1A1B",
  goldLight: "#E8D48B",
  goldDark: "#B8960C",
  brandRed: "#a3001d",
};

const OFFER_TYPES = [
  { value: "ftour", label: "Ftour" },
  { value: "shour", label: "S'hour" },
  { value: "traiteur", label: "Traiteur" },
  { value: "pack_famille", label: "Pack Famille" },
  { value: "special", label: "Spécial Ramadan" },
] as const;

const ROLE_OPTIONS = [
  { value: "proprietaire", label: "Propriétaire" },
  { value: "gerant", label: "Gérant(e)" },
  { value: "employe", label: "Employé(e)" },
  { value: "agence", label: "Agence de communication" },
] as const;

const SLOT_INTERVALS = [
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "1 heure" },
  { value: "90", label: "1h30" },
  { value: "120", label: "2 heures" },
] as const;

const COMMERCIAL_SLOTS = [
  { value: "10h-13h", label: "10h — 13h", icon: "🕙" },
  { value: "14h-17h", label: "14h — 17h", icon: "🕑" },
  { value: "20h-22h", label: "20h — 22h", icon: "🌙" },
] as const;

const STEP_LABELS = ["Établissement", "Email", "Identité", "Offre", "Détails"];

type Establishment = { id: string; name: string; city: string; cover_url: string | null; claimed?: boolean };

// =============================================================================
// API helpers
// =============================================================================

async function fetchEstablishments(): Promise<Establishment[]> {
  const resp = await fetch(`${API_BASE}/establishments`);
  if (!resp.ok) throw new Error("Erreur réseau");
  const data = await resp.json();
  return data.establishments ?? [];
}

async function sendOtpCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`${API_BASE}/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return resp.json();
}

async function verifyOtpCode(email: string, code: string): Promise<{ ok: boolean; verified?: boolean; error?: string }> {
  const resp = await fetch(`${API_BASE}/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  return resp.json();
}

async function submitOnboarding(payload: Record<string, unknown>): Promise<{ ok: boolean; is_new_user?: boolean; offer_id?: string; error?: string }> {
  const resp = await fetch(`${API_BASE}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

async function requestCommercialCallback(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const resp = await fetch(`${API_BASE}/commercial-callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return resp.json();
}

// =============================================================================
// Tiny progress bar
// =============================================================================

function OnboardingProgress({ step }: { step: number }) {
  // Steps 1-5 are visible (step 0=welcome, step 6=confirmation are not shown)
  if (step < 1 || step > 5) return null;
  const current = step; // 1-indexed
  const total = 5;

  return (
    <div className="w-full max-w-2xl mx-auto mb-6 px-4">
      {/* Thin bar */}
      <div className="relative h-[3px] w-full bg-white/10 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-in-out"
          style={{ width: `${((current - 1) / (total - 1)) * 100}%`, backgroundColor: RAMADAN_COLORS.gold }}
        />
      </div>
      {/* Step pills */}
      <div className="mt-3 flex items-center justify-between">
        {STEP_LABELS.map((label, idx) => {
          const num = idx + 1;
          const isCompleted = current > num;
          const isCurrent = current === num;
          return (
            <div key={num} className="flex flex-col items-center flex-1">
              <div
                className={`
                  flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all duration-300
                  ${isCompleted ? "bg-[#D4AF37] text-[#0A1628]" : ""}
                  ${isCurrent ? "bg-white/20 text-[#D4AF37] ring-2 ring-[#D4AF37]/40" : ""}
                  ${!isCompleted && !isCurrent ? "bg-white/5 text-white/30" : ""}
                `}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : num}
              </div>
              <span className={`mt-1 text-[10px] hidden sm:block ${isCurrent ? "text-[#D4AF37] font-semibold" : isCompleted ? "text-[#D4AF37]/70" : "text-white/30"}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export default function OnboardingRamadan() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 — Establishment
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [estabSearch, setEstabSearch] = useState("");
  const [selectedEstab, setSelectedEstab] = useState<Establishment | null>(null);
  const [estabLoading, setEstabLoading] = useState(false);
  const [isNewEstab, setIsNewEstab] = useState(false);
  const [newEstabName, setNewEstabName] = useState("");
  const [newEstabSpecialty, setNewEstabSpecialty] = useState("");
  const [newEstabGoogleMaps, setNewEstabGoogleMaps] = useState("");
  const [newEstabInstagram, setNewEstabInstagram] = useState("");
  const [existingEstabInstagram, setExistingEstabInstagram] = useState("");
  const [existingEstabGoogleMaps, setExistingEstabGoogleMaps] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Step 2 — Email
  const [email, setEmail] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpTimer, setOtpTimer] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Step 3 — Identity
  const [phone, setPhone] = useState("+212");
  const [role, setRole] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Step 4 — Offer creation
  const [offerType, setOfferType] = useState("ftour");
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("20:00");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerDescription, setOfferDescription] = useState("");

  // Step 5 — Offer details
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState("");
  const [slotInterval, setSlotInterval] = useState("30");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [hasPromo, setHasPromo] = useState(false);
  const [promoType, setPromoType] = useState<"percent" | "amount">("percent");
  const [promoValue, setPromoValue] = useState("");

  // Step 6 — Confirmation
  const [isNewUser, setIsNewUser] = useState(false);
  const [offerId, setOfferId] = useState("");
  const [commercialRequested, setCommercialRequested] = useState(false);
  const [showCommercialSlots, setShowCommercialSlots] = useState(false);
  const [commercialLoading, setCommercialLoading] = useState(false);

  // --- Sync step ↔ browser history so the Back button works correctly ---
  // Push a new history entry each time the user advances a step.
  // When the user presses the browser Back button, we intercept popstate and
  // go back to the previous step without losing any form data.
  const isPopstateRef = useRef(false);

  // On step change: push a history entry (unless the change came from popstate itself)
  useEffect(() => {
    if (isPopstateRef.current) {
      // This step change was triggered by popstate — don't push again
      isPopstateRef.current = false;
      return;
    }
    // Replace on initial render (step 0), push for subsequent steps
    if (step === 0 && window.history.state?.onboardingStep == null) {
      window.history.replaceState({ onboardingStep: 0 }, "");
    } else {
      window.history.pushState({ onboardingStep: step }, "");
    }
  }, [step]);

  // Listen for popstate (browser Back/Forward)
  useEffect(() => {
    const handler = (e: PopStateEvent) => {
      const targetStep = e.state?.onboardingStep;
      if (typeof targetStep === "number" && targetStep >= 0 && targetStep <= 6) {
        isPopstateRef.current = true;
        setStep(targetStep);
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);

  // Fetch establishments on mount
  useEffect(() => {
    setEstabLoading(true);
    fetchEstablishments()
      .then(setEstablishments)
      .catch(() => setError("Impossible de charger les établissements"))
      .finally(() => setEstabLoading(false));
  }, []);

  // OTP timer
  useEffect(() => {
    if (otpTimer <= 0) return;
    const id = setTimeout(() => setOtpTimer((t) => t - 1), 1000);
    return () => clearTimeout(id);
  }, [otpTimer]);

  // Filtered establishments — only show when search has 2+ chars
  const filteredEstabs = useMemo(() => {
    const q = estabSearch.trim().toLowerCase();
    if (q.length < 2) return [];
    return establishments.filter(
      (e) => e.name.toLowerCase().includes(q) || e.city.toLowerCase().includes(q),
    );
  }, [establishments, estabSearch]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- Actions ---

  const handleSendOtp = useCallback(async () => {
    if (!email || !email.includes("@")) {
      setError("Veuillez saisir un email valide.");
      return;
    }
    setOtpLoading(true);
    setError("");
    const result = await sendOtpCode(email);
    setOtpLoading(false);
    if (result.ok) {
      setOtpSent(true);
      setOtpTimer(120);
      setOtpDigits(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } else {
      setError(result.error || "Erreur lors de l'envoi du code.");
    }
  }, [email]);

  const handleOtpChange = useCallback(
    (idx: number, val: string) => {
      // Handle multi-digit paste / autofill (iOS OTP, clipboard paste)
      const digits = val.replace(/\D/g, "");
      if (digits.length > 1) {
        const newDigits = [...otpDigits];
        for (let i = 0; i < digits.length && idx + i < 6; i++) {
          newDigits[idx + i] = digits[i];
        }
        setOtpDigits(newDigits);
        const nextIdx = Math.min(idx + digits.length, 5);
        otpRefs.current[nextIdx]?.focus();

        // Auto-verify when all 6 digits filled
        if (newDigits.every((d) => d)) {
          const code = newDigits.join("");
          setOtpLoading(true);
          setError("");
          verifyOtpCode(email, code).then((result) => {
            setOtpLoading(false);
            if (result.verified) {
              setEmailVerified(true);
            } else {
              setError(result.error || "Code incorrect.");
              setOtpDigits(["", "", "", "", "", ""]);
              otpRefs.current[0]?.focus();
            }
          });
        }
        return;
      }

      if (digits.length === 1) {
        val = digits;
      } else if (val) {
        return;
      } else {
        val = "";
      }

      const newDigits = [...otpDigits];
      newDigits[idx] = val;
      setOtpDigits(newDigits);

      if (val && idx < 5) {
        otpRefs.current[idx + 1]?.focus();
      }

      // Auto-verify when all 6 digits filled
      if (val && newDigits.every((d) => d)) {
        const code = newDigits.join("");
        setOtpLoading(true);
        setError("");
        verifyOtpCode(email, code).then((result) => {
          setOtpLoading(false);
          if (result.verified) {
            setEmailVerified(true);
          } else {
            setError(result.error || "Code incorrect.");
            setOtpDigits(["", "", "", "", "", ""]);
            otpRefs.current[0]?.focus();
          }
        });
      }
    },
    [otpDigits, email],
  );

  const handleOtpPaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
      if (!pasted) return;
      const newDigits = [...otpDigits];
      for (let i = 0; i < pasted.length && i < 6; i++) {
        newDigits[i] = pasted[i];
      }
      setOtpDigits(newDigits);
      const nextIdx = Math.min(pasted.length, 5);
      otpRefs.current[nextIdx]?.focus();

      // Auto-verify when all 6 digits filled
      if (newDigits.every((d) => d)) {
        const code = newDigits.join("");
        setOtpLoading(true);
        setError("");
        verifyOtpCode(email, code).then((result) => {
          setOtpLoading(false);
          if (result.verified) {
            setEmailVerified(true);
          } else {
            setError(result.error || "Code incorrect.");
            setOtpDigits(["", "", "", "", "", ""]);
            otpRefs.current[0]?.focus();
          }
        });
      }
    },
    [otpDigits, email],
  );

  const handleOtpKeyDown = useCallback(
    (idx: number, e: React.KeyboardEvent) => {
      if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
        otpRefs.current[idx - 1]?.focus();
      }
    },
    [otpDigits],
  );

  const handleSubmit = useCallback(async () => {
    // Client-side validation before submitting
    if (!isNewEstab && !selectedEstab?.id) {
      setError("Veuillez sélectionner ou créer un établissement (étape 1).");
      return;
    }
    if (isNewEstab && !newEstabName.trim()) {
      setError("Veuillez renseigner le nom de votre établissement (étape 1).");
      return;
    }

    setLoading(true);
    setError("");

    const payload: Record<string, unknown> = {
      email,
      phone,
      role,
      first_name: firstName,
      last_name: lastName,
      offer_title: offerTitle,
      offer_description: offerDescription,
      offer_type: offerType,
      start_date: startDate,
      end_date: endDate,
      start_time: startTime,
      end_time: endTime,
      slot_interval: parseInt(slotInterval, 10),
      price: parseFloat(price),
      capacity: parseInt(capacity, 10),
    };

    if (isNewEstab) {
      payload.new_establishment = true;
      payload.new_establishment_name = newEstabName.trim();
      payload.new_establishment_specialty = newEstabSpecialty;
      payload.new_establishment_google_maps = newEstabGoogleMaps.trim();
      payload.new_establishment_instagram = newEstabInstagram.trim();
    } else {
      payload.establishment_id = selectedEstab?.id;
      if (existingEstabInstagram.trim()) payload.existing_establishment_instagram = existingEstabInstagram.trim();
      if (existingEstabGoogleMaps.trim()) payload.existing_establishment_google_maps = existingEstabGoogleMaps.trim();
    }

    if (hasPromo && promoValue) {
      payload.promotion_type = promoType;
      payload.promotion_value = parseFloat(promoValue);
    }

    const result = await submitOnboarding(payload);
    setLoading(false);

    if (result.ok) {
      setIsNewUser(!!result.is_new_user);
      setOfferId(result.offer_id || "");
      setStep(6);
    } else {
      setError(result.error || "Erreur lors de la soumission.");
    }
  }, [selectedEstab, isNewEstab, newEstabName, newEstabSpecialty, newEstabGoogleMaps, newEstabInstagram, existingEstabInstagram, existingEstabGoogleMaps, email, phone, role, firstName, lastName, offerTitle, offerDescription, offerType, startDate, endDate, startTime, endTime, slotInterval, price, capacity, hasPromo, promoType, promoValue]);

  const handleCommercialSlot = useCallback(
    async (slot: string) => {
      setCommercialLoading(true);
      const result = await requestCommercialCallback({
        establishment_id: selectedEstab?.id,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        preferred_slot: slot,
      });
      setCommercialLoading(false);
      if (result.ok) {
        setCommercialRequested(true);
        // Redirect to Instagram after a short delay
        setTimeout(() => {
          window.open("https://www.instagram.com/sortiraumaroc", "_blank");
        }, 3000);
      }
    },
    [selectedEstab, firstName, lastName, phone, email],
  );

  // --- Validation per step ---

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return true;
      case 1:
        if (isNewEstab) {
          return !!newEstabName.trim() && !!newEstabSpecialty && !!newEstabGoogleMaps.trim() && !!newEstabInstagram.trim();
        }
        return !!selectedEstab;
      case 2: return emailVerified;
      case 3: return !!phone && phone.length >= 10 && !!role && !!firstName && !!lastName;
      case 4: return !!offerType && !!offerTitle;
      case 5: return !!startDate && !!endDate && !!price && parseFloat(price) > 0 && !!capacity && parseInt(capacity, 10) > 0;
      default: return false;
    }
  }, [step, selectedEstab, isNewEstab, newEstabName, newEstabSpecialty, newEstabGoogleMaps, newEstabInstagram, emailVerified, phone, role, firstName, lastName, offerType, offerTitle, startDate, endDate, price, capacity]);

  const goNext = useCallback(() => {
    setError("");
    if (!canProceed) {
      // Step-specific validation messages
      if (step === 1) {
        if (isNewEstab) {
          if (!newEstabName.trim()) { setError("Veuillez renseigner le nom de l'établissement."); return; }
          if (!newEstabSpecialty) { setError("Veuillez choisir une spécialité."); return; }
          if (!newEstabGoogleMaps.trim()) { setError("Veuillez renseigner le lien Google Maps."); return; }
          if (!newEstabInstagram.trim()) { setError("Veuillez renseigner le lien Instagram."); return; }
        } else {
          setError("Veuillez sélectionner ou ajouter un établissement.");
        }
      } else if (step === 3) {
        if (!phone || phone.length < 10) { setError("Veuillez renseigner un numéro de mobile valide."); return; }
        if (!role) { setError("Veuillez choisir votre fonction."); return; }
        if (!firstName) { setError("Veuillez renseigner votre prénom."); return; }
        if (!lastName) { setError("Veuillez renseigner votre nom."); return; }
      } else if (step === 4) {
        if (!offerType) { setError("Veuillez choisir un type d'offre."); return; }
        if (!offerTitle) { setError("Veuillez renseigner le titre de l'offre."); return; }
      } else if (step === 5) {
        if (!startDate) { setError("Veuillez renseigner la date de début."); return; }
        if (!endDate) { setError("Veuillez renseigner la date de fin."); return; }
        if (!price || parseFloat(price) <= 0) { setError("Veuillez renseigner un prix valide."); return; }
        if (!capacity || parseInt(capacity, 10) <= 0) { setError("Veuillez renseigner la capacité."); return; }
      }
      return;
    }
    if (step === 5) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  }, [step, handleSubmit, canProceed, isNewEstab, newEstabName, newEstabSpecialty, newEstabGoogleMaps, newEstabInstagram, phone, role, firstName, lastName, offerType, offerTitle, startDate, endDate, price, capacity]);

  const goBack = useCallback(() => {
    setError("");
    setStep((s) => Math.max(0, s - 1));
  }, []);

  // =================================================================
  // RENDER
  // =================================================================

  return (
    <div className="min-h-screen relative" style={{ background: `linear-gradient(to bottom, ${RAMADAN_COLORS.night}, ${RAMADAN_COLORS.deep})` }}>
      <RamadanStarryBackground />

      <div className="relative z-10 flex flex-col items-center justify-start min-h-screen py-8 px-4">
        {/* Progress */}
        <OnboardingProgress step={step} />

        {/* Card */}
        <div className="w-full max-w-2xl overflow-hidden">
          <div className="bg-white rounded-2xl shadow-2xl overflow-visible transition-all duration-300 onboarding-ramadan-card">

            {/* ========== STEP 0 — WELCOME ========== */}
            {step === 0 && (
              <div className="text-center px-5 py-8 sm:px-12 sm:py-16 onboarding-step-contained">
                <div className="flex justify-center mb-4 sm:mb-6">
                  <img src="/Logo_SAM_N.png" alt="SAM.ma" className="h-16 sm:h-24 w-auto" />
                </div>
                <h1 className="text-2xl sm:text-4xl font-bold mb-3 sm:mb-4" style={{ color: RAMADAN_COLORS.brandRed }}>
                  Bienvenue chez SAM.ma
                </h1>
                <p className="text-sm sm:text-lg mb-2 leading-snug sm:leading-relaxed font-semibold text-gray-800 sm:whitespace-normal">
                  La plateforme qui transforme<br className="sm:hidden" /> votre visibilité en réservations.
                </p>
                <p className="text-xs sm:text-base mb-6 sm:mb-8 leading-relaxed max-w-lg mx-auto text-gray-700 text-justify sm:text-center">
                  SAM.ma est un outil d'aide à la vente conçu pour les professionnels de la restauration et des loisirs au Maroc. Notre mission : vous connecter à de nouveaux clients et simplifier la gestion de vos réservations.
                </p>

                {/* Free period badge */}
                <div className="inline-block rounded-xl px-4 sm:px-6 py-3 sm:py-4 mb-6 sm:mb-8 bg-green-50 border border-green-200 text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Gift className="w-5 h-5 text-green-600 shrink-0" />
                    <span className="font-bold text-xs sm:text-sm text-green-700">
                      Phase de lancement
                    </span>
                  </div>
                  <p className="font-semibold text-xs sm:text-sm text-green-700 mb-2">
                    100% gratuit jusqu'au 31 mars 2026
                  </p>
                  <p className="text-xs text-gray-600 text-justify sm:text-center">
                    Toutes les réservations générées via SAM.ma sont entièrement gratuites. Aucune commission, aucun frais caché — une opportunité idéale pour tester notre solution en toute sérénité.
                  </p>
                  <p className="text-xs text-gray-500 mt-1 text-justify sm:text-center">
                    Après cette période, vous pourrez désactiver votre compte à tout moment, sans engagement.
                  </p>
                </div>

                <p className="text-xs sm:text-sm mb-6 sm:mb-8 text-gray-600 leading-relaxed">
                  En quelques étapes, créez votre offre Ramadan<br className="sm:hidden" /> et commencez à recevoir des réservations dès aujourd'hui.
                </p>

                <button
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-bold text-base sm:text-lg transition-all hover:scale-105 hover:shadow-lg"
                  style={{ backgroundColor: RAMADAN_COLORS.brandRed, color: "#FFFFFF" }}
                >
                  Créer mon offre Ramadan
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* ========== STEP 1 — ESTABLISHMENT ========== */}
            {step === 1 && (
              <div className="p-4 sm:p-8 min-h-[60vh] sm:min-h-[50vh]">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Votre établissement</h2>
                <p className="text-sm text-gray-500 mb-6">
                  {isNewEstab
                    ? "Renseignez les informations de votre établissement"
                    : "Recherchez votre établissement par nom ou ville"}
                </p>

                {/* ---- Selected establishment badge ---- */}
                {selectedEstab && !isNewEstab && (
                  <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-[#D4AF37] bg-[#D4AF37]/5">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                      {selectedEstab.cover_url ? (
                        <img src={selectedEstab.cover_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <MapPin className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm text-gray-900 truncate">{selectedEstab.name}</p>
                      {selectedEstab.city && <p className="text-xs text-gray-500">{selectedEstab.city}</p>}
                    </div>
                    <button
                      onClick={() => { setSelectedEstab(null); setEstabSearch(""); }}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium shrink-0"
                    >
                      Changer
                    </button>
                  </div>
                )}

                {/* ---- Optional Google Maps / Instagram for existing establishments ---- */}
                {selectedEstab && !isNewEstab && (
                  <div className="space-y-3 mb-4">
                    <p className="text-xs text-gray-400">Complétez si possible (optionnel)</p>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lien Google Maps</label>
                      <div className="relative">
                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          placeholder="https://maps.google.com/..."
                          value={existingEstabGoogleMaps}
                          onChange={(e) => setExistingEstabGoogleMaps(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lien Instagram</label>
                      <div className="relative">
                        <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          placeholder="https://instagram.com/..."
                          value={existingEstabInstagram}
                          onChange={(e) => setExistingEstabInstagram(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* ---- Search autocomplete (only if no selection and not in "new" mode) ---- */}
                {!selectedEstab && !isNewEstab && (
                  <div ref={searchWrapperRef} className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Tapez le nom de votre établissement..."
                      value={estabSearch}
                      onChange={(e) => {
                        setEstabSearch(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                    />

                    {/* Suggestions dropdown */}
                    {showSuggestions && estabSearch.trim().length >= 2 && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-[280px] overflow-y-auto">
                        {estabLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                          </div>
                        ) : filteredEstabs.length > 0 ? (
                          <>
                            {filteredEstabs.slice(0, 8).map((e) => (
                              <button
                                key={e.id}
                                onClick={() => {
                                  if (e.claimed) return;
                                  setSelectedEstab(e);
                                  setShowSuggestions(false);
                                  setEstabSearch("");
                                }}
                                disabled={!!e.claimed}
                                className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-50 last:border-b-0 ${
                                  e.claimed ? "opacity-60 cursor-not-allowed bg-gray-50" : "hover:bg-gray-50"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-gray-100 shrink-0 overflow-hidden">
                                    {e.cover_url ? (
                                      <img src={e.cover_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center text-gray-300">
                                        <MapPin className="w-3.5 h-3.5" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className={`font-semibold text-sm truncate ${e.claimed ? "text-gray-400" : "text-gray-900"}`}>{e.name}</p>
                                    {e.city && <p className="text-xs text-gray-500">{e.city}</p>}
                                    {e.claimed && (
                                      <p className="text-xs text-red-500 mt-0.5">Nous sommes désolés, cette fiche a déjà été revendiquée</p>
                                    )}
                                  </div>
                                </div>
                              </button>
                            ))}
                            {/* "Add my establishment" at bottom of suggestions */}
                            <button
                              onClick={() => {
                                setIsNewEstab(true);
                                setNewEstabName(estabSearch.trim());
                                setShowSuggestions(false);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors border-t border-gray-100 flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4 text-[#D4AF37]" />
                              <span className="text-sm font-medium text-[#D4AF37]">Ajouter mon établissement</span>
                            </button>
                          </>
                        ) : (
                          <div className="p-4">
                            <p className="text-sm text-gray-500 mb-3">Aucun résultat pour « {estabSearch.trim()} »</p>
                            <button
                              onClick={() => {
                                setIsNewEstab(true);
                                setNewEstabName(estabSearch.trim());
                                setShowSuggestions(false);
                              }}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-[#D4AF37] text-[#D4AF37] font-semibold text-sm hover:bg-[#D4AF37]/5 transition-all"
                            >
                              <Plus className="w-4 h-4" />
                              Ajouter mon établissement
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- "New establishment" form ---- */}
                {isNewEstab && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-sm font-semibold text-gray-700">Nouvel établissement</span>
                      </div>
                      <button
                        onClick={() => {
                          setIsNewEstab(false);
                          setNewEstabName("");
                          setNewEstabSpecialty("");
                          setNewEstabGoogleMaps("");
                          setNewEstabInstagram("");
                          setEstabSearch("");
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                      >
                        Annuler
                      </button>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'établissement *</label>
                      <input
                        type="text"
                        placeholder="Ex: Restaurant Le Jardin"
                        value={newEstabName}
                        onChange={(e) => setNewEstabName(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                      />
                    </div>

                    {/* Specialty */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Spécialité *</label>
                      <div className="relative">
                        <select
                          value={newEstabSpecialty}
                          onChange={(e) => setNewEstabSpecialty(e.target.value)}
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm bg-white appearance-none pr-10"
                        >
                          <option value="">— Choisir une spécialité —</option>
                          {CUISINE_TYPES.map((ct) => (
                            <option key={ct} value={ct}>{ct}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </div>

                    {/* Google Maps link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lien Google Maps *</label>
                      <div className="relative">
                        <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          placeholder="https://maps.google.com/..."
                          value={newEstabGoogleMaps}
                          onChange={(e) => setNewEstabGoogleMaps(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                        />
                      </div>
                    </div>

                    {/* Instagram link */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Lien Instagram *</label>
                      <div className="relative">
                        <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="url"
                          placeholder="https://instagram.com/..."
                          value={newEstabInstagram}
                          onChange={(e) => setNewEstabInstagram(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ========== STEP 2 — EMAIL + OTP ========== */}
            {step === 2 && (
              <div className="p-4 sm:p-8 onboarding-step-contained">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Adresse email de contact</h2>
                <p className="text-sm text-gray-500 mb-6">Cette adresse recevra les confirmations de réservation</p>

                {!emailVerified ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email professionnel</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="email"
                          placeholder="contact@restaurant.ma"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          disabled={otpSent}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    {!otpSent ? (
                      <button
                        onClick={handleSendOtp}
                        disabled={otpLoading || !email.includes("@")}
                        className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-50"
                        style={{ backgroundColor: RAMADAN_COLORS.gold, color: RAMADAN_COLORS.night }}
                      >
                        {otpLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Envoyer le code de vérification"}
                      </button>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">
                          Un code à 6 chiffres a été envoyé à <strong>{email}</strong>
                        </p>
                        <p className="text-xs text-gray-400 mb-4">
                          Pensez à vérifier vos spams si vous ne le recevez pas.
                        </p>

                        {/* OTP inputs */}
                        <div className="flex gap-2 justify-center mb-4">
                          {otpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={(el) => { otpRefs.current[idx] = el; }}
                              type="text"
                              inputMode="numeric"
                              maxLength={6}
                              value={digit}
                              onChange={(e) => handleOtpChange(idx, e.target.value)}
                              onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                              onPaste={handleOtpPaste}
                              autoComplete={idx === 0 ? "one-time-code" : "off"}
                              className="w-12 h-14 text-center text-xl font-bold border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37]"
                            />
                          ))}
                        </div>

                        {otpLoading && (
                          <div className="flex items-center justify-center mb-3">
                            <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            <span className="ml-2 text-sm text-gray-400">Vérification...</span>
                          </div>
                        )}

                        {/* Resend */}
                        <div className="text-center text-sm text-gray-500">
                          {otpTimer > 0 ? (
                            <span>Renvoyer dans {otpTimer}s</span>
                          ) : (
                            <button onClick={handleSendOtp} className="text-[#D4AF37] font-semibold hover:underline">
                              Renvoyer le code
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                      <Check className="w-8 h-8 text-green-500" />
                    </div>
                    <p className="font-semibold text-gray-900">Email vérifié</p>
                    <p className="text-sm text-gray-500 mt-1">{email}</p>
                  </div>
                )}
              </div>
            )}

            {/* ========== STEP 3 — IDENTITY ========== */}
            {step === 3 && (
              <div className="p-4 sm:p-8 onboarding-step-contained">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Vos coordonnées</h2>
                <p className="text-sm text-gray-500 mb-6">Ces informations nous permettent de vous identifier</p>

                {/* Phone */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de mobile *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="tel"
                      placeholder="+212 6XX XXX XXX"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                    />
                  </div>
                </div>

                {/* Role */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Votre fonction *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {ROLE_OPTIONS.map((r) => (
                      <button
                        key={r.value}
                        onClick={() => setRole(r.value)}
                        className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all ${
                          role === r.value
                            ? "border-[#D4AF37] bg-[#D4AF37]/5 text-gray-900"
                            : "border-gray-100 text-gray-600 hover:border-gray-200"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prénom *</label>
                    <input
                      type="text"
                      placeholder="Prénom"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                    <input
                      type="text"
                      placeholder="Nom"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ========== STEP 4 — OFFER CREATION ========== */}
            {step === 4 && (
              <div className="p-4 sm:p-8 onboarding-step-contained">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Décrivez votre offre Ramadan</h2>
                <p className="text-sm text-gray-500 mb-6">Créez une offre attractive pour vos clients</p>

                {/* Offer type chips */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type d'offre *</label>
                  <div className="flex flex-wrap gap-2">
                    {OFFER_TYPES.map((t) => (
                      <button
                        key={t.value}
                        onClick={() => setOfferType(t.value)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          offerType === t.value
                            ? "text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        style={offerType === t.value ? { backgroundColor: RAMADAN_COLORS.gold, color: RAMADAN_COLORS.night } : {}}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Time slot (prefilled) */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Premier créneau *</label>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                    <span className="text-gray-400 shrink-0">→</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="flex-1 min-w-0 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                  </div>
                </div>

                {/* Title */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Titre de l'offre *
                    <span className="ml-2 text-xs text-gray-400">{offerTitle.length}/140</span>
                  </label>
                  <textarea
                    placeholder="Ex: Ftour authentique dans un cadre raffiné au cœur de la médina"
                    value={offerTitle}
                    onChange={(e) => setOfferTitle(e.target.value.slice(0, 140))}
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm resize-none"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description détaillée *
                    <span className="ml-2 text-xs text-gray-400">{offerDescription.length}/750</span>
                  </label>
                  <textarea
                    placeholder="Décrivez le menu, l'ambiance, les spécialités..."
                    value={offerDescription}
                    onChange={(e) => setOfferDescription(e.target.value.slice(0, 750))}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 focus:border-[#D4AF37] text-sm resize-none"
                  />
                  <p className="text-xs text-gray-400 mt-1">Ce texte sera utilisé pour le référencement et l'assistant SAM AI</p>
                </div>
              </div>
            )}

            {/* ========== STEP 5 — OFFER DETAILS ========== */}
            {step === 5 && (
              <div className="p-4 sm:p-8 onboarding-step-contained">
                <h2 className="text-xl font-bold text-gray-900 mb-1">Détails de l'offre</h2>
                <p className="text-sm text-gray-500 mb-6">Dates, prix et capacité de votre offre</p>

                {/* Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de début *</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 sm:px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin *</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      className="w-full px-3 sm:px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                  </div>
                </div>

                {/* Slot interval */}
                <div className="mb-5">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Délai entre chaque créneau *</label>
                  <div className="flex flex-wrap gap-2">
                    {SLOT_INTERVALS.map((si) => (
                      <button
                        key={si.value}
                        onClick={() => setSlotInterval(si.value)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                          slotInterval === si.value
                            ? "text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        style={slotInterval === si.value ? { backgroundColor: RAMADAN_COLORS.gold, color: RAMADAN_COLORS.night } : {}}
                      >
                        {si.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price + Capacity */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Prix (MAD) *</label>
                    <input
                      type="number"
                      placeholder="150"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      min="0"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Capacité (places) *</label>
                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="number"
                        placeholder="30"
                        value={capacity}
                        onChange={(e) => setCapacity(e.target.value)}
                        min="1"
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Promotion */}
                <div className="mb-2">
                  <button
                    onClick={() => setHasPromo(!hasPromo)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm transition-all ${
                      hasPromo ? "border-[#D4AF37] bg-[#D4AF37]/5" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Star className={`w-4 h-4 ${hasPromo ? "text-[#D4AF37]" : "text-gray-400"}`} />
                    <span className={hasPromo ? "font-semibold text-gray-900" : "text-gray-600"}>Ajouter une promotion</span>
                  </button>
                </div>

                {hasPromo && (
                  <div className="flex items-center gap-3 mt-3 p-4 bg-amber-50 rounded-xl">
                    <input
                      type="number"
                      placeholder="10"
                      value={promoValue}
                      onChange={(e) => setPromoValue(e.target.value)}
                      min="0"
                      className="w-24 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/30 text-sm"
                    />
                    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setPromoType("percent")}
                        className={`px-3 py-2 text-sm ${promoType === "percent" ? "bg-[#D4AF37] text-white font-semibold" : "text-gray-600"}`}
                      >
                        %
                      </button>
                      <button
                        onClick={() => setPromoType("amount")}
                        className={`px-3 py-2 text-sm ${promoType === "amount" ? "bg-[#D4AF37] text-white font-semibold" : "text-gray-600"}`}
                      >
                        MAD
                      </button>
                    </div>
                    <span className="text-xs text-gray-500">de réduction</span>
                  </div>
                )}
              </div>
            )}

            {/* ========== STEP 6 — CONFIRMATION ========== */}
            {step === 6 && (
              <div className="p-4 sm:p-8 text-center onboarding-step-contained">
                {/* Animated check */}
                <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center" style={{ backgroundColor: `${RAMADAN_COLORS.gold}15` }}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: RAMADAN_COLORS.gold }}>
                    <Check className="w-8 h-8 text-white" strokeWidth={3} />
                  </div>
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-3">Merci !</h2>
                <p className="text-gray-600 mb-2 text-justify sm:text-center">
                  Votre offre a été transmise avec succès.
                </p>
                <p className="text-gray-600 mb-2 text-justify sm:text-center">
                  Un modérateur va prendre en charge votre demande dans les plus brefs délais.
                </p>
                <p className="text-sm text-gray-500 mb-6 text-justify sm:text-center">
                  Vous recevrez un email de confirmation à l'adresse indiquée.
                </p>

                {isNewUser && (
                  <div className="mb-6 p-4 rounded-xl bg-blue-50 text-sm text-blue-800">
                    <Mail className="w-4 h-4 inline-block mr-1" />
                    Un email vous a été envoyé pour créer votre mot de passe et accéder à votre <strong>Espace Pro SAM.ma</strong>.
                  </div>
                )}

                {/* Commercial callback */}
                {!commercialRequested ? (
                  <div className="mb-6">
                    {!showCommercialSlots ? (
                      <button
                        onClick={() => setShowCommercialSlots(true)}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-[#D4AF37] text-sm font-semibold transition-all hover:bg-[#D4AF37]/5"
                        style={{ color: RAMADAN_COLORS.gold }}
                      >
                        <Phone className="w-4 h-4" />
                        Je souhaite aussi être contacté par un commercial
                      </button>
                    ) : (
                      <div className="p-4 rounded-xl bg-gray-50">
                        <p className="text-sm font-semibold text-gray-700 mb-3">Choisissez un créneau :</p>
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          {COMMERCIAL_SLOTS.map((s) => (
                            <button
                              key={s.value}
                              onClick={() => handleCommercialSlot(s.value)}
                              disabled={commercialLoading}
                              className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-gray-200 text-sm font-medium transition-all hover:border-[#D4AF37] hover:bg-[#D4AF37]/5 disabled:opacity-50"
                            >
                              <span>{s.icon}</span>
                              <span>{s.label}</span>
                            </button>
                          ))}
                        </div>
                        {commercialLoading && (
                          <Loader2 className="w-4 h-4 animate-spin mx-auto mt-3 text-gray-400" />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mb-6 p-5 rounded-xl bg-green-50 text-center">
                    <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center bg-green-500">
                      <Check className="w-6 h-6 text-white" strokeWidth={3} />
                    </div>
                    <p className="text-base font-semibold text-green-800 mb-1">
                      C'est enregistré !
                    </p>
                    <p className="text-sm text-green-700 mb-3">
                      Un commercial vous contactera sur le créneau choisi.
                    </p>
                    <p className="text-xs text-gray-500">
                      Vous allez être redirigé vers notre page Instagram dans quelques secondes…
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <a
                    href="https://www.instagram.com/sortiraumaroc"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-all hover:scale-105"
                    style={{ backgroundColor: RAMADAN_COLORS.gold, color: RAMADAN_COLORS.night }}
                  >
                    Suivez-nous sur Instagram
                  </a>
                  <button
                    onClick={() => navigate("/")}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
                  >
                    Retour à l'accueil
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Navigation buttons (outside card for steps 1-5) */}
          {step >= 1 && step <= 5 && (
            <div className="flex items-center justify-between mt-6 px-2">
              <button
                onClick={goBack}
                className="flex items-center gap-1 text-sm font-medium transition-all hover:opacity-80"
                style={{ color: RAMADAN_COLORS.goldLight }}
              >
                <ChevronLeft className="w-4 h-4" />
                Retour
              </button>
              <button
                onClick={goNext}
                disabled={loading}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 ${canProceed ? "hover:scale-105" : "opacity-50 cursor-not-allowed"}`}
                style={{ backgroundColor: canProceed ? RAMADAN_COLORS.gold : "#9CA3AF", color: canProceed ? RAMADAN_COLORS.night : "#fff" }}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : step === 5 ? (
                  "Soumettre mon offre"
                ) : (
                  <>
                    Suivant
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 mx-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
