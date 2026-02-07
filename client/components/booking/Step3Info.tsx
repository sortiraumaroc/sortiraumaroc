import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Loader2, Tag, CheckCircle2, XCircle } from "lucide-react";
import { validateBookingPromoCode } from "@/lib/bookingPromoApi";
import { Link, useSearchParams } from "react-router-dom";

import { BookingRecapCard } from "@/components/booking/BookingRecapCard";
import { BookingStepHeader } from "@/components/booking/BookingStepHeader";
import { DepositRequiredDialog } from "@/components/booking/DepositRequiredDialog";
import { useBooking } from "@/hooks/useBooking";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useToast } from "@/hooks/use-toast";
import {
  computeDepositAmountMAD,
  getClientReliabilityScore,
  shouldRequireDeposit,
} from "@/lib/antiNoShow";
import {
  getFallbackTierFromRestaurantId,
  getUnitPreReservationMad,
} from "@/lib/billing";
import { requestLacaissePayCheckoutUrl } from "@/lib/lacaissepay";
import { useI18n } from "@/lib/i18n";
import { getHotelById } from "@/lib/hotels";
import { isAuthed } from "@/lib/auth";
import { getMyConsumerMe } from "@/lib/consumerMeApi";
import { buildBookingPrefillPatch } from "@/lib/bookingPrefill";
import { getBookingRecordById, upsertBookingRecord } from "@/lib/userData";

function buildDateTimeIso(
  date: Date | null,
  time: string | null,
): string | null {
  if (!date) return null;
  const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!time) return dt.toISOString();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return dt.toISOString();
  dt.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return dt.toISOString();
}

function nightsBetween(
  checkIn: Date | null,
  checkOut: Date | null,
): number | null {
  if (!checkIn || !checkOut) return null;
  const inTs = new Date(
    checkIn.getFullYear(),
    checkIn.getMonth(),
    checkIn.getDate(),
  ).getTime();
  const outTs = new Date(
    checkOut.getFullYear(),
    checkOut.getMonth(),
    checkOut.getDate(),
  ).getTime();
  if (outTs <= inTs) return null;
  return Math.round((outTs - inTs) / (1000 * 60 * 60 * 24));
}

export default function Step3Info() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const { toast } = useToast();
  const { isFeatureEnabled } = usePlatformSettings();

  const {
    bookingType,
    establishmentId,
    partySize,
    selectedDate,
    selectedTime,
    checkInDate,
    checkOutDate,
    hotelRoomSelection,
    selectedPack,
    reservationMode,
    bookingReference,
    setBookingReference,
    generateBookingReference,

    firstName,
    setFirstName,
    lastName,
    setLastName,
    email,
    setEmail,
    phone,
    setPhone,
    message,
    setMessage,
    promoCode,
    setPromoCode,
    promoValidation,
    setPromoValidation,
    setCurrentStep,
    canProceed,
  } = useBooking();

  // Hide promo code field if establishment already has a promotion
  const hasExistingPromotion = selectedPack?.originalPrice != null &&
    selectedPack.price != null &&
    selectedPack.originalPrice > selectedPack.price;

  const establishmentName = (() => {
    const title = searchParams.get("title");
    if (title && title.trim()) return title.trim();
    if (establishmentId === "1") return "Restaurant Riad Atlas";
    return t("booking.establishment.fallback");
  })();

  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [depositReference, setDepositReference] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const touchedRef = useRef({
    firstName: false,
    lastName: false,
    email: false,
    phone: false,
    message: false,
  });
  const valuesRef = useRef({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  useEffect(() => {
    valuesRef.current = { firstName, lastName, email, phone };
  }, [email, firstName, lastName, phone]);

  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [serverReliabilityScore, setServerReliabilityScore] = useState<number | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const promoValidationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let alive = true;

    if (!isAuthed()) return;

    setPrefillLoading(true);
    setPrefillError(null);

    void (async () => {
      try {
        const me = await getMyConsumerMe();
        if (!alive) return;

        if (typeof (me as any)?.reliability_score === "number" && Number.isFinite((me as any).reliability_score)) {
          setServerReliabilityScore(Math.max(0, Math.min(100, Math.round((me as any).reliability_score))));
        }

        const current = valuesRef.current;

        const patch = buildBookingPrefillPatch({
          current,
          touched: {
            firstName: touchedRef.current.firstName,
            lastName: touchedRef.current.lastName,
            email: touchedRef.current.email,
            phone: touchedRef.current.phone,
          },
          me,
        });

        if (patch.firstName != null) setFirstName(patch.firstName);
        if (patch.lastName != null) setLastName(patch.lastName);
        if (patch.phone != null) setPhone(patch.phone);
        if (patch.email != null) setEmail(patch.email);
      } catch {
        if (!alive) return;
        setPrefillError(
          "Impossible de pré-remplir vos informations, vous pouvez saisir manuellement.",
        );
      } finally {
        if (!alive) return;
        setPrefillLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // Prefill must run once per screen open; we use refs to avoid overwriting user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Promo code validation with debounce
  const validatePromoCodeDebounced = useCallback(
    (code: string) => {
      if (promoValidationTimeoutRef.current) {
        clearTimeout(promoValidationTimeoutRef.current);
      }

      if (!code.trim()) {
        setPromoValidation(null);
        setPromoValidating(false);
        return;
      }

      setPromoValidating(true);
      promoValidationTimeoutRef.current = setTimeout(async () => {
        try {
          const result = await validateBookingPromoCode(code, establishmentId || undefined);
          setPromoValidation(result);
        } catch {
          setPromoValidation({
            valid: false,
            message: "Erreur lors de la validation du code promo",
          });
        } finally {
          setPromoValidating(false);
        }
      }, 500);
    },
    [establishmentId, setPromoValidation],
  );

  // Validate promo code when it changes
  useEffect(() => {
    validatePromoCodeDebounced(promoCode);
    return () => {
      if (promoValidationTimeoutRef.current) {
        clearTimeout(promoValidationTimeoutRef.current);
      }
    };
  }, [promoCode, validatePromoCodeDebounced]);

  const handleBack = () => {
    setCurrentStep(2);
  };

  const handleContinue = () => {
    if (!canProceed(3)) return;

    let ref = bookingReference;
    if (!ref) {
      ref = generateBookingReference();
      setBookingReference(ref);
    }

    const restaurantGuaranteed =
      bookingType === "restaurant" && reservationMode === "guaranteed";

    const score =
      typeof serverReliabilityScore === "number" && Number.isFinite(serverReliabilityScore)
        ? serverReliabilityScore
        : getClientReliabilityScore({ phone, email });

    // In test mode (Phase 1), deposits are disabled - skip directly to confirmation
    const depositsEnabled = isFeatureEnabled("guarantee_deposits_enabled");
    const requiresDeposit = depositsEnabled && (restaurantGuaranteed ? true : shouldRequireDeposit({ score, reservationMode }));

    if (!requiresDeposit) {
      setCurrentStep(4);
      return;
    }

    const nights = nightsBetween(checkInDate, checkOutDate);
    const rooms = hotelRoomSelection?.roomsCount ?? null;

    const tier =
      bookingType === "restaurant"
        ? getFallbackTierFromRestaurantId(establishmentId)
        : undefined;
    const amount = computeDepositAmountMAD({
      bookingType,
      partySize,
      nights,
      rooms,
      restaurantTier: tier,
    });

    setDepositReference(ref);
    setDepositAmount(amount);
    setDepositDialogOpen(true);
  };

  const handleDepositCancel = () => {
    if (paying) return;
    setDepositDialogOpen(false);
  };

  const handlePayAndConfirm = async () => {
    if (paying) return;
    if (!depositReference) return;

    setPaying(true);
    try {
      const existing = getBookingRecordById(depositReference);
      const nowIso = new Date().toISOString();

      const base =
        bookingType === "hotel"
          ? (() => {
              const hotel = establishmentId
                ? getHotelById(establishmentId)
                : null;
              return {
                id: depositReference,
                kind: "hotel" as const,
                title: hotel?.name ?? "Hôtel",
                status: "confirmed" as const,
                dateIso: (checkInDate ?? new Date()).toISOString(),
                endDateIso: checkOutDate?.toISOString(),
                partySize:
                  typeof partySize === "number" ? partySize : undefined,
                createdAtIso: existing?.createdAtIso ?? nowIso,
                establishmentId: establishmentId ?? undefined,
              };
            })()
          : {
              id: depositReference,
              kind: "restaurant" as const,
              title: "Restaurant Riad Atlas",
              status: "confirmed" as const,
              dateIso:
                buildDateTimeIso(selectedDate ?? null, selectedTime ?? null) ??
                new Date().toISOString(),
              partySize: typeof partySize === "number" ? partySize : undefined,
              createdAtIso: existing?.createdAtIso ?? nowIso,
              establishmentId: establishmentId ?? undefined,
            };

      const size =
        typeof partySize === "number" && Number.isFinite(partySize)
          ? Math.max(1, Math.round(partySize))
          : 1;
      const restaurantTier =
        base.kind === "restaurant"
          ? getFallbackTierFromRestaurantId(establishmentId)
          : "standard";
      const unitMad =
        base.kind === "restaurant"
          ? getUnitPreReservationMad({ fallbackTier: restaurantTier })
          : Math.round(depositAmount);
      const totalMad =
        base.kind === "restaurant"
          ? Math.round(unitMad * size)
          : Math.round(depositAmount);

      // Generate booking reference for payment
      const ref = generateBookingReference();
      setBookingReference(ref);

      upsertBookingRecord({
        ...(existing ?? {}),
        ...base,
        bookingReference: ref,
        payment: {
          status: "pending",
          currency: "MAD",
          depositAmount:
            base.kind === "restaurant"
              ? Math.round(unitMad)
              : Math.round(totalMad),
          totalAmount: Math.round(totalMad),
          methodLabel: "LacaissePay",
          provider: "lacaissepay",
          paymentUrl: "", // Will be populated after session creation
          initiatedAtIso: nowIso,
        },
      });

      // Create LacaissePay session and redirect
      void (async () => {
        try {
          const publicBaseUrl = window.location.origin;
          const acceptUrl = `${publicBaseUrl}/booking-details/${ref}?payment_status=success`;
          const declineUrl = `${publicBaseUrl}/booking-details/${ref}?payment_status=failed`;
          const notificationUrl = `${publicBaseUrl}/api/payments/webhook`;

          const payUrl = await requestLacaissePayCheckoutUrl({
            orderId: ref,
            externalReference: ref,
            amount: totalMad,
            customerEmail: email || "",
            customerPhone: (() => {
              // Use phone from environment variable if set, otherwise use provided phone
              const envPhone = (import.meta as any).env?.VITE_LACAISSEPAY_DEV_PHONE?.trim();
              if (envPhone) {
                return envPhone;
              }
              return phone || "+212611159538";
            })(),
            customerFirstName: firstName || "Guest",
            customerLastName: lastName || "Account",
            acceptUrl,
            declineUrl,
            notificationUrl,
            companyName: "Sortir Au Maroc",
          });

          // Update booking record with the payment URL
          upsertBookingRecord({
            ...(existing ?? {}),
            ...base,
            bookingReference: ref,
            payment: {
              status: "pending",
              currency: "MAD",
              depositAmount:
                base.kind === "restaurant"
                  ? Math.round(unitMad)
                  : Math.round(totalMad),
              totalAmount: Math.round(totalMad),
              methodLabel: "LacaissePay",
              provider: "lacaissepay",
              paymentUrl: payUrl,
              initiatedAtIso: nowIso,
            },
          });

          // Open payment page in the current tab
          setDepositDialogOpen(false);
          setCurrentStep(4);
          window.location.href = payUrl;
        } catch (err) {
          console.error("LacaissePay session creation failed:", err);
          setPaying(false);

          const message = err instanceof Error ? err.message : t("common.error.generic");
          toast({
            title: t("common.error"),
            description: message,
          });
        }
      })();
    } finally {
      setPaying(false);
    }
  };

  const isComplete = canProceed(3);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleContinue();
      }}
      className="space-y-6"
    >
      <BookingStepHeader
        step={3}
        totalSteps={4}
        title={t("booking.step3.title")}
        subtitle={t("booking.step3.subtitle")}
        className="mb-6"
      />

      <BookingRecapCard
        title={t("booking.recap.title")}
        establishmentName={establishmentName}
        className="border-primary/20 bg-primary/5"
      />

      <div>
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex items-center gap-2">
            {prefillLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            ) : null}
            <p className="text-sm text-foreground">
              {t("booking.step3.description")}
            </p>
          </div>

          {prefillError ? (
            <div className="text-xs text-slate-600">
              {prefillError}{" "}
              <Link to="/profile" className="underline underline-offset-2">
                Modifier mes infos
              </Link>
            </div>
          ) : isAuthed() ? (
            <div className="text-xs text-slate-600">
              <Link to="/profile" className="underline underline-offset-2">
                Modifier mes infos
              </Link>
            </div>
          ) : null}
        </div>

        {/* Name Fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t("booking.form.first_name")}{" "}
              <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              placeholder={t("booking.form.placeholder.first_name")}
              value={firstName}
              onChange={(e) => {
                touchedRef.current.firstName = true;
                setFirstName(e.target.value);
              }}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              {t("booking.form.last_name")}{" "}
              <span className="text-primary">*</span>
            </label>
            <input
              type="text"
              placeholder={t("booking.form.placeholder.last_name")}
              value={lastName}
              onChange={(e) => {
                touchedRef.current.lastName = true;
                setLastName(e.target.value);
              }}
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50"
              required
            />
          </div>
        </div>

        {/* Email */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t("booking.form.email")}{" "}
            <span className="text-slate-600">
              ({t("booking.form.optional")})
            </span>
          </label>
          <input
            type="email"
            placeholder={t("booking.form.placeholder.email")}
            value={email}
            onChange={(e) => {
              touchedRef.current.email = true;
              setEmail(e.target.value);
            }}
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50"
          />
        </div>

        {/* Phone */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t("booking.form.phone")} <span className="text-primary">*</span>
          </label>
          <input
            type="tel"
            placeholder={t("booking.form.placeholder.phone")}
            value={phone}
            onChange={(e) => {
              touchedRef.current.phone = true;
              setPhone(e.target.value);
            }}
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50"
            required
          />
        </div>

        {/* Message */}
        <div className="mb-5">
          <label className="block text-sm font-semibold text-foreground mb-2">
            {t("booking.form.message")}{" "}
            <span className="text-slate-600">
              ({t("booking.form.optional")})
            </span>
          </label>
          <textarea
            placeholder={t("booking.form.placeholder.message_long")}
            value={message}
            onChange={(e) => {
              touchedRef.current.message = true;
              setMessage(e.target.value);
            }}
            className="w-full px-4 py-3 border-2 border-slate-300 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50 resize-none"
            rows={4}
          />
        </div>

        {/* Promo Code - Hidden if establishment already has a promotion */}
        {!hasExistingPromotion && (
          <div className="mb-5">
            <label className="block text-sm font-semibold text-foreground mb-2">
              <span className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Code promo
              </span>
              <span className="text-slate-600 font-normal ml-1">
                ({t("booking.form.optional")})
              </span>
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="Ex: SAMBIENVENUE"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                className={`w-full px-4 py-3 pr-12 border-2 rounded-lg focus:outline-none focus:ring-2 text-foreground placeholder:text-slate-500 transition-colors bg-slate-50 uppercase tracking-wider ${
                  promoCode && promoValidation
                    ? promoValidation.valid
                      ? "border-green-500 focus:border-green-500 focus:ring-green-500/20"
                      : "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                    : "border-slate-300 focus:border-primary focus:ring-primary/20"
                }`}
              />
              {promoCode && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {promoValidating ? (
                    <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
                  ) : promoValidation?.valid ? (
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  ) : promoValidation ? (
                    <XCircle className="w-5 h-5 text-red-500" />
                  ) : null}
                </div>
              )}
            </div>
            {promoCode && promoValidation && (
              <div className={`mt-2 text-sm ${promoValidation.valid ? "text-green-600" : "text-red-600"}`}>
                {promoValidation.valid ? (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    {promoValidation.discountPercent}% de réduction appliquée !
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {promoValidation.message || "Code promo invalide"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="bg-primary/15 p-4 rounded-lg border-2 border-primary/30">
        <p className="text-xs text-slate-900 font-medium">
          {t("booking.step3.privacy_notice")}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={handleBack}
          className="flex-1 bg-white border-2 border-slate-300 text-foreground py-3 rounded-lg font-bold hover:bg-slate-50 transition-colors active:scale-95 flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          {t("common.back")}
        </button>
        <button
          type="submit"
          disabled={!isComplete}
          className="flex-1 bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95 flex items-center justify-center gap-2"
        >
          {t("booking.step3.cta.review")} <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <DepositRequiredDialog
        open={depositDialogOpen}
        depositAmount={depositAmount}
        currencyLabel="Dhs"
        unitAmount={
          bookingType === "restaurant"
            ? getUnitPreReservationMad({
                fallbackTier: getFallbackTierFromRestaurantId(establishmentId),
              })
            : null
        }
        partySize={partySize}
        paying={paying}
        onCancel={handleDepositCancel}
        onPayAndConfirm={handlePayAndConfirm}
      />
    </form>
  );
}
