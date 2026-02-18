import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  Ban,
  Briefcase,
  Building,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit,
  Eye,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AdminApiError,
  listAdminPrestataires,
  getAdminPrestataire,
  createAdminPrestataire,
  updateAdminPrestataire,
  updateAdminPrestataireStatus,
  getAdminPrestataireDashboard,
  listAdminPrestataireDemandes,
  processAdminPrestataireDemande,
  listAdminPrestataireAuditLogs,
  exportAdminPrestataires,
  batchAdminPrestatairesAction,
  isAdminSuperadmin,
  type AdminPrestataire,
  type AdminPrestataireDemande,
  type AdminPrestataireAuditLog,
  type AdminPrestataireDashboard,
  type AdminPrestataireDocument,
  type PrestataireStatut,
  type PrestataireType,
  type PrestataireCategorie,
} from "@/lib/adminApi";

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const STATUT_CONFIG: Record<
  PrestataireStatut,
  { label: string; icon: React.ReactNode; className: string }
> = {
  DEMANDE: {
    label: "Demande",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  BROUILLON: {
    label: "Brouillon",
    icon: <Edit className="h-3 w-3" />,
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  EN_VALIDATION: {
    label: "En validation",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  VALIDE: {
    label: "Validé",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  BLOQUE: {
    label: "Bloqué",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-rose-100 text-rose-800 border-rose-200",
  },
  REFUSE: {
    label: "Refusé",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-red-100 text-red-800 border-red-200",
  },
  ARCHIVE: {
    label: "Archivé",
    icon: <Archive className="h-3 w-3" />,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

const DEMANDE_STATUT_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; className: string }
> = {
  NOUVELLE: {
    label: "Nouvelle",
    icon: <Clock className="h-3 w-3" />,
    className: "bg-blue-100 text-blue-800 border-blue-200",
  },
  EN_COURS: {
    label: "En cours",
    icon: <RefreshCw className="h-3 w-3" />,
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  CONVERTIE: {
    label: "Convertie",
    icon: <CheckCircle2 className="h-3 w-3" />,
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  REFUSEE: {
    label: "Refusée",
    icon: <XCircle className="h-3 w-3" />,
    className: "bg-rose-100 text-rose-800 border-rose-200",
  },
  ANNULEE: {
    label: "Annulée",
    icon: <Ban className="h-3 w-3" />,
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

const TYPE_LABELS: Record<PrestataireType, string> = {
  personne_physique: "Personne physique",
  auto_entrepreneur: "Auto-entrepreneur",
  sarl: "SARL",
  sa: "SA",
  sas: "SAS",
  autre: "Autre",
};

const CATEGORIE_LABELS: Record<PrestataireCategorie, string> = {
  camera: "Caméraman",
  editor: "Monteur",
  voice: "Voix off",
  blogger: "Blogueur",
  photographer: "Photographe",
  designer: "Designer",
  developer: "Développeur",
  consultant: "Consultant",
  autre: "Autre",
};

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

type PrestataireRow = AdminPrestataire & {
  documents_count?: number;
  docs_validated?: number;
};

type DemandeRow = AdminPrestataireDemande;

// ---------------------------------------------------------------------------
// COMPONENTS
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  icon: Icon,
  className,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ statut }: { statut: PrestataireStatut }) {
  const cfg = STATUT_CONFIG[statut] ?? STATUT_CONFIG.BROUILLON;
  return (
    <Badge className={`${cfg.className} gap-1`}>
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

function DemandeStatusBadge({ statut }: { statut: string }) {
  const cfg = DEMANDE_STATUT_CONFIG[statut] ?? DEMANDE_STATUT_CONFIG.NOUVELLE;
  return (
    <Badge className={`${cfg.className} gap-1`}>
      {cfg.icon} {cfg.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// MAIN PAGE
// ---------------------------------------------------------------------------

export function AdminPrestatairesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("liste");

  // Dashboard stats
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboard, setDashboard] = useState<AdminPrestataireDashboard | null>(
    null,
  );

  // Prestataires list
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PrestataireRow[]>([]);
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterCategorie, setFilterCategorie] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Demandes list
  const [demandesLoading, setDemandesLoading] = useState(false);
  const [demandes, setDemandes] = useState<DemandeRow[]>([]);
  const [demandesFilterStatut, setDemandesFilterStatut] =
    useState<string>("all");

  // Audit logs
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AdminPrestataireAuditLog[]>([]);

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPrestataire, setNewPrestataire] = useState({
    nom_legal: "",
    type_prestataire: "auto_entrepreneur" as PrestataireType,
    ice: "",
    email: "",
    telephone: "",
    ville: "",
    categorie_prestation: "autre" as PrestataireCategorie,
  });

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPrestataire, setSelectedPrestataire] =
    useState<AdminPrestataire | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<
    AdminPrestataireDocument[]
  >([]);
  const [selectedAuditLogs, setSelectedAuditLogs] = useState<
    AdminPrestataireAuditLog[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    nom_legal: "",
    type_prestataire: "auto_entrepreneur" as PrestataireType,
    ice: "",
    identifiant_fiscal: "",
    registre_commerce: "",
    adresse: "",
    ville: "",
    pays: "Maroc",
    email: "",
    telephone: "",
    categorie_prestation: "autre" as PrestataireCategorie,
    // Coordonnées bancaires
    banque_nom: "",
    titulaire_compte: "",
    // TVA
    tva_applicable: false,
    tva_taux: 0,
    // Notes
    internal_notes: "",
  });

  // Status change dialog
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<{
    id: string;
    action: "validate" | "block" | "archive";
  } | null>(null);
  const [statusRaison, setStatusRaison] = useState("");
  const [statusChanging, setStatusChanging] = useState(false);

  // Process demande dialog
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [processAction, setProcessAction] = useState<{
    id: string;
    action: "convert" | "refuse";
    nom: string;
  } | null>(null);
  const [processMotif, setProcessMotif] = useState("");
  const [processing, setProcessing] = useState(false);

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<
    "validate" | "block" | "archive" | null
  >(null);
  const [batchRaison, setBatchRaison] = useState("");
  const [batchProcessing, setBatchProcessing] = useState(false);

  // ---------------------------------------------------------------------------
  // DATA FETCHING
  // ---------------------------------------------------------------------------

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const res = await getAdminPrestataireDashboard(undefined);
      setDashboard(res.stats);
    } catch (e) {
      console.error("Dashboard error:", e);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const refreshPrestataires = useCallback(async () => {
    setLoading(true);
    try {
      const args: { statut?: string; categorie?: string; search?: string } = {};
      if (filterStatut !== "all") args.statut = filterStatut;
      if (filterCategorie !== "all") args.categorie = filterCategorie;
      if (searchQuery.trim()) args.search = searchQuery.trim();

      const res = await listAdminPrestataires(undefined, args);
      const rows: PrestataireRow[] = (res.items ?? []).map((p: any) => ({
        ...p,
        documents_count: Array.isArray(p.prestataire_documents)
          ? p.prestataire_documents.length
          : 0,
        docs_validated: Array.isArray(p.prestataire_documents)
          ? p.prestataire_documents.filter((d: any) => d.statut === "VALIDE")
              .length
          : 0,
      }));
      setItems(rows);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({
        title: "Prestataires",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [filterStatut, filterCategorie, searchQuery, toast]);

  const refreshDemandes = useCallback(async () => {
    setDemandesLoading(true);
    try {
      const args: { statut?: string } = {};
      if (demandesFilterStatut !== "all") args.statut = demandesFilterStatut;
      const res = await listAdminPrestataireDemandes(undefined, args);
      setDemandes(res.items ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Demandes", description: msg, variant: "destructive" });
    } finally {
      setDemandesLoading(false);
    }
  }, [demandesFilterStatut, toast]);

  const refreshAuditLogs = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await listAdminPrestataireAuditLogs(undefined, {
        limit: 100,
      });
      setAuditLogs(res.items ?? []);
    } catch (e) {
      console.error("Audit logs error:", e);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    void refreshPrestataires();
  }, [refreshDashboard, refreshPrestataires]);

  useEffect(() => {
    if (activeTab === "demandes") {
      void refreshDemandes();
    } else if (activeTab === "audit") {
      void refreshAuditLogs();
    }
  }, [activeTab, refreshDemandes, refreshAuditLogs]);

  // ---------------------------------------------------------------------------
  // ACTIONS
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!newPrestataire.nom_legal.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom légal est obligatoire",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      await createAdminPrestataire(undefined, {
        nom_legal: newPrestataire.nom_legal,
        type_prestataire: newPrestataire.type_prestataire,
        ice: newPrestataire.ice || undefined,
        email: newPrestataire.email || undefined,
        telephone: newPrestataire.telephone || undefined,
        ville: newPrestataire.ville || undefined,
        categorie_prestation: newPrestataire.categorie_prestation,
      });
      toast({
        title: "Prestataire créé",
        description: `${newPrestataire.nom_legal} a été ajouté.`,
      });
      setCreateDialogOpen(false);
      setNewPrestataire({
        nom_legal: "",
        type_prestataire: "auto_entrepreneur",
        ice: "",
        email: "",
        telephone: "",
        ville: "",
        categorie_prestation: "autre",
      });
      await refreshPrestataires();
      await refreshDashboard();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const openDetail = async (prestataireId: string) => {
    setDetailDialogOpen(true);
    setDetailLoading(true);
    try {
      const res = await getAdminPrestataire(undefined, prestataireId);
      setSelectedPrestataire(res.prestataire);
      setSelectedDocuments(res.documents);
      setSelectedAuditLogs(res.audit_logs);
      setEditForm({
        nom_legal: res.prestataire.nom_legal ?? "",
        type_prestataire: res.prestataire.type_prestataire,
        ice: res.prestataire.ice ?? "",
        identifiant_fiscal: res.prestataire.identifiant_fiscal ?? "",
        registre_commerce: res.prestataire.registre_commerce ?? "",
        adresse: res.prestataire.adresse ?? "",
        ville: res.prestataire.ville ?? "",
        pays: res.prestataire.pays ?? "Maroc",
        email: res.prestataire.email ?? "",
        telephone: res.prestataire.telephone ?? "",
        categorie_prestation: res.prestataire.categorie_prestation ?? "autre",
        banque_nom: res.prestataire.banque_nom ?? "",
        titulaire_compte: res.prestataire.titulaire_compte ?? "",
        tva_applicable: res.prestataire.tva_applicable ?? false,
        tva_taux: res.prestataire.tva_taux ?? 0,
        internal_notes: res.prestataire.internal_notes ?? "",
      });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Prestataire", description: msg, variant: "destructive" });
      setDetailDialogOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedPrestataire) return;

    setSaving(true);
    try {
      await updateAdminPrestataire(undefined, selectedPrestataire.id, {
        nom_legal: editForm.nom_legal,
        type_prestataire: editForm.type_prestataire,
        ice: editForm.ice || null,
        identifiant_fiscal: editForm.identifiant_fiscal || null,
        registre_commerce: editForm.registre_commerce || null,
        adresse: editForm.adresse || null,
        ville: editForm.ville || null,
        pays: editForm.pays || null,
        email: editForm.email || null,
        telephone: editForm.telephone || null,
        categorie_prestation: editForm.categorie_prestation,
        banque_nom: editForm.banque_nom || null,
        titulaire_compte: editForm.titulaire_compte || null,
        tva_applicable: editForm.tva_applicable,
        tva_taux: editForm.tva_taux,
        internal_notes: editForm.internal_notes || null,
      });
      toast({
        title: "Prestataire mis à jour",
        description: `${editForm.nom_legal} a été modifié.`,
      });
      setDetailDialogOpen(false);
      await refreshPrestataires();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openStatusDialog = (
    id: string,
    action: "validate" | "block" | "archive",
  ) => {
    setStatusAction({ id, action });
    setStatusRaison("");
    setStatusDialogOpen(true);
  };

  const handleStatusChange = async () => {
    if (!statusAction) return;

    const statutMap: Record<string, PrestataireStatut> = {
      validate: "VALIDE",
      block: "BLOQUE",
      archive: "ARCHIVE",
    };
    const newStatut = statutMap[statusAction.action];

    if (
      (statusAction.action === "block" || statusAction.action === "archive") &&
      !statusRaison.trim()
    ) {
      toast({
        title: "Erreur",
        description: "La raison est obligatoire",
        variant: "destructive",
      });
      return;
    }

    setStatusChanging(true);
    try {
      await updateAdminPrestataireStatus(undefined, statusAction.id, {
        statut: newStatut,
        raison: statusRaison || null,
      });
      toast({
        title: "Statut mis à jour",
        description: `Statut changé en ${STATUT_CONFIG[newStatut].label}`,
      });
      setStatusDialogOpen(false);
      await refreshPrestataires();
      await refreshDashboard();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setStatusChanging(false);
    }
  };

  const openProcessDialog = (
    id: string,
    action: "convert" | "refuse",
    nom: string,
  ) => {
    setProcessAction({ id, action, nom });
    setProcessMotif("");
    setProcessDialogOpen(true);
  };

  const handleProcessDemande = async () => {
    if (!processAction) return;

    if (processAction.action === "refuse" && !processMotif.trim()) {
      toast({
        title: "Erreur",
        description: "Le motif de refus est obligatoire",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      await processAdminPrestataireDemande(undefined, processAction.id, {
        action: processAction.action,
        motif_refus: processMotif || null,
      });
      toast({
        title: "Demande traitée",
        description:
          processAction.action === "convert"
            ? "Prestataire créé avec succès"
            : "Demande refusée",
      });
      setProcessDialogOpen(false);
      await refreshDemandes();
      await refreshPrestataires();
      await refreshDashboard();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportAdminPrestataires(undefined, "csv");
      if (typeof result === "string") {
        const blob = new Blob([result], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `prestataires_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Export", description: "Fichier CSV téléchargé" });
      }
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({
        title: "Erreur export",
        description: msg,
        variant: "destructive",
      });
    }
  };

  // Batch selection
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((p) => p.id)));
    }
  };

  const openBatchDialog = (action: "validate" | "block" | "archive") => {
    setBatchAction(action);
    setBatchRaison("");
    setBatchDialogOpen(true);
  };

  const handleBatchAction = async () => {
    if (!batchAction || selectedIds.size === 0) return;

    if (
      (batchAction === "block" || batchAction === "archive") &&
      !batchRaison.trim()
    ) {
      toast({
        title: "Erreur",
        description: "La raison est obligatoire",
        variant: "destructive",
      });
      return;
    }

    setBatchProcessing(true);
    try {
      await batchAdminPrestatairesAction(undefined, {
        ids: Array.from(selectedIds),
        action: batchAction,
        raison: batchRaison || null,
      });
      toast({
        title: "Action batch",
        description: `${selectedIds.size} prestataires mis à jour`,
      });
      setBatchDialogOpen(false);
      setSelectedIds(new Set());
      await refreshPrestataires();
      await refreshDashboard();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur";
      toast({
        title: "Erreur batch",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBatchProcessing(false);
    }
  };

  // ---------------------------------------------------------------------------
  // TABLE COLUMNS
  // ---------------------------------------------------------------------------

  const prestataireColumns: ColumnDef<PrestataireRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: () => (
          <Checkbox
            checked={selectedIds.size === items.length && items.length > 0}
            onCheckedChange={() => toggleSelectAll()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={() => toggleSelect(row.original.id)}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "nom_legal",
        header: "Prestataire",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="font-medium text-slate-900">
                {row.original.nom_legal}
              </div>
              <div className="text-xs text-slate-500">
                {TYPE_LABELS[row.original.type_prestataire] ??
                  row.original.type_prestataire}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "categorie_prestation",
        header: "Catégorie",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {CATEGORIE_LABELS[
              row.original.categorie_prestation as PrestataireCategorie
            ] ??
              row.original.categorie_prestation ??
              "—"}
          </Badge>
        ),
      },
      {
        accessorKey: "ville",
        header: "Ville",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.ville ?? "—"}</span>
        ),
      },
      {
        accessorKey: "statut",
        header: "Statut",
        cell: ({ row }) => <StatusBadge statut={row.original.statut} />,
      },
      {
        accessorKey: "documents_count",
        header: "Documents",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <FileText className="h-4 w-4 text-slate-400" />
            <span className="text-sm">
              {row.original.docs_validated ?? 0}/
              {row.original.documents_count ?? 0}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Créé le",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">
            {formatLocal(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void openDetail(row.original.id)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {row.original.statut === "BROUILLON" ||
            row.original.statut === "EN_VALIDATION" ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-emerald-600"
                onClick={() => openStatusDialog(row.original.id, "validate")}
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            ) : null}
            {row.original.statut === "VALIDE" ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600"
                onClick={() => openStatusDialog(row.original.id, "block")}
              >
                <Ban className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [selectedIds, items.length],
  );

  const demandeColumns: ColumnDef<DemandeRow>[] = useMemo(
    () => [
      {
        accessorKey: "nom",
        header: "Nom demandé",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-900">{row.original.nom}</div>
            <div className="text-xs text-slate-500">
              {row.original.contact_email}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "type_prestation",
        header: "Type",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.type_prestation ?? "—"}</span>
        ),
      },
      {
        accessorKey: "ville",
        header: "Ville",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.ville ?? "—"}</span>
        ),
      },
      {
        accessorKey: "statut",
        header: "Statut",
        cell: ({ row }) => <DemandeStatusBadge statut={row.original.statut} />,
      },
      {
        accessorKey: "created_at",
        header: "Créé le",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">
            {formatLocal(row.original.created_at)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          if (
            row.original.statut !== "NOUVELLE" &&
            row.original.statut !== "EN_COURS"
          ) {
            return row.original.prestataire_id ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void openDetail(row.original.prestataire_id!)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null;
          }
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-emerald-600 border-emerald-200"
                onClick={() =>
                  openProcessDialog(
                    row.original.id,
                    "convert",
                    row.original.nom,
                  )
                }
              >
                <Check className="h-4 w-4 me-1" />
                Convertir
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-rose-600 border-rose-200"
                onClick={() =>
                  openProcessDialog(row.original.id, "refuse", row.original.nom)
                }
              >
                <XCircle className="h-4 w-4 me-1" />
                Refuser
              </Button>
            </div>
          );
        },
      },
    ],
    [],
  );

  const auditColumns: ColumnDef<AdminPrestataireAuditLog>[] = useMemo(
    () => [
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        accessorKey: "action",
        header: "Action",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-xs">
            {row.original.action}
          </Badge>
        ),
      },
      {
        accessorKey: "prestataires",
        header: "Prestataire",
        cell: ({ row }) => (
          <span className="text-sm">
            {(row.original as any).prestataires?.nom_legal ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "actor_type",
        header: "Acteur",
        cell: ({ row }) => (
          <Badge variant="secondary" className="font-normal">
            {row.original.actor_type}
          </Badge>
        ),
      },
    ],
    [],
  );

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Prestataires"
        description="Gérer les prestataires externes et leurs documents"
      />

      {/* Dashboard Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total" value={dashboard?.total ?? 0} icon={Users} />
        <StatCard
          title="Validés"
          value={dashboard?.par_statut?.VALIDE ?? 0}
          icon={CheckCircle2}
          className="border-s-4 border-s-emerald-500"
        />
        <StatCard
          title="En validation"
          value={dashboard?.par_statut?.EN_VALIDATION ?? 0}
          icon={Clock}
          className="border-s-4 border-s-amber-500"
        />
        <StatCard
          title="À risque"
          value={dashboard?.a_risque ?? 0}
          icon={AlertTriangle}
          className="border-s-4 border-s-rose-500"
        />
        <StatCard
          title="Demandes en attente"
          value={dashboard?.demandes_en_attente ?? 0}
          icon={Briefcase}
          className="border-s-4 border-s-blue-500"
        />
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader className="pb-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="liste">
                  <Building className="h-4 w-4 me-2" />
                  Prestataires ({items.length})
                </TabsTrigger>
                <TabsTrigger value="demandes">
                  <Briefcase className="h-4 w-4 me-2" />
                  Demandes (
                  {demandes.filter((d) => d.statut === "NOUVELLE").length})
                </TabsTrigger>
                <TabsTrigger value="audit">
                  <FileText className="h-4 w-4 me-2" />
                  Journal d'audit
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                {activeTab === "liste" && (
                  <>
                    {isAdminSuperadmin() && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={handleExport}
                      >
                        <Download className="h-4 w-4" />
                        Exporter
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => setCreateDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4" />
                      Nouveau
                    </Button>
                  </>
                )}
                <RefreshIconButton
                  className="h-9 w-9"
                  onClick={() => {
                    if (activeTab === "liste") void refreshPrestataires();
                    else if (activeTab === "demandes") void refreshDemandes();
                    else void refreshAuditLogs();
                  }}
                  loading={loading || demandesLoading || auditLoading}
                  label="Rafraîchir"
                />
              </div>
            </div>

            <TabsContent value="liste" className="mt-4">
              <div className="flex items-center gap-3 mb-4">
                <Input
                  placeholder="Rechercher..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64"
                />
                <Select value={filterStatut} onValueChange={setFilterStatut}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="BROUILLON">Brouillon</SelectItem>
                    <SelectItem value="EN_VALIDATION">En validation</SelectItem>
                    <SelectItem value="VALIDE">Validé</SelectItem>
                    <SelectItem value="BLOQUE">Bloqué</SelectItem>
                    <SelectItem value="ARCHIVE">Archivé</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterCategorie}
                  onValueChange={setFilterCategorie}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Catégorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes catégories</SelectItem>
                    <SelectItem value="camera">Caméraman</SelectItem>
                    <SelectItem value="editor">Monteur</SelectItem>
                    <SelectItem value="voice">Voix off</SelectItem>
                    <SelectItem value="blogger">Blogueur</SelectItem>
                    <SelectItem value="photographer">Photographe</SelectItem>
                    <SelectItem value="designer">Designer</SelectItem>
                    <SelectItem value="developer">Développeur</SelectItem>
                    <SelectItem value="consultant">Consultant</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshPrestataires()}
                >
                  Filtrer
                </Button>
              </div>

              {/* Batch Action Bar */}
              {selectedIds.size > 0 && (
                <div className="flex items-center justify-between p-3 mb-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <span className="text-sm font-medium">
                    {selectedIds.size} prestataire(s) sélectionné(s)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-600 border-emerald-200"
                      onClick={() => openBatchDialog("validate")}
                    >
                      <ShieldCheck className="h-4 w-4 me-1" />
                      Valider
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-rose-600 border-rose-200"
                      onClick={() => openBatchDialog("block")}
                    >
                      <Ban className="h-4 w-4 me-1" />
                      Bloquer
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openBatchDialog("archive")}
                    >
                      <Archive className="h-4 w-4 me-1" />
                      Archiver
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <AdminDataTable
                columns={prestataireColumns}
                data={items}
                isLoading={loading}
              />
            </TabsContent>

            <TabsContent value="demandes" className="mt-4">
              <div className="flex items-center gap-3 mb-4">
                <Select
                  value={demandesFilterStatut}
                  onValueChange={setDemandesFilterStatut}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Statut" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    <SelectItem value="NOUVELLE">Nouvelle</SelectItem>
                    <SelectItem value="EN_COURS">En cours</SelectItem>
                    <SelectItem value="CONVERTIE">Convertie</SelectItem>
                    <SelectItem value="REFUSEE">Refusée</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshDemandes()}
                >
                  Filtrer
                </Button>
              </div>
              <AdminDataTable
                columns={demandeColumns}
                data={demandes}
                isLoading={demandesLoading}
              />
            </TabsContent>

            <TabsContent value="audit" className="mt-4">
              <AdminDataTable
                columns={auditColumns}
                data={auditLogs}
                isLoading={auditLoading}
              />
            </TabsContent>
          </Tabs>
        </CardHeader>
        <CardContent className="pt-0" />
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau prestataire</DialogTitle>
            <DialogDescription>
              Créer un nouveau prestataire externe
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Nom légal *</Label>
                <Input
                  value={newPrestataire.nom_legal}
                  onChange={(e) =>
                    setNewPrestataire((p) => ({
                      ...p,
                      nom_legal: e.target.value,
                    }))
                  }
                  placeholder="Société ABC"
                />
              </div>
              <div className="space-y-2">
                <Label>Type structure</Label>
                <Select
                  value={newPrestataire.type_prestataire}
                  onValueChange={(v) =>
                    setNewPrestataire((p) => ({
                      ...p,
                      type_prestataire: v as PrestataireType,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto_entrepreneur">
                      Auto-entrepreneur
                    </SelectItem>
                    <SelectItem value="entreprise_individuelle">
                      Entreprise individuelle
                    </SelectItem>
                    <SelectItem value="sarl">SARL</SelectItem>
                    <SelectItem value="sa">SA</SelectItem>
                    <SelectItem value="sas">SAS</SelectItem>
                    <SelectItem value="association">Association</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Catégorie</Label>
                <Select
                  value={newPrestataire.categorie_prestation}
                  onValueChange={(v) =>
                    setNewPrestataire((p) => ({
                      ...p,
                      categorie_prestation: v as PrestataireCategorie,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="camera">Caméraman</SelectItem>
                    <SelectItem value="editor">Monteur</SelectItem>
                    <SelectItem value="voice">Voix off</SelectItem>
                    <SelectItem value="blogger">Blogueur</SelectItem>
                    <SelectItem value="photographer">Photographe</SelectItem>
                    <SelectItem value="designer">Designer</SelectItem>
                    <SelectItem value="developer">Développeur</SelectItem>
                    <SelectItem value="consultant">Consultant</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ICE (15 chiffres)</Label>
                <Input
                  value={newPrestataire.ice}
                  onChange={(e) =>
                    setNewPrestataire((p) => ({ ...p, ice: e.target.value }))
                  }
                  placeholder="000000000000000"
                  maxLength={15}
                />
              </div>
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={newPrestataire.ville}
                  onChange={(e) =>
                    setNewPrestataire((p) => ({ ...p, ville: e.target.value }))
                  }
                  placeholder="Casablanca"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={newPrestataire.email}
                  onChange={(e) =>
                    setNewPrestataire((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="contact@exemple.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={newPrestataire.telephone}
                  onChange={(e) =>
                    setNewPrestataire((p) => ({
                      ...p,
                      telephone: e.target.value,
                    }))
                  }
                  placeholder="+212 6..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
              Créer le prestataire
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails du prestataire</DialogTitle>
            <DialogDescription>
              {selectedPrestataire?.nom_legal ?? ""}
            </DialogDescription>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
            </div>
          ) : (
            <Tabs defaultValue="infos">
              <TabsList className="mb-4">
                <TabsTrigger value="infos">Informations</TabsTrigger>
                <TabsTrigger value="kyc">KYC</TabsTrigger>
                <TabsTrigger value="documents">
                  Documents ({selectedDocuments.length})
                </TabsTrigger>
                <TabsTrigger value="historique">
                  Historique ({selectedAuditLogs.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="infos">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <StatusBadge
                      statut={selectedPrestataire?.statut ?? "BROUILLON"}
                    />
                    <div className="flex gap-2">
                      {(selectedPrestataire?.statut === "BROUILLON" ||
                        selectedPrestataire?.statut === "EN_VALIDATION") && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700"
                          onClick={() =>
                            openStatusDialog(
                              selectedPrestataire!.id,
                              "validate",
                            )
                          }
                        >
                          <ShieldCheck className="h-4 w-4 me-2" />
                          Valider
                        </Button>
                      )}
                      {selectedPrestataire?.statut === "VALIDE" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-rose-200 text-rose-600"
                          onClick={() =>
                            openStatusDialog(selectedPrestataire!.id, "block")
                          }
                        >
                          <Ban className="h-4 w-4 me-2" />
                          Bloquer
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nom légal</Label>
                      <Input
                        value={editForm.nom_legal}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            nom_legal: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Type structure</Label>
                      <Select
                        value={editForm.type_prestataire}
                        onValueChange={(v) =>
                          setEditForm((p) => ({
                            ...p,
                            type_prestataire: v as PrestataireType,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto_entrepreneur">
                            Auto-entrepreneur
                          </SelectItem>
                          <SelectItem value="entreprise_individuelle">
                            Entreprise individuelle
                          </SelectItem>
                          <SelectItem value="sarl">SARL</SelectItem>
                          <SelectItem value="sa">SA</SelectItem>
                          <SelectItem value="sas">SAS</SelectItem>
                          <SelectItem value="association">
                            Association
                          </SelectItem>
                          <SelectItem value="autre">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>ICE</Label>
                      <Input
                        value={editForm.ice}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, ice: e.target.value }))
                        }
                        maxLength={15}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select
                        value={editForm.categorie_prestation}
                        onValueChange={(v) =>
                          setEditForm((p) => ({
                            ...p,
                            categorie_prestation: v as PrestataireCategorie,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="camera">Caméraman</SelectItem>
                          <SelectItem value="editor">Monteur</SelectItem>
                          <SelectItem value="voice">Voix off</SelectItem>
                          <SelectItem value="blogger">Blogueur</SelectItem>
                          <SelectItem value="photographer">
                            Photographe
                          </SelectItem>
                          <SelectItem value="designer">Designer</SelectItem>
                          <SelectItem value="developer">Développeur</SelectItem>
                          <SelectItem value="consultant">Consultant</SelectItem>
                          <SelectItem value="autre">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editForm.email}
                        onChange={(e) =>
                          setEditForm((p) => ({ ...p, email: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Téléphone</Label>
                      <Input
                        value={editForm.telephone}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            telephone: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Ville</Label>
                    <Input
                      value={editForm.ville}
                      onChange={(e) =>
                        setEditForm((p) => ({ ...p, ville: e.target.value }))
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Notes internes</Label>
                    <Textarea
                      value={editForm.internal_notes}
                      onChange={(e) =>
                        setEditForm((p) => ({
                          ...p,
                          internal_notes: e.target.value,
                        }))
                      }
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="kyc">
                <div className="space-y-6">
                  {/* Identifiants légaux */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Identifiants légaux
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>ICE (15 chiffres)</Label>
                        <Input
                          value={editForm.ice}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, ice: e.target.value }))
                          }
                          maxLength={15}
                          placeholder="000000000000000"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Identifiant Fiscal (IF)</Label>
                        <Input
                          value={editForm.identifiant_fiscal}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              identifiant_fiscal: e.target.value,
                            }))
                          }
                          placeholder="Numéro IF"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Registre de Commerce (RC)</Label>
                        <Input
                          value={editForm.registre_commerce}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              registre_commerce: e.target.value,
                            }))
                          }
                          placeholder="Numéro RC"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Pays</Label>
                        <Input
                          value={editForm.pays}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, pays: e.target.value }))
                          }
                          placeholder="Maroc"
                        />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label>Adresse complète</Label>
                      <Textarea
                        value={editForm.adresse}
                        onChange={(e) =>
                          setEditForm((p) => ({
                            ...p,
                            adresse: e.target.value,
                          }))
                        }
                        rows={2}
                        placeholder="Adresse du siège social"
                      />
                    </div>
                  </div>

                  {/* Coordonnées bancaires */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Coordonnées bancaires
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nom de la banque</Label>
                        <Input
                          value={editForm.banque_nom}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              banque_nom: e.target.value,
                            }))
                          }
                          placeholder="Ex: Attijariwafa Bank"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Titulaire du compte</Label>
                        <Input
                          value={editForm.titulaire_compte}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              titulaire_compte: e.target.value,
                            }))
                          }
                          placeholder="Nom du titulaire"
                        />
                      </div>
                    </div>
                    {selectedPrestataire?.rib_last4 && (
                      <div className="mt-3 p-3 bg-slate-50 border rounded-lg">
                        <div className="text-xs text-slate-500 mb-1">
                          RIB enregistré
                        </div>
                        <div className="font-mono text-sm">
                          **** **** **** {selectedPrestataire.rib_last4}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* TVA */}
                  <div>
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Fiscalité
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>TVA applicable</Label>
                        <Select
                          value={editForm.tva_applicable ? "yes" : "no"}
                          onValueChange={(v) =>
                            setEditForm((p) => ({
                              ...p,
                              tva_applicable: v === "yes",
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="no">
                              Non assujetti à la TVA
                            </SelectItem>
                            <SelectItem value="yes">
                              Assujetti à la TVA
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {editForm.tva_applicable && (
                        <div className="space-y-2">
                          <Label>Taux TVA (%)</Label>
                          <Input
                            type="number"
                            value={editForm.tva_taux}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                tva_taux: Number(e.target.value) || 0,
                              }))
                            }
                            placeholder="20"
                            min={0}
                            max={100}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Indicateurs de risque */}
                  {selectedPrestataire && (
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Indicateurs de risque
                      </h4>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 bg-slate-50 border rounded-lg text-center">
                          <div className="text-xs text-slate-500 mb-1">
                            Score de risque
                          </div>
                          <div
                            className={`text-xl font-bold ${
                              selectedPrestataire.risk_score > 50
                                ? "text-rose-600"
                                : selectedPrestataire.risk_score > 25
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                            }`}
                          >
                            {selectedPrestataire.risk_score}/100
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 border rounded-lg text-center">
                          <div className="text-xs text-slate-500 mb-1">
                            Flag fraude
                          </div>
                          <Badge
                            className={
                              selectedPrestataire.fraud_flag
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }
                          >
                            {selectedPrestataire.fraud_flag ? "Oui" : "Non"}
                          </Badge>
                        </div>
                        <div className="p-3 bg-slate-50 border rounded-lg text-center">
                          <div className="text-xs text-slate-500 mb-1">
                            Verrou finance
                          </div>
                          <Badge
                            className={
                              selectedPrestataire.lock_finance
                                ? "bg-rose-100 text-rose-800"
                                : "bg-emerald-100 text-emerald-800"
                            }
                          >
                            {selectedPrestataire.lock_finance
                              ? "Verrouillé"
                              : "Libre"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="documents">
                {selectedDocuments.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    Aucun document soumis
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-slate-400" />
                          <div>
                            <div className="font-medium text-sm">
                              {doc.type_document}
                            </div>
                            <div className="text-xs text-slate-500">
                              Uploadé le {formatLocal(doc.uploaded_at)}
                            </div>
                          </div>
                        </div>
                        <Badge
                          className={
                            doc.statut === "VALIDE"
                              ? "bg-emerald-100 text-emerald-800"
                              : doc.statut === "REFUSE"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                          }
                        >
                          {doc.statut}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="historique">
                {selectedAuditLogs.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">
                    Aucun historique
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedAuditLogs.slice(0, 15).map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between p-2 border-b"
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="font-mono text-xs"
                          >
                            {log.action}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            par {log.actor_type}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
              disabled={saving}
            >
              Fermer
            </Button>
            <Button onClick={handleSave} disabled={saving || detailLoading}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {statusAction?.action === "validate"
                ? "Valider le prestataire"
                : statusAction?.action === "block"
                  ? "Bloquer le prestataire"
                  : "Archiver le prestataire"}
            </DialogTitle>
            <DialogDescription>
              {statusAction?.action === "validate"
                ? "Le prestataire pourra recevoir des paiements."
                : "Une raison est requise pour cette action."}
            </DialogDescription>
          </DialogHeader>

          {statusAction?.action !== "validate" && (
            <div className="space-y-2">
              <Label>Raison *</Label>
              <Textarea
                value={statusRaison}
                onChange={(e) => setStatusRaison(e.target.value)}
                placeholder="Raison du blocage ou archivage..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusDialogOpen(false)}
              disabled={statusChanging}
            >
              Annuler
            </Button>
            <Button
              onClick={handleStatusChange}
              disabled={statusChanging}
              className={
                statusAction?.action === "validate"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : statusAction?.action === "block"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : ""
              }
            >
              {statusChanging ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Process Demande Dialog */}
      <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {processAction?.action === "convert"
                ? "Convertir en prestataire"
                : "Refuser la demande"}
            </DialogTitle>
            <DialogDescription>
              {processAction?.action === "convert"
                ? `Créer un prestataire à partir de la demande "${processAction?.nom}"`
                : `Refuser la demande de "${processAction?.nom}"`}
            </DialogDescription>
          </DialogHeader>

          {processAction?.action === "refuse" && (
            <div className="space-y-2">
              <Label>Motif de refus *</Label>
              <Textarea
                value={processMotif}
                onChange={(e) => setProcessMotif(e.target.value)}
                placeholder="Expliquez pourquoi cette demande est refusée..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProcessDialogOpen(false)}
              disabled={processing}
            >
              Annuler
            </Button>
            <Button
              onClick={handleProcessDemande}
              disabled={processing}
              className={
                processAction?.action === "convert"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
              {processAction?.action === "convert" ? "Convertir" : "Refuser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Action Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {batchAction === "validate"
                ? "Valider en masse"
                : batchAction === "block"
                  ? "Bloquer en masse"
                  : "Archiver en masse"}
            </DialogTitle>
            <DialogDescription>
              Cette action sera appliquée à {selectedIds.size} prestataire(s).
            </DialogDescription>
          </DialogHeader>

          {(batchAction === "block" || batchAction === "archive") && (
            <div className="space-y-2">
              <Label>Raison *</Label>
              <Textarea
                value={batchRaison}
                onChange={(e) => setBatchRaison(e.target.value)}
                placeholder="Raison du blocage ou archivage..."
                rows={3}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchDialogOpen(false)}
              disabled={batchProcessing}
            >
              Annuler
            </Button>
            <Button
              onClick={handleBatchAction}
              disabled={batchProcessing}
              className={
                batchAction === "validate"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : batchAction === "block"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : ""
              }
            >
              {batchProcessing ? (
                <Loader2 className="h-4 w-4 animate-spin me-2" />
              ) : null}
              Confirmer ({selectedIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
