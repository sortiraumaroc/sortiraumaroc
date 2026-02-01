import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { MapPin, Calendar, Trash2, ChevronRight, Wallet, Download, Edit2 } from "lucide-react";

import { BookingRecapCard } from "@/components/booking/BookingRecapCard";
import { BookingStepHeader } from "@/components/booking/BookingStepHeader";
import { useBooking } from "@/hooks/useBooking";
import { getBookingQRCodeUrl } from "@/lib/qrcode";
import { getBookingPreReservationBreakdown } from "@/lib/billing";
import { handleAddToAppleWallet, handleAddToGoogleWallet } from "@/lib/walletService";
import { generateReservationPDF } from "@/lib/pdfGenerator";
import { isAppleWalletSupported, isGoogleWalletSupported } from "@/lib/platformDetection";
import { getBookingRecordById, upsertBookingRecord } from "@/lib/userData";
import { getConsumerAccessToken } from "@/lib/auth";
import { createMyConsumerWaitlist } from "@/lib/consumerWaitlistApi";
import { useI18n } from "@/lib/i18n";

function buildDateTimeIso(date: Date | null, time: string | null): string | null {
  if (!date) return null;
  const dt = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!time) return dt.toISOString();
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return dt.toISOString();
  dt.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return dt.toISOString();
}

export default function Step4Confirmation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useI18n();

  const {
    bookingType,
    partySize,
    selectedDate,
    selectedTime,
    selectedService,
    reservationMode,
    selectedPack,
    firstName,
    lastName,
    email,
    phone,
    message,
    reset,
    bookingReference,
    setBookingReference,
    generateBookingReference,
    setCurrentStep,
    establishmentId,
    waitlistRequested,
  } = useBooking();

  const effectiveStatus = waitlistRequested
    ? ("waitlist" as const)
    : reservationMode === "guaranteed"
      ? ("pending_pro_validation" as const)
      : ("pending_pro_validation" as const);

  const establishmentName = (() => {
    const title = searchParams.get("title");
    if (title && title.trim()) return title.trim();
    if (establishmentId === "1") return "Restaurant Riad Atlas";
    return t("booking.establishment.fallback");
  })();

  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showAppleWallet, setShowAppleWallet] = useState(false);
  const [showGoogleWallet, setShowGoogleWallet] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  const humanSubmitError = useMemo(() => {
    if (!submitError) return null;

    const raw = submitError.trim();
    if (!raw) return null;

    if (raw === "duplicate_slot_booking") return "Vous avez déjà une réservation sur ce créneau.";
    if (raw === "overlapping_reservation") return "Vous avez déjà une réservation à une heure proche.";
    if (raw === "slot_not_found") return "Ce créneau n'est plus disponible.";
    if (raw === "slot_not_full") return "Ce créneau est disponible : vous pouvez réserver directement.";

    return raw;
  }, [submitError]);

  // Generate booking reference on mount
  useEffect(() => {
    const ref = bookingReference ? bookingReference : generateBookingReference();
    if (!bookingReference) setBookingReference(ref);

    const existing = getBookingRecordById(ref);
    const breakdown = existing ? getBookingPreReservationBreakdown(existing) : null;

    setQrCodeUrl(
      getBookingQRCodeUrl(ref, {
        partySize: breakdown?.partySize ?? (partySize || 1),
        unitMad: breakdown?.unitMad ?? undefined,
        totalMad: breakdown?.totalMad ?? undefined,
      }),
    );
  }, [bookingReference, setBookingReference, generateBookingReference, partySize]);

  // Detect platform and set wallet button visibility
  useEffect(() => {
    setShowAppleWallet(isAppleWalletSupported());
    setShowGoogleWallet(isGoogleWalletSupported());
  }, []);

  useEffect(() => {
    if (!bookingReference) return;

    const existing = getBookingRecordById(bookingReference);

    const base = {
      id: bookingReference,
      kind: bookingType === "hotel" ? ("hotel" as const) : ("restaurant" as const),
      title: establishmentName,
      status: effectiveStatus,
      dateIso: buildDateTimeIso(selectedDate ?? null, selectedTime ?? null) ?? new Date().toISOString(),
      partySize: typeof partySize === "number" ? partySize : undefined,
      createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
      establishmentId: establishmentId ?? undefined,
      notes: message?.trim() ? message.trim() : existing?.notes,
      phone: phone?.trim() ? phone.trim() : existing?.phone,
    };

    upsertBookingRecord({
      ...(existing ?? {}),
      ...base,
      payment: existing?.payment,
      attendance: existing?.attendance,
      review: existing?.review,
    });
  }, [
    bookingReference,
    bookingType,
    establishmentId,
    establishmentName,
    message,
    partySize,
    phone,
    reservationMode,
    selectedDate,
    selectedTime,
    effectiveStatus,
    waitlistRequested,
  ]);

  useEffect(() => {
    if (!bookingReference) return;
    if (!establishmentId) return;

    const startsAt = buildDateTimeIso(selectedDate ?? null, selectedTime ?? null);
    if (!startsAt) return;

    let active = true;

    const submit = async () => {
      setSubmitError(null);
      setSubmitOk(false);

      const token = await getConsumerAccessToken();
      if (!active) return;
      if (!token) return;

      const size = typeof partySize === "number" && Number.isFinite(partySize) ? Math.max(1, Math.round(partySize)) : 1;

      const existing = getBookingRecordById(bookingReference);
      const breakdown = existing ? getBookingPreReservationBreakdown(existing) : null;

      // DB uses cents (see Pro dashboard). Consumer UI uses MAD.
      const amountDeposit = typeof breakdown?.totalMad === "number" ? Math.round(breakdown.totalMad * 100) : null;
      const unitPackMad = typeof selectedPack?.price === "number" ? selectedPack.price : null;
      const amountTotal = unitPackMad != null ? Math.round(unitPackMad * 100 * size) : null;

      const status = effectiveStatus;
      const slotId = searchParams.get("slotId") || searchParams.get("slot_id");

      try {
        if (waitlistRequested) {
          const waitlistSlotId = slotId && slotId.trim() ? slotId.trim() : "";
          if (!waitlistSlotId) {
            throw new Error(t("booking.waitlist.missing_slot"));
          }

          // Use the dedicated waitlist endpoint to ensure duplicate prevention + capacity checks + audit logs.
          await createMyConsumerWaitlist({
            establishmentId,
            slotId: waitlistSlotId,
            startsAt,
            partySize: size,
            notes: message?.trim() ? message.trim() : null,
          });
          return;
        }

        const localPaymentStatus = existing?.payment?.status;
        const paymentStatus =
          localPaymentStatus === "paid" || localPaymentStatus === "pending" || localPaymentStatus === "refunded"
            ? localPaymentStatus
            : "pending";

        const payload = {
          establishment_id: establishmentId,
          booking_reference: bookingReference,
          kind: bookingType === "activity" ? "activity" : bookingType === "hotel" ? "hotel" : "restaurant",
          starts_at: startsAt,
          slot_id: slotId && slotId.trim() ? slotId.trim() : undefined,
          party_size: size,
          status,
          payment_status: paymentStatus,
          amount_total: amountTotal ?? undefined,
          amount_deposit: amountDeposit ?? undefined,
          meta: {
            selected_service: selectedService ?? undefined,
            selected_pack_id: selectedPack?.id ?? undefined,
            selected_pack_title: selectedPack?.title ?? undefined,
            reservation_mode: reservationMode ?? undefined,
            payment: existing?.payment
              ? {
                  provider: (existing.payment as any).provider ?? undefined,
                  url: (existing.payment as any).paymentUrl ?? undefined,
                  status: existing.payment.status,
                  initiated_at: (existing.payment as any).initiatedAtIso ?? undefined,
                  paid_at: existing.payment.paidAtIso ?? undefined,
                }
              : undefined,
            contact: {
              first_name: firstName ?? undefined,
              last_name: lastName ?? undefined,
              email: email ?? undefined,
              phone: phone ?? undefined,
            },
            message: message ?? undefined,
          },
        };

        const res = await fetch("/api/consumer/reservations", {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const ct = res.headers.get("content-type") ?? "";
            const data = ct.includes("application/json") ? ((await res.json()) as any) : await res.text();
            if (data && typeof data === "object" && typeof (data as any).error === "string") msg = String((data as any).error);
          } catch {
            // ignore
          }
          throw new Error(msg);
        }

        setSubmitOk(true);
      } catch (e) {
        // Reservation will remain stored locally even if network fails.
        if (!active) return;
        setSubmitError(e instanceof Error ? e.message : t("common.error.unexpected"));
      }
    };

    void submit();

    return () => {
      active = false;
    };
  }, [
    bookingReference,
    bookingType,
    email,
    establishmentId,
    firstName,
    lastName,
    message,
    partySize,
    phone,
    reservationMode,
    selectedDate,
    selectedPack,
    selectedService,
    selectedTime,
    effectiveStatus,
    waitlistRequested,
  ]);

  const handleAddToCalendar = () => {
    if (selectedDate && selectedTime) {
      const [hours, minutes] = selectedTime.split(':');
      const startDate = new Date(selectedDate);
      startDate.setHours(parseInt(hours), parseInt(minutes || '0'));
      const endDate = new Date(startDate);
      endDate.setHours(startDate.getHours() + 1);

      const url = `https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(
        t("booking.step4.calendar.event_title", { establishment: establishmentName })
      )}&dates=${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}/${endDate.toISOString().replace(/[-:]/g, '').split('.')[0]}`;

      window.open(url);
    }
  };

  const handleGetDirections = () => {
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(`${establishmentName}, Marrakech`)}`;
    window.open(mapsUrl);
  };

  const handleCancelReservation = () => {
    if (confirm(t("booking.step4.cancel.confirm"))) {
      reset();
      navigate('/');
    }
  };

  const handleNewReservation = () => {
    reset();
    navigate('/');
  };

  const handleAddToAppleWalletClick = async () => {
    if (!bookingReference) return;
    setIsLoadingWallet(true);
    try {
      await handleAddToAppleWallet({
        bookingReference,
        restaurantName: establishmentName,
        date: selectedDate?.toISOString() || '',
        time: selectedTime || '',
        partySize: partySize || 1,
        guestName: `${firstName} ${lastName}`,
        guestPhone: '',
        qrCodeUrl: qrCodeUrl,
      });
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const handleAddToGoogleWalletClick = async () => {
    if (!bookingReference) return;
    setIsLoadingWallet(true);
    try {
      await handleAddToGoogleWallet({
        bookingReference,
        restaurantName: establishmentName,
        date: selectedDate?.toISOString() || '',
        time: selectedTime || '',
        partySize: partySize || 1,
        guestName: `${firstName} ${lastName}`,
        guestPhone: '',
        qrCodeUrl: qrCodeUrl,
      });
    } finally {
      setIsLoadingWallet(false);
    }
  };

  const handleExportPDF = async () => {
    if (!bookingReference || !selectedDate || !selectedTime) return;
    setIsGeneratingPDF(true);
    try {
      const existing = getBookingRecordById(bookingReference);
      const breakdown = existing ? getBookingPreReservationBreakdown(existing) : null;

      await generateReservationPDF({
        bookingReference,
        restaurantName: establishmentName,
        address: '123 Rue de la Kasbah, Marrakech 40000',
        phone: '+212 5 24 38 77 77',
        date: selectedDate.toISOString(),
        time: selectedTime,
        service: selectedService || 'déjeuner',
        partySize: partySize || 1,
        guestName: `${firstName} ${lastName}`,
        guestPhone: '',
        guestEmail: undefined,
        reservationMode,
        qrCodeUrl,
        unitPrepayMad: breakdown?.unitMad ?? undefined,
        totalPrepayMad: breakdown?.totalMad ?? undefined,
        message: undefined,
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleModifyReservation = () => {
    // Go back to step 1 while keeping the booking data
    setCurrentStep(1);
  };

  return (
    <div className="space-y-6 pb-6">
      <BookingStepHeader
        step={4}
        totalSteps={4}
        title={effectiveStatus === "waitlist" ? t("booking.step4.title.waitlist") : t("booking.step4.title.sent")}
        subtitle={effectiveStatus === "waitlist" ? t("booking.step4.subtitle.waitlist") : t("booking.step4.subtitle.sent")}
        className="mb-6"
      />

      {/* Status Banner */}
      <div
        className={`text-center p-6 rounded-lg border-2 ${
          effectiveStatus === "waitlist" ? "bg-amber-50 border-amber-300" : "bg-blue-50 border-blue-300"
        }`}
      >
        <p className="text-4xl mb-3">{effectiveStatus === "waitlist" ? "🕒" : "⏳"}</p>
        <h2 className={`text-2xl font-bold mb-2 ${effectiveStatus === "waitlist" ? "text-amber-950" : "text-blue-950"}`}>
          {t("booking.step4.banner.title.pending")}
        </h2>
        <p className={`text-sm ${effectiveStatus === "waitlist" ? "text-amber-950" : "text-blue-950"}`}>
          {effectiveStatus === "waitlist" ? t("booking.step4.subtitle.waitlist") : t("booking.step4.banner.body.pending")}
        </p>
      </div>

      {humanSubmitError ? (
        <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
          <div className="text-sm font-semibold text-red-900">{t("common.error")}</div>
          <div className="mt-1 text-sm text-red-800">{humanSubmitError}</div>
          <div className="mt-2 text-xs text-red-700">
            La réservation est conservée sur votre appareil. Vous pouvez réessayer plus tard depuis votre profil.
          </div>
        </div>
      ) : null}

      {submitOk ? (
        <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="text-sm font-semibold text-emerald-900">Envoyé au restaurant</div>
          <div className="mt-1 text-sm text-emerald-800">Votre demande a bien été transmise.</div>
        </div>
      ) : null}

      <BookingRecapCard title={t("booking.recap.title")} establishmentName={establishmentName} className="border-2 border-slate-300" />

      {/* Guest Info */}
      <div className="bg-white border-2 border-slate-300 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-3 font-semibold">{t("booking.step4.contact.title")}</p>
        <p className="font-bold text-foreground mb-1">
          {firstName} {lastName}
        </p>
        <p className="text-sm text-slate-600">{t("booking.step4.contact.confirmation_sent")}</p>
        {bookingReference && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-600 mb-2 font-semibold">{t("booking.step4.reference.title")}</p>
            <p className="font-mono font-bold text-foreground text-sm">{bookingReference}</p>
          </div>
        )}
      </div>

      {/* Wallet & Action Buttons */}
      <div className="space-y-3">
        {/* PDF Export Button */}
        {effectiveStatus !== "waitlist" ? (
          <button
            onClick={handleExportPDF}
            disabled={isGeneratingPDF}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-semibold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("booking.step4.pdf.title")}
          >
            <Download className="w-5 h-5" />
            {isGeneratingPDF ? t("booking.step4.pdf.generating") : t("booking.step4.pdf.cta")}
          </button>
        ) : null}

        {/* Apple Wallet Button - iOS/macOS only */}
        {effectiveStatus !== "waitlist" && showAppleWallet && (
          <button
            onClick={handleAddToAppleWalletClick}
            disabled={isLoadingWallet || !bookingReference}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-black text-slate-50 rounded-lg hover:bg-slate-900 transition-colors font-semibold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("booking.step4.wallet.apple")}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 2h12c1.1 0 2 .9 2 2v16c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2zm0 2v16h12V4H6zm6 10h-2v2h2v-2zm0-4h-2v2h2V8z"/>
            </svg>
            {t("booking.step4.wallet.apple")}
          </button>
        )}

        {/* Google Wallet Button - Android & Desktop only */}
        {effectiveStatus !== "waitlist" && showGoogleWallet && (
          <button
            onClick={handleAddToGoogleWalletClick}
            disabled={isLoadingWallet || !bookingReference}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-slate-50 rounded-lg hover:bg-blue-700 transition-colors font-semibold active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("booking.step4.wallet.google")}
          >
            <Wallet className="w-5 h-5" />
            {t("booking.step4.wallet.google")}
          </button>
        )}

        {/* Calendar Button */}
        {effectiveStatus !== "waitlist" ? (
          <button
          onClick={handleAddToCalendar}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors font-semibold active:scale-95"
        >
          <Calendar className="w-5 h-5" />
          {t("booking.step4.calendar.add")}
          </button>
        ) : null}

        {/* Directions Button */}
        <button
          onClick={handleGetDirections}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors font-semibold active:scale-95"
        >
          <MapPin className="w-5 h-5" />
          {t("booking.step4.directions")}
        </button>

        {/* Modify & Cancel Buttons Side-by-Side */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleModifyReservation}
            className="flex items-center justify-center gap-2 px-3 py-3 bg-slate-100 border-2 border-slate-300 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-semibold active:scale-95"
          >
            <Edit2 className="w-5 h-5" />
            {t("booking.step4.modify")}
          </button>
          <button
            onClick={handleCancelReservation}
            className="flex items-center justify-center gap-2 px-3 py-3 bg-red-50 border-2 border-red-300 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-semibold active:scale-95"
          >
            <Trash2 className="w-5 h-5" />
            {t("booking.step4.cancel")}
          </button>
        </div>
      </div>

      {/* Trust Elements */}
      <div className="bg-primary/15 p-4 rounded-lg border-2 border-primary/30 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔒</span>
          <span className="text-slate-900 font-medium">{t("booking.step4.trust.ssl")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="text-slate-900 font-medium">{t("booking.step4.trust.managed_by")}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg">⭐</span>
          <span className="text-slate-900 font-medium">{t("booking.step4.trust.count")}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleNewReservation}
        className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors active:scale-95 flex items-center justify-center gap-2"
      >
        {t("booking.step4.home")}
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}
