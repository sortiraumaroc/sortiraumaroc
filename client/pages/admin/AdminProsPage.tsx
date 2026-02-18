import type { ColumnDef } from "@tanstack/react-table";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Copy, UsersRound, Trash2, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminApiError,
  createProUser,
  listEstablishments,
  listProUserMemberships,
  listProUsers,
  setProUserMemberships,
  suspendProUser,
  bulkDeleteProUsers,
  getProUserDependencies,
  type ProUserDependencies,
  getAdminProProfile,
  updateAdminProProfile,
  isAdminSuperadmin,
  type Establishment,
  type ProUserAdmin,
  type AdminProProfile,
  type AdminProProfileInput,
} from "@/lib/adminApi";

type ProRow = {
  id: string;
  email: string;
  establishmentsCount: number;
  establishmentIds: string[];
  cities: string[];
  universes: string[];
  establishmentStatuses: string[];
  rolesLabel: string;
  createdAt: string;
  lastSignInAt: string;
};

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function formatRoles(roles: Record<string, number> | null | undefined): string {
  if (!roles || typeof roles !== "object") return "—";
  const entries = Object.entries(roles)
    .filter(([k, v]) => k && typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!entries.length) return "—";
  return entries
    .slice(0, 3)
    .map(([k, v]) => `${k} (${v})`)
    .join(" • ");
}

function mapRow(u: ProUserAdmin, estById: Map<string, Establishment>): ProRow {
  const establishmentIds: string[] = Array.isArray((u as any).establishment_ids)
    ? ((u as any).establishment_ids as unknown[]).filter((x) => typeof x === "string") as string[]
    : [];

  const cities = new Set<string>();
  const universes = new Set<string>();
  const statuses = new Set<string>();

  for (const id of establishmentIds) {
    const est = estById.get(id);
    if (!est) continue;

    const city = typeof est.city === "string" ? est.city.trim() : "";
    if (city) cities.add(city);

    const uni = typeof est.universe === "string" ? est.universe.trim() : "";
    if (uni) universes.add(uni);

    const st = typeof est.status === "string" ? est.status.trim() : "";
    if (st) statuses.add(st);
  }

  return {
    id: String(u.id ?? ""),
    email: String(u.email ?? "").trim() || "—",
    establishmentsCount: Number.isFinite(u.establishments_count) ? Number(u.establishments_count) : 0,
    establishmentIds,
    cities: Array.from(cities).sort((a, b) => a.localeCompare(b)),
    universes: Array.from(universes).sort((a, b) => a.localeCompare(b)),
    establishmentStatuses: Array.from(statuses).sort((a, b) => a.localeCompare(b)),
    rolesLabel: formatRoles(u.roles),
    createdAt: formatLocal(u.created_at),
    lastSignInAt: formatLocal(u.last_sign_in_at),
  };
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
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("copy failed");
}

type CreateStage = "form" | "success";

type CreatedOwner = {
  email: string;
  user_id: string;
  temporary_password: string;
};

export function AdminProsPage() {
  const { toast } = useToast();
  const isSuperadmin = isAdminSuperadmin();

  const [items, setItems] = useState<ProRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createStage, setCreateStage] = useState<CreateStage>("form");
  const [createEmail, setCreateEmail] = useState("");
  const [createEstablishments, setCreateEstablishments] = useState<Establishment[]>([]);
  const [createSearch, setCreateSearch] = useState("");
  const [createSelectedEstIds, setCreateSelectedEstIds] = useState<string[]>([]);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdOwner, setCreatedOwner] = useState<CreatedOwner | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUserEmail, setEditUserEmail] = useState<string | null>(null);
  const [editEstablishments, setEditEstablishments] = useState<Establishment[]>([]);
  const [editSearch, setEditSearch] = useState("");
  const [editSelectedEstIds, setEditSelectedEstIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit Pro Profile dialog
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editProfileUserId, setEditProfileUserId] = useState<string | null>(null);
  const [editProfileData, setEditProfileData] = useState<AdminProProfile | null>(null);
  const [editProfileLoading, setEditProfileLoading] = useState(false);

  // Suspend dialog
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendUser, setSuspendUser] = useState<{ id: string; email: string } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Bulk delete
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Single delete
  const [singleDeleteUser, setSingleDeleteUser] = useState<{ id: string; email: string } | null>(null);
  const [singleDeleteOpen, setSingleDeleteOpen] = useState(false);
  const [singleDeleteDeps, setSingleDeleteDeps] = useState<ProUserDependencies | null>(null);
  const [depsLoading, setDepsLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [hasEstFilter, setHasEstFilter] = useState<"all" | "yes" | "no">("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [universeFilter, setUniverseFilter] = useState<string>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, estRes] = await Promise.all([listProUsers(undefined), listEstablishments(undefined)]);

      const estById = new Map<string, Establishment>();
      for (const e of estRes.items ?? []) {
        if (e?.id) estById.set(String(e.id), e);
      }

      const mapped = (res.items ?? []).map((u) => mapRow(u, estById));
      setItems(mapped);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!createOpen) return;

    setCreateStage("form");
    setCreateSaving(false);
    setCreateError(null);
    setCreatedOwner(null);

    void (async () => {
      try {
        const res = await listEstablishments(undefined);
        setCreateEstablishments(res.items ?? []);
      } catch (e) {
        const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
        setCreateError(msg);
      }
    })();
  }, [createOpen]);

  useEffect(() => {
    if (!editOpen || !editUserId) return;

    setEditSaving(false);
    setEditError(null);

    void (async () => {
      try {
        const [estRes, memRes] = await Promise.all([
          listEstablishments(undefined),
          listProUserMemberships(undefined, editUserId),
        ]);
        setEditEstablishments(estRes.items ?? []);
        const ids = (memRes.items ?? [])
          .map((m) => (typeof (m as any).establishment_id === "string" ? String((m as any).establishment_id) : ""))
          .filter(Boolean);
        setEditSelectedEstIds(ids);
      } catch (e) {
        const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
        setEditError(msg);
      }
    })();
  }, [editOpen, editUserId]);

  const openEdit = useCallback((row: ProRow) => {
    setEditUserId(row.id);
    setEditUserEmail(row.email);
    setEditOpen(true);
  }, []);

  const openEditProfile = useCallback(async (row: ProRow) => {
    setEditProfileUserId(row.id);
    setEditProfileOpen(true);
    setEditProfileLoading(true);
    setEditProfileData(null);

    try {
      const { profile } = await getAdminProProfile(undefined, row.id);
      setEditProfileData(profile);
    } catch (e) {
      // If profile doesn't exist, create a minimal one
      setEditProfileData({
        user_id: row.id,
        client_type: "A",
        company_name: null,
        contact_name: null,
        first_name: null,
        last_name: null,
        email: row.email !== "—" ? row.email : null,
        phone: null,
        city: row.cities[0] ?? null,
        address: null,
        postal_code: null,
        country: "Maroc",
        ice: null,
        rc: null,
        notes: null,
        establishments: [],
      });
    } finally {
      setEditProfileLoading(false);
    }
  }, []);

  const openSuspendDialog = useCallback((row: ProRow) => {
    setSuspendUser({ id: row.id, email: row.email });
    setSuspendReason("");
    setSuspendOpen(true);
  }, []);

  const confirmSuspend = useCallback(async () => {
    if (!suspendUser) return;

    setSuspendLoading(true);
    try {
      await suspendProUser(undefined, suspendUser.id, true, suspendReason || undefined);
      toast({
        title: "Compte suspendu",
        description: `Le compte ${suspendUser.email} a été suspendu.`,
      });
      setSuspendOpen(false);
      setSuspendUser(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Erreur",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSuspendLoading(false);
    }
  }, [suspendUser, suspendReason, refresh, toast]);

  const totals = useMemo(() => {
    let totalEst = 0;
    let prosWithEst = 0;
    for (const r of items) {
      totalEst += r.establishmentsCount;
      if (r.establishmentsCount > 0) prosWithEst += 1;
    }
    return { pros: items.length, prosWithEst, establishments: totalEst };
  }, [items]);

  const cityOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) for (const c of r.cities) if (c) set.add(c);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const universeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) for (const u of r.universes) if (u) set.add(u);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((r) => {
      if (hasEstFilter === "yes" && r.establishmentsCount <= 0) return false;
      if (hasEstFilter === "no" && r.establishmentsCount > 0) return false;

      if (cityFilter !== "all" && !r.cities.includes(cityFilter)) return false;
      if (universeFilter !== "all" && !r.universes.includes(universeFilter)) return false;

      if (!q) return true;
      const hay = `${r.id} ${r.email} ${r.cities.join(" ")} ${r.universes.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [cityFilter, hasEstFilter, items, search, universeFilter]);

  const toggleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredItems.map((r) => r.id));
    } else {
      setSelectedIds([]);
    }
  }, [filteredItems]);

  const toggleSelectOne = useCallback((id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const confirmBulkDelete = useCallback(async () => {
    if (selectedIds.length === 0) return;

    setDeleteLoading(true);
    try {
      const res = await bulkDeleteProUsers(undefined, selectedIds);

      if (res.deleted > 0) {
        toast({
          title: "Suppression effectuée",
          description: `${res.deleted} compte(s) supprimé(s) définitivement.${res.failed > 0 ? ` ${res.failed} échec(s).` : ""}`,
        });
      } else {
        toast({
          title: "Erreur",
          description: "Aucun compte n'a pu être supprimé.",
          variant: "destructive",
        });
      }

      setDeleteDialogOpen(false);
      setSelectedIds([]);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Erreur",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [selectedIds, refresh, toast]);

  const openSingleDeleteDialog = useCallback(async (row: ProRow) => {
    setSingleDeleteUser({ id: row.id, email: row.email });
    setSingleDeleteDeps(null);
    setSingleDeleteOpen(true);
    setDepsLoading(true);
    try {
      const res = await getProUserDependencies(undefined, row.id);
      setSingleDeleteDeps(res.deps);
    } catch {
      // Si l'API échoue, on affiche quand même le dialog sans détails
      setSingleDeleteDeps(null);
    } finally {
      setDepsLoading(false);
    }
  }, []);

  const confirmSingleDelete = useCallback(async () => {
    if (!singleDeleteUser) return;

    setDeleteLoading(true);
    try {
      const res = await bulkDeleteProUsers(undefined, [singleDeleteUser.id]);

      if (res.deleted > 0) {
        toast({
          title: "Compte supprimé",
          description: `Le compte ${singleDeleteUser.email} a été supprimé définitivement.`,
        });
      } else {
        toast({
          title: "Erreur",
          description: "Le compte n'a pas pu être supprimé.",
          variant: "destructive",
        });
      }

      setSingleDeleteOpen(false);
      setSingleDeleteUser(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Erreur",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDeleteLoading(false);
    }
  }, [singleDeleteUser, refresh, toast]);

  const columns = useMemo<ColumnDef<ProRow>[]>(() => {
    const allSelected = filteredItems.length > 0 && selectedIds.length === filteredItems.length;
    const someSelected = selectedIds.length > 0 && selectedIds.length < filteredItems.length;

    return [
      ...(isSuperadmin
        ? [
            {
              id: "select",
              header: () => (
                <Checkbox
                  checked={allSelected}
                  ref={(el: HTMLButtonElement | null) => {
                    if (el) (el as any).indeterminate = someSelected;
                  }}
                  onCheckedChange={(checked: boolean) => toggleSelectAll(!!checked)}
                  aria-label="Sélectionner tout"
                />
              ),
              cell: ({ row }: { row: { original: ProRow } }) => (
                <Checkbox
                  checked={selectedIds.includes(row.original.id)}
                  onCheckedChange={() => toggleSelectOne(row.original.id)}
                  aria-label={`Sélectionner ${row.original.email}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              ),
              enableSorting: false,
              enableHiding: false,
            } satisfies ColumnDef<ProRow>,
          ]
        : []),
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <Link to={`/admin/pros/${encodeURIComponent(row.original.id)}`} className="font-mono text-xs underline">
            {row.original.id}
          </Link>
        ),
      },
      { accessorKey: "email", header: "Email" },
      {
        accessorKey: "establishmentsCount",
        header: "Établissements",
        cell: ({ row }) => (
          <div className="tabular-nums font-semibold text-slate-900">{row.original.establishmentsCount}</div>
        ),
      },
      {
        accessorKey: "cities",
        header: "Villes",
        cell: ({ row }) => {
          const v = row.original.cities;
          return <div className="text-sm text-slate-700">{v.length ? v.slice(0, 2).join(" · ") + (v.length > 2 ? "…" : "") : "—"}</div>;
        },
      },
      {
        accessorKey: "universes",
        header: "Catégorie",
        cell: ({ row }) => {
          const v = row.original.universes;
          return <div className="text-sm text-slate-700">{v.length ? v.slice(0, 2).join(" · ") + (v.length > 2 ? "…" : "") : "—"}</div>;
        },
      },
      {
        accessorKey: "rolesLabel",
        header: "Rôles",
        cell: ({ row }) => <div className="text-sm text-slate-700">{row.original.rolesLabel}</div>,
      },
      { accessorKey: "createdAt", header: "Création" },
      { accessorKey: "lastSignInAt", header: "Dernière connexion" },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const oneEstId = row.original.establishmentIds.length === 1 ? row.original.establishmentIds[0] : null;
          const viewTo = oneEstId
            ? `/admin/establishments/${encodeURIComponent(oneEstId)}`
            : `/admin/pros/${encodeURIComponent(row.original.id)}`;

          return (
            <div className="flex justify-end">
              <div className="grid grid-cols-2 gap-1.5 w-[170px]">
                <Button size="sm" variant="outline" asChild className="w-full justify-center text-xs">
                  <Link to={viewTo}>Voir</Link>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full justify-center text-xs"
                  onClick={() => void openEditProfile(row.original)}
                >
                  Profil
                </Button>
                <Button size="sm" variant="outline" className="w-full justify-center text-xs" onClick={() => openEdit(row.original)}>
                  Attribuer
                </Button>
                {isSuperadmin && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full justify-center text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => openSingleDeleteDialog(row.original)}
                  >
                    Supprimer
                  </Button>
                )}
              </div>
            </div>
          );
        },
      },
    ];
  }, [isSuperadmin, openEdit, openEditProfile, openSingleDeleteDialog, filteredItems, selectedIds, toggleSelectAll, toggleSelectOne]);

  const filteredCreateEstablishments = useMemo(() => {
    const q = createSearch.trim().toLowerCase();
    if (!q) return createEstablishments;

    return createEstablishments.filter((e) => {
      const hay = `${e.name ?? ""} ${e.title ?? ""} ${e.city ?? ""} ${e.id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [createEstablishments, createSearch]);

  const toggleCreateEstablishment = useCallback((id: string) => {
    setCreateSelectedEstIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const canCreate = useMemo(() => {
    const email = createEmail.trim().toLowerCase();
    return email.includes("@") && !createSaving;
  }, [createEmail, createSaving]);

  const canCreateWithEstablishments = useMemo(() => {
    return canCreate && createSelectedEstIds.length > 0;
  }, [canCreate, createSelectedEstIds.length]);

  const submitCreate = useCallback(async (skipEstablishments = false) => {
    const email = createEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setCreateError("Email invalide");
      return;
    }

    const establishmentIds = skipEstablishments ? [] : createSelectedEstIds;

    setCreateSaving(true);
    setCreateError(null);

    try {
      const res = await createProUser(undefined, {
        email,
        establishment_ids: establishmentIds,
        role: "owner",
      });
      setCreatedOwner(res.owner);
      setCreateStage("success");
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setCreateError(e.message);
      else setCreateError("Erreur inattendue");
    } finally {
      setCreateSaving(false);
    }
  }, [createEmail, createSelectedEstIds, refresh]);

  const filteredEditEstablishments = useMemo(() => {
    const q = editSearch.trim().toLowerCase();
    if (!q) return editEstablishments;

    return editEstablishments.filter((e) => {
      const hay = `${e.name ?? ""} ${e.title ?? ""} ${e.city ?? ""} ${e.id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [editEstablishments, editSearch]);

  const toggleEditEstablishment = useCallback((id: string) => {
    setEditSelectedEstIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const canSaveEdit = useMemo(() => {
    return !!editUserId && editSelectedEstIds.length > 0 && !editSaving;
  }, [editSaving, editSelectedEstIds.length, editUserId]);

  const submitEdit = useCallback(async () => {
    if (!editUserId) return;
    if (!editSelectedEstIds.length) {
      setEditError("Choisissez au moins 1 établissement");
      return;
    }

    setEditSaving(true);
    setEditError(null);

    try {
      await setProUserMemberships(undefined, editUserId, {
        establishment_ids: editSelectedEstIds,
        role: "owner",
      });
      toast({ title: "Sauvé", description: "Attributions mises à jour" });
      setEditOpen(false);
      await refresh();
    } catch (e) {
      if (e instanceof AdminApiError) setEditError(e.message);
      else setEditError("Erreur inattendue");
    } finally {
      setEditSaving(false);
    }
  }, [editSelectedEstIds, editUserId, refresh, toast]);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Pros"
        description="Univers Pro (B2B) vu depuis le superadmin : comptes, établissements, réservations, packs, QR, conversations."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="px-3"
              onClick={() => setCreateOpen(true)}
              aria-label="Ajouter un client Pro"
            >
              +
            </Button>
            <RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void refresh()} />
          </div>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-primary" />
              Comptes Pro
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">{totals.pros}</div>
            <div className="text-xs text-slate-500 mt-1">{totals.prosWithEst} avec établissement · {Math.max(0, totals.pros - totals.prosWithEst)} sans</div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-xs font-semibold text-slate-600 flex items-center gap-2">
              <Badge className="bg-slate-50 text-slate-700 border-slate-200">B2B</Badge>
              Établissements rattachés
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-2xl font-extrabold tabular-nums text-slate-900">{totals.establishments}</div>
            <div className="text-xs text-slate-500 mt-1">somme des accès par compte Pro</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm">Filtres</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Recherche</div>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="email, id, ville…" />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-slate-600">Établissements</div>
              <Select value={hasEstFilter} onValueChange={(v) => setHasEstFilter(v as "all" | "yes" | "no")}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="yes">Avec établissement</SelectItem>
                  <SelectItem value="no">Sans établissement</SelectItem>
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
                  {universeOptions.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">{filteredItems.length} résultat(s)</div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch("");
                setHasEstFilter("all");
                setCityFilter("all");
                setUniverseFilter("all");
              }}
            >
              Réinitialiser
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold text-slate-900">Comptes Pro</div>
          <div className="text-xs text-slate-500">{filteredItems.length} compte(s)</div>
        </div>

        {/* Barre d'actions de sélection */}
        {isSuperadmin && selectedIds.length > 0 && (
          <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3">
            <div className="text-sm text-red-800">
              <span className="font-semibold">{selectedIds.length}</span> compte(s) sélectionné(s)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedIds([])}
              >
                Désélectionner
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => setDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer définitivement
              </Button>
            </div>
          </div>
        )}

        <AdminDataTable data={filteredItems} columns={columns} searchPlaceholder="Rechercher dans la table…" />
      </div>

      {/* Dialog de confirmation de suppression en masse */}
      <Dialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleteLoading) {
            setDeleteDialogOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer définitivement</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de supprimer définitivement{" "}
              <span className="font-semibold">{selectedIds.length}</span> compte(s) Pro.
              <br /><br />
              Cette action est <span className="font-semibold text-red-600">irréversible</span>.
              Les comptes seront supprimés de la base de données ainsi que toutes leurs associations avec les établissements.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Attention :</strong> Cette action ne peut pas être annulée.
            Les utilisateurs ne pourront plus accéder à leur compte et toutes les données seront perdues.
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteLoading}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmBulkDelete()}
              disabled={deleteLoading}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 me-2" />
                  Supprimer {selectedIds.length} compte(s)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateEmail("");
            setCreateSearch("");
            setCreateSelectedEstIds([]);
            setCreateStage("form");
            setCreateSaving(false);
            setCreateError(null);
            setCreatedOwner(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {createStage === "success" && createdOwner ? (
            <>
              <DialogHeader>
                <DialogTitle>Compte Pro créé</DialogTitle>
                <DialogDescription>
                  À transmettre au client. Le mot de passe ne sera plus affiché une fois la fenêtre fermée.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">Email</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="font-mono text-sm text-slate-900 break-all">{createdOwner.email}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        void (async () => {
                          try {
                            await copyToClipboard(createdOwner.email);
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
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">Mot de passe provisoire</div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="font-mono text-sm text-slate-900 break-all">{createdOwner.temporary_password}</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => {
                        void (async () => {
                          try {
                            await copyToClipboard(createdOwner.temporary_password);
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

                <div className="text-xs text-slate-500">
                  Établissements attribués : <span className="font-semibold">{createSelectedEstIds.length}</span>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Fermer
                </Button>
                <Button asChild>
                  <Link to={`/admin/pros/${encodeURIComponent(createdOwner.user_id)}`}>Voir le compte</Link>
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Ajouter un client Pro</DialogTitle>
                <DialogDescription>
                  Crée un compte Pro (email + mot de passe provisoire) et attribue un ou plusieurs établissements.
                </DialogDescription>
              </DialogHeader>

              {createError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{createError}</div>
              ) : null}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pro_email">Email</Label>
                  <Input
                    id="pro_email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    placeholder="ex: contact@restaurant.com"
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pro_est_search">Établissements à attribuer</Label>
                    <div className="text-xs text-slate-500">{createSelectedEstIds.length} sélectionné(s)</div>
                  </div>
                  <Input
                    id="pro_est_search"
                    value={createSearch}
                    onChange={(e) => setCreateSearch(e.target.value)}
                    placeholder="Rechercher (nom, ville, id)…"
                    autoComplete="off"
                  />

                  <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
                    {filteredCreateEstablishments.length ? (
                      <div className="divide-y">
                        {filteredCreateEstablishments.map((e) => {
                          const id = String(e.id ?? "");
                          const checked = createSelectedEstIds.includes(id);
                          const label = String(e.name ?? e.title ?? e.id ?? "").trim() || id;
                          const city = String(e.city ?? "").trim();
                          const status = String(e.status ?? "").trim();
                          return (
                            <div
                              key={id}
                              role="button"
                              tabIndex={0}
                              className="w-full text-start p-3 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
                              onClick={() => toggleCreateEstablishment(id)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  toggleCreateEstablishment(id);
                                }
                              }}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleCreateEstablishment(id)}
                                onClick={(ev) => ev.stopPropagation()}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-slate-900 truncate">{label}</div>
                                <div className="text-xs text-slate-500 truncate">
                                  {city ? city : "—"} · <span className="font-mono">{id.slice(0, 8)}</span>
                                </div>
                              </div>
                              {status ? (
                                <Badge className="bg-slate-50 text-slate-700 border-slate-200">{status}</Badge>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-sm text-slate-600">Aucun établissement trouvé.</div>
                    )}
                  </div>

                  <div className="text-xs text-slate-500">
                    {createSelectedEstIds.length === 0
                      ? "Vous pouvez ignorer cette étape et attribuer des établissements plus tard."
                      : `${createSelectedEstIds.length} établissement(s) sélectionné(s).`}
                  </div>
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSaving}>
                  Annuler
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void submitCreate(true)}
                  disabled={!canCreate}
                  className="text-slate-600"
                >
                  {createSaving ? "Création…" : "Ignorer pour l'instant"}
                </Button>
                <Button onClick={() => void submitCreate(false)} disabled={!canCreateWithEstablishments} className="gap-2">
                  <UsersRound className="h-4 w-4" />
                  {createSaving ? "Création…" : "Créer"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditUserId(null);
            setEditUserEmail(null);
            setEditSearch("");
            setEditSelectedEstIds([]);
            setEditSaving(false);
            setEditError(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Modifier les établissements</DialogTitle>
            <DialogDescription>
              {editUserEmail ? (
                <>
                  Compte : <span className="font-semibold">{editUserEmail}</span>
                </>
              ) : (
                "Attribuez un ou plusieurs établissements à ce compte Pro."
              )}
            </DialogDescription>
          </DialogHeader>

          {editError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{editError}</div>
          ) : null}

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit_est_search">Établissements attribués</Label>
                <div className="text-xs text-slate-500">{editSelectedEstIds.length} sélectionné(s)</div>
              </div>
              <Input
                id="edit_est_search"
                value={editSearch}
                onChange={(e) => setEditSearch(e.target.value)}
                placeholder="Rechercher (nom, ville, id)…"
                autoComplete="off"
              />

              <div className="max-h-64 overflow-auto rounded-md border border-slate-200">
                {filteredEditEstablishments.length ? (
                  <div className="divide-y">
                    {filteredEditEstablishments.map((e) => {
                      const id = String(e.id ?? "");
                      const checked = editSelectedEstIds.includes(id);
                      const label = String(e.name ?? e.title ?? e.id ?? "").trim() || id;
                      const city = String(e.city ?? "").trim();
                      const status = String(e.status ?? "").trim();
                      return (
                        <div
                          key={id}
                          role="button"
                          tabIndex={0}
                          className="w-full text-start p-3 hover:bg-slate-50 flex items-center gap-3 cursor-pointer"
                          onClick={() => toggleEditEstablishment(id)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter" || ev.key === " ") {
                              ev.preventDefault();
                              toggleEditEstablishment(id);
                            }
                          }}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleEditEstablishment(id)}
                            onClick={(ev) => ev.stopPropagation()}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-slate-900 truncate">{label}</div>
                            <div className="text-xs text-slate-500 truncate">
                              {city ? city : "—"} · <span className="font-mono">{id.slice(0, 8)}</span>
                            </div>
                          </div>
                          {status ? (
                            <Badge className="bg-slate-50 text-slate-700 border-slate-200">{status}</Badge>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-slate-600">Aucun établissement trouvé.</div>
                )}
              </div>

              <div className="text-xs text-slate-500">Choisir au moins 1 établissement.</div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Annuler
            </Button>
            <Button onClick={() => void submitEdit()} disabled={!canSaveEdit}>
              {editSaving ? "Sauvegarde…" : "Sauver"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pour éditer le profil Pro */}
      <EditProProfileDialog
        open={editProfileOpen}
        profile={editProfileData}
        loading={editProfileLoading}
        onClose={() => {
          setEditProfileOpen(false);
          setEditProfileData(null);
          setEditProfileUserId(null);
        }}
        onSaved={() => {
          setEditProfileOpen(false);
          setEditProfileData(null);
          setEditProfileUserId(null);
          toast({ title: "Profil Pro mis à jour" });
        }}
      />

      {/* Dialog pour suspendre un compte Pro */}
      <Dialog
        open={suspendOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSuspendOpen(false);
            setSuspendUser(null);
            setSuspendReason("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Suspendre le compte Pro</DialogTitle>
            <DialogDescription>
              {suspendUser ? (
                <>
                  Vous êtes sur le point de suspendre le compte{" "}
                  <span className="font-semibold">{suspendUser.email}</span>.
                  <br />
                  L'utilisateur ne pourra plus se connecter à son espace Pro.
                </>
              ) : (
                "Confirmer la suspension du compte."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="suspend_reason">Raison de la suspension (optionnel)</Label>
              <Textarea
                id="suspend_reason"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Ex: Non-paiement, Violation des conditions d'utilisation..."
                rows={3}
              />
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>Attention :</strong> Cette action empêchera l'utilisateur de se connecter.
              Vous pourrez réactiver le compte ultérieurement si nécessaire.
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSuspendOpen(false);
                setSuspendUser(null);
                setSuspendReason("");
              }}
              disabled={suspendLoading}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmSuspend()}
              disabled={suspendLoading}
            >
              {suspendLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  Suspension...
                </>
              ) : (
                "Confirmer la suspension"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog pour supprimer un compte Pro individuel */}
      <Dialog
        open={singleDeleteOpen}
        onOpenChange={(open) => {
          if (!open) {
            setSingleDeleteOpen(false);
            setSingleDeleteUser(null);
            setSingleDeleteDeps(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Supprimer le compte Pro</DialogTitle>
            <DialogDescription>
              {singleDeleteUser ? (
                <>
                  Vous êtes sur le point de supprimer définitivement le compte{" "}
                  <span className="font-semibold">{singleDeleteUser.email}</span>.
                </>
              ) : (
                "Confirmer la suppression du compte."
              )}
            </DialogDescription>
          </DialogHeader>

          {depsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Vérification des données rattachées...
            </div>
          ) : singleDeleteDeps && (singleDeleteDeps.media_quotes > 0 || singleDeleteDeps.media_invoices > 0 || singleDeleteDeps.establishment_memberships > 0) ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <strong>Des données sont rattachées à ce compte :</strong>
                  <ul className="list-disc list-inside mt-1 space-y-0.5">
                    {singleDeleteDeps.media_quotes > 0 && (
                      <li>{singleDeleteDeps.media_quotes} devis</li>
                    )}
                    {singleDeleteDeps.media_invoices > 0 && (
                      <li>{singleDeleteDeps.media_invoices} facture{singleDeleteDeps.media_invoices > 1 ? "s" : ""}</li>
                    )}
                    {singleDeleteDeps.establishment_memberships > 0 && (
                      <li>{singleDeleteDeps.establishment_memberships} accès établissement{singleDeleteDeps.establishment_memberships > 1 ? "s" : ""}</li>
                    )}
                  </ul>
                  <p className="mt-2 font-medium">
                    Toutes ces données seront supprimées définitivement.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Attention :</strong> Cette action est irréversible. Le compte, son profil et
            tous ses accès seront supprimés définitivement.
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSingleDeleteOpen(false);
                setSingleDeleteUser(null);
                setSingleDeleteDeps(null);
              }}
              disabled={deleteLoading}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmSingleDelete()}
              disabled={deleteLoading || depsLoading}
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin me-2" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 me-2" />
                  Supprimer définitivement
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Pro Profile Dialog
// ---------------------------------------------------------------------------

type EditProProfileDialogProps = {
  open: boolean;
  profile: AdminProProfile | null;
  loading: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function EditProProfileDialog({
  open,
  profile,
  loading,
  onClose,
  onSaved,
}: EditProProfileDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("Maroc");
  const [ice, setIce] = useState("");
  const [rc, setRc] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open || !profile) return;
    setCompanyName(profile.company_name ?? "");
    setFirstName(profile.first_name ?? "");
    setLastName(profile.last_name ?? "");
    setContactName(profile.contact_name ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setAddress(profile.address ?? "");
    setPostalCode(profile.postal_code ?? "");
    setCity(profile.city ?? "");
    setCountry(profile.country ?? "Maroc");
    setIce(profile.ice ?? "");
    setRc(profile.rc ?? "");
    setNotes(profile.notes ?? "");
  }, [open, profile]);

  const handleSave = async () => {
    if (!profile || saving) return;

    setSaving(true);
    try {
      const input: AdminProProfileInput = {
        company_name: companyName.trim() || null,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        contact_name: contactName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        address: address.trim() || null,
        postal_code: postalCode.trim() || null,
        city: city.trim() || null,
        country: country.trim() || null,
        ice: ice.trim() || null,
        rc: rc.trim() || null,
        notes: notes.trim() || null,
      };

      await updateAdminProProfile(undefined, profile.user_id, input);
      onSaved();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier le profil Pro</DialogTitle>
          <DialogDescription>
            Informations de l'entreprise pour la facturation
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : profile ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Raison sociale / Nom entreprise</Label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: SARL Mon Entreprise"
                />
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contact@entreprise.ma"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Prénom du contact</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prénom"
                />
              </div>

              <div className="space-y-2">
                <Label>Nom du contact</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nom"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nom du contact (ancien champ)</Label>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Nom complet"
                />
                <p className="text-xs text-slate-500">Utilisé si prénom/nom non renseignés</p>
              </div>

              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+212 6XX XXX XXX"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Adresse</Label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Adresse complète"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Code postal</Label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="20000"
                />
              </div>

              <div className="space-y-2">
                <Label>Ville</Label>
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Casablanca"
                />
              </div>

              <div className="space-y-2">
                <Label>Pays</Label>
                <Input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Maroc"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>ICE</Label>
                <Input
                  value={ice}
                  onChange={(e) => setIce(e.target.value)}
                  placeholder="Identifiant Commun de l'Entreprise"
                />
              </div>

              <div className="space-y-2">
                <Label>RC</Label>
                <Input
                  value={rc}
                  onChange={(e) => setRc(e.target.value)}
                  placeholder="Registre du Commerce"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes internes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes visibles uniquement par l'équipe"
                rows={2}
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving || loading}>
            Annuler
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || loading || !profile}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
