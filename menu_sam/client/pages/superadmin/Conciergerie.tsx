import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";

import { SuperadminShell } from "@/components/superadmin/superadmin-shell";
import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

import {
  Building2,
  Plus,
  ArrowLeft,
  UserPlus,
  Trash2,
  Pencil,
  Loader2,
  Search,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ConciergeRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  commission_rate: number;
  status: string;
  establishment_id: string | null;
  establishment_name?: string | null;
  created_at: string;
  user_count?: number;
  journey_count?: number;
};

type ConciergeUserRow = {
  id: string;
  concierge_id: string;
  user_id: string;
  role: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
};

type EstablishmentResult = {
  id: string;
  name: string;
  city: string | null;
  universe: string | null;
  subcategory: string | null;
  email: string | null;
  phone: string | null;
  slug: string | null;
  status: string;
};

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_access_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api/superadmin${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erreur serveur");
  return data as T;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  hotel: "H\u00f4tel",
  riad: "Riad",
  agency: "Agence",
  other: "Autre",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400",
  pending: "bg-amber-500/20 text-amber-400",
  suspended: "bg-red-500/20 text-red-400",
};

export default function SuperadminConciergerie() {
  const { state, signOut } = useSuperadminSession();
  const subtitle =
    state.status === "signedIn" ? `Connect\u00e9 : ${state.email ?? ""}` : "";

  // State
  const [concierges, setConcierges] = useState<ConciergeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detail view
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    concierge: ConciergeRow;
    users: ConciergeUserRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<EstablishmentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEstablishment, setSelectedEstablishment] = useState<EstablishmentResult | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Other dialogs
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // ---------------------------------------------------------------------------
  // Fetch list
  // ---------------------------------------------------------------------------

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ concierges: ConciergeRow[] }>(
        "/conciergeries"
      );
      setConcierges(data.concierges);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (state.status === "signedIn") fetchList();
  }, [state.status, fetchList]);

  // ---------------------------------------------------------------------------
  // Fetch detail
  // ---------------------------------------------------------------------------

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const data = await apiFetch<{
        concierge: ConciergeRow;
        users: ConciergeUserRow[];
      }>(`/conciergeries/${id}`);
      setDetail(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Search establishments (debounced)
  // ---------------------------------------------------------------------------

  const searchEstablishments = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await apiFetch<{ establishments: EstablishmentResult[] }>(
        `/establishments/search?q=${encodeURIComponent(q)}`
      );
      setSearchResults(data.establishments);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(() => {
      searchEstablishments(searchQuery);
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery, searchEstablishments]);

  // ---------------------------------------------------------------------------
  // Create conciergerie from establishment
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!selectedEstablishment) return;
    setSaving(true);
    try {
      await apiFetch("/conciergeries", {
        method: "POST",
        body: JSON.stringify({
          establishment_id: selectedEstablishment.id,
          commission_rate: 10,
        }),
      });
      setShowCreate(false);
      setSelectedEstablishment(null);
      setSearchQuery("");
      setSearchResults([]);
      fetchList();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Edit conciergerie
  // ---------------------------------------------------------------------------

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!detail) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/conciergeries/${detail.concierge.id}`, {
        method: "PUT",
        body: JSON.stringify({
          commission_rate: Number(fd.get("commission_rate")) || 10,
          status: fd.get("status"),
        }),
      });
      setShowEdit(false);
      openDetail(detail.concierge.id);
      fetchList();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Add user
  // ---------------------------------------------------------------------------

  const handleAddUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/conciergeries/${selectedId}/users`, {
        method: "POST",
        body: JSON.stringify({
          email: fd.get("email"),
          password: fd.get("password"),
          first_name: fd.get("first_name"),
          last_name: fd.get("last_name"),
          role: fd.get("role"),
        }),
      });
      setShowAddUser(false);
      openDetail(selectedId);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Remove user
  // ---------------------------------------------------------------------------

  const handleRemoveUser = async (cuId: string) => {
    if (!selectedId) return;
    if (!confirm("Supprimer cet utilisateur de la conciergerie ?")) return;
    try {
      await apiFetch(`/conciergeries/${selectedId}/users/${cuId}`, {
        method: "DELETE",
      });
      openDetail(selectedId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ---------------------------------------------------------------------------
  // Render — Detail view
  // ---------------------------------------------------------------------------

  if (selectedId) {
    return (
      <SuperadminShell
        title="Conciergerie"
        subtitle={subtitle}
        onSignOut={() => void signOut()}
      >
        <div className="space-y-6">
          <Button
            variant="ghost"
            className="text-white/70 hover:text-white"
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>

          {detailLoading ? (
            <div className="flex items-center gap-2 text-white/60">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement...
            </div>
          ) : detail ? (
            <>
              {/* Concierge info card */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-semibold">{detail.concierge.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/60">
                      <span>{TYPE_LABELS[detail.concierge.type] ?? detail.concierge.type}</span>
                      {detail.concierge.city && <span>&middot; {detail.concierge.city}</span>}
                      {detail.concierge.email && <span>&middot; {detail.concierge.email}</span>}
                      {detail.concierge.phone && <span>&middot; {detail.concierge.phone}</span>}
                    </div>
                    <div className="mt-1 text-sm text-white/40">
                      Commission : {detail.concierge.commission_rate}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={STATUS_COLORS[detail.concierge.status] ?? "bg-white/10 text-white/60"}
                    >
                      {detail.concierge.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-white/20 text-white hover:bg-white/10"
                      onClick={() => setShowEdit(true)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Modifier
                    </Button>
                  </div>
                </div>
              </div>

              {/* Users */}
              <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    Utilisateurs ({detail.users.length})
                  </div>
                  <Button
                    size="sm"
                    className="bg-sam-red hover:bg-sam-red/80"
                    onClick={() => setShowAddUser(true)}
                  >
                    <UserPlus className="mr-1 h-3 w-3" />
                    Ajouter
                  </Button>
                </div>

                {detail.users.length === 0 ? (
                  <div className="mt-4 text-sm text-white/40">
                    Aucun utilisateur. Ajoutez-en un pour permettre la connexion.
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {detail.users.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 px-4 py-3"
                      >
                        <div>
                          <div className="text-sm font-medium">
                            {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Sans nom"}
                          </div>
                          <div className="text-xs text-white/50">
                            {u.email} &middot; {u.role}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
                          onClick={() => handleRemoveUser(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Edit dialog */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="border-white/10 bg-zinc-900 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier la conciergerie</DialogTitle>
              <DialogDescription className="text-white/50">
                Ajustez la commission et le statut.
              </DialogDescription>
            </DialogHeader>
            {detail && (
              <form onSubmit={handleEdit} className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="text-sm font-medium">{detail.concierge.name}</div>
                  <div className="text-xs text-white/50">
                    {detail.concierge.city ?? ""} &middot; {TYPE_LABELS[detail.concierge.type] ?? detail.concierge.type}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Commission (%)</Label>
                    <Input name="commission_rate" type="number" step="0.5" defaultValue={detail.concierge.commission_rate} className="mt-1 border-white/10 bg-white/5" />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      name="status"
                      defaultValue={detail.concierge.status}
                      className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                    >
                      <option value="active">Actif</option>
                      <option value="pending">En attente</option>
                      <option value="suspended">Suspendu</option>
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-sam-red hover:bg-sam-red/80" disabled={saving}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Enregistrer
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Add user dialog */}
        <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
          <DialogContent className="border-white/10 bg-zinc-900 text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter un utilisateur</DialogTitle>
              <DialogDescription className="text-white/50">
                Creez un nouveau compte pour acceder a l'espace Conciergerie.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Prenom</Label>
                  <Input name="first_name" className="mt-1 border-white/10 bg-white/5" />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input name="last_name" className="mt-1 border-white/10 bg-white/5" />
                </div>
              </div>
              <div>
                <Label>Email *</Label>
                <Input name="email" type="email" required className="mt-1 border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Mot de passe *</Label>
                <Input name="password" type="password" required minLength={8} className="mt-1 border-white/10 bg-white/5" />
              </div>
              <div>
                <Label>Role</Label>
                <select
                  name="role"
                  defaultValue="admin"
                  className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
                >
                  <option value="admin">Admin</option>
                  <option value="operator">Operateur</option>
                </select>
              </div>
              <Button type="submit" className="w-full bg-sam-red hover:bg-sam-red/80" disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Creer l'utilisateur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </SuperadminShell>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — List view
  // ---------------------------------------------------------------------------

  return (
    <SuperadminShell
      title="Conciergerie"
      subtitle={subtitle}
      onSignOut={() => void signOut()}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Gestion des conciergeries</div>
            <div className="mt-1 text-sm text-white/60">
              Activez l'espace Conciergerie pour vos etablissements partenaires.
            </div>
          </div>
          <Button
            className="bg-sam-red hover:bg-sam-red/80"
            onClick={() => {
              setShowCreate(true);
              setSelectedEstablishment(null);
              setSearchQuery("");
              setSearchResults([]);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nouvelle conciergerie
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </div>
        ) : concierges.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center">
            <Building2 className="mx-auto h-10 w-10 text-white/20" />
            <div className="mt-3 text-sm text-white/40">
              Aucune conciergerie. Cliquez sur &laquo; Nouvelle conciergerie &raquo; pour activer un etablissement.
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-white/5">
                <tr>
                  <th className="px-4 py-3 font-medium text-white/70">Etablissement</th>
                  <th className="px-4 py-3 font-medium text-white/70">Type</th>
                  <th className="px-4 py-3 font-medium text-white/70">Ville</th>
                  <th className="px-4 py-3 font-medium text-white/70">Status</th>
                  <th className="px-4 py-3 font-medium text-white/70 text-center">Utilisateurs</th>
                  <th className="px-4 py-3 font-medium text-white/70 text-center">Parcours</th>
                  <th className="px-4 py-3 font-medium text-white/70">Commission</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {concierges.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer transition-colors hover:bg-white/5"
                    onClick={() => openDetail(c.id)}
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-white/60">
                      {TYPE_LABELS[c.type] ?? c.type}
                    </td>
                    <td className="px-4 py-3 text-white/60">{c.city ?? "\u2014"}</td>
                    <td className="px-4 py-3">
                      <Badge className={STATUS_COLORS[c.status] ?? "bg-white/10 text-white/60"}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-white/60">
                      {c.user_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center text-white/60">
                      {c.journey_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-white/60">{c.commission_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create dialog — Search & select establishment */}
      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          setShowCreate(open);
          if (!open) {
            setSelectedEstablishment(null);
            setSearchQuery("");
            setSearchResults([]);
          }
        }}
      >
        <DialogContent className="border-white/10 bg-zinc-900 text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle conciergerie</DialogTitle>
            <DialogDescription className="text-white/50">
              Recherchez un etablissement existant pour lui activer l'espace Conciergerie.
            </DialogDescription>
          </DialogHeader>

          {!selectedEstablishment ? (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <Input
                  placeholder="Rechercher un etablissement..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-white/10 bg-white/5 pl-10"
                  autoFocus
                />
              </div>

              {/* Results */}
              {searching ? (
                <div className="flex items-center gap-2 py-4 text-sm text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recherche...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {searchResults.map((est) => (
                    <button
                      key={est.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-left transition-colors hover:bg-white/10"
                      onClick={() => setSelectedEstablishment(est)}
                    >
                      <Building2 className="h-5 w-5 shrink-0 text-white/30" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{est.name}</div>
                        <div className="truncate text-xs text-white/50">
                          {[est.city, est.universe, est.subcategory].filter(Boolean).join(" \u00b7 ")}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="py-4 text-center text-sm text-white/40">
                  Aucun etablissement trouv&eacute;.
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-white/40">
                  Tapez au moins 2 caracteres pour rechercher.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected establishment preview */}
              <div className="rounded-xl border border-sam-red/30 bg-sam-red/5 p-4">
                <div className="text-sm font-semibold">{selectedEstablishment.name}</div>
                <div className="mt-1 text-xs text-white/60">
                  {[selectedEstablishment.city, selectedEstablishment.universe, selectedEstablishment.subcategory].filter(Boolean).join(" \u00b7 ")}
                </div>
                {selectedEstablishment.email && (
                  <div className="mt-1 text-xs text-white/40">{selectedEstablishment.email}</div>
                )}
              </div>

              <div className="text-sm text-white/60">
                La conciergerie portera le nom de cet etablissement. Les utilisateurs pro rattaches seront automatiquement lies.
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  onClick={() => setSelectedEstablishment(null)}
                >
                  Changer
                </Button>
                <Button
                  className="flex-1 bg-sam-red hover:bg-sam-red/80"
                  onClick={handleCreate}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Activer la conciergerie
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </SuperadminShell>
  );
}
