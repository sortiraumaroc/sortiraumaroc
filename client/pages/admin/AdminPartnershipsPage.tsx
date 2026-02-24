/**
 * Admin Partnerships Page — Gestion des accords partenaires
 *
 * Tabs: Dashboard, Accords
 * Detail dialog with inner tabs: Infos, Lignes, Journal, Stats
 */

import { useCallback, useEffect, useState } from "react";
import {
  Handshake,
  BarChart3,
  Plus,
  Pencil,
  Trash2,
  Download,
  Send,
  PauseCircle,
  PlayCircle,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

import {
  listPartnerships,
  getPartnership,
  createPartnership,
  updatePartnership,
  deletePartnership,
  addPartnershipLine,
  updatePartnershipLine,
  deletePartnershipLine,
  sendPartnershipProposal,
  getPartnershipDashboard,
  getPartnershipExportUrl,
} from "@/lib/partnershipApi";

import type {
  AgreementWithEstablishment,
  AgreementDetail,
  AgreementLine,
  PartnershipDashboardStats,
  AgreementStatus,
  AgreementLineModule,
  AgreementLineType,
  AgreementHistoryEntry,
  CreateAgreementPayload,
  UpdateAgreementPayload,
  CreateAgreementLinePayload,
  UpdateAgreementLinePayload,
} from "../../../shared/partnershipTypes";

import {
  AGREEMENT_STATUS_CONFIG,
  AGREEMENT_STATUSES,
  AGREEMENT_LINE_MODULES,
  AGREEMENT_LINE_TYPES,
  MODULE_LABELS,
} from "../../../shared/partnershipTypes";

// ============================================================================
// Helpers
// ============================================================================

const PER_PAGE = 20;

function StatusBadge({ status }: { status: AgreementStatus }) {
  const cfg = AGREEMENT_STATUS_CONFIG[status] ?? { label: status, color: "gray" };
  const colorMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-green-100 text-green-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-gray-100 text-gray-800",
  };
  return <Badge className={colorMap[cfg.color] ?? colorMap.gray}>{cfg.label}</Badge>;
}

function ModuleBadge({ module }: { module: AgreementLineModule }) {
  const colorMap: Record<string, string> = {
    ce: "bg-indigo-100 text-indigo-800",
    conciergerie: "bg-purple-100 text-purple-800",
    both: "bg-pink-100 text-pink-800",
  };
  return (
    <Badge className={colorMap[module] ?? "bg-gray-100 text-gray-800"}>
      {MODULE_LABELS[module] ?? module}
    </Badge>
  );
}

function AdvantageTypeBadge({ type }: { type: AgreementLineType }) {
  const labels: Record<string, string> = {
    percentage: "Reduction %",
    fixed: "Reduction fixe",
    special_offer: "Offre speciale",
    gift: "Cadeau",
    pack: "Pack",
  };
  return <Badge variant="outline">{labels[type] ?? type}</Badge>;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Dashboard Tab
// ============================================================================

function DashboardTab() {
  const [stats, setStats] = useState<PartnershipDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPartnershipDashboard()
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return <div className="p-6 text-muted-foreground">Chargement...</div>;
  if (!stats)
    return <div className="p-6 text-red-500">Erreur de chargement</div>;

  const kpis = [
    { label: "Actifs", value: stats.active_agreements, icon: PlayCircle, color: "text-green-600" },
    { label: "En negociation", value: stats.in_negotiation_count, icon: Handshake, color: "text-amber-600" },
    { label: "Propositions envoyees", value: stats.proposal_sent_count, icon: Send, color: "text-blue-600" },
    { label: "Brouillons", value: stats.draft_agreements, icon: FileText, color: "text-slate-500" },
    { label: "Suspendus", value: stats.suspended_count, icon: PauseCircle, color: "text-orange-600" },
    { label: "Expirant sous 30j", value: stats.expiring_30d, icon: AlertTriangle, color: "text-red-600" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-lg border p-4 text-center">
            <kpi.icon className={`w-5 h-5 mx-auto mb-2 ${kpi.color}`} />
            <p className="text-2xl font-bold">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Lines by module */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-3">Lignes par module</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600">{stats.lines_by_module.ce}</p>
            <p className="text-xs text-muted-foreground">CE</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.lines_by_module.conciergerie}</p>
            <p className="text-xs text-muted-foreground">Conciergerie</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-pink-600">{stats.lines_by_module.both}</p>
            <p className="text-xs text-muted-foreground">CE + Conciergerie</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t flex justify-between text-sm text-muted-foreground">
          <span>Total lignes : {stats.total_lines}</span>
          <span>Lignes actives : {stats.active_lines}</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="font-semibold mb-3">Resume global</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Total accords</p>
            <p className="text-lg font-bold">{stats.total_agreements}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Refuses</p>
            <p className="text-lg font-bold text-red-600">{stats.refused_count}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Total lignes</p>
            <p className="text-lg font-bold">{stats.total_lines}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lignes actives</p>
            <p className="text-lg font-bold text-green-600">{stats.active_lines}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Create / Edit Agreement Dialog
// ============================================================================

type AgreementFormData = {
  establishment_id: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  start_date: string;
  end_date: string;
  commission_rate: string;
  notes: string;
};

const emptyForm: AgreementFormData = {
  establishment_id: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  start_date: "",
  end_date: "",
  commission_rate: "",
  notes: "",
};

function AgreementFormDialog({
  open,
  editData,
  onClose,
  onSaved,
}: {
  open: boolean;
  editData: AgreementDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<AgreementFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          establishment_id: editData.establishment_id,
          contact_name: editData.contact_name ?? "",
          contact_email: editData.contact_email ?? "",
          contact_phone: editData.contact_phone ?? "",
          start_date: editData.start_date ?? "",
          end_date: editData.end_date ?? "",
          commission_rate: editData.commission_rate != null ? String(editData.commission_rate) : "",
          notes: editData.notes ?? "",
        });
      } else {
        setForm(emptyForm);
      }
    }
  }, [open, editData]);

  const handleSave = async () => {
    if (!form.establishment_id.trim()) {
      toast({ title: "Erreur", description: "L'ID etablissement est requis", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: CreateAgreementPayload | UpdateAgreementPayload = {
        establishment_id: form.establishment_id.trim(),
        contact_name: form.contact_name || undefined,
        contact_email: form.contact_email || undefined,
        contact_phone: form.contact_phone || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        commission_rate: form.commission_rate ? Number(form.commission_rate) : undefined,
        notes: form.notes || undefined,
      };

      if (editData) {
        const { establishment_id: _, ...updatePayload } = payload as CreateAgreementPayload;
        await updatePartnership(editData.id, updatePayload);
        toast({ title: "Accord mis a jour" });
      } else {
        await createPartnership(payload as CreateAgreementPayload);
        toast({ title: "Accord cree" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: keyof AgreementFormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editData ? "Modifier l'accord" : "Nouvel accord partenaire"}</DialogTitle>
          <DialogDescription>
            {editData ? "Modifiez les informations de l'accord." : "Creez un nouvel accord pour un etablissement."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>ID Etablissement *</Label>
            <Input
              value={form.establishment_id}
              onChange={(e) => setField("establishment_id", e.target.value)}
              placeholder="UUID de l'etablissement"
              disabled={!!editData}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nom du contact</Label>
              <Input
                value={form.contact_name}
                onChange={(e) => setField("contact_name", e.target.value)}
                placeholder="Nom"
              />
            </div>
            <div>
              <Label>Email du contact</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={(e) => setField("contact_email", e.target.value)}
                placeholder="email@example.com"
              />
            </div>
          </div>

          <div>
            <Label>Telephone du contact</Label>
            <Input
              value={form.contact_phone}
              onChange={(e) => setField("contact_phone", e.target.value)}
              placeholder="+212..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date de debut</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setField("start_date", e.target.value)}
              />
            </div>
            <div>
              <Label>Date de fin</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setField("end_date", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Taux de commission (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={form.commission_rate}
              onChange={(e) => setField("commission_rate", e.target.value)}
              placeholder="ex: 15"
            />
          </div>

          <div>
            <Label>Notes internes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder="Notes visibles uniquement par l'admin..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : editData ? "Mettre a jour" : "Creer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Line Form Dialog
// ============================================================================

type LineFormData = {
  module: AgreementLineModule;
  advantage_type: AgreementLineType;
  advantage_value: string;
  description: string;
  conditions: string;
  start_date: string;
  end_date: string;
  max_uses_per_employee: string;
  max_uses_total: string;
  sam_commission_type: string;
  sam_commission_value: string;
  sort_order: string;
};

const emptyLineForm: LineFormData = {
  module: "ce",
  advantage_type: "percentage",
  advantage_value: "",
  description: "",
  conditions: "",
  start_date: "",
  end_date: "",
  max_uses_per_employee: "",
  max_uses_total: "",
  sam_commission_type: "",
  sam_commission_value: "",
  sort_order: "0",
};

function LineFormDialog({
  open,
  editLine,
  agreementId,
  onClose,
  onSaved,
}: {
  open: boolean;
  editLine: AgreementLine | null;
  agreementId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<LineFormData>(emptyLineForm);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      if (editLine) {
        setForm({
          module: editLine.module,
          advantage_type: editLine.advantage_type,
          advantage_value: editLine.advantage_value != null ? String(editLine.advantage_value) : "",
          description: editLine.description ?? "",
          conditions: editLine.conditions ?? "",
          start_date: editLine.start_date ?? "",
          end_date: editLine.end_date ?? "",
          max_uses_per_employee: String(editLine.max_uses_per_employee ?? ""),
          max_uses_total: String(editLine.max_uses_total ?? ""),
          sam_commission_type: editLine.sam_commission_type ?? "",
          sam_commission_value: editLine.sam_commission_value != null ? String(editLine.sam_commission_value) : "",
          sort_order: String(editLine.sort_order ?? 0),
        });
      } else {
        setForm(emptyLineForm);
      }
    }
  }, [open, editLine]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: CreateAgreementLinePayload | UpdateAgreementLinePayload = {
        module: form.module,
        advantage_type: form.advantage_type,
        advantage_value: form.advantage_value ? Number(form.advantage_value) : undefined,
        description: form.description || undefined,
        conditions: form.conditions || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        max_uses_per_employee: form.max_uses_per_employee ? Number(form.max_uses_per_employee) : undefined,
        max_uses_total: form.max_uses_total ? Number(form.max_uses_total) : undefined,
        sam_commission_type: (form.sam_commission_type as "percentage" | "fixed") || undefined,
        sam_commission_value: form.sam_commission_value ? Number(form.sam_commission_value) : undefined,
        sort_order: form.sort_order ? Number(form.sort_order) : undefined,
      };

      if (editLine) {
        await updatePartnershipLine(agreementId, editLine.id, payload);
        toast({ title: "Ligne mise a jour" });
      } else {
        await addPartnershipLine(agreementId, payload as CreateAgreementLinePayload);
        toast({ title: "Ligne ajoutee" });
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof LineFormData>(key: K, value: LineFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editLine ? "Modifier la ligne" : "Nouvelle ligne"}</DialogTitle>
          <DialogDescription>
            {editLine ? "Modifiez les details de la ligne d'avantage." : "Ajoutez une nouvelle ligne d'avantage a cet accord."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Module</Label>
              <Select value={form.module} onValueChange={(v) => setField("module", v as AgreementLineModule)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGREEMENT_LINE_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>{MODULE_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Type d'avantage</Label>
              <Select value={form.advantage_type} onValueChange={(v) => setField("advantage_type", v as AgreementLineType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGREEMENT_LINE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t === "percentage" ? "Reduction %" : t === "fixed" ? "Reduction fixe" : t === "special_offer" ? "Offre speciale" : t === "gift" ? "Cadeau" : "Pack"}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Valeur de l'avantage</Label>
            <Input
              type="number"
              value={form.advantage_value}
              onChange={(e) => setField("advantage_value", e.target.value)}
              placeholder={form.advantage_type === "percentage" ? "ex: 20" : "ex: 100"}
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Description de l'avantage..."
              rows={2}
            />
          </div>

          <div>
            <Label>Conditions</Label>
            <Textarea
              value={form.conditions}
              onChange={(e) => setField("conditions", e.target.value)}
              placeholder="Conditions d'application..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date de debut</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setField("start_date", e.target.value)} />
            </div>
            <div>
              <Label>Date de fin</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setField("end_date", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Max utilisations / employe</Label>
              <Input
                type="number"
                min={0}
                value={form.max_uses_per_employee}
                onChange={(e) => setField("max_uses_per_employee", e.target.value)}
                placeholder="0 = illimite"
              />
            </div>
            <div>
              <Label>Max utilisations totales</Label>
              <Input
                type="number"
                min={0}
                value={form.max_uses_total}
                onChange={(e) => setField("max_uses_total", e.target.value)}
                placeholder="0 = illimite"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Commission SAM (type)</Label>
              <Select value={form.sam_commission_type} onValueChange={(v) => setField("sam_commission_type", v)}>
                <SelectTrigger><SelectValue placeholder="Aucune" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Pourcentage</SelectItem>
                  <SelectItem value="fixed">Montant fixe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Commission SAM (valeur)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.sam_commission_value}
                onChange={(e) => setField("sam_commission_value", e.target.value)}
                placeholder="ex: 5"
              />
            </div>
          </div>

          <div>
            <Label>Ordre de tri</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(e) => setField("sort_order", e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : editLine ? "Mettre a jour" : "Ajouter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Detail Dialog — Inner Tabs (Infos, Lignes, Journal, Stats)
// ============================================================================

function DetailInfosTab({
  detail,
  onReload,
}: {
  detail: AgreementDetail;
  onReload: () => void;
}) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState(false);

  const handleSendProposal = async () => {
    setActionLoading(true);
    try {
      await sendPartnershipProposal(detail.id);
      toast({ title: "Proposition envoyee" });
      onReload();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: AgreementStatus) => {
    setActionLoading(true);
    try {
      await updatePartnership(detail.id, { status: newStatus });
      toast({ title: `Statut mis a jour : ${AGREEMENT_STATUS_CONFIG[newStatus]?.label ?? newStatus}` });
      onReload();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status & Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusBadge status={detail.status} />
        {detail.status === "draft" && (
          <Button size="sm" onClick={handleSendProposal} disabled={actionLoading}>
            <Send className="w-4 h-4 mr-1" /> Envoyer la proposition
          </Button>
        )}
        {detail.status === "active" && (
          <Button size="sm" variant="outline" onClick={() => handleStatusChange("suspended")} disabled={actionLoading}>
            <PauseCircle className="w-4 h-4 mr-1" /> Suspendre
          </Button>
        )}
        {detail.status === "suspended" && (
          <Button size="sm" variant="outline" onClick={() => handleStatusChange("active")} disabled={actionLoading}>
            <PlayCircle className="w-4 h-4 mr-1" /> Reactiver
          </Button>
        )}
        {(detail.status === "draft" || detail.status === "proposal_sent" || detail.status === "in_negotiation") && (
          <Button size="sm" variant="outline" onClick={() => handleStatusChange("active")} disabled={actionLoading}>
            <PlayCircle className="w-4 h-4 mr-1" /> Activer
          </Button>
        )}
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Etablissement</h4>
          <p className="font-medium">{detail.establishment_name ?? detail.establishment_id}</p>
          {detail.establishment_city && (
            <p className="text-sm text-muted-foreground">{detail.establishment_city}</p>
          )}
          {detail.establishment_universe && (
            <Badge variant="outline" className="text-xs">{detail.establishment_universe}</Badge>
          )}
        </div>

        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Contact</h4>
          <p className="text-sm">{detail.contact_name || "-"}</p>
          <p className="text-sm text-muted-foreground">{detail.contact_email || "-"}</p>
          <p className="text-sm text-muted-foreground">{detail.contact_phone || "-"}</p>
        </div>

        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Dates</h4>
          <div className="flex gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Debut : </span>
              {formatDate(detail.start_date)}
            </div>
            <div>
              <span className="text-muted-foreground">Fin : </span>
              {formatDate(detail.end_date)}
            </div>
          </div>
          {detail.signed_at && (
            <p className="text-sm text-green-600">Signe le {formatDate(detail.signed_at)}</p>
          )}
        </div>

        <div className="bg-muted/30 rounded-lg p-3 space-y-2">
          <h4 className="font-semibold text-sm text-muted-foreground">Commission</h4>
          <p className="text-lg font-bold">
            {detail.commission_rate != null ? `${detail.commission_rate}%` : "Non definie"}
          </p>
        </div>
      </div>

      {/* Notes */}
      {detail.notes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="font-semibold text-sm text-yellow-800 mb-1">Notes internes</h4>
          <p className="text-sm text-yellow-900 whitespace-pre-wrap">{detail.notes}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-muted-foreground pt-2 border-t flex gap-4">
        <span>Cree le {formatDateTime(detail.created_at)}</span>
        <span>Mis a jour le {formatDateTime(detail.updated_at)}</span>
      </div>
    </div>
  );
}

function DetailLinesTab({
  detail,
  onReload,
}: {
  detail: AgreementDetail;
  onReload: () => void;
}) {
  const [lineFormOpen, setLineFormOpen] = useState(false);
  const [editLine, setEditLine] = useState<AgreementLine | null>(null);
  const { toast } = useToast();

  const handleDeleteLine = async (lineId: string) => {
    if (!confirm("Supprimer cette ligne ?")) return;
    try {
      await deletePartnershipLine(detail.id, lineId);
      toast({ title: "Ligne supprimee" });
      onReload();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const lines = detail.lines ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{lines.length} ligne(s)</p>
        <Button
          size="sm"
          onClick={() => {
            setEditLine(null);
            setLineFormOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> Ajouter une ligne
        </Button>
      </div>

      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm py-4 text-center">Aucune ligne pour cet accord</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Module</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Valeur</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-center p-3 font-medium">Actif</th>
                <th className="text-right p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-t hover:bg-muted/30">
                  <td className="p-3"><ModuleBadge module={line.module} /></td>
                  <td className="p-3"><AdvantageTypeBadge type={line.advantage_type} /></td>
                  <td className="p-3 font-medium">
                    {line.advantage_value != null
                      ? line.advantage_type === "percentage"
                        ? `${line.advantage_value}%`
                        : `${line.advantage_value} MAD`
                      : "-"}
                  </td>
                  <td className="p-3 max-w-[200px] truncate text-muted-foreground">
                    {line.description || "-"}
                  </td>
                  <td className="p-3 text-center">
                    {line.is_active ? (
                      <Badge className="bg-green-100 text-green-800">Oui</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-600">Non</Badge>
                    )}
                    {line.toggled_by_pro && (
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        (par le pro)
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditLine(line);
                          setLineFormOpen(true);
                        }}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-600"
                        onClick={() => handleDeleteLine(line.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LineFormDialog
        open={lineFormOpen}
        editLine={editLine}
        agreementId={detail.id}
        onClose={() => setLineFormOpen(false)}
        onSaved={onReload}
      />
    </div>
  );
}

function DetailJournalTab({ history }: { history: AgreementHistoryEntry[] }) {
  if (history.length === 0)
    return <p className="text-muted-foreground text-sm py-4 text-center">Aucun historique</p>;

  const actorLabels: Record<string, string> = {
    admin: "Admin",
    pro: "Pro",
    system: "Systeme",
  };

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <div key={entry.id} className="flex gap-3 text-sm border-b pb-3 last:border-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Clock className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {actorLabels[entry.actor_type] ?? entry.actor_type}
              </Badge>
              <span className="font-medium">{entry.action}</span>
            </div>
            {entry.details && Object.keys(entry.details).length > 0 && (
              <pre className="text-xs text-muted-foreground mt-1 bg-muted/30 rounded p-2 overflow-x-auto">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {formatDateTime(entry.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailStatsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <BarChart3 className="w-12 h-12 mb-3 text-muted-foreground/50" />
      <p className="text-lg font-medium">Statistiques bientot disponibles</p>
      <p className="text-sm">Suivi de l'utilisation des avantages, taux de conversion, etc.</p>
    </div>
  );
}

function DetailDialog({
  agreementId,
  open,
  onClose,
}: {
  agreementId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AgreementDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [innerTab, setInnerTab] = useState("infos");

  const loadDetail = useCallback(async () => {
    if (!agreementId) return;
    setLoading(true);
    try {
      const res = await getPartnership(agreementId);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [agreementId]);

  useEffect(() => {
    if (open && agreementId) {
      setInnerTab("infos");
      loadDetail();
    }
  }, [open, agreementId, loadDetail]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="w-5 h-5" />
            {detail?.establishment_name ?? "Detail de l'accord"}
          </DialogTitle>
          <DialogDescription>
            {detail ? `Accord #${detail.id.slice(0, 8)}...` : "Chargement..."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Chargement...</div>
        ) : !detail ? (
          <div className="py-8 text-center text-red-500">Impossible de charger l'accord</div>
        ) : (
          <Tabs value={innerTab} onValueChange={setInnerTab}>
            <TabsList className="w-full justify-start">
              <TabsTrigger value="infos">Infos</TabsTrigger>
              <TabsTrigger value="lines">
                Lignes ({detail.lines?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="journal">
                Journal ({detail.history?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger value="stats">Stats</TabsTrigger>
            </TabsList>

            <TabsContent value="infos" className="mt-4">
              <DetailInfosTab detail={detail} onReload={loadDetail} />
            </TabsContent>
            <TabsContent value="lines" className="mt-4">
              <DetailLinesTab detail={detail} onReload={loadDetail} />
            </TabsContent>
            <TabsContent value="journal" className="mt-4">
              <DetailJournalTab history={detail.history ?? []} />
            </TabsContent>
            <TabsContent value="stats" className="mt-4">
              <DetailStatsTab />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Accords Tab (List)
// ============================================================================

function AccordsTab() {
  const [agreements, setAgreements] = useState<AgreementWithEstablishment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState<AgreementDetail | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(PER_PAGE),
      };
      if (search) params.search = search;
      if (statusFilter !== "all") params.status = statusFilter;
      if (moduleFilter !== "all") params.module = moduleFilter;

      const res = await listPartnerships(params);
      setAgreements(res.data);
      setTotal(res.total);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de charger les accords",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, moduleFilter, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cet accord ?")) return;
    try {
      await deletePartnership(id);
      toast({ title: "Accord supprime" });
      load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleEdit = async (id: string) => {
    try {
      const res = await getPartnership(id);
      setEditData(res.data);
      setFormOpen(true);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    const url = getPartnershipExportUrl();
    window.open(url, "_blank");
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  // Compute which unique module(s) an agreement covers
  const getAgreementModules = (a: AgreementWithEstablishment): string => {
    const modules: string[] = [];
    if (a.ce_lines_count > 0) modules.push("CE");
    if (a.conciergerie_lines_count > 0) modules.push("Conciergerie");
    return modules.length > 0 ? modules.join(", ") : "-";
  };

  // Average advantage display
  const getReductionLabel = (a: AgreementWithEstablishment): string => {
    return a.active_lines_count > 0 ? `${a.active_lines_count} active(s)` : "-";
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un etablissement..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {AGREEMENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {AGREEMENT_STATUS_CONFIG[s].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={moduleFilter}
          onValueChange={(v) => {
            setModuleFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Module" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modules</SelectItem>
            {AGREEMENT_LINE_MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {MODULE_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          onClick={() => {
            setEditData(null);
            setFormOpen(true);
          }}
        >
          <Plus className="w-4 h-4 mr-1" /> Nouvel accord
        </Button>

        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : agreements.length === 0 ? (
        <p className="text-muted-foreground">Aucun accord partenaire</p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Etablissement</th>
                  <th className="text-left p-3 font-medium">Module(s)</th>
                  <th className="text-center p-3 font-medium">Lignes</th>
                  <th className="text-center p-3 font-medium">Reduction</th>
                  <th className="text-left p-3 font-medium">Statut</th>
                  <th className="text-left p-3 font-medium">Derniere activite</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() => {
                      setDetailId(a.id);
                      setDetailOpen(true);
                    }}
                  >
                    <td className="p-3">
                      <div>
                        <p className="font-medium">{a.establishment_name ?? a.establishment_id.slice(0, 8)}</p>
                        {a.establishment_city && (
                          <p className="text-xs text-muted-foreground">{a.establishment_city}</p>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-sm">{getAgreementModules(a)}</td>
                    <td className="p-3 text-center">
                      <span className="font-medium">{a.lines_count}</span>
                    </td>
                    <td className="p-3 text-center text-sm">{getReductionLabel(a)}</td>
                    <td className="p-3">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="p-3 text-sm text-muted-foreground">
                      {formatDate(a.updated_at)}
                    </td>
                    <td className="p-3 text-right">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(a.id)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-600"
                          onClick={() => handleDelete(a.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {total} accord(s) — Page {page}/{totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Form Dialog (Create / Edit) */}
      <AgreementFormDialog
        open={formOpen}
        editData={editData}
        onClose={() => {
          setFormOpen(false);
          setEditData(null);
        }}
        onSaved={load}
      />

      {/* Detail Dialog */}
      <DetailDialog
        agreementId={detailId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setDetailId(null);
        }}
      />
    </div>
  );
}

// ============================================================================
// Main Export
// ============================================================================

export function AdminPartnershipsPage() {
  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Accords Partenaires"
        description="Gerez les accords commerciaux avec les etablissements partenaires (CE, Conciergerie, etc.)"
      />

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">
            <BarChart3 className="w-4 h-4 mr-1.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="accords">
            <Handshake className="w-4 h-4 mr-1.5" />
            Accords
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="accords" className="mt-4">
          <AccordsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
