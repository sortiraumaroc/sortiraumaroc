/**
 * ProfileQRCodeTab Component
 * Tab content for the QR code section in user profile
 */

import { useSearchParams } from "react-router-dom";
import { Info, UserCircle } from "lucide-react";

import { ProfileQRCode } from "@/components/profile/ProfileQRCode";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserProfile } from "@/lib/userData";

interface ProfileQRCodeTabProps {
  /** Callback when wallet buttons are clicked */
  onAddToWallet?: (type: "apple" | "google") => void;
}

export function ProfileQRCodeTab({ onAddToWallet }: ProfileQRCodeTabProps) {
  const [, setSearchParams] = useSearchParams();

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

  return (
    <div className="space-y-6">
      {/* Main QR Code */}
      <ProfileQRCode size={240} showTimer allowFullscreen />


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
                  • Gardez cette page accessible pour un accès rapide
                </li>
                <li>
                  • En cas de problème, vous pouvez régénérer un nouveau QR code
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
