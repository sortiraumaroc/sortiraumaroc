import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  Users,
  Gauge,
  Fuel,
  Wind,
  Briefcase,
  Car,
  MapPin,
  Shield,
  Check,
  Loader2,
  DoorOpen,
  Calendar,
  Clock,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useRentalVehicle, useInsurancePlans } from "@/hooks/useRental";
import type { RentalInsurancePlan } from "../../shared/rentalTypes";

// =============================================================================
// CATEGORY LABELS
// =============================================================================

const CATEGORY_LABELS: Record<string, string> = {
  citadine: "Citadine",
  compacte: "Compacte",
  berline: "Berline",
  suv: "SUV",
  "4x4": "4x4",
  monospace: "Monospace",
  utilitaire: "Utilitaire",
  luxe: "Luxe",
  cabriolet: "Cabriolet",
  electrique: "Electrique",
  sport: "Sport",
  moto: "Moto",
};

const TRANSMISSION_LABELS: Record<string, string> = {
  automatique: "Automatique",
  manuelle: "Manuelle",
};

const FUEL_LABELS: Record<string, string> = {
  essence: "Essence",
  diesel: "Diesel",
  electrique: "Electrique",
  hybride: "Hybride",
};

// =============================================================================
// VEHICLE PHOTO GALLERY
// =============================================================================

function VehicleGallery({ photos }: { photos: string[] }) {
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="w-full aspect-[16/9] bg-slate-100 rounded-2xl flex items-center justify-center">
        <Car className="w-16 h-16 text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main photo */}
      <div className="w-full aspect-[16/9] overflow-hidden rounded-2xl bg-slate-100">
        <img
          src={photos[selectedIdx]}
          alt="Photo du véhicule"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Thumbnails */}
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((photo, idx) => (
            <button
              key={idx}
              onClick={() => setSelectedIdx(idx)}
              className={cn(
                "flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all",
                idx === selectedIdx
                  ? "border-primary ring-1 ring-primary/30"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <img
                src={photo}
                alt={`Photo ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SPEC ITEM
// =============================================================================

function SpecItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white shadow-sm">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-sm font-semibold text-slate-900 truncate">{value}</div>
      </div>
    </div>
  );
}

// =============================================================================
// INSURANCE PLAN CARD
// =============================================================================

function InsurancePlanCard({ plan }: { plan: RentalInsurancePlan }) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-shadow hover:shadow-md",
        plan.badge && "border-primary/40",
      )}
    >
      {plan.badge && (
        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-semibold px-3 py-1 rounded-bl-lg">
          {plan.badge}
        </div>
      )}
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
          <p className="text-sm text-slate-500 mt-1">{plan.description}</p>
        </div>

        <div className="space-y-2">
          {plan.coverages.map((coverage, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span className="text-sm text-slate-700">{coverage}</span>
            </div>
          ))}
        </div>

        <div className="border-t pt-3 space-y-1">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Prix / jour</span>
            <span className="text-lg font-bold text-primary">
              {plan.price_per_day} MAD
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Franchise</span>
            <span className="text-sm font-semibold text-slate-700">
              {plan.franchise.toLocaleString("fr-MA")} MAD
            </span>
          </div>
          {plan.partner_name && (
            <div className="text-xs text-slate-400 mt-1">
              Partenaire : {plan.partner_name}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function VehicleDetail() {
  const { id: vehicleId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const { vehicle, loading, error } = useRentalVehicle(vehicleId);
  const { plans: insurancePlans, loading: insuranceLoading } = useInsurancePlans();

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="flex items-center justify-center py-40">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Error state
  // ---------------------------------------------------------------------------

  if (error || !vehicle) {
    return (
      <div className="min-h-screen bg-white">
        <Header />
        <div className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
          <Car className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900">Véhicule introuvable</h2>
          <p className="text-slate-500">
            {error ?? "Ce véhicule n'existe pas ou n'est plus disponible."}
          </p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ChevronLeft className="w-4 h-4 mr-1" />
            Retour
          </Button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const { specs, pricing, establishment } = vehicle;
  const title = [vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" ");
  const categoryLabel = CATEGORY_LABELS[vehicle.category] ?? vehicle.category;

  const mileageText =
    vehicle.mileage_policy === "unlimited"
      ? "Kilométrage illimité"
      : vehicle.mileage_limit_per_day
        ? `${vehicle.mileage_limit_per_day} km/jour`
        : "Limité";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-white pb-28">
      <Header />

      <main className="max-w-5xl mx-auto px-4 pt-6 pb-10 space-y-8">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour
        </button>

        {/* ----------------------------------------------------------------- */}
        {/* Gallery */}
        {/* ----------------------------------------------------------------- */}
        <VehicleGallery photos={vehicle.photos ?? []} />

        {/* ----------------------------------------------------------------- */}
        {/* Title & Category */}
        {/* ----------------------------------------------------------------- */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {title}
            </h1>
            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs font-semibold px-3 py-1">
              {categoryLabel}
            </span>
          </div>
          {vehicle.similar_vehicle && vehicle.similar_models?.length ? (
            <p className="text-sm text-slate-500">
              Ou véhicule similaire : {vehicle.similar_models.join(", ")}
            </p>
          ) : null}
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Specs grid */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Caractéristiques</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <SpecItem
              icon={Users}
              label="Places"
              value={`${specs.seats} places`}
            />
            <SpecItem
              icon={DoorOpen}
              label="Portes"
              value={`${specs.doors} portes`}
            />
            <SpecItem
              icon={Gauge}
              label="Transmission"
              value={TRANSMISSION_LABELS[specs.transmission] ?? specs.transmission}
            />
            <SpecItem
              icon={Fuel}
              label="Carburant"
              value={FUEL_LABELS[specs.fuel_type] ?? specs.fuel_type}
            />
            <SpecItem
              icon={Wind}
              label="Climatisation"
              value={specs.ac ? "Oui" : "Non"}
            />
            {specs.trunk_volume && (
              <SpecItem
                icon={Briefcase}
                label="Coffre"
                value={specs.trunk_volume}
              />
            )}
            <SpecItem
              icon={Car}
              label="Kilométrage"
              value={mileageText}
            />
            {vehicle.mileage_policy === "limited" && vehicle.extra_km_cost ? (
              <SpecItem
                icon={Clock}
                label="Km supplémentaire"
                value={`${vehicle.extra_km_cost} MAD/km`}
              />
            ) : null}
          </div>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Supplier info */}
        {/* ----------------------------------------------------------------- */}
        {establishment && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900">Fournisseur</h2>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  {establishment.logo ? (
                    <img
                      src={establishment.logo}
                      alt={establishment.name}
                      className="w-12 h-12 rounded-xl object-cover bg-slate-100"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center">
                      <Car className="w-6 h-6 text-slate-400" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-slate-900 truncate">
                      {establishment.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-0.5">
                      <MapPin className="w-3.5 h-3.5" />
                      {establishment.city}
                    </div>
                    {establishment.avg_rating != null && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Note moyenne : {establishment.avg_rating.toFixed(1)} / 5
                      </div>
                    )}
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(establishment.name + " " + establishment.city)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary font-medium hover:underline flex-shrink-0"
                  >
                    Voir sur Maps
                  </a>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Insurance plans */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-slate-900">Assurances</h2>
          </div>

          {insuranceLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : insurancePlans.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insurancePlans.map((plan) => (
                <InsurancePlanCard key={plan.id} plan={plan} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Aucune assurance disponible pour le moment.
            </p>
          )}
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Pricing */}
        {/* ----------------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-slate-900">Tarification</h2>
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              {/* Standard price */}
              <div className="flex items-baseline justify-between">
                <span className="text-slate-700">Tarif standard</span>
                <span className="text-2xl font-extrabold text-primary">
                  {pricing.standard} <span className="text-base font-semibold">MAD/jour</span>
                </span>
              </div>

              {/* Weekend price */}
              {pricing.weekend != null && pricing.weekend !== pricing.standard && (
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-sm text-slate-600">Week-end (ven-dim)</span>
                  <span className="text-lg font-bold text-slate-800">
                    {pricing.weekend} MAD/jour
                  </span>
                </div>
              )}

              {/* High season price */}
              {pricing.high_season != null && (
                <div className="flex items-baseline justify-between border-t pt-3">
                  <span className="text-sm text-slate-600">Haute saison</span>
                  <span className="text-lg font-bold text-slate-800">
                    {pricing.high_season} MAD/jour
                  </span>
                </div>
              )}

              {/* Long duration discount */}
              {pricing.long_duration_discount && (
                <div className="flex items-center justify-between border-t pt-3">
                  <span className="text-sm text-slate-600">
                    Remise longue durée (dès {pricing.long_duration_discount.min_days} jours)
                  </span>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-1">
                    -{pricing.long_duration_discount.discount_percent}%
                  </span>
                </div>
              )}

              {/* High season dates */}
              {vehicle.high_season_dates && vehicle.high_season_dates.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs text-slate-400 mb-1">Périodes haute saison :</p>
                  <div className="flex flex-wrap gap-2">
                    {vehicle.high_season_dates.map((period, idx) => (
                      <span
                        key={idx}
                        className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full"
                      >
                        {period.start} &rarr; {period.end}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ----------------------------------------------------------------- */}
        {/* Quantity / availability hint */}
        {/* ----------------------------------------------------------------- */}
        {vehicle.quantity > 0 && vehicle.quantity <= 3 && (
          <div className="text-center text-sm text-amber-600 font-medium">
            Plus que {vehicle.quantity} véhicule{vehicle.quantity > 1 ? "s" : ""} disponible
            {vehicle.quantity > 1 ? "s" : ""} !
          </div>
        )}
      </main>

      {/* ------------------------------------------------------------------- */}
      {/* Sticky bottom bar */}
      {/* ------------------------------------------------------------------- */}
      <div data-sticky-bottom-bar className="fixed bottom-0 inset-x-0 bg-white border-t shadow-lg z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div>
            <span className="text-xl font-extrabold text-primary">
              {pricing.standard} MAD
            </span>
            <span className="text-sm text-slate-500 ml-1">/ jour</span>
          </div>
          <Button
            size="lg"
            className="px-8 font-semibold"
            onClick={() => navigate(`/rental-booking/${vehicleId}`)}
          >
            Réserver
          </Button>
        </div>
      </div>
    </div>
  );
}
