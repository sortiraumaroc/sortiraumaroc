import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { BarChart3, Calendar, Copy, Download, Edit3, Eye, FileText, Gift, ImagePlus, Loader2, Package, Percent, Plus, Save, Sparkles, Tag, Trash2, TrendingUp, Upload, Wallet, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import {
  createProPack,
  updateProPack,
  deleteProPack,
  listProOffers,
  createProConsumerPromoCode,
  deleteProConsumerPromoCode,
  listProConsumerPromoCodes,
  updateProConsumerPromoCode,
  getProPromoAnalytics,
  listProPromoTemplates,
  createProPromoTemplate,
  updateProPromoTemplate,
  deleteProPromoTemplate,
  createPromoFromTemplate,
  getProPromoCodesCsvUrl,
  type ProConsumerPromoCode,
  type ProPromoTemplate,
  type ProPromoAnalyticsResponse,
} from "@/lib/pro/api";
import type { Establishment, Pack, ProRole } from "@/lib/pro/types";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import type { ColumnDef } from "@tanstack/react-table";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

function formatMoney(amount: number | null | undefined, currency: string) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(n / 100);
}

function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-extrabold text-slate-600 hover:bg-slate-50"
          aria-label={label}
          title={label}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm text-slate-700">
        <div className="leading-snug">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function percentStringFromBps(bps: number) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (n / 100).toFixed(0);
}

function bpsFromPercentString(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function generateSamCode(suffixLength = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(6, Math.min(32, Math.round(suffixLength)));

  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(n);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      bytes = null;
    }
  } catch {
    bytes = null;
  }

  let out = "SAM";
  for (let i = 0; i < n; i++) {
    const v = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    out += alphabet[v % alphabet.length];
  }
  return out;
}

function asPositiveIntOrNull(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 1 ? v : null;
}

export function ProPacksAndPromotionsTab({ establishment, role }: Props) {
  const canEdit = canWrite(role);

  // ============ PACKS STATE ============
  const [packs, setPacks] = useState<Pack[]>([]);
  const [packsLoading, setPacksLoading] = useState(true);
  const [packsError, setPacksError] = useState<string | null>(null);

  const [newPack, setNewPack] = useState({
    title: "",
    description: "",
    label: "",
    price: "",
    originalPrice: "",
    stock: "",
    validFrom: "",
    validTo: "",
    conditions: "",
    coverUrl: "",
  });

  // Cover image upload state
  const [uploadingCover, setUploadingCover] = useState(false);

  // Pack edit state
  const [editPackDialogOpen, setEditPackDialogOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<Pack | null>(null);
  const [savingPackId, setSavingPackId] = useState<string | null>(null);
  const [editPack, setEditPack] = useState({
    title: "",
    description: "",
    label: "",
    price: "",
    originalPrice: "",
    stock: "",
    validFrom: "",
    validTo: "",
    conditions: "",
    coverUrl: "",
    active: true,
  });

  // ============ PROMO CODES STATE ============
  const [promoCodes, setPromoCodes] = useState<ProConsumerPromoCode[]>([]);
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<ProConsumerPromoCode | null>(null);
  const [savingPromoId, setSavingPromoId] = useState<string | null>(null);

  const [newPromo, setNewPromo] = useState({
    code: "",
    percent: "",
    description: "",
    is_public: false,
    starts_at: "",
    ends_at: "",
    max_uses_total: "",
    max_uses_per_user: "",
  });

  const [editPromo, setEditPromo] = useState({
    id: "",
    code: "",
    percent: "",
    description: "",
    is_public: false,
    starts_at: "",
    ends_at: "",
    max_uses_total: "",
    max_uses_per_user: "",
  });

  // ============ PROMO ANALYTICS STATE ============
  const [analyticsData, setAnalyticsData] = useState<ProPromoAnalyticsResponse | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // ============ PROMO TEMPLATES STATE ============
  const [templates, setTemplates] = useState<ProPromoTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ProPromoTemplate | null>(null);
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
    percent: "",
    is_public: false,
    max_uses_total: "",
    max_uses_per_user: "",
    min_cart_amount: "",
    valid_days_of_week: [] as number[],
    valid_hours_start: "",
    valid_hours_end: "",
    first_purchase_only: false,
    new_customers_only: false,
  });
  const [createFromTemplateDialogOpen, setCreateFromTemplateDialogOpen] = useState(false);
  const [selectedTemplateForCreate, setSelectedTemplateForCreate] = useState<ProPromoTemplate | null>(null);
  const [createFromTemplateCode, setCreateFromTemplateCode] = useState("");
  const [createFromTemplateStartsAt, setCreateFromTemplateStartsAt] = useState("");
  const [createFromTemplateEndsAt, setCreateFromTemplateEndsAt] = useState("");

  // ============ LOAD FUNCTIONS ============
  const loadPacks = async () => {
    setPacksLoading(true);
    setPacksError(null);

    const offersRes = await listProOffers(establishment.id).catch(() => null);
    if (!offersRes) {
      setPacksError("Impossible de charger les packs.");
    }

    const packsData = ((offersRes as { packs?: unknown[] } | null)?.packs ?? []) as Pack[];
    setPacks(packsData);
    setPacksLoading(false);
  };

  const loadPromoCodes = useCallback(async () => {
    setPromoLoading(true);
    setPromoError(null);

    try {
      const rows = await listProConsumerPromoCodes(establishment.id);
      setPromoCodes(rows ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setPromoLoading(false);
    }
  }, [establishment.id]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const data = await getProPromoAnalytics(establishment.id);
      setAnalyticsData(data);
    } catch (e) {
      console.error("Failed to load analytics:", e);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [establishment.id]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const data = await listProPromoTemplates(establishment.id);
      setTemplates(data);
    } catch (e) {
      console.error("Failed to load templates:", e);
    } finally {
      setTemplatesLoading(false);
    }
  }, [establishment.id]);

  useEffect(() => {
    void loadPacks();
    void loadPromoCodes();
    void loadAnalytics();
    void loadTemplates();
  }, [establishment.id, loadPromoCodes, loadAnalytics, loadTemplates]);

  // ============ PACKS ACTIONS ============
  const createPack = async () => {
    if (!canEdit) return;
    setPacksError(null);

    const title = newPack.title.trim();
    const price = Math.round(Number(newPack.price) * 100);
    if (!title || !Number.isFinite(price) || price <= 0) {
      setPacksError("Titre et prix sont requis.");
      return;
    }

    // Check for duplicate pack (same title and price)
    const normalizedTitle = title.toLowerCase();
    const existingPack = packs.find(
      (p) => p.title.toLowerCase() === normalizedTitle && p.price === price
    );
    if (existingPack) {
      setPacksError(`Un pack "${existingPack.title}" avec ce prix existe déjà.`);
      return;
    }

    const originalPrice = newPack.originalPrice.trim() ? Math.round(Number(newPack.originalPrice) * 100) : null;
    const stock = newPack.stock.trim() ? Math.round(Number(newPack.stock)) : null;

    try {
      await createProPack({
        establishmentId: establishment.id,
        pack: {
          title,
          description: newPack.description.trim() || null,
          label: newPack.label.trim() || null,
          price,
          original_price: originalPrice,
          is_limited: stock !== null,
          stock,
          availability: "permanent",
          valid_from: newPack.validFrom || null,
          valid_to: newPack.validTo || null,
          conditions: newPack.conditions.trim() || null,
          cover_url: newPack.coverUrl.trim() || null,
          active: true,
        },
      });
    } catch (e) {
      setPacksError(e instanceof Error ? e.message : "Impossible de créer le pack.");
      return;
    }

    setNewPack({
      title: "",
      description: "",
      label: "",
      price: "",
      originalPrice: "",
      stock: "",
      validFrom: "",
      validTo: "",
      conditions: "",
      coverUrl: "",
    });

    await loadPacks();
  };

  const deletePack = async (id: string) => {
    if (!canEdit) return;
    try {
      await deleteProPack({ establishmentId: establishment.id, packId: id });
    } catch (e) {
      setPacksError(e instanceof Error ? e.message : "Impossible de supprimer le pack.");
      return;
    }
    await loadPacks();
  };

  const openEditPackDialog = (pack: Pack) => {
    setEditingPack(pack);
    setEditPack({
      title: pack.title ?? "",
      description: pack.description ?? "",
      label: pack.label ?? "",
      price: pack.price ? String(pack.price / 100) : "",
      originalPrice: pack.original_price ? String(pack.original_price / 100) : "",
      stock: pack.stock ? String(pack.stock) : "",
      validFrom: pack.valid_from ?? "",
      validTo: pack.valid_to ?? "",
      conditions: pack.conditions ?? "",
      coverUrl: pack.cover_url ?? "",
      active: pack.active ?? true,
    });
    setEditPackDialogOpen(true);
  };

  const saveEditPack = async () => {
    if (!editingPack || !canEdit) return;

    const title = editPack.title.trim();
    const priceNum = Number(editPack.price);
    if (!title) {
      setPacksError("Le titre est requis.");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setPacksError("Le prix est requis.");
      return;
    }

    setSavingPackId(editingPack.id);
    setPacksError(null);

    try {
      await updateProPack({
        establishmentId: establishment.id,
        packId: editingPack.id,
        patch: {
          title,
          description: editPack.description.trim() || null,
          label: editPack.label.trim() || null,
          price: Math.round(priceNum * 100),
          original_price: editPack.originalPrice.trim() ? Math.round(Number(editPack.originalPrice) * 100) : null,
          is_limited: !!editPack.stock.trim(),
          stock: editPack.stock.trim() ? Math.round(Number(editPack.stock)) : null,
          valid_from: editPack.validFrom || null,
          valid_to: editPack.validTo || null,
          conditions: editPack.conditions.trim() || null,
          cover_url: editPack.coverUrl.trim() || null,
          active: editPack.active,
        },
      });
      setEditPackDialogOpen(false);
      setEditingPack(null);
      await loadPacks();
    } catch (e) {
      setPacksError(e instanceof Error ? e.message : "Impossible de modifier le pack.");
    } finally {
      setSavingPackId(null);
    }
  };

  // ============ PROMO CODES ACTIONS ============
  const promoColumns = useMemo<ColumnDef<ProConsumerPromoCode>[]>(() => {
    return [
      { header: "Code", accessorKey: "code" },
      {
        header: "Remise",
        cell: ({ row }) => <span className="tabular-nums">{percentStringFromBps(row.original.discount_bps)}%</span>,
      },
      {
        header: "Visibilité",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || savingPromoId === p.id}
              onClick={() => void updatePromo(p.id, { is_public: !p.is_public })}
            >
              {p.is_public ? "Public" : "Privé"}
            </Button>
          );
        },
      },
      {
        header: "Validité",
        cell: ({ row }) => {
          const p = row.original;
          const start = formatDateFr(p.starts_at);
          const end = formatDateFr(p.ends_at);
          if (!start && !end) return <span className="text-slate-500">Illimitée</span>;
          if (start && end) return <span className="text-slate-700">{start} → {end}</span>;
          if (start) return <span className="text-slate-700">Dès {start}</span>;
          return <span className="text-slate-700">Jusqu'au {end}</span>;
        },
      },
      {
        header: "Limites",
        cell: ({ row }) => {
          const p = row.original;
          const parts: string[] = [];
          if (p.max_uses_total) parts.push(`total: ${p.max_uses_total}`);
          if (p.max_uses_per_user) parts.push(`par user: ${p.max_uses_per_user}`);
          return parts.length ? <span className="text-slate-700">{parts.join(" · ")}</span> : <span className="text-slate-500">Illimité</span>;
        },
      },
      {
        header: "Actif",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={!canEdit || savingPromoId === p.id}
              onClick={() => void updatePromo(p.id, { active: !p.active })}
            >
              {p.active ? "Oui" : "Non"}
            </Button>
          );
        },
      },
      {
        header: "Actions",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || savingPromoId === p.id}
                onClick={() => {
                  setEditingPromo(p);
                  setEditPromo({
                    id: p.id,
                    code: p.code,
                    percent: percentStringFromBps(p.discount_bps),
                    description: p.description ?? "",
                    is_public: Boolean(p.is_public),
                    starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
                    ends_at: p.ends_at ? p.ends_at.slice(0, 16) : "",
                    max_uses_total: p.max_uses_total ? String(p.max_uses_total) : "",
                    max_uses_per_user: p.max_uses_per_user ? String(p.max_uses_per_user) : "",
                  });
                  setEditDialogOpen(true);
                }}
              >
                Modifier
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={!canEdit || savingPromoId === p.id}
                onClick={() => {
                  const ok = window.confirm(`Supprimer le code ${p.code} ?`);
                  if (!ok) return;
                  void removePromo(p.id);
                }}
              >
                Supprimer
              </Button>
            </div>
          );
        },
      },
    ];
  }, [canEdit, savingPromoId]);

  const updatePromo = async (
    promoId: string,
    patch: {
      active?: boolean;
      discount_bps?: number;
      description?: string | null;
      is_public?: boolean;
      starts_at?: string | null;
      ends_at?: string | null;
      max_uses_total?: number | null;
      max_uses_per_user?: number | null;
    },
  ) => {
    setSavingPromoId(promoId);
    try {
      await updateProConsumerPromoCode({ establishmentId: establishment.id, promoId, patch });
      await loadPromoCodes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const removePromo = async (promoId: string) => {
    setSavingPromoId(promoId);
    try {
      await deleteProConsumerPromoCode({ establishmentId: establishment.id, promoId });
      await loadPromoCodes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const createPromo = async () => {
    const code = newPromo.code.trim().toUpperCase().replace(/\s+/g, "");
    const bps = bpsFromPercentString(newPromo.percent);

    if (!bps || bps <= 0) {
      setPromoError("Remise (%) est requise.");
      return;
    }

    const startsAtIso = newPromo.starts_at.trim() ? new Date(newPromo.starts_at).toISOString() : null;
    const endsAtIso = newPromo.ends_at.trim() ? new Date(newPromo.ends_at).toISOString() : null;

    const maxUsesTotal = asPositiveIntOrNull(newPromo.max_uses_total);
    const maxUsesPerUser = asPositiveIntOrNull(newPromo.max_uses_per_user);

    setSavingPromoId("create");
    setPromoError(null);

    try {
      await createProConsumerPromoCode({
        establishmentId: establishment.id,
        code: code || undefined,
        discount_bps: bps,
        description: newPromo.description.trim() || null,
        is_public: newPromo.is_public,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        max_uses_total: maxUsesTotal,
        max_uses_per_user: maxUsesPerUser,
      });

      setNewPromo({
        code: generateSamCode(),
        percent: "",
        description: "",
        is_public: false,
        starts_at: "",
        ends_at: "",
        max_uses_total: "",
        max_uses_per_user: "",
      });
      setPromoDialogOpen(false);
      await loadPromoCodes();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const saveEditPromo = async () => {
    if (!editingPromo) return;

    const bps = bpsFromPercentString(editPromo.percent);
    if (!bps || bps <= 0) {
      setPromoError("Remise (%) est requise.");
      return;
    }

    const startsAtIso = editPromo.starts_at.trim() ? new Date(editPromo.starts_at).toISOString() : null;
    const endsAtIso = editPromo.ends_at.trim() ? new Date(editPromo.ends_at).toISOString() : null;
    const maxUsesTotal = asPositiveIntOrNull(editPromo.max_uses_total);
    const maxUsesPerUser = asPositiveIntOrNull(editPromo.max_uses_per_user);

    await updatePromo(editingPromo.id, {
      discount_bps: bps,
      description: editPromo.description.trim() || null,
      is_public: editPromo.is_public,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      max_uses_total: maxUsesTotal,
      max_uses_per_user: maxUsesPerUser,
    });

    setEditDialogOpen(false);
    setEditingPromo(null);
  };

  // ============ TEMPLATE ACTIONS ============
  const createTemplate = async () => {
    if (!canEdit) return;

    const name = newTemplate.name.trim();
    if (!name) {
      setPromoError("Le nom du template est requis.");
      return;
    }

    const bps = bpsFromPercentString(newTemplate.percent);
    if (!bps || bps <= 0) {
      setPromoError("Remise (%) est requise.");
      return;
    }

    setSavingTemplateId("create");
    setPromoError(null);

    try {
      await createProPromoTemplate({
        establishmentId: establishment.id,
        template: {
          name,
          description: newTemplate.description.trim() || null,
          discount_bps: bps,
          is_public: newTemplate.is_public,
          max_uses_total: asPositiveIntOrNull(newTemplate.max_uses_total),
          max_uses_per_user: asPositiveIntOrNull(newTemplate.max_uses_per_user),
          min_cart_amount: newTemplate.min_cart_amount.trim() ? Math.round(Number(newTemplate.min_cart_amount) * 100) : null,
          valid_days_of_week: newTemplate.valid_days_of_week.length > 0 ? newTemplate.valid_days_of_week : null,
          valid_hours_start: newTemplate.valid_hours_start || null,
          valid_hours_end: newTemplate.valid_hours_end || null,
          first_purchase_only: newTemplate.first_purchase_only,
          new_customers_only: newTemplate.new_customers_only,
        },
      });

      setNewTemplate({
        name: "",
        description: "",
        percent: "",
        is_public: false,
        max_uses_total: "",
        max_uses_per_user: "",
        min_cart_amount: "",
        valid_days_of_week: [],
        valid_hours_start: "",
        valid_hours_end: "",
        first_purchase_only: false,
        new_customers_only: false,
      });
      setTemplateDialogOpen(false);
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingTemplateId(null);
    }
  };

  const removeTemplate = async (templateId: string) => {
    setSavingTemplateId(templateId);
    try {
      await deleteProPromoTemplate({ establishmentId: establishment.id, templateId });
      await loadTemplates();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingTemplateId(null);
    }
  };

  const createPromoFromTemplateAction = async () => {
    if (!selectedTemplateForCreate) return;

    setSavingTemplateId(selectedTemplateForCreate.id);
    setPromoError(null);

    try {
      await createPromoFromTemplate({
        establishmentId: establishment.id,
        templateId: selectedTemplateForCreate.id,
        code: createFromTemplateCode.trim() || undefined,
        starts_at: createFromTemplateStartsAt ? new Date(createFromTemplateStartsAt).toISOString() : null,
        ends_at: createFromTemplateEndsAt ? new Date(createFromTemplateEndsAt).toISOString() : null,
      });

      setCreateFromTemplateDialogOpen(false);
      setSelectedTemplateForCreate(null);
      setCreateFromTemplateCode("");
      setCreateFromTemplateStartsAt("");
      setCreateFromTemplateEndsAt("");
      await loadPromoCodes();
      await loadAnalytics();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setPromoError(msg);
    } finally {
      setSavingTemplateId(null);
    }
  };

  const exportCsv = async () => {
    const token = await (async () => {
      try {
        const storageKey = Object.keys(localStorage).find(
          (key) => key.includes("supabase") && key.includes("auth-token")
        );
        if (!storageKey) return null;
        const stored = localStorage.getItem(storageKey);
        if (!stored) return null;
        const parsed = JSON.parse(stored);
        return parsed?.access_token ?? null;
      } catch {
        return null;
      }
    })();

    if (!token) {
      setPromoError("Session expirée. Veuillez vous reconnecter.");
      return;
    }

    const url = getProPromoCodesCsvUrl(establishment.id);
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      setPromoError("Erreur lors de l'export CSV.");
      return;
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = `promo-codes-${establishment.id.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const DAYS_OF_WEEK = [
    { value: 0, label: "Dim" },
    { value: 1, label: "Lun" },
    { value: 2, label: "Mar" },
    { value: 3, label: "Mer" },
    { value: 4, label: "Jeu" },
    { value: 5, label: "Ven" },
    { value: 6, label: "Sam" },
  ];

  return (
    <div className="space-y-6">
      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Vous pouvez consulter la liste, mais la création/suppression nécessite le rôle <b>Owner</b>, <b>Manager</b> ou <b>Marketing</b>.
        </div>
      ) : null}

      <Tabs defaultValue="packs">
        <TabsList className="bg-slate-100 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="packs" className="font-bold">
            <Package className="w-4 h-4 mr-1.5" />
            Packs <span className="ml-1.5 text-xs text-slate-500">({packs.length})</span>
          </TabsTrigger>
          <TabsTrigger value="codes" className="font-bold">
            <Tag className="w-4 h-4 mr-1.5" />
            Codes promo <span className="ml-1.5 text-xs text-slate-500">({promoCodes.length})</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="font-bold">
            <FileText className="w-4 h-4 mr-1.5" />
            Templates <span className="ml-1.5 text-xs text-slate-500">({templates.length})</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="font-bold">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* ============ PACKS TAB ============ */}
        <TabsContent value="packs" className="mt-6 space-y-6">
          {packsError ? <div className="text-sm text-red-600">{packsError}</div> : null}

          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    Créer un pack
                    <Badge className="bg-primary/10 text-primary border-0 text-xs">Nouveau</Badge>
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-0.5">
                    Nouvel An, Ftour Ramadan, Pack 10 séances, Menu Dégustation...
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Colonne gauche - Informations principales */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                    <Package className="w-4 h-4 text-primary" />
                    Informations du pack
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      Titre du pack <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={newPack.title}
                      onChange={(e) => setNewPack((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Ex: Menu Saint-Valentin, Pack Bien-être..."
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-blue-500" />
                      Label / Badge
                      <span className="text-xs text-slate-400 font-normal">(optionnel)</span>
                    </Label>
                    <Input
                      value={newPack.label}
                      onChange={(e) => setNewPack((p) => ({ ...p, label: e.target.value }))}
                      placeholder="Ex: -30%, Exclusif, Limité..."
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={newPack.description}
                      onChange={(e) => setNewPack((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Décrivez ce que contient votre pack..."
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Conditions d'utilisation</Label>
                    <Textarea
                      value={newPack.conditions}
                      onChange={(e) => setNewPack((p) => ({ ...p, conditions: e.target.value }))}
                      placeholder="Sur réservation, valable le weekend..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>

                {/* Colonne droite - Prix et disponibilité */}
                <div className="space-y-5">
                  {/* Section Prix */}
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <Wallet className="w-4 h-4" />
                      Tarification
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-emerald-700">
                          Prix <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Input
                            value={newPack.price}
                            onChange={(e) => setNewPack((p) => ({ ...p, price: e.target.value }))}
                            placeholder="299"
                            className="h-11 pr-14 text-lg font-semibold"
                            inputMode="decimal"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 font-medium">MAD</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-500 flex items-center gap-1">
                          <Percent className="w-3 h-3" />
                          Prix barré
                        </Label>
                        <div className="relative">
                          <Input
                            value={newPack.originalPrice}
                            onChange={(e) => setNewPack((p) => ({ ...p, originalPrice: e.target.value }))}
                            placeholder="399"
                            className="h-11 pr-14 line-through text-slate-400"
                            inputMode="decimal"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">MAD</span>
                        </div>
                      </div>
                    </div>

                    {/* Aperçu prix */}
                    {(newPack.price || newPack.originalPrice) && (
                      <div className="flex items-center gap-3 pt-2 border-t border-emerald-200/50">
                        <span className="text-xs text-emerald-600">Aperçu :</span>
                        {newPack.originalPrice && (
                          <span className="text-sm text-slate-400 line-through">{newPack.originalPrice} MAD</span>
                        )}
                        {newPack.price && (
                          <span className="text-lg font-bold text-emerald-700">{newPack.price} MAD</span>
                        )}
                        {newPack.price && newPack.originalPrice && Number(newPack.originalPrice) > Number(newPack.price) && (
                          <Badge className="bg-red-100 text-red-700 border-0 text-xs">
                            -{Math.round((1 - Number(newPack.price) / Number(newPack.originalPrice)) * 100)}%
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section Image de couverture */}
                  <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
                      <ImagePlus className="w-4 h-4" />
                      Image de couverture
                    </div>

                    {newPack.coverUrl ? (
                      <div className="relative">
                        <img
                          src={newPack.coverUrl}
                          alt="Couverture du pack"
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2 h-8 w-8 p-0"
                          onClick={() => setNewPack((p) => ({ ...p, coverUrl: "" }))}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label
                          htmlFor="pack-cover-upload"
                          className="flex flex-col items-center justify-center w-full h-28 border-2 border-violet-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-violet-50 transition-colors"
                        >
                          <div className="flex flex-col items-center justify-center pt-4 pb-4">
                            <Upload className="w-8 h-8 mb-2 text-violet-500" />
                            <p className="text-sm text-violet-600 font-medium">
                              Cliquez pour télécharger
                            </p>
                            <p className="text-xs text-violet-400 mt-1">PNG, JPG (max 2 Mo)</p>
                          </div>
                          <input
                            id="pack-cover-upload"
                            type="file"
                            className="hidden"
                            accept="image/png,image/jpeg,image/webp"
                            disabled={uploadingCover}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;

                              if (file.size > 2 * 1024 * 1024) {
                                setPacksError("L'image ne doit pas dépasser 2 Mo.");
                                return;
                              }

                              setUploadingCover(true);
                              setPacksError(null);

                              try {
                                const formData = new FormData();
                                formData.append("image", file);

                                const token = localStorage.getItem("sb_access_token");
                                const res = await fetch(`/api/pro/establishments/${establishment.id}/inventory/images/upload`, {
                                  method: "POST",
                                  headers: {
                                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                  },
                                  body: formData,
                                });

                                if (!res.ok) {
                                  const data = await res.json().catch(() => null);
                                  throw new Error(data?.error || "Erreur lors de l'upload");
                                }

                                const { url } = await res.json();
                                setNewPack((p) => ({ ...p, coverUrl: url }));
                              } catch (err) {
                                setPacksError(err instanceof Error ? err.message : "Erreur lors de l'upload");
                              } finally {
                                setUploadingCover(false);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                        {uploadingCover && (
                          <div className="flex items-center justify-center gap-2 text-sm text-violet-600">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Téléchargement en cours...
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Section Disponibilité */}
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                      <Calendar className="w-4 h-4" />
                      Disponibilité
                    </div>

                    <div className="space-y-2">
                      <Label className="text-blue-700">Stock disponible</Label>
                      <Input
                        value={newPack.stock}
                        onChange={(e) => setNewPack((p) => ({ ...p, stock: e.target.value }))}
                        placeholder="Illimité si vide"
                        className="h-11"
                        inputMode="numeric"
                      />
                      <p className="text-xs text-blue-600">Laissez vide pour un stock illimité</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-sm text-blue-700">Début</Label>
                        <Input
                          type="date"
                          value={newPack.validFrom}
                          onChange={(e) => setNewPack((p) => ({ ...p, validFrom: e.target.value }))}
                          className="h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-blue-700">Fin</Label>
                        <Input
                          type="date"
                          value={newPack.validTo}
                          onChange={(e) => setNewPack((p) => ({ ...p, validTo: e.target.value }))}
                          className="h-10"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Bouton de création */}
                  <Button
                    className="w-full h-12 bg-primary text-white hover:bg-primary/90 font-bold gap-2 text-base shadow-lg shadow-primary/20"
                    disabled={!canEdit || !newPack.title.trim() || !newPack.price.trim()}
                    onClick={createPack}
                  >
                    <Plus className="w-5 h-5" />
                    Créer le pack
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Packs</CardTitle>
            </CardHeader>
            <CardContent>
              {packsLoading ? (
                <div className="text-sm text-slate-600">Chargement…</div>
              ) : packs.length ? (
                <>
                  <div className="md:hidden space-y-3">
                    {packs.map((p) => (
                      <div key={p.id} className="rounded-xl border bg-white overflow-hidden">
                        {/* Cover image */}
                        {p.cover_url && (
                          <div className="relative h-32 w-full">
                            <img
                              src={p.cover_url}
                              alt={p.title}
                              className="w-full h-full object-cover"
                            />
                            {!p.active && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Badge className="bg-slate-800 text-white border-0">Inactif</Badge>
                              </div>
                            )}
                          </div>
                        )}
                        <div className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <div className="font-semibold truncate">{p.title}</div>
                                {!p.active && !p.cover_url && <Badge className="bg-slate-100 text-slate-600 border-0 text-xs">Inactif</Badge>}
                              </div>
                              {p.label ? <Badge className="mt-1 bg-primary/10 text-primary border-0 text-xs">{p.label}</Badge> : null}
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" className="gap-1" disabled={!canEdit} onClick={() => openEditPackDialog(p)}>
                                <Edit3 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                                disabled={!canEdit}
                                onClick={() => {
                                  if (window.confirm(`Supprimer le pack "${p.title}" ?`)) deletePack(p.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-slate-500">Prix</div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold tabular-nums text-emerald-700">{formatMoney(p.price, "MAD")}</span>
                                {p.original_price && p.original_price > p.price && (
                                  <span className="text-xs text-slate-400 line-through">{formatMoney(p.original_price, "MAD")}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-500">Stock</div>
                              <div className="font-semibold tabular-nums">{p.stock ?? "Illimité"}</div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-slate-500">Validité</div>
                              <div className="text-sm text-slate-700 whitespace-nowrap">
                                {p.valid_from || p.valid_to ? `${p.valid_from ?? "..."} → ${p.valid_to ?? "..."}` : "Permanente"}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[920px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16">Image</TableHead>
                          <TableHead>Titre</TableHead>
                          <TableHead>Prix</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Validité</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {packs.map((p) => (
                          <TableRow key={p.id} className={!p.active ? "opacity-60" : ""}>
                            <TableCell>
                              {p.cover_url ? (
                                <img
                                  src={p.cover_url}
                                  alt={p.title}
                                  className="w-12 h-12 object-cover rounded-lg"
                                />
                              ) : (
                                <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center">
                                  <ImagePlus className="w-5 h-5 text-slate-400" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="font-semibold">{p.title}</div>
                              {p.label ? <Badge className="mt-1 bg-primary/10 text-primary border-0 text-xs">{p.label}</Badge> : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="font-semibold text-emerald-700">{formatMoney(p.price, "MAD")}</span>
                                {p.original_price && p.original_price > p.price && (
                                  <span className="text-xs text-slate-400 line-through">{formatMoney(p.original_price, "MAD")}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="tabular-nums">{p.stock ?? <span className="text-slate-400">Illimité</span>}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {p.valid_from || p.valid_to ? `${p.valid_from ?? "..."} → ${p.valid_to ?? "..."}` : <span className="text-slate-400">Permanente</span>}
                            </TableCell>
                            <TableCell>
                              {p.active ? (
                                <Badge className="bg-emerald-100 text-emerald-700 border-0">Actif</Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-600 border-0">Inactif</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" className="gap-2" disabled={!canEdit} onClick={() => openEditPackDialog(p)}>
                                  <Edit3 className="w-4 h-4" />
                                  Modifier
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  disabled={!canEdit}
                                  onClick={() => {
                                    if (window.confirm(`Supprimer le pack "${p.title}" ?`)) deletePack(p.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Aucun pack pour le moment.</div>
              )}
            </CardContent>
          </Card>

          {/* Dialog d'édition de pack */}
          <Dialog
            open={editPackDialogOpen}
            onOpenChange={(open) => {
              setEditPackDialogOpen(open);
              if (!open) {
                setEditingPack(null);
                setPacksError(null);
              }
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-primary" />
                  Modifier le pack
                </DialogTitle>
                <DialogDescription>
                  Modifiez les informations de votre pack
                </DialogDescription>
              </DialogHeader>

              {packsError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {packsError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Colonne gauche */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Titre <span className="text-red-500">*</span></Label>
                    <Input
                      value={editPack.title}
                      onChange={(e) => setEditPack((p) => ({ ...p, title: e.target.value }))}
                      placeholder="Titre du pack"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Label / Badge</Label>
                    <Input
                      value={editPack.label}
                      onChange={(e) => setEditPack((p) => ({ ...p, label: e.target.value }))}
                      placeholder="Ex: -30%, Exclusif..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={editPack.description}
                      onChange={(e) => setEditPack((p) => ({ ...p, description: e.target.value }))}
                      rows={3}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Conditions</Label>
                    <Textarea
                      value={editPack.conditions}
                      onChange={(e) => setEditPack((p) => ({ ...p, conditions: e.target.value }))}
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>

                {/* Colonne droite */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Prix (MAD) <span className="text-red-500">*</span></Label>
                      <Input
                        value={editPack.price}
                        onChange={(e) => setEditPack((p) => ({ ...p, price: e.target.value }))}
                        placeholder="299"
                        inputMode="decimal"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Prix barré</Label>
                      <Input
                        value={editPack.originalPrice}
                        onChange={(e) => setEditPack((p) => ({ ...p, originalPrice: e.target.value }))}
                        placeholder="399"
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Stock</Label>
                    <Input
                      value={editPack.stock}
                      onChange={(e) => setEditPack((p) => ({ ...p, stock: e.target.value }))}
                      placeholder="Illimité si vide"
                      inputMode="numeric"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Début validité</Label>
                      <Input
                        type="date"
                        value={editPack.validFrom}
                        onChange={(e) => setEditPack((p) => ({ ...p, validFrom: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Fin validité</Label>
                      <Input
                        type="date"
                        value={editPack.validTo}
                        onChange={(e) => setEditPack((p) => ({ ...p, validTo: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Image de couverture */}
                  <div className="rounded-xl border-2 border-dashed border-violet-200 bg-violet-50/50 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-violet-700">
                      <ImagePlus className="w-4 h-4" />
                      Image de couverture
                    </div>

                    {editPack.coverUrl ? (
                      <div className="relative">
                        <img
                          src={editPack.coverUrl}
                          alt="Couverture du pack"
                          className="w-full h-24 object-cover rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-1 right-1 h-7 w-7 p-0"
                          onClick={() => setEditPack((p) => ({ ...p, coverUrl: "" }))}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <label
                        htmlFor="edit-pack-cover-upload"
                        className="flex flex-col items-center justify-center w-full h-20 border-2 border-violet-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-violet-50 transition-colors"
                      >
                        <Upload className="w-6 h-6 mb-1 text-violet-500" />
                        <p className="text-xs text-violet-600 font-medium">
                          Télécharger une image
                        </p>
                        <input
                          id="edit-pack-cover-upload"
                          type="file"
                          className="hidden"
                          accept="image/png,image/jpeg,image/webp"
                          disabled={uploadingCover}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            if (file.size > 2 * 1024 * 1024) {
                              setPacksError("L'image ne doit pas dépasser 2 Mo.");
                              return;
                            }

                            setUploadingCover(true);
                            setPacksError(null);

                            try {
                              const formData = new FormData();
                              formData.append("image", file);

                              const token = localStorage.getItem("sb_access_token");
                              const res = await fetch(`/api/pro/establishments/${establishment.id}/inventory/images/upload`, {
                                method: "POST",
                                headers: {
                                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                                },
                                body: formData,
                              });

                              if (!res.ok) {
                                const data = await res.json().catch(() => null);
                                throw new Error(data?.error || "Erreur lors de l'upload");
                              }

                              const { url } = await res.json();
                              setEditPack((p) => ({ ...p, coverUrl: url }));
                            } catch (err) {
                              setPacksError(err instanceof Error ? err.message : "Erreur lors de l'upload");
                            } finally {
                              setUploadingCover(false);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    )}
                    {uploadingCover && (
                      <div className="flex items-center justify-center gap-2 text-xs text-violet-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Téléchargement...
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border p-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">Pack actif</div>
                      <div className="text-xs text-slate-500">Visible et achetable par les clients</div>
                    </div>
                    <Switch
                      checked={editPack.active}
                      onCheckedChange={(v) => setEditPack((p) => ({ ...p, active: v }))}
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditPackDialogOpen(false);
                    setEditingPack(null);
                  }}
                  disabled={savingPackId === editingPack?.id}
                >
                  Annuler
                </Button>
                <Button
                  className="bg-primary text-white hover:bg-primary/90 gap-2"
                  onClick={() => void saveEditPack()}
                  disabled={savingPackId === editingPack?.id || !editPack.title.trim() || !editPack.price.trim()}
                >
                  {savingPackId === editingPack?.id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Enregistrer
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ============ PROMO CODES TAB ============ */}
        <TabsContent value="codes" className="mt-6 space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Codes promo</CardTitle>
                  <div className="text-sm text-slate-600">
                    Créez des codes promo pour vos clients (packs offerts ou remise). Valables uniquement dans cet établissement.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => void loadPromoCodes()} disabled={promoLoading}>
                    {promoLoading ? "…" : "Rafraîchir"}
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setNewPromo((p) => ({
                        ...p,
                        code: p.code.trim() ? p.code : generateSamCode(),
                      }));
                      setPromoDialogOpen(true);
                    }}
                    disabled={!canEdit}
                  >
                    Nouveau code
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {promoError ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{promoError}</div> : null}

              <AdminDataTable<ProConsumerPromoCode>
                data={promoCodes}
                columns={promoColumns}
                searchPlaceholder="Rechercher par code…"
                isLoading={promoLoading}
              />

              {/* New Promo Dialog */}
              <Dialog
                open={promoDialogOpen}
                onOpenChange={(open) => {
                  setPromoDialogOpen(open);
                  if (open) setPromoError(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <DialogTitle>Nouveau code promo</DialogTitle>
                        <DialogDescription>Paramètres du code</DialogDescription>
                      </div>
                      <HelpPopover label="Aide">
                        Remise (%) = réduction sur les packs de cet établissement.
                        <br />
                        <b>100%</b> = pack offert.
                      </HelpPopover>
                    </div>
                  </DialogHeader>

                  <div className="space-y-2 sm:space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>Code</Label>
                        <HelpPopover label="Format">
                          Le code est ce que le client saisit au paiement.
                          <br />
                          Exemple : <b>SAMXXXXXXXXXX</b>
                        </HelpPopover>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <Input
                          value={newPromo.code}
                          onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
                          placeholder="SAMXXXXXXXXXX"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full sm:w-auto"
                          onClick={() => setNewPromo((p) => ({ ...p, code: generateSamCode() }))}
                        >
                          Générer
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-md border p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Visibilité</div>
                        <HelpPopover label="Visibilité">
                          <b>Privé</b> = geste commercial (à donner à un client précis).
                          <br />
                          <b>Public</b> = partageable (campagne / réseaux).
                        </HelpPopover>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2">
                        <span className="text-xs text-slate-600 whitespace-nowrap">{newPromo.is_public ? "Public" : "Privé"}</span>
                        <Switch checked={newPromo.is_public} onCheckedChange={(v) => setNewPromo((p) => ({ ...p, is_public: v }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Début (optionnel)</Label>
                        <Input type="datetime-local" value={newPromo.starts_at} onChange={(e) => setNewPromo((p) => ({ ...p, starts_at: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Fin (optionnel)</Label>
                        <Input type="datetime-local" value={newPromo.ends_at} onChange={(e) => setNewPromo((p) => ({ ...p, ends_at: e.target.value }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label>Limite totale (optionnel)</Label>
                          <HelpPopover label="Limite totale">
                            Nombre max d'utilisations du code (tous clients confondus).
                            <br />
                            Exemple : 1 = utilisable une seule fois.
                          </HelpPopover>
                        </div>
                        <Input
                          value={newPromo.max_uses_total}
                          onChange={(e) => setNewPromo((p) => ({ ...p, max_uses_total: e.target.value }))}
                          placeholder="ex: 1"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label>Limite par client (optionnel)</Label>
                          <HelpPopover label="Limite par client">
                            Nombre max d'utilisations <b>par utilisateur</b>.
                            <br />
                            Exemple : 1 = un même client ne peut l'utiliser qu'une fois.
                          </HelpPopover>
                        </div>
                        <Input
                          value={newPromo.max_uses_per_user}
                          onChange={(e) => setNewPromo((p) => ({ ...p, max_uses_per_user: e.target.value }))}
                          placeholder="ex: 1"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>Remise (%)</Label>
                        <HelpPopover label="Remise">
                          100 = pack offert.
                          <br />
                          50 = -50%.
                        </HelpPopover>
                      </div>
                      <Input
                        value={newPromo.percent}
                        onChange={(e) => setNewPromo((p) => ({ ...p, percent: e.target.value }))}
                        placeholder="100"
                        inputMode="decimal"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Description (optionnel)</Label>
                      <Input
                        value={newPromo.description}
                        onChange={(e) => setNewPromo((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Campagne Instagram"
                      />
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      onClick={() => setPromoDialogOpen(false)}
                      disabled={savingPromoId === "create"}
                    >
                      Annuler
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={() => void createPromo()} disabled={savingPromoId === "create"}>
                      {savingPromoId === "create" ? "Création..." : "Créer"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Edit Promo Dialog */}
              <Dialog
                open={editDialogOpen}
                onOpenChange={(open) => {
                  setEditDialogOpen(open);
                  if (!open) setEditingPromo(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <DialogTitle>Modifier le code</DialogTitle>
                        <DialogDescription>Paramètres du code</DialogDescription>
                      </div>
                      <HelpPopover label="Aide">
                        Vous pouvez ajuster : visibilité, dates de validité, limites et remise.
                      </HelpPopover>
                    </div>
                  </DialogHeader>

                  <div className="space-y-2 sm:space-y-3">
                    <div className="space-y-1">
                      <Label>Code</Label>
                      <Input value={editPromo.code} disabled />
                    </div>

                    <div className="rounded-md border p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium">Visibilité</div>
                        <HelpPopover label="Visibilité">
                          <b>Privé</b> = geste commercial (à donner à un client précis).
                          <br />
                          <b>Public</b> = partageable (campagne / réseaux).
                        </HelpPopover>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2">
                        <span className="text-xs text-slate-600 whitespace-nowrap">{editPromo.is_public ? "Public" : "Privé"}</span>
                        <Switch checked={editPromo.is_public} onCheckedChange={(v) => setEditPromo((p) => ({ ...p, is_public: v }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Début (optionnel)</Label>
                        <Input type="datetime-local" value={editPromo.starts_at} onChange={(e) => setEditPromo((p) => ({ ...p, starts_at: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Fin (optionnel)</Label>
                        <Input type="datetime-local" value={editPromo.ends_at} onChange={(e) => setEditPromo((p) => ({ ...p, ends_at: e.target.value }))} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label>Limite totale (optionnel)</Label>
                          <HelpPopover label="Limite totale">
                            Nombre max d'utilisations du code (tous clients confondus).
                            <br />
                            Exemple : 1 = utilisable une seule fois.
                          </HelpPopover>
                        </div>
                        <Input
                          value={editPromo.max_uses_total}
                          onChange={(e) => setEditPromo((p) => ({ ...p, max_uses_total: e.target.value }))}
                          placeholder="ex: 1"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label>Limite par client (optionnel)</Label>
                          <HelpPopover label="Limite par client">
                            Nombre max d'utilisations <b>par utilisateur</b>.
                            <br />
                            Exemple : 1 = un même client ne peut l'utiliser qu'une fois.
                          </HelpPopover>
                        </div>
                        <Input
                          value={editPromo.max_uses_per_user}
                          onChange={(e) => setEditPromo((p) => ({ ...p, max_uses_per_user: e.target.value }))}
                          placeholder="ex: 1"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Label>Remise (%)</Label>
                        <HelpPopover label="Remise">
                          100 = pack offert.
                          <br />
                          50 = -50%.
                        </HelpPopover>
                      </div>
                      <Input
                        value={editPromo.percent}
                        onChange={(e) => setEditPromo((p) => ({ ...p, percent: e.target.value }))}
                        placeholder="100"
                        inputMode="decimal"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label>Description (optionnel)</Label>
                      <Input
                        value={editPromo.description}
                        onChange={(e) => setEditPromo((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Geste commercial"
                      />
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      onClick={() => {
                        setEditDialogOpen(false);
                        setEditingPromo(null);
                      }}
                      disabled={!!editingPromo && savingPromoId === editingPromo.id}
                    >
                      Annuler
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      onClick={() => void saveEditPromo()}
                      disabled={!!editingPromo && savingPromoId === editingPromo.id}
                    >
                      {editingPromo && savingPromoId === editingPromo.id ? "Sauvegarde..." : "Sauvegarder"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ TEMPLATES TAB ============ */}
        <TabsContent value="templates" className="mt-6 space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Templates de codes promo
                  </CardTitle>
                  <div className="text-sm text-slate-600">
                    Sauvegardez des configurations réutilisables pour créer rapidement des codes promo.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => setTemplateDialogOpen(true)}
                    disabled={!canEdit}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nouveau template
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {promoError && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{promoError}</div>}

              {templatesLoading ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des templates...
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <div className="font-medium">Aucun template</div>
                  <div className="text-sm">Créez votre premier template pour simplifier la création de codes promo.</div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {templates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="rounded-xl border bg-white p-4 space-y-3 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-slate-900">{tpl.name}</div>
                          {tpl.description && (
                            <div className="text-sm text-slate-500 mt-0.5">{tpl.description}</div>
                          )}
                        </div>
                        <Badge className="bg-primary/10 text-primary border-0 font-bold">
                          -{tpl.discount_bps / 100}%
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {tpl.is_public && <Badge variant="outline" className="text-xs">Public</Badge>}
                        {tpl.max_uses_total && <Badge variant="outline" className="text-xs">Max {tpl.max_uses_total}</Badge>}
                        {tpl.first_purchase_only && <Badge variant="outline" className="text-xs">1er achat</Badge>}
                        {tpl.new_customers_only && <Badge variant="outline" className="text-xs">Nouveaux clients</Badge>}
                        {tpl.min_cart_amount && (
                          <Badge variant="outline" className="text-xs">Min {formatMoney(tpl.min_cart_amount, "MAD")}</Badge>
                        )}
                        {tpl.valid_days_of_week && tpl.valid_days_of_week.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {tpl.valid_days_of_week.map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label).join(", ")}
                          </Badge>
                        )}
                        {tpl.valid_hours_start && tpl.valid_hours_end && (
                          <Badge variant="outline" className="text-xs">
                            {tpl.valid_hours_start} - {tpl.valid_hours_end}
                          </Badge>
                        )}
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setSelectedTemplateForCreate(tpl);
                            setCreateFromTemplateCode(generateSamCode());
                            setCreateFromTemplateDialogOpen(true);
                          }}
                          disabled={!canEdit || savingTemplateId === tpl.id}
                        >
                          <Copy className="w-4 h-4 mr-1.5" />
                          Créer code
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => {
                            if (window.confirm(`Supprimer le template "${tpl.name}" ?`)) {
                              void removeTemplate(tpl.id);
                            }
                          }}
                          disabled={!canEdit || savingTemplateId === tpl.id}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* New Template Dialog */}
              <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                <DialogContent className="max-w-xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      Nouveau template
                    </DialogTitle>
                    <DialogDescription>
                      Créez un modèle réutilisable pour vos codes promo
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Nom du template <span className="text-red-500">*</span></Label>
                        <Input
                          value={newTemplate.name}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Ex: Promo Weekend"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Remise (%) <span className="text-red-500">*</span></Label>
                        <Input
                          value={newTemplate.percent}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, percent: e.target.value }))}
                          placeholder="15"
                          inputMode="decimal"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Input
                        value={newTemplate.description}
                        onChange={(e) => setNewTemplate((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Description du template"
                      />
                    </div>

                    <div className="rounded-md border p-3 flex items-center justify-between">
                      <div className="text-sm font-medium">Visibilité publique</div>
                      <Switch
                        checked={newTemplate.is_public}
                        onCheckedChange={(v) => setNewTemplate((p) => ({ ...p, is_public: v }))}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Limite totale</Label>
                        <Input
                          value={newTemplate.max_uses_total}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, max_uses_total: e.target.value }))}
                          placeholder="Illimité"
                          inputMode="numeric"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Limite par client</Label>
                        <Input
                          value={newTemplate.max_uses_per_user}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, max_uses_per_user: e.target.value }))}
                          placeholder="Illimité"
                          inputMode="numeric"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Panier minimum (MAD)</Label>
                      <Input
                        value={newTemplate.min_cart_amount}
                        onChange={(e) => setNewTemplate((p) => ({ ...p, min_cart_amount: e.target.value }))}
                        placeholder="Ex: 100"
                        inputMode="decimal"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Jours valides</Label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map((day) => (
                          <label
                            key={day.value}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border cursor-pointer text-sm ${
                              newTemplate.valid_days_of_week.includes(day.value)
                                ? "bg-primary/10 border-primary text-primary"
                                : "bg-white border-slate-200"
                            }`}
                          >
                            <Checkbox
                              checked={newTemplate.valid_days_of_week.includes(day.value)}
                              onCheckedChange={(checked) => {
                                setNewTemplate((p) => ({
                                  ...p,
                                  valid_days_of_week: checked
                                    ? [...p.valid_days_of_week, day.value]
                                    : p.valid_days_of_week.filter((d) => d !== day.value),
                                }));
                              }}
                              className="hidden"
                            />
                            {day.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Heure début</Label>
                        <Input
                          type="time"
                          value={newTemplate.valid_hours_start}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, valid_hours_start: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Heure fin</Label>
                        <Input
                          type="time"
                          value={newTemplate.valid_hours_end}
                          onChange={(e) => setNewTemplate((p) => ({ ...p, valid_hours_end: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={newTemplate.first_purchase_only}
                          onCheckedChange={(v) => setNewTemplate((p) => ({ ...p, first_purchase_only: !!v }))}
                        />
                        <span className="text-sm">Premier achat uniquement</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={newTemplate.new_customers_only}
                          onCheckedChange={(v) => setNewTemplate((p) => ({ ...p, new_customers_only: !!v }))}
                        />
                        <span className="text-sm">Nouveaux clients uniquement</span>
                      </label>
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => setTemplateDialogOpen(false)} disabled={savingTemplateId === "create"}>
                      Annuler
                    </Button>
                    <Button onClick={() => void createTemplate()} disabled={savingTemplateId === "create"}>
                      {savingTemplateId === "create" ? "Création..." : "Créer le template"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Create Promo From Template Dialog */}
              <Dialog open={createFromTemplateDialogOpen} onOpenChange={setCreateFromTemplateDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Copy className="w-5 h-5 text-primary" />
                      Créer un code depuis "{selectedTemplateForCreate?.name}"
                    </DialogTitle>
                    <DialogDescription>
                      Le code héritera des paramètres du template
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <Label>Code promo</Label>
                      <div className="flex gap-2">
                        <Input
                          value={createFromTemplateCode}
                          onChange={(e) => setCreateFromTemplateCode(e.target.value)}
                          placeholder="SAMXXXXXXXXXX"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setCreateFromTemplateCode(generateSamCode())}
                        >
                          Générer
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Début (optionnel)</Label>
                        <Input
                          type="datetime-local"
                          value={createFromTemplateStartsAt}
                          onChange={(e) => setCreateFromTemplateStartsAt(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Fin (optionnel)</Label>
                        <Input
                          type="datetime-local"
                          value={createFromTemplateEndsAt}
                          onChange={(e) => setCreateFromTemplateEndsAt(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCreateFromTemplateDialogOpen(false);
                        setSelectedTemplateForCreate(null);
                      }}
                      disabled={savingTemplateId === selectedTemplateForCreate?.id}
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={() => void createPromoFromTemplateAction()}
                      disabled={savingTemplateId === selectedTemplateForCreate?.id}
                    >
                      {savingTemplateId === selectedTemplateForCreate?.id ? "Création..." : "Créer le code"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ ANALYTICS TAB ============ */}
        <TabsContent value="analytics" className="mt-6 space-y-6">
          <Card className="border-slate-200">
            <CardHeader className="space-y-1">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Analytics des codes promo
                  </CardTitle>
                  <div className="text-sm text-slate-600">
                    Suivez les performances de vos codes promotionnels.
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
                  <Button variant="outline" onClick={() => void loadAnalytics()} disabled={analyticsLoading}>
                    {analyticsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Rafraîchir"}
                  </Button>
                  <Button variant="outline" onClick={() => void exportCsv()} disabled={!canEdit}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {analyticsLoading ? (
                <div className="text-sm text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Chargement des analytics...
                </div>
              ) : analyticsData ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-blue-100/50 p-4">
                      <div className="text-sm text-blue-700 font-medium">Codes actifs</div>
                      <div className="text-2xl font-bold text-blue-900 mt-1">{analyticsData.summary.total_codes}</div>
                    </div>
                    <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-4">
                      <div className="text-sm text-emerald-700 font-medium">Utilisations totales</div>
                      <div className="text-2xl font-bold text-emerald-900 mt-1">{analyticsData.summary.total_usage}</div>
                    </div>
                    <div className="rounded-xl border bg-gradient-to-br from-purple-50 to-purple-100/50 p-4">
                      <div className="text-sm text-purple-700 font-medium">Revenus générés</div>
                      <div className="text-2xl font-bold text-purple-900 mt-1">{formatMoney(analyticsData.summary.total_revenue, "MAD")}</div>
                    </div>
                    <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-amber-100/50 p-4">
                      <div className="text-sm text-amber-700 font-medium">Remises accordées</div>
                      <div className="text-2xl font-bold text-amber-900 mt-1">{formatMoney(analyticsData.summary.total_discount, "MAD")}</div>
                    </div>
                  </div>

                  {/* Analytics Table */}
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead>Code</TableHead>
                          <TableHead className="text-right">Remise</TableHead>
                          <TableHead className="text-right">Utilisations</TableHead>
                          <TableHead className="text-right">Revenus</TableHead>
                          <TableHead className="text-right">Remises</TableHead>
                          <TableHead className="text-center">Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analyticsData.analytics.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                              Aucune donnée disponible
                            </TableCell>
                          </TableRow>
                        ) : (
                          analyticsData.analytics.map((promo) => (
                            <TableRow key={promo.id}>
                              <TableCell className="font-mono font-medium">{promo.code}</TableCell>
                              <TableCell className="text-right tabular-nums">-{promo.discount_bps / 100}%</TableCell>
                              <TableCell className="text-right tabular-nums">
                                <div className="flex items-center justify-end gap-1">
                                  {promo.usage_count}
                                  {promo.max_uses_total && (
                                    <span className="text-slate-400 text-xs">/ {promo.max_uses_total}</span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right tabular-nums font-medium text-emerald-700">
                                {formatMoney(promo.revenue_generated, "MAD")}
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-amber-700">
                                {formatMoney(promo.discount_given, "MAD")}
                              </TableCell>
                              <TableCell className="text-center">
                                {promo.active ? (
                                  <Badge className="bg-emerald-100 text-emerald-700 border-0">Actif</Badge>
                                ) : (
                                  <Badge className="bg-slate-100 text-slate-600 border-0">Inactif</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <BarChart3 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <div className="font-medium">Aucune donnée</div>
                  <div className="text-sm">Les analytics seront disponibles une fois que vous aurez des codes promo.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
