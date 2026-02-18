import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Calendar,
  ChevronLeft,
  Clock,
  CreditCard,
  Download,
  MapPin,
  MessageSquareText,
  QrCode,
  Receipt,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  formatMoneyMad,
  getBookingPreReservationBreakdown,
} from "@/lib/billing";
import { requestLacaissePayCheckoutUrl } from "@/lib/lacaissepay";
import { generateInvoicePDF } from "@/lib/invoicePdf";
import { generateReservationPDF } from "@/lib/pdfGenerator";
import {
  getBookingReviewOverallRating,
  getUserProfile,
  saveBookingCriteriaReview,
  type BookingRecord,
} from "@/lib/userData";
import {
  ConsumerApiError,
  getMyConsumerReservation,
  getMyConsumerReservationInvoice,
  mapConsumerReservationToBookingRecord,
  updateMyConsumerReservation,
} from "@/lib/consumerReservationsApi";
import {
  getPublicEstablishment,
  type PublicBookingPolicy,
} from "@/lib/publicApi";
import { getUserBookingStatusBadge } from "@/lib/reservationStatus";

import { formatHeureHhHMM } from "@shared/datetime";
import {
  computeCriteriaAverage,
  CriteriaRatingsDisplay,
  CriteriaRatingsForm,
  makeDefaultCriteria,
  type BookingReviewCriteria,
} from "@/components/reviews/CriteriaRating";
import { DepositRequiredDialog } from "@/components/booking/DepositRequiredDialog";
import { RequestReservationModificationDialog } from "@/components/booking/RequestReservationModificationDialog";
import { ReservationActionsPanel } from "@/components/booking/ReservationActionsPanel";
import {
  WaitlistOfferCard,
  type WaitlistOffer,
} from "@/components/booking/WaitlistOfferCard";

function isPastBooking(b: BookingRecord): boolean {
  const ref = b.endDateIso ? b.endDateIso : b.dateIso;
  const ts = Date.parse(ref);
  if (!Number.isFinite(ts)) return false;
  return ts < Date.now();
}

function statusLabel(
  booking: BookingRecord,
  t: (
    key: string,
    params?: Record<string, string | number | null | undefined>,
  ) => string,
): { text: string; className: string; title?: string } {
  return getUserBookingStatusBadge(booking, { context: "details", t });
}

function inferServiceFromIso(
  dateIso: string,
  t: (
    key: string,
    params?: Record<string, string | number | null | undefined>,
  ) => string,
): string {
  const ts = Date.parse(dateIso);
  if (!Number.isFinite(ts)) return "—";
  const d = new Date(ts);
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 15 * 60) return t("booking_details.service.lunch");
  if (minutes < 19 * 60) return t("booking_details.service.continuous");
  return t("booking_details.service.dinner");
}

function makeInvoiceNumber(bookingId: string, issuedAtIso: string): string {
  const y = new Date(issuedAtIso).getFullYear();
  const suffix = bookingId
    .replace(/[^A-Z0-9]/gi, "")
    .slice(-6)
    .toUpperCase();
  return `SAM-${y}-${suffix}`;
}

function attendanceLabel(
  attendance: BookingRecord["attendance"] | undefined,
  t: (
    key: string,
    params?: Record<string, string | number | null | undefined>,
  ) => string,
): { label: string; icon: React.ComponentType<{ className?: string }> } {
  if (attendance === "present")
    return { label: t("booking_details.attendance.present"), icon: UserCheck };
  if (attendance === "no_show")
    return { label: t("booking_details.attendance.no_show"), icon: XCircle };
  return { label: t("booking_details.attendance.unknown"), icon: UserCheck };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export default function BookingDetails() {
  const navigate = useNavigate();
  const {
    t,
    locale,
    formatNumber,
    formatDate: formatDateI18n,
    formatTime: formatTimeI18n,
  } = useI18n();
  const params = useParams<{ bookingId: string }>();

  const formatBookingDate = (iso: string) =>
    formatDateI18n(iso, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const formatBookingDateTime = (iso: string) =>
    formatDateI18n(iso, {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

  const formatMoney = (amount: number, currency: string): string => {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "—";

    const code =
      String(currency || "")
        .trim()
        .toUpperCase() || "MAD";

    if (code === "MAD") {
      return `${Math.round(value)} ${t("currency.mad.short")}`;
    }

    try {
      return formatNumber(value, {
        style: "currency",
        currency: code,
        maximumFractionDigits: 0,
      });
    } catch {
      return `${Math.round(value)} ${code}`;
    }
  };

  const { toast } = useToast();

  const bookingId = params.bookingId
    ? decodeURIComponent(params.bookingId)
    : "";
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modDialogOpen, setModDialogOpen] = useState(false);
  const [modSaving, setModSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [bookingPolicy, setBookingPolicy] =
    useState<PublicBookingPolicy | null>(null);
  const [waitlistSaving, setWaitlistSaving] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [depositPaying, setDepositPaying] = useState(false);
  const [depositAmountMad, setDepositAmountMad] = useState<number>(0);
  const [depositCurrencyLabel, setDepositCurrencyLabel] =
    useState<string>("MAD");

  const reloadBooking = async (id: string, args?: { silent?: boolean }) => {
    const silent = args?.silent === true;
    if (!id) return;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const row = await getMyConsumerReservation(id);
      const mapped = mapConsumerReservationToBookingRecord(row);
      setBooking(mapped);
    } catch (e) {
      setBooking(null);
      setLoadError(e instanceof Error ? e.message : t("common.error.generic"));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (!bookingId) {
        setBooking(null);
        setLoading(false);
        setLoadError(t("booking_details.not_found"));
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const row = await getMyConsumerReservation(bookingId);
        const mapped = mapConsumerReservationToBookingRecord(row);
        if (cancelled) return;
        setBooking(mapped);
      } catch (e) {
        if (cancelled) return;
        setBooking(null);
        setLoadError(
          e instanceof Error ? e.message : t("common.error.generic"),
        );
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const estId = booking?.establishmentId
        ? String(booking.establishmentId).trim()
        : "";
      if (!estId) {
        setBookingPolicy(null);
        return;
      }

      try {
        const res = await getPublicEstablishment({ ref: estId });
        if (cancelled) return;
        setBookingPolicy(res.booking_policy ?? null);
      } catch {
        if (cancelled) return;
        setBookingPolicy(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [booking?.establishmentId]);

  const past = booking ? isPastBooking(booking) : false;

  const meta = useMemo(() => {
    if (!booking) return null;
    return isRecord(booking.meta)
      ? (booking.meta as Record<string, unknown>)
      : null;
  }, [booking]);

  const requestedChange = useMemo(() => {
    if (!meta) return null;
    const v = meta.requested_change;
    return isRecord(v) ? (v as Record<string, unknown>) : null;
  }, [meta]);

  const proposedChange = useMemo(() => {
    if (!meta) return null;
    const v = meta.proposed_change;
    return isRecord(v) ? (v as Record<string, unknown>) : null;
  }, [meta]);

  const lastProMessage = useMemo(() => {
    if (!meta) return null;
    const v = meta.last_pro_message;
    return isRecord(v) ? (v as Record<string, unknown>) : null;
  }, [meta]);

  // NEW: auto-promotion waitlist logic
  const waitlistOffer: WaitlistOffer | null = useMemo(() => {
    if (!booking) return null;
    const raw = (booking as any).waitlistOffer;
    if (!raw || typeof raw !== "object") return null;

    const id =
      typeof (raw as any).id === "string" ? String((raw as any).id) : "";
    const status =
      typeof (raw as any).status === "string"
        ? String((raw as any).status)
        : "";
    const position =
      typeof (raw as any).position === "number" &&
      Number.isFinite((raw as any).position)
        ? Math.max(1, Math.round((raw as any).position))
        : 1;
    const offer_expires_at =
      typeof (raw as any).offer_expires_at === "string"
        ? String((raw as any).offer_expires_at)
        : null;

    if (!id || !status) return null;
    return { id, status, position, offer_expires_at };
  }, [booking]);
  const escrowHeld = useMemo(() => {
    if (!booking) return false;

    const payment = booking.payment as unknown as
      | Record<string, unknown>
      | undefined;
    const paymentFlag =
      payment && typeof payment.escrow_held === "boolean"
        ? payment.escrow_held
        : null;

    const metaFlag =
      meta &&
      (meta.escrow_held === true ||
        typeof meta.escrow_held_at === "string" ||
        typeof meta.escrow_hold_id === "string");

    return paymentFlag === true || metaFlag === true;
  }, [booking, meta]);

  const status = booking ? statusLabel(booking, t) : null;
  const time = booking ? formatTimeI18n(booking.dateIso) : null;
  const range = booking
    ? booking.endDateIso
      ? `${formatBookingDate(booking.dateIso)} → ${formatBookingDate(booking.endDateIso)}`
      : formatBookingDate(booking.dateIso)
    : "";

  const attendance = booking ? attendanceLabel(booking.attendance, t) : null;
  const canLeaveReview = Boolean(
    booking && past && booking.attendance === "present" && !booking.review,
  );

  const profile = useMemo(() => getUserProfile(), []);
  const breakdown = useMemo(() => {
    if (!booking) return { unitMad: null, partySize: null, totalMad: null };
    return getBookingPreReservationBreakdown(booking);
  }, [booking]);
  const cancellationPolicy = useMemo(() => {
    if (!booking) {
      return {
        canCancel: false,
        freeUntilIso: null as string | null,
        freeUntilLabel: "",
        freeUntilHours: 0,
        penaltyPercent: 0,
        penaltyMad: null as number | null,
        summary: "",
        policyText: "",
      };
    }

    const startsTs = Date.parse(booking.dateIso);
    if (!Number.isFinite(startsTs)) {
      return {
        canCancel: false,
        freeUntilIso: null as string | null,
        freeUntilLabel: "",
        freeUntilHours: 0,
        penaltyPercent: 0,
        penaltyMad: null as number | null,
        summary: "",
        policyText: "",
      };
    }

    const defaultFreeHours = bookingPolicy
      ? Math.max(
          0,
          Math.round(Number(bookingPolicy.free_cancellation_hours ?? 24)),
        )
      : 24;
    const defaultPenaltyPercent = bookingPolicy
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              Number(bookingPolicy.cancellation_penalty_percent ?? 50),
            ),
          ),
        )
      : 50;

    const freeHours =
      bookingPolicy && bookingPolicy.cancellation_enabled
        ? Math.max(
            0,
            Math.round(
              Number(bookingPolicy.free_cancellation_hours ?? defaultFreeHours),
            ),
          )
        : defaultFreeHours;

    const basePenaltyPercent =
      bookingPolicy && bookingPolicy.cancellation_enabled
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                Number(
                  bookingPolicy.cancellation_penalty_percent ??
                    defaultPenaltyPercent,
                ),
              ),
            ),
          )
        : defaultPenaltyPercent;

    const freeUntilTs = startsTs - freeHours * 60 * 60 * 1000;
    const now = Date.now();

    const penaltyPercent = now < freeUntilTs ? 0 : basePenaltyPercent;

    const totalPaidMad =
      typeof breakdown.totalMad === "number" &&
      Number.isFinite(breakdown.totalMad)
        ? breakdown.totalMad
        : null;
    const penaltyMad =
      totalPaidMad != null
        ? Math.round((totalPaidMad * penaltyPercent) / 100)
        : null;

    const freeUntilIso = new Date(freeUntilTs).toISOString();
    const freeUntilLabel = formatBookingDateTime(freeUntilIso);

    const summary =
      penaltyPercent === 0
        ? t("booking_details.cancellation.free_until", { date: freeUntilLabel })
        : t("booking_details.cancellation.conditional", {
            percent: penaltyPercent,
          });

    const customPolicyText =
      bookingPolicy && bookingPolicy.cancellation_enabled
        ? locale === "en"
          ? bookingPolicy.cancellation_text_en
          : bookingPolicy.cancellation_text_fr
        : "";

    const policyText =
      customPolicyText && customPolicyText.trim()
        ? customPolicyText.trim()
        : t("booking_details.cancellation.default_note");

    return {
      canCancel: now < startsTs,
      freeUntilIso,
      freeUntilLabel,
      freeUntilHours: freeHours,
      penaltyPercent,
      penaltyMad,
      summary,
      policyText,
    };
  }, [
    booking,
    bookingPolicy,
    breakdown.totalMad,
    formatBookingDateTime,
    locale,
    t,
  ]);

  const modifyHref = useMemo(() => {
    if (!booking) return "/profile";
    if (booking.kind === "hotel") {
      return `/hotel-booking/${encodeURIComponent(booking.establishmentId ?? "304")}`;
    }
    const estId = booking.establishmentId ?? "1";
    return `/booking/${encodeURIComponent(estId)}?universe=restaurants`;
  }, [booking]);

  const handleExportPdf = async () => {
    if (booking.kind !== "restaurant") return;
    const ts = Date.parse(booking.dateIso);
    if (!Number.isFinite(ts)) return;

    const timeText = formatHeureHhHMM(booking.dateIso);

    await generateReservationPDF({
      bookingReference: booking.id,
      restaurantName: booking.title,
      address:
        [booking.addressLine, booking.city].filter(Boolean).join(", ") || "—",
      phone: booking.phone || "—",
      date: booking.dateIso,
      time: timeText,
      service: inferServiceFromIso(booking.dateIso, t),
      partySize: typeof booking.partySize === "number" ? booking.partySize : 1,
      guestName:
        [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
        t("common.user"),
      guestPhone: profile.contact || "",
      guestEmail: undefined,
      reservationMode:
        booking.payment?.status === "paid" ? "guaranteed" : "non-guaranteed",
      qrCodeUrl: `${window.location.origin}/mon-qr`,
      unitPrepayMad: breakdown.unitMad ?? undefined,
      totalPrepayMad: breakdown.totalMad ?? undefined,
      message: booking.notes || undefined,
    });
  };

  const handleInvoicePdf = async () => {
    if (!booking) return;
    if (!breakdown.totalMad || !breakdown.unitMad) return;

    let issuedAtIso = booking.payment?.paidAtIso ?? booking.createdAtIso;
    let invoiceNumber = makeInvoiceNumber(booking.id, issuedAtIso);

    try {
      const inv = await getMyConsumerReservationInvoice(booking.id);
      invoiceNumber = inv.invoice_number;
      issuedAtIso = inv.issued_at;
    } catch {
      // Fallback to legacy client-side identifier if the server invoice can't be fetched.
    }

    await generateInvoicePDF({
      invoiceNumber,
      issuedAtIso,
      bookingReference: booking.id,
      establishmentName: booking.title,
      reservationDateIso: booking.dateIso,
      partySize: breakdown.partySize ?? 1,
      unitMad: breakdown.unitMad,
      totalMad: breakdown.totalMad,
      paymentMethodLabel:
        booking.payment?.methodLabel ?? t("booking_details.payment.secure"),
    });
  };

  const [criteria, setCriteria] = useState<BookingReviewCriteria>(() =>
    makeDefaultCriteria(5),
  );
  const [comment, setComment] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="container mx-auto px-4 py-14">
          <div className="max-w-2xl mx-auto rounded-lg border-2 border-slate-200 bg-white p-6">
            <div className="text-lg font-bold text-foreground">
              {t("booking_details.loading.title")}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {t("booking_details.loading.body")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="container mx-auto px-4 py-14">
          <div className="max-w-2xl mx-auto rounded-lg border-2 border-slate-200 bg-white p-6">
            <div className="text-lg font-bold text-foreground">
              {t("booking_details.not_found")}
            </div>
            <div className="mt-2 text-sm text-slate-600">
              {loadError ?? t("booking_details.not_found.body_default")}
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => navigate("/profile")}>
                {t("booking_details.back_to_account")}
              </Button>
              <Link to="/results">
                <Button className="bg-primary hover:bg-primary/90 text-white">
                  {t("booking_details.explore")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleDeclineProposedChange = () => {
    void (async () => {
      setModSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "decline_proposed_change",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.toast.declined.title"),
          description: t("booking_details.toast.declined.body"),
        });
      } catch (e) {
        toast({
          title: t("common.impossible"),
          description:
            e instanceof Error ? e.message : t("common.error.generic"),
        });
      } finally {
        setModSaving(false);
      }
    })();
  };

  const handleAcceptProposedChange = () => {
    void (async () => {
      setModSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "accept_proposed_change",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.toast.accepted.title"),
          description: t("booking_details.toast.accepted.body"),
        });
      } catch (e) {
        toast({
          title: t("common.impossible"),
          description:
            e instanceof Error ? e.message : t("common.error.generic"),
        });
      } finally {
        setModSaving(false);
      }
    })();
  };

  const handleCancelChangeRequest = () => {
    void (async () => {
      setModSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "cancel_request",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.toast.change_cancelled.title"),
          description: t("booking_details.toast.change_cancelled.body"),
        });
      } catch (e) {
        toast({
          title: t("common.impossible"),
          description:
            e instanceof Error ? e.message : t("common.error.generic"),
        });
      } finally {
        setModSaving(false);
      }
    })();
  };

  const handleRequestCancellation = () => {
    void (async () => {
      setCancelSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "request_cancellation",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.toast.cancellation_sent.title"),
          description: t("booking_details.toast.cancellation_sent.body"),
        });
      } catch (e) {
        toast({
          title: t("common.impossible"),
          description:
            e instanceof Error ? e.message : t("common.error.generic"),
        });
      } finally {
        setCancelSaving(false);
      }
    })();
  };

  const handleDepositCancel = () => {
    if (depositPaying) return;
    setDepositDialogOpen(false);
  };

  const handlePayDeposit = () => {
    if (depositPaying || !booking) return;

    setDepositPaying(true);
    try {
      const amountMad = Math.max(0, Math.round(depositAmountMad));

      // Get public URL for redirect
      const publicBaseUrl = window.location.origin;
      const acceptUrl = `${publicBaseUrl}/booking-details/${booking.id}?payment_status=success`;
      const declineUrl = `${publicBaseUrl}/booking-details/${booking.id}?payment_status=failed`;
      const notificationUrl = `${publicBaseUrl}/api/payments/webhook`;

      // Create LacaissePay session and redirect
      void (async () => {
        try {
          // Extract name parts from booking (may not have structured firstName/lastName)
          const fullName =
            typeof booking.partyName === "string"
              ? booking.partyName
              : "Guest Account";
          const nameParts = fullName.split(" ");
          const firstName = nameParts[0] || "Guest";
          const lastName = nameParts.slice(1).join(" ") || "Account";

          const checkoutUrl = await requestLacaissePayCheckoutUrl({
            orderId: booking.id,
            externalReference: booking.id, // Use booking ID as external ref
            amount: amountMad,
            customerEmail:
              typeof booking.email === "string" ? booking.email : "",
            customerPhone: (() => {
              // Use phone from environment variable if set, otherwise use booking phone
              const envPhone = (import.meta as any).env?.VITE_LACAISSEPAY_DEV_PHONE?.trim();
              if (envPhone) {
                return envPhone;
              }
              return typeof booking.phone === "string" && booking.phone
                ? booking.phone
                : "+212611159538";
            })(),
            customerFirstName: firstName,
            customerLastName: lastName,
            acceptUrl,
            declineUrl,
            notificationUrl,
            companyName: "Sortir Au Maroc",
          });

          // Open payment page in the current tab
          setDepositDialogOpen(false);
          window.location.href = checkoutUrl;
          toast({
            title: t("booking_details.toast.payment_initiated.title"),
            description: t("booking_details.toast.payment_initiated.body"),
          });
        } catch (e) {
          const msg =
            e instanceof Error ? e.message : t("common.error.generic");
          toast({
            title: t("common.error"),
            description: msg,
            variant: "destructive",
          });
        }
      })();
    } finally {
      setDepositPaying(false);
    }
  };

  // NEW: auto-promotion waitlist logic
  const handleAcceptWaitlistOffer = () => {
    if (!booking || waitlistSaving) return;
    void (async () => {
      setWaitlistSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "waitlist_accept_offer",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.waitlist_offer.accept"),
          description: t("booking_details.waitlist_offer.title"),
        });
      } catch (e) {
        if (
          e instanceof ConsumerApiError &&
          e.status === 402 &&
          isRecord(e.payload) &&
          e.payload.error === "payment_required"
        ) {
          const amountCents =
            typeof e.payload.amount_deposit === "number" &&
            Number.isFinite(e.payload.amount_deposit)
              ? e.payload.amount_deposit
              : null;
          const currency =
            typeof e.payload.currency === "string" && e.payload.currency.trim()
              ? e.payload.currency.trim()
              : (booking?.payment?.currency ?? "MAD");

          setDepositAmountMad(
            amountCents != null
              ? Math.round(amountCents) / 100
              : (booking?.payment?.depositAmount ?? 0),
          );
          setDepositCurrencyLabel(currency.toUpperCase());
          setDepositDialogOpen(true);
          return;
        }

        const msg = e instanceof Error ? e.message : t("common.error.generic");
        toast({ title: t("common.impossible"), description: msg });
      } finally {
        setWaitlistSaving(false);
      }
    })();
  };

  const handleRefuseWaitlistOffer = () => {
    if (!booking || waitlistSaving) return;
    void (async () => {
      setWaitlistSaving(true);
      try {
        await updateMyConsumerReservation(booking.id, {
          action: "waitlist_refuse_offer",
        });
        await reloadBooking(booking.id, { silent: true });
        toast({
          title: t("booking_details.waitlist_offer.refuse"),
          description: t("booking_details.waitlist_offer.title"),
        });
      } catch (e) {
        toast({
          title: t("common.impossible"),
          description:
            e instanceof Error ? e.message : t("common.error.generic"),
        });
      } finally {
        setWaitlistSaving(false);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate("/profile")}
            >
              <ChevronLeft className="w-4 h-4" />
              {t("booking_details.back")}
            </Button>
            <div
              className={cn(
                "max-w-[170px] sm:max-w-none px-2.5 sm:px-3 py-1 rounded-full border text-[11px] sm:text-xs font-bold text-center leading-tight whitespace-normal sm:whitespace-nowrap",
                status?.className ?? "",
              )}
              title={status?.title}
            >
              {status?.text}
            </div>
          </div>

          <div className="mt-4 rounded-lg border-2 border-slate-200 bg-white overflow-hidden">
            <div className="p-5 bg-primary/5 border-b border-slate-200">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-lg font-extrabold text-foreground truncate">
                    {booking.title}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 font-mono">
                    {t("booking_details.ref_prefix")}{" "}
                    {(booking.bookingReference ?? booking.id) as string}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-600">
                      {t("booking_details.field.date")}
                    </div>
                    <div className="font-semibold text-foreground">{range}</div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-600">
                      {t("booking_details.field.time")}
                    </div>
                    <div className="font-semibold text-foreground">
                      {time ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-600">
                      {t("booking_details.field.people")}
                    </div>
                    <div className="font-semibold text-foreground">
                      {typeof booking.partySize === "number"
                        ? booking.partySize
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>

              {booking.addressLine || booking.city ? (
                <div className="mt-4 flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-primary mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs text-slate-600">
                      {t("booking_details.field.address")}
                    </div>
                    <div className="font-semibold text-foreground">
                      {[booking.addressLine, booking.city]
                        .filter(Boolean)
                        .join(", ")}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2 font-bold text-foreground">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    {t("booking_details.payment.title")}
                  </div>
                  {escrowHeld ? (
                    <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">
                      {t("booking_details.payment.escrow_held_badge")}
                    </div>
                  ) : null}
                </div>
                {booking.payment ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-slate-600">
                        {t("booking_details.payment.status")}
                      </div>
                      <div className="font-semibold text-foreground">
                        {booking.payment.status}
                      </div>
                    </div>

                    {breakdown.unitMad != null &&
                    breakdown.totalMad != null &&
                    breakdown.partySize != null ? (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-slate-600">
                            {t(
                              "booking_details.payment.pre_reservation_per_person",
                            )}
                          </div>
                          <div className="font-semibold text-foreground">
                            {formatMoneyMad(breakdown.unitMad)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-slate-600">
                            {t("booking_details.payment.total_prepaid")}
                          </div>
                          <div className="font-extrabold text-foreground">
                            {formatMoneyMad(breakdown.totalMad)}
                          </div>
                        </div>
                        <div className="text-xs text-slate-500">
                          {t("booking_details.payment.calculation", {
                            unit: formatMoneyMad(breakdown.unitMad),
                            count: breakdown.partySize,
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-slate-600">
                            {t("booking_details.payment.amount")}
                          </div>
                          <div className="font-semibold text-foreground">
                            {formatMoney(
                              booking.payment.depositAmount,
                              booking.payment.currency,
                            )}
                          </div>
                        </div>
                        {typeof booking.payment.totalAmount === "number" ? (
                          <div className="flex items-center justify-between gap-4">
                            <div className="text-slate-600">
                              {t("booking_details.payment.total")}
                            </div>
                            <div className="font-semibold text-foreground">
                              {formatMoney(
                                booking.payment.totalAmount,
                                booking.payment.currency,
                              )}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}

                    {booking.payment.paidAtIso ? (
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-slate-600">
                          {t("booking_details.payment.paid_at")}
                        </div>
                        <div className="font-semibold text-foreground">
                          {formatDateI18n(booking.payment.paidAtIso, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </div>
                      </div>
                    ) : null}
                    {booking.payment.methodLabel ? (
                      <div className="flex items-center justify-between gap-4">
                        <div className="text-slate-600">
                          {t("booking_details.payment.method")}
                        </div>
                        <div className="font-semibold text-foreground">
                          {booking.payment.methodLabel}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-slate-600">
                    {t("booking_details.payment.none")}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold text-foreground">
                    <QrCode className="w-4 h-4 text-primary" />
                    {t("booking_details.qr.title")}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={handleExportPdf}
                      disabled={booking.kind !== "restaurant"}
                    >
                      <Download className="w-4 h-4" />
                      {t("common.pdf")}
                    </Button>
                    {breakdown.totalMad != null ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={handleInvoicePdf}
                      >
                        <Receipt className="w-4 h-4" />
                        {t("booking_details.qr.invoice")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3">
                  <Link to="/mon-qr">
                    <Button
                      type="button"
                      className="w-full gap-2 bg-primary hover:bg-primary/90 text-white"
                    >
                      <QrCode className="w-5 h-5" />
                      Voir mon QR code
                    </Button>
                  </Link>
                  <p className="text-sm text-slate-600">
                    Presentez votre QR code personnel a l'arrivee.
                  </p>
                  {booking.kind !== "restaurant" ? (
                    <p className="text-xs text-slate-500">
                      {t("booking_details.qr.pdf_restaurant_only")}
                    </p>
                  ) : null}
                </div>
              </div>

              {past ? (
                <>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      {attendance ? (
                        <attendance.icon className="w-4 h-4 text-primary" />
                      ) : (
                        <UserCheck className="w-4 h-4 text-primary" />
                      )}
                      {t("booking_details.attendance.title")}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">
                      {attendance?.label ??
                        t("booking_details.attendance.unknown")}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-2 font-bold text-foreground">
                      <MessageSquareText className="w-4 h-4 text-primary" />
                      {t("booking_details.review.title")}
                    </div>

                    {booking.review ? (
                      <div className="mt-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-semibold text-foreground">
                            {t("booking_details.review.overall", {
                              rating:
                                getBookingReviewOverallRating(booking.review) ??
                                "—",
                            })}
                          </div>
                          {typeof (booking.review as { criteria?: unknown })
                            .criteria === "object" &&
                          (booking.review as { criteria?: unknown })
                            .criteria !== null ? (
                            <div className="text-xs text-slate-600">
                              {t("booking_details.review.criteria_average")}
                            </div>
                          ) : null}
                        </div>

                        {typeof (booking.review as { criteria?: unknown })
                          .criteria === "object" &&
                        (booking.review as { criteria?: unknown }).criteria !==
                          null ? (
                          <div className="mt-3">
                            <CriteriaRatingsDisplay
                              criteria={
                                (
                                  booking.review as {
                                    criteria: Record<string, number>;
                                  }
                                ).criteria
                              }
                            />
                          </div>
                        ) : null}

                        <div className="mt-3 text-slate-700 whitespace-pre-wrap">
                          {booking.review.comment}
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                          {t("booking_details.review.published_at", {
                            date: formatDateI18n(booking.review.createdAtIso, {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            }),
                          })}
                        </div>
                      </div>
                    ) : canLeaveReview ? (
                      <div className="mt-3">
                        {!showReviewForm ? (
                          <Button
                            variant="outline"
                            onClick={() => setShowReviewForm(true)}
                          >
                            {t("booking_details.review.leave")}
                          </Button>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs text-slate-600 mb-2">
                                {t("booking_details.review.rate_each")}
                              </div>
                              <CriteriaRatingsForm
                                value={criteria as any}
                                onChange={setCriteria as any}
                              />
                              <div className="mt-2 text-xs text-slate-600">
                                {t("booking_details.review.estimated", {
                                  rating: computeCriteriaAverage(criteria),
                                })}
                              </div>
                            </div>

                            <div>
                              <div className="text-xs text-slate-600 mb-1">
                                {t("booking_details.review.comment_label")}
                              </div>
                              <textarea
                                className="w-full min-h-[96px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder={t(
                                  "booking_details.review.comment_placeholder",
                                )}
                              />
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setShowReviewForm(false);
                                  setComment("");
                                  setCriteria(makeDefaultCriteria(5));
                                }}
                              >
                                {t("common.cancel")}
                              </Button>
                              <Button
                                className="bg-primary hover:bg-primary/90 text-white"
                                onClick={() => {
                                  const res = saveBookingCriteriaReview({
                                    id: booking.id,
                                    criteria,
                                    comment,
                                  });
                                  if (res.ok === false) {
                                    toast({
                                      title: t("common.impossible"),
                                      description: res.message,
                                    });
                                    return;
                                  }
                                  toast({
                                    title: t(
                                      "booking_details.review.thank_you_title",
                                    ),
                                    description: t(
                                      "booking_details.review.saved_body",
                                    ),
                                  });
                                  setShowReviewForm(false);
                                  setComment("");
                                  setCriteria(makeDefaultCriteria(5));
                                  setBooking((prev) => {
                                    if (!prev) return prev;
                                    return {
                                      ...prev,
                                      review: {
                                        criteria,
                                        overallRating:
                                          computeCriteriaAverage(criteria),
                                        comment,
                                        createdAtIso: new Date().toISOString(),
                                      },
                                    } as BookingRecord;
                                  });
                                }}
                              >
                                {t("booking_details.review.publish")}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 text-sm text-slate-600">
                        {t("booking_details.review.unavailable")}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <div className="text-sm font-bold text-foreground">
                      {t("booking_details.summary.title")}
                    </div>
                    <div className="mt-2 text-sm text-slate-700 space-y-1">
                      {booking.notes ? (
                        <div>
                          <span className="text-slate-600">
                            {t("booking_details.summary.note")}
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {booking.notes}
                          </span>
                        </div>
                      ) : null}
                      {booking.phone ? (
                        <div>
                          <span className="text-slate-600">
                            {t("booking_details.summary.phone")}
                          </span>{" "}
                          <span className="font-semibold text-foreground">
                            {booking.phone}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {lastProMessage ? (
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <MessageSquareText className="w-4 h-4 text-primary" />
                        {t("booking_details.pro_message.title")}
                      </div>
                      <div className="mt-2 text-xs text-slate-500">
                        {typeof lastProMessage.at === "string"
                          ? formatBookingDateTime(lastProMessage.at)
                          : "—"}
                        {typeof lastProMessage.template_code === "string" &&
                        lastProMessage.template_code.trim()
                          ? ` • ${t("booking_details.pro_message.template_prefix")}: ${lastProMessage.template_code}`
                          : ""}
                      </div>
                      <div className="mt-2 text-sm text-slate-800 whitespace-pre-wrap">
                        {typeof lastProMessage.body === "string"
                          ? lastProMessage.body
                          : "—"}
                      </div>
                    </div>
                  ) : null}

                  {booking.status === "waitlist" && waitlistOffer ? (
                    <WaitlistOfferCard
                      booking={booking}
                      offer={waitlistOffer}
                      saving={waitlistSaving}
                      onAccept={handleAcceptWaitlistOffer}
                      onRefuse={handleRefuseWaitlistOffer}
                      formatTime={formatTimeI18n}
                    />
                  ) : null}

                  <ReservationActionsPanel
                    booking={booking}
                    breakdown={breakdown}
                    past={past}
                    cancellationPolicy={cancellationPolicy}
                    requestedChange={requestedChange}
                    proposedChange={proposedChange}
                    modificationRequested={
                      meta?.modification_requested === true
                    }
                    modSaving={modSaving}
                    cancelSaving={cancelSaving}
                    formatDateTime={formatBookingDateTime}
                    formatMoney={formatMoney}
                    onOpenChangeRequest={() => setModDialogOpen(true)}
                    onCancelChangeRequest={handleCancelChangeRequest}
                    onAcceptProposedChange={handleAcceptProposedChange}
                    onDeclineProposedChange={handleDeclineProposedChange}
                    onRequestCancellation={handleRequestCancellation}
                  />

                  <DepositRequiredDialog
                    open={depositDialogOpen}
                    depositAmount={depositAmountMad}
                    currencyLabel={depositCurrencyLabel}
                    unitAmount={null}
                    partySize={
                      typeof booking.partySize === "number"
                        ? booking.partySize
                        : null
                    }
                    paying={depositPaying}
                    onCancel={handleDepositCancel}
                    onPayAndConfirm={handlePayDeposit}
                  />

                  <RequestReservationModificationDialog
                    open={modDialogOpen}
                    onOpenChange={setModDialogOpen}
                    establishmentId={booking.establishmentId ?? null}
                    establishmentName={booking.title}
                    initialStartsAtIso={booking.dateIso}
                    initialPartySize={
                      typeof booking.partySize === "number"
                        ? booking.partySize
                        : null
                    }
                    loading={modSaving}
                    onSubmit={async (data) => {
                      setModSaving(true);
                      try {
                        await updateMyConsumerReservation(booking.id, {
                          action: "request_change",
                          requested_change: {
                            starts_at: data.startsAtIso,
                            party_size: data.partySize,
                          },
                        });
                        await reloadBooking(booking.id, { silent: true });
                        toast({
                          title: t(
                            "booking_details.toast.change_request_sent.title",
                          ),
                          description: t(
                            "booking_details.toast.change_request_sent.body",
                          ),
                        });
                      } catch (e) {
                        toast({
                          title: t("common.impossible"),
                          description:
                            e instanceof Error
                              ? e.message
                              : t("common.error.generic"),
                        });
                      } finally {
                        setModSaving(false);
                      }
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
