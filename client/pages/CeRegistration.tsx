/**
 * CeRegistration — Employee registration page for CE
 *
 * Route: /ce/:code
 * Shows company info + registration form (or sign-in prompt)
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  LogIn,
  UserPlus,
  ArrowLeft,
} from "lucide-react";
import { isAuthed, getConsumerAccessToken } from "@/lib/auth";
import { consumerSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { AuthModalV2 as AuthModal } from "@/components/AuthModalV2";
import type { RegistrationInfo } from "../../shared/ceTypes";

export default function CeRegistration() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<RegistrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [authed, setAuthed] = useState(isAuthed());

  // Check auth state changes
  useEffect(() => {
    const { data: { subscription } } = consumerSupabase.auth.onAuthStateChange(() => {
      setAuthed(isAuthed());
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fetch registration info (public endpoint)
  useEffect(() => {
    if (!code) return;
    setLoading(true);
    fetch(`/api/ce/registration-info/${encodeURIComponent(code)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.data) {
          setInfo(data.data);
          if (!data.data.valid) setError(data.data.reason ?? "Code invalide");
        } else {
          setError(data.error ?? "Code invalide");
        }
      })
      .catch(() => setError("Impossible de vérifier le code"))
      .finally(() => setLoading(false));
  }, [code]);

  const register = useCallback(async () => {
    if (!code) return;
    setRegistering(true);
    try {
      const token = await getConsumerAccessToken();
      if (!token) {
        setShowAuth(true);
        setRegistering(false);
        return;
      }

      const res = await fetch("/api/ce/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ registration_code: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur d'inscription");

      setRegistered(true);
      toast({ title: "Inscription réussie !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  }, [code]);

  // Auto-register after auth if user just signed in
  useEffect(() => {
    if (authed && showAuth) {
      setShowAuth(false);
      register();
    }
  }, [authed, showAuth, register]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
      </Link>

      {error && !info?.valid ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertTriangle className="h-12 w-12 text-yellow-500" />
            <h2 className="text-lg font-semibold">Code invalide</h2>
            <p className="text-center text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Retour à l'accueil
            </Button>
          </CardContent>
        </Card>
      ) : registered ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h2 className="text-lg font-semibold">Inscription réussie !</h2>
            <p className="text-center text-sm text-muted-foreground">
              Vous êtes maintenant inscrit au programme CE de <strong>{info?.company_name}</strong>.
              {info?.welcome_message && (
                <span className="mt-2 block italic">"{info.welcome_message}"</span>
              )}
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Un gestionnaire validera votre inscription prochainement.
              Vous recevrez une notification dès que ce sera fait.
            </p>
            <div className="flex gap-2 mt-2">
              <Button onClick={() => navigate("/ce/avantages")}>
                Voir les avantages
              </Button>
              <Button variant="outline" onClick={() => navigate("/")}>
                Accueil
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="text-center">
            {info?.company_logo_url ? (
              <img src={info.company_logo_url} alt="" className="mx-auto mb-3 h-16 w-16 rounded-full object-cover" />
            ) : (
              <Building2 className="mx-auto mb-3 h-12 w-12 text-primary" />
            )}
            <CardTitle className="text-xl">{info?.company_name}</CardTitle>
            <CardDescription>
              Programme Comité d'Entreprise
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {info?.welcome_message && (
              <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                {info.welcome_message}
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium">En rejoignant ce programme, vous pourrez :</p>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Bénéficier de réductions exclusives dans les établissements partenaires</li>
                <li>Scanner votre QR code CE pour profiter des avantages</li>
                <li>Suivre votre historique d'utilisation</li>
              </ul>
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3">
            {authed ? (
              <Button className="w-full" onClick={register} disabled={registering}>
                {registering ? (
                  <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-1.5 h-4 w-4" />
                )}
                M'inscrire au programme CE
              </Button>
            ) : (
              <>
                <Button className="w-full" onClick={() => setShowAuth(true)}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Se connecter pour s'inscrire
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Vous devez avoir un compte SAM.ma pour rejoindre le programme.
                </p>
              </>
            )}
          </CardFooter>
        </Card>
      )}

      {showAuth && (
        <AuthModal
          isOpen={showAuth}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}
