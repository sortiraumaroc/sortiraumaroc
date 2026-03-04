import type { ProWizardData } from "../../../../lib/pro/types";
import { MOROCCAN_CITIES, CITY_TO_REGION } from "../proWizardConstants";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
};

export function ProWizardStepLocation({ data, onChange }: Props) {
  const handleCityChange = (city: string) => {
    const region = CITY_TO_REGION[city] ?? "";
    onChange({ city, region });
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Localisation</h3>
        <p className="mt-1 text-sm text-gray-500">
          Indiquez où se trouve votre établissement.
        </p>
      </div>

      {/* City */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Ville <span className="text-red-500">*</span>
        </label>
        <select
          value={data.city ?? ""}
          onChange={(e) => handleCityChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
        >
          <option value="">Sélectionner une ville</option>
          {MOROCCAN_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Region (auto-filled) */}
      {data.region && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Région
          </label>
          <input
            type="text"
            value={data.region ?? ""}
            readOnly
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            Remplie automatiquement selon la ville
          </p>
        </div>
      )}

      {/* Neighborhood */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Quartier
        </label>
        <input
          type="text"
          value={data.neighborhood ?? ""}
          onChange={(e) => onChange({ neighborhood: e.target.value })}
          placeholder="Ex : Guéliz, Hivernage, Hay Riad..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={100}
        />
      </div>

      {/* Address */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Adresse complète <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.address ?? ""}
          onChange={(e) => onChange({ address: e.target.value })}
          placeholder="Ex : 45, Avenue Mohammed V"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={300}
        />
      </div>

      {/* Postal code */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Code postal
        </label>
        <input
          type="text"
          value={data.postal_code ?? ""}
          onChange={(e) => onChange({ postal_code: e.target.value })}
          placeholder="Ex : 40000"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={10}
        />
      </div>
    </div>
  );
}
