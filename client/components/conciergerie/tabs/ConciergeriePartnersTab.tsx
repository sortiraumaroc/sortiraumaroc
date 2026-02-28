/**
 * ConciergeriePartnersTab — Onglet "Partenaires" dans l'espace conciergerie.
 *
 * Deux vues :
 * 1. Liste des partenaires (avec commission négociée, stats, scoring)
 * 2. Moteur de recherche d'établissements (filtré par villes autorisées)
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  Handshake,
  MapPin,
  Star,
  Loader2,
  Building2,
  ChevronRight,
  Filter,
  XCircle,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConciergeProfile, ConciergePartnerStats, PartnerActivity } from "@shared/conciergerieTypes";
import { listPartners, searchEstablishments } from "@/lib/conciergerie/api";
import type { EstablishmentSearchResult } from "@/lib/conciergerie/api";

// ============================================================================
// Constants
// ============================================================================

const UNIVERSES = [
  { value: "restaurant", label: "Restaurant" },
  { value: "loisir", label: "Loisir" },
  { value: "hebergement", label: "Hébergement" },
  { value: "sport", label: "Sport" },
  { value: "culture", label: "Culture" },
  { value: "wellness", label: "Wellness" },
] as const;

// ============================================================================
// Component
// ============================================================================

type Props = {
  concierge: ConciergeProfile;
};

type ViewMode = "partners" | "search";

export default function ConciergeriePartnersTab({ concierge }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("partners");

  // -- Partners state --
  const [partners, setPartners] = useState<ConciergePartnerStats[]>([]);
  const [activity, setActivity] = useState<PartnerActivity[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);

  // -- Search state --
  const [searchQuery, setSearchQuery] = useState("");
  const [searchUniverse, setSearchUniverse] = useState<string>("");
  const [searchCategory, setSearchCategory] = useState("");
  const [searchResults, setSearchResults] = useState<EstablishmentSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [allowedCities, setAllowedCities] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -- Load partners on mount --
  useEffect(() => {
    loadPartners();
  }, []);

  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      const res = await listPartners();
      setPartners(res.partners);
      setActivity(res.activity);
    } catch {
      // silently fail
    } finally {
      setPartnersLoading(false);
    }
  }, []);

  // -- Search with debounce --
  const doSearch = useCallback(async (q: string, universe: string, category: string) => {
    setSearchLoading(true);
    setHasSearched(true);
    try {
      const res = await searchEstablishments({
        q: q || undefined,
        universe: universe || undefined,
        category: category || undefined,
        limit: 30,
      });
      setSearchResults(res.results);
      if (res.allowed_cities) setAllowedCities(res.allowed_cities);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Auto-search on filter change
  useEffect(() => {
    if (viewMode !== "search") return;
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      doSearch(searchQuery, searchUniverse, searchCategory);
    }, 400);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQuery, searchUniverse, searchCategory, viewMode, doSearch]);

  // Load initial search when switching to search mode
  useEffect(() => {
    if (viewMode === "search" && !hasSearched) {
      doSearch("", "", "");
    }
  }, [viewMode, hasSearched, doSearch]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="space-y-4">
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          {viewMode === "partners" ? "Mes partenaires" : "Rechercher un établissement"}
        </h2>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === "partners" ? "default" : "outline"}
            onClick={() => setViewMode("partners")}
            className="gap-1.5"
          >
            <Handshake className="h-3.5 w-3.5" />
            Partenaires
          </Button>
          <Button
            size="sm"
            variant={viewMode === "search" ? "default" : "outline"}
            onClick={() => setViewMode("search")}
            className="gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            Recherche
          </Button>
        </div>
      </div>

      {viewMode === "partners" ? (
        <PartnersView
          partners={partners}
          activity={activity}
          loading={partnersLoading}
          onRefresh={loadPartners}
        />
      ) : (
        <SearchView
          query={searchQuery}
          onQueryChange={setSearchQuery}
          universe={searchUniverse}
          onUniverseChange={setSearchUniverse}
          category={searchCategory}
          onCategoryChange={setSearchCategory}
          results={searchResults}
          loading={searchLoading}
          allowedCities={allowedCities}
          hasSearched={hasSearched}
        />
      )}
    </div>
  );
}

// ============================================================================
// Partners View
// ============================================================================

function PartnersView({
  partners,
  activity,
  loading,
  onRefresh,
}: {
  partners: ConciergePartnerStats[];
  activity: PartnerActivity[];
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Handshake className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            Aucun partenaire pour le moment.
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Les partenaires sont ajoutés par l'administrateur avec des commissions négociées.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort by score descending
  const sorted = [...partners].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Partenaires actifs"
          value={partners.filter((p) => p.status === "active").length}
        />
        <StatCard
          label="Commission moy."
          value={`${Math.round(partners.reduce((s, p) => s + p.commission_rate, 0) / partners.length)}%`}
        />
        <StatCard
          label="Réservations"
          value={partners.reduce((s, p) => s + p.total_confirmed_bookings, 0)}
        />
        <StatCard
          label="CA total"
          value={formatPrice(partners.reduce((s, p) => s + p.total_revenue, 0))}
        />
      </div>

      {/* Partner cards */}
      <div className="space-y-3">
        {sorted.map((p) => (
          <PartnerCard key={p.id} partner={p} />
        ))}
      </div>

      {/* Recent activity */}
      {activity.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-3">
              Activité récente
            </h3>
            <div className="space-y-2">
              {activity.slice(0, 5).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      a.type === "request_accepted"
                        ? "bg-emerald-500"
                        : a.type === "request_refused"
                          ? "bg-red-500"
                          : "bg-blue-500"
                    }`}
                  />
                  <span className="font-medium">{a.establishment_name}</span>
                  <span className="text-slate-400">
                    {a.type === "request_accepted"
                      ? "a accepté"
                      : a.type === "request_refused"
                        ? "a refusé"
                        : "ajouté"}
                  </span>
                  {a.details && <span className="text-slate-500">{a.details}</span>}
                  <span className="ml-auto text-slate-400">
                    {formatRelativeDate(a.date)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Search View
// ============================================================================

function SearchView({
  query,
  onQueryChange,
  universe,
  onUniverseChange,
  category,
  onCategoryChange,
  results,
  loading,
  allowedCities,
  hasSearched,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  universe: string;
  onUniverseChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  results: EstablishmentSearchResult[];
  loading: boolean;
  allowedCities: string[];
  hasSearched: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Zone info */}
      {allowedCities.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5" />
          <span>Zone :</span>
          {allowedCities.map((c) => (
            <Badge key={c} variant="secondary" className="text-xs font-normal">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {/* Search bar + filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Rechercher par nom..."
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="pl-9"
            />
            {query && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => onQueryChange("")}
              >
                <XCircle className="h-4 w-4 text-slate-300 hover:text-slate-500" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <Select value={universe || "all"} onValueChange={(v) => onUniverseChange(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[160px] h-8 text-xs">
                <SelectValue placeholder="Univers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les univers</SelectItem>
                {UNIVERSES.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              placeholder="Catégorie..."
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-[160px] h-8 text-xs"
            />

            {(universe || category || query) && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs text-slate-500"
                onClick={() => {
                  onQueryChange("");
                  onUniverseChange("");
                  onCategoryChange("");
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : results.length === 0 && hasSearched ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              Aucun établissement trouvé.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Essayez de modifier vos critères de recherche.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((est) => (
            <EstablishmentCard key={est.id} establishment={est} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="p-3 text-center">
        <div className="text-lg font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </CardContent>
    </Card>
  );
}

function PartnerCard({ partner: p }: { partner: ConciergePartnerStats }) {
  const badgeEmoji =
    p.badge === "gold" ? "🥇" : p.badge === "silver" ? "🥈" : p.badge === "bronze" ? "🥉" : "";

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Cover */}
          {p.establishment_cover_url ? (
            <img
              src={p.establishment_cover_url}
              alt={p.establishment_name}
              className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-6 w-6 text-slate-300" />
            </div>
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">
                {badgeEmoji} {p.establishment_name}
              </span>
              <Badge className="bg-amber-100 text-amber-800 text-xs font-bold shrink-0">
                {p.commission_rate}%
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              {p.establishment_city && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {p.establishment_city}
                </span>
              )}
              {p.establishment_universe && (
                <Badge variant="outline" className="text-[10px] h-4">
                  {p.establishment_universe}
                </Badge>
              )}
            </div>

            {/* Metrics row */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
              <span>
                Score : <b className="text-slate-900">{p.score}</b>/100
              </span>
              <span>
                Acceptation : <b>{p.acceptance_rate}%</b>
              </span>
              <span>
                Réservations : <b>{p.total_confirmed_bookings}</b>
              </span>
              {p.total_revenue > 0 && (
                <span>
                  CA : <b>{formatPrice(p.total_revenue)}</b>
                </span>
              )}
            </div>

            {/* Score bar */}
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  p.score >= 80
                    ? "bg-amber-500"
                    : p.score >= 60
                      ? "bg-slate-400"
                      : p.score >= 40
                        ? "bg-orange-400"
                        : "bg-slate-300"
                }`}
                style={{ width: `${Math.min(100, p.score)}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EstablishmentCard({ establishment: est }: { establishment: EstablishmentSearchResult }) {
  return (
    <Card className="hover:shadow-sm transition-shadow overflow-hidden">
      {/* Cover image */}
      {est.cover_url ? (
        <img
          src={est.cover_url}
          alt={est.name}
          className="w-full h-32 object-cover"
        />
      ) : (
        <div className="w-full h-32 bg-slate-100 flex items-center justify-center">
          <Building2 className="h-8 w-8 text-slate-300" />
        </div>
      )}

      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 truncate">{est.name}</h4>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              {est.city && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {est.city}
                </span>
              )}
              {est.universe && (
                <Badge variant="outline" className="text-[10px] h-4">
                  {est.universe}
                </Badge>
              )}
            </div>
          </div>

          {est.rating != null && est.rating > 0 && (
            <div className="flex items-center gap-0.5 text-xs text-amber-600 shrink-0">
              <Star className="h-3 w-3 fill-amber-400" />
              {est.rating.toFixed(1)}
            </div>
          )}
        </div>

        {/* Partner badge */}
        {est.is_partner && (
          <div className="mt-2 flex items-center gap-1.5">
            <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
              <Handshake className="h-3 w-3" />
              Partenaire · {est.partner_commission}%
            </Badge>
          </div>
        )}

        {est.category && (
          <div className="mt-1.5 text-xs text-slate-400">{est.category}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatPrice(centimes: number): string {
  if (centimes === 0) return "0 DH";
  return `${(centimes / 100).toLocaleString("fr-MA")} DH`;
}

function formatRelativeDate(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}j`;
}
