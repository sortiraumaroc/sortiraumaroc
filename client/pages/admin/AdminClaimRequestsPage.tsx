import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ColumnDef } from "@tanstack/react-table";

import {
  Building2,
  CheckCircle,
  Clock,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCcw,
  Send,
  Tag,
  User,
  XCircle,
} from "lucide-react";

import { toast } from "@/hooks/use-toast";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  AdminApiError,
  listAdminClaimRequests,
  updateAdminClaimRequest,
  listAdminEstablishmentLeads,
  updateAdminEstablishmentLead,
  type ClaimRequestAdmin,
  type EstablishmentLeadAdmin,
} from "@/lib/adminApi";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Claim Requests (existing) ──────────────────────────────────────────────

type ClaimRow = {
  id: string;
  establishmentId: string;
  establishmentName: string;
  contactName: string;
  email: string;
  phone: string;
  preferredSlot: string;
  status: string;
  createdAt: string;
  createdAtIso: string;
  notes: string | null;
  processedAt: string | null;
  processedBy: string | null;
};

function mapClaim(c: ClaimRequestAdmin): ClaimRow {
  const preferredSlot =
    c.preferred_day && c.preferred_time
      ? `${c.preferred_day} - ${c.preferred_time}`
      : c.preferred_day || c.preferred_time || "—";

  return {
    id: c.id,
    establishmentId: c.establishment_id,
    establishmentName: c.establishment_name || "—",
    contactName: `${c.first_name} ${c.last_name}`.trim() || "—",
    email: c.email || "—",
    phone: c.phone || "—",
    preferredSlot,
    status: c.status,
    createdAt: formatLocal(c.created_at),
    createdAtIso: c.created_at,
    notes: c.admin_notes,
    processedAt: c.processed_at ? formatLocal(c.processed_at) : null,
    processedBy: c.processed_by,
  };
}

// ─── Lead Rows ──────────────────────────────────────────────────────────────

type LeadRow = {
  id: string;
  fullName: string;
  establishmentName: string;
  city: string;
  phone: string;
  whatsapp: string;
  email: string;
  category: string;
  status: string;
  createdAt: string;
  notes: string | null;
  processedAt: string | null;
};

function mapLead(l: EstablishmentLeadAdmin): LeadRow {
  return {
    id: l.id,
    fullName: l.full_name || "—",
    establishmentName: l.establishment_name || "—",
    city: l.city || "—",
    phone: l.phone || "—",
    whatsapp: l.whatsapp || "—",
    email: l.email || "—",
    category: l.category || "—",
    status: l.status,
    createdAt: formatLocal(l.created_at),
    notes: l.admin_notes,
    processedAt: l.processed_at ? formatLocal(l.processed_at) : null,
  };
}

// ─── Status Badges ──────────────────────────────────────────────────────────

function ClaimStatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        <Clock className="h-3 w-3 me-1" />
        En attente
      </Badge>
    );
  }
  if (status === "contacted") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Phone className="h-3 w-3 me-1" />
        Contacté
      </Badge>
    );
  }
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        <CheckCircle className="h-3 w-3 me-1" />
        Approuvé
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <XCircle className="h-3 w-3 me-1" />
        Rejeté
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

function LeadStatusBadge({ status }: { status: string }) {
  if (status === "new") {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200">
        <Clock className="h-3 w-3 me-1" />
        Nouveau
      </Badge>
    );
  }
  if (status === "contacted") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">
        <Phone className="h-3 w-3 me-1" />
        Contacté
      </Badge>
    );
  }
  if (status === "converted") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
        <CheckCircle className="h-3 w-3 me-1" />
        Converti
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-700 border-red-200">
        <XCircle className="h-3 w-3 me-1" />
        Rejeté
      </Badge>
    );
  }
  return <Badge variant="outline">{status}</Badge>;
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <Badge variant="outline" className="text-xs">
      <Tag className="h-3 w-3 me-1" />
      {category}
    </Badge>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function AdminClaimRequestsPage() {
  const [activeTab, setActiveTab] = useState<"claims" | "leads">("claims");

  // ── Claims state ──
  const [claimItems, setClaimItems] = useState<ClaimRow[]>([]);
  const [claimLoading, setClaimLoading] = useState(true);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimStatusFilter, setClaimStatusFilter] = useState<string>("pending");

  // Claims dialog
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<ClaimRow | null>(null);
  const [claimNewStatus, setClaimNewStatus] = useState<string>("");
  const [claimNotes, setClaimNotes] = useState<string>("");
  const [sendCredentials, setSendCredentials] = useState(false);
  const [claimSaving, setClaimSaving] = useState(false);

  // Credentials result
  const [credentialsResult, setCredentialsResult] = useState<{
    email: string;
    temporaryPassword: string;
    establishmentName: string;
  } | null>(null);

  // ── Leads state ──
  const [leadItems, setLeadItems] = useState<LeadRow[]>([]);
  const [leadLoading, setLeadLoading] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadStatusFilter, setLeadStatusFilter] = useState<string>("new");

  // Leads dialog
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [leadNewStatus, setLeadNewStatus] = useState<string>("");
  const [leadNotes, setLeadNotes] = useState<string>("");
  const [leadSaving, setLeadSaving] = useState(false);

  // ── Claims refresh ──
  const refreshClaims = useCallback(async () => {
    setClaimLoading(true);
    setClaimError(null);
    try {
      const res = await listAdminClaimRequests(undefined, {
        status: claimStatusFilter === "all" ? undefined : claimStatusFilter,
        limit: 200,
      });
      setClaimItems((res.items ?? []).map(mapClaim));
    } catch (e) {
      setClaimItems([]);
      setClaimError(e instanceof AdminApiError ? e.message : "Erreur inattendue");
    } finally {
      setClaimLoading(false);
    }
  }, [claimStatusFilter]);

  // ── Leads refresh ──
  const refreshLeads = useCallback(async () => {
    setLeadLoading(true);
    setLeadError(null);
    try {
      const res = await listAdminEstablishmentLeads(undefined, {
        status: leadStatusFilter === "all" ? undefined : leadStatusFilter,
        limit: 200,
      });
      setLeadItems((res.items ?? []).map(mapLead));
    } catch (e) {
      setLeadItems([]);
      setLeadError(e instanceof AdminApiError ? e.message : "Erreur inattendue");
    } finally {
      setLeadLoading(false);
    }
  }, [leadStatusFilter]);

  useEffect(() => {
    if (activeTab === "claims") void refreshClaims();
  }, [refreshClaims, activeTab]);

  useEffect(() => {
    if (activeTab === "leads") void refreshLeads();
  }, [refreshLeads, activeTab]);

  // ── Claims handlers ──
  const openClaimDialog = (claim: ClaimRow) => {
    setSelectedClaim(claim);
    setClaimNewStatus(claim.status);
    setClaimNotes(claim.notes || "");
    setSendCredentials(false);
    setClaimDialogOpen(true);
  };

  const handleClaimSave = async () => {
    if (!selectedClaim) return;
    setClaimSaving(true);
    try {
      const result = await updateAdminClaimRequest(undefined, selectedClaim.id, {
        status: claimNewStatus,
        notes: claimNotes.trim() || undefined,
        sendCredentials: claimNewStatus === "approved" && sendCredentials ? true : undefined,
      });

      if (result.credentials) {
        setCredentialsResult({
          email: result.credentials.email,
          temporaryPassword: result.credentials.temporaryPassword,
          establishmentName: selectedClaim.establishmentName,
        });
        toast({
          title: "Demande approuvée",
          description: `Compte Pro créé et email envoyé à ${result.credentials.email}`,
        });
      } else if (result.credentialsError) {
        toast({
          title: "Demande mise à jour",
          description: `Statut changé mais erreur de création de compte : ${result.credentialsError}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Demande mise à jour",
          description: `Statut changé en "${claimNewStatus}"`,
        });
      }

      setClaimDialogOpen(false);
      void refreshClaims();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof AdminApiError ? e.message : "Erreur inattendue",
        variant: "destructive",
      });
    } finally {
      setClaimSaving(false);
    }
  };

  // ── Leads handlers ──
  const openLeadDialog = (lead: LeadRow) => {
    setSelectedLead(lead);
    setLeadNewStatus(lead.status);
    setLeadNotes(lead.notes || "");
    setLeadDialogOpen(true);
  };

  const handleLeadSave = async () => {
    if (!selectedLead) return;
    setLeadSaving(true);
    try {
      await updateAdminEstablishmentLead(undefined, selectedLead.id, {
        status: leadNewStatus,
        notes: leadNotes.trim() || undefined,
      });

      toast({
        title: "Lead mis à jour",
        description: `Statut changé en "${leadNewStatus}"`,
      });

      setLeadDialogOpen(false);
      void refreshLeads();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof AdminApiError ? e.message : "Erreur inattendue",
        variant: "destructive",
      });
    } finally {
      setLeadSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: "Copié !", description: "Copié dans le presse-papiers" });
  };

  // ── Claims columns ──
  const claimColumns: ColumnDef<ClaimRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.createdAt}</span>
      ),
    },
    {
      accessorKey: "establishmentName",
      header: "Établissement",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <Link
            to={`/admin/establishments/${encodeURIComponent(row.original.establishmentId)}`}
            className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
          >
            {row.original.establishmentName}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      ),
    },
    {
      accessorKey: "contactName",
      header: "Contact",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <User className="h-3.5 w-3.5 text-slate-400" />
            {row.original.contactName}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3 w-3" />
            <a href={`mailto:${row.original.email}`} className="hover:underline">
              {row.original.email}
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone className="h-3 w-3" />
            <a href={`tel:${row.original.phone}`} className="hover:underline">
              {row.original.phone}
            </a>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "preferredSlot",
      header: "Créneau préféré",
      cell: ({ row }) => (
        <span className="text-sm text-slate-600">{row.original.preferredSlot}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => <ClaimStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => openClaimDialog(row.original)}>
          Traiter
        </Button>
      ),
    },
  ];

  // ── Leads columns ──
  const leadColumns: ColumnDef<LeadRow>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => (
        <span className="text-sm tabular-nums">{row.original.createdAt}</span>
      ),
    },
    {
      accessorKey: "establishmentName",
      header: "Établissement",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium">{row.original.establishmentName}</span>
        </div>
      ),
    },
    {
      accessorKey: "fullName",
      header: "Contact",
      cell: ({ row }) => (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <User className="h-3.5 w-3.5 text-slate-400" />
            {row.original.fullName}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Mail className="h-3 w-3" />
            <a href={`mailto:${row.original.email}`} className="hover:underline">
              {row.original.email}
            </a>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Phone className="h-3 w-3" />
            <a href={`tel:${row.original.phone}`} className="hover:underline">
              {row.original.phone}
            </a>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "city",
      header: "Ville",
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-400" />
          {row.original.city}
        </div>
      ),
    },
    {
      accessorKey: "category",
      header: "Catégorie",
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
    },
    {
      accessorKey: "status",
      header: "Statut",
      cell: ({ row }) => <LeadStatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => openLeadDialog(row.original)}>
          Traiter
        </Button>
      ),
    },
  ];

  // ── Stats ──
  const claimPendingCount = claimItems.filter((i) => i.status === "pending").length;
  const claimContactedCount = claimItems.filter((i) => i.status === "contacted").length;

  const leadNewCount = leadItems.filter((i) => i.status === "new").length;
  const leadContactedCount = leadItems.filter((i) => i.status === "contacted").length;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Revendications & Leads"
        description="Gérez les demandes de revendication et les nouveaux établissements."
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200 pb-0">
        <button
          onClick={() => setActiveTab("claims")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "claims"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          <Building2 className="h-4 w-4 inline me-1.5 -mt-0.5" />
          Revendications
          {claimPendingCount > 0 && (
            <Badge className="ms-2 bg-amber-100 text-amber-700 border-amber-200 text-xs px-1.5 py-0">
              {claimPendingCount}
            </Badge>
          )}
        </button>
        <button
          onClick={() => setActiveTab("leads")}
          className={cn(
            "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
            activeTab === "leads"
              ? "border-primary text-primary"
              : "border-transparent text-slate-500 hover:text-slate-700",
          )}
        >
          <Plus className="h-4 w-4 inline me-1.5 -mt-0.5" />
          Nouveaux établissements
          {leadNewCount > 0 && (
            <Badge className="ms-2 bg-amber-100 text-amber-700 border-amber-200 text-xs px-1.5 py-0">
              {leadNewCount}
            </Badge>
          )}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CLAIMS TAB */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "claims" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-amber-700">{claimPendingCount}</div>
                <div className="text-sm text-amber-600">En attente</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-700">{claimContactedCount}</div>
                <div className="text-sm text-blue-600">Contactés</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-emerald-700">
                  {claimItems.filter((i) => i.status === "approved").length}
                </div>
                <div className="text-sm text-emerald-600">Approuvés</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-700">{claimItems.length}</div>
                <div className="text-sm text-slate-600">Total</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <Select value={claimStatusFilter} onValueChange={setClaimStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="contacted">Contacté</SelectItem>
                <SelectItem value="approved">Approuvé</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => void refreshClaims()} disabled={claimLoading}>
              <RefreshCcw className={cn("h-4 w-4 me-2", claimLoading && "animate-spin")} />
              Actualiser
            </Button>
          </div>

          {/* Error */}
          {claimError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {claimError}
            </div>
          ) : null}

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Demandes de revendication</CardTitle>
            </CardHeader>
            <CardContent>
              {claimLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : claimItems.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-500">
                  Aucune demande de revendication.
                </div>
              ) : (
                <AdminDataTable columns={claimColumns} data={claimItems} searchPlaceholder="Rechercher par établissement..." />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LEADS TAB */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "leads" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-amber-200 bg-amber-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-amber-700">{leadNewCount}</div>
                <div className="text-sm text-amber-600">Nouveaux</div>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-blue-700">{leadContactedCount}</div>
                <div className="text-sm text-blue-600">Contactés</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-200 bg-emerald-50/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-emerald-700">
                  {leadItems.filter((i) => i.status === "converted").length}
                </div>
                <div className="text-sm text-emerald-600">Convertis</div>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-slate-700">{leadItems.length}</div>
                <div className="text-sm text-slate-600">Total</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <Select value={leadStatusFilter} onValueChange={setLeadStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filtrer par statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="new">Nouveau</SelectItem>
                <SelectItem value="contacted">Contacté</SelectItem>
                <SelectItem value="converted">Converti</SelectItem>
                <SelectItem value="rejected">Rejeté</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={() => void refreshLeads()} disabled={leadLoading}>
              <RefreshCcw className={cn("h-4 w-4 me-2", leadLoading && "animate-spin")} />
              Actualiser
            </Button>
          </div>

          {/* Error */}
          {leadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {leadError}
            </div>
          ) : null}

          {/* Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Demandes d'ajout d'établissement</CardTitle>
            </CardHeader>
            <CardContent>
              {leadLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : leadItems.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-500">
                  Aucune demande d'ajout d'établissement.
                </div>
              ) : (
                <AdminDataTable columns={leadColumns} data={leadItems} searchPlaceholder="Rechercher par établissement..." />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CLAIM PROCESS DIALOG */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter la demande</DialogTitle>
            <DialogDescription>
              Demande de revendication pour{" "}
              <strong>{selectedClaim?.establishmentName}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedClaim ? (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  Informations du contact
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Nom:</span>{" "}
                    <span className="font-medium">{selectedClaim.contactName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    <a
                      href={`mailto:${selectedClaim.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedClaim.email}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Téléphone:</span>{" "}
                    <a
                      href={`tel:${selectedClaim.phone}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedClaim.phone}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Créneau:</span>{" "}
                    <span className="font-medium">{selectedClaim.preferredSlot}</span>
                  </div>
                </div>
              </div>

              {/* Establishment link */}
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400" />
                <Link
                  to={`/admin/establishments/${encodeURIComponent(selectedClaim.establishmentId)}`}
                  target="_blank"
                  className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                >
                  Voir l'établissement
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Statut</label>
                <Select value={claimNewStatus} onValueChange={(v) => { setClaimNewStatus(v); if (v !== "approved") setSendCredentials(false); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="contacted">Contacté</SelectItem>
                    <SelectItem value="approved">Approuvé</SelectItem>
                    <SelectItem value="rejected">Rejeté</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Send credentials option - only when approving */}
              {claimNewStatus === "approved" ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="send-credentials"
                      checked={sendCredentials}
                      onCheckedChange={(checked) => setSendCredentials(checked === true)}
                      className="mt-0.5"
                    />
                    <div className="space-y-1">
                      <label
                        htmlFor="send-credentials"
                        className="text-sm font-medium text-emerald-800 cursor-pointer flex items-center gap-2"
                      >
                        <Key className="h-4 w-4" />
                        Créer un compte Pro et envoyer les identifiants
                      </label>
                      <p className="text-xs text-emerald-600">
                        Un compte Pro sera créé avec l'email <strong>{selectedClaim.email}</strong> et un mot de passe
                        temporaire. Un email sera envoyé au client avec ses identifiants de connexion.
                        L'établissement sera automatiquement lié au compte.
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes internes</label>
                <Textarea
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="Notes sur cette demande..."
                  rows={3}
                />
              </div>

              {/* Decision info */}
              {selectedClaim.processedAt ? (
                <div className="text-xs text-slate-500">
                  Décision prise le {selectedClaim.processedAt}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimDialogOpen(false)} disabled={claimSaving}>
              Annuler
            </Button>
            <Button onClick={() => void handleClaimSave()} disabled={claimSaving}>
              {claimSaving ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  {sendCredentials && claimNewStatus === "approved" ? "Création du compte..." : "Enregistrement..."}
                </>
              ) : sendCredentials && claimNewStatus === "approved" ? (
                <>
                  <Send className="h-4 w-4 me-2" />
                  Approuver et envoyer les identifiants
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* CREDENTIALS RESULT DIALOG */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!credentialsResult} onOpenChange={() => setCredentialsResult(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle className="h-5 w-5" />
              Compte Pro créé avec succès
            </DialogTitle>
            <DialogDescription>
              Les identifiants ont été envoyés par email à {credentialsResult?.email}.
              Vous pouvez aussi les copier ci-dessous.
            </DialogDescription>
          </DialogHeader>

          {credentialsResult ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Établissement</div>
                  <div className="text-sm font-medium">{credentialsResult.establishmentName}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Email (login)</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-white px-2 py-1 rounded border flex-1">
                      {credentialsResult.email}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(credentialsResult.email)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">Mot de passe temporaire</div>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-white px-2 py-1 rounded border flex-1 break-all">
                      {credentialsResult.temporaryPassword}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(credentialsResult.temporaryPassword)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Le client devra changer son mot de passe lors de sa première connexion.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button onClick={() => setCredentialsResult(null)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* LEAD PROCESS DIALOG */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <Dialog open={leadDialogOpen} onOpenChange={setLeadDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Traiter le lead</DialogTitle>
            <DialogDescription>
              Demande d'ajout pour{" "}
              <strong>{selectedLead?.establishmentName}</strong>
            </DialogDescription>
          </DialogHeader>

          {selectedLead ? (
            <div className="space-y-4">
              {/* Contact info */}
              <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                <div className="text-sm font-semibold text-slate-900">
                  Informations du contact
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Nom:</span>{" "}
                    <span className="font-medium">{selectedLead.fullName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Email:</span>{" "}
                    <a
                      href={`mailto:${selectedLead.email}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedLead.email}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Téléphone:</span>{" "}
                    <a
                      href={`tel:${selectedLead.phone}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedLead.phone}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">WhatsApp:</span>{" "}
                    <a
                      href={`https://wa.me/${selectedLead.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:underline"
                    >
                      {selectedLead.whatsapp}
                    </a>
                  </div>
                  <div>
                    <span className="text-slate-500">Ville:</span>{" "}
                    <span className="font-medium">{selectedLead.city}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Catégorie:</span>{" "}
                    <CategoryBadge category={selectedLead.category} />
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Statut</label>
                <Select value={leadNewStatus} onValueChange={setLeadNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nouveau</SelectItem>
                    <SelectItem value="contacted">Contacté</SelectItem>
                    <SelectItem value="converted">Converti</SelectItem>
                    <SelectItem value="rejected">Rejeté</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes internes</label>
                <Textarea
                  value={leadNotes}
                  onChange={(e) => setLeadNotes(e.target.value)}
                  placeholder="Notes sur ce lead..."
                  rows={3}
                />
              </div>

              {/* Decision info */}
              {selectedLead.processedAt ? (
                <div className="text-xs text-slate-500">
                  Traité le {selectedLead.processedAt}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setLeadDialogOpen(false)} disabled={leadSaving}>
              Annuler
            </Button>
            <Button onClick={() => void handleLeadSave()} disabled={leadSaving}>
              {leadSaving ? (
                <>
                  <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                "Enregistrer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
