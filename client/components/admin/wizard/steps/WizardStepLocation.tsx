"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { MapPin, Lock, Plus, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  MOROCCAN_CITIES,
  MOROCCAN_REGIONS,
  CITY_TO_REGION,
  type WizardData,
} from "../wizardConstants";

import { loadAdminSessionToken } from "@/lib/adminApi";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

type NeighborhoodItem = { id: string; name: string };

export default function WizardStepLocation({ data, onChange }: Props) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customNeighborhood, setCustomNeighborhood] = useState("");
  const [savingNeighborhood, setSavingNeighborhood] = useState(false);
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodItem[]>([]);
  const [loadingNeighborhoods, setLoadingNeighborhoods] = useState(false);

  // Fetch neighborhoods from API when city changes
  const fetchNeighborhoods = useCallback(async (city: string) => {
    if (!city) {
      setNeighborhoods([]);
      return;
    }
    setLoadingNeighborhoods(true);
    try {
      const sessionToken = loadAdminSessionToken();
      const res = await fetch(
        `/api/admin/settings/neighborhoods?city=${encodeURIComponent(city)}`,
        {
          headers: sessionToken ? { "x-admin-session": sessionToken } : {},
          credentials: "include",
        }
      );
      if (res.ok) {
        const json = await res.json();
        const items = (json.items ?? []) as Array<{ id: string; name: string }>;
        setNeighborhoods(items.map((n) => ({ id: String(n.id), name: n.name })));
      }
    } catch {
      // Silently fail — user can still type manually
    } finally {
      setLoadingNeighborhoods(false);
    }
  }, []);

  useEffect(() => {
    fetchNeighborhoods(data.city);
    setShowCustomInput(false);
    setCustomNeighborhood("");
  }, [data.city, fetchNeighborhoods]);

  // Save a new neighborhood to the database
  const handleSaveNewNeighborhood = async () => {
    const trimmed = customNeighborhood.trim();
    if (!trimmed || !data.city) return;

    setSavingNeighborhood(true);
    try {
      const sessionToken = loadAdminSessionToken();
      const res = await fetch("/api/admin/settings/neighborhoods", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionToken ? { "x-admin-session": sessionToken } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ city: data.city, name: trimmed }),
      });

      if (res.ok) {
        const json = await res.json();
        const newItem = json.item as NeighborhoodItem;
        // Add to local list if not already present
        setNeighborhoods((prev) => {
          if (prev.some((n) => n.name === newItem.name)) return prev;
          return [...prev, { id: String(newItem.id), name: newItem.name }].sort(
            (a, b) => a.name.localeCompare(b.name, "fr")
          );
        });
        onChange({ neighborhood: trimmed });
        setCustomNeighborhood("");
        setShowCustomInput(false);
      }
    } catch {
      // Silently fail
    } finally {
      setSavingNeighborhood(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Localisation de l&rsquo;&eacute;tablissement
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Indiquez l&rsquo;adresse compl&egrave;te pour que vos clients puissent
          vous trouver
        </p>
      </div>

      {/* Row 1: Pays | Région */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Pays */}
        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium text-slate-700">
            Pays
          </Label>
          <div className="relative">
            <Input
              id="country"
              value="Maroc"
              disabled
              readOnly
              className="rounded-lg bg-slate-50 pe-10"
            />
            <Lock className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </div>

        {/* Région */}
        <div className="space-y-2">
          <Label htmlFor="region" className="text-sm font-medium text-slate-700">
            R&eacute;gion
          </Label>
          <Select
            value={data.region}
            onValueChange={(value) => onChange({ region: value })}
          >
            <SelectTrigger className="rounded-lg">
              <SelectValue placeholder="S&eacute;lectionnez une r&eacute;gion" />
            </SelectTrigger>
            <SelectContent>
              {MOROCCAN_REGIONS.map((r) => (
                <SelectItem key={r.name} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Row 2: Ville | Code postal */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Ville */}
        <div className="space-y-2">
          <Label htmlFor="city" className="text-sm font-medium text-slate-700">
            Ville
          </Label>
          <Select
            value={data.city}
            onValueChange={(value) => {
              const updates: Partial<WizardData> = { city: value, neighborhood: "" };
              // Auto-fill region based on city
              const autoRegion = CITY_TO_REGION[value];
              if (autoRegion) updates.region = autoRegion;
              onChange(updates);
            }}
          >
            <SelectTrigger className="rounded-lg">
              <SelectValue placeholder="S&eacute;lectionnez une ville" />
            </SelectTrigger>
            <SelectContent>
              {MOROCCAN_CITIES.map((city) => (
                <SelectItem key={city} value={city}>
                  {city}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Code postal */}
        <div className="space-y-2">
          <Label
            htmlFor="postal_code"
            className="text-sm font-medium text-slate-700"
          >
            Code postal
          </Label>
          <Input
            id="postal_code"
            value={data.postal_code}
            onChange={(e) => onChange({ postal_code: e.target.value })}
            placeholder="ex. 40000"
            className="rounded-lg"
          />
        </div>
      </div>

      {/* Row 3: Quartier | Adresse */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Quartier */}
        <div className="space-y-2">
          <Label
            htmlFor="neighborhood"
            className="text-sm font-medium text-slate-700"
          >
            Quartier
          </Label>

          {!data.city ? (
            <Input
              disabled
              placeholder="S&eacute;lectionnez une ville d'abord"
              className="rounded-lg bg-slate-50"
            />
          ) : loadingNeighborhoods ? (
            <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : neighborhoods.length > 0 && !showCustomInput ? (
            <div className="space-y-1">
              <Select
                value={data.neighborhood}
                onValueChange={(value) => {
                  if (value === "__autre__") {
                    setShowCustomInput(true);
                    onChange({ neighborhood: "" });
                    return;
                  }
                  onChange({ neighborhood: value });
                }}
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="S&eacute;lectionnez un quartier" />
                </SelectTrigger>
                <SelectContent>
                  {neighborhoods.map((n) => (
                    <SelectItem key={n.id} value={n.name}>
                      {n.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__autre__">
                    <span className="flex items-center gap-1 font-medium text-red-600">
                      <Plus className="h-3 w-3" />
                      Autre
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex gap-2">
                <Input
                  value={customNeighborhood}
                  onChange={(e) => setCustomNeighborhood(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveNewNeighborhood();
                    }
                  }}
                  placeholder="Nom du quartier..."
                  className="rounded-lg"
                  disabled={savingNeighborhood}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 gap-1"
                  onClick={handleSaveNewNeighborhood}
                  disabled={!customNeighborhood.trim() || savingNeighborhood}
                >
                  {savingNeighborhood ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {neighborhoods.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCustomInput(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  &larr; Revenir &agrave; la liste
                </button>
              )}
            </div>
          )}
        </div>

        {/* Adresse */}
        <div className="space-y-2">
          <Label htmlFor="address" className="text-sm font-medium text-slate-700">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-slate-500" />
              Adresse <span className="text-red-500">*</span>
            </div>
          </Label>
          <Input
            id="address"
            value={data.address}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="ex. Boulevard de la Corniche"
            required
            className="rounded-lg"
          />
        </div>
      </div>

      {/* Row 5: Latitude | Longitude */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Latitude */}
        <div className="space-y-2">
          <Label
            htmlFor="lat"
            className="text-sm font-medium text-slate-700"
          >
            Latitude <span className="text-red-500">*</span>
          </Label>
          <Input
            id="lat"
            type="text"
            value={data.lat}
            onChange={(e) => onChange({ lat: e.target.value })}
            placeholder="ex. 33.5943"
            required
            className="rounded-lg"
          />
        </div>

        {/* Longitude */}
        <div className="space-y-2">
          <Label
            htmlFor="lng"
            className="text-sm font-medium text-slate-700"
          >
            Longitude <span className="text-red-500">*</span>
          </Label>
          <Input
            id="lng"
            type="text"
            value={data.lng}
            onChange={(e) => onChange({ lng: e.target.value })}
            placeholder="ex. -7.67"
            required
            className="rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
