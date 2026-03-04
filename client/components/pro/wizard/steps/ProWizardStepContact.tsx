import type { ProWizardData } from "../../../../lib/pro/types";
import { Instagram, Facebook, Youtube } from "lucide-react";

type Props = {
  data: Partial<ProWizardData>;
  onChange: (patch: Partial<ProWizardData>) => void;
};

const PHONE_PREFIXES = [
  { code: "+212", label: "Maroc (+212)" },
  { code: "+33", label: "France (+33)" },
  { code: "+1", label: "USA (+1)" },
];

export function ProWizardStepContact({ data, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Coordonnées & réseaux
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Comment vos clients peuvent-ils vous joindre ?
        </p>
      </div>

      {/* Phone */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Téléphone
        </label>
        <div className="flex gap-2">
          <select
            value={data.phone_country ?? "+212"}
            onChange={(e) => onChange({ phone_country: e.target.value })}
            className="w-32 rounded-lg border border-gray-300 px-2 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          >
            {PHONE_PREFIXES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="tel"
            value={data.phone_national ?? ""}
            onChange={(e) => onChange({ phone_national: e.target.value })}
            placeholder="6XX XXX XXX"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={15}
          />
        </div>
      </div>

      {/* WhatsApp */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          WhatsApp
        </label>
        <div className="flex gap-2">
          <select
            value={data.whatsapp_country ?? "+212"}
            onChange={(e) => onChange({ whatsapp_country: e.target.value })}
            className="w-32 rounded-lg border border-gray-300 px-2 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          >
            {PHONE_PREFIXES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="tel"
            value={data.whatsapp_national ?? ""}
            onChange={(e) => onChange({ whatsapp_national: e.target.value })}
            placeholder="6XX XXX XXX"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={15}
          />
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Email de contact
        </label>
        <input
          type="email"
          value={data.email ?? ""}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="contact@monrestaurant.ma"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={200}
        />
      </div>

      {/* Website */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Site web
        </label>
        <input
          type="url"
          value={data.website ?? ""}
          onChange={(e) => onChange({ website: e.target.value })}
          placeholder="https://www.monrestaurant.ma"
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={300}
        />
      </div>

      {/* Google Maps */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Lien Google Maps
        </label>
        <input
          type="url"
          value={data.google_maps_url ?? ""}
          onChange={(e) => onChange({ google_maps_url: e.target.value })}
          placeholder="https://maps.google.com/..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
          maxLength={500}
        />
      </div>

      {/* Social links */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          Réseaux sociaux
        </label>

        <div className="flex items-center gap-2">
          <Instagram className="h-4 w-4 shrink-0 text-pink-500" />
          <input
            type="text"
            value={data.social_instagram ?? ""}
            onChange={(e) => onChange({ social_instagram: e.target.value })}
            placeholder="@votrecompte ou lien Instagram"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={300}
          />
        </div>

        <div className="flex items-center gap-2">
          <Facebook className="h-4 w-4 shrink-0 text-blue-600" />
          <input
            type="text"
            value={data.social_facebook ?? ""}
            onChange={(e) => onChange({ social_facebook: e.target.value })}
            placeholder="Lien page Facebook"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={300}
          />
        </div>

        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 0010.86 4.46 6.34 6.34 0 001.88-4.52V8.68a8.28 8.28 0 004.84 1.55v-3.5a4.85 4.85 0 01-1.14-.04z" />
          </svg>
          <input
            type="text"
            value={data.social_tiktok ?? ""}
            onChange={(e) => onChange({ social_tiktok: e.target.value })}
            placeholder="@votrecompte TikTok"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={300}
          />
        </div>

        <div className="flex items-center gap-2">
          <Youtube className="h-4 w-4 shrink-0 text-red-600" />
          <input
            type="text"
            value={data.social_youtube ?? ""}
            onChange={(e) => onChange({ social_youtube: e.target.value })}
            placeholder="Lien chaîne YouTube"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#a3001d] focus:outline-none focus:ring-1 focus:ring-[#a3001d]"
            maxLength={300}
          />
        </div>
      </div>
    </div>
  );
}
