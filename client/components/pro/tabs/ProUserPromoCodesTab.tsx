import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { Establishment, ProRole } from "@/lib/pro/types";
import {
  createProConsumerPromoCode,
  deleteProConsumerPromoCode,
  listProConsumerPromoCodes,
  updateProConsumerPromoCode,
  type ProConsumerPromoCode,
} from "@/lib/pro/api";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import type { ColumnDef } from "@tanstack/react-table";

function HelpPopover({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] font-extrabold text-slate-600 hover:bg-slate-50"
          aria-label={label}
          title={label}
        >
          ?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm text-slate-700">
        <div className="leading-snug">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function percentStringFromBps(bps: number) {
  const n = Number(bps);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (n / 100).toFixed(0);
}

function bpsFromPercentString(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10000, Math.round(n * 100)));
}

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function generateSamCode(suffixLength = 10): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const n = Math.max(6, Math.min(32, Math.round(suffixLength)));

  let bytes: Uint8Array | null = null;
  try {
    bytes = new Uint8Array(n);
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      bytes = null;
    }
  } catch {
    bytes = null;
  }

  let out = "SAM";
  for (let i = 0; i < n; i++) {
    const v = bytes ? bytes[i] : Math.floor(Math.random() * 256);
    out += alphabet[v % alphabet.length];
  }
  return out;
}

function asPositiveIntOrNull(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  const v = Math.floor(n);
  return v >= 1 ? v : null;
}

export function ProUserPromoCodesTab({ establishment, role }: Props) {
  const [promoCodes, setPromoCodes] = useState<ProConsumerPromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<ProConsumerPromoCode | null>(null);
  const [savingPromoId, setSavingPromoId] = useState<string | null>(null);

  const canWrite = role === "owner" || role === "manager" || role === "marketing";

  const [newPromo, setNewPromo] = useState({
    code: "",
    percent: "",
    description: "",
    is_public: false,
    starts_at: "",
    ends_at: "",
    max_uses_total: "",
    max_uses_per_user: "",
  });

  const [editPromo, setEditPromo] = useState({
    id: "",
    code: "",
    percent: "",
    description: "",
    is_public: false,
    starts_at: "",
    ends_at: "",
    max_uses_total: "",
    max_uses_per_user: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const rows = await listProConsumerPromoCodes(establishment.id);
      setPromoCodes(rows ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [establishment.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const promoColumns = useMemo<ColumnDef<ProConsumerPromoCode>[]>(() => {
    return [
      { header: "Code", accessorKey: "code" },
      {
        header: "Remise",
        cell: ({ row }) => <span className="tabular-nums">{percentStringFromBps(row.original.discount_bps)}%</span>,
      },
      {
        header: "Visibilité",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={!canWrite || savingPromoId === p.id}
              onClick={() => void updatePromo(p.id, { is_public: !p.is_public })}
            >
              {p.is_public ? "Public" : "Privé"}
            </Button>
          );
        },
      },
      {
        header: "Validité",
        cell: ({ row }) => {
          const p = row.original;
          const start = formatDateFr(p.starts_at);
          const end = formatDateFr(p.ends_at);
          if (!start && !end) return <span className="text-slate-500">Illimitée</span>;
          if (start && end) return <span className="text-slate-700">{start} → {end}</span>;
          if (start) return <span className="text-slate-700">Dès {start}</span>;
          return <span className="text-slate-700">Jusqu’au {end}</span>;
        },
      },
      {
        header: "Limites",
        cell: ({ row }) => {
          const p = row.original;
          const parts: string[] = [];
          if (p.max_uses_total) parts.push(`total: ${p.max_uses_total}`);
          if (p.max_uses_per_user) parts.push(`par user: ${p.max_uses_per_user}`);
          return parts.length ? <span className="text-slate-700">{parts.join(" · ")}</span> : <span className="text-slate-500">Illimité</span>;
        },
      },
      {
        header: "Actif",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Button
              size="sm"
              variant="outline"
              disabled={!canWrite || savingPromoId === p.id}
              onClick={() => void updatePromo(p.id, { active: !p.active })}
            >
              {p.active ? "Oui" : "Non"}
            </Button>
          );
        },
      },
      {
        header: "Actions",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canWrite || savingPromoId === p.id}
                onClick={() => {
                  setEditingPromo(p);
                  setEditPromo({
                    id: p.id,
                    code: p.code,
                    percent: percentStringFromBps(p.discount_bps),
                    description: p.description ?? "",
                    is_public: Boolean(p.is_public),
                    starts_at: p.starts_at ? p.starts_at.slice(0, 16) : "",
                    ends_at: p.ends_at ? p.ends_at.slice(0, 16) : "",
                    max_uses_total: p.max_uses_total ? String(p.max_uses_total) : "",
                    max_uses_per_user: p.max_uses_per_user ? String(p.max_uses_per_user) : "",
                  });
                  setEditDialogOpen(true);
                }}
              >
                Modifier
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={!canWrite || savingPromoId === p.id}
                onClick={() => {
                  const ok = window.confirm(`Supprimer le code ${p.code} ?`);
                  if (!ok) return;
                  void removePromo(p.id);
                }}
              >
                Supprimer
              </Button>
            </div>
          );
        },
      },
    ];
  }, [canWrite, savingPromoId]);

  const updatePromo = async (
    promoId: string,
    patch: {
      active?: boolean;
      discount_bps?: number;
      description?: string | null;
      is_public?: boolean;
      starts_at?: string | null;
      ends_at?: string | null;
      max_uses_total?: number | null;
      max_uses_per_user?: number | null;
    },
  ) => {
    setSavingPromoId(promoId);
    try {
      await updateProConsumerPromoCode({ establishmentId: establishment.id, promoId, patch });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const removePromo = async (promoId: string) => {
    setSavingPromoId(promoId);
    try {
      await deleteProConsumerPromoCode({ establishmentId: establishment.id, promoId });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const createPromo = async () => {
    const code = newPromo.code.trim().toUpperCase().replace(/\s+/g, "");
    const bps = bpsFromPercentString(newPromo.percent);

    if (!bps || bps <= 0) {
      setError("Remise (%) est requise.");
      return;
    }

    const startsAtIso = newPromo.starts_at.trim() ? new Date(newPromo.starts_at).toISOString() : null;
    const endsAtIso = newPromo.ends_at.trim() ? new Date(newPromo.ends_at).toISOString() : null;

    const maxUsesTotal = asPositiveIntOrNull(newPromo.max_uses_total);
    const maxUsesPerUser = asPositiveIntOrNull(newPromo.max_uses_per_user);

    setSavingPromoId("create");
    setError(null);

    try {
      await createProConsumerPromoCode({
        establishmentId: establishment.id,
        code: code || undefined,
        discount_bps: bps,
        description: newPromo.description.trim() || null,
        is_public: newPromo.is_public,
        starts_at: startsAtIso,
        ends_at: endsAtIso,
        max_uses_total: maxUsesTotal,
        max_uses_per_user: maxUsesPerUser,
      });

      setNewPromo({
        code: generateSamCode(),
        percent: "",
        description: "",
        is_public: false,
        starts_at: "",
        ends_at: "",
        max_uses_total: "",
        max_uses_per_user: "",
      });
      setPromoDialogOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setSavingPromoId(null);
    }
  };

  const saveEditPromo = async () => {
    if (!editingPromo) return;

    const bps = bpsFromPercentString(editPromo.percent);
    if (!bps || bps <= 0) {
      setError("Remise (%) est requise.");
      return;
    }

    const startsAtIso = editPromo.starts_at.trim() ? new Date(editPromo.starts_at).toISOString() : null;
    const endsAtIso = editPromo.ends_at.trim() ? new Date(editPromo.ends_at).toISOString() : null;
    const maxUsesTotal = asPositiveIntOrNull(editPromo.max_uses_total);
    const maxUsesPerUser = asPositiveIntOrNull(editPromo.max_uses_per_user);

    await updatePromo(editingPromo.id, {
      discount_bps: bps,
      description: editPromo.description.trim() || null,
      is_public: editPromo.is_public,
      starts_at: startsAtIso,
      ends_at: endsAtIso,
      max_uses_total: maxUsesTotal,
      max_uses_per_user: maxUsesPerUser,
    });

    setEditDialogOpen(false);
    setEditingPromo(null);
  };

  const title = (establishment.name ?? "").trim() ? `Promotion — ${establishment.name}` : "Promotion";

  return (
    <div className="space-y-4">
      {!canWrite ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Vous pouvez consulter la liste, mais la création/suppression nécessite le rôle <b>Owner</b>, <b>Manager</b> ou <b>Marketing</b>.
        </div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <div className="text-sm text-slate-600">
                Créez des codes promo pour vos USERS (packs offerts ou remise). Valables uniquement dans cet établissement.
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refresh()} disabled={loading}>
                {loading ? "…" : "Rafraîchir"}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setNewPromo((p) => ({
                    ...p,
                    code: p.code.trim() ? p.code : generateSamCode(),
                  }));
                  setPromoDialogOpen(true);
                }}
                disabled={!canWrite}
              >
                Nouveau code
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

          <AdminDataTable<ProConsumerPromoCode>
            data={promoCodes}
            columns={promoColumns}
            searchPlaceholder="Rechercher par code…"
            isLoading={loading}
          />

          <Dialog
            open={promoDialogOpen}
            onOpenChange={(open) => {
              setPromoDialogOpen(open);
              if (open) setError(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <DialogTitle>Nouveau code promo</DialogTitle>
                    <DialogDescription>Paramètres du code</DialogDescription>
                  </div>
                  <HelpPopover label="Aide">
                    Remise (%) = réduction sur les packs de cet établissement.
                    <br />
                    <b>100%</b> = pack offert.
                  </HelpPopover>
                </div>
              </DialogHeader>

              <div className="space-y-2 sm:space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Code</Label>
                    <HelpPopover label="Format">
                      Le code est ce que le USER saisit au paiement.
                      <br />
                      Exemple : <b>SAMXXXXXXXXXX</b>
                    </HelpPopover>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Input
                      value={newPromo.code}
                      onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
                      placeholder="SAMXXXXXXXXXX"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => setNewPromo((p) => ({ ...p, code: generateSamCode() }))}
                    >
                      Générer
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Visibilité</div>
                    <HelpPopover label="Visibilité">
                      <b>Privé</b> = geste commercial (à donner à un USER précis).
                      <br />
                      <b>Public</b> = partageable (campagne / réseaux).
                    </HelpPopover>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className="text-xs text-slate-600 whitespace-nowrap">{newPromo.is_public ? "Public" : "Privé"}</span>
                    <Switch checked={newPromo.is_public} onCheckedChange={(v) => setNewPromo((p) => ({ ...p, is_public: v }))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Début (optionnel)</Label>
                    <Input type="datetime-local" value={newPromo.starts_at} onChange={(e) => setNewPromo((p) => ({ ...p, starts_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fin (optionnel)</Label>
                    <Input type="datetime-local" value={newPromo.ends_at} onChange={(e) => setNewPromo((p) => ({ ...p, ends_at: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label>Limite totale (optionnel)</Label>
                      <HelpPopover label="Limite totale">
                        Nombre max d’utilisations du code (tous USERS confondus).
                        <br />
                        Exemple : 1 = utilisable une seule fois.
                      </HelpPopover>
                    </div>
                    <Input
                      value={newPromo.max_uses_total}
                      onChange={(e) => setNewPromo((p) => ({ ...p, max_uses_total: e.target.value }))}
                      placeholder="ex: 1"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label>Limite par USER (optionnel)</Label>
                      <HelpPopover label="Limite par USER">
                        Nombre max d’utilisations <b>par utilisateur</b>.
                        <br />
                        Exemple : 1 = un même USER ne peut l’utiliser qu’une fois.
                      </HelpPopover>
                    </div>
                    <Input
                      value={newPromo.max_uses_per_user}
                      onChange={(e) => setNewPromo((p) => ({ ...p, max_uses_per_user: e.target.value }))}
                      placeholder="ex: 1"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Remise (%)</Label>
                    <HelpPopover label="Remise">
                      100 = pack offert.
                      <br />
                      50 = -50%.
                    </HelpPopover>
                  </div>
                  <Input
                    value={newPromo.percent}
                    onChange={(e) => setNewPromo((p) => ({ ...p, percent: e.target.value }))}
                    placeholder="100"
                    inputMode="decimal"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Description (optionnel)</Label>
                  <Input
                    value={newPromo.description}
                    onChange={(e) => setNewPromo((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Campagne Instagram"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => setPromoDialogOpen(false)}
                  disabled={savingPromoId === "create"}
                >
                  Annuler
                </Button>
                <Button className="w-full sm:w-auto" onClick={() => void createPromo()} disabled={savingPromoId === "create"}>
                  {savingPromoId === "create" ? "Création..." : "Créer"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={editDialogOpen}
            onOpenChange={(open) => {
              setEditDialogOpen(open);
              if (!open) setEditingPromo(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <DialogTitle>Modifier le code</DialogTitle>
                    <DialogDescription>Paramètres du code</DialogDescription>
                  </div>
                  <HelpPopover label="Aide">
                    Vous pouvez ajuster : visibilité, dates de validité, limites et remise.
                  </HelpPopover>
                </div>
              </DialogHeader>

              <div className="space-y-2 sm:space-y-3">
                <div className="space-y-1">
                  <Label>Code</Label>
                  <Input value={editPromo.code} disabled />
                </div>

                <div className="rounded-md border p-3 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:justify-between sm:gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">Visibilité</div>
                    <HelpPopover label="Visibilité">
                      <b>Privé</b> = geste commercial (à donner à un USER précis).
                      <br />
                      <b>Public</b> = partageable (campagne / réseaux).
                    </HelpPopover>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <span className="text-xs text-slate-600 whitespace-nowrap">{editPromo.is_public ? "Public" : "Privé"}</span>
                    <Switch checked={editPromo.is_public} onCheckedChange={(v) => setEditPromo((p) => ({ ...p, is_public: v }))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Début (optionnel)</Label>
                    <Input type="datetime-local" value={editPromo.starts_at} onChange={(e) => setEditPromo((p) => ({ ...p, starts_at: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Fin (optionnel)</Label>
                    <Input type="datetime-local" value={editPromo.ends_at} onChange={(e) => setEditPromo((p) => ({ ...p, ends_at: e.target.value }))} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label>Limite totale (optionnel)</Label>
                      <HelpPopover label="Limite totale">
                        Nombre max d’utilisations du code (tous USERS confondus).
                        <br />
                        Exemple : 1 = utilisable une seule fois.
                      </HelpPopover>
                    </div>
                    <Input
                      value={editPromo.max_uses_total}
                      onChange={(e) => setEditPromo((p) => ({ ...p, max_uses_total: e.target.value }))}
                      placeholder="ex: 1"
                      inputMode="numeric"
                    />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label>Limite par USER (optionnel)</Label>
                      <HelpPopover label="Limite par USER">
                        Nombre max d’utilisations <b>par utilisateur</b>.
                        <br />
                        Exemple : 1 = un même USER ne peut l’utiliser qu’une fois.
                      </HelpPopover>
                    </div>
                    <Input
                      value={editPromo.max_uses_per_user}
                      onChange={(e) => setEditPromo((p) => ({ ...p, max_uses_per_user: e.target.value }))}
                      placeholder="ex: 1"
                      inputMode="numeric"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label>Remise (%)</Label>
                    <HelpPopover label="Remise">
                      100 = pack offert.
                      <br />
                      50 = -50%.
                    </HelpPopover>
                  </div>
                  <Input
                    value={editPromo.percent}
                    onChange={(e) => setEditPromo((p) => ({ ...p, percent: e.target.value }))}
                    placeholder="100"
                    inputMode="decimal"
                  />
                </div>

                <div className="space-y-1">
                  <Label>Description (optionnel)</Label>
                  <Input
                    value={editPromo.description}
                    onChange={(e) => setEditPromo((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Geste commercial"
                  />
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  className="w-full sm:w-auto"
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditingPromo(null);
                  }}
                  disabled={!!editingPromo && savingPromoId === editingPromo.id}
                >
                  Annuler
                </Button>
                <Button
                  className="w-full sm:w-auto"
                  onClick={() => void saveEditPromo()}
                  disabled={!!editingPromo && savingPromoId === editingPromo.id}
                >
                  {editingPromo && savingPromoId === editingPromo.id ? "Sauvegarde..." : "Sauvegarder"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
