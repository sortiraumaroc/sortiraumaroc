import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Users } from "lucide-react";

import { useI18n } from "@/lib/i18n";
import { Header } from "@/components/Header";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { AUTH_CHANGED_EVENT, isAuthed } from "@/lib/auth";

import { ReferralDashboard } from "@/components/referral/ReferralDashboard";
import { ReferralApplyForm } from "@/components/referral/ReferralApplyForm";
import { getReferralPartnerMe } from "@/lib/referral/api";

export default function Parrainage() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [authed, setAuthed] = useState(isAuthed());
  const [authOpen, setAuthOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasPartnerAccount, setHasPartnerAccount] = useState<boolean | null>(null);
  const [showApplyForm, setShowApplyForm] = useState(false);

  // Listen for auth changes
  useEffect(() => {
    const onAuth = () => setAuthed(isAuthed());
    window.addEventListener(AUTH_CHANGED_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuth);
  }, []);

  // Check if user has a referral partner account
  useEffect(() => {
    if (!authed) {
      setLoading(false);
      setHasPartnerAccount(null);
      return;
    }

    const checkPartnerAccount = async () => {
      try {
        setLoading(true);
        const result = await getReferralPartnerMe();
        setHasPartnerAccount(result.partner !== null);
      } catch (error) {
        console.error("Error checking partner account:", error);
        setHasPartnerAccount(false);
      } finally {
        setLoading(false);
      }
    };

    checkPartnerAccount();
  }, [authed]);

  // Handle successful application
  const handleApplySuccess = () => {
    setShowApplyForm(false);
    setHasPartnerAccount(true);
  };

  return (
    <>
      <Header />

      <main className="min-h-screen bg-gray-50">
        {/* Hero section for non-authenticated users */}
        {!authed && (
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="container mx-auto px-4 py-16 md:py-24">
              <div className="max-w-3xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-6">
                  <Gift className="w-5 h-5" />
                  <span className="font-medium">Programme de parrainage</span>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                  Gagnez de l'argent en partageant vos bonnes adresses
                </h1>

                <p className="text-xl text-gray-600 mb-8">
                  Devenez parrain et touchez une commission sur chaque réservation
                  effectuée par vos filleuls. Simple, transparent et sans limite !
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => setAuthOpen(true)}
                    className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Users className="w-5 h-5" />
                    Devenir parrain
                  </button>
                </div>

                {/* Benefits */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                      <span className="text-2xl">💰</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Commission sur chaque réservation</h3>
                    <p className="text-gray-600 text-sm">
                      Recevez une commission pour chaque réservation confirmée de vos filleuls
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                      <span className="text-2xl">🔗</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Lien permanent</h3>
                    <p className="text-gray-600 text-sm">
                      Vos filleuls restent liés à vous à vie, vous touchez sur toutes leurs futures réservations
                    </p>
                  </div>

                  <div className="bg-white rounded-xl p-6 shadow-sm">
                    <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4 mx-auto">
                      <span className="text-2xl">📊</span>
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">Suivi en temps réel</h3>
                    <p className="text-gray-600 text-sm">
                      Tableau de bord complet pour suivre vos filleuls, commissions et paiements
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content for authenticated users */}
        {authed && (
          <div className="container mx-auto px-4 py-8">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : showApplyForm ? (
              <div className="max-w-2xl mx-auto">
                <ReferralApplyForm
                  onSuccess={handleApplySuccess}
                  onCancel={() => setShowApplyForm(false)}
                />
              </div>
            ) : hasPartnerAccount ? (
              <ReferralDashboard />
            ) : (
              /* User is authenticated but doesn't have a partner account yet */
              <div className="max-w-2xl mx-auto text-center py-12">
                <div className="bg-white rounded-2xl p-8 shadow-sm">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Gift className="w-8 h-8 text-primary" />
                  </div>

                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Rejoignez notre programme de parrainage
                  </h2>

                  <p className="text-gray-600 mb-8">
                    Partagez votre code avec vos proches et gagnez une commission
                    sur chacune de leurs réservations. C'est simple et gratuit !
                  </p>

                  <button
                    onClick={() => setShowApplyForm(true)}
                    className="inline-flex items-center justify-center gap-2 bg-primary text-white px-8 py-4 rounded-xl font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Users className="w-5 h-5" />
                    Faire une demande
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Auth modal */}
      <AuthModalV2
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={() => {
          setAuthOpen(false);
          setAuthed(true);
        }}
      />
    </>
  );
}
