import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminApi";
import { AdminEmailsNav } from "./AdminEmailsNav";

type ProspectRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  tags: string[];
  source: string | null;
  subscribed: boolean;
  emails_sent_count: number;
  emails_opened_count: number;
  created_at: string;
};

type ProspectStats = {
  total: number;
  subscribed: number;
  unsubscribed: number;
  top_tags: { tag: string; count: number }[];
  top_cities: { city: string; count: number }[];
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function AdminEmailsProspectsPage() {
  const { toast } = useToast();
  const [prospects, setProspects] = useState<ProspectRow[]>([]);
  const [stats, setStats] = useState<ProspectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);

  // Dialogs
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Form states
  const [importCsv, setImportCsv] = useState("");
  const [importTags, setImportTags] = useState("");
  const [newProspect, setNewProspect] = useState({
    email: "",
    first_name: "",
    last_name: "",
    phone: "",
    city: "",
    tags: "",
  });
  const [securityPassword, setSecurityPassword] = useState("");

  // Security password check
  const [securityConfigured, setSecurityConfigured] = useState<boolean | null>(null);
  const [configPasswordDialogOpen, setConfigPasswordDialogOpen] = useState(false);
  const [newSecurityPassword, setNewSecurityPassword] = useState("");
  const [confirmSecurityPassword, setConfirmSecurityPassword] = useState("");


  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAdminHeaders();

      // Fetch prospects
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedTag) params.set("tag", selectedTag);
      if (selectedCity) params.set("city", selectedCity);

      const [prospectsRes, statsRes, tagsRes] = await Promise.all([
        fetch(`/api/admin/marketing/prospects?${params}`, { headers }),
        fetch("/api/admin/marketing/prospects/stats", { headers }),
        fetch("/api/admin/marketing/prospects/tags", { headers }),
      ]);

      if (prospectsRes.ok) {
        const data = await prospectsRes.json();
        setProspects(data.items ?? []);
      }

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      if (tagsRes.ok) {
        const data = await tagsRes.json();
        setAllTags(data.tags ?? []);
      }

      // Check security password config
      const securityRes = await fetch("/api/admin/security/password/check", { headers });
      if (securityRes.ok) {
        const data = await securityRes.json();
        setSecurityConfigured(data.configured);
      }
    } catch (err) {
      console.error("Failed to fetch prospects:", err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, selectedCity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  // Import CSV
  const handleImport = async () => {
    if (!importCsv.trim()) {
      toast({ title: "Erreur", description: "Veuillez coller les données CSV", variant: "destructive" });
      return;
    }

    try {
      const lines = importCsv.trim().split("\n");
      const headerLine = lines[0].toLowerCase();
      const hasHeaders = headerLine.includes("email") || headerLine.includes("mail");
      const dataLines = hasHeaders ? lines.slice(1) : lines;

      const prospects = dataLines.map((line) => {
        const parts = line.split(/[;,\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ""));
        return {
          email: parts[0] ?? "",
          first_name: parts[1] ?? "",
          last_name: parts[2] ?? "",
          phone: parts[3] ?? "",
          city: parts[4] ?? "",
        };
      });

      const tags = importTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/marketing/prospects/import", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ prospects, tags, source: "import_csv" }),
      });

      const data = await res.json();

      if (res.ok) {
        toast({
          title: "Import réussi",
          description: `${data.imported_count} prospects importés, ${data.skipped_count} ignorés`,
        });
        setImportDialogOpen(false);
        setImportCsv("");
        setImportTags("");
        fetchData();
      } else {
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de l'import", variant: "destructive" });
    }
  };

  // Add single prospect
  const handleAddProspect = async () => {
    if (!newProspect.email.includes("@")) {
      toast({ title: "Erreur", description: "Email invalide", variant: "destructive" });
      return;
    }

    try {
      const tags = newProspect.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch("/api/admin/marketing/prospects", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ...newProspect, tags, source: "manual" }),
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Prospect ajouté" });
        setAddDialogOpen(false);
        setNewProspect({ email: "", first_name: "", last_name: "", phone: "", city: "", tags: "" });
        fetchData();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de l'ajout", variant: "destructive" });
    }
  };

  // Export CSV
  const handleExport = async () => {
    if (!securityPassword) {
      toast({ title: "Erreur", description: "Mot de passe requis", variant: "destructive" });
      return;
    }

    try {
      const res = await fetch("/api/admin/marketing/prospects/export", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          security_password: securityPassword,
          tag: selectedTag || undefined,
          city: selectedCity || undefined,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `prospects_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setExportDialogOpen(false);
        setSecurityPassword("");
        toast({ title: "Succès", description: "Export téléchargé" });
      } else {
        const data = await res.json();
        if (data.not_configured) {
          setExportDialogOpen(false);
          setConfigPasswordDialogOpen(true);
        } else {
          toast({ title: "Erreur", description: data.error, variant: "destructive" });
        }
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de l'export", variant: "destructive" });
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (!securityPassword || selectedIds.length === 0) return;

    try {
      const res = await fetch("/api/admin/marketing/prospects/bulk-delete", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedIds, security_password: securityPassword }),
      });

      if (res.ok) {
        const data = await res.json();
        toast({ title: "Succès", description: `${data.deleted_count} prospects supprimés` });
        setDeleteDialogOpen(false);
        setSecurityPassword("");
        setSelectedIds([]);
        fetchData();
      } else {
        const data = await res.json();
        if (data.not_configured) {
          setDeleteDialogOpen(false);
          setConfigPasswordDialogOpen(true);
        } else {
          toast({ title: "Erreur", description: data.error, variant: "destructive" });
        }
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de la suppression", variant: "destructive" });
    }
  };

  // Configure security password
  const handleConfigureSecurityPassword = async () => {
    if (!newSecurityPassword || newSecurityPassword !== confirmSecurityPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    if (newSecurityPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/admin/security/password", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: newSecurityPassword }),
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Mot de passe de sécurité configuré" });
        setConfigPasswordDialogOpen(false);
        setNewSecurityPassword("");
        setConfirmSecurityPassword("");
        setSecurityConfigured(true);
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de la configuration", variant: "destructive" });
    }
  };

  const columns: ColumnDef<ProspectRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            className="rounded border-gray-300"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            className="rounded border-gray-300"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => <div className="font-medium">{row.original.email}</div>,
      },
      {
        accessorKey: "first_name",
        header: "Prénom",
        cell: ({ row }) => row.original.first_name ?? "-",
      },
      {
        accessorKey: "last_name",
        header: "Nom",
        cell: ({ row }) => row.original.last_name ?? "-",
      },
      {
        accessorKey: "city",
        header: "Ville",
        cell: ({ row }) => row.original.city ?? "-",
      },
      {
        accessorKey: "tags",
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {(row.original.tags ?? []).map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "subscribed",
        header: "Statut",
        cell: ({ row }) => (
          <Badge className={row.original.subscribed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
            {row.original.subscribed ? "Abonné" : "Désabonné"}
          </Badge>
        ),
      },
      {
        accessorKey: "emails_sent_count",
        header: "Emails envoyés",
        cell: ({ row }) => row.original.emails_sent_count,
      },
      {
        accessorKey: "source",
        header: "Source",
        cell: ({ row }) => {
          const source = row.original.source;
          if (!source) return "-";

          // Déterminer le style selon la source
          const sourceStyles: Record<string, { bg: string; text: string; label: string }> = {
            "newsletter": { bg: "bg-green-100", text: "text-green-700", label: "Abonné" },
            "abonne": { bg: "bg-green-100", text: "text-green-700", label: "Abonné" },
            "import": { bg: "bg-blue-100", text: "text-blue-700", label: "Importé" },
            "csv": { bg: "bg-blue-100", text: "text-blue-700", label: "Importé" },
            "manual": { bg: "bg-purple-100", text: "text-purple-700", label: "Manuel" },
            "audience": { bg: "bg-orange-100", text: "text-orange-700", label: "Audience" },
          };

          const lowerSource = source.toLowerCase();
          const style = sourceStyles[lowerSource] || { bg: "bg-gray-100", text: "text-gray-700", label: source };

          return (
            <Badge className={`${style.bg} ${style.text}`}>
              {style.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "created_at",
        header: "Date d'ajout",
        cell: ({ row }) => formatDate(row.original.created_at),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Gérez vos contacts pour les campagnes email"
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />
        </CardContent>
      </Card>

      {/* Stats cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total prospects</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total.toLocaleString("fr-FR")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Abonnés</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.subscribed.toLocaleString("fr-FR")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Désabonnés</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.unsubscribed.toLocaleString("fr-FR")}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tags populaires</CardTitle>
              <Tag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {stats.top_tags.slice(0, 3).map((t) => (
                  <Badge key={t.tag} variant="outline" className="text-xs">
                    {t.tag} ({t.count})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Security warning */}
      {securityConfigured === false && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-orange-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900">Mot de passe de sécurité non configuré</h3>
                <p className="text-sm text-orange-700">
                  Un mot de passe de sécurité est requis pour les actions sensibles (export, suppression).
                </p>
              </div>
              <Button onClick={() => setConfigPasswordDialogOpen(true)}>Configurer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions bar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Rechercher par email, nom..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <select
          value={selectedTag}
          onChange={(e) => setSelectedTag(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Tous les tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>

        <select
          value={selectedCity}
          onChange={(e) => setSelectedCity(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">Toutes les villes</option>
          {stats?.top_cities.map((c) => (
            <option key={c.city} value={c.city}>
              {c.city} ({c.count})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={() => fetchData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Actualiser
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Importer
          </Button>
          <Button variant="outline" size="sm" onClick={() => setExportDialogOpen(true)}>
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Ajouter
          </Button>
        </div>
      </div>

      {/* Selected actions */}
      {selectedIds.length > 0 && (
        <div className="flex items-center gap-4 p-3 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium">{selectedIds.length} prospect(s) sélectionné(s)</span>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Supprimer
          </Button>
        </div>
      )}

      {/* Table */}
      <AdminDataTable
        columns={columns}
        data={prospects}
        loading={loading}
        onRowSelectionChange={(rows) => setSelectedIds(rows.map((r) => r.id))}
      />

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importer des prospects</DialogTitle>
            <DialogDescription>
              Collez vos données CSV (email, prénom, nom, téléphone, ville) séparées par ; ou ,
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Données CSV</Label>
              <Textarea
                value={importCsv}
                onChange={(e) => setImportCsv(e.target.value)}
                placeholder="email;prénom;nom;téléphone;ville&#10;john@example.com;John;Doe;0612345678;Casablanca"
                rows={10}
              />
            </div>
            <div>
              <Label>Tags à ajouter (séparés par des virgules)</Label>
              <Input
                value={importTags}
                onChange={(e) => setImportTags(e.target.value)}
                placeholder="newsletter, spa_lover, restaurant_fan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleImport}>Importer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajouter un prospect</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input
                value={newProspect.email}
                onChange={(e) => setNewProspect({ ...newProspect, email: e.target.value })}
                placeholder="email@example.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Prénom</Label>
                <Input
                  value={newProspect.first_name}
                  onChange={(e) => setNewProspect({ ...newProspect, first_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Nom</Label>
                <Input
                  value={newProspect.last_name}
                  onChange={(e) => setNewProspect({ ...newProspect, last_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Téléphone</Label>
                <Input
                  value={newProspect.phone}
                  onChange={(e) => setNewProspect({ ...newProspect, phone: e.target.value })}
                />
              </div>
              <div>
                <Label>Ville</Label>
                <Input
                  value={newProspect.city}
                  onChange={(e) => setNewProspect({ ...newProspect, city: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Tags (séparés par des virgules)</Label>
              <Input
                value={newProspect.tags}
                onChange={(e) => setNewProspect({ ...newProspect, tags: e.target.value })}
                placeholder="newsletter, spa_lover"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleAddProspect}>Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exporter les prospects</DialogTitle>
            <DialogDescription>Entrez le mot de passe de sécurité pour exporter les données</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Mot de passe de sécurité</Label>
              <Input
                type="password"
                value={securityPassword}
                onChange={(e) => setSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              L'export inclura les filtres actuels ({selectedTag ? `Tag: ${selectedTag}` : "Tous les tags"},{" "}
              {selectedCity ? `Ville: ${selectedCity}` : "Toutes les villes"})
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleExport}>Exporter CSV</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer les prospects</DialogTitle>
            <DialogDescription>
              Cette action est irréversible. Entrez le mot de passe de sécurité pour confirmer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm font-medium">Vous allez supprimer {selectedIds.length} prospect(s).</p>
            <div>
              <Label>Mot de passe de sécurité</Label>
              <Input
                type="password"
                value={securityPassword}
                onChange={(e) => setSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete}>
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Security Password Dialog */}
      <Dialog open={configPasswordDialogOpen} onOpenChange={setConfigPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurer le mot de passe de sécurité</DialogTitle>
            <DialogDescription>
              Ce mot de passe sera requis pour les actions sensibles (export, suppression de données).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nouveau mot de passe (min. 6 caractères)</Label>
              <Input
                type="password"
                value={newSecurityPassword}
                onChange={(e) => setNewSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div>
              <Label>Confirmer le mot de passe</Label>
              <Input
                type="password"
                value={confirmSecurityPassword}
                onChange={(e) => setConfirmSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigPasswordDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfigureSecurityPassword}>Configurer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default AdminEmailsProspectsPage;
