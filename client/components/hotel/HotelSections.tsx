import { Bath, Coffee, Dumbbell, FlameKindling, Globe, MapPin, ParkingCircle, Phone, ShieldCheck, Sparkles, Star, Tv, Users, Waves } from "lucide-react";

export type HotelFact = { label: string; value: string; icon: React.ComponentType<{ className?: string }> };
export type HotelAmenity = { label: string; icon: React.ComponentType<{ className?: string }> };

export function RatingStars({ rating, className }: { rating: number; className?: string }) {
  return (
    <div className={className ?? ""}>
      <div className="flex items-center gap-1">
        {[...Array(5)].map((_, i) => (
          <Star key={i} className={`w-4 h-4 ${i < Math.floor(rating) ? "fill-yellow-400 text-yellow-400" : "text-slate-300"}`} />
        ))}
      </div>
    </div>
  );
}

export function FactsGrid({ facts }: { facts: HotelFact[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {facts.map((f) => (
        <div key={f.label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#a3001d]/10 grid place-items-center flex-shrink-0">
              <f.icon className="h-5 w-5 text-[#a3001d]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-500">{f.label}</div>
              <div className="mt-1 text-sm font-bold text-slate-900 leading-snug">{f.value}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AmenitiesGrid({ amenities }: { amenities: HotelAmenity[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {amenities.map((a) => (
        <div key={a.label} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-50 grid place-items-center flex-shrink-0">
              <a.icon className="h-5 w-5 text-slate-700" />
            </div>
            <div className="text-sm font-semibold text-slate-900 leading-snug">{a.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export type RoomType = {
  name: string;
  occupancy: string;
  highlights: string[];
  priceFromMad?: number;
};

function formatMad(n: number): string {
  return new Intl.NumberFormat("fr-MA").format(Math.round(n));
}

export function RoomsList({ rooms }: { rooms: RoomType[] }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {rooms.map((r) => (
        <div key={r.name} className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-base sm:text-lg font-bold text-slate-900">{r.name}</div>
              <div className="mt-1 text-sm text-slate-600">{r.occupancy}</div>
            </div>
            {typeof r.priceFromMad === "number" ? (
              <div className="text-end">
                <div className="text-xs text-slate-500">À partir de</div>
                <div className="text-base font-extrabold text-[#a3001d] tabular-nums whitespace-nowrap">{formatMad(r.priceFromMad)} MAD</div>
                <div className="text-[11px] text-slate-500">/ nuit (indicatif)</div>
              </div>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {r.highlights.map((h) => (
              <li key={h} className="flex items-start gap-2">
                <span className="mt-0.5 text-slate-500">•</span>
                <span className="min-w-0">{h}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export const hotelAmenityPresets = {
  wifi: { label: "Wi‑Fi gratuit", icon: Globe },
  pool: { label: "Piscine extérieure", icon: Waves },
  spa: { label: "Spa & bien‑être", icon: Sparkles },
  gym: { label: "Salle de sport", icon: Dumbbell },
  casino: { label: "Casino sur place", icon: FlameKindling },
  restaurant: { label: "Restaurants & bars", icon: Coffee },
  parking: { label: "Parking", icon: ParkingCircle },
  meeting: { label: "Salles de réunion", icon: Users },
  security: { label: "Sécurité 24/7", icon: ShieldCheck },
  rooms: { label: "Chambres climatisées", icon: Tv },
  bath: { label: "Salle de bain privée", icon: Bath },
  location: { label: "Vue sur la baie", icon: MapPin },
} satisfies Record<string, HotelAmenity>;

export const hotelFactPresets = {
  address: { label: "Adresse", icon: MapPin },
  phone: { label: "Téléphone", icon: Phone },
  website: { label: "Site officiel", icon: Globe },
  checkin: { label: "Arrivée / Départ", icon: ClockIcon },
} as const;

function ClockIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>;
}
