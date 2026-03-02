/**
 * PriceTypeField — Champ prix avec sélecteur de type
 *
 * Permet de choisir : "Prix fixe" (+ input MAD), "Gratuit", "À la carte", "NC"
 */

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRICE_TYPE_LABELS, type PriceType } from "../../../shared/priceTypes";

const ENTRIES = Object.entries(PRICE_TYPE_LABELS) as [PriceType, string][];

type Props = {
  priceType: PriceType;
  onPriceTypeChange: (type: PriceType) => void;
  price: string;
  onPriceChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  error?: boolean;
  /** Taille compacte (h-8) pour les formulaires serrés */
  compact?: boolean;
};

export function PriceTypeField({
  priceType,
  onPriceTypeChange,
  price,
  onPriceChange,
  label,
  placeholder = "0",
  className,
  error,
  compact,
}: Props) {
  const h = compact ? "h-8 text-sm" : "h-9";

  return (
    <div className={className}>
      {label && <Label className="text-xs font-medium">{label}</Label>}
      <div className={`flex gap-2 ${label ? "mt-1" : ""}`}>
        <Select
          value={priceType}
          onValueChange={(v) => {
            onPriceTypeChange(v as PriceType);
            if (v !== "fixed") onPriceChange("");
          }}
        >
          <SelectTrigger className={`${h} ${priceType === "fixed" ? "w-[120px]" : "flex-1"}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ENTRIES.map(([value, lbl]) => (
              <SelectItem key={value} value={value}>
                {lbl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {priceType === "fixed" && (
          <div className="relative flex-1">
            <Input
              type="number"
              min={0}
              step={1}
              value={price}
              onChange={(e) => onPriceChange(e.target.value)}
              placeholder={placeholder}
              className={`${h} pe-12 ${error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              MAD
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
