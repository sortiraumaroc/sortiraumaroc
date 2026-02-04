import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, CreditCard, Info, Lock, ShieldCheck } from "lucide-react";

import { BookingStepHeader } from "@/components/booking/BookingStepHeader";

import { useSearchParams } from "react-router-dom";

import { BookingRecapCard } from "@/components/booking/BookingRecapCard";
import { useBooking, type ReservationMode } from "@/hooks/useBooking";
import { getPublicEstablishment, type PublicBookingPolicy } from "@/lib/publicApi";
import { useI18n } from "@/lib/i18n";

export default function Step2Mode() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();

  const {
    establishmentId,
    partySize,
    reservationMode,
    setReservationMode,
    setCurrentStep,
    canProceed,
    waitlistRequested,
  } = useBooking();

  const [bookingPolicy, setBookingPolicy] = useState<PublicBookingPolicy | null>(null);
  const [policyLoading, setPolicyLoading] = useState(true);

  // Fetch booking policy to check deposit_per_person
  useEffect(() => {
    if (!establishmentId) {
      setPolicyLoading(false);
      return;
    }

    let active = true;
    setPolicyLoading(true);

    const fetchPolicy = async () => {
      try {
        const res = await getPublicEstablishment({ ref: establishmentId });
        if (!active) return;
        setBookingPolicy(res.booking_policy ?? null);
      } catch {
        if (!active) return;
        setBookingPolicy(null);
      } finally {
        if (active) setPolicyLoading(false);
      }
    };

    void fetchPolicy();

    return () => {
      active = false;
    };
  }, [establishmentId]);

  const establishmentName = (() => {
    const title = searchParams.get("title");
    if (title && title.trim()) return title.trim();
    if (establishmentId === "1") return "Restaurant Riad Atlas";
    return t("booking.establishment.fallback");
  })();

  // Check if guaranteed booking is available (deposit_per_person > 0)
  const depositPerPerson = bookingPolicy?.deposit_per_person ?? null;
  const hasGuaranteedOption = typeof depositPerPerson === "number" && depositPerPerson > 0;

  // Use deposit_per_person from booking_policy, or 0 if not available
  const unitMad = hasGuaranteedOption ? depositPerPerson : 0;

  const totalPrepayMad = useMemo(() => {
    const size = typeof partySize === "number" && Number.isFinite(partySize) ? Math.max(1, Math.round(partySize)) : 1;
    return Math.round(unitMad * size);
  }, [partySize, unitMad]);
  const [showInfo, setShowInfo] = useState(false);

  // Auto-select non-guaranteed if waitlist requested or no guaranteed option available
  useEffect(() => {
    if (policyLoading) return;

    if (waitlistRequested || !hasGuaranteedOption) {
      if (reservationMode !== "non-guaranteed") setReservationMode("non-guaranteed");
    }
  }, [reservationMode, setReservationMode, waitlistRequested, hasGuaranteedOption, policyLoading]);

  const handleSelectMode = (mode: ReservationMode) => {
    setReservationMode(mode);
  };

  const handleBack = () => {
    setCurrentStep(1);
  };

  const handleContinue = () => {
    if (canProceed(2)) {
      setCurrentStep(3);
    }
  };

  return (
    <div className="space-y-6">
      <BookingStepHeader
        step={2}
        totalSteps={4}
        title={waitlistRequested ? t("booking.step2.title.waitlist") : t("booking.step2.title.secure")}
        subtitle={waitlistRequested ? t("booking.step2.subtitle.waitlist") : t("booking.step2.subtitle.secure")}
        className="mb-6"
      />

      <BookingRecapCard
        title={t("booking.recap.title")}
        establishmentName={establishmentName}
        className="border-primary/20 bg-primary/5"
      />

      {/* Mode Selection */}
      {waitlistRequested ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 rounded-lg bg-white border border-primary/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">{t("booking.waitlist.banner.title")}</div>
              <div className="mt-1 text-sm text-slate-700">
                {t("booking.waitlist.banner.body")}
              </div>
              <div className="mt-3 text-xs text-slate-600">
                {t("booking.waitlist.banner.note")}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <h3 className="font-bold text-foreground mb-4">{t("booking.step2.title.secure")}</h3>

          <div className="space-y-3">
            {/* Guaranteed - Only show if deposit_per_person is configured */}
            {hasGuaranteedOption && (
              <button
                onClick={() => handleSelectMode('guaranteed')}
                className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                  reservationMode === 'guaranteed'
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-300 bg-white hover:border-primary/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      reservationMode === 'guaranteed'
                        ? 'border-primary bg-primary'
                        : 'border-slate-300'
                    }`}
                  >
                    {reservationMode === 'guaranteed' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Lock className="w-4 h-4 text-primary" />
                      <span className="font-bold text-foreground text-sm">{t("booking.mode.guaranteed.short")}</span>
                    </div>
                    <div className="text-xs text-foreground space-y-1">
                      <p>💳 {t("booking.mode.guaranteed.line1", { unit: unitMad })}</p>
                      <p>✔️ {t("booking.mode.guaranteed.line2")}</p>
                    </div>
                  </div>
                </div>
              </button>
            )}

            {/* Non-Guaranteed */}
            <button
              onClick={() => handleSelectMode('non-guaranteed')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                reservationMode === 'non-guaranteed'
                  ? 'border-primary bg-primary/5'
                  : 'border-slate-300 bg-white hover:border-primary/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    reservationMode === 'non-guaranteed'
                      ? 'border-primary bg-primary'
                      : 'border-slate-300'
                  }`}
                >
                  {reservationMode === 'non-guaranteed' && <div className="w-2 h-2 bg-white rounded-full"></div>}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-slate-600" />
                    <span className="font-bold text-foreground text-sm">{t("booking.mode.non_guaranteed.short")}</span>
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowInfo(!showInfo);
                      }}
                      className="text-slate-500 hover:text-slate-700 ml-auto cursor-pointer transition-colors"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          setShowInfo(!showInfo);
                        }
                      }}
                    >
                      <Info className="w-4 h-4" />
                    </div>
                  </div>
                  <p className="text-xs text-foreground">
                    {hasGuaranteedOption
                      ? t("booking.mode.non_guaranteed.line")
                      : t("booking.mode.non_guaranteed.line_simple", { fallback: "Votre réservation sera confirmée par le restaurant." })}
                  </p>
                </div>
              </div>
            </button>
          </div>

          {reservationMode === 'non-guaranteed' && showInfo && (
            <div className="mt-4 p-3 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
              <p className="text-xs text-yellow-900">
                {t("booking.mode.non_guaranteed.more")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Payment reassurance - Only show if guaranteed option is available */}
      {hasGuaranteedOption && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 h-9 w-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-foreground">{t("booking.payment.banner.title")}</div>
              <div className="mt-1 text-sm text-slate-700">
                {waitlistRequested ? (
                  <>
                    {t("booking.payment.banner.waitlist")}
                    <div className="mt-1 text-xs text-slate-600">{t("booking.payment.banner.followup")}</div>
                  </>
                ) : reservationMode === "guaranteed" ? (
                  <>
                    {t("booking.payment.banner.guaranteed", { unit: unitMad })}
                    <div className="mt-1 text-xs text-slate-600">
                      {t("booking.payment.banner.total", { total: totalPrepayMad })}
                    </div>
                  </>
                ) : (
                  <>
                    {t("booking.payment.banner.non_guaranteed")}
                    <div className="mt-1 text-xs text-slate-600">{t("booking.payment.banner.followup")}</div>
                  </>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <CreditCard className="h-4 w-4" />
                  <span>{t("booking.payment.method.card")}</span>
                </span>
                <span className="text-slate-300" aria-hidden="true">•</span>
                <span>Visa</span>
                <span>Mastercard</span>
                <span>Apple Pay</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleBack}
          className="flex-1 bg-white border-2 border-slate-300 text-foreground py-3 rounded-lg font-bold hover:bg-slate-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          {t("common.back")}
        </button>
        <button
          onClick={handleContinue}
          disabled={!canProceed(2)}
          className="flex-1 bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95 flex items-center justify-center gap-2"
        >
          {t("common.continue")} <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
