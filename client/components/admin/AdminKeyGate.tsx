import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AdminApiError, adminHealth, adminLogin, adminLogout, clearAdminSessionToken, loadAdminSessionToken, saveAdminSessionToken } from "@/lib/adminApi";

export type AdminKeyGateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready" }
  | { status: "error"; message: string };


// Cache session validation to avoid flickering during navigation
let cachedSessionValid: boolean | null = null;
let cachedSessionTimestamp = 0;
const SESSION_CACHE_TTL = 30000; // 30 seconds

export function AdminKeyGate(props: {
  children: (ctx: { adminKey?: string; signOut: () => void }) => React.ReactNode;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [peekPassword, setPeekPassword] = useState(false);
  const hasCheckedRef = useRef(false);

  // If we have a cached valid session, start as "ready" to prevent flicker
  const hasToken = !!loadAdminSessionToken();
  const cachedValid = cachedSessionValid === true && (Date.now() - cachedSessionTimestamp) < SESSION_CACHE_TTL;
  const initialState: AdminKeyGateState = hasToken && cachedValid ? { status: "ready" } : { status: "checking" };

  const [state, setState] = useState<AdminKeyGateState>(initialState);

  const canLogin = useMemo(() => password.trim().length >= 1, [password]);

  const setError = (message: string) => setState({ status: "error", message });

  const signOut = async () => {
    try {
      await adminLogout();
    } catch {
      // ignore
    }

    // Clear cache on sign out
    cachedSessionValid = null;
    cachedSessionTimestamp = 0;

    clearAdminSessionToken();
    setUsername("");
    setPassword("");
    setState({ status: "idle" });
  };

  const checkSession = async (opts?: { reportError?: boolean }) => {
    // Don't change state to "checking" if we're already "ready" (background revalidation)
    if (state.status !== "ready") {
      setState({ status: "checking" });
    }
    try {
      const res = await adminHealth();
      if (res.ok === true) {
        // Update cache
        cachedSessionValid = true;
        cachedSessionTimestamp = Date.now();
        // Save the session token if returned (for decoding user info in UI)
        if (res.session_token) saveAdminSessionToken(res.session_token);
        setState({ status: "ready" });
        return true;
      }
      // Invalidate cache on failure
      cachedSessionValid = false;
      cachedSessionTimestamp = 0;
      setState({ status: "idle" });
      if (opts?.reportError) setError("Connexion refusée (session invalide)");
      return false;
    } catch (e) {
      // Invalidate cache on error
      cachedSessionValid = false;
      cachedSessionTimestamp = 0;
      setState({ status: "idle" });
      if (opts?.reportError) {
        if (e instanceof AdminApiError) setError(e.message);
        else setError("Connexion impossible (session non créée)");
      }
      return false;
    }
  };

  const login = async (override?: { username?: string; password: string }) => {
    const u = (override?.username ?? username).trim();
    const p = (override?.password ?? password).trim();
    if (!p) return;

    setState({ status: "checking" });
    try {
      const res = await adminLogin({ username: u, password: p });
      if (res.session_token) saveAdminSessionToken(res.session_token);
      const ok = await checkSession({ reportError: true });
      // After successful login, redirect to dashboard if not already there
      if (ok && location.pathname !== "/admin") {
        navigate("/admin", { replace: true });
      }
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    }
  };

  useEffect(() => {
    // Skip session check if we started as "ready" from cache
    if (state.status === "ready" && hasCheckedRef.current === false) {
      hasCheckedRef.current = true;
      // Do a background revalidation without changing UI state
      void checkSession();
      return;
    }

    // Only check if we haven't already
    if (!hasCheckedRef.current) {
      hasCheckedRef.current = true;
      void checkSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === "ready") {
    return <>{props.children({ adminKey: undefined, signOut: () => void signOut() })}</>;
  }

  // Show a loading spinner during initial session check (before showing login form)
  if (state.status === "checking" && !username && !password) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Vérification de la session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-10 md:py-14 relative">
      <div className="absolute top-4 right-4">
        <Button variant="outline" size="sm" asChild className="gap-2 bg-white/80 backdrop-blur">
          <Link to="/" aria-label="Revenir à l'accueil">
            <ArrowLeft className="h-4 w-4" />
            Revenir à l'accueil
          </Link>
        </Button>
      </div>

      <div className="max-w-xl mx-auto">
        {/* Logo et tagline */}
        <div className="flex flex-col items-center mb-6">
          <Link to="/" aria-label="Retour à l'accueil Sortir Au Maroc">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc4b847e82d5c43669264291d1a767312?format=webp&width=800"
              alt="Sortir Au Maroc"
              className="h-20 w-auto"
              loading="lazy"
            />
          </Link>
          <p className="mt-2 text-sm text-black font-bold" style={{ fontFamily: "Poppins, sans-serif" }}>La plateforme de réservation en ligne</p>
        </div>

        <div className="rounded-lg border-2 border-slate-200 bg-white p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Tableau de bord</h1>
            <div className="text-sm text-slate-600">Connectez-vous pour gérer la plateforme Sortir Au Maroc.</div>
          </div>
        </div>

        <div className="mt-6">
          <label className="text-sm font-semibold text-foreground" htmlFor="admin-username">
            Identifiant
          </label>
          <div className="mt-2">
            <Input
              id="admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Votre identifiant"
              autoComplete="username"
              className="!bg-white border-red-200 focus:border-red-300 focus:ring-red-100 autofill:!bg-white autofill:shadow-[inset_0_0_0px_1000px_white]"
            />
          </div>

          <label className="mt-4 block text-sm font-semibold text-foreground" htmlFor="admin-password">
            Mot de passe
          </label>
          <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="relative w-full">
              <Input
                id="admin-password"
                type={peekPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Votre mot de passe"
                autoComplete="current-password"
                className="pr-11 !bg-white border-red-200 focus:border-red-300 focus:ring-red-100 autofill:!bg-white autofill:shadow-[inset_0_0_0px_1000px_white]"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-slate-600 hover:text-slate-900"
                aria-label={peekPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                title={peekPassword ? "Masquer" : "Afficher"}
                onPointerDown={(e) => {
                  e.preventDefault();
                  setPeekPassword(true);
                }}
                onPointerUp={() => setPeekPassword(false)}
                onPointerCancel={() => setPeekPassword(false)}
                onPointerLeave={() => setPeekPassword(false)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    setPeekPassword(true);
                  }
                }}
                onKeyUp={() => setPeekPassword(false)}
                onBlur={() => setPeekPassword(false)}
              >
                <Eye className={peekPassword ? "opacity-100" : "opacity-70"} />
              </Button>
            </div>

            <Button className="gap-2 sm:w-auto" disabled={!canLogin || state.status === "checking"} onClick={() => void login()}>
              <LogIn />
              {state.status === "checking" ? "Connexion..." : "Entrer"}
            </Button>
          </div>

          <div className={cn("mt-4 text-xs text-slate-500", state.status === "checking" && "opacity-70")}>
            Votre session est sécurisée (cookie httpOnly) et ne stocke pas votre mot de passe dans le navigateur.
          </div>

          {state.status === "error" && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {state.message}
            </div>
          )}

          <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
            <Button variant="outline" className="gap-2 w-fit" onClick={() => void signOut()}>
              <LogOut className="w-4 h-4" />
              Effacer
            </Button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
