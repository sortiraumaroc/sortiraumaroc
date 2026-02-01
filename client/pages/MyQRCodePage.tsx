/**
 * My QR Code Page
 * Full-screen page for displaying the dynamic QR code for check-in
 *
 * Accessed from reservation details or direct link
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DynamicQRCode } from "@/components/booking/DynamicQRCode";
import { cn } from "@/lib/utils";

// ============================================================================
// Types
// ============================================================================

interface ReservationDetails {
  id: string;
  booking_reference: string | null;
  establishment_name: string;
  establishment_address?: string;
  starts_at: string;
  party_size: number;
  status: string;
}

// ============================================================================
// Component
// ============================================================================

export default function MyQRCodePage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const navigate = useNavigate();

  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch reservation details
  useEffect(() => {
    if (!reservationId) {
      setError("ID de réservation manquant");
      setLoading(false);
      return;
    }

    const fetchReservation = async () => {
      try {
        const response = await fetch(`/api/consumer/reservations/${reservationId}`);
        if (!response.ok) {
          throw new Error("Réservation introuvable");
        }
        const data = await response.json();
        setReservation({
          id: data.id,
          booking_reference: data.booking_reference,
          establishment_name: data.establishment?.name || "Établissement",
          establishment_address: data.establishment?.address,
          starts_at: data.starts_at,
          party_size: data.party_size,
          status: data.status,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    };

    void fetchReservation();
  }, [reservationId]);

  // Format date and time
  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  };

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-primary/5 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-slate-600">Chargement...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="p-4 bg-red-100 rounded-full inline-block mb-4">
            <Shield className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            {error || "Réservation introuvable"}
          </h1>
          <p className="text-slate-600 mb-6">
            Vérifiez que vous êtes connecté avec le bon compte ou que la réservation existe encore.
          </p>
          <Button onClick={() => navigate("/reservations")}>
            Voir mes réservations
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-white to-white">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold truncate">Mon QR Code</h1>
            <p className="text-xs text-slate-500 truncate">
              {reservation.establishment_name}
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Security info */}
        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Shield className="h-6 w-6 text-emerald-600 flex-shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-emerald-900">QR Code dynamique sécurisé</p>
            <p className="text-emerald-700">
              Ce code change toutes les 30 secondes et ne peut pas être copié ou partagé.
            </p>
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <DynamicQRCode
            reservationId={reservation.id}
            bookingReference={reservation.booking_reference || undefined}
            establishmentName={reservation.establishment_name}
            size={280}
            showTimer={true}
          />
        </div>

        {/* Reservation details */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <h2 className="font-semibold text-lg">{reservation.establishment_name}</h2>
            {reservation.establishment_address && (
              <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-1">
                <MapPin className="h-4 w-4" />
                {reservation.establishment_address}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-100">
            <div className="p-4 text-center">
              <Calendar className="h-5 w-5 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Date</p>
              <p className="font-medium text-sm">{formatDate(reservation.starts_at)}</p>
            </div>
            <div className="p-4 text-center">
              <Clock className="h-5 w-5 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Heure</p>
              <p className="font-medium text-sm">{formatTime(reservation.starts_at)}</p>
            </div>
            <div className="p-4 text-center">
              <Users className="h-5 w-5 text-slate-400 mx-auto mb-1" />
              <p className="text-xs text-slate-500">Personnes</p>
              <p className="font-medium text-sm">{reservation.party_size}</p>
            </div>
          </div>

          {reservation.booking_reference && (
            <div className="p-4 bg-slate-50 text-center">
              <p className="text-xs text-slate-500">Référence</p>
              <p className="font-mono font-bold text-lg">{reservation.booking_reference}</p>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 className="font-medium text-slate-900">Comment utiliser ce QR code ?</h3>
          <ol className="text-sm text-slate-600 space-y-2">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>Présentez ce QR code à votre arrivée à l'établissement</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>Le personnel scannera le code pour valider votre réservation</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>Le code se renouvelle automatiquement, gardez l'écran allumé</span>
            </li>
          </ol>
        </div>

        {/* Add to wallet button */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1 gap-2"
            onClick={() => {
              // TODO: Add to Apple/Google Wallet
              alert("Ajouter au wallet - Bientôt disponible");
            }}
          >
            <Wallet className="h-4 w-4" />
            Ajouter au Wallet
          </Button>
        </div>
      </main>
    </div>
  );
}
