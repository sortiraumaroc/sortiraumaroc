"use client";

import React, { useState, useMemo } from "react";
import {
  Instagram,
  Facebook,
  Youtube,
  Plus,
  X,
  Search,
  Star,
  Settings2,
  Palette,
  MapPin,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  TAG_CONFIG,
  HIGHLIGHTS_SUGGESTIONS,
  type WizardData,
} from "../wizardConstants";

type Props = {
  data: WizardData;
  onChange: (updates: Partial<WizardData>) => void;
};

// ---- Inline SVG icons for platforms not in lucide-react ----

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z" />
  </svg>
);

const SnapchatIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.21 1.5c2.63.04 4.7 1.14 5.99 3.18.72 1.14.87 2.38.87 3.67-.02 1.06-.14 2.12-.24 3.17-.02.12-.03.24 0 .36.07.3.3.43.57.5.27.08.55.13.82.22.35.12.6.36.6.76 0 .42-.27.67-.62.82-.3.14-.63.22-.95.32-.28.08-.56.16-.8.3-.37.2-.52.54-.4.95.14.46.36.88.58 1.3.43.83 1 1.55 1.69 2.16.34.3.71.56 1.1.78.3.17.48.4.42.76-.06.37-.33.56-.65.68-.6.24-1.22.34-1.86.4-.13.01-.24.06-.3.18-.12.23-.23.47-.37.69-.17.28-.41.4-.73.39-.26 0-.52-.05-.77-.1-.53-.1-1.05-.24-1.59-.17-.48.07-.93.23-1.35.47-.75.43-1.55.63-2.42.6-.86.03-1.65-.17-2.4-.59-.44-.25-.9-.42-1.4-.49-.5-.06-1 .07-1.49.17-.3.06-.6.12-.91.13-.37.01-.63-.12-.81-.44-.12-.22-.24-.45-.35-.67-.07-.13-.18-.19-.32-.2-.55-.06-1.09-.14-1.62-.33-.42-.15-.78-.37-.97-.8-.13-.3-.03-.56.23-.73.42-.27.87-.48 1.27-.77.79-.57 1.42-1.28 1.93-2.1.2-.33.38-.67.52-1.03.14-.42-.02-.77-.4-.97-.24-.13-.5-.2-.76-.28-.33-.1-.65-.2-.96-.34-.35-.16-.6-.42-.6-.83 0-.4.25-.63.58-.75.28-.1.57-.15.86-.23.27-.07.5-.2.57-.5.03-.12.02-.24 0-.36-.1-1.05-.22-2.1-.24-3.15 0-1.28.14-2.53.85-3.66C7.52 2.65 9.59 1.54 12.21 1.5z" />
  </svg>
);

// ---- Reusable Tag Picker component ----

function TagPicker({
  title,
  icon,
  available,
  selected,
  onAdd,
  onRemove,
}: {
  title: string;
  icon: React.ReactNode;
  available: string[];
  selected: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [customInput, setCustomInput] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.toLowerCase();
    return available.filter((t) => t.toLowerCase().includes(q));
  }, [available, search]);

  const handleAddCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onAdd(trimmed);
      setCustomInput("");
    }
  };

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddCustom();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <Label className="text-sm font-medium text-slate-700">{title}</Label>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="rounded-lg ps-9"
        />
      </div>

      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((tag) => (
            <Badge
              key={tag}
              className="cursor-pointer gap-1 bg-red-500 text-white hover:bg-red-600"
              onClick={() => onRemove(tag)}
            >
              {tag}
              <X className="h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}

      {/* Available tags */}
      <div className="flex flex-wrap gap-2">
        {filtered
          .filter((t) => !selected.includes(t))
          .map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer gap-1 hover:bg-slate-100"
              onClick={() => onAdd(tag)}
            >
              <Plus className="h-3 w-3" />
              {tag}
            </Badge>
          ))}
      </div>

      {/* Custom add input */}
      <div className="flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={handleCustomKeyDown}
          placeholder="Ajouter un tag personnalis&eacute;..."
          className="rounded-lg text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          onClick={handleAddCustom}
          disabled={!customInput.trim()}
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>
    </div>
  );
}

// ---- Main component ----

export default function WizardStepTags({ data, onChange }: Props) {
  const [highlightInput, setHighlightInput] = useState("");

  // Get tag config for current universe (fallback to empty arrays)
  const tagConfig = data.universe ? TAG_CONFIG[data.universe] : null;
  const ambianceTags = tagConfig?.ambiance ?? [];
  const generalTags = tagConfig?.tags ?? [];
  const amenitiesTags = tagConfig?.amenities ?? [];

  // ---- Ambiance handlers ----
  const handleAddAmbiance = (tag: string) => {
    if (!data.ambiance_tags?.includes(tag)) {
      onChange({ ambiance_tags: [...(data.ambiance_tags || []), tag] });
    }
  };
  const handleRemoveAmbiance = (tag: string) => {
    onChange({
      ambiance_tags: (data.ambiance_tags || []).filter((t) => t !== tag),
    });
  };

  // ---- General tags handlers ----
  const handleAddTag = (tag: string) => {
    if (!data.general_tags?.includes(tag)) {
      onChange({ general_tags: [...(data.general_tags || []), tag] });
    }
  };
  const handleRemoveTag = (tag: string) => {
    onChange({ general_tags: (data.general_tags || []).filter((t) => t !== tag) });
  };

  // ---- Amenities handlers ----
  const handleAddAmenity = (tag: string) => {
    if (!data.amenities?.includes(tag)) {
      onChange({ amenities: [...(data.amenities || []), tag] });
    }
  };
  const handleRemoveAmenity = (tag: string) => {
    onChange({ amenities: (data.amenities || []).filter((t) => t !== tag) });
  };

  // ---- Highlights handlers ----
  const highlights = data.highlights || [];

  const addHighlight = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || highlights.includes(trimmed)) return;
    onChange({ highlights: [...highlights, trimmed] });
    setHighlightInput("");
  };

  const removeHighlight = (text: string) => {
    onChange({ highlights: highlights.filter((h) => h !== text) });
  };

  const handleHighlightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addHighlight(highlightInput);
    }
  };

  // ---- Social media handler ----
  const updateSocial = (key: string, value: string) => {
    const defaults = {
      instagram: "",
      facebook: "",
      snapchat: "",
      youtube: "",
      tiktok: "",
      tripadvisor: "",
      waze: "",
      google_maps: "",
    };
    onChange({
      social_links: {
        ...defaults,
        ...(data.social_links || {}),
        [key]: value,
      },
    });
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">
          Tags, &eacute;quipements &amp; r&eacute;seaux sociaux
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Personnalisez votre fiche avec des tags et ajoutez vos liens
        </p>
      </div>

      {/* ---- Section 1: Tags ambiance ---- */}
      {ambianceTags.length > 0 && (
        <TagPicker
          title="Tags ambiance"
          icon={<Palette className="h-4 w-4 text-slate-500" />}
          available={ambianceTags}
          selected={data.ambiance_tags || []}
          onAdd={handleAddAmbiance}
          onRemove={handleRemoveAmbiance}
        />
      )}

      {/* ---- Section 2: Tags g&eacute;n&eacute;raux ---- */}
      {generalTags.length > 0 && (
        <TagPicker
          title="Tags g&eacute;n&eacute;raux"
          icon={<Settings2 className="h-4 w-4 text-slate-500" />}
          available={generalTags}
          selected={data.general_tags || []}
          onAdd={handleAddTag}
          onRemove={handleRemoveTag}
        />
      )}

      {/* ---- Section 3: Equipements ---- */}
      {amenitiesTags.length > 0 && (
        <TagPicker
          title="&Eacute;quipements"
          icon={<Settings2 className="h-4 w-4 text-slate-500" />}
          available={amenitiesTags}
          selected={data.amenities || []}
          onAdd={handleAddAmenity}
          onRemove={handleRemoveAmenity}
        />
      )}

      {/* ---- Section 4: Points forts ---- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-slate-500" />
          <Label className="text-sm font-medium text-slate-700">
            Points forts
          </Label>
        </div>

        {/* Input + button */}
        <div className="flex gap-2">
          <Input
            value={highlightInput}
            onChange={(e) => setHighlightInput(e.target.value)}
            onKeyDown={handleHighlightKeyDown}
            placeholder="ex. Vue sur mer, Terrasse panoramique..."
            className="rounded-lg"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 gap-1"
            onClick={() => addHighlight(highlightInput)}
            disabled={!highlightInput.trim()}
          >
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>

        {/* Current highlights */}
        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {highlights.map((h) => (
              <Badge
                key={h}
                className="cursor-pointer gap-1 bg-red-500 text-white hover:bg-red-600"
                onClick={() => removeHighlight(h)}
              >
                {h}
                <X className="h-3 w-3" />
              </Badge>
            ))}
          </div>
        )}

        {/* Suggestions */}
        {HIGHLIGHTS_SUGGESTIONS && HIGHLIGHTS_SUGGESTIONS.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-xs text-slate-400">Suggestions :</span>
            <div className="flex flex-wrap gap-2">
              {HIGHLIGHTS_SUGGESTIONS.filter(
                (s) => !highlights.includes(s),
              ).map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="outline"
                  className="cursor-pointer gap-1 text-xs hover:bg-slate-100"
                  onClick={() => addHighlight(suggestion)}
                >
                  <Plus className="h-3 w-3" />
                  {suggestion}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Section 5: R&eacute;seaux sociaux ---- */}
      <div className="space-y-4">
        <Label className="text-sm font-medium text-slate-700">
          R&eacute;seaux sociaux &amp; liens
        </Label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Instagram */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-instagram"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <Instagram className="h-4 w-4" />
              Instagram
            </Label>
            <Input
              id="social-instagram"
              value={data.social_links?.instagram || ""}
              onChange={(e) => updateSocial("instagram", e.target.value)}
              placeholder="https://instagram.com/..."
              className="rounded-lg"
            />
          </div>

          {/* Facebook */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-facebook"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <Facebook className="h-4 w-4" />
              Facebook
            </Label>
            <Input
              id="social-facebook"
              value={data.social_links?.facebook || ""}
              onChange={(e) => updateSocial("facebook", e.target.value)}
              placeholder="https://facebook.com/..."
              className="rounded-lg"
            />
          </div>

          {/* Snapchat */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-snapchat"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <SnapchatIcon className="h-4 w-4" />
              Snapchat
            </Label>
            <Input
              id="social-snapchat"
              value={data.social_links?.snapchat || ""}
              onChange={(e) => updateSocial("snapchat", e.target.value)}
              placeholder="https://snapchat.com/add/..."
              className="rounded-lg"
            />
          </div>

          {/* YouTube */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-youtube"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <Youtube className="h-4 w-4" />
              YouTube
            </Label>
            <Input
              id="social-youtube"
              value={data.social_links?.youtube || ""}
              onChange={(e) => updateSocial("youtube", e.target.value)}
              placeholder="https://youtube.com/@..."
              className="rounded-lg"
            />
          </div>

          {/* TikTok */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-tiktok"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <TikTokIcon className="h-4 w-4" />
              TikTok
            </Label>
            <Input
              id="social-tiktok"
              value={data.social_links?.tiktok || ""}
              onChange={(e) => updateSocial("tiktok", e.target.value)}
              placeholder="https://tiktok.com/@..."
              className="rounded-lg"
            />
          </div>

          {/* TripAdvisor */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-tripadvisor"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15a3 3 0 110-6 3 3 0 010 6zm4 0a3 3 0 110-6 3 3 0 010 6zm2.5-7.5C16.5 7.57 14.43 6 12 6S7.5 7.57 7.5 9.5h2C9.5 8.67 10.67 8 12 8s2.5.67 2.5 1.5h2z" />
              </svg>
              TripAdvisor
            </Label>
            <Input
              id="social-tripadvisor"
              value={data.social_links?.tripadvisor || ""}
              onChange={(e) => updateSocial("tripadvisor", e.target.value)}
              placeholder="https://tripadvisor.com/..."
              className="rounded-lg"
            />
          </div>

          {/* Waze */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-waze"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M20.54 6.63C19.41 4.01 16.71 2 13.54 2c-3.67 0-6.67 2.67-7.38 6.16C3.09 8.83 1 11.32 1 14.25 1 17.42 3.58 20 6.75 20c.57 0 1.13-.08 1.67-.23C9.59 21.17 11.22 22 13 22c1.79 0 3.42-.83 4.58-2.23.53.15 1.09.23 1.67.23C22.42 20 25 17.42 25 14.25c0-2.93-2.09-5.42-5.16-6.09-.09-.52-.19-1.03-.3-1.53zM8.5 14c-.83 0-1.5-.67-1.5-1.5S7.67 11 8.5 11s1.5.67 1.5 1.5S9.33 14 8.5 14zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.9 2.4c-.9.9-2.1 1.35-3.9 1.35s-3-.45-3.9-1.35c-.3-.3-.3-.75 0-1.05.3-.3.75-.3 1.05 0 .6.6 1.5.9 2.85.9s2.25-.3 2.85-.9c.3-.3.75-.3 1.05 0 .3.3.3.75 0 1.05z" />
              </svg>
              Waze
            </Label>
            <Input
              id="social-waze"
              value={data.social_links?.waze || ""}
              onChange={(e) => updateSocial("waze", e.target.value)}
              placeholder="https://waze.com/ul/..."
              className="rounded-lg"
            />
          </div>

          {/* Google Maps */}
          <div className="space-y-1.5">
            <Label
              htmlFor="social-google_maps"
              className="flex items-center gap-2 text-xs text-slate-500"
            >
              <MapPin className="h-4 w-4" />
              Google Maps
            </Label>
            <Input
              id="social-google_maps"
              value={data.social_links?.google_maps || ""}
              onChange={(e) => updateSocial("google_maps", e.target.value)}
              placeholder="https://maps.google.com/..."
              className="rounded-lg"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
