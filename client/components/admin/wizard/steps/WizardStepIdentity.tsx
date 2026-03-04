"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Plus, X, Search, Building2, MapPin } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";

import {
  UNIVERSE_OPTIONS,
  UNIVERSE_CONFIG,
  TAG_CONFIG,
  type WizardData,
} from "../wizardConstants";

import {
  searchEstablishmentsByName,
  type EstablishmentSearchResult,
} from "@/lib/adminApi";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
  onSelectExisting?: (establishment: EstablishmentSearchResult) => void;
};

export default function WizardStepIdentity({ data, onChange, onSelectExisting }: Props) {
  const [specialtySearch, setSpecialtySearch] = useState("");
  const [showAllSpecialties, setShowAllSpecialties] = useState(false);
  const [customSpecialty, setCustomSpecialty] = useState("");

  // -- Duplicate detection state --
  const [searchResults, setSearchResults] = useState<EstablishmentSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_VISIBLE_TAGS = 15;

  // Derive categories from the selected universe
  const categories = useMemo(() => {
    if (!data.universe || !UNIVERSE_CONFIG[data.universe]) return [];
    return UNIVERSE_CONFIG[data.universe].categories;
  }, [data.universe]);

  // Derive subcategories from the selected category
  const subcategories = useMemo(() => {
    if (
      !data.universe ||
      !data.category ||
      !UNIVERSE_CONFIG[data.universe]?.subcategories?.[data.category]
    )
      return [];
    return UNIVERSE_CONFIG[data.universe].subcategories[data.category];
  }, [data.universe, data.category]);

  // Derive available specialties from TAG_CONFIG
  const allSpecialties = useMemo(() => {
    if (!data.universe || !TAG_CONFIG[data.universe]?.specialties) return [];
    return TAG_CONFIG[data.universe].specialties;
  }, [data.universe]);

  // Filter specialties by search query
  const filteredSpecialties = useMemo(() => {
    if (!specialtySearch.trim()) return allSpecialties;
    const query = specialtySearch.toLowerCase();
    return allSpecialties.filter((s: string) => s.toLowerCase().includes(query));
  }, [allSpecialties, specialtySearch]);

  // Limit visible specialties
  const visibleSpecialties = showAllSpecialties
    ? filteredSpecialties
    : filteredSpecialties.slice(0, MAX_VISIBLE_TAGS);

  const hasMore = filteredSpecialties.length > MAX_VISIBLE_TAGS;

  // -- Debounced search for duplicates --
  const searchForDuplicates = useCallback(async (name: string) => {
    if (name.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchEstablishmentsByName(name);
      setSearchResults(result.items);
      setShowDropdown(result.items.length > 0);
    } catch {
      setSearchResults([]);
      setShowDropdown(false);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleNameChange = (value: string) => {
    onChange({ name: value });
    setNameConfirmed(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchForDuplicates(value);
    }, 400);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleSelectExisting = (est: EstablishmentSearchResult) => {
    setShowDropdown(false);
    setNameConfirmed(true);
    if (onSelectExisting) {
      onSelectExisting(est);
    }
  };

  const handleConfirmNewName = () => {
    setShowDropdown(false);
    setNameConfirmed(true);
  };

  // Handlers
  const handleUniverseChange = (value: string) => {
    onChange({
      universe: value,
      category: "",
      subcategory: "",
      specialties: [],
    });
    setSpecialtySearch("");
    setShowAllSpecialties(false);
  };

  const handleCategoryChange = (value: string) => {
    onChange({
      category: value,
      subcategory: "",
    });
  };

  const handleSubcategoryChange = (value: string) => {
    onChange({ subcategory: value });
  };

  const handleAddSpecialty = (specialty: string) => {
    if (!data.specialties.includes(specialty)) {
      onChange({ specialties: [...data.specialties, specialty] });
    }
  };

  const handleRemoveSpecialty = (specialty: string) => {
    onChange({
      specialties: data.specialties.filter((s) => s !== specialty),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Identit&eacute; de l&rsquo;&eacute;tablissement
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Renseignez les informations principales de la fiche
        </p>
      </div>

      {/* Nom avec recherche de doublons */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm font-medium text-slate-700">
          Nom <span className="text-red-500">*</span>
        </Label>
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="name"
              value={data.name}
              onChange={(e) => handleNameChange(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0 && !nameConfirmed) setShowDropdown(true);
              }}
              placeholder="Rechercher ou saisir le nom de l'&eacute;tablissement..."
              required
              className="rounded-lg ps-9"
            />
            {isSearching && (
              <div className="absolute end-3 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
              </div>
            )}
          </div>

          {/* Dropdown des résultats */}
          {showDropdown && !nameConfirmed && (
            <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
              {/* Info: existing establishments found */}
              <div className="flex items-center gap-2 border-b border-slate-100 bg-blue-50 px-3 py-2">
                <Building2 className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="text-xs text-blue-700">
                  {searchResults.length} &eacute;tablissement{searchResults.length > 1 ? "s" : ""} existant{searchResults.length > 1 ? "s" : ""} — cliquez pour compl&eacute;ter la fiche
                </span>
              </div>

              {/* Liste des résultats */}
              <div className="max-h-48 overflow-y-auto">
                {searchResults.map((est) => (
                  <button
                    key={est.id}
                    type="button"
                    onClick={() => handleSelectExisting(est)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-slate-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
                      <Building2 className="h-4 w-4 text-slate-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {est.name}
                      </p>
                      {est.city && (
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {est.city}
                        </p>
                      )}
                    </div>
                    {est.status && (
                      <Badge
                        variant="outline"
                        className={
                          est.status === "active"
                            ? "border-green-200 bg-green-50 text-green-700"
                            : "border-slate-200 text-slate-500"
                        }
                      >
                        {est.status === "active" ? "Actif" : est.status}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>

              {/* Bouton "Nouvel établissement" */}
              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  onClick={handleConfirmNewName}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[#a3001d] transition-colors hover:bg-red-50"
                >
                  <Plus className="h-4 w-4" />
                  Nouvel &eacute;tablissement &laquo;&nbsp;{data.name}&nbsp;&raquo;
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Confirmation visuelle */}
        {nameConfirmed && data.name.length >= 2 && (
          <p className="text-xs text-green-600">
            Nouveau nom confirm&eacute; : {data.name}
          </p>
        )}
      </div>

      {/* Univers */}
      <div className="space-y-2">
        <Label htmlFor="universe" className="text-sm font-medium text-slate-700">
          Univers
        </Label>
        <Select value={data.universe} onValueChange={handleUniverseChange}>
          <SelectTrigger className="rounded-lg">
            <SelectValue placeholder="S&eacute;lectionnez un univers" />
          </SelectTrigger>
          <SelectContent>
            {UNIVERSE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Catégorie */}
      <div className="space-y-2">
        <Label htmlFor="category" className="text-sm font-medium text-slate-700">
          Cat&eacute;gorie
        </Label>
        <Select
          value={data.category}
          onValueChange={handleCategoryChange}
          disabled={!data.universe}
        >
          <SelectTrigger className="rounded-lg">
            <SelectValue placeholder="S&eacute;lectionnez une cat&eacute;gorie" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sous-catégorie */}
      <div className="space-y-2">
        <Label
          htmlFor="subcategory"
          className="text-sm font-medium text-slate-700"
        >
          Sous-cat&eacute;gorie
        </Label>
        <Select
          value={data.subcategory}
          onValueChange={handleSubcategoryChange}
          disabled={!data.category}
        >
          <SelectTrigger className="rounded-lg">
            <SelectValue placeholder="S&eacute;lectionnez une sous-cat&eacute;gorie" />
          </SelectTrigger>
          <SelectContent>
            {subcategories.map((sub) => (
              <SelectItem key={sub.id} value={sub.id}>
                {sub.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Spécialités */}
      {data.universe && allSpecialties.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-slate-700">
            Sp&eacute;cialit&eacute;s
          </Label>

          {/* Search input */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={specialtySearch}
              onChange={(e) => {
                setSpecialtySearch(e.target.value);
                setShowAllSpecialties(false);
              }}
              placeholder="Rechercher une sp&eacute;cialit&eacute;..."
              className="rounded-lg ps-9"
            />
          </div>

          {/* Selected specialties */}
          {data.specialties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.specialties.map((specialty) => (
                <Badge
                  key={specialty}
                  className="cursor-pointer gap-1 bg-red-500 text-white hover:bg-red-600"
                  onClick={() => handleRemoveSpecialty(specialty)}
                >
                  {specialty}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}

          {/* Available specialties */}
          <div className="flex flex-wrap gap-2">
            {visibleSpecialties
              .filter((s: string) => !data.specialties.includes(s))
              .map((specialty: string) => (
                <Badge
                  key={specialty}
                  variant="outline"
                  className="cursor-pointer gap-1 hover:bg-slate-100"
                  onClick={() => handleAddSpecialty(specialty)}
                >
                  <Plus className="h-3 w-3" />
                  {specialty}
                </Badge>
              ))}
          </div>

          {/* Show more button */}
          {hasMore && !showAllSpecialties && (
            <button
              type="button"
              onClick={() => setShowAllSpecialties(true)}
              className="text-sm font-medium text-red-500 hover:text-red-600"
            >
              Voir plus
            </button>
          )}

          {/* Custom specialty input */}
          <div className="flex gap-2">
            <Input
              value={customSpecialty}
              onChange={(e) => setCustomSpecialty(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const trimmed = customSpecialty.trim();
                  if (trimmed && !data.specialties.includes(trimmed)) {
                    handleAddSpecialty(trimmed);
                    setCustomSpecialty("");
                  }
                }
              }}
              placeholder="Ajouter une sp&eacute;cialit&eacute; personnalis&eacute;e..."
              className="rounded-lg text-sm"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 gap-1"
              onClick={() => {
                const trimmed = customSpecialty.trim();
                if (trimmed && !data.specialties.includes(trimmed)) {
                  handleAddSpecialty(trimmed);
                  setCustomSpecialty("");
                }
              }}
              disabled={!customSpecialty.trim()}
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
