import React from "react";
import { ChevronRight } from "lucide-react";

export interface SuggestionItem {
  id: string;
  label: string;
  type?: "city" | "neighborhood" | "establishment" | "activity" | "category" | "offer" | "trending" | "history";
  universe?: "restaurant" | "loisir" | "sport_bien_etre" | "hebergement" | "culture" | "shopping";
  action: "setCity" | "setQuery" | "applyFilters" | "goToListing" | "goToResults" | "selectHistory" | "removeHistory";
  payload?: Record<string, any>;
  icon?: React.ReactNode;
  description?: string;
  /** Secondary label shown below the main label */
  sublabel?: string;
  /** Custom trailing element (replaces default chevron) */
  trailing?: React.ReactNode;
}

export interface SuggestionGroup {
  title: string;
  items: SuggestionItem[];
}

interface SearchSuggestionsDropdownProps {
  groups: SuggestionGroup[];
  onSelectItem: (item: SuggestionItem) => void;
  isOpen: boolean;
  maxHeight?: string;
}

export function SearchSuggestionsDropdown({
  groups,
  onSelectItem,
  isOpen,
  maxHeight = "max-h-96",
}: SearchSuggestionsDropdownProps) {
  if (!isOpen) return null;

  return (
    <div
      className={`absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg border border-slate-200 z-40 ${maxHeight} overflow-y-auto`}
      role="listbox"
    >
      {groups.map((group, groupIndex) => (
        <div key={group.title} className={groupIndex > 0 ? "border-t border-slate-100" : ""}>
          {group.title && (
            <div className="px-4 py-2 bg-slate-50 sticky top-0 z-10">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {group.title}
              </p>
            </div>
          )}
          {group.items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectItem(item)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-pink-50 active:bg-pink-100 transition text-start"
              role="option"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {item.icon && <div className="flex-shrink-0 text-slate-400">{item.icon}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-slate-500 truncate mt-0.5">{item.sublabel}</p>
                  )}
                  {item.description && (
                    <p className="text-xs text-slate-500 truncate">{item.description}</p>
                  )}
                </div>
              </div>
              {item.trailing ? (
                <div className="flex-shrink-0 ms-2">{item.trailing}</div>
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0 ms-2" />
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
