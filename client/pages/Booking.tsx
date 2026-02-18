import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useBooking, type ServiceType } from "@/hooks/useBooking";
import Step1Selection from '@/components/booking/Step1Selection';
import Step2Mode from '@/components/booking/Step2Mode';
import Step3Info from '@/components/booking/Step3Info';
import Step4Confirmation from '@/components/booking/Step4Confirmation';
import { ChevronLeft } from "lucide-react";
import { Header } from "@/components/Header";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { isAuthed } from "@/lib/auth";
import { getPublicEstablishment } from "@/lib/publicApi";
import { isUuid } from "@/lib/pro/visits";
import { useI18n } from "@/lib/i18n";
import { applySeo, buildI18nSeoFields } from "@/lib/seo";


function parseYmd(dateYmd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateYmd);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function isTimeHm(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function inferServiceFromTime(time: string): ServiceType {
  const [hh, mm] = time.split(":").map((n) => Number(n));
  const minutes = hh * 60 + mm;
  if (minutes < 15 * 60) return "déjeuner";
  if (minutes < 19 * 60) return "continu";
  return "dîner";
}

export default function Booking() {
  const { t, locale } = useI18n();

  const { establishmentId } = useParams<{ establishmentId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const steps = useMemo(
    () => [
      { number: 1, label: t("booking.steps.details") },
      { number: 2, label: t("booking.steps.payment") },
      { number: 3, label: t("booking.steps.info") },
      { number: 4, label: t("booking.steps.confirmation") },
    ],
    [t],
  );

  const [authOpen, setAuthOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const [authContext, setAuthContext] = useState<{ title: string; subtitle: string } | null>(null);

  const [resolvedName, setResolvedName] = useState<string | null>(null);

  useEffect(() => {
    const name = (resolvedName ?? "").trim();
    const title = name ? `Réserver — ${name} — Sortir Au Maroc` : "Réserver — Sortir Au Maroc";
    const description = name
      ? `Finalisez votre réservation chez ${name} en quelques étapes.`
      : "Finalisez votre réservation en quelques étapes.";

    applySeo({ title, description, ogType: "website", ...buildI18nSeoFields(locale) });
  }, [resolvedName]);

  const {
    currentStep,
    setCurrentStep,
    setBookingType,
    setEstablishmentId,
    setEstablishmentName,
    reset,
    establishmentId: bookingEstId,
    partySize,
    selectedDate,
    selectedTime,
    selectedService,
    waitlistRequested,
    setWaitlistRequested,
    setPartySize,
    setSelectedDate,
    setSelectedTime,
    setSelectedService,
    setSelectedPack,
  } = useBooking();

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [currentStep]);

  useEffect(() => {
    const raw = (searchParams.get("universe") ?? "restaurants").toLowerCase();

    if (raw === "restaurants" || raw === "restaurant") {
      setBookingType("restaurant");
      return;
    }

    if (raw === "hotels" || raw === "hotel") {
      setBookingType("hotel");
      return;
    }

    setBookingType("activity");
  }, [searchParams, setBookingType]);

  useEffect(() => {
    if (!establishmentId) return;

    let active = true;

    const resolve = async () => {
      // Always try to fetch establishment details to get the name
      try {
        const title = searchParams.get("title");
        const payload = await getPublicEstablishment({ ref: establishmentId, title });
        if (!active) return;
        const name = payload.establishment?.name ?? null;
        setResolvedName(name);
        setEstablishmentName(name);
        setEstablishmentId(payload.establishment.id);
      } catch {
        if (!active) return;
        // Keep the ref as-is (Step1Selection will fallback gracefully), but avoid breaking navigation.
        setEstablishmentId(establishmentId);
      }
    };

    void resolve();

    return () => {
      active = false;
    };
  }, [establishmentId, searchParams, setEstablishmentId, setEstablishmentName]);

  useEffect(() => {
    if (currentStep !== 1) return;

    const peopleParam = searchParams.get('people') || searchParams.get('partySize');
    const dateParam = searchParams.get('date');
    const timeParam = searchParams.get('time');

    if (peopleParam && partySize == null) {
      const n = Number(peopleParam);
      if (Number.isFinite(n) && n > 0 && n <= 50) setPartySize(Math.round(n));
    }

    if (dateParam && !selectedDate) {
      const d = parseYmd(dateParam);
      if (d) setSelectedDate(d);
    }

    if (timeParam && !selectedTime && isTimeHm(timeParam)) {
      setSelectedTime(timeParam);
      if (!selectedService) setSelectedService(inferServiceFromTime(timeParam));
    }

    const waitlistParam = searchParams.get("waitlist");
    if (waitlistParam && !waitlistRequested) setWaitlistRequested(true);
    if (!waitlistParam && waitlistRequested) setWaitlistRequested(false);

    const packId = searchParams.get('packId');
    const packTitle = searchParams.get('packTitle');
    const packPrice = searchParams.get('packPrice');
    const packOriginalPrice = searchParams.get('packOriginalPrice');

    if (packId && packTitle) {
      const p = packPrice ? Number(packPrice) : undefined;
      const op = packOriginalPrice ? Number(packOriginalPrice) : undefined;
      setSelectedPack({
        id: packId,
        title: packTitle,
        price: Number.isFinite(p as number) ? (p as number) : undefined,
        originalPrice: Number.isFinite(op as number) ? (op as number) : undefined,
      });
    } else {
      setSelectedPack(null);
    }
  }, [
    currentStep,
    partySize,
    selectedDate,
    selectedTime,
    selectedService,
    searchParams,
    setPartySize,
    setSelectedDate,
    setSelectedTime,
    setSelectedService,
    setSelectedPack,
    waitlistRequested,
    setWaitlistRequested,
  ]);

  useEffect(() => {
    if (authOpen) return;

    const needsAuth = !isAuthed();
    if (!needsAuth) return;

    // Step 2 should be behind auth (login after step 1).
    if (currentStep === 2) {
      setPendingStep(2);
      setAuthContext({
        title: t("booking.auth.title"),
        subtitle: t("booking.auth.subtitle.step2"),
      });
      setAuthOpen(true);
      setCurrentStep(1);
      return;
    }

    // Step 3 also requires auth.
    if (currentStep === 3) {
      setPendingStep(3);
      setAuthContext({
        title: t("booking.auth.title"),
        subtitle: t("booking.auth.subtitle.step3"),
      });
      setAuthOpen(true);
    }
  }, [authOpen, currentStep, setCurrentStep]);

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      navigate(-1);
    }
  };

  const getCurrentStepComponent = () => {
    switch (currentStep) {
      case 1:
        return <Step1Selection />;
      case 2:
        return <Step2Mode />;
      case 3:
        return <Step3Info />;
      case 4:
        return <Step4Confirmation />;
      default:
        return <Step1Selection />;
    }
  };

  const getEstablishmentName = () => {
    const title = searchParams.get("title");
    if (title && title.trim()) return title.trim();
    if (resolvedName && resolvedName.trim()) return resolvedName.trim();
    if (bookingEstId === "1") return "Restaurant Riad Atlas";
    return t("booking.establishment.fallback");
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <header className="sticky top-16 z-40 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-primary/5 rounded-lg transition-colors"
            aria-label={t("common.back")}
          >
            <ChevronLeft className="w-6 h-6 text-primary" />
          </button>
          <h1 className="text-base md:text-lg font-bold text-foreground text-center flex-1 font-['Intra',_sans-serif]">
            {getEstablishmentName()}
          </h1>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => reset()}
              className="text-xs text-slate-600 hover:text-foreground transition-colors hidden sm:block font-medium"
            >
              {t("common.reset")}
            </button>
            <LanguageSwitcher variant="inline-booking" />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
        <div className="flex justify-between items-center mb-10 md:mb-12 gap-2">
          {steps.map((step) => (
            <div key={step.number} className="flex-1 flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  currentStep >= step.number ? 'bg-primary text-white' : 'bg-white border-2 border-slate-300 text-slate-600'
                }`}
              >
                {step.number}
              </div>
              <p className={`text-xs mt-2 transition-all text-center font-medium ${currentStep >= step.number ? 'text-primary' : 'text-slate-500'}`}>
                {step.label}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border-2 border-slate-200 p-6 md:p-8">{getCurrentStepComponent()}</div>

        <div className="mt-10 text-center">
          <p className="text-xs text-slate-600 font-medium">
            <span className="text-black">{t("booking.footer.security_notice")}</span>
          </p>
        </div>
      </div>

      <AuthModalV2
        isOpen={authOpen}
        contextTitle={authContext?.title}
        contextSubtitle={authContext?.subtitle}
        onClose={() => {
          setAuthOpen(false);
          setAuthContext(null);
          const step = pendingStep;
          setPendingStep(null);
          if (step === 3) setCurrentStep(1);
        }}
        onAuthed={() => {
          setAuthOpen(false);
          setAuthContext(null);
          const step = pendingStep;
          setPendingStep(null);
          if (step === 2) setCurrentStep(2);
          else if (step === 3) setCurrentStep(3);
        }}
      />
    </div>
  );
}
