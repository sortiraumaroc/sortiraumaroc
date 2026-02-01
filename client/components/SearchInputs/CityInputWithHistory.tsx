import React, { useState, useRef, useEffect, useMemo } from "react";
import { MapPin, History, X, Clock, ChevronRight } from "lucide-react";

import { SearchSuggestionsDropdown, SuggestionItem, SuggestionGroup } from "@/components/SearchSuggestionsDropdown";
import { useCitySuggestions } from "@/hooks/useSuggestions";
import { useI18n } from "@/lib/i18n";
import { useScrollContext } from "@/lib/scrollContext";
import type { ActivityCategory } from "@/lib/taxonomy";
import {
  getSearchHistory,
  removeSearchFromHistory,
  formatSearchSummary,
  formatRelativeTime,
  type SearchHistoryItem,
} from "@/lib/searchHistory";
import { cn } from "@/lib/utils";

interface CityInputWithHistoryProps {
  value: string;
  onChange: (value: string, cityId?: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  universe: ActivityCategory;
  /** Callback when a history item is selected - passes full search data */
  onHistorySelect?: (item: SearchHistoryItem) => void;
}

export function CityInputWithHistory({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName,
  disabled = false,
  universe,
  onHistorySelect,
}: CityInputWithHistoryProps) {
  const { t, locale } = useI18n();
  const { isScrolledPastSearch } = useScrollContext();
  const effectivePlaceholder = placeholder ?? t("search.field.city.placeholder");
  const myPositionLabel = t("suggestions.my_position");
  const [isOpen, setIsOpen] = useState(false);

  // Close dropdown when header sticky search bar appears
  useEffect(() => {
    if (isScrolledPastSearch && isOpen) {
      setIsOpen(false);
    }
  }, [isScrolledPastSearch, isOpen]);
  const [inputValue, setInputValue] = useState(value);
  const isEmpty = inputValue.trim() === "";
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const citySuggestions = useCitySuggestions();

  // Get search history
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    // Load history on mount
    setHistory(getSearchHistory());
  }, []);

  // Refresh history when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setHistory(getSearchHistory());
    }
  }, [isOpen]);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

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
    // Handle history selection
    if (item.action === "selectHistory" && item.payload?.historyItem) {
      const historyItem = item.payload.historyItem as SearchHistoryItem;
      setInputValue(historyItem.city);
      onChange(historyItem.city);
      onHistorySelect?.(historyItem);
      setIsOpen(false);
      return;
    }

    // Handle remove history
    if (item.action === "removeHistory" && item.payload?.historyId) {
      removeSearchFromHistory(item.payload.historyId);
      setHistory(getSearchHistory());
      return;
    }

    if (item.action !== "setCity") {
      setIsOpen(false);
      return;
    }

    if (item.payload?.useGeolocation) {
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

  // Build suggestions with history at the top
  const suggestionsWithHistory: SuggestionGroup[] = useMemo(() => {
    const groups: SuggestionGroup[] = [];

    // Add history group if there's history and input is empty or matches
    if (history.length > 0 && isEmpty) {
      const historyItems: SuggestionItem[] = history.slice(0, 3).map((item) => ({
        id: `history-${item.id}`,
        label: item.city,
        sublabel: formatSearchSummary(item, locale),
        icon: <Clock className="w-4 h-4 text-slate-400" />,
        action: "selectHistory" as const,
        payload: { historyItem: item },
        trailing: (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{formatRelativeTime(item.timestamp, locale)}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeSearchFromHistory(item.id);
                setHistory(getSearchHistory());
              }}
              className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              aria-label="Supprimer"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        ),
      }));

      groups.push({
        title: t("search.history.recent_searches"),
        items: historyItems,
      });
    }

    // Add city suggestions
    groups.push(...citySuggestions);

    return groups;
  }, [history, isEmpty, citySuggestions, locale, t]);

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
        className={inputClassName ?? cn(
          "w-full pl-10 pr-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md text-sm text-slate-900",
          "placeholder:text-slate-600 placeholder:font-normal transition-colors [font-family:Circular_Std,_sans-serif]",
          disabled
            ? "bg-slate-200 text-slate-400 cursor-not-allowed"
            : cn(
                "bg-slate-100 hover:border-slate-300",
                "focus-visible:border-primary/50 focus-visible:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                isEmpty ? "italic" : "not-italic"
              )
        )}
        autoComplete="off"
      />
      <SearchSuggestionsDropdown
        groups={suggestionsWithHistory}
        onSelectItem={handleSelectItem}
        isOpen={isOpen}
        maxHeight="max-h-96"
      />
    </div>
  );
}
