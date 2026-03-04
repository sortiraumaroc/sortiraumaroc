/**
 * LoyaltyBadge — Badge "Programme de fidélité" affiché sur la fiche établissement.
 *
 * Si l'établissement a un programme actif, affiche un badge cliquable.
 * Au clic : encart résumé du programme (tampons, cadeau, conditions) + CTA.
 */

import React, { useState } from "react";
import { useEstablishmentLoyalty } from "@/hooks/useLoyaltyV2";

type Props = {
  establishmentId: string;
};

export function LoyaltyBadge({ establishmentId }: Props) {
  const { data, loading } = useEstablishmentLoyalty(establishmentId);
  const [expanded, setExpanded] = useState(false);

  if (loading || !data || !data.programs || data.programs.length === 0) {
    return null;
  }

  const program = data.programs[0] as Record<string, unknown>;
  const myCard = data.my_cards?.[0] as Record<string, unknown> | undefined;

  return (
    <div className="relative">
      {/* Badge */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
          bg-amber-50 text-amber-700 border border-amber-200
          text-sm font-medium hover:bg-amber-100 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
        Programme de fidélité
        <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Encart résumé */}
      {expanded && (
        <div className="mt-2 p-4 rounded-xl bg-white border border-gray-200 shadow-sm max-w-sm">
          <h4 className="font-semibold text-gray-900 mb-1">
            {String(program.name ?? "Programme de fidélité")}
          </h4>

          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span className="inline-flex items-center gap-1">
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {String(program.stamps_required ?? 10)} tampons
            </span>
            <span className="text-gray-300">|</span>
            <span>{String(program.reward_description ?? "Cadeau")}</span>
          </div>

          {program.stamp_conditional && (
            <p className="text-xs text-gray-500 mb-2">
              Montant minimum par visite : {String(program.stamp_minimum_amount ?? 0)}{" "}
              {String(program.stamp_minimum_currency ?? "MAD")}
            </p>
          )}

          {program.conditions && (
            <p className="text-xs text-gray-400 mb-3">{String(program.conditions)}</p>
          )}

          {myCard ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-100 rounded-full h-2">
                <div
                  className="bg-amber-500 h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (Number(myCard.stamps_count ?? 0) /
                        Number(program.stamps_required ?? 10)) *
                        100
                    )}%`,
                  }}
                />
              </div>
              <span className="text-xs text-gray-600 font-medium whitespace-nowrap">
                {String(myCard.stamps_count ?? 0)}/{String(program.stamps_required ?? 10)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-primary font-medium">
              Commencez à cumuler vos tampons dès votre prochaine visite !
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default LoyaltyBadge;
