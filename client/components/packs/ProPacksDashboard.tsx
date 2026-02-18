/**
 * ProPacksDashboard — 5.6: Dashboard Pro onglet "Mes Packs"
 *
 * Création/modification/soumission de Packs.
 * Liste des Packs avec statuts et actions.
 * Statistiques par Pack. Scan QR. Codes promo.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Gift, Plus, Eye, Pause, Play, Copy, BarChart3, QrCode,
  Tag, Edit, Send, XCircle, Trash2, ChevronDown, ChevronUp,
  CheckCircle, Clock, AlertTriangle, RefreshCw, Camera,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  listProPacks, createProPack, updateProPack, submitPackForModeration,
  suspendPack, resumePack, closePack, duplicatePack, getPackStats,
  scanQrAndConsume,
  listProPackPromos, createProPackPromo, updateProPackPromo, deleteProPackPromo,
  type CreatePackInput, type PackStats, type ScanResult, type CreatePromoInput,
} from "@/lib/packsV2ProApi";
import type { PackV2, PackModerationStatus, PackPromoCode } from "../../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function moderationBadge(status: PackModerationStatus): { text: string; className: string } {
  switch (status) {
    case "draft": return { text: "Brouillon", className: "bg-slate-100 text-slate-600" };
    case "pending_moderation": return { text: "En attente", className: "bg-amber-100 text-amber-700" };
    case "approved": return { text: "Approuvé", className: "bg-blue-100 text-blue-700" };
    case "active": return { text: "Actif", className: "bg-emerald-100 text-emerald-700" };
    case "rejected": return { text: "Rejeté", className: "bg-red-100 text-red-700" };
    case "modification_requested": return { text: "Modification", className: "bg-orange-100 text-orange-700" };
    case "suspended": return { text: "Suspendu", className: "bg-slate-200 text-slate-600" };
    case "ended": return { text: "Terminé", className: "bg-slate-100 text-slate-500" };
    case "sold_out": return { text: "Épuisé", className: "bg-red-50 text-red-600" };
    default: return { text: status, className: "bg-slate-100 text-slate-600" };
  }
}

// =============================================================================
// Sub-tabs
// =============================================================================

type ProPacksTab = "list" | "create" | "scan" | "promos";

// =============================================================================
// PackListItem
// =============================================================================

function PackListItem({
  pack,
  onAction,
}: {
  pack: PackV2;
  onAction: (action: string, packId: string) => void;
}) {
  const badge = moderationBadge(pack.moderation_status);
  const [showStats, setShowStats] = useState(false);
  const [stats, setStats] = useState<PackStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = async () => {
    if (stats) { setShowStats(!showStats); return; }
    setStatsLoading(true);
    try {
      const s = await getPackStats(pack.id);
      setStats(s);
      setShowStats(true);
    } catch {
      // silent
    } finally {
      setStatsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold", badge.className)}>
              {badge.text}
            </span>
          </div>
          <h4 className="text-sm font-bold text-slate-900 truncate">{pack.title}</h4>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
            <span>{formatCurrency(pack.price)}</span>
            {pack.stock && (
              <span>Stock: {pack.sold_count ?? 0}/{pack.stock}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5">
          {pack.moderation_status === "draft" || pack.moderation_status === "modification_requested" ? (
            <>
              <button onClick={() => onAction("edit", pack.id)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Modifier">
                <Edit className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onAction("submit", pack.id)} className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100" title="Soumettre">
                <Send className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
          {pack.moderation_status === "active" && (
            <button onClick={() => onAction("suspend", pack.id)} className="h-8 w-8 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center text-amber-600 hover:bg-amber-100" title="Suspendre">
              <Pause className="h-3.5 w-3.5" />
            </button>
          )}
          {pack.moderation_status === "suspended" && (
            <button onClick={() => onAction("resume", pack.id)} className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100" title="Reprendre">
              <Play className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => onAction("duplicate", pack.id)} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Dupliquer">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={loadStats} className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50" title="Statistiques">
            {statsLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
          </button>
          {!["ended", "sold_out"].includes(pack.moderation_status) && (
            <button onClick={() => onAction("close", pack.id)} className="h-8 w-8 rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100" title="Clôturer">
              <XCircle className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Stats panel */}
      {showStats && stats && (
        <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500">Vendus</span>
            <div className="font-bold text-slate-900">{stats.soldCount}</div>
          </div>
          <div>
            <span className="text-slate-500">Consommés</span>
            <div className="font-bold text-slate-900">{stats.consumedCount}</div>
          </div>
          <div>
            <span className="text-slate-500">Stock restant</span>
            <div className="font-bold text-slate-900">{stats.remaining ?? "∞"}</div>
          </div>
          <div>
            <span className="text-slate-500">CA brut</span>
            <div className="font-bold text-[#a3001d]">{formatCurrency(stats.totalRevenue)}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// QR Scanner section
// =============================================================================

function QrScannerSection({ establishmentId }: { establishmentId: string }) {
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);

  const handleScan = async () => {
    if (!token.trim()) return;
    setScanning(true);
    setError(null);
    setResult(null);
    try {
      const res = await scanQrAndConsume(token.trim(), establishmentId, selectedPurchaseId ?? undefined);
      setResult(res);
      setSelectedPurchaseId(null);
    } catch (e: any) {
      setError(e.message ?? "Erreur de scan");
    } finally {
      setScanning(false);
    }
  };

  const isPurchaseList = result && "purchases" in result;
  const isConsumption = result && "consumptionId" in result;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <QrCode className="h-5 w-5 text-[#a3001d]" />
          Scanner un QR Code Pack
        </h3>

        <div className="flex gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Token QR du client..."
            className="flex-1 h-11 px-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
          />
          <Button
            onClick={handleScan}
            disabled={scanning || !token.trim()}
            className="h-11 px-6 bg-[#a3001d] text-white font-semibold rounded-xl"
          >
            {scanning ? "..." : "Scanner"}
          </Button>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {/* Multiple packs — user selects one */}
        {isPurchaseList && (result as any).purchases && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700">Packs du client :</p>
            {(result as any).purchases.map((p: any) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelectedPurchaseId(p.id); handleScan(); }}
                className="w-full text-start p-3 rounded-xl border border-slate-200 hover:border-[#a3001d]/30 hover:bg-[#a3001d]/[0.02] transition"
              >
                <div className="text-sm font-semibold text-slate-900">{p.pack_title}</div>
                <div className="text-xs text-slate-500">{p.uses_remaining} utilisation(s) restante(s)</div>
              </button>
            ))}
          </div>
        )}

        {/* Consumption confirmed */}
        {isConsumption && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
            <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="text-sm font-bold text-emerald-800">Consommation enregistrée !</p>
            <p className="text-xs text-emerald-600 mt-1">
              {(result as any).usesRemaining} utilisation(s) restante(s)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Promo codes section
// =============================================================================

function formatDiscountDisplay(type: string, value: number): string {
  if (type === "percentage") return `${Math.round(value / 100)}%`;
  return formatCurrency(value);
}

function PromoCreateForm({
  establishmentId,
  packs,
  onCreated,
  onCancel,
}: {
  establishmentId: string;
  packs: PackV2[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed_amount">("percentage");
  const [discountInput, setDiscountInput] = useState("");
  const [appliesTo, setAppliesTo] = useState<"all" | "specific">("all");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [maxUses, setMaxUses] = useState("");
  const [maxUsesPerUser, setMaxUsesPerUser] = useState("1");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const labelCls = "block text-sm font-semibold text-slate-700 mb-1";
  const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 focus:border-[#a3001d]";

  const togglePackId = (id: string) =>
    setSelectedPackIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const handleSubmit = async () => {
    setError("");
    if (!code.trim()) { setError("Le code est requis"); return; }
    const numVal = parseFloat(discountInput);
    if (isNaN(numVal) || numVal <= 0) { setError("La valeur de réduction est invalide"); return; }

    // Convert to API format: bps for %, cents for fixed
    const discount_value = discountType === "percentage"
      ? Math.round(numVal * 100) // 10% → 1000 bps
      : Math.round(numVal * 100); // 50 MAD → 5000 centimes

    if (discountType === "percentage" && numVal > 100) { setError("Le pourcentage ne peut pas dépasser 100%"); return; }
    if (appliesTo === "specific" && selectedPackIds.length === 0) { setError("Sélectionnez au moins un pack"); return; }

    setSaving(true);
    try {
      await createProPackPromo({
        establishment_id: establishmentId,
        code: code.trim(),
        discount_type: discountType,
        discount_value,
        pack_ids: appliesTo === "specific" ? selectedPackIds : undefined,
        max_uses: maxUses ? parseInt(maxUses) : undefined,
        max_uses_per_user: maxUsesPerUser ? parseInt(maxUsesPerUser) : undefined,
        valid_from: validFrom || undefined,
        valid_to: validTo || undefined,
      });
      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  const activePacks = packs.filter((p) => ["active", "approved"].includes(p.moderation_status));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="text-base font-bold text-slate-900">Nouveau code promo</h3>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {/* Code */}
      <div>
        <label className={labelCls}>Code *</label>
        <input
          className={cn(inputCls, "font-mono uppercase tracking-wider")}
          placeholder="Ex: SUMMER20"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </div>

      {/* Type de réduction + valeur */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Type de réduction *</label>
          <div className="flex rounded-xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setDiscountType("percentage")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold transition",
                discountType === "percentage"
                  ? "bg-[#a3001d] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Pourcentage
            </button>
            <button
              type="button"
              onClick={() => setDiscountType("fixed_amount")}
              className={cn(
                "flex-1 py-2 text-sm font-semibold transition",
                discountType === "fixed_amount"
                  ? "bg-[#a3001d] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Montant fixe
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Valeur *</label>
          <div className="relative">
            <input
              type="number"
              className={cn(inputCls, "pe-12")}
              placeholder={discountType === "percentage" ? "10" : "50"}
              value={discountInput}
              onChange={(e) => setDiscountInput(e.target.value)}
              min={0}
              max={discountType === "percentage" ? 100 : undefined}
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 font-semibold">
              {discountType === "percentage" ? "%" : "Dhs"}
            </span>
          </div>
        </div>
      </div>

      {/* Applicable à */}
      <div>
        <label className={labelCls}>Applicable à</label>
        <div className="flex gap-2 mt-1">
          <button
            type="button"
            onClick={() => setAppliesTo("all")}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold border transition",
              appliesTo === "all"
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            Tous les packs
          </button>
          <button
            type="button"
            onClick={() => setAppliesTo("specific")}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold border transition",
              appliesTo === "specific"
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            Packs spécifiques
          </button>
        </div>

        {/* Pack selector */}
        {appliesTo === "specific" && (
          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {activePacks.length === 0 ? (
              <p className="text-xs text-slate-400 p-2">Aucun pack actif à sélectionner</p>
            ) : (
              activePacks.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePackId(p.id)}
                  className={cn(
                    "w-full text-start px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition",
                    selectedPackIds.includes(p.id)
                      ? "bg-[#a3001d]/10 text-[#a3001d] font-semibold"
                      : "bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0",
                    selectedPackIds.includes(p.id) ? "border-[#a3001d] bg-[#a3001d]" : "border-slate-300",
                  )}>
                    {selectedPackIds.includes(p.id) && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  {p.title} — {formatCurrency(p.price)}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Limites */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Utilisations max (total)</label>
          <input
            type="number"
            className={inputCls}
            placeholder="Illimité"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            min={1}
          />
          <p className="text-[10px] text-slate-400 mt-0.5">Vide = illimité</p>
        </div>
        <div>
          <label className={labelCls}>Max par client</label>
          <input
            type="number"
            className={inputCls}
            value={maxUsesPerUser}
            onChange={(e) => setMaxUsesPerUser(e.target.value)}
            min={1}
          />
        </div>
      </div>

      {/* Dates de validité */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Date début</label>
          <input type="date" className={inputCls} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Date fin</label>
          <input type="date" className={inputCls} value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1 rounded-xl">
          Annuler
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 gap-2 rounded-xl bg-[#a3001d] text-white hover:bg-[#a3001d]/90"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Créer le code
        </Button>
      </div>
    </div>
  );
}

function PromoCodesSection({
  establishmentId, packs, showForm, setShowForm,
}: {
  establishmentId: string;
  packs: PackV2[];
  showForm: boolean;
  setShowForm: (v: boolean) => void;
}) {
  const [promos, setPromos] = useState<PackPromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPromos = useCallback(async () => {
    try {
      const res = await listProPackPromos();
      setPromos(res.promos);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromos();
  }, [fetchPromos]);

  const handleDelete = async (id: string) => {
    try {
      await deleteProPackPromo(id);
      setPromos((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // silent
    }
  };

  if (loading) return <div className="py-4 text-center text-sm text-slate-500">Chargement...</div>;

  return (
    <div className="space-y-3">
      {showForm && (
        <PromoCreateForm
          establishmentId={establishmentId}
          packs={packs}
          onCreated={() => { setShowForm(false); fetchPromos(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {promos.length === 0 && !showForm ? (
        <div className="py-6 text-center">
          <Tag className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Aucun code promo</p>
        </div>
      ) : (
        <div className="space-y-2">
          {promos.map((promo) => (
            <div key={promo.id} className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-mono font-bold text-sm text-[#a3001d]">{promo.code}</span>
                <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                  <span>{formatDiscountDisplay(promo.discount_type, promo.discount_value)}</span>
                  {promo.max_total_uses != null && (
                    <span>· {promo.current_uses ?? 0}/{promo.max_total_uses} utilisations</span>
                  )}
                  {(promo.start_date || promo.end_date) && (
                    <span className="text-slate-400">
                      · {promo.start_date ? new Date(promo.start_date).toLocaleDateString("fr-FR") : "…"}
                      {" → "}
                      {promo.end_date ? new Date(promo.end_date).toLocaleDateString("fr-FR") : "…"}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(promo.id)}
                className="h-8 w-8 rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// PackCreateForm
// =============================================================================

const DAYS_OF_WEEK = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mer" },
  { value: 4, label: "Jeu" },
  { value: 5, label: "Ven" },
  { value: 6, label: "Sam" },
  { value: 0, label: "Dim" },
];

function PackCreateForm({
  establishmentId,
  onCreated,
  onCancel,
}: {
  establishmentId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Required
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  // Optional basic
  const [shortDescription, setShortDescription] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [limitPerClient, setLimitPerClient] = useState("");
  const [partySize, setPartySize] = useState("");
  // Multi-use
  const [isMultiUse, setIsMultiUse] = useState(false);
  const [totalUses, setTotalUses] = useState("");
  // Dates
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [validityStartDate, setValidityStartDate] = useState("");
  const [validityEndDate, setValidityEndDate] = useState("");
  // Time
  const [validTimeStart, setValidTimeStart] = useState("");
  const [validTimeEnd, setValidTimeEnd] = useState("");
  // Days
  const [validDays, setValidDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  // Conditions
  const [conditions, setConditions] = useState("");
  // Inclusions / Exclusions
  const [inclusions, setInclusions] = useState<Array<{ label: string; description: string }>>([]);
  const [exclusions, setExclusions] = useState<Array<{ label: string; description: string }>>([]);
  // Advanced toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  const toggleDay = (day: number) => {
    setValidDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const addInclusion = () => setInclusions((prev) => [...prev, { label: "", description: "" }]);
  const removeInclusion = (idx: number) => setInclusions((prev) => prev.filter((_, i) => i !== idx));
  const updateInclusion = (idx: number, field: "label" | "description", val: string) => {
    setInclusions((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const addExclusion = () => setExclusions((prev) => [...prev, { label: "", description: "" }]);
  const removeExclusion = (idx: number) => setExclusions((prev) => prev.filter((_, i) => i !== idx));
  const updateExclusion = (idx: number, field: "label" | "description", val: string) => {
    setExclusions((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
  };

  const priceNum = parseFloat(price.replace(",", "."));
  const originalPriceNum = parseFloat(originalPrice.replace(",", "."));
  const discount = !isNaN(priceNum) && !isNaN(originalPriceNum) && originalPriceNum > priceNum
    ? Math.round((1 - priceNum / originalPriceNum) * 100)
    : null;

  const handleSubmit = async (andSubmit: boolean) => {
    setError(null);
    if (!title.trim()) { setError("Le titre est obligatoire"); return; }
    if (isNaN(priceNum) || priceNum < 0) { setError("Le prix est invalide"); return; }

    setSaving(true);
    try {
      const input: CreatePackInput = {
        establishment_id: establishmentId,
        title: title.trim(),
        price: Math.round(priceNum * 100),
      };
      if (shortDescription.trim()) input.short_description = shortDescription.trim();
      if (detailedDescription.trim()) input.detailed_description = detailedDescription.trim();
      if (!isNaN(originalPriceNum) && originalPriceNum > 0) input.original_price = Math.round(originalPriceNum * 100);
      if (category.trim()) input.category = category.trim();
      const stockNum = parseInt(stock);
      if (!isNaN(stockNum) && stockNum > 0) input.stock = stockNum;
      const limitNum = parseInt(limitPerClient);
      if (!isNaN(limitNum) && limitNum > 0) input.limit_per_client = limitNum;
      const partySizeNum = parseInt(partySize);
      if (!isNaN(partySizeNum) && partySizeNum > 0) input.party_size = partySizeNum;
      if (isMultiUse) {
        input.is_multi_use = true;
        const usesNum = parseInt(totalUses);
        if (!isNaN(usesNum) && usesNum > 0) input.total_uses = usesNum;
      }
      if (saleStartDate) input.sale_start_date = saleStartDate;
      if (saleEndDate) input.sale_end_date = saleEndDate;
      if (validityStartDate) input.validity_start_date = validityStartDate;
      if (validityEndDate) input.validity_end_date = validityEndDate;
      if (validTimeStart) input.valid_time_start = validTimeStart;
      if (validTimeEnd) input.valid_time_end = validTimeEnd;
      if (validDays.length < 7) input.valid_days = validDays;
      if (conditions.trim()) input.conditions = conditions.trim();
      const filteredInclusions = inclusions.filter((i) => i.label.trim());
      if (filteredInclusions.length) input.inclusions = filteredInclusions;
      const filteredExclusions = exclusions.filter((e) => e.label.trim());
      if (filteredExclusions.length) input.exclusions = filteredExclusions;

      const { packId } = await createProPack(input);

      if (andSubmit) {
        await submitPackForModeration(packId);
      }

      onCreated();
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full h-10 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30";
  const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Plus className="h-5 w-5 text-[#a3001d]" />
          Créer un pack
        </h3>
        <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">
          Annuler
        </button>
      </div>

      {error && (
        <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Titre + Prix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Titre *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Menu Découverte" className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Prix (MAD) *</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="99.00" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Prix barré (MAD)</label>
            <input value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="150.00" className={inputCls} />
          </div>
        </div>
      </div>

      {discount !== null && (
        <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-lg inline-block">
          -{discount}% de réduction
        </div>
      )}

      {/* Description courte */}
      <div>
        <label className={labelCls}>Description courte</label>
        <input value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} placeholder="Résumé en une ligne..." className={inputCls} maxLength={500} />
      </div>

      {/* Description détaillée */}
      <div>
        <label className={labelCls}>Description détaillée</label>
        <textarea value={detailedDescription} onChange={(e) => setDetailedDescription(e.target.value)} placeholder="Décrivez le contenu du pack, les avantages..." rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 resize-y" maxLength={5000} />
      </div>

      {/* Catégorie + Stock + Limite */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelCls}>Catégorie</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Ex: Gastronomie" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Stock</label>
          <input value={stock} onChange={(e) => setStock(e.target.value)} placeholder="Illimité" type="number" min="1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Limite/client</label>
          <input value={limitPerClient} onChange={(e) => setLimitPerClient(e.target.value)} placeholder="Illimité" type="number" min="1" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Personnes</label>
          <input value={partySize} onChange={(e) => setPartySize(e.target.value)} placeholder="1" type="number" min="1" className={inputCls} />
        </div>
      </div>

      {/* Multi-use */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isMultiUse} onChange={(e) => setIsMultiUse(e.target.checked)} className="rounded border-slate-300 text-[#a3001d] focus:ring-[#a3001d]/30" />
          <span className="text-sm font-medium text-slate-700">Pack multi-usage</span>
        </label>
        {isMultiUse && (
          <div className="flex items-center gap-2">
            <input value={totalUses} onChange={(e) => setTotalUses(e.target.value)} placeholder="Nb utilisations" type="number" min="2" className="h-8 w-32 px-2 rounded-lg border border-slate-200 text-xs" />
            <span className="text-xs text-slate-500">utilisations</span>
          </div>
        )}
      </div>

      {/* Inclusions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls}>Inclusions</label>
          <button type="button" onClick={addInclusion} className="text-xs text-[#a3001d] font-semibold hover:underline">+ Ajouter</button>
        </div>
        {inclusions.map((inc, idx) => (
          <div key={idx} className="flex gap-2 mb-2">
            <input value={inc.label} onChange={(e) => updateInclusion(idx, "label", e.target.value)} placeholder="Ex: Entrée + Plat + Dessert" className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm" />
            <button type="button" onClick={() => removeInclusion(idx)} className="h-9 w-9 rounded-lg border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Exclusions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls}>Exclusions</label>
          <button type="button" onClick={addExclusion} className="text-xs text-[#a3001d] font-semibold hover:underline">+ Ajouter</button>
        </div>
        {exclusions.map((exc, idx) => (
          <div key={idx} className="flex gap-2 mb-2">
            <input value={exc.label} onChange={(e) => updateExclusion(idx, "label", e.target.value)} placeholder="Ex: Boissons non incluses" className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm" />
            <button type="button" onClick={() => removeExclusion(idx)} className="h-9 w-9 rounded-lg border border-red-200 flex items-center justify-center text-red-400 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
      >
        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Options avancées
      </button>

      {showAdvanced && (
        <div className="space-y-4 pt-1">
          {/* Dates de vente */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Début vente</label>
              <input type="date" value={saleStartDate} onChange={(e) => setSaleStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Fin vente</label>
              <input type="date" value={saleEndDate} onChange={(e) => setSaleEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Dates de validité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Utilisable à partir du</label>
              <input type="date" value={validityStartDate} onChange={(e) => setValidityStartDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Utilisable jusqu'au</label>
              <input type="date" value={validityEndDate} onChange={(e) => setValidityEndDate(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Horaires */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Heure début</label>
              <input type="time" value={validTimeStart} onChange={(e) => setValidTimeStart(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Heure fin</label>
              <input type="time" value={validTimeEnd} onChange={(e) => setValidTimeEnd(e.target.value)} className={inputCls} />
            </div>
          </div>

          {/* Jours de la semaine */}
          <div>
            <label className={labelCls}>Jours valides</label>
            <div className="flex gap-1.5 mt-1">
              {DAYS_OF_WEEK.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDay(d.value)}
                  className={cn(
                    "h-9 w-10 rounded-lg text-xs font-bold border transition",
                    validDays.includes(d.value)
                      ? "bg-[#a3001d] text-white border-[#a3001d]"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conditions */}
          <div>
            <label className={labelCls}>Conditions d'utilisation</label>
            <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder="Ex: Non cumulable, sur réservation uniquement..." rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 resize-y" maxLength={2000} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-100">
        <Button
          type="button"
          onClick={() => handleSubmit(false)}
          disabled={saving}
          variant="outline"
          className="gap-2"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
          Enregistrer brouillon
        </Button>
        <Button
          type="button"
          onClick={() => handleSubmit(true)}
          disabled={saving}
          className="gap-2 bg-[#a3001d] text-white hover:bg-[#a3001d]/90"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Créer & soumettre
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// ProPacksDashboard — main export
// =============================================================================

export function ProPacksDashboard({
  establishmentId,
  className,
}: {
  establishmentId: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<ProPacksTab>("list");
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listProPacks();
      setPacks(res.packs);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const handleAction = useCallback(async (action: string, packId: string) => {
    setActionMsg(null);
    try {
      switch (action) {
        case "submit":
          await submitPackForModeration(packId);
          setActionMsg({ type: "success", text: "Pack soumis pour modération" });
          break;
        case "suspend":
          await suspendPack(packId);
          setActionMsg({ type: "success", text: "Pack suspendu" });
          break;
        case "resume":
          await resumePack(packId);
          setActionMsg({ type: "success", text: "Pack repris" });
          break;
        case "close":
          await closePack(packId);
          setActionMsg({ type: "success", text: "Pack clôturé" });
          break;
        case "duplicate":
          await duplicatePack(packId);
          setActionMsg({ type: "success", text: "Pack dupliqué" });
          break;
        default:
          return;
      }
      fetchPacks();
    } catch (e: any) {
      setActionMsg({ type: "error", text: e.message ?? "Erreur" });
    }
  }, [fetchPacks]);

  const tabs: Array<{ id: ProPacksTab; label: string; icon: typeof Gift }> = [
    { id: "list", label: "Mes Packs", icon: Gift },
    { id: "scan", label: "Scanner QR", icon: QrCode },
    { id: "promos", label: "Codes promo", icon: Tag },
  ];

  return (
    <div className={cn("space-y-4", className)}>
      {/* Sub-tabs + create button */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => { setTab(t.id); setShowCreateForm(false); setShowPromoForm(false); }}
              className={cn(
                "shrink-0 h-9 rounded-full px-4 text-sm font-semibold border transition flex items-center gap-1.5",
                tab === t.id
                  ? "bg-[#a3001d] text-white border-[#a3001d]"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}

        {/* Context create button — aligned right */}
        {tab === "list" && !showCreateForm && (
          <Button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="ms-auto shrink-0 gap-2 bg-[#a3001d] text-white hover:bg-[#a3001d]/90"
          >
            <Plus className="h-4 w-4" />
            Créer un pack
          </Button>
        )}
        {tab === "promos" && !showPromoForm && (
          <Button
            type="button"
            onClick={() => setShowPromoForm(true)}
            className="ms-auto shrink-0 gap-2 bg-[#a3001d] text-white hover:bg-[#a3001d]/90"
          >
            <Plus className="h-4 w-4" />
            Créer un code
          </Button>
        )}
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          actionMsg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {actionMsg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {actionMsg.text}
        </div>
      )}

      {/* Tab content */}
      {tab === "list" && (
        <div className="space-y-3">
          {/* Create form */}
          {showCreateForm && (
            <PackCreateForm
              establishmentId={establishmentId}
              onCreated={() => {
                setShowCreateForm(false);
                setActionMsg({ type: "success", text: "Pack créé avec succès !" });
                fetchPacks();
              }}
              onCancel={() => setShowCreateForm(false)}
            />
          )}

          {loading ? (
            <div className="py-8 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
            </div>
          ) : packs.length === 0 && !showCreateForm ? (
            <div className="py-8 text-center">
              <Gift className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">Aucun pack créé</p>
            </div>
          ) : (
            packs.map((p) => (
              <PackListItem key={p.id} pack={p} onAction={handleAction} />
            ))
          )}
        </div>
      )}

      {tab === "scan" && <QrScannerSection establishmentId={establishmentId} />}
      {tab === "promos" && <PromoCodesSection establishmentId={establishmentId} packs={packs} showForm={showPromoForm} setShowForm={setShowPromoForm} />}
    </div>
  );
}
