import React, { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";

import { SearchSuggestionsDropdown, SuggestionItem } from "@/components/SearchSuggestionsDropdown";
import { useCitySuggestions } from "@/hooks/useSuggestions";
import { useI18n } from "@/lib/i18n";
import { useScrollContext } from "@/lib/scrollContext";

interface CityInputProps {
  value: string;
  onChange: (value: string, cityId?: string) => void;
  placeholder?: string;
  className?: string;
  /** Override input styles for special layouts like mobile hero */
  inputClassName?: string;
  /** Disable the input */
  disabled?: boolean;
}

export function CityInput({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName,
  disabled = false,
}: CityInputProps) {
  const { t } = useI18n();
  const { isScrolledPastSearch } = useScrollContext();
  const effectivePlaceholder = placeholder ?? t("search.field.city.placeholder");
  const myPositionLabel = t("suggestions.my_position");
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const isEmpty = inputValue.trim() === "";
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions = useCitySuggestions();

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Close dropdown when header sticky search bar appears
  useEffect(() => {
    if (isScrolledPastSearch && isOpen) {
      setIsOpen(false);
    }
  }, [isScrolledPastSearch, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectItem = (item: SuggestionItem) => {
    if (item.action !== "setCity") {
      setIsOpen(false);
      return;
    }

    if (item.payload.useGeolocation) {
      setInputValue(myPositionLabel);

      if (!navigator.geolocation) {
        onChange(myPositionLabel, "geo:unavailable");
        setIsOpen(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          onChange(myPositionLabel, `geo:${lat.toFixed(6)},${lng.toFixed(6)}`);
          setIsOpen(false);
        },
        () => {
          onChange(myPositionLabel, "geo:denied");
          setIsOpen(false);
        },
        { enableHighAccuracy: true, timeout: 10000 },
      );

      return;
    }

    setInputValue(item.label);
    onChange(item.label, item.id);
    setIsOpen(false);
  };

  return (
    <div className={`relative w-full group ${className}`} ref={containerRef}>
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-primary w-5 h-5 pointer-events-none transition-colors" />
      <input
        ref={inputRef}
        type="text"
        placeholder={effectivePlaceholder}
        value={inputValue}
        disabled={disabled}
        onChange={(e) => {
          if (disabled) return;
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => !disabled && setIsOpen(true)}
        className={inputClassName ?? `w-full pl-10 pr-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md text-sm text-slate-900 placeholder:text-slate-600 placeholder:font-normal transition-colors [font-family:Circular_Std,_sans-serif] ${
          disabled
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : `bg-slate-100 hover:border-slate-300 focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${isEmpty ? "italic" : "not-italic"}`
        }`}
        autoComplete="off"
      />
      <SearchSuggestionsDropdown
        groups={suggestions}
        onSelectItem={handleSelectItem}
        isOpen={isOpen}
        maxHeight="max-h-96"
      />
    </div>
  );
}
