import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
  listAdminVisibilityOffers,
  listAdminVisibilityPromoCodes,
  listEstablishments,
  updateAdminVisibilityOffer,
  updateAdminVisibilityPromoCode,
  type AdminVisibilityOffer,
  type AdminVisibilityPromoCode,
  type AdminVisibilityPromoCodeInput,
  type Establishment,
} from "@/lib/adminApi";

import type { ColumnDef } from "@tanstack/react-table";

type Props = {
  onToast: (t: { title?: string; description?: string; variant?: "default" | "destructive" }) => void;
};

function madStringFromCents(cents: number | null) {
  if (cents == null || !Number.isFinite(cents)) return "";
  return (cents / 100).toFixed(2);
}

function centsFromMadString(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n * 100));
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

const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Global" },
  { value: "menu_digital", label: "Menu Digital" },
  { value: "pack", label: "SAM Media (packs)" },
  { value: "option", label: "Options" },
  { value: "media_video", label: "Média vidéo" },
  { value: "article_sponsorise", label: "Article sponsorisé" },
  { value: "newsletter", label: "Newsletter" },
];

export function VisibilitySettingsCard({ onToast }: Props) {
  const [offers, setOffers] = useState<AdminVisibilityOffer[]>([]);
  const [promoCodes, setPromoCodes] = useState<AdminVisibilityPromoCode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [savingOfferId, setSavingOfferId] = useState<string | null>(null);

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
      const [offersRes, promoRes, estRes] = await Promise.all([
        listAdminVisibilityOffers(undefined, { include_deleted: false }),
        listAdminVisibilityPromoCodes(undefined, { include_deleted: false }),
        listEstablishments(undefined, "active"),
      ]);

      setOffers(offersRes.offers ?? []);
      setPromoCodes(promoRes.promo_codes ?? []);
      setEstablishments(estRes.items ?? []);

      const nextDrafts: Record<string, string> = {};
      for (const o of offersRes.offers ?? []) {
        nextDrafts[o.id] = madStringFromCents(o.price_cents);
      }
      setDraftPrices(nextDrafts);
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

  const saveOffer = async (offer: AdminVisibilityOffer) => {
    const cents = centsFromMadString(draftPrices[offer.id] ?? "");

    setSavingOfferId(offer.id);
    try {
      await updateAdminVisibilityOffer(undefined, offer.id, {
        price_cents: cents,
        active: offer.active,
      });

      onToast({ title: "Tarif mis à jour", description: offer.title });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingOfferId(null);
    }
  };

  const toggleOfferActive = async (offer: AdminVisibilityOffer) => {
    setSavingOfferId(offer.id);
    try {
      await updateAdminVisibilityOffer(undefined, offer.id, { active: !offer.active });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSavingOfferId(null);
    }
  };

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex items-center gap-2">
          <CardTitle className="text-base leading-tight">Visibilité (SAM Media)</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Tarifs & codes promo (si prix = 0 → non achetable).</div>
                <div className="text-slate-500">Offres + promo-codes</div>
              </div>
            }
          />
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => void refresh()} disabled={loading}>
            {loading ? "…" : "Rafraîchir"}
          </Button>
          <Button className="w-full sm:w-auto" asChild variant="outline">
            <Link to="/admin/visibility">Ouvrir Visibilité</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Tarifs</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Règles</span>
                <InfoTooltip content={<>Active = visible + achetable • Prix &gt; 0 requis.</>} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="hidden md:grid grid-cols-12 gap-3 px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-600">
              <div className="col-span-5">Offre</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-2">Prix (MAD)</div>
              <div className="col-span-1">Statut</div>
              <div className="col-span-2 text-right">Action</div>
            </div>

            <div className="divide-y divide-slate-200">
              {offers.map((o) => {
                const busy = savingOfferId === o.id;
                return (
                  <div key={o.id} className="p-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:items-center">
                      <div className="md:col-span-5 min-w-0">
                        <div className="font-medium truncate">{o.title}</div>
                      </div>

                      <div className="md:col-span-2">
                        <div className="text-xs text-slate-500 md:text-sm">{o.type}</div>
                      </div>

                      <div className="md:col-span-2">
                        <Label className="md:hidden">Prix (MAD)</Label>
                        <Input
                          value={draftPrices[o.id] ?? ""}
                          onChange={(e) => setDraftPrices((p) => ({ ...p, [o.id]: e.target.value }))}
                          placeholder="0.00"
                          className="h-10"
                          inputMode="decimal"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <Button
                          size="sm"
                          variant={o.active ? "default" : "outline"}
                          disabled={busy}
                          onClick={() => void toggleOfferActive(o)}
                          className="w-full md:w-auto"
                        >
                          {o.active ? "Actif" : "Inactif"}
                        </Button>
                      </div>

                      <div className="md:col-span-2 flex md:justify-end">
                        <Button size="sm" disabled={busy} onClick={() => void saveOffer(o)} className="w-full md:w-auto">
                          {busy ? "…" : "Enregistrer"}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Codes promo</div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Portée</span>
                <InfoTooltip content={<>Global ou par service (Menu Digital, Packs, Options, Média vidéo).</>} />
              </div>
            </div>
            <Button variant="outline" onClick={() => setPromoDialogOpen(true)} disabled={loading}>
              Nouveau code
            </Button>
          </div>

          <AdminDataTable<AdminVisibilityPromoCode>
            data={promoCodes}
            columns={promoColumns}
            searchPlaceholder="Rechercher par code…"
            isLoading={loading}
          />

          <Dialog open={promoDialogOpen} onOpenChange={(v) => setPromoDialogOpen(v)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un code promo</DialogTitle>
                <DialogDescription>Remise (%) + portée (global ou par service).</DialogDescription>
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
                      <RadioGroupItem id="promo_est_all" value="all" />
                      <Label htmlFor="promo_est_all" className="font-normal">
                        Tous les établissements
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="promo_est_selected" value="selected" />
                      <Label htmlFor="promo_est_selected" className="font-normal">
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
        </div>
      </CardContent>
    </Card>
  );
}
