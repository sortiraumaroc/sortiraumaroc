import React, { useState, useRef, useEffect } from "react";
import { Search } from "lucide-react";

import { SearchSuggestionsDropdown, SuggestionItem } from "@/components/SearchSuggestionsDropdown";
import { useActivitySuggestions } from "@/hooks/useSuggestions";
import { useI18n } from "@/lib/i18n";

interface ActivityInputProps {
  value: string;
  onChange: (value: string) => void;
  selectedCity?: string;
  placeholder?: string;
  className?: string;
}

export function ActivityInput({
  value,
  onChange,
  selectedCity,
  placeholder,
  className = "",
}: ActivityInputProps) {
  const { t } = useI18n();
  const effectivePlaceholder = placeholder ?? t("search.field.activity.placeholder");
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestions = useActivitySuggestions(selectedCity);

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
    if (item.action === "setQuery") {
      setInputValue(item.label);
      onChange(item.label);
    } else if (item.action === "applyFilters") {
      setInputValue(item.label);
    } else if (item.action === "goToListing") {
      setInputValue(item.label);
    } else if (item.action === "goToResults") {
      setInputValue(item.label);
    }

    setIsOpen(false);
  };

  const baseInputClass =
    "w-full ps-10 pe-4 py-2 h-10 md:h-11 border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-slate-100 text-gray-700 italic placeholder:text-gray-700 placeholder:italic placeholder:font-normal [font-family:Circular_Std,_sans-serif]";

  if (!selectedCity) {
    return (
      <div className={`relative col-span-2 md:col-span-1 ${className}`}>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            placeholder={effectivePlaceholder}
            disabled
            className={`${baseInputClass} cursor-not-allowed opacity-60`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative col-span-2 md:col-span-1 ${className}`} ref={containerRef}>
      <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        placeholder={effectivePlaceholder}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={baseInputClass}
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
