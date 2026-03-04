import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface SelectOption {
  id: string;
  label: string;
}

interface SelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isMobile?: boolean;
}

export function SelectModal({
  isOpen,
  onClose,
  title,
  options,
  value,
  onChange,
  placeholder = "Sélectionner une option",
  isMobile = false,
}: SelectModalProps) {
  const [selectedValue, setSelectedValue] = useState(value);

  useEffect(() => {
    setSelectedValue(value);
  }, [value]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (optionId: string) => {
    setSelectedValue(optionId);
    onChange(optionId);
    onClose();
  };

  if (isMobile) {
    // Mobile bottom sheet
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 z-40"
          onClick={onClose}
        />
        {/* Bottom sheet */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-lg shadow-lg max-h-[70vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-200">
            <h3 className="font-semibold text-base">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 hover:bg-slate-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {/* Options */}
          <div className="overflow-y-auto flex-1">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`w-full text-start px-4 py-3 border-b border-slate-100 text-sm italic ${
                  selectedValue === option.id
                    ? "bg-slate-50 text-gray-700 font-medium"
                    : "text-gray-700"
                } hover:bg-slate-50`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </>
    );
  }

  // Desktop modal
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-2xl w-11/12 max-w-sm max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-base">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Options */}
        <div className="overflow-y-auto flex-1">
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id)}
              className={`w-full text-start px-4 py-3 border-b border-slate-100 text-sm italic ${
                selectedValue === option.id
                  ? "bg-slate-50 text-gray-700 font-medium"
                  : "text-gray-700"
              } hover:bg-slate-50 transition`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
