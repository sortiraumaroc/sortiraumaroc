import { useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

interface LieuInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const LIEUX_SUGGESTIONS = [
  "Marrakech Medina",
  "Fès Medina",
  "Essaouira",
  "Casablanca",
  "Rabat",
  "Tanger",
  "Agadir",
  "Merzouga",
  "Atlas",
];

export function LieuInput({ value, onChange, className = "" }: LieuInputProps) {
  const [open, setOpen] = useState(false);

  const filteredSuggestions = value
    ? LIEUX_SUGGESTIONS.filter((lieu) =>
        lieu.toLowerCase().includes(value.toLowerCase())
      )
    : LIEUX_SUGGESTIONS;

  return (
    <div className={className}>
      <div className="relative">
        <MapPin className="absolute start-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
        <Input
          type="text"
          placeholder="Lieu"
          className="ps-10 w-full bg-white border-slate-200 focus:bg-slate-50"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {open && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg z-50">
            {filteredSuggestions.map((lieu) => (
              <button
                key={lieu}
                onClick={() => {
                  onChange(lieu);
                  setOpen(false);
                }}
                className="w-full text-start px-3 py-2 hover:bg-slate-100 text-sm"
              >
                📍 {lieu}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
