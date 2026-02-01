import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AdminApiError,
  createAdminConsumerPromoCode,
  deleteAdminConsumerPromoCode,
  listAdminConsumerPromoCodes,
  listEstablishments,
  updateAdminConsumerPromoCode,
  type AdminConsumerPromoCode,
  type AdminConsumerPromoCodeInput,
  type Establishment,
} from "@/lib/adminApi";
import type { ColumnDef } from "@tanstack/react-table";

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
  onToast: (t: { title?: string; description?: string; variant?: "default" | "destructive" }) => void;
};

export function ConsumerPromoSettingsCard({ onToast }: Props) {
  const [promoCodes, setPromoCodes] = useState<AdminConsumerPromoCode[]>([]);
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [savingPromoId, setSavingPromoId] = useState<string | null>(null);

  const [newPromo, setNewPromo] = useState({
    code: "",
    percent: "",
    description: "",
    audience: "all" as "all" | "selected",
    establishmentIds: [] as string[],
  });
  const [establishmentSearch, setEstablishmentSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [promoRes, estRes] = await Promise.all([
        listAdminConsumerPromoCodes(undefined, { include_deleted: false }),
        listEstablishments(undefined, "active"),
      ]);

      setPromoCodes(promoRes.promo_codes ?? []);
      setEstablishments(estRes.items ?? []);
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

  const filteredEstablishments = useMemo(() => {
    const q = establishmentSearch.trim().toLowerCase();
    if (!q) return establishments;
    return establishments.filter((e) => {
      const name = (e.name ?? "").toLowerCase();
      const city = (e.city ?? "").toLowerCase();
      return name.includes(q) || city.includes(q);
    });
  }, [establishments, establishmentSearch]);

  const promoColumns = useMemo<ColumnDef<AdminConsumerPromoCode>[]>(() => {
    return [
      {
        header: "Code",
        accessorKey: "code",
      },
      {
        header: "Remise",
        cell: ({ row }) => {
          const p = row.original;
          return <span className="tabular-nums">{percentStringFromBps(p.discount_bps)}%</span>;
        },
      },
      {
        header: "Portée",
        cell: ({ row }) => {
          const p = row.original;
          const count = Array.isArray((p as any).applies_to_establishment_ids)
            ? ((p as any).applies_to_establishment_ids as unknown[]).length
            : 0;
          const estLabel = count > 0 ? `${count} établissement${count > 1 ? "s" : ""}` : "Tous";

          return (
            <div className="space-y-0.5">
              <div className="text-sm">Packs</div>
              <div className="text-xs text-slate-500">{estLabel}</div>
            </div>
          );
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
              disabled={savingPromoId === p.id}
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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={savingPromoId === p.id}
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
  }, [savingPromoId]);

  const updatePromo = async (promoId: string, patch: AdminConsumerPromoCodeInput) => {
    setSavingPromoId(promoId);
    try {
      await updateAdminConsumerPromoCode(undefined, promoId, patch);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingPromoId(null);
    }
  };

  const removePromo = async (promoId: string) => {
    setSavingPromoId(promoId);
    try {
      await deleteAdminConsumerPromoCode(undefined, promoId);
      onToast({ title: "Code promo supprimé" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingPromoId(null);
    }
  };

  const createPromo = async (): Promise<boolean> => {
    const code = newPromo.code.trim().toUpperCase().replace(/\s+/g, "");
    const bps = bpsFromPercentString(newPromo.percent);

    if (!code || !bps || bps <= 0) {
      onToast({ title: "Code promo", description: "Code et remise (%) sont requis.", variant: "destructive" });
      return false;
    }

    const establishmentIds = newPromo.audience === "selected" ? newPromo.establishmentIds : [];
    if (newPromo.audience === "selected" && !establishmentIds.length) {
      onToast({ title: "Audience", description: "Sélectionnez au moins un établissement.", variant: "destructive" });
      return false;
    }

    setSavingPromoId("create");
    try {
      await createAdminConsumerPromoCode(undefined, {
        code,
        description: newPromo.description.trim() || null,
        discount_bps: bps,
        applies_to_establishment_ids: establishmentIds.length ? establishmentIds : null,
        active: true,
      });

      onToast({
        title: "Code USER créé",
        description: bps >= 10000 ? "Pack offert (100%)" : `Remise ${Math.round(bps / 100)}%`,
      });

      setNewPromo({ code: "", percent: "", description: "", audience: "all", establishmentIds: [] });
      setEstablishmentSearch("");
      setPromoDialogOpen(false);
      await refresh();
      return true;
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "Erreur", description: msg, variant: "destructive" });
      return false;
    } finally {
      setSavingPromoId(null);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Codes promo USERS</CardTitle>
            <InfoTooltip
              content={
                <div className="space-y-1">
                  <div>Donne une remise (jusqu'à 100% = pack offert).</div>
                  <div>Applicable à tous les établissements ou à une liste.</div>
                </div>
              }
            />
          </div>
          <Button onClick={() => setPromoDialogOpen(true)} disabled={loading}>
            Nouveau code
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="rounded-lg border border-slate-200 bg-white">
          <AdminDataTable<AdminConsumerPromoCode>
            data={promoCodes}
            columns={promoColumns}
            searchPlaceholder="Rechercher par code…"
            isLoading={loading}
          />
        </div>

        <Dialog open={promoDialogOpen} onOpenChange={setPromoDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nouveau code promo USER</DialogTitle>
              <DialogDescription>Ex: 100% = pack offert. Le code est automatiquement normalisé en MAJUSCULE.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="consumerPromoCode">Code</Label>
                <Input
                  id="consumerPromoCode"
                  value={newPromo.code}
                  onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
                  placeholder="OFFERT2026"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="consumerPromoPercent">Remise (%)</Label>
                <Input
                  id="consumerPromoPercent"
                  value={newPromo.percent}
                  onChange={(e) => setNewPromo((p) => ({ ...p, percent: e.target.value }))}
                  placeholder="100"
                  inputMode="decimal"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label htmlFor="consumerPromoDesc">Description (optionnel)</Label>
                <Input
                  id="consumerPromoDesc"
                  value={newPromo.description}
                  onChange={(e) => setNewPromo((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Pack offert pour la campagne TikTok"
                />
              </div>

              <div className="md:col-span-2 space-y-2">
                <Label>Audience</Label>
                <RadioGroup
                  value={newPromo.audience}
                  onValueChange={(v) =>
                    setNewPromo((p) => ({
                      ...p,
                      audience: v === "selected" ? "selected" : "all",
                      establishmentIds: v === "selected" ? p.establishmentIds : [],
                    }))
                  }
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="all" id="consumerPromoAll" />
                    <Label htmlFor="consumerPromoAll">Tous les établissements</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="selected" id="consumerPromoSelected" />
                    <Label htmlFor="consumerPromoSelected">Établissements sélectionnés</Label>
                  </div>
                </RadioGroup>

                {newPromo.audience === "selected" ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={establishmentSearch}
                      onChange={(e) => setEstablishmentSearch(e.target.value)}
                      placeholder="Rechercher par nom ou ville"
                    />

                    <div className="rounded-lg border border-slate-200">
                      <ScrollArea className="h-56 p-3">
                        <div className="space-y-2">
                          {filteredEstablishments.map((e) => {
                            const id = String(e.id);
                            const checked = newPromo.establishmentIds.includes(id);
                            const label = `${e.name ?? "(Sans nom)"}${e.city ? ` — ${e.city}` : ""}`;

                            return (
                              <label key={id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) => {
                                    const isChecked = Boolean(next);
                                    setNewPromo((p) => {
                                      const set = new Set(p.establishmentIds);
                                      if (isChecked) set.add(id);
                                      else set.delete(id);
                                      return { ...p, establishmentIds: Array.from(set) };
                                    });
                                  }}
                                />
                                <span className="text-slate-800">{label}</span>
                              </label>
                            );
                          })}

                          {!filteredEstablishments.length ? (
                            <div className="text-sm text-slate-500">Aucun établissement trouvé.</div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>

                    <div className="text-xs text-slate-500">
                      {newPromo.establishmentIds.length} sélectionné{newPromo.establishmentIds.length > 1 ? "s" : ""}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setPromoDialogOpen(false)} disabled={savingPromoId === "create"}>
                Annuler
              </Button>
              <Button onClick={() => void createPromo()} disabled={savingPromoId === "create"}>
                {savingPromoId === "create" ? "Création..." : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
