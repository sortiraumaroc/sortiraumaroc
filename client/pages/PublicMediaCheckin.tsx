import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, MapPin, QrCode, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type CheckinInfo = {
  ok: true;
  expired: boolean;
  confirmed: boolean;
  confirmed_at: string | null;
  job: {
    id: string | null;
    title: string | null;
    status: string | null;
  };
  establishment: {
    name: string | null;
    city: string | null;
    address: string | null;
  };
};

type ConfirmResult = {
  ok: true;
  already_confirmed: boolean;
  confirmed_at: string;
  job: {
    id: string;
    title: string | null;
    status: string;
    establishment_name: string | null;
    establishment_city: string | null;
  };
};

export default function PublicMediaCheckin() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<CheckinInfo | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(
    null,
  );

  useEffect(() => {
    if (!token) {
      setError("Token manquant");
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      try {
        const res = await fetch(
          `/api/media/checkin/${encodeURIComponent(token)}`,
        );
        const payload = await res.json();
        if (!res.ok) {
          setError(payload?.error ?? `Erreur ${res.status}`);
        } else {
          setInfo(payload as CheckinInfo);
        }
      } catch (e) {
        setError("Erreur de connexion");
      } finally {
        setLoading(false);
      }
    };

    void fetchInfo();
  }, [token]);

  const confirmCheckin = async () => {
    if (!token) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/media/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await res.json();
      if (!res.ok) {
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

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("fr-FR");
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <QrCode className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-xl text-slate-900">
            Check-in MEDIA FACTORY
          </CardTitle>
          <CardDescription>Validation de présence sur site</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <div className="mt-2 text-sm text-slate-600">
                Vérification en cours…
              </div>
            </div>
          ) : error ? (
            <div className="py-6 text-center">
              <XCircle className="h-12 w-12 mx-auto text-red-500" />
              <div className="mt-3 text-lg font-semibold text-red-700">
                Erreur
              </div>
              <div className="mt-1 text-sm text-slate-600">{error}</div>
            </div>
          ) : confirmResult ? (
            <div className="py-6 text-center">
              <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
              <div className="mt-4 text-xl font-bold text-green-700">
                {confirmResult.already_confirmed
                  ? "Déjà confirmé"
                  : "Check-in réussi !"}
              </div>
              <div className="mt-2 text-sm text-slate-700">
                {confirmResult.job?.title ?? "Production media"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {confirmResult.job?.establishment_name}
                {confirmResult.job?.establishment_city
                  ? ` · ${confirmResult.job.establishment_city}`
                  : ""}
              </div>
              <div className="mt-4 text-xs text-slate-500">
                Confirmé le {formatDate(confirmResult.confirmed_at)}
              </div>
            </div>
          ) : info ? (
            <>
              {info.expired ? (
                <div className="py-6 text-center">
                  <XCircle className="h-12 w-12 mx-auto text-amber-500" />
                  <div className="mt-3 text-lg font-semibold text-amber-700">
                    Token expiré
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Ce lien de check-in n'est plus valide.
                  </div>
                </div>
              ) : info.confirmed ? (
                <div className="py-6 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
                  <div className="mt-3 text-lg font-semibold text-green-700">
                    Déjà confirmé
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    Check-in validé le {formatDate(info.confirmed_at)}
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                    <div className="text-sm font-semibold text-slate-900">
                      {info.job?.title ?? "Production media"}
                    </div>
                    {info.establishment?.name ? (
                      <div className="flex items-start gap-2 text-sm text-slate-700">
                        <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                        <div>
                          <div>{info.establishment.name}</div>
                          {info.establishment.city ? (
                            <div className="text-xs text-slate-500">
                              {info.establishment.city}
                            </div>
                          ) : null}
                          {info.establishment.address ? (
                            <div className="text-xs text-slate-500">
                              {info.establishment.address}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <Button
                    size="lg"
                    className="w-full gap-2"
                    onClick={confirmCheckin}
                    disabled={confirming}
                  >
                    {confirming ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-5 w-5" />
                    )}
                    Confirmer ma présence
                  </Button>

                  <div className="text-[11px] text-center text-slate-500">
                    En confirmant, vous validez votre arrivée sur le lieu du
                    shooting.
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="py-6 text-center text-sm text-slate-600">
              Aucune information disponible.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
