/**
 * PublicGiftsSection — Section "Cadeaux sam.ma" client (spec 4.6)
 *
 * Liste les cadeaux sam.ma disponibles en mode "premier arrivé".
 * Bouton "Récupérer" pour charger le cadeau dans le QR du client.
 */

import React from "react";
import { useAvailableGifts, useClaimGift } from "@/hooks/useLoyaltyV2";

export function PublicGiftsSection() {
  const { data, loading, error, refresh } = useAvailableGifts();
  const { claim, loading: claiming } = useClaimGift();

  const handleClaim = async (giftId: string) => {
    const result = await claim(giftId);
    if (result.ok) {
      refresh();
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Chargement des cadeaux...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-400">{error}</div>;
  }

  const gifts = data?.gifts ?? [];

  if (gifts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        Aucun cadeau disponible pour le moment
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Cadeaux sam.ma</h3>
      <p className="text-sm text-gray-500">
        Des cadeaux offerts par les meilleurs établissements. Premier arrivé, premier servi !
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {gifts.map((gift) => (
          <div
            key={gift.id}
            className="p-4 rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {gift.establishment_logo && (
                  <img
                    src={gift.establishment_logo}
                    alt=""
                    className="w-10 h-10 rounded-lg object-contain bg-gray-50"
                  />
                )}
                <div>
                  <h4 className="font-semibold text-gray-900">{gift.description}</h4>
                  <p className="text-sm text-gray-500">{gift.establishment_name}</p>
                </div>
              </div>
            </div>

            {/* Valeur */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg font-bold text-primary">
                {gift.gift_type === "percentage_discount"
                  ? `-${gift.value}%`
                  : gift.gift_type === "fixed_discount"
                  ? `-${gift.value} MAD`
                  : "Offert"}
              </span>
            </div>

            {/* Conditions */}
            {gift.conditions && (
              <p className="text-xs text-gray-400 mb-2">{gift.conditions}</p>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  {gift.remaining} restant{gift.remaining > 1 ? "s" : ""}
                </span>
                <span className="text-gray-300">|</span>
                <span>
                  Exp. {new Date(gift.validity_end).toLocaleDateString("fr-FR")}
                </span>
              </div>

              <button
                onClick={() => handleClaim(gift.id)}
                disabled={claiming}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium
                  hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {claiming ? "..." : "Récupérer"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default PublicGiftsSection;
