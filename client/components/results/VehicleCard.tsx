import { memo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Gauge,
  Car,
  MapPin,
  Check,
  Zap,
  Fuel,
  Shield,
  Star,
  Tag
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export interface VehicleCardProps {
  id: string;
  // Vehicle info
  category: string; // "SUV intermédiaire", "Économique", etc.
  model: string; // "Hyundai IX35 ou similaire"
  image: string;

  // Specs
  seats: number;
  transmission: "Automatique" | "Manuelle";
  fuelType: "Essence" | "Diesel" | "Électrique" | "Hybride";

  // Features
  unlimitedMileage?: boolean;
  pickupLocation?: string; // "Comptoir de l'agence et voiture dans le terminal"

  // Benefits
  freeCancellation?: boolean;
  basicInsurance?: boolean;
  onlineCheckIn?: boolean;

  // Supplier
  supplierName: string;
  supplierLogo?: string;
  supplierRating?: number; // percentage of positive reviews

  // Pricing
  originalPrice?: number;
  price: number;
  discount?: number; // e.g. 30 for "30 € de réduction"
  priceLabel?: string; // "total" or "par jour"

  // Badges
  isSuperOffer?: boolean;
  isMemberPrice?: boolean;
  cashbackAmount?: number; // e.g. 4.26 for "Gagnez 4,26 € en OneKeyCash"

  // Navigation
  detailsHref: string;

  // State
  isSelected?: boolean;
  onSelect?: () => void;
}

export const VehicleCard = memo(function VehicleCard({
  id,
  category,
  model,
  image,
  seats,
  transmission,
  fuelType,
  unlimitedMileage = false,
  pickupLocation,
  freeCancellation = false,
  basicInsurance = false,
  onlineCheckIn = false,
  supplierName,
  supplierLogo,
  supplierRating,
  originalPrice,
  price,
  discount,
  priceLabel = "total",
  isSuperOffer = false,
  isMemberPrice = false,
  cashbackAmount,
  detailsHref,
  isSelected = false,
  onSelect,
}: VehicleCardProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const getFuelIcon = () => {
    switch (fuelType) {
      case "Électrique":
        return <Zap className="w-4 h-4" />;
      case "Hybride":
        return <Zap className="w-4 h-4" />;
      default:
        return <Fuel className="w-4 h-4" />;
    }
  };

  const getFuelColor = () => {
    switch (fuelType) {
      case "Électrique":
        return "text-green-600";
      case "Hybride":
        return "text-blue-600";
      default:
        return "text-slate-600";
    }
  };

  const handleClick = () => {
    if (onSelect) {
      onSelect();
    }
    navigate(detailsHref);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        "bg-white rounded-xl border overflow-hidden cursor-pointer transition-all duration-200",
        "hover:shadow-lg hover:border-primary/30",
        isSelected ? "border-primary ring-2 ring-primary/20" : "border-slate-200"
      )}
    >
      <div className="p-4">
        {/* Badges */}
        {(isSuperOffer || isMemberPrice) && (
          <div className="flex flex-wrap gap-2 mb-3">
            {isSuperOffer && (
              <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold bg-green-600 text-white">
                {t("vehicle.badge.super_offer")}
              </span>
            )}
            {isMemberPrice && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-blue-600 text-white">
                <Tag className="w-3 h-3" />
                {t("vehicle.badge.member_price")}
              </span>
            )}
          </div>
        )}

        <div className="flex gap-4">
          {/* Left side - Vehicle info */}
          <div className="flex-1 min-w-0">
            {/* Fuel type */}
            <div className={cn("flex items-center gap-1 text-sm font-medium mb-1", getFuelColor())}>
              {getFuelIcon()}
              <span>{fuelType}</span>
            </div>

            {/* Category */}
            <h3 className="text-lg font-bold text-slate-900 mb-0.5">
              {category}
            </h3>

            {/* Model */}
            <p className="text-sm text-slate-600 mb-3">
              {model}
            </p>

            {/* Specs */}
            <div className="flex items-center gap-4 text-sm text-slate-700 mb-3">
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>{seats}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-slate-400" />
                <span>{transmission}</span>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-1.5 text-sm">
              {unlimitedMileage && (
                <div className="flex items-center gap-2 text-slate-600">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center">
                    <Car className="w-3 h-3 text-slate-500" />
                  </div>
                  <span>{t("vehicle.feature.unlimited_mileage")}</span>
                </div>
              )}
              {pickupLocation && (
                <div className="flex items-start gap-2 text-slate-600">
                  <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-3 h-3 text-slate-500" />
                  </div>
                  <span className="line-clamp-2">{pickupLocation}</span>
                </div>
              )}
            </div>

            {/* Cashback */}
            {cashbackAmount && cashbackAmount > 0 && (
              <p className="text-sm text-green-600 font-medium mt-3">
                {t("vehicle.cashback", { amount: cashbackAmount.toFixed(2) })}
              </p>
            )}

            {/* Benefits */}
            <div className="mt-3 space-y-1">
              {freeCancellation && (
                <div className="flex items-center gap-1.5 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-green-500" />
                  <span>{t("vehicle.benefit.free_cancellation")}</span>
                </div>
              )}
              {basicInsurance && (
                <div className="flex items-center gap-1.5 text-sm text-blue-600">
                  <Shield className="w-4 h-4" />
                  <span>{t("vehicle.benefit.basic_insurance")}</span>
                </div>
              )}
              {onlineCheckIn && (
                <div className="flex items-center gap-1.5 text-sm text-blue-600">
                  <Check className="w-4 h-4" />
                  <span>{t("vehicle.benefit.online_checkin")}</span>
                </div>
              )}
            </div>

            {/* Supplier */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
              {supplierLogo ? (
                <img src={supplierLogo} alt={supplierName} className="h-5 object-contain" />
              ) : (
                <span className="text-sm font-medium text-slate-700">{supplierName}</span>
              )}
              {supplierRating && (
                <div className="flex items-center gap-1 text-sm text-slate-600">
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <span>{supplierRating}% {t("vehicle.positive_reviews")}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right side - Image and price */}
          <div className="flex flex-col items-end justify-between w-[140px] flex-shrink-0">
            {/* Vehicle image */}
            <div className="w-full h-24 flex items-center justify-center">
              <img
                src={image}
                alt={`${category} - ${model}`}
                className="max-w-full max-h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=300&h=200&fit=crop";
                }}
              />
            </div>

            {/* Price section */}
            <div className="text-right mt-4">
              {discount && discount > 0 && (
                <span className="inline-block px-2 py-1 mb-2 text-xs font-semibold bg-green-100 text-green-700 rounded">
                  {discount} € {t("vehicle.discount")}
                </span>
              )}
              <div className="flex items-baseline justify-end gap-2">
                {originalPrice && originalPrice > price && (
                  <span className="text-sm text-slate-400 line-through">
                    {originalPrice} €
                  </span>
                )}
                <span className="text-2xl font-bold text-slate-900">
                  {price} €
                </span>
              </div>
              <span className="text-xs text-slate-500">{priceLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VehicleCard;
