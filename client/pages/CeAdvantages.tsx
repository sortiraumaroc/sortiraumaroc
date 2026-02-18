/**
 * CeAdvantages — Employee advantages browsing page
 *
 * Route: /ce/avantages
 * Lists all CE advantages available to the connected employee
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  MapPin,
  Star,
  Tag,
  Percent,
  Gift,
  Package,
  RefreshCw,
  ArrowLeft,
  Filter,
  BadgePercent,
  Building2,
  SlidersHorizontal,
} from "lucide-react";
import { isAuthed, getConsumerAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { AdvantageWithEstablishment, AdvantageType } from "../../shared/ceTypes";

const ADVANTAGE_LABELS: Record<AdvantageType, { label: string; icon: React.ReactNode; color: string }> = {
  percentage: { label: "Réduction", icon: <Percent className="h-3.5 w-3.5" />, color: "bg-green-100 text-green-700" },
  fixed: { label: "Remise fixe", icon: <Tag className="h-3.5 w-3.5" />, color: "bg-blue-100 text-blue-700" },
  special_offer: { label: "Offre spéciale", icon: <BadgePercent className="h-3.5 w-3.5" />, color: "bg-purple-100 text-purple-700" },
  gift: { label: "Cadeau", icon: <Gift className="h-3.5 w-3.5" />, color: "bg-pink-100 text-pink-700" },
  pack: { label: "Pack", icon: <Package className="h-3.5 w-3.5" />, color: "bg-orange-100 text-orange-700" },
};

const UNIVERSE_OPTIONS = [
  { value: "all", label: "Tous les univers" },
  { value: "restaurant", label: "Restaurants" },
  { value: "hotel", label: "Hôtels" },
  { value: "wellness", label: "Bien-être" },
  { value: "loisir", label: "Loisirs" },
  { value: "shopping", label: "Shopping" },
  { value: "culture", label: "Culture" },
];

function AdvantageTypeBadge({ type, value }: { type: AdvantageType; value: number | null }) {
  const cfg = ADVANTAGE_LABELS[type] ?? ADVANTAGE_LABELS.special_offer;
  let displayValue = cfg.label;
  if (type === "percentage" && value) displayValue = `-${value}%`;
  else if (type === "fixed" && value) displayValue = `-${value} DH`;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", cfg.color)}>
      {cfg.icon} {displayValue}
    </span>
  );
}

function AdvantageCard({ adv }: { adv: AdvantageWithEstablishment }) {
  const universeSlug = adv.establishment_universe === "hotel" ? "hotel" : adv.establishment_universe === "wellness" ? "wellness" : adv.establishment_universe === "loisir" ? "loisir" : adv.establishment_universe === "shopping" ? "shopping" : adv.establishment_universe === "culture" ? "culture" : "restaurant";
  const detailPath = `/${universeSlug}/${adv.establishment_slug ?? adv.establishment_id}`;

  return (
    <Link to={detailPath}>
      <Card className="group overflow-hidden transition-shadow hover:shadow-md h-full">
        <div className="relative aspect-[16/10] bg-muted">
          {adv.establishment_cover_url ? (
            <img
              src={adv.establishment_cover_url}
              alt={adv.establishment_name ?? ""}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Building2 className="h-10 w-10 text-muted-foreground/40" />
            </div>
          )}
          <div className="absolute top-2 left-2">
            <AdvantageTypeBadge type={adv.advantage_type} value={adv.advantage_value} />
          </div>
        </div>

        <CardContent className="p-3 space-y-1.5">
          <h3 className="font-semibold text-sm leading-tight line-clamp-1 group-hover:text-primary">
            {adv.establishment_name}
          </h3>

          {adv.establishment_city && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" /> {adv.establishment_city}
            </p>
          )}

          {adv.establishment_category && (
            <p className="text-xs text-muted-foreground">{adv.establishment_category}</p>
          )}

          {adv.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{adv.description}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            {adv.establishment_rating != null && adv.establishment_rating > 0 && (
              <span className="inline-flex items-center gap-0.5 text-xs font-medium text-yellow-600">
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" /> {adv.establishment_rating.toFixed(1)}
              </span>
            )}
            {adv.conditions && (
              <span className="text-[10px] text-muted-foreground italic truncate max-w-[150px]">{adv.conditions}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function CeAdvantages() {
  const navigate = useNavigate();
  const [advantages, setAdvantages] = useState<AdvantageWithEstablishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [universe, setUniverse] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 24;

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getConsumerAccessToken();
      if (!token) {
        navigate("/");
        return;
      }
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (universe !== "all") params.set("universe", universe);

      const res = await fetch(`/api/ce/advantages?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setAdvantages(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, universe, navigate]);

  useEffect(() => {
    if (!isAuthed()) {
      navigate("/");
      return;
    }
    fetch_();
  }, [fetch_, navigate]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <h1 className="text-2xl font-bold">Vos Avantages CE</h1>
        <p className="text-sm text-muted-foreground mt-1">Découvrez les réductions et offres exclusives réservées aux salariés de votre entreprise.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un établissement..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-8"
          />
        </div>
        <Select value={universe} onValueChange={(v) => { setUniverse(v); setPage(1); }}>
          <SelectTrigger className="w-48">
            <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIVERSE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : advantages.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <BadgePercent className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-muted-foreground text-center">
            {search || universe !== "all"
              ? "Aucun avantage ne correspond à votre recherche."
              : "Aucun avantage CE disponible pour le moment."}
          </p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{total} avantage{total > 1 ? "s" : ""} disponible{total > 1 ? "s" : ""}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {advantages.map((adv) => (
              <AdvantageCard key={adv.id} adv={adv} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Précédent
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
