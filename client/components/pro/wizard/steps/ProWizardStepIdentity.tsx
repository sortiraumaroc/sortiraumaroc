import type { ProWizardData } from "../../../../lib/pro/types";
import { UNIVERSE_OPTIONS, UNIVERSE_CONFIG, TAG_CONFIG } from "../proWizardConstants";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
};

export function ProWizardStepIdentity({ data, onChange }: Props) {
  const universe = data.universe || "";
  const config = universe ? UNIVERSE_CONFIG[universe] : null;
  const categories = config?.categories ?? [];
  const subcategories =
    data.category && config?.subcategories?.[data.category]
      ? config.subcategories[data.category]
      : [];

  const specialtyOptions: string[] =
    (TAG_CONFIG as Record<string, { specialties?: string[] }>)[universe]
      ?.specialties ?? [];

  const toggleSpecialty = (s: string) => {
    const current = data.specialties ?? [];
    if (current.includes(s)) {
      onChange({ specialties: current.filter((x) => x !== s) });
    } else if (current.length < 5) {
      onChange({ specialties: [...current, s] });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Identité de votre établissement
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Renseignez le nom et le type d'activité de votre établissement.
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Nom de l'établissement <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={data.name ?? ""}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Ex : Le Jardin des Saveurs"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={200}
        />
      </div>

      {/* Universe */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Univers <span className="text-red-500">*</span>
        </label>
        <select
          value={universe}
          onChange={(e) =>
            onChange({
              universe: e.target.value,
              category: "",
              subcategory: "",
              specialties: [],
            })
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
        >
          <option value="">Sélectionner un univers</option>
          {UNIVERSE_OPTIONS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
      </div>

      {/* Category */}
      {categories.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Catégorie <span className="text-red-500">*</span>
          </label>
          <select
            value={data.category ?? ""}
            onChange={(e) =>
              onChange({ category: e.target.value, subcategory: "" })
            }
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          >
            <option value="">Sélectionner une catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Subcategory */}
      {subcategories.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Sous-catégorie
          </label>
          <select
            value={data.subcategory ?? ""}
            onChange={(e) => onChange({ subcategory: e.target.value })}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          >
            <option value="">Sélectionner une sous-catégorie</option>
            {subcategories.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Specialties */}
      {specialtyOptions.length > 0 && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Spécialités
          </label>
          <p className="mb-2 text-xs text-gray-400">
            Sélectionnez jusqu'à 5 spécialités
          </p>
          <div className="flex flex-wrap gap-2">
            {specialtyOptions.map((s) => {
              const isSelected = (data.specialties ?? []).includes(s);
              const isFull = !isSelected && (data.specialties ?? []).length >= 5;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleSpecialty(s)}
                  disabled={isFull}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-[#a3001d] bg-[#a3001d]/10 text-[#a3001d]"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  } ${isFull ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
