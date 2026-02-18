import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  CalendarDays,
  Car,
  MapPin,
  Clock,
  Loader2,
  Home,
  User,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";
import { getRentalReservation } from "@/lib/rentalApi";
import type { RentalReservation } from "../../shared/rentalTypes";

export default function RentalBookingConfirm() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const { t } = useI18n();
  const [reservation, setReservation] = useState<RentalReservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reservationId) {
      setError("ID de réservation manquant");
      setLoading(false);
      return;
    }

    getRentalReservation(reservationId)
      .then((res) => {
        setReservation(res.reservation);
      })
      .catch((err) => {
        setError(err.message || "Erreur de chargement");
      })
      .finally(() => setLoading(false));
  }, [reservationId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-red-600 mb-4">{error || "Réservation non trouvée"}</p>
          <Link to="/">
            <Button variant="outline">Retour à l'accueil</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Success icon */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            Réservation confirmée !
          </h1>
          <p className="text-slate-600">
            Votre demande de location a bien été enregistrée.
          </p>
        </div>

        {/* Booking reference */}
        <Card className="mb-6 border-primary/20">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-slate-500 mb-1">Référence de réservation</p>
            <p className="text-2xl font-bold text-primary tracking-wider">
              {reservation.booking_reference}
            </p>
            <p className="text-xs text-slate-400 mt-2">
              Conservez cette référence pour le suivi de votre location.
            </p>
          </CardContent>
        </Card>

        {/* Reservation details */}
        <Card className="mb-6">
          <CardContent className="p-6 space-y-4">
            <h2 className="font-semibold text-slate-900">Détails de la location</h2>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-700">Prise en charge</p>
                <p className="text-sm text-slate-600">
                  {reservation.pickup_city} — {reservation.pickup_date} à {reservation.pickup_time}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-slate-700">Restitution</p>
                <p className="text-sm text-slate-600">
                  {reservation.dropoff_city} — {reservation.dropoff_date} à {reservation.dropoff_time}
                </p>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-lg font-bold text-slate-900">
                  {reservation.total_price} MAD
                </span>
              </div>
              {reservation.deposit_amount > 0 && (
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-slate-500">Caution</span>
                  <span className="text-sm text-slate-600">
                    {reservation.deposit_amount} MAD
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Next steps */}
        <Card className="mb-8">
          <CardContent className="p-6">
            <h2 className="font-semibold text-slate-900 mb-3">Prochaines étapes</h2>
            <ol className="space-y-3 text-sm text-slate-600">
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span>Validez vos documents d'identité (permis + CIN) si ce n'est pas déjà fait.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span>Le loueur validera vos documents et confirmera la réservation.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span>Présentez-vous à l'agence le jour de la prise en charge avec votre QR code.</span>
              </li>
            </ol>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="space-y-3">
          <Link to="/profile?tab=bookings" className="block">
            <Button className="w-full h-12" variant="brand">
              <User className="w-4 h-4 mr-2" />
              Voir ma réservation
            </Button>
          </Link>
          <Link to="/" className="block">
            <Button variant="outline" className="w-full h-12">
              <Home className="w-4 h-4 mr-2" />
              Retour à l'accueil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
