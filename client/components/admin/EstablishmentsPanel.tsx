import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Copy, Plus, BadgeCheck, Crown, Star, Trash2, Power, Eye, GitCompareArrows } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AdminApiError,
  Establishment,
  EstablishmentStatus,
  createEstablishment,
  listEstablishments,
  updateEstablishmentStatus,
  updateEstablishmentFlags,
  listAdminUniverses,
  UniverseAdmin,
  deleteEstablishment,
  isAdminSuperadmin,
  getAdminUserRole,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";
import { DynamicLucideIcon } from "@/components/admin/LucideIconPicker";
import { DuplicateEstablishmentsDialog } from "@/components/admin/DuplicateEstablishmentsDialog";
import { PaginationControls } from "@/components/admin/table/PaginationControls";

const STATUS_OPTIONS: Array<{ value: EstablishmentStatus; label: string; badge: "default" | "secondary" | "destructive" | "outline" }> = [
  { value: "pending", label: "En attente", badge: "secondary" },
  { value: "active", label: "Actif", badge: "default" },
  { value: "suspended", label: "Désactivé", badge: "outline" },
  { value: "rejected", label: "Rejeté", badge: "destructive" },
];

// Fallback si l'API échoue
const FALLBACK_UNIVERSES: Array<{ value: string; label: string }> = [
  { value: "restaurants", label: "Manger & Boire" },
  { value: "loisirs", label: "Loisirs" },
  { value: "sport", label: "Sport & Bien-être" },
  { value: "culture", label: "Culture" },
  { value: "hebergement", label: "Hébergement" },
  { value: "shopping", label: "Shopping" },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Convertit une chaîne en Title Case
 * Ex: "THE CLOUD COFFEE LAB" -> "The Cloud Coffee Lab"
 */
function toTitleCase(str: string): string {
  // Mots qu'on garde en minuscule (sauf en début de phrase)
  const minorWords = new Set(["de", "du", "la", "le", "les", "des", "et", "ou", "à", "au", "aux", "en", "par", "pour", "sur", "avec", "sans", "sous", "chez"]);

  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      // Premier mot toujours capitalisé, ou si le mot n'est pas un mot mineur
      if (index === 0 || !minorWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

function getLabel(est: Establishment): string {
  const a = typeof est.name === "string" ? est.name.trim() : "";
  if (a) return toTitleCase(a);
  const b = typeof est.title === "string" ? est.title.trim() : "";
  if (b) return toTitleCase(b);
  return est.id;
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const el = document.createElement("textarea");
  el.value = value;
  el.setAttribute("readonly", "");
  el.style.position = "absolute";
  el.style.left = "-9999px";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
}

export function EstablishmentsPanel(props: { adminKey?: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState<EstablishmentStatus | "all">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [universeFilter, setUniverseFilter] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  const [items, setItems] = useState<Establishment[]>([]);
  const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
  const [draftStatus, setDraftStatus] = useState<Record<string, EstablishmentStatus>>({});

  // Pagination
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Univers dynamiques depuis la base de données
  const [universes, setUniverses] = useState<UniverseAdmin[]>([]);
  const [universesLoading, setUniversesLoading] = useState(false);

  const universeOptions = useMemo(() => {
    if (universes.length > 0) {
      return universes.map((u) => ({ value: u.slug, label: u.label_fr, icon_name: u.icon_name }));
    }
    return FALLBACK_UNIVERSES.map((u) => ({ ...u, icon_name: "Circle" }));
  }, [universes]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    name: string;
    city: string;
    universe: string;
    owner_email: string;
    contact_name: string;
    contact_phone: string;
  }>({
    name: "",
    city: "",
    universe: "restaurants",
    owner_email: "",
    contact_name: "",
    contact_phone: "",
  });

  const [createdCredentials, setCreatedCredentials] = useState<null | {
    establishmentId: string;
    email: string;
    temporaryPassword: string;
  }>(null);

  const canCreate = useMemo(() => {
    const email = createDraft.owner_email.trim().toLowerCase();
    return createDraft.name.trim().length >= 2 && createDraft.city.trim().length >= 2 && email.includes("@");
  }, [createDraft.city, createDraft.name, createDraft.owner_email]);

  const refresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listEstablishments(props.adminKey, statusFilter === "all" ? undefined : statusFilter);
      setItems(res.items);
      setDraftStatus({});
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  };

  const loadUniverses = async () => {
    setUniversesLoading(true);
    try {
      const res = await listAdminUniverses(props.adminKey);
      setUniverses(res.items);
    } catch {
      // Utiliser le fallback en cas d'erreur
      setUniverses([]);
    } finally {
      setUniversesLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void loadUniverses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.adminKey, statusFilter]);

  const handleCreate = async () => {
    if (!canCreate || createSaving) return;

    setCreateSaving(true);
    setCreateError(null);

    try {
      const res = await createEstablishment(props.adminKey, {
        name: createDraft.name.trim(),
        city: createDraft.city.trim(),
        universe: createDraft.universe.trim() || undefined,
        owner_email: createDraft.owner_email.trim().toLowerCase(),
        contact_name: createDraft.contact_name.trim() || undefined,
        contact_phone: createDraft.contact_phone.trim() || undefined,
      });

      const estId = res?.item?.id;
      if (!estId) throw new Error("Impossible de créer l’établissement");

      setCreatedCredentials({
        establishmentId: estId,
        email: res.owner.email,
        temporaryPassword: res.owner.temporary_password,
      });

      toast({ title: "Créé", description: "Établissement + compte Pro créés." });

      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setCreateError(e.message);
      else setCreateError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSave = async (id: string, nextOverride?: EstablishmentStatus) => {
    const next = nextOverride ?? draftStatus[id];
    if (!next) return;

    // Keep UI draft in sync when using quick actions.
    setDraftStatus((prev) => ({ ...prev, [id]: next }));

    setSavingIds((prev) => new Set(prev).add(id));
    setError(null);

    try {
      await updateEstablishmentStatus(props.adminKey, id, next);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setSavingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
    }
  };

  const handleToggleFlag = async (id: string, flag: "verified" | "premium" | "curated", currentValue: boolean) => {
    setSavingIds((prev) => new Set(prev).add(id));
    setError(null);

    try {
      await updateEstablishmentFlags(props.adminKey, id, { [flag]: !currentValue });

      // Update local state immediately
      setItems((prev) => prev.map((item) =>
        item.id === id ? { ...item, [flag]: !currentValue } : item
      ));

      const flagLabels = { verified: "Vérifié", premium: "Premium", curated: "Sélection" };
      toast({
        title: !currentValue ? `${flagLabels[flag]} activé` : `${flagLabels[flag]} désactivé`,
        description: `L'établissement a été mis à jour.`
      });
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setSavingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
    }
  };

  // État pour la suppression
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Doublons
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

  // Vérifier si l'utilisateur peut supprimer (admin ou superadmin)
  const canDelete = useMemo(() => {
    const role = getAdminUserRole();
    return role === "superadmin" || role === "admin";
  }, []);

  const handleDelete = async () => {
    if (!deleteConfirm || deleting) return;

    setDeleting(true);
    setError(null);

    try {
      await deleteEstablishment(props.adminKey, deleteConfirm.id);
      toast({
        title: "Supprimé",
        description: `L'établissement "${deleteConfirm.name}" a été supprimé.`,
      });
      setDeleteConfirm(null);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  // Toggle activer/désactiver
  const handleToggleActive = async (id: string, currentStatus: string) => {
    const nextStatus: EstablishmentStatus = currentStatus === "active" ? "suspended" : "active";
    await handleSave(id, nextStatus);
  };

  const filtersLabel = useMemo(() => {
    const parts: string[] = [];
    parts.push(statusFilter === "all" ? "Tous" : statusFilter.toString());
    if (cityFilter !== "all") parts.push(cityFilter);
    if (universeFilter !== "all") parts.push(universeFilter);
    return parts.join(" · ");
  }, [cityFilter, statusFilter, universeFilter]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of items) {
      const c = typeof e.city === "string" ? e.city.trim() : "";
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const universeFilterOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of items) {
      const u = typeof (e as any).universe === "string" ? String((e as any).universe).trim() : "";
      if (u) set.add(u);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (cityFilter !== "all") {
        const c = typeof e.city === "string" ? e.city.trim() : "";
        if (c !== cityFilter) return false;
      }

      if (universeFilter !== "all") {
        const u = typeof (e as any).universe === "string" ? String((e as any).universe).trim() : "";
        if (u !== universeFilter) return false;
      }

      if (!q) return true;
      const hay = `${e.id ?? ""} ${e.name ?? ""} ${e.title ?? ""} ${e.city ?? ""} ${String((e as any).universe ?? "")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [cityFilter, items, search, universeFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [search, statusFilter, cityFilter, universeFilter]);

  const paginatedItems = useMemo(() => {
    const start = currentPage * pageSize;
    return visibleItems.slice(start, start + pageSize);
  }, [visibleItems, currentPage, pageSize]);

  return (
    <div className="rounded-lg border-2 border-slate-200 bg-white">
      <div className="p-4 md:p-6 border-b border-slate-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Établissements</h2>
            <div className="text-sm text-slate-600">{filtersLabel}</div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Button
              variant="outline"
              className="px-3"
              onClick={() => {
                setCreateError(null);
                setCreatedCredentials(null);
                setCreateDraft({
                  name: "",
                  city: "",
                  universe: universeOptions[0]?.value || "restaurants",
                  owner_email: "",
                  contact_name: "",
                  contact_phone: "",
                });
                setCreateOpen(true);
              }}
              aria-label="Créer un nouvel établissement"
              title="Créer un nouvel établissement"
            >
              +
            </Button>

            {canDelete && (
              <Button
                variant="outline"
                className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => setDuplicatesOpen(true)}
                title="Détecter et supprimer les doublons"
              >
                <GitCompareArrows className="h-4 w-4" />
                <span className="hidden sm:inline">Doublons</span>
              </Button>
            )}

            <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-600">Recherche</div>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="nom, ville, id…" />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-600">Statut</div>
            <Select value={statusFilter.toString()} onValueChange={(v) => setStatusFilter(v as EstablishmentStatus | "all")}>
              <SelectTrigger>
                <SelectValue placeholder="Filtre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value.toString()} value={o.value.toString()}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-600">Ville</div>
            <Select value={cityFilter} onValueChange={setCityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {cityOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-600">Catégorie</div>
            <Select value={universeFilter} onValueChange={setUniverseFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Toutes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                {universeFilterOptions.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-500">{visibleItems.length} résultat(s)</div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setCityFilter("all");
              setUniverseFilter("all");
            }}
          >
            Réinitialiser
          </Button>
        </div>
      </div>

      {error && <div className="px-4 md:px-6 py-3 text-sm text-destructive">{error}</div>}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateSaving(false);
            setCreateError(null);
            setCreatedCredentials(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Créer un établissement</DialogTitle>
            <DialogDescription>
              Ajoutez une nouvelle fiche (statut initial : <span className="font-semibold">En attente</span>).
            </DialogDescription>
          </DialogHeader>

          {createdCredentials ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-bold text-slate-900">Compte Pro créé</div>
                <div className="mt-2 grid grid-cols-1 gap-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">Email</div>
                      <div className="font-mono truncate">{createdCredentials.email}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void (async () => {
                          try {
                            await copyToClipboard(createdCredentials.email);
                            toast({ title: "Copié", description: "Email copié" });
                          } catch {
                            toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
                          }
                        })();
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copier
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-500">Mot de passe provisoire</div>
                      <div className="font-mono break-all">{createdCredentials.temporaryPassword}</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void (async () => {
                          try {
                            await copyToClipboard(createdCredentials.temporaryPassword);
                            toast({ title: "Copié", description: "Mot de passe copié" });
                          } catch {
                            toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
                          }
                        })();
                      }}
                    >
                      <Copy className="h-4 w-4" />
                      Copier
                    </Button>
                  </div>
                </div>

                <div className="mt-3 text-xs text-slate-600">
                  Note : ce mot de passe est provisoire. L’utilisateur pourra le changer après connexion.
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                  Fermer
                </Button>
                <Button
                  type="button"
                  className="gap-2"
                  onClick={() => {
                    setCreateOpen(false);
                    navigate(`/admin/establishments/${encodeURIComponent(createdCredentials.establishmentId)}`);
                  }}
                >
                  Voir la fiche
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="admin-create-est-name">Nom</Label>
                  <Input
                    id="admin-create-est-name"
                    value={createDraft.name}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Nom de l’établissement"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="admin-create-est-city">Ville</Label>
                  <Input
                    id="admin-create-est-city"
                    value={createDraft.city}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, city: e.target.value }))}
                    placeholder="Ville"
                    autoComplete="address-level2"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="admin-create-est-owner-email">Email (compte Pro)</Label>
                  <Input
                    id="admin-create-est-owner-email"
                    value={createDraft.owner_email}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, owner_email: e.target.value }))}
                    placeholder="email@domaine.com"
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Univers</Label>
                  <Select
                    value={createDraft.universe}
                    onValueChange={(val) => setCreateDraft((p) => ({ ...p, universe: val }))}
                    disabled={universesLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choisir" />
                    </SelectTrigger>
                    <SelectContent>
                      {universeOptions.map((u) => (
                        <SelectItem key={u.value} value={u.value}>
                          <div className="flex items-center gap-2">
                            <DynamicLucideIcon name={u.icon_name} className="h-4 w-4" />
                            <span>{u.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="admin-create-est-contact-name">
                    Contact (nom) <span className="text-slate-400">(optionnel)</span>
                  </Label>
                  <Input
                    id="admin-create-est-contact-name"
                    value={createDraft.contact_name}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, contact_name: e.target.value }))}
                    placeholder="Nom du contact"
                    autoComplete="name"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="admin-create-est-contact-phone">
                    Contact (tél) <span className="text-slate-400">(optionnel)</span>
                  </Label>
                  <Input
                    id="admin-create-est-contact-phone"
                    value={createDraft.contact_phone}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, contact_phone: e.target.value }))}
                    placeholder="+212..."
                    autoComplete="tel"
                  />
                </div>
              </div>

              {createError ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {createError}
                </div>
              ) : null}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>
                  Annuler
                </Button>
                <Button type="button" onClick={() => void handleCreate()} disabled={!canCreate || createSaving} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {createSaving ? "Création..." : "Créer"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmation de suppression */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer l'établissement</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer définitivement l'établissement <strong>{deleteConfirm?.name}</strong> ?
              <br /><br />
              Cette action est irréversible et supprimera toutes les données associées (réservations, avis, etc.).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deleting}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? "Suppression..." : "Supprimer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 md:p-6 overflow-x-auto">
        <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Ville</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-center">Badges</TableHead>
                <TableHead>Créé</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => {
                const current = (item.status ?? "").toString();
                const draft = draftStatus[item.id] ?? (current as EstablishmentStatus);
                const isSaving = savingIds.has(item.id);
                const hasChanged = draft && draft.toString() !== current;

                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-semibold">{getLabel(item)}</TableCell>
                    <TableCell className="text-sm text-slate-600">{item.city ?? ""}</TableCell>
                    <TableCell>
                      <Select
                        value={draft?.toString() ?? ""}
                        onValueChange={(v) =>
                          setDraftStatus((prev) => ({ ...prev, [item.id]: v as EstablishmentStatus }))
                        }
                      >
                        <SelectTrigger className="w-full sm:w-[140px]">
                          <SelectValue placeholder="Choisir" />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((o) => (
                            <SelectItem key={o.value.toString()} value={o.value.toString()}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 justify-center">
                        {/* Vérifié */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void handleToggleFlag(item.id, "verified", !!item.verified)}
                              disabled={isSaving}
                              className={`p-1.5 rounded-md transition ${
                                item.verified
                                  ? "bg-blue-100 text-blue-600 hover:bg-blue-200"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                              } disabled:opacity-50`}
                            >
                              <BadgeCheck className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.verified ? "Vérifié ✓" : "Non vérifié"}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Premium */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void handleToggleFlag(item.id, "premium", !!item.premium)}
                              disabled={isSaving}
                              className={`p-1.5 rounded-md transition ${
                                item.premium
                                  ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                              } disabled:opacity-50`}
                            >
                              <Crown className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.premium ? "Premium ✓" : "Non premium"}</p>
                          </TooltipContent>
                        </Tooltip>

                        {/* Curated / Sélection */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void handleToggleFlag(item.id, "curated", !!item.curated)}
                              disabled={isSaving}
                              className={`p-1.5 rounded-md transition ${
                                item.curated
                                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                              } disabled:opacity-50`}
                            >
                              <Star className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.curated ? "Sélection SAM ✓" : "Non sélectionné"}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">{formatDate(item.created_at ?? null)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1.5 justify-end">
                        {/* Bouton Voir */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              asChild
                            >
                              <Link to={`/admin/establishments/${encodeURIComponent(item.id)}`}>
                                <Eye className="h-4 w-4" />
                              </Link>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Voir les détails</TooltipContent>
                        </Tooltip>

                        {/* Bouton Activer/Désactiver */}
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="outline"
                              className={`h-8 w-8 ${
                                current === "active"
                                  ? "text-amber-600 border-amber-300 hover:bg-amber-50"
                                  : "text-emerald-600 border-emerald-300 hover:bg-emerald-50"
                              }`}
                              onClick={() => void handleToggleActive(item.id, current)}
                              disabled={loading || isSaving}
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {current === "active"
                              ? "Désactiver (suspendre)"
                              : "Activer"}
                          </TooltipContent>
                        </Tooltip>

                        {/* Bouton Supprimer (admin et superadmin) */}
                        {canDelete && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 text-red-600 border-red-300 hover:bg-red-50"
                                onClick={() => setDeleteConfirm({ id: item.id, name: getLabel(item) })}
                                disabled={loading || isSaving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Supprimer</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!visibleItems.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-slate-600">
                    Aucun établissement.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TooltipProvider>
      </div>

      {visibleItems.length > 0 && (
        <PaginationControls
          currentPage={currentPage}
          pageSize={pageSize}
          totalItems={visibleItems.length}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Dialog doublons */}
      <DuplicateEstablishmentsDialog
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        adminKey={props.adminKey}
        onDeleted={() => void refresh()}
      />
    </div>
  );
}
