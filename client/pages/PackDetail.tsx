/**
 * Page /packs/:id — 5.4: Page détail d'un Pack
 *
 * Photo principale + galerie, titre, descriptions, inclusions/exclusions,
 * conditions, prix, stock, code promo, bouton acheter.
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Gift, ChevronLeft, Percent, Users, Clock, Calendar, MapPin,
  Check, X, Tag, ChevronDown, ChevronUp, ShoppingBag, AlertTriangle,
} from "lucide-react";

import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { AuthModalV2 } from "@/components/AuthModalV2";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { isAuthed } from "@/lib/auth";
import { usePackDetail, usePurchasePack } from "@/hooks/usePacksV2";
import type { PackV2 } from "../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function discountPercent(original: number, price: number): number {
  if (!original || original <= price) return 0;
  return Math.round(((original - price) / original) * 100);
}

function validDaysLabel(days: number[] | null): string {
  if (!days || days.length === 0 || days.length === 7) return "Tous les jours";
  const DAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  return days.map((d) => DAYS[d] ?? "").join(", ");
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

// =============================================================================
// Gallery
// =============================================================================

function PackGallery({ pack }: { pack: PackV2 }) {
  const photos = [
    ...(pack.cover_url ? [pack.cover_url] : []),
    ...(pack.additional_photos ?? []),
  ];
  const [activeIdx, setActiveIdx] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="relative h-64 sm:h-80 lg:h-96 rounded-2xl bg-gradient-to-br from-[#a3001d]/10 to-[#a3001d]/5 flex items-center justify-center">
        <Gift className="h-16 w-16 text-[#a3001d]/30" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative h-64 sm:h-80 lg:h-96 rounded-2xl overflow-hidden bg-slate-100">
        <img
          src={photos[activeIdx]}
          alt={pack.title}
          className="w-full h-full object-cover"
        />
      </div>
      {photos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveIdx(i)}
              className={cn(
                "shrink-0 h-16 w-16 rounded-xl overflow-hidden border-2 transition",
                i === activeIdx ? "border-[#a3001d]" : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PromoCodeInput
// =============================================================================

function PromoCodeInput({
  packId,
  packPrice,
  establishmentId,
  onResult,
}: {
  packId: string;
  packPrice: number;
  establishmentId: string;
  onResult: (result: { valid: boolean; discountCents?: number; promoCodeId?: string; error?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const { checkPromo, promoLoading, promoResult, clearPromo } = usePurchasePack();

  const handleCheck = async () => {
    if (!code.trim()) return;
    const res = await checkPromo(packId, code.trim(), packPrice, establishmentId);
    onResult(res);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <span className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-[#a3001d]" />
          Code promo
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Entrez votre code"
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 uppercase"
            />
            <Button
              type="button"
              onClick={handleCheck}
              disabled={promoLoading || !code.trim()}
              className="h-10 px-4 bg-[#a3001d] text-white text-sm font-semibold rounded-lg"
            >
              {promoLoading ? "..." : "Appliquer"}
            </Button>
          </div>
          {promoResult && (
            <div className={cn("text-sm px-3 py-2 rounded-lg", promoResult.valid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
              {promoResult.valid
                ? `Réduction de ${formatCurrency(promoResult.discountCents ?? 0)} appliquée !`
                : promoResult.error ?? "Code invalide"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PackDetail page
// =============================================================================

export default function PackDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { pack, loading, error, refetch } = usePackDetail(id ?? null);
  const { purchase, purchasing, result: purchaseResult, error: purchaseError, reset: resetPurchase } = usePurchasePack();

  const [authOpen, setAuthOpen] = useState(false);
  const [promoCodeId, setPromoCodeId] = useState<string | undefined>();
  const [discountCents, setDiscountCents] = useState(0);

  const handlePromoResult = useCallback((res: { valid: boolean; discountCents?: number; promoCodeId?: string }) => {
    if (res.valid) {
      setPromoCodeId(res.promoCodeId);
      setDiscountCents(res.discountCents ?? 0);
    } else {
      setPromoCodeId(undefined);
      setDiscountCents(0);
    }
  }, []);

  const handleBuy = useCallback(async () => {
    if (!pack) return;
    if (!isAuthed()) {
      setAuthOpen(true);
      return;
    }
    await purchase(pack.id, {
      promo_code: promoCodeId,
    });
  }, [pack, promoCodeId, purchase]);

  const onAuthSuccess = () => {
    setAuthOpen(false);
    handleBuy();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="py-20 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
          <p className="mt-3 text-sm text-slate-500">Chargement...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !pack) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="py-20 text-center">
          <Gift className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-3 text-base font-semibold text-slate-700">{error ?? "Pack introuvable"}</p>
          <Link to="/packs" className="mt-4 inline-flex items-center gap-1 text-sm text-[#a3001d] font-semibold hover:text-[#a3001d]/80">
            <ChevronLeft className="h-4 w-4" /> Retour aux packs
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const discount = discountPercent(pack.original_price ?? 0, pack.price);
  const stock = pack.stock;
  const sold = pack.sold_count ?? 0;
  const remaining = stock ? stock - sold : null;
  const isSoldOut = remaining !== null && remaining <= 0;
  const lowStock = remaining !== null && stock ? remaining / stock <= 0.2 : false;
  const finalPrice = Math.max(0, pack.price - discountCents);
  const establishmentId = pack.establishment_id;

  // Purchase success screen
  if (purchaseResult) {
    return (
      <div className="min-h-screen bg-slate-50">
        <Header />
        <div className="container mx-auto px-4 py-12 max-w-lg text-center">
          <div className="bg-white rounded-2xl border border-emerald-200 p-8 space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Achat confirmé !</h2>
            <p className="text-sm text-slate-600">
              Votre pack "{pack.title}" est prêt. Retrouvez-le dans votre espace "Mes Packs".
            </p>
            <div className="pt-4 space-y-2">
              <Button
                onClick={() => navigate("/profile?tab=packs")}
                className="w-full h-11 bg-[#a3001d] text-white font-semibold rounded-xl"
              >
                Voir mes Packs
              </Button>
              <Button
                onClick={() => { resetPurchase(); refetch(); }}
                variant="outline"
                className="w-full h-11 rounded-xl"
              >
                Retour au pack
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        {/* Back link */}
        <Link
          to="/packs"
          className="inline-flex items-center gap-1 text-sm text-[#a3001d] font-semibold hover:text-[#a3001d]/80 mb-4"
        >
          <ChevronLeft className="h-4 w-4" /> Tous les packs
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
          {/* Left: Gallery */}
          <div className="lg:col-span-3">
            <PackGallery pack={pack} />
          </div>

          {/* Right: Info + Purchase */}
          <div className="lg:col-span-2 space-y-5">
            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              {discount > 0 && (
                <span className="inline-flex items-center gap-1 bg-[#a3001d] text-white rounded-full px-3 py-1 text-xs font-bold">
                  <Percent className="h-3 w-3" /> -{discount}%
                </span>
              )}
              {lowStock && remaining !== null && (
                <span className="inline-flex items-center gap-1 bg-red-500 text-white rounded-full px-3 py-1 text-xs font-bold">
                  <AlertTriangle className="h-3 w-3" /> {remaining} restant{remaining > 1 ? "s" : ""}
                </span>
              )}
              {isSoldOut && (
                <span className="bg-slate-400 text-white rounded-full px-3 py-1 text-xs font-bold">
                  Épuisé
                </span>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{pack.title}</h1>

            {/* Establishment link */}
            {establishmentId && (
              <div className="flex items-center gap-1.5 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>Proposé par un établissement partenaire</span>
              </div>
            )}

            {/* Descriptions */}
            {pack.short_description && (
              <p className="text-base text-slate-700">{pack.short_description}</p>
            )}
            {pack.detailed_description && (
              <p className="text-sm text-slate-600 leading-relaxed">{pack.detailed_description}</p>
            )}

            {/* Inclusions */}
            {pack.inclusions && pack.inclusions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">Inclus</h3>
                <ul className="space-y-1.5">
                  {pack.inclusions.map((inc, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                      <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-medium">{inc.label}</span>
                        {inc.description && <span className="text-slate-500 ms-1">— {inc.description}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Exclusions */}
            {pack.exclusions && pack.exclusions.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2">Non inclus</h3>
                <ul className="space-y-1.5">
                  {pack.exclusions.map((exc, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-500">
                      <X className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <span>{exc.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Details */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {pack.party_size && pack.party_size > 1 && (
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Users className="h-4 w-4 text-slate-400" />
                  <span>{pack.party_size} personnes</span>
                </div>
              )}
              {pack.valid_days && pack.valid_days.length > 0 && pack.valid_days.length < 7 && (
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  <span>{validDaysLabel(pack.valid_days)}</span>
                </div>
              )}
              {pack.valid_time_start && pack.valid_time_end && (
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Clock className="h-4 w-4 text-slate-400" />
                  <span>{pack.valid_time_start} - {pack.valid_time_end}</span>
                </div>
              )}
              {pack.is_multi_use && pack.total_uses && pack.total_uses > 1 && (
                <div className="flex items-center gap-2 text-slate-700 bg-slate-50 rounded-xl px-3 py-2.5">
                  <Tag className="h-4 w-4 text-slate-400" />
                  <span>{pack.total_uses} utilisations</span>
                </div>
              )}
            </div>

            {/* Validity dates */}
            {(pack.validity_start_date || pack.validity_end_date) && (
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                Valable{pack.validity_start_date ? ` du ${formatDate(pack.validity_start_date)}` : ""}
                {pack.validity_end_date ? ` au ${formatDate(pack.validity_end_date)}` : ""}
              </div>
            )}

            {/* Conditions */}
            {pack.conditions && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
                <span className="font-semibold text-slate-700">Conditions :</span> {pack.conditions}
              </div>
            )}

            {/* Promo code */}
            {!isSoldOut && (
              <PromoCodeInput
                packId={pack.id}
                packPrice={pack.price}
                establishmentId={establishmentId}
                onResult={handlePromoResult}
              />
            )}

            {/* Price + Buy */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-bold text-[#a3001d]">{formatCurrency(finalPrice)}</div>
                  {(pack.original_price && pack.original_price > pack.price) || discountCents > 0 ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      {pack.original_price && pack.original_price > pack.price && (
                        <span className="text-sm text-slate-400 line-through">{formatCurrency(pack.original_price)}</span>
                      )}
                      {discountCents > 0 && (
                        <span className="text-xs text-emerald-600 font-semibold">
                          -{formatCurrency(discountCents)} (promo)
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
                {remaining !== null && !isSoldOut && (
                  <span className="text-xs text-slate-500">{remaining} disponible{remaining > 1 ? "s" : ""}</span>
                )}
              </div>

              {purchaseError && (
                <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{purchaseError}</div>
              )}

              <Button
                type="button"
                onClick={handleBuy}
                disabled={isSoldOut || purchasing}
                className={cn(
                  "w-full h-12 text-base font-bold rounded-xl",
                  isSoldOut
                    ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                    : "bg-[#a3001d] hover:bg-[#a3001d]/90 text-white",
                )}
              >
                {purchasing ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Achat en cours...
                  </span>
                ) : isSoldOut ? (
                  "Épuisé"
                ) : (
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="h-5 w-5" />
                    Acheter ce Pack
                  </span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <AuthModalV2
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthed={onAuthSuccess}
      />
    </div>
  );
}
