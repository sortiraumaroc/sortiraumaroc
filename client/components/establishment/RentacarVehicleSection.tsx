import { useState, useEffect, useMemo } from "react";
import {
  Car,
  Fuel,
  Users,
  ChevronRight,
  Loader2,
  Gauge,
  Zap,
  Truck,
  Crown,
  Bike,
  Wind,
  Mountain,
  Cog,
  DoorOpen,
  Snowflake,
} from "lucide-react";
import { Link } from "react-router-dom";
import { searchRentalVehicles } from "@/lib/rentalApi";
import type { RentalVehicle } from "@shared/rentalTypes";
import { cn } from "@/lib/utils";

// =============================================================================
// Category config
// =============================================================================

type CategoryConfig = {
  label: string;
  icon: typeof Car;
  color: string;
  bg: string;
};

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  citadine:   { label: "Citadine",   icon: Car,      color: "text-blue-700",    bg: "bg-blue-50" },
  compacte:   { label: "Compacte",   icon: Car,      color: "text-indigo-700",  bg: "bg-indigo-50" },
  berline:    { label: "Berline",    icon: Car,      color: "text-slate-700",   bg: "bg-slate-100" },
  suv:        { label: "SUV",        icon: Mountain, color: "text-emerald-700", bg: "bg-emerald-50" },
  "4x4":      { label: "4x4",        icon: Mountain, color: "text-orange-700",  bg: "bg-orange-50" },
  monospace:  { label: "Monospace",  icon: Users,    color: "text-cyan-700",    bg: "bg-cyan-50" },
  utilitaire: { label: "Utilitaire", icon: Truck,    color: "text-amber-700",   bg: "bg-amber-50" },
  luxe:       { label: "Luxe",       icon: Crown,    color: "text-yellow-700",  bg: "bg-yellow-50" },
  cabriolet:  { label: "Cabriolet",  icon: Wind,     color: "text-pink-700",    bg: "bg-pink-50" },
  electrique: { label: "Électrique", icon: Zap,      color: "text-green-700",   bg: "bg-green-50" },
  sport:      { label: "Sport",      icon: Gauge,    color: "text-red-700",     bg: "bg-red-50" },
  moto:       { label: "Moto",       icon: Bike,     color: "text-violet-700",  bg: "bg-violet-50" },
};

const DEFAULT_CONFIG: CategoryConfig = {
  label: "", icon: Car, color: "text-slate-700", bg: "bg-slate-100",
};

function getCfg(cat: string): CategoryConfig {
  const c = CATEGORY_CONFIG[cat];
  if (c) return c;
  return { ...DEFAULT_CONFIG, label: cat.charAt(0).toUpperCase() + cat.slice(1) };
}

function fuelLabel(f: string): string {
  switch (f) {
    case "essence":    return "Essence";
    case "diesel":     return "Diesel";
    case "electrique": return "Électrique";
    case "hybride":    return "Hybride";
    default:           return f;
  }
}

function transmissionLabel(t: string): string {
  return t === "automatique" ? "Automatique" : "Manuelle";
}

function lowestPrice(vehicles: RentalVehicle[]): number {
  return Math.min(...vehicles.map((v) => v.pricing.standard || 0));
}

// =============================================================================
// Compact category row — small photo + infos on right
// =============================================================================

function CategoryRow({
  category,
  vehicles,
}: {
  category: string;
  vehicles: RentalVehicle[];
}) {
  const cfg = getCfg(category);
  const Icon = cfg.icon;
  const v = vehicles[0]!;
  const price = lowestPrice(vehicles);

  const modelName = `${v.brand} ${v.model}`;
  const label = vehicles.length > 1 ? `${modelName} ou similaire` : modelName;

  const photo =
    v.photos?.[0] ||
    "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=200&h=140&fit=crop";

  return (
    <Link to={`/vehicle/${v.id}`} className="group block">
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-slate-300 hover:shadow-md transition-all duration-200">
        <div className="flex">
          {/* Photo — fixed size with absolute img */}
          <div className="relative w-[110px] h-[120px] sm:w-[140px] sm:h-[130px] flex-shrink-0 bg-slate-100 overflow-hidden">
            <img
              src={photo}
              alt={label}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
            {/* Category badge on photo */}
            <div className={cn(
              "absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-sm",
              cfg.bg, cfg.color,
            )}>
              <Icon className="w-3 h-3" />
              {cfg.label}
            </div>
          </div>

          {/* Right side — infos */}
          <div className="flex-1 min-w-0 p-2.5 sm:p-3 flex flex-col justify-between">
            {/* Top: name + count */}
            <div>
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                  {label}
                </p>
                {vehicles.length > 1 && (
                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-1.5 py-0.5 flex-shrink-0 whitespace-nowrap">
                    {vehicles.length} choix
                  </span>
                )}
              </div>

              {/* Spec tags */}
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                  <Cog className="w-2.5 h-2.5" />
                  {transmissionLabel(v.specs.transmission)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                  <Fuel className="w-2.5 h-2.5" />
                  {fuelLabel(v.specs.fuel_type)}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                  <Users className="w-2.5 h-2.5" />
                  {v.specs.seats} pl.
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                  <DoorOpen className="w-2.5 h-2.5" />
                  {v.specs.doors} portes
                </span>
                {v.specs.ac && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 bg-slate-50 rounded px-1.5 py-0.5">
                    <Snowflake className="w-2.5 h-2.5" />
                    Clim
                  </span>
                )}
              </div>
            </div>

            {/* Bottom: price + arrow */}
            <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 font-medium">À partir de</span>
                <p className="text-sm font-bold text-slate-900 leading-tight">
                  {price} <span className="text-[10px] font-normal text-slate-500">MAD/jour</span>
                </p>
              </div>
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary transition-colors duration-200">
                <ChevronRight className="w-3.5 h-3.5 text-primary group-hover:text-white transition-colors" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function RentacarVehicleSection({
  establishmentId,
}: {
  establishmentId: string;
}) {
  const [vehicles, setVehicles] = useState<RentalVehicle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchRentalVehicles({ establishment_id: establishmentId, per_page: 50 })
      .then((res) => {
        if (!cancelled) setVehicles(res.vehicles);
      })
      .catch((err) => {
        console.error("[RentacarVehicleSection] error:", err);
        if (!cancelled) setVehicles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [establishmentId]);

  // Group by category, sorted by count desc
  const categories = useMemo(() => {
    const map = new Map<string, RentalVehicle[]>();
    for (const v of vehicles) {
      const cat = v.category || "autre";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(v);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [vehicles]);

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-slate-500">Chargement des véhicules...</p>
      </div>
    );
  }

  // Empty
  if (vehicles.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Car className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-600 font-medium">Aucun véhicule disponible</p>
        <p className="text-sm text-slate-500 mt-1">
          Cette agence n'a pas encore ajouté de véhicules.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Car className="w-4 h-4 text-primary flex-shrink-0" />
        <span>
          <strong className="text-slate-900">{vehicles.length}</strong> véhicule
          {vehicles.length > 1 ? "s" : ""} ·{" "}
          <strong className="text-slate-900">{categories.length}</strong> catégorie
          {categories.length > 1 ? "s" : ""}
        </span>
      </div>

      {/* 1 compact row per category */}
      <div className="space-y-2">
        {categories.map(([cat, catVehicles]) => (
          <CategoryRow key={cat} category={cat} vehicles={catVehicles} />
        ))}
      </div>
    </div>
  );
}
