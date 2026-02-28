/**
 * AdminConciergerieDashboard — Gestion des conciergeries dans l'admin principal.
 *
 * Migré depuis menu_sam/client/pages/superadmin/Conciergerie.tsx.
 * Fonctionnalités : lister, créer (depuis établissement), éditer, ajouter/supprimer users.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Plus,
  ArrowLeft,
  UserPlus,
  Trash2,
  Pencil,
  Loader2,
  Search,
  Landmark,
  RefreshCw,
  Handshake,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  listAdminConciergeries,
  getAdminConciergerie,
  createAdminConciergerie,
  updateAdminConciergerie,
  updateAdminConciergerieCities,
  deleteAdminConciergerie,
  addAdminConciergerieUser,
  removeAdminConciergerieUser,
  listAdminConciergeriePartners,
  createAdminConciergeriePartner,
  updateAdminConciergeriePartner,
  deleteAdminConciergeriePartner,
  searchEstablishmentsByName,
  AdminApiError,
} from "@/lib/adminApi";
import type {
  AdminConciergeRow,
  AdminConciergeUserRow,
  AdminConciergePartnerRow,
} from "@/lib/adminApi";

// =============================================================================
// Constants
// =============================================================================

const TYPE_LABELS: Record<string, string> = {
  hotel: "Hôtel",
  riad: "Riad",
  agency: "Agence",
  other: "Autre",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  suspended: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  pending: "En attente",
  suspended: "Suspendu",
};

// =============================================================================
// Component
// =============================================================================

export function AdminConciergerieDashboard() {
  const { toast } = useToast();

  // ── List state ──
  const [concierges, setConcierges] = useState<AdminConciergeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Detail view ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    concierge: AdminConciergeRow;
    users: AdminConciergeUserRow[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Create dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ id: string; name: string; city: string | null }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [selectedEstablishment, setSelectedEstablishment] = useState<{
    id: string;
    name: string;
    city: string | null;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Edit dialog ──
  const [showEdit, setShowEdit] = useState(false);
  const [editCommission, setEditCommission] = useState(10);
  const [editStatus, setEditStatus] = useState("active");

  // ── Add user dialog ──
  const [showAddUser, setShowAddUser] = useState(false);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserPassword, setAddUserPassword] = useState("");
  const [addUserFirstName, setAddUserFirstName] = useState("");
  const [addUserLastName, setAddUserLastName] = useState("");
  const [addUserRole, setAddUserRole] = useState("admin");

  // ── Delete user ──
  const [deleteUser, setDeleteUser] = useState<AdminConciergeUserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ── Delete conciergerie ──
  const [deleteConcierge, setDeleteConcierge] = useState<AdminConciergeRow | null>(null);
  const [deletingConcierge, setDeletingConcierge] = useState(false);

  // ── Partners ──
  const [partners, setPartners] = useState<AdminConciergePartnerRow[]>([]);
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState("");
  const [partnerSearchResults, setPartnerSearchResults] = useState<
    Array<{ id: string; name: string; city: string | null }>
  >([]);
  const [partnerSearching, setPartnerSearching] = useState(false);
  const [selectedPartnerEst, setSelectedPartnerEst] = useState<{
    id: string;
    name: string;
    city: string | null;
  } | null>(null);
  const [partnerCommission, setPartnerCommission] = useState(10);
  const [partnerAdminShare, setPartnerAdminShare] = useState(30);
  const [partnerConciergeShare, setPartnerConciergeShare] = useState(70);
  const [partnerNotes, setPartnerNotes] = useState("");
  const [editPartner, setEditPartner] = useState<AdminConciergePartnerRow | null>(null);
  const [deletePartnerTarget, setDeletePartnerTarget] = useState<AdminConciergePartnerRow | null>(null);
  const [deletingPartner, setDeletingPartner] = useState(false);
  const partnerSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Allowed cities ──
  const [allowedCities, setAllowedCities] = useState<string[]>([]);
  const [newCityInput, setNewCityInput] = useState("");
  const [savingCities, setSavingCities] = useState(false);

  // ── Fetch list ──
  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminConciergeries();
      setConcierges(res.concierges ?? []);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // ── Fetch detail ──
  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const [detailRes, partnersRes] = await Promise.all([
        getAdminConciergerie(undefined, id),
        listAdminConciergeriePartners(undefined, id),
      ]);
      setDetail(detailRes);
      setPartners(partnersRes.partners ?? []);
      setAllowedCities((detailRes as any).allowed_cities ?? []);
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : "Erreur de chargement");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ── Search establishments (debounced) ──
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchEstablishmentsByName(searchQuery.trim());
        setSearchResults(
          (res.items ?? []).map((e) => ({ id: e.id, name: e.name, city: e.city })),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // ── Create handler ──
  const handleCreate = async () => {
    if (!selectedEstablishment) return;
    setSaving(true);
    try {
      await createAdminConciergerie(undefined, {
        establishment_id: selectedEstablishment.id,
        commission_rate: 10,
      });
      toast({ title: "Conciergerie créée" });
      setShowCreate(false);
      setSelectedEstablishment(null);
      setSearchQuery("");
      setSearchResults([]);
      void fetchList();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Edit handler ──
  const openEdit = () => {
    if (!detail) return;
    setEditCommission(detail.concierge.commission_rate);
    setEditStatus(detail.concierge.status);
    setShowEdit(true);
  };

  const handleEdit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await updateAdminConciergerie(undefined, detail.concierge.id, {
        commission_rate: editCommission,
        status: editStatus,
      });
      toast({ title: "Conciergerie modifiée" });
      setShowEdit(false);
      void openDetail(detail.concierge.id);
      void fetchList();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Add user handler ──
  const handleAddUser = async () => {
    if (!selectedId || !addUserEmail || !addUserPassword) return;
    setSaving(true);
    try {
      await addAdminConciergerieUser(undefined, selectedId, {
        email: addUserEmail,
        password: addUserPassword,
        first_name: addUserFirstName || undefined,
        last_name: addUserLastName || undefined,
        role: addUserRole,
      });
      toast({ title: "Utilisateur ajouté" });
      setShowAddUser(false);
      setAddUserEmail("");
      setAddUserPassword("");
      setAddUserFirstName("");
      setAddUserLastName("");
      setAddUserRole("admin");
      void openDetail(selectedId);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Remove user handler ──
  const handleRemoveUser = async () => {
    if (!selectedId || !deleteUser) return;
    setDeleting(true);
    try {
      await removeAdminConciergerieUser(undefined, selectedId, deleteUser.id);
      toast({ title: "Utilisateur supprimé" });
      setDeleteUser(null);
      void openDetail(selectedId);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  // ── Delete conciergerie handler ──
  const handleDeleteConcierge = async () => {
    if (!deleteConcierge) return;
    setDeletingConcierge(true);
    try {
      await deleteAdminConciergerie(undefined, deleteConcierge.id);
      toast({ title: "Conciergerie supprimée" });
      setDeleteConcierge(null);
      // If we were viewing its detail, go back to list
      if (selectedId === deleteConcierge.id) {
        setSelectedId(null);
        setDetail(null);
      }
      void fetchList();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeletingConcierge(false);
    }
  };

  // ── Partner search (debounced) ──
  useEffect(() => {
    if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);
    if (partnerSearchQuery.trim().length < 2) {
      setPartnerSearchResults([]);
      return;
    }
    partnerSearchTimeout.current = setTimeout(async () => {
      setPartnerSearching(true);
      try {
        const res = await searchEstablishmentsByName(partnerSearchQuery.trim());
        setPartnerSearchResults(
          (res.items ?? []).map((e) => ({ id: e.id, name: e.name, city: e.city })),
        );
      } catch {
        setPartnerSearchResults([]);
      } finally {
        setPartnerSearching(false);
      }
    }, 300);
    return () => {
      if (partnerSearchTimeout.current) clearTimeout(partnerSearchTimeout.current);
    };
  }, [partnerSearchQuery]);

  // ── Add partner handler ──
  const handleAddPartner = async () => {
    if (!selectedId || !selectedPartnerEst) return;
    setSaving(true);
    try {
      await createAdminConciergeriePartner(undefined, selectedId, {
        establishment_id: selectedPartnerEst.id,
        commission_rate: partnerCommission,
        admin_share: partnerAdminShare,
        concierge_share: partnerConciergeShare,
        notes: partnerNotes || undefined,
      });
      toast({ title: "Partenaire ajouté" });
      setShowAddPartner(false);
      setSelectedPartnerEst(null);
      setPartnerSearchQuery("");
      setPartnerSearchResults([]);
      setPartnerCommission(10);
      setPartnerAdminShare(30);
      setPartnerConciergeShare(70);
      setPartnerNotes("");
      void openDetail(selectedId);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Edit partner handler ──
  const openEditPartner = (p: AdminConciergePartnerRow) => {
    setEditPartner(p);
    setPartnerCommission(p.commission_rate);
    setPartnerAdminShare(p.admin_share);
    setPartnerConciergeShare(p.concierge_share);
    setPartnerNotes(p.notes ?? "");
  };

  const handleEditPartner = async () => {
    if (!selectedId || !editPartner) return;
    setSaving(true);
    try {
      await updateAdminConciergeriePartner(undefined, selectedId, editPartner.id, {
        commission_rate: partnerCommission,
        admin_share: partnerAdminShare,
        concierge_share: partnerConciergeShare,
        notes: partnerNotes || undefined,
      });
      toast({ title: "Partenaire modifié" });
      setEditPartner(null);
      void openDetail(selectedId);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete partner handler ──
  const handleDeletePartner = async () => {
    if (!selectedId || !deletePartnerTarget) return;
    setDeletingPartner(true);
    try {
      await deleteAdminConciergeriePartner(
        undefined,
        selectedId,
        deletePartnerTarget.id,
      );
      toast({ title: "Partenaire supprimé" });
      setDeletePartnerTarget(null);
      void openDetail(selectedId);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeletingPartner(false);
    }
  };

  // ============================================================================
  // Render — Detail view
  // ============================================================================

  if (selectedId) {
    return (
      <div className="space-y-6 p-4 md:p-6">
        <Button
          variant="ghost"
          className="gap-2"
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </Button>

        {detailLoading ? (
          <div className="flex items-center gap-2 py-8 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </div>
        ) : detail ? (
          <>
            {/* Concierge info card */}
            <div className="rounded-lg border bg-white p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-lg font-semibold text-slate-900">
                    {detail.concierge.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                    <span>
                      {TYPE_LABELS[detail.concierge.type] ?? detail.concierge.type}
                    </span>
                    {detail.concierge.city && (
                      <span>· {detail.concierge.city}</span>
                    )}
                    {detail.concierge.email && (
                      <span>· {detail.concierge.email}</span>
                    )}
                    {detail.concierge.phone && (
                      <span>· {detail.concierge.phone}</span>
                    )}
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    Commission : {detail.concierge.commission_rate}%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      STATUS_COLORS[detail.concierge.status] ??
                      "bg-slate-100 text-slate-600"
                    }
                  >
                    {STATUS_LABELS[detail.concierge.status] ??
                      detail.concierge.status}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={openEdit}>
                    <Pencil className="mr-1 h-3 w-3" />
                    Modifier
                  </Button>
                </div>
              </div>
            </div>

            {/* Users section */}
            <div className="rounded-lg border bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  Utilisateurs ({detail.users.length})
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddUser(true)}
                  className="gap-1"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>

              {detail.users.length === 0 ? (
                <div className="mt-4 text-sm text-slate-400">
                  Aucun utilisateur. Ajoutez-en un pour permettre la connexion.
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  {detail.users.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {[u.first_name, u.last_name].filter(Boolean).join(" ") ||
                            u.email ||
                            "Sans nom"}
                        </div>
                        <div className="text-xs text-slate-500">
                          {u.email} · {u.role}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setDeleteUser(u)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Allowed cities section */}
            <div className="rounded-lg border bg-white p-5">
              <div className="text-sm font-semibold text-slate-900 mb-3">
                Villes autorisées
              </div>
              <p className="text-xs text-slate-400 mb-3">
                La ville principale ({detail.concierge.city || "non définie"}) est
                incluse automatiquement. Ajoutez des villes supplémentaires pour
                élargir la zone de recherche du concierge.
              </p>

              <div className="flex flex-wrap gap-2 mb-3">
                {allowedCities.length === 0 ? (
                  <span className="text-xs text-slate-400 italic">
                    Aucune ville supplémentaire
                  </span>
                ) : (
                  allowedCities.map((city) => (
                    <Badge
                      key={city}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {city}
                      <button
                        className="ml-0.5 hover:text-red-600"
                        onClick={async () => {
                          const next = allowedCities.filter((c) => c !== city);
                          setSavingCities(true);
                          try {
                            await updateAdminConciergerieCities(
                              undefined,
                              detail.concierge.id,
                              next,
                            );
                            setAllowedCities(next);
                            toast({
                              title: "Ville supprimée",
                              description: city,
                            });
                          } catch {
                            toast({
                              title: "Erreur",
                              variant: "destructive",
                            });
                          } finally {
                            setSavingCities(false);
                          }
                        }}
                        disabled={savingCities}
                      >
                        <XCircle className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Nouvelle ville..."
                  value={newCityInput}
                  onChange={(e) => setNewCityInput(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newCityInput.trim()) {
                      e.preventDefault();
                      const city = newCityInput.trim();
                      if (allowedCities.includes(city)) return;
                      const next = [...allowedCities, city];
                      setSavingCities(true);
                      updateAdminConciergerieCities(
                        undefined,
                        detail.concierge.id,
                        next,
                      )
                        .then(() => {
                          setAllowedCities(next);
                          setNewCityInput("");
                          toast({
                            title: "Ville ajoutée",
                            description: city,
                          });
                        })
                        .catch(() =>
                          toast({
                            title: "Erreur",
                            variant: "destructive",
                          }),
                        )
                        .finally(() => setSavingCities(false));
                    }
                  }}
                />
                <Button
                  size="sm"
                  disabled={!newCityInput.trim() || savingCities}
                  onClick={async () => {
                    const city = newCityInput.trim();
                    if (!city || allowedCities.includes(city)) return;
                    const next = [...allowedCities, city];
                    setSavingCities(true);
                    try {
                      await updateAdminConciergerieCities(
                        undefined,
                        detail.concierge.id,
                        next,
                      );
                      setAllowedCities(next);
                      setNewCityInput("");
                      toast({ title: "Ville ajoutée", description: city });
                    } catch {
                      toast({ title: "Erreur", variant: "destructive" });
                    } finally {
                      setSavingCities(false);
                    }
                  }}
                >
                  {savingCities ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Partners section */}
            <div className="rounded-lg border bg-white p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Handshake className="h-4 w-4 text-amber-600" />
                  Partenaires ({partners.length})
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowAddPartner(true)}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </div>

              {partners.length === 0 ? (
                <div className="mt-4 text-sm text-slate-400">
                  Aucun partenaire. Ajoutez des établissements partenaires pour gérer les commissions.
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-slate-500">
                        <th className="px-3 py-2 font-medium">Établissement</th>
                        <th className="px-3 py-2 font-medium text-center">Commission</th>
                        <th className="px-3 py-2 font-medium text-center">Part admin</th>
                        <th className="px-3 py-2 font-medium text-center">Part conciergerie</th>
                        <th className="px-3 py-2 font-medium text-center">Statut</th>
                        <th className="px-3 py-2 w-20" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {partners.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900">
                              {p.establishment_name}
                            </div>
                            {p.establishment_city && (
                              <div className="text-xs text-slate-400">
                                {p.establishment_city}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">{p.commission_rate}%</td>
                          <td className="px-3 py-2.5 text-center">{p.admin_share}%</td>
                          <td className="px-3 py-2.5 text-center">{p.concierge_share}%</td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              className={
                                p.status === "active"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              }
                            >
                              {p.status === "active" ? "Actif" : "Suspendu"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-blue-600"
                                onClick={() => openEditPartner(p)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-red-600"
                                onClick={() => setDeletePartnerTarget(p)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}

        {/* ── Add partner dialog ── */}
        <Dialog
          open={showAddPartner}
          onOpenChange={(open) => {
            setShowAddPartner(open);
            if (!open) {
              setSelectedPartnerEst(null);
              setPartnerSearchQuery("");
              setPartnerSearchResults([]);
              setPartnerCommission(10);
              setPartnerAdminShare(30);
              setPartnerConciergeShare(70);
              setPartnerNotes("");
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Ajouter un partenaire</DialogTitle>
              <DialogDescription>
                Recherchez un établissement et configurez la commission.
              </DialogDescription>
            </DialogHeader>

            {!selectedPartnerEst ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Rechercher un établissement..."
                    value={partnerSearchQuery}
                    onChange={(e) => setPartnerSearchQuery(e.target.value)}
                    className="pl-10"
                    autoFocus
                  />
                </div>
                {partnerSearching && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Recherche…
                  </div>
                )}
                {partnerSearchResults.length > 0 && (
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {partnerSearchResults.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onClick={() => setSelectedPartnerEst(e)}
                      >
                        <div className="font-medium">{e.name}</div>
                        {e.city && (
                          <div className="text-xs text-slate-500">{e.city}</div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-sm font-medium">{selectedPartnerEst.name}</div>
                  {selectedPartnerEst.city && (
                    <div className="text-xs text-slate-500">{selectedPartnerEst.city}</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs">Commission (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={partnerCommission}
                      onChange={(e) => setPartnerCommission(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Part admin (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={partnerAdminShare}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPartnerAdminShare(v);
                        setPartnerConciergeShare(100 - v);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Part conciergerie (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={partnerConciergeShare}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setPartnerConciergeShare(v);
                        setPartnerAdminShare(100 - v);
                      }}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Notes (optionnel)</Label>
                  <Input
                    value={partnerNotes}
                    onChange={(e) => setPartnerNotes(e.target.value)}
                    placeholder="Notes internes…"
                  />
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setSelectedPartnerEst(null)}
                  >
                    Changer
                  </Button>
                  <Button
                    onClick={() => void handleAddPartner()}
                    disabled={saving}
                  >
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Ajouter le partenaire
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit partner dialog ── */}
        <Dialog
          open={!!editPartner}
          onOpenChange={(open) => !open && setEditPartner(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier le partenariat</DialogTitle>
              <DialogDescription>
                {editPartner?.establishment_name}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Commission (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={partnerCommission}
                    onChange={(e) => setPartnerCommission(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Part admin (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={partnerAdminShare}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPartnerAdminShare(v);
                      setPartnerConciergeShare(100 - v);
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">Part conciergerie (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={partnerConciergeShare}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setPartnerConciergeShare(v);
                      setPartnerAdminShare(100 - v);
                    }}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input
                  value={partnerNotes}
                  onChange={(e) => setPartnerNotes(e.target.value)}
                  placeholder="Notes internes…"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditPartner(null)}>
                  Annuler
                </Button>
                <Button
                  onClick={() => void handleEditPartner()}
                  disabled={saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Delete partner AlertDialog ── */}
        <AlertDialog
          open={!!deletePartnerTarget}
          onOpenChange={(open) => !open && setDeletePartnerTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer ce partenaire ?</AlertDialogTitle>
              <AlertDialogDescription>
                Le partenariat avec <strong>{deletePartnerTarget?.establishment_name}</strong> sera
                désactivé. Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingPartner}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deletingPartner}
                onClick={() => void handleDeletePartner()}
              >
                {deletingPartner && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* ── Edit dialog ── */}
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Modifier la conciergerie</DialogTitle>
              <DialogDescription>
                Ajustez la commission et le statut.
              </DialogDescription>
            </DialogHeader>
            {detail && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-slate-50 p-3">
                  <div className="text-sm font-medium">{detail.concierge.name}</div>
                  <div className="text-xs text-slate-500">
                    {detail.concierge.city ?? ""} ·{" "}
                    {TYPE_LABELS[detail.concierge.type] ?? detail.concierge.type}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Commission (%)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={editCommission}
                      onChange={(e) =>
                        setEditCommission(Number(e.target.value) || 0)
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Actif</SelectItem>
                        <SelectItem value="pending">En attente</SelectItem>
                        <SelectItem value="suspended">Suspendu</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowEdit(false)}
                  >
                    Annuler
                  </Button>
                  <Button onClick={() => void handleEdit()} disabled={saving}>
                    {saving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Enregistrer
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Add user dialog ── */}
        <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ajouter un utilisateur</DialogTitle>
              <DialogDescription>
                Créez un nouveau compte pour accéder à l'espace Conciergerie.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Prénom</Label>
                  <Input
                    value={addUserFirstName}
                    onChange={(e) => setAddUserFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Nom</Label>
                  <Input
                    value={addUserLastName}
                    onChange={(e) => setAddUserLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Email *</Label>
                <Input
                  type="email"
                  required
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Mot de passe *</Label>
                <Input
                  type="password"
                  required
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Rôle</Label>
                <Select value={addUserRole} onValueChange={setAddUserRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="operator">Opérateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowAddUser(false)}
                >
                  Annuler
                </Button>
                <Button
                  onClick={() => void handleAddUser()}
                  disabled={saving || !addUserEmail || !addUserPassword}
                >
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Créer l'utilisateur
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Remove user confirmation ── */}
        <AlertDialog
          open={!!deleteUser}
          onOpenChange={(open) => !open && setDeleteUser(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Supprimer cet utilisateur ?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteUser && (
                  <>
                    {[deleteUser.first_name, deleteUser.last_name]
                      .filter(Boolean)
                      .join(" ") || deleteUser.email}{" "}
                    sera retiré de cette conciergerie.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => void handleRemoveUser()}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    Suppression...
                  </>
                ) : (
                  "Supprimer"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // ============================================================================
  // Render — List view
  // ============================================================================

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-amber-600" />
          <h2 className="text-xl font-bold">Conciergeries</h2>
          <Badge variant="outline" className="ml-2">
            {concierges.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchList()}
            disabled={loading}
            className="gap-1"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setShowCreate(true);
              setSelectedEstablishment(null);
              setSearchQuery("");
              setSearchResults([]);
            }}
            className="gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Nouvelle conciergerie
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && concierges.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      )}

      {/* Empty state */}
      {!loading && concierges.length === 0 && !error && (
        <div className="text-center py-12">
          <Building2 className="mx-auto h-10 w-10 text-slate-300" />
          <div className="mt-3 text-sm text-slate-400">
            Aucune conciergerie. Cliquez sur « Nouvelle conciergerie » pour en
            activer une.
          </div>
        </div>
      )}

      {/* Table */}
      {concierges.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">
                    Établissement
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">
                    Type
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">
                    Ville
                  </th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-600">
                    Status
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium text-slate-600">
                    Users
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium text-slate-600">
                    Parcours
                  </th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">
                    Commission
                  </th>
                  <th className="w-12 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {concierges.map((c) => (
                  <tr
                    key={c.id}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => void openDetail(c.id)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {TYPE_LABELS[c.type] ?? c.type}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {c.city ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={
                          STATUS_COLORS[c.status] ??
                          "bg-slate-100 text-slate-600"
                        }
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {c.user_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {c.journey_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {c.commission_rate}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-red-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConcierge(c);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create dialog ── */}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouvelle conciergerie</DialogTitle>
            <DialogDescription>
              Recherchez un établissement existant pour lui activer l'espace
              Conciergerie.
            </DialogDescription>
          </DialogHeader>

          {!selectedEstablishment ? (
            <div className="space-y-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Rechercher un établissement..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  autoFocus
                />
              </div>

              {/* Results */}
              {searching ? (
                <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recherche...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {searchResults.map((est) => (
                    <button
                      key={est.id}
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-slate-50"
                      onClick={() => setSelectedEstablishment(est)}
                    >
                      <Building2 className="h-5 w-5 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {est.name}
                        </div>
                        {est.city && (
                          <div className="truncate text-xs text-slate-400">
                            {est.city}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="py-4 text-center text-sm text-slate-400">
                  Aucun établissement trouvé.
                </div>
              ) : (
                <div className="py-4 text-center text-sm text-slate-400">
                  Tapez au moins 2 caractères pour rechercher.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Selected establishment preview */}
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="text-sm font-semibold text-slate-900">
                  {selectedEstablishment.name}
                </div>
                {selectedEstablishment.city && (
                  <div className="mt-1 text-xs text-slate-500">
                    {selectedEstablishment.city}
                  </div>
                )}
              </div>

              <div className="text-sm text-slate-500">
                La conciergerie portera le nom de cet établissement. Les
                utilisateurs pro rattachés seront automatiquement liés.
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setSelectedEstablishment(null)}
                >
                  Changer
                </Button>
                <Button
                  onClick={() => void handleCreate()}
                  disabled={saving}
                >
                  {saving && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Activer la conciergerie
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete conciergerie AlertDialog ── */}
      <AlertDialog
        open={!!deleteConcierge}
        onOpenChange={(open) => !open && setDeleteConcierge(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette conciergerie ?</AlertDialogTitle>
            <AlertDialogDescription>
              La conciergerie <strong>{deleteConcierge?.name}</strong> sera
              désactivée ainsi que tous ses utilisateurs associés. Cette action
              est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingConcierge}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deletingConcierge}
              onClick={() => void handleDeleteConcierge()}
            >
              {deletingConcierge && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
