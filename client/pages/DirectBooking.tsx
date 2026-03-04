/**
 * DirectBooking Page
 *
 * Direct booking page for book.sam.ma/:username.
 * Reservations made through this page are NOT commissioned.
 *
 * Mobile-first design with:
 * - Sticky bottom CTA button
 * - Touch-optimized controls (min 44px targets)
 * - iOS safe area support
 * - Smooth scroll behavior
 * - Native-like date/time/people picker
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  CalendarDays,
  Users,
  Clock,
  ChevronLeft,
  ChevronRight,
  Check,
  Minus,
  Plus,
} from "lucide-react";

import { DirectBookingHeader } from "@/components/directBooking/DirectBookingHeader";
import { DirectBookingFooter } from "@/components/directBooking/DirectBookingFooter";
import { DirectBookingEstablishmentCard } from "@/components/directBooking/DirectBookingEstablishmentCard";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { isAuthed } from "@/lib/auth";
import {
  getDirectBookingEstablishment,
  convertSlotsToDateSlots,
  type DirectBookingResponse,
} from "@/lib/directBookingApi";
import type { PublicDateSlots } from "@/lib/publicApi";
import { createConsumerReservation } from "@/lib/consumerReservationsApi";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { cn } from "@/lib/utils";

type BookingStep = "date" | "time" | "people" | "confirm";

type BookingSelection = {
  date: string;
  time: string;
  people: number;
  slotId: string | null;
};

// Helper functions
function formatDateFr(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDateShort(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getNextDays(count: number, startDate: Date = new Date()): string[] {
  const days: string[] = [];
  const d = new Date(startDate);
  for (let i = 0; i < count; i++) {
    days.push(formatYmd(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getServiceLabel(service: string): string {
  const lower = service.toLowerCase();
  if (lower.includes("dejeuner") || lower.includes("déjeuner") || lower.includes("lunch") || lower === "midi") {
    return "Dejeuner";
  }
  if (lower.includes("diner") || lower.includes("dîner") || lower.includes("dinner") || lower === "soir") {
    return "Diner";
  }
  if (lower.includes("petit") || lower.includes("breakfast")) {
    return "Petit-dejeuner";
  }
  if (lower.includes("tea") || lower.includes("gouter") || lower.includes("goûter")) {
    return "Tea Time";
  }
  if (lower.includes("happy")) {
    return "Happy Hour";
  }
  if (lower.includes("brunch")) {
    return "Brunch";
  }
  return service || "Disponible";
}

export default function DirectBooking() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DirectBookingResponse | null>(null);
  const [dateSlots, setDateSlots] = useState<PublicDateSlots[]>([]);

  // Booking flow state
  const [step, setStep] = useState<BookingStep>("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedPeople, setSelectedPeople] = useState(2);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Fetch establishment data
  const fetchEstablishment = useCallback(async () => {
    if (!username) {
      setError("Nom d'utilisateur invalide");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await getDirectBookingEstablishment(username);
      setData(response);

      // Convert slots to DateSlots format
      const convertedSlots = convertSlotsToDateSlots(response.slotsByDate);
      setDateSlots(convertedSlots);

      // Auto-select first available date
      if (convertedSlots.length > 0) {
        setSelectedDate(convertedSlots[0].date);
      }
    } catch (e: any) {
      console.error("Error fetching establishment:", e);
      if (e.status === 404) {
        setError("Etablissement non trouve. Ce lien n'est plus valide.");
      } else {
        setError(e.message || "Erreur lors du chargement");
      }
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchEstablishment();
  }, [fetchEstablishment]);

  // Get available times for selected date
  const getTimesForDate = useCallback((): { time: string; service: string; slotId?: string }[] => {
    if (!dateSlots.length || !selectedDate) return [];
    const dateData = dateSlots.find((d) => d.date === selectedDate);
    if (!dateData?.services) return [];

    const times: { time: string; service: string; slotId?: string }[] = [];
    for (const service of dateData.services) {
      for (const time of service.times || []) {
        times.push({
          time,
          service: service.service,
          slotId: dateData.slotIds?.[time],
        });
      }
    }
    // Sort by time
    times.sort((a, b) => a.time.localeCompare(b.time));
    return times;
  }, [dateSlots, selectedDate]);

  // Get available dates
  const getAvailableDates = useCallback((): string[] => {
    return dateSlots.map((d) => d.date);
  }, [dateSlots]);

  // Handle date selection
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedTime(null);
    setSelectedSlotId(null);
    setStep("time");

    // Scroll to top of booking section smoothly
    setTimeout(() => {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  // Handle time selection
  const handleTimeSelect = (time: string, slotId?: string) => {
    setSelectedTime(time);
    setSelectedSlotId(slotId || null);
    setStep("people");
  };

  // Handle people change
  const handlePeopleChange = (delta: number) => {
    setSelectedPeople((prev) => Math.max(1, Math.min(20, prev + delta)));
  };

  // Check if selection is complete
  const isSelectionComplete = selectedDate && selectedTime && selectedPeople > 0;

  // Handle reserve button click
  const handleReserveClick = async () => {
    if (!isSelectionComplete || !data) return;

    // Check if user is authenticated
    const authed = await isAuthed();
    if (!authed) {
      setShowAuthModal(true);
      return;
    }

    // Proceed with reservation
    await createReservation();
  };

  // Create the reservation
  const createReservation = async () => {
    if (!selectedDate || !selectedTime || !data) return;

    try {
      setSubmitting(true);

      const establishment = data.establishment;
      const startsAt = `${selectedDate}T${selectedTime}:00`;

      // Generate a unique booking reference
      const bookingReference = `BK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      const result = await createConsumerReservation({
        establishmentId: establishment.id,
        startsAt,
        partySize: selectedPeople,
        slotId: selectedSlotId,
        bookingReference,
        kind: establishment.universe || "restaurant",
      });

      toast({
        title: "Reservation confirmee !",
        description: `Votre reservation pour ${selectedPeople} personne(s) le ${formatDateFr(selectedDate)} a ${selectedTime} a ete enregistree.`,
      });

      // Navigate to booking details
      if (result.reservation?.id) {
        navigate(`/profile/bookings/${result.reservation.id}`);
      } else {
        navigate("/profile?tab=bookings");
      }
    } catch (e: any) {
      console.error("Error creating reservation:", e);
      toast({
        title: "Erreur",
        description: e.message || "Impossible de creer la reservation",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle auth success
  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    await createReservation();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-slate-50">
        <DirectBookingHeader
          establishmentName={null}
          establishmentUsername={username || null}
        />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-10 h-10 animate-spin text-[#a3001d] mx-auto mb-4" />
            <p className="text-slate-600">Chargement...</p>
          </div>
        </main>
        <DirectBookingFooter />
      </div>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-slate-50">
        <DirectBookingHeader
          establishmentName={null}
          establishmentUsername={username || null}
        />
        <main className="flex-1 flex items-center justify-center px-4 pb-safe">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-semibold text-slate-900 mb-2">
                Etablissement non trouve
              </h1>
              <p className="text-slate-600 mb-6">
                {error || "L'etablissement @" + username + " n'existe pas ou n'est plus disponible."}
              </p>
              <div className="flex flex-col gap-3">
                <Button
                  onClick={() => window.location.href = "https://sam.ma"}
                  className="w-full h-12 bg-[#a3001d] hover:bg-[#8a0019] text-base"
                >
                  Decouvrir sam.ma
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 text-base"
                  onClick={() => navigate("/")}
                >
                  Retour a l'accueil
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
        <DirectBookingFooter />
      </div>
    );
  }

  const { establishment, packs } = data;
  const availableDates = getAvailableDates();
  const availableTimes = getTimesForDate();
  const hasSlots = availableDates.length > 0;

  return (
    <div className="min-h-[100dvh] flex flex-col bg-slate-50">
      <DirectBookingHeader
        establishmentName={establishment.name}
        establishmentUsername={establishment.username || username || null}
      />

      {/* Main content - scrollable area */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
        style={{ paddingBottom: isSelectionComplete ? "120px" : "80px" }}
      >
        <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
          {/* Establishment Info Card */}
          <DirectBookingEstablishmentCard establishment={establishment} />

          {/* Booking Section */}
          {establishment.booking_enabled !== false && hasSlots ? (
            <>
              {/* Badge sans commission */}
              <div className="flex justify-center">
                <Badge
                  variant="outline"
                  className="text-green-700 border-green-300 bg-green-50 px-4 py-1.5 text-sm font-medium"
                >
                  <Check className="w-4 h-4 me-1.5" />
                  Reservation sans commission
                </Badge>
              </div>

              {/* Date Selection */}
              <Card className="border-slate-200 overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-[#a3001d]" />
                    <span className="font-semibold text-slate-900">Date</span>
                    {selectedDate && (
                      <span className="ms-auto text-sm text-[#a3001d] font-medium">
                        {formatDateShort(selectedDate)}
                      </span>
                    )}
                  </div>
                </div>
                <CardContent className="p-3">
                  {/* Horizontal scrollable date chips */}
                  <div
                    ref={scrollContainerRef}
                    className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory scrollbar-hide"
                    style={{ WebkitOverflowScrolling: "touch" }}
                  >
                    {availableDates.slice(0, 14).map((date) => {
                      const isSelected = selectedDate === date;
                      const dateObj = new Date(date);
                      const dayName = dateObj.toLocaleDateString("fr-FR", { weekday: "short" });
                      const dayNum = dateObj.getDate();
                      const month = dateObj.toLocaleDateString("fr-FR", { month: "short" });

                      return (
                        <button
                          key={date}
                          onClick={() => handleDateSelect(date)}
                          className={cn(
                            "flex-shrink-0 snap-start",
                            "flex flex-col items-center justify-center",
                            "w-16 h-20 rounded-xl border-2 transition-all",
                            "active:scale-95 touch-manipulation",
                            isSelected
                              ? "border-[#a3001d] bg-[#a3001d] text-white shadow-md"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                          )}
                        >
                          <span className={cn(
                            "text-xs font-medium uppercase",
                            isSelected ? "text-white/80" : "text-slate-500"
                          )}>
                            {dayName}
                          </span>
                          <span className="text-xl font-bold leading-tight mt-0.5">
                            {dayNum}
                          </span>
                          <span className={cn(
                            "text-xs",
                            isSelected ? "text-white/80" : "text-slate-500"
                          )}>
                            {month}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Time Selection */}
              {selectedDate && (
                <Card className="border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#a3001d]" />
                      <span className="font-semibold text-slate-900">Heure</span>
                      {selectedTime && (
                        <span className="ms-auto text-sm text-[#a3001d] font-medium">
                          {selectedTime}
                        </span>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-3">
                    {availableTimes.length > 0 ? (
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {availableTimes.map(({ time, service, slotId }) => {
                          const isSelected = selectedTime === time;
                          return (
                            <button
                              key={`${time}-${service}`}
                              onClick={() => handleTimeSelect(time, slotId)}
                              className={cn(
                                "h-14 rounded-xl border-2 transition-all",
                                "flex flex-col items-center justify-center",
                                "active:scale-95 touch-manipulation",
                                isSelected
                                  ? "border-[#a3001d] bg-[#a3001d] text-white shadow-md"
                                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                              )}
                            >
                              <span className="text-base font-bold">{time}</span>
                              <span className={cn(
                                "text-[10px] font-medium",
                                isSelected ? "text-white/80" : "text-slate-500"
                              )}>
                                {getServiceLabel(service)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-center text-slate-500 py-4">
                        Aucun creneau disponible pour cette date
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* People Selection */}
              {selectedTime && (
                <Card className="border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-[#a3001d]" />
                      <span className="font-semibold text-slate-900">Personnes</span>
                      <span className="ms-auto text-sm text-[#a3001d] font-medium">
                        {selectedPeople} personne{selectedPeople > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-center gap-6">
                      <button
                        onClick={() => handlePeopleChange(-1)}
                        disabled={selectedPeople <= 1}
                        className={cn(
                          "w-14 h-14 rounded-full border-2 transition-all",
                          "flex items-center justify-center",
                          "active:scale-95 touch-manipulation",
                          selectedPeople <= 1
                            ? "border-slate-200 bg-slate-100 text-slate-400"
                            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                        )}
                      >
                        <Minus className="w-6 h-6" />
                      </button>

                      <div className="w-20 text-center">
                        <span className="text-4xl font-bold text-slate-900">
                          {selectedPeople}
                        </span>
                      </div>

                      <button
                        onClick={() => handlePeopleChange(1)}
                        disabled={selectedPeople >= 20}
                        className={cn(
                          "w-14 h-14 rounded-full border-2 transition-all",
                          "flex items-center justify-center",
                          "active:scale-95 touch-manipulation",
                          selectedPeople >= 20
                            ? "border-slate-200 bg-slate-100 text-slate-400"
                            : "border-[#a3001d] bg-[#a3001d]/5 text-[#a3001d] hover:bg-[#a3001d]/10"
                        )}
                      >
                        <Plus className="w-6 h-6" />
                      </button>
                    </div>

                    {/* Quick selection buttons */}
                    <div className="flex justify-center gap-2 mt-4">
                      {[1, 2, 4, 6, 8].map((num) => (
                        <button
                          key={num}
                          onClick={() => setSelectedPeople(num)}
                          className={cn(
                            "w-10 h-10 rounded-lg text-sm font-semibold transition-all",
                            "active:scale-95 touch-manipulation",
                            selectedPeople === num
                              ? "bg-[#a3001d] text-white"
                              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Packs Section (if any) */}
              {packs.length > 0 && (
                <Card className="border-slate-200">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
                    <span className="font-semibold text-slate-900">Offres & Packs</span>
                  </div>
                  <CardContent className="p-3 space-y-2">
                    {packs.slice(0, 3).map((pack) => (
                      <div
                        key={pack.id}
                        className="p-3 bg-slate-50 rounded-lg border border-slate-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-medium text-slate-900 truncate">{pack.title}</h4>
                            {pack.description && (
                              <p className="text-sm text-slate-600 mt-1 line-clamp-2">
                                {pack.description}
                              </p>
                            )}
                          </div>
                          <div className="text-end flex-shrink-0">
                            <div className="font-bold text-[#a3001d]">
                              {(pack.price / 100).toFixed(0)} MAD
                            </div>
                            {pack.original_price && pack.original_price > pack.price && (
                              <div className="text-xs text-slate-400 line-through">
                                {(pack.original_price / 100).toFixed(0)} MAD
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          ) : establishment.booking_enabled === false ? (
            <Card className="border-slate-200">
              <CardContent className="py-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">
                  Reservations desactivees
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Cet etablissement n'accepte pas les reservations en ligne pour le moment.
                </p>
                <Button
                  variant="outline"
                  className="h-12 px-6"
                  onClick={() => {
                    const url = buildEstablishmentUrl({
                      id: establishment.id,
                      slug: establishment.slug,
                      universe: establishment.universe,
                    });
                    navigate(url);
                  }}
                >
                  Voir la fiche complete
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-slate-200">
              <CardContent className="py-8 text-center">
                <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700 mb-2">
                  Aucun creneau disponible
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Cet etablissement n'a pas de creneaux ouverts pour le moment.
                </p>
                <Button
                  variant="outline"
                  className="h-12 px-6"
                  onClick={() => {
                    const url = buildEstablishmentUrl({
                      id: establishment.id,
                      slug: establishment.slug,
                      universe: establishment.universe,
                    });
                    navigate(url);
                  }}
                >
                  Voir la fiche complete
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Sticky Bottom CTA - Mobile optimized */}
      {hasSlots && establishment.booking_enabled !== false && (
        <div
          className={cn(
            "fixed bottom-0 left-0 right-0 z-40",
            "bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]",
            "px-4 pt-3",
            "pb-[max(12px,env(safe-area-inset-bottom))]"
          )}
        >
          {/* Selection summary */}
          {isSelectionComplete && (
            <div className="flex items-center justify-center gap-3 mb-3 text-sm text-slate-600">
              <span className="flex items-center gap-1">
                <CalendarDays className="w-4 h-4" />
                {formatDateShort(selectedDate!)}
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {selectedTime}
              </span>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {selectedPeople}
              </span>
            </div>
          )}

          <Button
            onClick={handleReserveClick}
            disabled={!isSelectionComplete || submitting}
            className={cn(
              "w-full h-14 rounded-xl text-base font-bold",
              "bg-[#a3001d] hover:bg-[#8a0019] text-white",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "active:scale-[0.98] transition-transform touch-manipulation"
            )}
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 me-2 animate-spin" />
                Reservation en cours...
              </>
            ) : isSelectionComplete ? (
              "Confirmer la reservation"
            ) : (
              "Selectionnez date, heure et personnes"
            )}
          </Button>
        </div>
      )}

      <DirectBookingFooter />

      {/* Auth Modal */}
      <AuthModalV2
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthed={handleAuthSuccess}
        contextTitle="Connectez-vous pour reserver"
        contextSubtitle="Un compte SAM est necessaire pour finaliser votre reservation."
      />
    </div>
  );
}
