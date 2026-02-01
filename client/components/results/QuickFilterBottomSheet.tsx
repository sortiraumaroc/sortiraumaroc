import * as React from "react";
import { useEffect } from "react";
import { X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type QuickFilterType = "cuisine" | "ambiance" | "price";

export interface QuickFilterBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  type: QuickFilterType;
  title: string;
  options: readonly string[];
  selectedOptions: string[];
  onSelectionChange: (selected: string[]) => void;
  availableOptions?: string[]; // Options that exist in current results
  multiSelect?: boolean;
}

export function QuickFilterBottomSheet({
  isOpen,
  onClose,
  type,
  title,
  options,
  selectedOptions,
  onSelectionChange,
  availableOptions,
  multiSelect = true,
}: QuickFilterBottomSheetProps) {
  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Filter options to only show available ones if provided
  const displayedOptions = availableOptions
    ? options.filter((opt) => availableOptions.includes(opt))
    : options;

  const toggleOption = (option: string) => {
    if (multiSelect) {
      if (selectedOptions.includes(option)) {
        onSelectionChange(selectedOptions.filter((o) => o !== option));
      } else {
        onSelectionChange([...selectedOptions, option]);
      }
    } else {
      if (selectedOptions.includes(option)) {
        onSelectionChange([]);
      } else {
        onSelectionChange([option]);
      }
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet - Fixed height to match Date/Persons */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50",
          "bg-white rounded-t-3xl shadow-2xl",
          "h-[70vh] flex flex-col",
          "animate-in slide-in-from-bottom duration-300"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-slate-100">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <button
            onClick={clearAll}
            className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            Effacer
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 px-4">
          {displayedOptions.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Aucune option disponible pour les résultats actuels
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {displayedOptions.map((option) => {
                const isSelected = selectedOptions.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={cn(
                      "inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium transition-all border",
                      isSelected
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-slate-700 border-slate-200 hover:border-primary hover:text-primary"
                    )}
                  >
                    {isSelected && <Check className="w-4 h-4" />}
                    {option}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-slate-100 bg-white safe-area-inset-bottom">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-600">
              {selectedOptions.length > 0 ? (
                <span>{selectedOptions.length} sélectionné{selectedOptions.length > 1 ? "s" : ""}</span>
              ) : (
                <span>Aucune sélection</span>
              )}
            </div>
            <Button onClick={onClose} className="px-6">
              Appliquer
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
