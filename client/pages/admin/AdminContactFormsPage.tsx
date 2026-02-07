import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Edit3,
  Trash2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  Search,
  Eye,
  EyeOff,
  Inbox,
  FileText,
  Clock,
  CheckCircle,
  Archive,
  AlertTriangle,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import {
  listAdminContactForms,
  deleteAdminContactForm,
  duplicateAdminContactForm,
  updateAdminContactForm,
  type ContactFormStats,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Label } from "@/components/ui/label";
import type { ColumnDef } from "@tanstack/react-table";

export default function AdminContactFormsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [forms, setForms] = useState<ContactFormStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newFormName, setNewFormName] = useState("");
  const [newFormSlug, setNewFormSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete dialog
  const [deleteForm, setDeleteForm] = useState<ContactFormStats | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const { forms: data } = await listAdminContactForms(undefined);
      setForms(data || []);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les formulaires",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadForms();
  }, [loadForms]);

  const filteredForms = useMemo(() => {
    if (!search.trim()) return forms;
    const q = search.toLowerCase();
    return forms.filter(
      (f) =>
        f.form_name.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q)
    );
  }, [forms, search]);

  const handleCreate = async () => {
    if (!newFormName.trim() || !newFormSlug.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom et le slug sont requis",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const { createAdminContactForm } = await import("@/lib/adminApi");
      const { form } = await createAdminContactForm(undefined, {
        name: newFormName.trim(),
        slug: newFormSlug.trim().toLowerCase().replace(/\s+/g, "-"),
      });
      toast({ title: "Formulaire créé" });
      setCreateOpen(false);
      setNewFormName("");
      setNewFormSlug("");
      navigate(`/admin/contact-forms/${form.id}`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de créer le formulaire",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteForm) return;
    setDeleting(true);
    try {
      await deleteAdminContactForm(undefined, deleteForm.form_id);
      toast({ title: "Formulaire supprimé" });
      setDeleteForm(null);
      loadForms();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer le formulaire",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async (form: ContactFormStats) => {
    try {
      const { form: newForm } = await duplicateAdminContactForm(undefined, form.form_id);
      toast({ title: "Formulaire dupliqué" });
      navigate(`/admin/contact-forms/${newForm.id}`);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de dupliquer le formulaire",
        variant: "destructive",
      });
    }
  };

  const handleToggleActive = async (form: ContactFormStats) => {
    try {
      await updateAdminContactForm(undefined, form.form_id, {
        is_active: !form.is_active,
      });
      toast({ title: form.is_active ? "Formulaire désactivé" : "Formulaire activé" });
      loadForms();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de modifier le statut",
        variant: "destructive",
      });
    }
  };

  const columns: ColumnDef<ContactFormStats>[] = useMemo(
    () => [
      {
        accessorKey: "form_name",
        header: "Nom",
        cell: ({ row }) => (
          <div>
            <Link
              to={`/admin/contact-forms/${row.original.form_id}`}
              className="font-medium text-primary hover:underline"
            >
              {row.original.form_name}
            </Link>
            <div className="text-xs text-muted-foreground">
              /form/{row.original.slug}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "is_active",
        header: "Statut",
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge variant="default" className="bg-green-500">
              <Eye className="w-3 h-3 mr-1" />
              Actif
            </Badge>
          ) : (
            <Badge variant="secondary">
              <EyeOff className="w-3 h-3 mr-1" />
              Inactif
            </Badge>
          ),
      },
      {
        accessorKey: "total_submissions",
        header: "Réponses",
        cell: ({ row }) => (
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1" title="Total">
              <FileText className="w-4 h-4 text-muted-foreground" />
              {row.original.total_submissions}
            </span>
            {row.original.new_submissions > 0 && (
              <span className="flex items-center gap-1 text-blue-600" title="Nouvelles">
                <Inbox className="w-4 h-4" />
                {row.original.new_submissions}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "last_submission_at",
        header: "Dernière réponse",
        cell: ({ row }) =>
          row.original.last_submission_at ? (
            <span className="text-sm text-muted-foreground">
              {new Date(row.original.last_submission_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link to={`/admin/contact-forms/${row.original.form_id}`}>
                  <Edit3 className="w-4 h-4 mr-2" />
                  Modifier
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to={`/admin/contact-forms/${row.original.form_id}/submissions`}>
                  <Inbox className="w-4 h-4 mr-2" />
                  Voir les réponses
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.open(`/form/${row.original.slug}`, "_blank")}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Prévisualiser
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDuplicate(row.original)}>
                <Copy className="w-4 h-4 mr-2" />
                Dupliquer
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleToggleActive(row.original)}>
                {row.original.is_active ? (
                  <>
                    <EyeOff className="w-4 h-4 mr-2" />
                    Désactiver
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Activer
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setDeleteForm(row.original)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  );

  // Stats summary
  const stats = useMemo(() => {
    const total = forms.length;
    const active = forms.filter((f) => f.is_active).length;
    const totalSubmissions = forms.reduce((acc, f) => acc + f.total_submissions, 0);
    const newSubmissions = forms.reduce((acc, f) => acc + f.new_submissions, 0);
    return { total, active, totalSubmissions, newSubmissions };
  }, [forms]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Formulaires de contact"
        description="Créez et gérez vos formulaires de contact personnalisés"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Formulaires</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Actifs</div>
          <div className="text-2xl font-bold text-green-600">{stats.active}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Total réponses</div>
          <div className="text-2xl font-bold">{stats.totalSubmissions}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-muted-foreground">Nouvelles</div>
          <div className="text-2xl font-bold text-blue-600">{stats.newSubmissions}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un formulaire..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Nouveau formulaire
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border">
        <AdminDataTable
          columns={columns}
          data={filteredForms}
          loading={loading}
          emptyMessage="Aucun formulaire créé"
        />
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouveau formulaire</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="form-name">Nom du formulaire</Label>
              <Input
                id="form-name"
                placeholder="Ex: Formulaire de contact"
                value={newFormName}
                onChange={(e) => {
                  setNewFormName(e.target.value);
                  // Auto-generate slug
                  if (!newFormSlug || newFormSlug === slugify(newFormName)) {
                    setNewFormSlug(slugify(e.target.value));
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="form-slug">Slug (URL)</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">sam.ma/form/</span>
                <Input
                  id="form-slug"
                  placeholder="contact"
                  value={newFormSlug}
                  onChange={(e) => setNewFormSlug(slugify(e.target.value))}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Le slug sera utilisé dans l'URL publique du formulaire
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Création..." : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteForm} onOpenChange={() => setDeleteForm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce formulaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le formulaire "{deleteForm?.form_name}" et
              toutes ses réponses ({deleteForm?.total_submissions || 0}) seront
              définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
