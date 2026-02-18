import { useState } from "react";
import type { ProWizardData } from "../../../../lib/pro/types";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
};

const SHORT_MAX = 160;
const LONG_MAX = 2000;

export function ProWizardStepDescription({ data, onChange }: Props) {
  const shortLen = (data.description_short ?? "").length;
  const longLen = (data.description_long ?? "").length;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Description</h3>
        <p className="mt-1 text-sm text-gray-500">
          Décrivez votre établissement pour attirer les clients.
        </p>
      </div>

      {/* Short description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Description courte <span className="text-red-500">*</span>
        </label>
        <p className="mb-1 text-xs text-gray-400">
          Apparaît dans les résultats de recherche
        </p>
        <textarea
          value={data.description_short ?? ""}
          onChange={(e) => onChange({ description_short: e.target.value })}
          placeholder="Ex : Restaurant marocain gastronomique au cœur de la médina de Marrakech..."
          maxLength={SHORT_MAX}
          rows={3}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
        />
        <p
          className={`mt-1 text-right text-xs ${shortLen > SHORT_MAX * 0.9 ? "text-orange-500" : "text-gray-400"}`}
        >
          {shortLen}/{SHORT_MAX}
        </p>
      </div>

      {/* Long description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Description détaillée
        </label>
        <p className="mb-1 text-xs text-gray-400">
          Visible sur la fiche complète de votre établissement
        </p>
        <textarea
          value={data.description_long ?? ""}
          onChange={(e) => onChange({ description_long: e.target.value })}
          placeholder="Décrivez votre ambiance, votre cuisine, vos points forts..."
          maxLength={LONG_MAX}
          rows={6}
          className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
        />
        <p
          className={`mt-1 text-right text-xs ${longLen > LONG_MAX * 0.9 ? "text-orange-500" : "text-gray-400"}`}
        >
          {longLen}/{LONG_MAX}
        </p>
      </div>
    </div>
  );
}
