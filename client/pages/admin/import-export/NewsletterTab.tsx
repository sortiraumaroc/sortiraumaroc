import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Loader2,
  Mail,
  MapPin,
  Search,
  Trash2,
  Edit,
  Users,
  Globe,
  Calendar,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDateFr } from "@/lib/shared/utils";

type NewsletterSubscriber = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  age: number | null;
  gender: string | null;
  profession: string | null;
  csp: string | null;
  interests: string[] | null;
  status: "active" | "unsubscribed" | "bounced";
  created_at: string;
};

type Stats = {
  total: number;
  active: number;
  cities: string[];
  countries: string[];
};

export function NewsletterTab() {
  const { toast } = useToast();

  const [subscribers, setSubscribers] = useState<NewsletterSubscriber[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<NewsletterSubscriber | null>(null);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    city: "",
    country: "",
    age: "",
    gender: "",
    profession: "",
    csp: "",
    interests: "",
  });
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingSubscriber, setDeletingSubscriber] = useState<NewsletterSubscriber | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Exporting
  const [exporting, setExporting] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/newsletter/subscribers/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setStats(data);
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (countryFilter) params.set("country", countryFilter);

      const res = await fetch(`/api/admin/newsletter/subscribers?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          setSubscribers(data.items);
          setTotalPages(data.totalPages);
          setTotal(data.total);
        }
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les inscrits", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, cityFilter, countryFilter, toast]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    void loadSubscribers();
  }, [loadSubscribers]);

  const handleSearch = () => {
    setPage(1);
    void loadSubscribers();
  };

  const handleEdit = (subscriber: NewsletterSubscriber) => {
    setEditingSubscriber(subscriber);
    setEditForm({
      first_name: subscriber.first_name || "",
      last_name: subscriber.last_name || "",
      phone: subscriber.phone || "",
      city: subscriber.city || "",
      country: subscriber.country || "",
      age: subscriber.age?.toString() || "",
      gender: subscriber.gender || "",
      profession: subscriber.profession || "",
      csp: subscriber.csp || "",
      interests: subscriber.interests?.join(", ") || "",
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSubscriber) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/newsletter/subscribers/${editingSubscriber.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          first_name: editForm.first_name || null,
          last_name: editForm.last_name || null,
          phone: editForm.phone || null,
          city: editForm.city || null,
          country: editForm.country || null,
          age: editForm.age ? parseInt(editForm.age) : null,
          gender: editForm.gender || null,
          profession: editForm.profession || null,
          csp: editForm.csp || null,
          interests: editForm.interests ? editForm.interests.split(",").map(i => i.trim()).filter(Boolean) : null,
        }),
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Inscrit mis à jour" });
        setEditDialogOpen(false);
        void loadSubscribers();
        void loadStats();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error || "Erreur lors de la mise à jour", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de la mise à jour", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingSubscriber) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/newsletter/subscribers/${deletingSubscriber.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Inscrit supprimé" });
        setDeleteDialogOpen(false);
        void loadSubscribers();
        void loadStats();
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error || "Erreur lors de la suppression", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de la suppression", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch("/api/admin/newsletter/subscribers/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          status: statusFilter !== "all" ? statusFilter : undefined,
          city: cityFilter || undefined,
          country: countryFilter || undefined,
        }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `newsletter_subscribers_${new Date().toISOString().split("T")[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        toast({ title: "Succès", description: "Export téléchargé" });
      } else {
        toast({ title: "Erreur", description: "Erreur lors de l'export", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Erreur lors de l'export", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total inscrits</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <Users className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.active ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Villes</CardTitle>
            <MapPin className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats?.cities?.length ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pays</CardTitle>
            <Globe className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats?.countries?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Abonnés</CardTitle>
          <CardDescription>Liste des personnes inscrites à la newsletter via le site</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Rechercher par email, nom..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="unsubscribed">Désinscrits</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
              </SelectContent>
            </Select>

            <Select value={cityFilter || "__all__"} onValueChange={(v) => { setCityFilter(v === "__all__" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Ville" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Toutes</SelectItem>
                {stats?.cities?.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={countryFilter || "__all__"} onValueChange={(v) => { setCountryFilter(v === "__all__" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Pays" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tous</SelectItem>
                {stats?.countries?.map((country) => (
                  <SelectItem key={country} value={country}>{country}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={handleSearch} className="gap-2">
              <Search className="h-4 w-4" />
              Rechercher
            </Button>

            <Button variant="outline" onClick={handleExport} disabled={exporting} className="gap-2">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exporter
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {total} résultat(s)
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date d'ajout</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : subscribers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Aucun inscrit trouvé
                    </TableCell>
                  </TableRow>
                ) : (
                  subscribers.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="font-medium">{sub.email}</TableCell>
                      <TableCell>
                        {sub.first_name || sub.last_name
                          ? `${sub.first_name || ""} ${sub.last_name || ""}`.trim()
                          : "-"}
                      </TableCell>
                      <TableCell>{sub.city || "-"}</TableCell>
                      <TableCell>{sub.country || "-"}</TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-700">
                          Site web
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sub.status === "active" ? "default" : "secondary"}
                          className={sub.status === "active" ? "bg-green-500" : ""}
                        >
                          {sub.status === "active" ? "Actif" : sub.status === "unsubscribed" ? "Désinscrit" : "Bounced"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatDateFr(sub.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(sub)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingSubscriber(sub);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Précédent
              </Button>
              <span className="flex items-center px-3 text-sm">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Suivant
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Modifier l'inscrit</DialogTitle>
            <DialogDescription>
              {editingSubscriber?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Prénom</Label>
                <Input
                  value={editForm.first_name}
                  onChange={(e) => setEditForm(f => ({ ...f, first_name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Nom</Label>
                <Input
                  value={editForm.last_name}
                  onChange={(e) => setEditForm(f => ({ ...f, last_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Âge</Label>
                <Input
                  type="number"
                  value={editForm.age}
                  onChange={(e) => setEditForm(f => ({ ...f, age: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={editForm.city}
                  onChange={(e) => setEditForm(f => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Pays</Label>
                <Input
                  value={editForm.country}
                  onChange={(e) => setEditForm(f => ({ ...f, country: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Genre</Label>
                <Select value={editForm.gender || "__none__"} onValueChange={(v) => setEditForm(f => ({ ...f, gender: v === "__none__" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Non renseigné</SelectItem>
                    <SelectItem value="male">Homme</SelectItem>
                    <SelectItem value="female">Femme</SelectItem>
                    <SelectItem value="other">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>CSP</Label>
                <Select value={editForm.csp || "__none__"} onValueChange={(v) => setEditForm(f => ({ ...f, csp: v === "__none__" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Non renseigné</SelectItem>
                    <SelectItem value="csp+">CSP+</SelectItem>
                    <SelectItem value="csp">CSP</SelectItem>
                    <SelectItem value="etudiant">Étudiant</SelectItem>
                    <SelectItem value="retraite">Retraité</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Profession</Label>
              <Input
                value={editForm.profession}
                onChange={(e) => setEditForm(f => ({ ...f, profession: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Centres d'intérêt (séparés par des virgules)</Label>
              <Input
                value={editForm.interests}
                onChange={(e) => setEditForm(f => ({ ...f, interests: e.target.value }))}
                placeholder="restaurants, sport, loisirs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'inscrit ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. L'email {deletingSubscriber?.email} sera supprimé de la liste.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
