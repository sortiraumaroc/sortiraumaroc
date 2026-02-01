import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AdminApiError,
  createAdminVisibilityPromoCode,
  deleteAdminVisibilityPromoCode,
  listAdminVisibilityPromoCodes,
  listEstablishments,
  updateAdminVisibilityPromoCode,
  type AdminVisibilityPromoCode,
  type AdminVisibilityPromoCodeInput,
  type Establishment,
} from "@/lib/adminApi";

import type { ColumnDef } from "@tanstack/react-table";

type Props = {
  onToast: (t: { title?: string; description?: string; variant?: "default" | "destructive" }) => void;
};

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

const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Global" },
  { value: "menu_digital", label: "Menu Digital" },
  { value: "pack", label: "SAM Media (packs)" },
  { value: "option", label: "Options" },
  { value: "media_video", label: "Média vidéo" },
  { value: "article_sponsorise", label: "Article sponsorisé" },
  { value: "newsletter", label: "Newsletter" },
];

export function VisibilityPromoSettingsCard({ onToast }: Props) {
  const [promoCodes, setPromoCodes] = useState<AdminVisibilityPromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPromo, setNewPromo] = useState({
    code: "",
    percent: "",
    scopeType: "",
    audience: "all" as "all" | "selected",
    establishmentIds: [] as string[],
  });
  const [savingPromoId, setSavingPromoId] = useState<string | null>(null);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);

  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [establishmentSearch, setEstablishmentSearch] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [promoRes, estRes] = await Promise.all([
        listAdminVisibilityPromoCodes(undefined, { include_deleted: false }),
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

  const promoColumns = useMemo<ColumnDef<AdminVisibilityPromoCode>[]>(() => {
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
          const serviceLabel = SCOPE_OPTIONS.find((o) => o.value === String(p.applies_to_type ?? ""))?.label ?? "Global";
          const count = Array.isArray((p as any).applies_to_establishment_ids)
            ? ((p as any).applies_to_establishment_ids as unknown[]).length
            : 0;
          const estLabel = count > 0 ? `${count} établissement${count > 1 ? "s" : ""}` : "Tous";

          return (
            <div className="space-y-0.5">
              <div className="text-sm">{serviceLabel}</div>
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

  const updatePromo = async (promoId: string, patch: AdminVisibilityPromoCodeInput) => {
    setSavingPromoId(promoId);
    try {
      await updateAdminVisibilityPromoCode(undefined, promoId, patch);
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
      await deleteAdminVisibilityPromoCode(undefined, promoId);
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

    setSavingPromoId("new");
    try {
      const appliesToEstablishmentIds = newPromo.audience === "selected" ? newPromo.establishmentIds : null;
      if (newPromo.audience === "selected" && !appliesToEstablishmentIds.length) {
        onToast({ title: "Code promo", description: "Sélectionne au moins 1 établissement.", variant: "destructive" });
        return false;
      }

      await createAdminVisibilityPromoCode(undefined, {
        code,
        discount_bps: bps,
        applies_to_type: newPromo.scopeType || null,
        applies_to_establishment_ids: appliesToEstablishmentIds,
        active: true,
      });
      setNewPromo({ code: "", percent: "", scopeType: "", audience: "all", establishmentIds: [] });
      onToast({ title: "Code promo créé", description: code });
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
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Codes promo PRO (Visibilité)</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Codes promo pour les offres de visibilité (SAM Media).</div>
                <div className="text-slate-500">Global ou par service (Menu Digital, Packs, Options, etc.)</div>
              </div>
            }
          />
        </div>
        <Button variant="outline" onClick={() => setPromoDialogOpen(true)} disabled={loading}>
          Nouveau code
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <AdminDataTable<AdminVisibilityPromoCode>
          data={promoCodes}
          columns={promoColumns}
          searchPlaceholder="Rechercher par code…"
          isLoading={loading}
        />

        <Dialog open={promoDialogOpen} onOpenChange={(v) => setPromoDialogOpen(v)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Créer un code promo PRO</DialogTitle>
              <DialogDescription>Remise (%) + portée (global ou par service de visibilité).</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input
                  value={newPromo.code}
                  onChange={(e) => setNewPromo((p) => ({ ...p, code: e.target.value }))}
                  placeholder="EX: SAM10"
                />
              </div>

              <div className="space-y-1">
                <Label>Remise (%)</Label>
                <Input
                  value={newPromo.percent}
                  onChange={(e) => setNewPromo((p) => ({ ...p, percent: e.target.value }))}
                  placeholder="10"
                  inputMode="decimal"
                />
              </div>

              <div className="space-y-1">
                <Label>Portée (service)</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newPromo.scopeType}
                  onChange={(e) => setNewPromo((p) => ({ ...p, scopeType: e.target.value }))}
                >
                  {SCOPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Établissements</Label>

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
                    <RadioGroupItem id="visibility_promo_est_all" value="all" />
                    <Label htmlFor="visibility_promo_est_all" className="font-normal">
                      Tous les établissements
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="visibility_promo_est_selected" value="selected" />
                    <Label htmlFor="visibility_promo_est_selected" className="font-normal">
                      Établissements sélectionnés
                    </Label>
                  </div>
                </RadioGroup>

                {newPromo.audience === "selected" ? (
                  <div className="space-y-2">
                    <Input
                      value={establishmentSearch}
                      onChange={(e) => setEstablishmentSearch(e.target.value)}
                      placeholder="Rechercher un établissement…"
                    />

                    <div className="text-xs text-slate-500">
                      Sélectionnés: <span className="font-medium">{newPromo.establishmentIds.length}</span>
                    </div>

                    <ScrollArea className="h-56 rounded-md border border-slate-200">
                      <div className="p-2">
                        {(() => {
                          const q = establishmentSearch.trim().toLowerCase();
                          const list = (establishments ?? [])
                            .filter((e) => {
                              const name = String((e as any).name ?? "").toLowerCase();
                              const city = String((e as any).city ?? "").toLowerCase();
                              if (!q) return true;
                              return name.includes(q) || city.includes(q);
                            })
                            .slice(0, 200);

                          if (!list.length) {
                            return <div className="p-2 text-sm text-slate-500">Aucun établissement</div>;
                          }

                          return list.map((e) => {
                            const id = String((e as any).id ?? "");
                            if (!id) return null;
                            const checked = newPromo.establishmentIds.includes(id);
                            const label = `${String((e as any).name ?? "Sans nom")}${(e as any).city ? ` • ${(e as any).city}` : ""}`;

                            return (
                              <label
                                key={id}
                                className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(next) => {
                                    const isOn = Boolean(next);
                                    setNewPromo((p) => {
                                      const prev = p.establishmentIds;
                                      const exists = prev.includes(id);
                                      const nextIds = isOn
                                        ? exists
                                          ? prev
                                          : [...prev, id]
                                        : prev.filter((x) => x !== id);
                                      return { ...p, establishmentIds: nextIds };
                                    });
                                  }}
                                />
                                <span className="text-sm">{label}</span>
                              </label>
                            );
                          });
                        })()}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Le code promo sera valable pour tous les établissements.</div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                onClick={() => setPromoDialogOpen(false)}
                disabled={savingPromoId === "new"}
              >
                Annuler
              </Button>
              <Button
                disabled={savingPromoId === "new"}
                onClick={async () => {
                  const ok = await createPromo();
                  if (ok) setPromoDialogOpen(false);
                }}
              >
                {savingPromoId === "new" ? "…" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
