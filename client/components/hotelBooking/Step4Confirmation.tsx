import { useEffect } from "react";
import { Calendar, ChevronRight, Clock, Download, MapPin, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useBooking } from "@/hooks/useBooking";
import { getHotelById } from "@/lib/hotels";
import { getBookingQRCodeUrl } from "@/lib/qrcode";
import { getBookingRecordById, upsertBookingRecord } from "@/lib/userData";

function formatRange(checkIn: Date | null, checkOut: Date | null): string {
  if (!checkIn || !checkOut) return "";
  const start = checkIn.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const end = checkOut.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  return `${start} → ${end}`;
}

function nightsBetween(checkIn: Date | null, checkOut: Date | null): number | null {
  if (!checkIn || !checkOut) return null;
  const inTs = new Date(checkIn.getFullYear(), checkIn.getMonth(), checkIn.getDate()).getTime();
  const outTs = new Date(checkOut.getFullYear(), checkOut.getMonth(), checkOut.getDate()).getTime();
  if (outTs <= inTs) return null;
  return Math.round((outTs - inTs) / (1000 * 60 * 60 * 24));
}

export default function Step4HotelConfirmation() {
  const navigate = useNavigate();
  const {
    establishmentId,
    partySize,
    checkInDate,
    checkOutDate,
    hotelRoomSelection,
    reservationMode,
    firstName,
    lastName,
    bookingReference,
    setBookingReference,
    generateBookingReference,
    reset,
  } = useBooking();

  const hotel = establishmentId ? getHotelById(establishmentId) : null;
  const nights = nightsBetween(checkInDate, checkOutDate);

  useEffect(() => {
    if (!bookingReference) setBookingReference(generateBookingReference());
  }, [bookingReference, generateBookingReference, setBookingReference]);

  const qrCodeUrl = bookingReference ? getBookingQRCodeUrl(bookingReference) : "";

  useEffect(() => {
    if (!bookingReference) return;

    const existing = getBookingRecordById(bookingReference);

    const base = {
      id: bookingReference,
      kind: "hotel" as const,
      title: hotel?.name ?? "Hôtel",
      status: reservationMode === "guaranteed" ? ("confirmed" as const) : ("requested" as const),
      dateIso: (checkInDate ?? new Date()).toISOString(),
      endDateIso: checkOutDate?.toISOString(),
      partySize: typeof partySize === "number" ? partySize : undefined,
      createdAtIso: existing?.createdAtIso ?? new Date().toISOString(),
    };

    upsertBookingRecord({
      ...(existing ?? {}),
      ...base,
      payment: existing?.payment,
      attendance: existing?.attendance,
      review: existing?.review,
    });
  }, [bookingReference, checkInDate, checkOutDate, hotel?.name, partySize, reservationMode]);

  return (
    <div className="space-y-6 pb-6" style={{ fontFamily: "Circular Std, sans-serif" }}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center font-bold text-sm">4</div>
        <div>
          <p className="text-xs text-primary font-bold tracking-wider">ÉTAPE 4 SUR 4</p>
          <h2 className="text-lg md:text-xl font-bold text-foreground">Confirmation</h2>
        </div>
      </div>

      <div className="text-center p-6 rounded-lg border-2 bg-green-50 border-green-300">
        <p className="text-4xl mb-3">✅</p>
        <h2 className="text-2xl font-bold mb-2 text-green-950">Demande envoyée !</h2>
        <p className="text-sm text-green-950">Votre demande est enregistrée. Un message de confirmation vous sera envoyé.</p>
      </div>

      <div className="bg-white border-2 border-slate-300 rounded-lg overflow-hidden">
        <div className="bg-primary/5 p-4 border-b border-slate-300">
          <p className="font-bold text-foreground">{hotel?.name ?? "Hôtel"}</p>
          <p className="text-sm text-slate-600">{reservationMode === "guaranteed" ? "Réservation garantie" : "Flexible"}</p>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-600">Dates</p>
              <p className="font-bold text-foreground">{formatRange(checkInDate, checkOutDate)}</p>
              {nights != null ? <p className="text-sm text-slate-600">{nights} nuit{nights > 1 ? "s" : ""}</p> : null}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-600">Voyageurs</p>
              <p className="font-bold text-foreground">{partySize ?? "—"} personne{partySize && partySize > 1 ? "s" : ""}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-600">Chambre</p>
              <p className="font-bold text-foreground">
                {hotelRoomSelection?.roomsCount ?? "—"} chambre · {hotelRoomSelection?.roomType ?? "—"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-slate-600">Adresse</p>
              <p className="font-bold text-foreground">{hotel?.address ?? ""}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-2 border-slate-300 rounded-lg p-4">
        <p className="text-xs text-slate-600 mb-3 font-semibold">CONTACT</p>
        <p className="font-bold text-foreground mb-1">{firstName} {lastName}</p>
        {bookingReference ? (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <p className="text-xs text-slate-600 mb-2 font-semibold">RÉFÉRENCE</p>
            <p className="font-mono font-bold text-foreground text-sm">{bookingReference}</p>
          </div>
        ) : null}
      </div>

      {qrCodeUrl ? (
        <div className="bg-primary/5 border-2 border-primary/20 rounded-lg p-4 text-center">
          <p className="text-xs text-slate-600 mb-3 font-semibold">Code QR</p>
          <div className="flex justify-center mb-3">
            <img src={qrCodeUrl} alt="Booking QR Code" className="w-40 h-40 border-2 border-white rounded" />
          </div>
          <p className="text-xs text-slate-600">À présenter à l’arrivée si nécessaire</p>
        </div>
      ) : null}

      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full h-11 gap-2"
          onClick={() => {
            if (!bookingReference) return;
            const text = `Réservation hôtel ${hotel?.name ?? ""}\nRéférence: ${bookingReference}`;
            navigator.clipboard.writeText(text);
          }}
        >
          <Download className="w-5 h-5" />
          Copier la référence
        </Button>

        <Button
          type="button"
          className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition-colors active:scale-95 flex items-center justify-center gap-2"
          onClick={() => {
            reset();
            navigate("/results?universe=hebergement");
          }}
        >
          Retour aux hébergements
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
