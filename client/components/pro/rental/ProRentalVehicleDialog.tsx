// =============================================================================
// PRO RENTAL VEHICLE DIALOG - Creation / edition d'un vehicule
// =============================================================================

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { toast } from "@/hooks/use-toast";
import { createProVehicle, updateProVehicle } from "@/lib/rentalProApi";
import type {
  RentalVehicle,
  RentalVehicleSpecs,
  RentalVehiclePricing,
} from "../../../../shared/rentalTypes";
import {
  RENTAL_VEHICLE_CATEGORIES,
  RENTAL_TRANSMISSION_TYPES,
  RENTAL_FUEL_TYPES,
  RENTAL_MILEAGE_POLICIES,
  RENTAL_VEHICLE_STATUSES,
} from "../../../../shared/rentalTypes";

// =============================================================================
// TYPES
// =============================================================================

type Props = {
  open: boolean;
  onClose: () => void;
  establishmentId: string;
  vehicle?: RentalVehicle;
  onSaved: () => void;
};

// =============================================================================
// LABELS
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

const MILEAGE_LABELS: Record<string, string> = {
  unlimited: "Illimite",
  limited: "Limite",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  inactive: "Inactif",
  maintenance: "Maintenance",
};

// =============================================================================
// DEFAULT STATE
// =============================================================================

function getDefaultState() {
  return {
    category: "citadine" as string,
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    photos: [] as string[],
    specs: {
      seats: 5,
      doors: 4,
      transmission: "manuelle" as const,
      ac: true,
      fuel_type: "essence" as const,
      trunk_volume: "",
    } satisfies RentalVehicleSpecs,
    mileage_policy: "unlimited" as string,
    mileage_limit_per_day: null as number | null,
    extra_km_cost: null as number | null,
    pricing: {
      standard: 0,
      weekend: undefined as number | undefined,
      high_season: undefined as number | undefined,
      long_duration_discount: undefined as { min_days: number; discount_percent: number } | undefined,
    } satisfies RentalVehiclePricing,
    quantity: 1,
    similar_vehicle: false,
    similar_models: [] as string[],
    status: "active" as string,
  };
}

type FormState = ReturnType<typeof getDefaultState>;

function vehicleToState(v: RentalVehicle): FormState {
  return {
    category: v.category,
    brand: v.brand,
    model: v.model,
    year: v.year ?? new Date().getFullYear(),
    photos: v.photos ?? [],
    specs: {
      seats: v.specs.seats,
      doors: v.specs.doors,
      transmission: v.specs.transmission,
      ac: v.specs.ac,
      fuel_type: v.specs.fuel_type,
      trunk_volume: v.specs.trunk_volume ?? "",
    },
    mileage_policy: v.mileage_policy,
    mileage_limit_per_day: v.mileage_limit_per_day,
    extra_km_cost: v.extra_km_cost,
    pricing: {
      standard: v.pricing.standard,
      weekend: v.pricing.weekend,
      high_season: v.pricing.high_season,
      long_duration_discount: v.pricing.long_duration_discount,
    },
    quantity: v.quantity,
    similar_vehicle: v.similar_vehicle,
    similar_models: v.similar_models ?? [],
    status: v.status,
  };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ProRentalVehicleDialog({ open, onClose, establishmentId, vehicle, onSaved }: Props) {
  const isEdit = !!vehicle;
  const [form, setForm] = useState<FormState>(getDefaultState());
  const [saving, setSaving] = useState(false);

  // Photo add field
  const [newPhotoUrl, setNewPhotoUrl] = useState("");

  // Similar model add field
  const [newSimilarModel, setNewSimilarModel] = useState("");

  // Long duration toggle
  const [longDurationEnabled, setLongDurationEnabled] = useState(false);

  // -----------------------------------------------------------------------
  // Init
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (open) {
      if (vehicle) {
        const state = vehicleToState(vehicle);
        setForm(state);
        setLongDurationEnabled(!!state.pricing.long_duration_discount);
      } else {
        setForm(getDefaultState());
        setLongDurationEnabled(false);
      }
      setNewPhotoUrl("");
      setNewSimilarModel("");
    }
  }, [open, vehicle]);

  // -----------------------------------------------------------------------
  // Form helpers
  // -----------------------------------------------------------------------

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const updateSpec = <K extends keyof RentalVehicleSpecs>(key: K, value: RentalVehicleSpecs[K]) =>
    setForm((prev) => ({ ...prev, specs: { ...prev.specs, [key]: value } }));

  const updatePricing = <K extends keyof RentalVehiclePricing>(key: K, value: RentalVehiclePricing[K]) =>
    setForm((prev) => ({ ...prev, pricing: { ...prev.pricing, [key]: value } }));

  // Photos
  const addPhoto = () => {
    const url = newPhotoUrl.trim();
    if (!url) return;
    update("photos", [...form.photos, url]);
    setNewPhotoUrl("");
  };

  const removePhoto = (index: number) => {
    update("photos", form.photos.filter((_, i) => i !== index));
  };

  // Similar models
  const addSimilarModel = () => {
    const m = newSimilarModel.trim();
    if (!m) return;
    update("similar_models", [...form.similar_models, m]);
    setNewSimilarModel("");
  };

  const removeSimilarModel = (index: number) => {
    update("similar_models", form.similar_models.filter((_, i) => i !== index));
  };

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const handleSubmit = async () => {
    // Validation
    if (!form.brand.trim()) {
      toast({ title: "Erreur", description: "La marque est requise.", variant: "destructive" });
      return;
    }
    if (!form.model.trim()) {
      toast({ title: "Erreur", description: "Le modele est requis.", variant: "destructive" });
      return;
    }
    if (form.pricing.standard <= 0) {
      toast({ title: "Erreur", description: "Le prix standard doit etre superieur a 0.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        establishment_id: establishmentId,
        category: form.category,
        brand: form.brand.trim(),
        model: form.model.trim(),
        year: form.year || null,
        photos: form.photos,
        specs: {
          ...form.specs,
          trunk_volume: form.specs.trunk_volume || undefined,
        },
        mileage_policy: form.mileage_policy,
        mileage_limit_per_day: form.mileage_policy === "limited" ? form.mileage_limit_per_day : null,
        extra_km_cost: form.mileage_policy === "limited" ? form.extra_km_cost : null,
        pricing: {
          standard: form.pricing.standard,
          weekend: form.pricing.weekend || undefined,
          high_season: form.pricing.high_season || undefined,
          long_duration_discount: longDurationEnabled ? form.pricing.long_duration_discount : undefined,
        },
        quantity: form.quantity,
        similar_vehicle: form.similar_vehicle,
        similar_models: form.similar_vehicle ? form.similar_models : null,
        status: form.status,
      };

      if (isEdit && vehicle) {
        await updateProVehicle(vehicle.id, payload as Partial<RentalVehicle>);
        toast({ title: "Vehicule mis a jour", description: `${form.brand} ${form.model} a ete modifie.` });
      } else {
        await createProVehicle(payload as Parameters<typeof createProVehicle>[0]);
        toast({ title: "Vehicule cree", description: `${form.brand} ${form.model} a ete ajoute.` });
      }

      onSaved();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'enregistrer le vehicule",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifier le vehicule" : "Ajouter un vehicule"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modifiez les informations du vehicule."
              : "Remplissez les informations pour ajouter un nouveau vehicule."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* ------- Infos generales ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Informations generales
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-2">
                <Label>Categorie</Label>
                <Select value={form.category} onValueChange={(v) => update("category", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_VEHICLE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c] ?? c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Brand */}
              <div className="space-y-2">
                <Label>Marque *</Label>
                <Input
                  value={form.brand}
                  onChange={(e) => update("brand", e.target.value)}
                  placeholder="Ex: Dacia"
                />
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label>Modele *</Label>
                <Input
                  value={form.model}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder="Ex: Logan"
                />
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label>Annee</Label>
                <Input
                  type="number"
                  value={form.year || ""}
                  onChange={(e) => update("year", Number(e.target.value) || 0)}
                  placeholder="Ex: 2024"
                  min={2000}
                  max={2030}
                />
              </div>
            </div>

            {/* Photos */}
            <div className="space-y-2">
              <Label>Photos (URLs)</Label>
              {form.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.photos.map((url, i) => (
                    <div key={i} className="relative group">
                      <img
                        src={url}
                        alt={`Photo ${i + 1}`}
                        className="h-16 w-20 rounded object-cover border"
                      />
                      <button
                        type="button"
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removePhoto(i)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={newPhotoUrl}
                  onChange={(e) => setNewPhotoUrl(e.target.value)}
                  placeholder="URL de la photo"
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addPhoto())}
                />
                <Button type="button" variant="outline" size="icon" onClick={addPhoto}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </fieldset>

          {/* ------- Specifications ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Specifications
            </legend>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {/* Seats */}
              <div className="space-y-2">
                <Label>Places</Label>
                <Input
                  type="number"
                  value={form.specs.seats}
                  onChange={(e) => updateSpec("seats", Number(e.target.value) || 1)}
                  min={1}
                  max={50}
                />
              </div>

              {/* Doors */}
              <div className="space-y-2">
                <Label>Portes</Label>
                <Input
                  type="number"
                  value={form.specs.doors}
                  onChange={(e) => updateSpec("doors", Number(e.target.value) || 2)}
                  min={2}
                  max={10}
                />
              </div>

              {/* Trunk */}
              <div className="space-y-2">
                <Label>Coffre</Label>
                <Input
                  value={form.specs.trunk_volume ?? ""}
                  onChange={(e) => updateSpec("trunk_volume", e.target.value)}
                  placeholder="Ex: 400L"
                />
              </div>

              {/* Transmission */}
              <div className="space-y-2">
                <Label>Transmission</Label>
                <Select
                  value={form.specs.transmission}
                  onValueChange={(v) => updateSpec("transmission", v as RentalVehicleSpecs["transmission"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_TRANSMISSION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRANSMISSION_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Fuel */}
              <div className="space-y-2">
                <Label>Carburant</Label>
                <Select
                  value={form.specs.fuel_type}
                  onValueChange={(v) => updateSpec("fuel_type", v as RentalVehicleSpecs["fuel_type"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_FUEL_TYPES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FUEL_LABELS[f] ?? f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AC */}
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={form.specs.ac}
                  onCheckedChange={(v) => updateSpec("ac", v)}
                />
                <Label>Climatisation</Label>
              </div>
            </div>
          </fieldset>

          {/* ------- Kilometrage ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Politique de kilometrage
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Politique</Label>
                <Select value={form.mileage_policy} onValueChange={(v) => update("mileage_policy", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_MILEAGE_POLICIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {MILEAGE_LABELS[p] ?? p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.mileage_policy === "limited" && (
                <>
                  <div className="space-y-2">
                    <Label>Limite km/jour</Label>
                    <Input
                      type="number"
                      value={form.mileage_limit_per_day ?? ""}
                      onChange={(e) => update("mileage_limit_per_day", Number(e.target.value) || null)}
                      placeholder="Ex: 300"
                      min={0}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cout km suppl. (MAD)</Label>
                    <Input
                      type="number"
                      value={form.extra_km_cost ?? ""}
                      onChange={(e) => update("extra_km_cost", Number(e.target.value) || null)}
                      placeholder="Ex: 2"
                      min={0}
                      step={0.5}
                    />
                  </div>
                </>
              )}
            </div>
          </fieldset>

          {/* ------- Tarification ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Tarification (MAD / jour)
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Prix standard *</Label>
                <Input
                  type="number"
                  value={form.pricing.standard || ""}
                  onChange={(e) => updatePricing("standard", Number(e.target.value) || 0)}
                  placeholder="Ex: 250"
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Prix week-end</Label>
                <Input
                  type="number"
                  value={form.pricing.weekend ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updatePricing("weekend", v > 0 ? v : undefined);
                  }}
                  placeholder="Optionnel"
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>Prix haute saison</Label>
                <Input
                  type="number"
                  value={form.pricing.high_season ?? ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    updatePricing("high_season", v > 0 ? v : undefined);
                  }}
                  placeholder="Optionnel"
                  min={0}
                />
              </div>
            </div>

            {/* Long duration discount */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={longDurationEnabled}
                  onCheckedChange={(v) => {
                    setLongDurationEnabled(v);
                    if (v && !form.pricing.long_duration_discount) {
                      updatePricing("long_duration_discount", { min_days: 7, discount_percent: 10 });
                    }
                  }}
                />
                <Label>Reduction longue duree</Label>
              </div>
              {longDurationEnabled && form.pricing.long_duration_discount && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-muted">
                  <div className="space-y-2">
                    <Label>A partir de (jours)</Label>
                    <Input
                      type="number"
                      value={form.pricing.long_duration_discount.min_days}
                      onChange={(e) =>
                        updatePricing("long_duration_discount", {
                          ...form.pricing.long_duration_discount!,
                          min_days: Number(e.target.value) || 1,
                        })
                      }
                      min={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reduction (%)</Label>
                    <Input
                      type="number"
                      value={form.pricing.long_duration_discount.discount_percent}
                      onChange={(e) =>
                        updatePricing("long_duration_discount", {
                          ...form.pricing.long_duration_discount!,
                          discount_percent: Number(e.target.value) || 0,
                        })
                      }
                      min={0}
                      max={100}
                    />
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* ------- Quantite & statut ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Disponibilite
            </legend>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Quantite</Label>
                <Input
                  type="number"
                  value={form.quantity}
                  onChange={(e) => update("quantity", Math.max(1, Number(e.target.value) || 1))}
                  min={1}
                />
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => update("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RENTAL_VEHICLE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s] ?? s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </fieldset>

          {/* ------- Vehicule similaire ------- */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Vehicule similaire
            </legend>

            <div className="flex items-center gap-3">
              <Switch
                checked={form.similar_vehicle}
                onCheckedChange={(v) => update("similar_vehicle", v)}
              />
              <Label>Proposer un vehicule similaire si indisponible</Label>
            </div>

            {form.similar_vehicle && (
              <div className="space-y-2 pl-4 border-l-2 border-muted">
                <Label>Modeles similaires</Label>
                {form.similar_models.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {form.similar_models.map((m, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
                      >
                        {m}
                        <button
                          type="button"
                          onClick={() => removeSimilarModel(i)}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newSimilarModel}
                    onChange={(e) => setNewSimilarModel(e.target.value)}
                    placeholder="Ex: Renault Clio"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSimilarModel())}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={addSimilarModel}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </fieldset>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isEdit ? "Enregistrer" : "Creer le vehicule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
