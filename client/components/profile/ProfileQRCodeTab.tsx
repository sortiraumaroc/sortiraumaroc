/**
 * ProfileQRCodeTab Component
 * Tab content for the QR code section in user profile
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Smartphone, Wallet, Info, Loader2, UserCircle } from "lucide-react";

import { ProfileQRCode } from "@/components/profile/ProfileQRCode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useConsumerQR } from "@/hooks/useConsumerQR";
import { getUserProfile } from "@/lib/userData";
import {
  handleAddUserToAppleWallet,
  handleAddUserToGoogleWallet,
  type UserPassGenerationRequest,
} from "@/lib/walletService";

interface ProfileQRCodeTabProps {
  /** Callback when wallet buttons are clicked */
  onAddToWallet?: (type: "apple" | "google") => void;
}

export function ProfileQRCodeTab({ onAddToWallet }: ProfileQRCodeTabProps) {
  const [, setSearchParams] = useSearchParams();
  const { qrData } = useConsumerQR();
  const [loadingApple, setLoadingApple] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  // Check if profile is complete (required: firstName, lastName, date_of_birth, city)
  const profile = getUserProfile();
  const missingFields: string[] = [];
  if (!profile.firstName?.trim()) missingFields.push("Prénom");
  if (!profile.lastName?.trim()) missingFields.push("Nom");
  if (!profile.date_of_birth?.trim()) missingFields.push("Date de naissance");
  if (!profile.city?.trim()) missingFields.push("Ville");
  const isProfileComplete = missingFields.length === 0;

  // If profile is incomplete, show a message instead of the QR code
  if (!isProfileComplete) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mb-4">
                <UserCircle className="h-8 w-8 text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">
                Complétez votre profil
              </h3>
              <p className="text-sm text-slate-600 mb-4 max-w-sm">
                Pour générer votre QR code personnel, veuillez d'abord remplir
                vos informations de profil.
              </p>

              {/* Missing fields */}
              <div className="w-full max-w-xs mb-6">
                <p className="text-xs font-medium text-slate-500 mb-2">Champs manquants :</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {missingFields.map((field) => (
                    <span
                      key={field}
                      className="px-2.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200"
                    >
                      {field}
                    </span>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => setSearchParams({ tab: "infos" })}
                className="bg-[#a3001d] hover:bg-[#8a0019] gap-2"
              >
                Compléter mes informations
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Build user data for wallet pass
  const getUserPassData = (): UserPassGenerationRequest | null => {
    const profile = getUserProfile();
    if (!qrData?.userId) return null;

    const userName = [profile.firstName, profile.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || qrData.userName || "Membre SAM";

    return {
      userId: qrData.userId,
      userName,
      userEmail: profile.email || undefined,
      userPhone: profile.contact || undefined,
      memberSince: new Date().toISOString(),
      reliabilityLevel: "Membre",
      reservationsCount: 0,
    };
  };

  const handleAppleWallet = async () => {
    onAddToWallet?.("apple");

    const passData = getUserPassData();
    if (!passData) {
      alert("Impossible de récupérer vos informations. Veuillez vous reconnecter.");
      return;
    }

    setLoadingApple(true);
    try {
      await handleAddUserToAppleWallet(passData);
    } finally {
      setLoadingApple(false);
    }
  };

  const handleGoogleWallet = async () => {
    onAddToWallet?.("google");

    const passData = getUserPassData();
    if (!passData) {
      alert("Impossible de récupérer vos informations. Veuillez vous reconnecter.");
      return;
    }

    setLoadingGoogle(true);
    try {
      await handleAddUserToGoogleWallet(passData);
    } finally {
      setLoadingGoogle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Main QR Code */}
      <ProfileQRCode size={240} showTimer allowFullscreen />

      {/* Wallet Integration */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Wallet className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <h3 className="font-semibold">Ajouter au Wallet</h3>
              <p className="text-sm text-slate-500">
                Accédez rapidement à votre QR code
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="outline"
              className="h-auto py-3 justify-start gap-3"
              onClick={handleAppleWallet}
              disabled={loadingApple || !qrData}
            >
              {loadingApple ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
              )}
              <div className="text-left">
                <div className="text-xs text-slate-500">Ajouter à</div>
                <div className="font-semibold">Apple Wallet</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-3 justify-start gap-3"
              onClick={handleGoogleWallet}
              disabled={loadingGoogle || !qrData}
            >
              {loadingGoogle ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-6 w-6"
                  fill="currentColor"
                >
                  <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z" />
                </svg>
              )}
              <div className="text-left">
                <div className="text-xs text-slate-500">Ajouter à</div>
                <div className="font-semibold">Google Wallet</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Info Section */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Comment ça marche ?</p>
              <ul className="space-y-1 text-blue-700">
                <li>
                  • Votre QR code personnel change toutes les 30 secondes pour
                  votre sécurité
                </li>
                <li>
                  • Présentez-le au personnel de l'établissement pour vous
                  identifier
                </li>
                <li>
                  • Ajoutez-le à votre Wallet pour un accès rapide sans ouvrir
                  l'application
                </li>
                <li>
                  • En cas de problème, vous pouvez régénérer un nouveau QR code
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile App Promotion */}
      <Card className="bg-gradient-to-r from-[#a3001d] to-[#c9002e] text-white">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Smartphone className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg">
                Téléchargez l'app Sortir Au Maroc
              </h3>
              <p className="text-white/80 text-sm">
                Accédez à votre QR code même hors ligne
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="bg-white text-[#a3001d] hover:bg-white/90"
              onClick={() => window.open("https://apps.apple.com", "_blank")}
            >
              App Store
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="bg-white text-[#a3001d] hover:bg-white/90"
              onClick={() => window.open("https://play.google.com", "_blank")}
            >
              Google Play
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
