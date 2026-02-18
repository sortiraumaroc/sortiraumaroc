import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  Download,
  MoreHorizontal,
  Eye,
  Trash2,
  Archive,
  CheckCircle,
  MessageSquare,
  Mail,
  Phone,
  User,
  Clock,
  Globe,
  AlertTriangle,
  Inbox,
  Filter,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import {
  getAdminContactForm,
  listAdminContactFormSubmissions,
  getAdminContactFormSubmission,
  updateAdminContactFormSubmission,
  deleteAdminContactFormSubmission,
  bulkUpdateAdminContactFormSubmissions,
  getAdminContactFormSubmissionsExportUrl,
  type ContactForm,
  type ContactFormSubmission,
  type ContactFormField,
  isAdminSuperadmin,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

const STATUS_OPTIONS = [
  { value: "all", label: "Tous les statuts" },
  { value: "new", label: "Nouvelles", color: "bg-blue-500" },
  { value: "read", label: "Lues", color: "bg-gray-500" },
  { value: "replied", label: "Répondues", color: "bg-green-500" },
  { value: "archived", label: "Archivées", color: "bg-slate-400" },
  { value: "spam", label: "Spam", color: "bg-red-500" },
];

export default function AdminContactFormSubmissionsPage() {
  const { id: formId } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const isSuperAdmin = isAdminSuperadmin();

  const [form, setForm] = useState<ContactForm | null>(null);
  const [submissions, setSubmissions] = useState<ContactFormSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [status, setStatus] = useState(searchParams.get("status") || "all");
  const [page, setPage] = useState(0);
  const limit = 25;

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // View dialog
  const [viewSubmission, setViewSubmission] = useState<{
    submission: ContactFormSubmission;
    fields: ContactFormField[];
    files: Array<{ id: string; field_id: string; file_name: string; file_url: string }>;
  } | null>(null);

  // Delete dialog
  const [deleteSubmission, setDeleteSubmission] = useState<ContactFormSubmission | null>(null);

  const loadForm = useCallback(async () => {
    if (!formId) return;
    try {
      const { form: data } = await getAdminContactForm(undefined, formId);
      setForm(data);
    } catch (err) {
      console.error(err);
    }
  }, [formId]);

  const loadSubmissions = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      const { submissions: data, total: count } = await listAdminContactFormSubmissions(
        undefined,
        formId,
        {
          status: status !== "all" ? status : undefined,
          search: search || undefined,
          limit,
          offset: page * limit,
        }
      );
      setSubmissions(data || []);
      setTotal(count || 0);
      setSelected(new Set());
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les réponses",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [formId, status, search, page, toast]);

  useEffect(() => {
    loadForm();
  }, [loadForm]);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    setSearchParams(params, { replace: true });
  }, [status, search, setSearchParams]);

  const handleView = async (submission: ContactFormSubmission) => {
    try {
      const result = await getAdminContactFormSubmission(undefined, submission.id);
      setViewSubmission(result);
      // Mark as read if new
      if (submission.status === "new") {
        await updateAdminContactFormSubmission(undefined, submission.id, { status: "read" });
        loadSubmissions();
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de charger la soumission",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (submissionId: string, newStatus: string) => {
    try {
      await updateAdminContactFormSubmission(undefined, submissionId, { status: newStatus });
      toast({ title: "Statut mis à jour" });
      loadSubmissions();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour le statut",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteSubmission) return;
    try {
      await deleteAdminContactFormSubmission(undefined, deleteSubmission.id);
      toast({ title: "Réponse supprimée" });
      setDeleteSubmission(null);
      loadSubmissions();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la réponse",
        variant: "destructive",
      });
    }
  };

  const handleBulkAction = async (action: string) => {
    if (selected.size === 0) return;
    try {
      await bulkUpdateAdminContactFormSubmissions(
        undefined,
        Array.from(selected),
        action
      );
      toast({ title: `${selected.size} réponse(s) mise(s) à jour` });
      loadSubmissions();
    } catch (err) {
      console.error(err);
      toast({
        title: "Erreur",
        description: "Impossible de mettre à jour les réponses",
        variant: "destructive",
      });
    }
  };

  const toggleSelectAll = () => {
    if (selected.size === submissions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(submissions.map((s) => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const columns: ColumnDef<ContactFormSubmission>[] = useMemo(
    () => [
      // Checkbox de sélection uniquement pour super-admin
      ...(isSuperAdmin
        ? [
            {
              id: "select",
              header: () => (
                <Checkbox
                  checked={selected.size === submissions.length && submissions.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              ),
              cell: ({ row }: { row: any }) => (
                <Checkbox
                  checked={selected.has(row.original.id)}
                  onCheckedChange={() => toggleSelect(row.original.id)}
                />
              ),
            } as ColumnDef<ContactFormSubmission>,
          ]
        : []),
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const opt = STATUS_OPTIONS.find((o) => o.value === row.original.status);
          return (
            <Badge
              className={`${opt?.color || "bg-gray-500"} text-white`}
            >
              {opt?.label || row.original.status}
            </Badge>
          );
        },
      },
      {
        id: "contact",
        header: "Contact",
        cell: ({ row }) => (
          <div className="space-y-1">
            {row.original.full_name && (
              <div className="flex items-center gap-1 text-sm font-medium">
                <User className="w-3 h-3" />
                {row.original.full_name}
              </div>
            )}
            {row.original.email && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Mail className="w-3 h-3" />
                {row.original.email}
              </div>
            )}
            {row.original.phone && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Phone className="w-3 h-3" />
                {row.original.phone}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        header: "Date",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground">
            {new Date(row.original.created_at).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) =>
          row.original.utm_source ? (
            <Badge variant="outline" className="text-xs">
              {row.original.utm_source}
            </Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
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
              <DropdownMenuItem onClick={() => handleView(row.original)}>
                <Eye className="w-4 h-4 me-2" />
                Voir
              </DropdownMenuItem>
              {isSuperAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleStatusChange(row.original.id, "read")}
                  >
                    <CheckCircle className="w-4 h-4 me-2" />
                    Marquer comme lu
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange(row.original.id, "replied")}
                  >
                    <MessageSquare className="w-4 h-4 me-2" />
                    Marquer comme répondu
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange(row.original.id, "archived")}
                  >
                    <Archive className="w-4 h-4 me-2" />
                    Archiver
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleStatusChange(row.original.id, "spam")}
                  >
                    <AlertTriangle className="w-4 h-4 me-2" />
                    Marquer comme spam
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteSubmission(row.original)}
                  >
                    <Trash2 className="w-4 h-4 me-2" />
                    Supprimer
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    [selected, submissions, isSuperAdmin]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          asChild
        >
          <Link to={`/admin/contact-forms/${formId}`}>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">Réponses : {form?.name}</h1>
          <p className="text-sm text-muted-foreground">
            {total} réponse{total > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="ps-9"
            />
          </div>

          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {isSuperAdmin && selected.size > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  Actions ({selected.size})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleBulkAction("read")}>
                  Marquer comme lu
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction("archived")}>
                  Archiver
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleBulkAction("spam")}>
                  Marquer comme spam
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="outline"
            asChild
          >
            <a
              href={getAdminContactFormSubmissionsExportUrl(formId!, status)}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="w-4 h-4 me-2" />
              Exporter CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border">
        <AdminDataTable
          columns={columns}
          data={submissions}
          isLoading={loading}
          onRowClick={(row) => handleView(row)}
        />
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} sur {Math.ceil(total / limit)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * limit >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
            </Button>
          </div>
        </div>
      )}

      {/* View Dialog */}
      <Dialog
        open={!!viewSubmission}
        onOpenChange={() => setViewSubmission(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Détails de la réponse</DialogTitle>
          </DialogHeader>
          {viewSubmission && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pe-4">
                {/* Contact info */}
                <div className="grid grid-cols-2 gap-4">
                  {viewSubmission.submission.full_name && (
                    <div>
                      <Label className="text-muted-foreground">Nom</Label>
                      <p className="font-medium">{viewSubmission.submission.full_name}</p>
                    </div>
                  )}
                  {viewSubmission.submission.email && (
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">
                        <a
                          href={`mailto:${viewSubmission.submission.email}`}
                          className="text-primary hover:underline"
                        >
                          {viewSubmission.submission.email}
                        </a>
                      </p>
                    </div>
                  )}
                  {viewSubmission.submission.phone && (
                    <div>
                      <Label className="text-muted-foreground">Téléphone</Label>
                      <p className="font-medium">
                        <a
                          href={`tel:${viewSubmission.submission.phone}`}
                          className="text-primary hover:underline"
                        >
                          {viewSubmission.submission.phone}
                        </a>
                      </p>
                    </div>
                  )}
                  <div>
                    <Label className="text-muted-foreground">Date</Label>
                    <p className="font-medium">
                      {new Date(viewSubmission.submission.created_at).toLocaleDateString(
                        "fr-FR",
                        {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Form data */}
                <div className="space-y-4">
                  <h3 className="font-semibold">Réponses</h3>
                  {viewSubmission.fields.map((field) => {
                    const value = viewSubmission.submission.data[field.id];
                    if (value === undefined || value === null || value === "") return null;

                    // Pour les champs à options (select/radio/checkbox), afficher le label au lieu de la valeur brute
                    const formatValue = (v: unknown): string => {
                      const str = String(v);
                      if (field.options && field.options.length > 0) {
                        const opt = field.options.find((o: any) => o.value === str);
                        return opt ? opt.label : str.replace(/_/g, " ");
                      }
                      return str;
                    };

                    const displayValue = Array.isArray(value)
                      ? value.map(formatValue).join(", ")
                      : formatValue(value);

                    return (
                      <div key={field.id}>
                        <Label className="text-red-600 font-semibold">{field.label}</Label>
                        <p className="font-medium whitespace-pre-wrap">
                          {displayValue}
                        </p>
                      </div>
                    );
                  })}
                </div>

                {/* Files */}
                {viewSubmission.files.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-2">
                      <h3 className="font-semibold">Fichiers joints</h3>
                      {viewSubmission.files.map((file) => (
                        <a
                          key={file.id}
                          href={file.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <Download className="w-4 h-4" />
                          {file.file_name}
                        </a>
                      ))}
                    </div>
                  </>
                )}

                {/* Meta info */}
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {viewSubmission.submission.utm_source && (
                    <div>
                      <Label className="text-muted-foreground">Source UTM</Label>
                      <p>{viewSubmission.submission.utm_source}</p>
                    </div>
                  )}
                  {viewSubmission.submission.utm_medium && (
                    <div>
                      <Label className="text-muted-foreground">Medium UTM</Label>
                      <p>{viewSubmission.submission.utm_medium}</p>
                    </div>
                  )}
                  {viewSubmission.submission.utm_campaign && (
                    <div>
                      <Label className="text-muted-foreground">Campagne UTM</Label>
                      <p>{viewSubmission.submission.utm_campaign}</p>
                    </div>
                  )}
                  {viewSubmission.submission.referrer && (
                    <div>
                      <Label className="text-muted-foreground">Referrer</Label>
                      <p className="truncate">{viewSubmission.submission.referrer}</p>
                    </div>
                  )}
                  {viewSubmission.submission.ip_address && (
                    <div>
                      <Label className="text-muted-foreground">IP</Label>
                      <p>{viewSubmission.submission.ip_address}</p>
                    </div>
                  )}
                </div>

                {/* Status change — super-admin uniquement */}
                <Separator />
                <div className="flex items-center gap-2">
                  <Label>Statut :</Label>
                  {isSuperAdmin ? (
                    <Select
                      value={viewSubmission.submission.status}
                      onValueChange={(v) => {
                        handleStatusChange(viewSubmission.submission.id, v);
                        setViewSubmission((prev) =>
                          prev
                            ? {
                                ...prev,
                                submission: { ...prev.submission, status: v as any },
                              }
                            : null
                        );
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.filter((o) => o.value !== "all").map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge
                      className={`${STATUS_OPTIONS.find((o) => o.value === viewSubmission.submission.status)?.color || "bg-gray-500"} text-white`}
                    >
                      {STATUS_OPTIONS.find((o) => o.value === viewSubmission.submission.status)?.label || viewSubmission.submission.status}
                    </Badge>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewSubmission(null)}>
              Fermer
            </Button>
            {isSuperAdmin && viewSubmission?.submission.email && (
              <Button asChild>
                <a href={`mailto:${viewSubmission.submission.email}`}>
                  <Mail className="w-4 h-4 me-2" />
                  Répondre par email
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteSubmission} onOpenChange={() => setDeleteSubmission(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette réponse ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La réponse sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
