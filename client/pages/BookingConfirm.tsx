import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CalendarCheck,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Users,
  XCircle,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type ConfirmationInfo = {
  found: boolean;
  status?: "pending" | "confirmed" | "expired" | "cancelled";
  expired?: boolean;
  reservation?: {
    id: string;
    establishment_name: string;
    starts_at: string;
    party_size: number;
    address?: string;
  };
};

type ConfirmResult = {
  success: boolean;
  error?: string;
  reservation?: {
    id: string;
    establishment_name: string;
    starts_at: string;
    party_size: number;
  };
};

export default function BookingConfirm() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<ConfirmationInfo | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(`/api/booking/confirm/${encodeURIComponent(token)}/info`);
        const payload = await res.json();
        if (!res.ok) {
          setError(payload?.error ?? `Erreur ${res.status}`);
        } else {
          setInfo(payload as ConfirmationInfo);
        }
      } catch (e) {
        setError("Erreur de connexion");
      } finally {
        setLoading(false);
      }
    };

    void fetchInfo();
  }, [token]);

  const confirmBooking = async () => {
    if (!token) return;
    setConfirming(true);
    try {
      const res = await fetch(`/api/booking/confirm/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        setError(payload?.error ?? `Erreur ${res.status}`);
      } else {
        setConfirmResult(payload as ConfirmResult);
      }
    } catch (e) {
      setError("Erreur de connexion");
    } finally {
      setConfirming(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
    } catch {
      return iso;
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-3">
            <CalendarCheck className="h-8 w-8 text-amber-600" />
          </div>
          <CardTitle className="text-xl text-slate-900">
            Confirmation de votre réservation
          </CardTitle>
          <CardDescription>
            Confirmez votre présence pour maintenir votre réservation
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-600" />
              <div className="mt-2 text-sm text-slate-600">
                Vérification en cours...
              </div>
            </div>
          ) : error ? (
            <div className="py-6 text-center">
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <div className="mt-3 text-lg font-semibold text-red-700">
                Erreur
              </div>
              <div className="mt-1 text-sm text-slate-600">{error}</div>
              <Link to="/">
                <Button variant="outline" className="mt-4">
                  Retour à l'accueil
                </Button>
              </Link>
            </div>
          ) : confirmResult?.success ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              <div className="mt-4 text-xl font-bold text-green-700">
                Présence confirmée !
              </div>
              <div className="mt-2 text-sm text-slate-700">
                Votre réservation est maintenue.
              </div>
              {confirmResult.reservation && (
                <div className="mt-4 bg-green-50 rounded-lg p-4 text-left">
                  <div className="font-semibold text-slate-900">
                    {confirmResult.reservation.establishment_name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                    <CalendarCheck className="h-4 w-4" />
                    {formatDate(confirmResult.reservation.starts_at)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                    <Clock className="h-4 w-4" />
                    {formatTime(confirmResult.reservation.starts_at)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                    <Users className="h-4 w-4" />
                    {confirmResult.reservation.party_size} personne{confirmResult.reservation.party_size > 1 ? "s" : ""}
                  </div>
                </div>
              )}
              <Link to="/mes-reservations">
                <Button className="mt-4 w-full">
                  Voir mes réservations
                </Button>
              </Link>
            </div>
          ) : !info?.found ? (
            <div className="py-6 text-center">
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <div className="mt-3 text-lg font-semibold text-red-700">
                Lien invalide
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Ce lien de confirmation n'existe pas ou a été supprimé.
              </div>
              <Link to="/">
                <Button variant="outline" className="mt-4">
                  Retour à l'accueil
                </Button>
              </Link>
            </div>
          ) : info.status === "confirmed" ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
              <div className="mt-3 text-lg font-semibold text-green-700">
                Déjà confirmé
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Votre présence a déjà été confirmée pour cette réservation.
              </div>
              {info.reservation && (
                <div className="mt-4 bg-green-50 rounded-lg p-4 text-left">
                  <div className="font-semibold text-slate-900">
                    {info.reservation.establishment_name}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-2">
                    <CalendarCheck className="h-4 w-4" />
                    {formatDate(info.reservation.starts_at)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                    <Clock className="h-4 w-4" />
                    {formatTime(info.reservation.starts_at)}
                  </div>
                </div>
              )}
              <Link to="/mes-reservations">
                <Button className="mt-4 w-full">
                  Voir mes réservations
                </Button>
              </Link>
            </div>
          ) : info.status === "expired" || info.expired ? (
            <div className="py-6 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
              <div className="mt-3 text-lg font-semibold text-amber-700">
                Délai expiré
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Le délai de confirmation est dépassé. Votre réservation a été automatiquement annulée.
              </div>
              {info.reservation && (
                <div className="mt-4 bg-amber-50 rounded-lg p-4 text-left">
                  <div className="font-semibold text-slate-900">
                    {info.reservation.establishment_name}
                  </div>
                  <div className="text-sm text-slate-500 mt-1">
                    Réservation annulée
                  </div>
                </div>
              )}
              <Link to="/">
                <Button className="mt-4 w-full">
                  Faire une nouvelle réservation
                </Button>
              </Link>
            </div>
          ) : info.status === "cancelled" ? (
            <div className="py-6 text-center">
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <div className="mt-3 text-lg font-semibold text-red-700">
                Réservation annulée
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Cette réservation a été annulée.
              </div>
              <Link to="/">
                <Button className="mt-4 w-full">
                  Faire une nouvelle réservation
                </Button>
              </Link>
            </div>
          ) : (
            <>
              {/* Pending - Show confirmation form */}
              {info.reservation && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                  <div className="text-lg font-semibold text-slate-900">
                    {info.reservation.establishment_name}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <CalendarCheck className="h-4 w-4 text-slate-400" />
                    {formatDate(info.reservation.starts_at)}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Clock className="h-4 w-4 text-slate-400" />
                    {formatTime(info.reservation.starts_at)}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <Users className="h-4 w-4 text-slate-400" />
                    {info.reservation.party_size} personne{info.reservation.party_size > 1 ? "s" : ""}
                  </div>

                  {info.reservation.address && (
                    <div className="flex items-start gap-2 text-sm text-slate-700">
                      <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div>{info.reservation.address}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <strong>Important :</strong> Vous avez 1 heure pour confirmer votre présence.
                    Sans confirmation, votre réservation sera automatiquement annulée.
                  </div>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full gap-2 bg-amber-600 hover:bg-amber-700"
                onClick={confirmBooking}
                disabled={confirming}
              >
                {confirming ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Je confirme ma présence
              </Button>

              <div className="text-[11px] text-center text-slate-500">
                En confirmant, vous vous engagez à vous présenter à l'heure indiquée.
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
