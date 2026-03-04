/**
 * AdminPacksModerationDashboard — 5.8: Dashboard Admin modération Packs
 *
 * File d'attente des Packs à modérer.
 * Outils: approuver, rejeter (motif), demander modification.
 * Mise en avant sur la page d'accueil (featured).
 * Édition directe + suppression par l'admin.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Shield, CheckCircle, XCircle, Edit, Star, StarOff,
  AlertTriangle, Gift, RefreshCw, ChevronDown, ChevronUp,
  Pencil, Trash2, X, Plus, Minus, Save,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { AdminPacksNav } from "@/pages/admin/packs/AdminPacksNav";
import {
  getModerationQueue, approvePack, rejectPack,
  requestPackModification, featurePack, unfeaturePack,
  getAdminPack, updateAdminPack, deleteAdminPack,
} from "@/lib/packsV2AdminApi";
import type { PackV2 } from "../../../shared/packsBillingTypes";

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(cents: number): string {
  return `${Math.round(cents / 100)} Dhs`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

const DAY_LABELS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];

// =============================================================================
// Moderation status filter
// =============================================================================

const STATUS_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "pending_moderation", label: "En attente" },
  { id: "active", label: "Actifs" },
  { id: "rejected", label: "Rejetés" },
  { id: "modification_requested", label: "Modification" },
] as const;

// =============================================================================
// AdminPackEditModal
// =============================================================================

function AdminPackEditModal({
  packId,
  onClose,
  onSaved,
}: {
  packId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [detailedDescription, setDetailedDescription] = useState("");
  const [category, setCategory] = useState("");
  const [stock, setStock] = useState("");
  const [limitPerClient, setLimitPerClient] = useState("");
  const [partySize, setPartySize] = useState("");
  const [isMultiUse, setIsMultiUse] = useState(false);
  const [totalUses, setTotalUses] = useState("");
  const [conditions, setConditions] = useState("");
  const [inclusions, setInclusions] = useState<Array<{ label: string; description: string }>>([]);
  const [exclusions, setExclusions] = useState<Array<{ label: string; description: string }>>([]);
  const [saleStartDate, setSaleStartDate] = useState("");
  const [saleEndDate, setSaleEndDate] = useState("");
  const [validityStartDate, setValidityStartDate] = useState("");
  const [validityEndDate, setValidityEndDate] = useState("");
  const [validTimeStart, setValidTimeStart] = useState("");
  const [validTimeEnd, setValidTimeEnd] = useState("");
  const [validDays, setValidDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load pack data
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getAdminPack(packId);
        if (cancelled) return;
        if (!res?.pack) { setError("Pack introuvable"); return; }
        const p = res.pack as any;
        setTitle(p.title ?? "");
        setPrice(p.price != null ? String(p.price / 100) : "");
        setOriginalPrice(p.original_price ? String(p.original_price / 100) : "");
        setShortDescription(p.short_description ?? "");
        setDetailedDescription(p.detailed_description ?? "");
        setCategory(p.category ?? "");
        setStock(p.stock != null ? String(p.stock) : "");
        setLimitPerClient(p.limit_per_client != null ? String(p.limit_per_client) : "");
        setPartySize(p.party_size != null ? String(p.party_size) : "");
        setIsMultiUse(p.is_multi_use ?? false);
        setTotalUses(p.total_uses != null ? String(p.total_uses) : "");
        setConditions(p.conditions ?? "");
        setInclusions(
          Array.isArray(p.inclusions)
            ? p.inclusions.map((inc: any) =>
                typeof inc === "string"
                  ? { label: inc, description: "" }
                  : { label: inc?.label ?? "", description: inc?.description ?? "" },
              )
            : [],
        );
        setExclusions(
          Array.isArray(p.exclusions)
            ? p.exclusions.map((exc: any) =>
                typeof exc === "string"
                  ? { label: exc, description: "" }
                  : { label: exc?.label ?? "", description: exc?.description ?? "" },
              )
            : [],
        );
        setSaleStartDate(p.sale_start_date ?? "");
        setSaleEndDate(p.sale_end_date ?? "");
        setValidityStartDate(p.validity_start_date ?? "");
        setValidityEndDate(p.validity_end_date ?? "");
        setValidTimeStart(p.valid_time_start ?? "");
        setValidTimeEnd(p.valid_time_end ?? "");
        setValidDays(Array.isArray(p.valid_days) ? p.valid_days : [0, 1, 2, 3, 4, 5, 6]);
      } catch (err: any) {
        if (!cancelled) setError(err.message ?? "Erreur de chargement");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [packId]);

  const toggleDay = (day: number) => {
    setValidDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]);
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) { setError("Le titre est obligatoire"); return; }
    const priceNum = parseFloat(price.replace(",", "."));
    if (isNaN(priceNum) || priceNum < 0) { setError("Le prix est invalide"); return; }

    setSaving(true);
    try {
      const input: Record<string, unknown> = {
        title: title.trim(),
        price: Math.round(priceNum * 100),
      };

      if (shortDescription.trim()) input.short_description = shortDescription.trim();
      else input.short_description = null;
      if (detailedDescription.trim()) input.detailed_description = detailedDescription.trim();
      else input.detailed_description = null;
      const origNum = parseFloat(originalPrice.replace(",", "."));
      if (!isNaN(origNum) && origNum > 0) input.original_price = Math.round(origNum * 100);
      else input.original_price = null;
      if (category.trim()) input.category = category.trim();
      else input.category = null;
      const stockNum = parseInt(stock);
      input.stock = !isNaN(stockNum) && stockNum > 0 ? stockNum : null;
      const limitNum = parseInt(limitPerClient);
      if (!isNaN(limitNum) && limitNum > 0) input.limit_per_client = limitNum;
      const partySizeNum = parseInt(partySize);
      if (!isNaN(partySizeNum) && partySizeNum > 0) input.party_size = partySizeNum;
      input.is_multi_use = isMultiUse;
      if (isMultiUse) {
        const usesNum = parseInt(totalUses);
        if (!isNaN(usesNum) && usesNum > 0) input.total_uses = usesNum;
      }
      if (saleStartDate) input.sale_start_date = saleStartDate;
      else input.sale_start_date = null;
      if (saleEndDate) input.sale_end_date = saleEndDate;
      else input.sale_end_date = null;
      if (validityStartDate) input.validity_start_date = validityStartDate;
      else input.validity_start_date = null;
      if (validityEndDate) input.validity_end_date = validityEndDate;
      else input.validity_end_date = null;
      if (validTimeStart) input.valid_time_start = validTimeStart;
      else input.valid_time_start = null;
      if (validTimeEnd) input.valid_time_end = validTimeEnd;
      else input.valid_time_end = null;
      if (validDays.length < 7) input.valid_days = validDays;
      else input.valid_days = null;
      if (conditions.trim()) input.conditions = conditions.trim();
      else input.conditions = null;

      const filteredInclusions = inclusions.filter((i) => i.label.trim());
      input.inclusions = filteredInclusions.length > 0 ? filteredInclusions : null;
      const filteredExclusions = exclusions.filter((e) => e.label.trim());
      input.exclusions = filteredExclusions.length > 0 ? filteredExclusions : null;

      await updateAdminPack(packId, input);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  };

  // Computed discount
  const priceNum = parseFloat(price.replace(",", "."));
  const origPriceNum = parseFloat(originalPrice.replace(",", "."));
  const discount = !isNaN(priceNum) && !isNaN(origPriceNum) && origPriceNum > priceNum
    ? Math.round((1 - priceNum / origPriceNum) * 100)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl my-8 bg-white rounded-2xl shadow-xl">
        {/* Modal header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">Modifier le pack</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
              <p className="mt-2 text-sm text-slate-500">Chargement...</p>
            </div>
          ) : (
            <>
              {/* Error */}
              {error && (
                <div className="text-sm px-3 py-2 rounded-lg bg-red-50 text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="text-sm font-semibold text-slate-700">Titre *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>

              {/* Price row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Prix (MAD) *</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">
                    Prix barré (MAD) {discount != null && <span className="text-emerald-600 font-normal">-{discount}%</span>}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
              </div>

              {/* Short description */}
              <div>
                <label className="text-sm font-semibold text-slate-700">Description courte</label>
                <input
                  type="text"
                  value={shortDescription}
                  onChange={(e) => setShortDescription(e.target.value)}
                  maxLength={500}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>

              {/* Detailed description */}
              <div>
                <label className="text-sm font-semibold text-slate-700">Description détaillée</label>
                <textarea
                  value={detailedDescription}
                  onChange={(e) => setDetailedDescription(e.target.value)}
                  rows={3}
                  maxLength={5000}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                />
              </div>

              {/* Category / Stock / Limit / Party size */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700">Catégorie</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Stock</label>
                  <input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    placeholder="∞"
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Limite/client</label>
                  <input
                    type="number"
                    min={0}
                    value={limitPerClient}
                    onChange={(e) => setLimitPerClient(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Personnes</label>
                  <input
                    type="number"
                    min={1}
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                </div>
              </div>

              {/* Multi-use */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isMultiUse}
                    onChange={(e) => setIsMultiUse(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Pack multi-usage
                </label>
                {isMultiUse && (
                  <input
                    type="number"
                    min={1}
                    value={totalUses}
                    onChange={(e) => setTotalUses(e.target.value)}
                    placeholder="Nb utilisations"
                    className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                  />
                )}
              </div>

              {/* Inclusions */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-slate-700">Inclusions</label>
                  <button
                    type="button"
                    onClick={() => setInclusions((prev) => [...prev, { label: "", description: "" }])}
                    className="text-xs text-[#a3001d] hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Ajouter
                  </button>
                </div>
                {inclusions.map((inc, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <input
                      type="text"
                      value={inc.label}
                      onChange={(e) =>
                        setInclusions((prev) => prev.map((item, j) => j === i ? { ...item, label: e.target.value } : item))
                      }
                      placeholder="Nom"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                    />
                    <input
                      type="text"
                      value={inc.description}
                      onChange={(e) =>
                        setInclusions((prev) => prev.map((item, j) => j === i ? { ...item, description: e.target.value } : item))
                      }
                      placeholder="Description"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setInclusions((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Exclusions */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-semibold text-slate-700">Exclusions</label>
                  <button
                    type="button"
                    onClick={() => setExclusions((prev) => [...prev, { label: "", description: "" }])}
                    className="text-xs text-[#a3001d] hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="h-3 w-3" /> Ajouter
                  </button>
                </div>
                {exclusions.map((exc, i) => (
                  <div key={i} className="flex gap-2 mb-1.5">
                    <input
                      type="text"
                      value={exc.label}
                      onChange={(e) =>
                        setExclusions((prev) => prev.map((item, j) => j === i ? { ...item, label: e.target.value } : item))
                      }
                      placeholder="Nom"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                    />
                    <input
                      type="text"
                      value={exc.description}
                      onChange={(e) =>
                        setExclusions((prev) => prev.map((item, j) => j === i ? { ...item, description: e.target.value } : item))
                      }
                      placeholder="Description"
                      className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                    />
                    <button
                      type="button"
                      onClick={() => setExclusions((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Advanced section toggle */}
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                Options avancées
              </button>

              {showAdvanced && (
                <div className="space-y-4 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Début vente</label>
                      <input type="date" value={saleStartDate} onChange={(e) => setSaleStartDate(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Fin vente</label>
                      <input type="date" value={saleEndDate} onChange={(e) => setSaleEndDate(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Utilisable dès</label>
                      <input type="date" value={validityStartDate} onChange={(e) => setValidityStartDate(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Utilisable jusqu'au</label>
                      <input type="date" value={validityEndDate} onChange={(e) => setValidityEndDate(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                  </div>

                  {/* Time */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Heure début</label>
                      <input type="time" value={validTimeStart} onChange={(e) => setValidTimeStart(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Heure fin</label>
                      <input type="time" value={validTimeEnd} onChange={(e) => setValidTimeEnd(e.target.value)}
                        className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30" />
                    </div>
                  </div>

                  {/* Days */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">Jours valides</label>
                    <div className="flex gap-1.5">
                      {DAY_LABELS.map((label, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          className={cn(
                            "h-8 w-10 rounded-lg text-xs font-semibold border transition",
                            validDays.includes(idx)
                              ? "bg-[#a3001d] text-white border-[#a3001d]"
                              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Conditions */}
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Conditions d'utilisation</label>
                    <textarea
                      value={conditions}
                      onChange={(e) => setConditions(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal footer */}
        {!loading && (
          <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-200">
            <Button
              onClick={onClose}
              variant="outline"
              className="h-9 px-4 text-sm font-semibold rounded-lg"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="h-9 px-5 bg-[#a3001d] hover:bg-[#8a0018] text-white text-sm font-semibold rounded-lg"
            >
              <Save className="h-3.5 w-3.5 me-1" />
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ModerationPackCard
// =============================================================================

function ModerationPackCard({
  pack,
  onAction,
  onEdit,
  onDelete,
  actionLoading,
}: {
  pack: PackV2;
  onAction: (action: string, packId: string, payload?: string) => void;
  onEdit: (packId: string) => void;
  onDelete: (packId: string) => void;
  actionLoading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [modNote, setModNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showMod, setShowMod] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isPending = pack.moderation_status === "pending_moderation";
  const isActive = pack.moderation_status === "active" || pack.moderation_status === "approved";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {pack.is_featured && (
                <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
              )}
              <h4 className="text-base font-bold text-slate-900 truncate">{pack.title}</h4>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{formatCurrency(pack.price)}</span>
              {pack.original_price && pack.original_price > pack.price && (
                <span className="line-through">{formatCurrency(pack.original_price)}</span>
              )}
              <span>Stock: {pack.stock ?? "∞"}</span>
              <span>Créé: {formatDate(pack.created_at)}</span>
            </div>
            {pack.short_description && (
              <p className="mt-1 text-sm text-slate-600 line-clamp-2">{pack.short_description}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onEdit(pack.id)}
              title="Modifier le pack"
              className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
              title="Supprimer le pack"
              className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50"
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Delete confirmation */}
        {showDeleteConfirm && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3">
            <p className="text-sm text-red-700">Supprimer ce pack définitivement ?</p>
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                variant="outline"
                className="h-8 px-3 text-xs font-semibold rounded-lg border-red-200 text-red-600"
              >
                Annuler
              </Button>
              <Button
                onClick={() => { onDelete(pack.id); setShowDeleteConfirm(false); }}
                disabled={actionLoading}
                className="h-8 px-3 bg-red-600 text-white text-xs font-semibold rounded-lg"
              >
                <Trash2 className="h-3 w-3 me-1" /> Confirmer
              </Button>
            </div>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="mt-4 space-y-3 text-sm">
            {pack.detailed_description && (
              <div>
                <span className="font-semibold text-slate-700">Description :</span>
                <p className="text-slate-600">{pack.detailed_description}</p>
              </div>
            )}
            {pack.inclusions && pack.inclusions.length > 0 && (
              <div>
                <span className="font-semibold text-slate-700">Inclusions :</span>
                <ul className="list-disc ms-5 text-slate-600">
                  {pack.inclusions.map((inc: any, i: number) => <li key={i}>{typeof inc === "string" ? inc : inc.label}{inc.description ? ` — ${inc.description}` : ""}</li>)}
                </ul>
              </div>
            )}
            {pack.conditions && (
              <div>
                <span className="font-semibold text-slate-700">Conditions :</span>
                <p className="text-slate-600">{pack.conditions}</p>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap gap-2">
          {isPending && (
            <>
              <Button
                onClick={() => onAction("approve", pack.id)}
                disabled={actionLoading}
                className="h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg"
              >
                <CheckCircle className="h-3.5 w-3.5 me-1" /> Approuver
              </Button>
              <Button
                onClick={() => setShowReject(!showReject)}
                variant="outline"
                className="h-9 px-4 border-red-200 text-red-600 text-sm font-semibold rounded-lg"
              >
                <XCircle className="h-3.5 w-3.5 me-1" /> Rejeter
              </Button>
              <Button
                onClick={() => setShowMod(!showMod)}
                variant="outline"
                className="h-9 px-4 border-orange-200 text-orange-600 text-sm font-semibold rounded-lg"
              >
                <Edit className="h-3.5 w-3.5 me-1" /> Demander modif.
              </Button>
            </>
          )}
          {isActive && !pack.is_featured && (
            <Button
              onClick={() => onAction("feature", pack.id)}
              disabled={actionLoading}
              variant="outline"
              className="h-9 px-4 border-amber-200 text-amber-600 text-sm font-semibold rounded-lg"
            >
              <Star className="h-3.5 w-3.5 me-1" /> Mettre en avant
            </Button>
          )}
          {isActive && pack.is_featured && (
            <Button
              onClick={() => onAction("unfeature", pack.id)}
              disabled={actionLoading}
              variant="outline"
              className="h-9 px-4 border-slate-200 text-slate-600 text-sm font-semibold rounded-lg"
            >
              <StarOff className="h-3.5 w-3.5 me-1" /> Retirer mise en avant
            </Button>
          )}
        </div>

        {/* Reject form */}
        {showReject && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 space-y-2">
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Motif du rejet..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <Button
              onClick={() => { onAction("reject", pack.id, rejectReason); setShowReject(false); }}
              disabled={!rejectReason.trim() || actionLoading}
              className="h-8 px-4 bg-red-600 text-white text-xs font-semibold rounded-lg"
            >
              Confirmer le rejet
            </Button>
          </div>
        )}

        {/* Modification form */}
        {showMod && (
          <div className="mt-3 p-3 rounded-xl bg-orange-50 border border-orange-200 space-y-2">
            <textarea
              value={modNote}
              onChange={(e) => setModNote(e.target.value)}
              placeholder="Détails des modifications demandées..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg border border-orange-200 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300"
            />
            <Button
              onClick={() => { onAction("request_modification", pack.id, modNote); setShowMod(false); }}
              disabled={!modNote.trim() || actionLoading}
              className="h-8 px-4 bg-orange-600 text-white text-xs font-semibold rounded-lg"
            >
              Envoyer la demande
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// AdminPacksModerationDashboard — main export
// =============================================================================

export function AdminPacksModerationDashboard({ className }: { className?: string }) {
  const { t } = useI18n();
  const [packs, setPacks] = useState<PackV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending_moderation");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getModerationQueue(filter);
      setPacks(res.packs);
    } catch (err) {
      console.error("[PacksModeration] fetchQueue error:", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleAction = useCallback(async (action: string, packId: string, payload?: string) => {
    setActionLoading(true);
    setMsg(null);
    try {
      switch (action) {
        case "approve":
          await approvePack(packId);
          setMsg({ type: "success", text: "Pack approuvé" });
          break;
        case "reject":
          await rejectPack(packId, payload ?? "");
          setMsg({ type: "success", text: "Pack rejeté" });
          break;
        case "request_modification":
          await requestPackModification(packId, payload ?? "");
          setMsg({ type: "success", text: "Demande de modification envoyée" });
          break;
        case "feature":
          await featurePack(packId);
          setMsg({ type: "success", text: "Pack mis en avant" });
          break;
        case "unfeature":
          await unfeaturePack(packId);
          setMsg({ type: "success", text: "Mise en avant retirée" });
          break;
      }
      await fetchQueue();
    } catch (e: any) {
      console.error("[PacksModeration] Action error:", action, packId, e);
      setMsg({ type: "error", text: e.message ?? "Erreur" });
    } finally {
      setActionLoading(false);
    }
  }, [fetchQueue]);

  const handleDelete = useCallback(async (packId: string) => {
    setActionLoading(true);
    setMsg(null);
    try {
      await deleteAdminPack(packId);
      setMsg({ type: "success", text: "Pack supprimé" });
      await fetchQueue();
    } catch (e: any) {
      console.error("[PacksModeration] Delete error:", packId, e);
      setMsg({ type: "error", text: e.message ?? "Erreur de suppression" });
    } finally {
      setActionLoading(false);
    }
  }, [fetchQueue]);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Packs sub-navigation */}
      <AdminPacksNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-[#a3001d]" />
          <h2 className="text-lg font-bold text-slate-900">Modération Packs</h2>
        </div>
        <button onClick={fetchQueue} disabled={loading} className="text-sm text-slate-500 hover:text-slate-700">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "shrink-0 h-8 rounded-full px-3.5 text-xs font-semibold border transition",
              filter === f.id
                ? "bg-[#a3001d] text-white border-[#a3001d]"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {msg && (
        <div className={cn(
          "text-sm px-4 py-2.5 rounded-xl flex items-center gap-2",
          msg.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
        )}>
          {msg.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {msg.text}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="py-8 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#a3001d] border-t-transparent" />
        </div>
      ) : packs.length === 0 ? (
        <div className="py-8 text-center">
          <Gift className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm text-slate-500">Aucun pack dans cette catégorie</p>
        </div>
      ) : (
        <div className="space-y-3">
          {packs.map((pack) => (
            <ModerationPackCard
              key={pack.id}
              pack={pack}
              onAction={handleAction}
              onEdit={setEditingPackId}
              onDelete={handleDelete}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editingPackId && (
        <AdminPackEditModal
          packId={editingPackId}
          onClose={() => setEditingPackId(null)}
          onSaved={fetchQueue}
        />
      )}
    </div>
  );
}
