/**
 * MyUserQRPage - Standalone page for user QR code
 *
 * Features:
 * - Full-screen QR code display optimized for scanning
 * - Used by wallet pass (link in pass QR code)
 * - Auto-login redirect if not authenticated
 * - Optimized for mobile (no header, minimal UI)
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, LogIn, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ProfileQRCode } from "@/components/profile/ProfileQRCode";
import { isAuthed, AUTH_CHANGED_EVENT } from "@/lib/auth";
import { getUserProfile } from "@/lib/userData";
import { AuthModalV2 } from "@/components/AuthModalV2";

export default function MyUserQRPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [authed, setAuthed] = useState(isAuthed());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    const onAuthChange = () => setAuthed(isAuthed());
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChange);
  }, []);

  // Show auth modal if not authenticated
  useEffect(() => {
    if (!authed) {
      setAuthModalOpen(true);
    }
  }, [authed]);

  // Handle back navigation
  const handleBack = () => {
    // If there's a return URL, go there
    const returnUrl = searchParams.get("return");
    if (returnUrl) {
      navigate(returnUrl);
    } else {
      navigate("/profil");
    }
  };

  // Not authenticated view
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-[#a3001d]/10 flex items-center justify-center mb-6">
          <QrCode className="h-8 w-8 text-[#a3001d]" />
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">Mon QR Code</h1>
        <p className="text-slate-500 text-center mb-8 max-w-xs">
          Connectez-vous pour accéder à votre QR code personnel Sortir Au Maroc
        </p>

        <Button
          onClick={() => setAuthModalOpen(true)}
          className="bg-[#a3001d] hover:bg-[#8a0019] gap-2"
        >
          <LogIn className="h-4 w-4" />
          Se connecter
        </Button>

        <button
          onClick={handleBack}
          className="mt-6 text-sm text-slate-500 hover:text-slate-700"
        >
          Retour
        </button>

        <AuthModalV2
          isOpen={authModalOpen}
          onClose={() => {
            setAuthModalOpen(false);
            if (!authed) {
              handleBack();
            }
          }}
          onAuthed={() => {
            setAuthed(true);
            setAuthModalOpen(false);
          }}
        />
      </div>
    );
  }

  // Check profile completeness
  const profile = getUserProfile();
  const isProfileComplete =
    !!profile.firstName?.trim() &&
    !!profile.lastName?.trim() &&
    !!profile.date_of_birth?.trim() &&
    !!profile.city?.trim();

  // Profile incomplete — redirect to profile info tab
  if (!isProfileComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center p-6">
        <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-6">
          <QrCode className="h-8 w-8 text-amber-600" />
        </div>

        <h1 className="text-2xl font-bold text-center mb-2">Profil incomplet</h1>
        <p className="text-slate-500 text-center mb-8 max-w-xs">
          Veuillez compléter vos informations de profil pour accéder à votre QR code personnel.
        </p>

        <Button
          onClick={() => navigate("/profil?tab=infos")}
          className="bg-[#a3001d] hover:bg-[#8a0019] gap-2"
        >
          Compléter mon profil
        </Button>

        <button
          onClick={handleBack}
          className="mt-6 text-sm text-slate-500 hover:text-slate-700"
        >
          Retour
        </button>
      </div>
    );
  }

  // Authenticated view - Full screen QR
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Minimal header */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="text-sm font-medium">Retour</span>
          </button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#a3001d] flex items-center justify-center">
              <span className="text-white text-xs font-bold">S</span>
            </div>
            <span className="font-semibold text-sm">Sortir Au Maroc</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <ProfileQRCode
            size={280}
            showTimer
            allowFullscreen
            className="shadow-lg"
          />

          {/* Instructions */}
          <p className="text-center text-sm text-slate-500 mt-6">
            Présentez ce QR code au personnel de l'établissement
            pour vous identifier
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 p-4">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-xs text-slate-400">
            Ce QR code change toutes les 30 secondes pour votre sécurité
          </p>
        </div>
      </footer>
    </div>
  );
}
