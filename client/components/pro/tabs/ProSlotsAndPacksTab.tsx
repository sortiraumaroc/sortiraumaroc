import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import {
  createProPack,
  deleteProPack,
  deleteProSlot,
  listProOffers,
  listProReservations,
  upsertProSlots,
} from "@/lib/pro/api";
import type { Establishment, Pack, ProRole, ProSlot, Reservation } from "@/lib/pro/types";
import { ProSlotDetailsDialog } from "@/components/pro/slots/ProSlotDetailsDialog";
import { isReservationInPast } from "@/components/pro/reservations/reservationHelpers";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

function canWrite(role: ProRole): boolean {
  return role === "owner" || role === "manager" || role === "marketing";
}

function formatMoney(amount: number | null | undefined, currency: string) {
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("fr-MA", { style: "currency", currency }).format(n / 100);
}

export function ProSlotsAndPacksTab({ establishment, role }: Props) {
  const [slots, setSlots] = useState<ProSlot[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [waitlistBySlotId, setWaitlistBySlotId] = useState<Record<string, number>>({});
  const [slotDetailsId, setSlotDetailsId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newSlot, setNewSlot] = useState({
    startsAt: "",
    endsAt: "",
    intervalMinutes: "30",
    serviceLabel: "",
    capacity: "",
    basePrice: "",
    promoType: "percent",
    promoValue: "",
    promoLabel: "",
  });

  const [newPack, setNewPack] = useState({
    title: "",
    description: "",
    label: "",
    price: "",
    originalPrice: "",
    stock: "",
    validFrom: "",
    validTo: "",
    conditions: "",
  });

  const load = async () => {
    setLoading(true);
    setError(null);

    const [offersRes, reservationsRes] = await Promise.all([
      listProOffers(establishment.id).catch(() => null),
      listProReservations(establishment.id).catch(() => null),
    ]);

    if (!offersRes) setError("Impossible de charger les offres (créneaux/packs).");
    if (!reservationsRes) setError((prev) => prev ?? "Impossible de charger les réservations.");

    const slotsData = ((offersRes as { slots?: unknown[] } | null)?.slots ?? []) as ProSlot[];
    const packsData = ((offersRes as { packs?: unknown[] } | null)?.packs ?? []) as Pack[];

    setSlots(slotsData);
    setPacks(packsData);

    const reservations = ((reservationsRes as { reservations?: unknown[] } | null)?.reservations ?? []) as Reservation[];
    const wl: Record<string, number> = {};
    const nowMs = Date.now();
    for (const r of reservations) {
      if (!r || r.status !== "waitlist") continue;
      if (isReservationInPast(r, nowMs)) continue;
      if (!r.slot_id) continue;
      wl[r.slot_id] = (wl[r.slot_id] ?? 0) + 1;
    }
    setWaitlistBySlotId(wl);

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [establishment.id]);

  const slotsCount = useMemo(() => slots.filter((x) => x.active).length, [slots]);

  const detailsSlot = useMemo(() => {
    if (!slotDetailsId) return null;
    return slots.find((s) => s.id === slotDetailsId) ?? null;
  }, [slotDetailsId, slots]);

  const detailsWaitlistCount = detailsSlot ? (waitlistBySlotId[detailsSlot.id] ?? 0) : 0;

  const createSlot = async () => {
    if (!canWrite(role)) return;
    setError(null);

    const startsDt = newSlot.startsAt ? new Date(newSlot.startsAt) : null;
    const endsRangeDt = newSlot.endsAt ? new Date(newSlot.endsAt) : null;
    const capacity = Number(newSlot.capacity);
    const intervalMinutes = Math.round(Number(newSlot.intervalMinutes) || 30);

    if (!startsDt || !Number.isFinite(startsDt.getTime()) || !Number.isFinite(capacity) || capacity <= 0) {
      setError("Date/heure de début et capacité sont requises.");
      return;
    }

    if (![15, 30, 45, 60].includes(intervalMinutes)) {
      setError("Intervalle invalide (15 / 30 / 45 / 60 min).");
      return;
    }

    if (endsRangeDt && Number.isFinite(endsRangeDt.getTime()) && endsRangeDt.getTime() <= startsDt.getTime()) {
      setError("La fin doit être après le début.");
      return;
    }

    const basePrice = newSlot.basePrice.trim() ? Math.round(Number(newSlot.basePrice) * 100) : null;
    const promoValue = newSlot.promoValue.trim() ? Math.round(Number(newSlot.promoValue)) : null;
    const serviceLabel = newSlot.serviceLabel.trim() || null;

    const rows: Array<Record<string, unknown>> = [];

    const rangeEnd = endsRangeDt && Number.isFinite(endsRangeDt.getTime()) ? endsRangeDt : null;
    const slotEnd = (start: Date) => {
      const dt = new Date(start);
      dt.setMinutes(dt.getMinutes() + intervalMinutes);
      return dt;
    };

    if (!rangeEnd) {
      const s = new Date(startsDt);
      rows.push({
        establishment_id: establishment.id,
        starts_at: s.toISOString(),
        ends_at: slotEnd(s).toISOString(),
        capacity,
        base_price: basePrice,
        promo_type: promoValue ? newSlot.promoType : null,
        promo_value: promoValue,
        promo_label: newSlot.promoLabel.trim() || null,
        service_label: serviceLabel,
        active: true,
      });
    } else {
      let cursor = new Date(startsDt);
      let guard = 0;
      while (cursor.getTime() < rangeEnd.getTime() && guard < 500) {
        const s = new Date(cursor);
        const e = slotEnd(s);
        if (e.getTime() > rangeEnd.getTime()) break;

        rows.push({
          establishment_id: establishment.id,
          starts_at: s.toISOString(),
          ends_at: e.toISOString(),
          capacity,
          base_price: basePrice,
          promo_type: promoValue ? newSlot.promoType : null,
          promo_value: promoValue,
          promo_label: newSlot.promoLabel.trim() || null,
          service_label: serviceLabel,
          active: true,
        });

        cursor = e;
        guard += 1;
      }

      if (!rows.length) {
        setError("Aucun créneau généré. Vérifiez le début/fin et l’intervalle.");
        return;
      }
    }

    try {
      await upsertProSlots({ establishmentId: establishment.id, slots: rows });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de sauvegarder les créneaux.");
      return;
    }

    setNewSlot({
      startsAt: "",
      endsAt: "",
      intervalMinutes: "30",
      serviceLabel: "",
      capacity: "",
      basePrice: "",
      promoType: "percent",
      promoValue: "",
      promoLabel: "",
    });
    await load();
  };

  const deleteSlot = async (id: string) => {
    if (!canWrite(role)) return;
    try {
      await deleteProSlot({ establishmentId: establishment.id, slotId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de supprimer le créneau.");
      return;
    }
    await load();
  };

  const createPack = async () => {
    if (!canWrite(role)) return;
    setError(null);

    const title = newPack.title.trim();
    const price = Math.round(Number(newPack.price) * 100);
    if (!title || !Number.isFinite(price) || price <= 0) {
      setError("Titre et prix sont requis.");
      return;
    }

    const originalPrice = newPack.originalPrice.trim() ? Math.round(Number(newPack.originalPrice) * 100) : null;
    const stock = newPack.stock.trim() ? Math.round(Number(newPack.stock)) : null;

    try {
      await createProPack({
        establishmentId: establishment.id,
        pack: {
          title,
          description: newPack.description.trim() || null,
          label: newPack.label.trim() || null,
          price,
          original_price: originalPrice,
          is_limited: stock !== null,
          stock,
          availability: "permanent",
          valid_from: newPack.validFrom || null,
          valid_to: newPack.validTo || null,
          conditions: newPack.conditions.trim() || null,
          active: true,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de créer le pack.");
      return;
    }

    setNewPack({
      title: "",
      description: "",
      label: "",
      price: "",
      originalPrice: "",
      stock: "",
      validFrom: "",
      validTo: "",
      conditions: "",
    });

    await load();
  };

  const deletePack = async (id: string) => {
    if (!canWrite(role)) return;
    try {
      await deleteProPack({ establishmentId: establishment.id, packId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de supprimer le pack.");
      return;
    }
    await load();
  };

  return (
    <div className="space-y-6">
      <ProSlotDetailsDialog
        open={!!slotDetailsId}
        onOpenChange={(open) => {
          if (!open) setSlotDetailsId(null);
        }}
        slot={detailsSlot}
        waitlistCount={detailsWaitlistCount}
      />

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <Tabs defaultValue="slots">
        <TabsList className="bg-slate-100">
          <TabsTrigger value="slots" className="font-bold">
            Créneaux <span className="ml-2 text-xs text-slate-500">({slotsCount})</span>
          </TabsTrigger>
          <TabsTrigger value="packs" className="font-bold">
            Packs <span className="ml-2 text-xs text-slate-500">({packs.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slots" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Créer un créneau"
                description="Capacité, prix et promo par créneau."
              />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-2 space-y-2">
                <Label>Début</Label>
                <Input type="datetime-local" value={newSlot.startsAt} onChange={(e) => setNewSlot((p) => ({ ...p, startsAt: e.target.value }))} />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Fin (optionnel)</Label>
                <Input type="datetime-local" value={newSlot.endsAt} onChange={(e) => setNewSlot((p) => ({ ...p, endsAt: e.target.value }))} />
                <div className="text-xs text-slate-500">Si renseignée, on génère des créneaux entre Début et Fin.</div>
              </div>
              <div className="space-y-2">
                <Label>Intervalle</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newSlot.intervalMinutes}
                  onChange={(e) => setNewSlot((p) => ({ ...p, intervalMinutes: e.target.value }))}
                >
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Service</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newSlot.serviceLabel}
                  onChange={(e) => setNewSlot((p) => ({ ...p, serviceLabel: e.target.value }))}
                >
                  <option value="">(Auto)</option>
                  <option value="Petit-déjeuner">Petit-déjeuner</option>
                  <option value="Déjeuner">Déjeuner</option>
                  <option value="Tea Time">Tea Time</option>
                  <option value="Happy Hour">Happy Hour</option>
                  <option value="Dîner">Dîner</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Capacité</Label>
                <Input value={newSlot.capacity} onChange={(e) => setNewSlot((p) => ({ ...p, capacity: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix (MAD)</Label>
                <Input value={newSlot.basePrice} onChange={(e) => setNewSlot((p) => ({ ...p, basePrice: e.target.value }))} />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Promo label</Label>
                <Input value={newSlot.promoLabel} onChange={(e) => setNewSlot((p) => ({ ...p, promoLabel: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Promo type</Label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newSlot.promoType}
                  onChange={(e) => setNewSlot((p) => ({ ...p, promoType: e.target.value }))}
                >
                  <option value="percent">%</option>
                  <option value="amount">Montant</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Promo valeur</Label>
                <Input value={newSlot.promoValue} onChange={(e) => setNewSlot((p) => ({ ...p, promoValue: e.target.value }))} />
              </div>

              <div className="md:col-span-6">
                <Button className="bg-primary text-white hover:bg-primary/90 font-bold gap-2" disabled={!canWrite(role)} onClick={createSlot}>
                  <Plus className="w-4 h-4" />
                  Ajouter
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Créneaux</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-slate-600">Chargement…</div>
              ) : slots.length ? (
                <>
                  <div className="md:hidden space-y-3">
                    {slots.map((s) => {
                      const start = new Date(s.starts_at);
                      const end = s.ends_at ? new Date(s.ends_at) : null;
                      const remaining = (s as unknown as { remaining_capacity?: number | null }).remaining_capacity;
                      const wlCount = waitlistBySlotId[s.id] ?? 0;
                      return (
                        <div key={s.id} className="rounded-xl border bg-white p-4 space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-xs text-slate-500">Début</div>
                              <div className="font-semibold whitespace-nowrap">
                                {Number.isFinite(start.getTime()) ? start.toLocaleString("fr-FR") : s.starts_at}
                              </div>
                              <div className="mt-2 text-xs text-slate-500">Fin</div>
                              <div className="text-sm text-slate-700 whitespace-nowrap">
                                {end && Number.isFinite(end.getTime()) ? end.toLocaleString("fr-FR") : "—"}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <Button variant="outline" size="sm" className="gap-2" onClick={() => setSlotDetailsId(s.id)}>
                                <Eye className="w-4 h-4" />
                                Détails
                              </Button>
                              <Button variant="outline" size="sm" className="gap-2" disabled={!canWrite(role)} onClick={() => deleteSlot(s.id)}>
                                <Trash2 className="w-4 h-4" />
                                Supprimer
                              </Button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-xs text-slate-500">Capacité</div>
                              <div className="font-semibold tabular-nums">{s.capacity}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-500">Prix</div>
                              <div className="font-semibold tabular-nums whitespace-nowrap">{formatMoney(s.base_price, "MAD")}</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Restant</div>
                            <div className="text-sm font-semibold tabular-nums text-slate-900">{typeof remaining === "number" ? remaining : "—"}</div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">WL</div>
                            <div className="mt-1">
                              {wlCount ? (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200">WL {wlCount}</Badge>
                              ) : (
                                <span className="text-sm text-slate-600">0</span>
                              )}
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Service</div>
                            <div className="text-sm text-slate-700">{s.service_label || "Auto"}</div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Promo</div>
                            <div className="mt-1">
                              {s.promo_type ? (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                                  {s.promo_label || "Promo"} {s.promo_type === "percent" ? `${s.promo_value}%` : `${s.promo_value} MAD`}
                                </Badge>
                              ) : (
                                <span className="text-sm text-slate-600">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[980px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Début</TableHead>
                          <TableHead>Fin</TableHead>
                          <TableHead>Capacité</TableHead>
                          <TableHead>Prix</TableHead>
                          <TableHead>Restant</TableHead>
                          <TableHead>WL</TableHead>
                          <TableHead>Service</TableHead>
                          <TableHead>Promo</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {slots.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="whitespace-nowrap">{new Date(s.starts_at).toLocaleString("fr-FR")}</TableCell>
                            <TableCell className="whitespace-nowrap">{s.ends_at ? new Date(s.ends_at).toLocaleString("fr-FR") : "—"}</TableCell>
                            <TableCell className="tabular-nums">{s.capacity}</TableCell>
                            <TableCell className="whitespace-nowrap">{formatMoney(s.base_price, "MAD")}</TableCell>
                            <TableCell className="tabular-nums">
                              {typeof (s as unknown as { remaining_capacity?: number | null }).remaining_capacity === "number"
                                ? (s as unknown as { remaining_capacity?: number | null }).remaining_capacity
                                : "—"}
                            </TableCell>
                            <TableCell>
                              {waitlistBySlotId[s.id] ? (
                                <Badge className="bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">WL {waitlistBySlotId[s.id]}</Badge>
                              ) : (
                                <span className="text-sm text-slate-600">0</span>
                              )}
                            </TableCell>
                            <TableCell>{s.service_label || "Auto"}</TableCell>
                            <TableCell>
                              {s.promo_type ? (
                                <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                                  {s.promo_label || "Promo"} {s.promo_type === "percent" ? `${s.promo_value}%` : `${s.promo_value} MAD`}
                                </Badge>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="outline" size="sm" className="gap-2" onClick={() => setSlotDetailsId(s.id)}>
                                  <Eye className="w-4 h-4" />
                                  Détails
                                </Button>
                                <Button variant="outline" size="sm" className="gap-2" disabled={!canWrite(role)} onClick={() => deleteSlot(s.id)}>
                                  <Trash2 className="w-4 h-4" />
                                  Supprimer
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Aucun créneau pour le moment.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packs" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <SectionHeader
                title="Créer un pack"
                description="Ex: Nouvel An, Ftour Ramadan, Pack 10 séances."
              />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-3 space-y-2">
                <Label>Titre</Label>
                <Input value={newPack.title} onChange={(e) => setNewPack((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div className="md:col-span-3 space-y-2">
                <Label>Label</Label>
                <Input value={newPack.label} onChange={(e) => setNewPack((p) => ({ ...p, label: e.target.value }))} />
              </div>
              <div className="md:col-span-6 space-y-2">
                <Label>Description</Label>
                <Textarea value={newPack.description} onChange={(e) => setNewPack((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix (MAD)</Label>
                <Input value={newPack.price} onChange={(e) => setNewPack((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Prix barré (MAD)</Label>
                <Input value={newPack.originalPrice} onChange={(e) => setNewPack((p) => ({ ...p, originalPrice: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Stock (optionnel)</Label>
                <Input value={newPack.stock} onChange={(e) => setNewPack((p) => ({ ...p, stock: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Début validité</Label>
                <Input type="date" value={newPack.validFrom} onChange={(e) => setNewPack((p) => ({ ...p, validFrom: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-3">
                <Label>Fin validité</Label>
                <Input type="date" value={newPack.validTo} onChange={(e) => setNewPack((p) => ({ ...p, validTo: e.target.value }))} />
              </div>
              <div className="md:col-span-6 space-y-2">
                <Label>Conditions</Label>
                <Textarea value={newPack.conditions} onChange={(e) => setNewPack((p) => ({ ...p, conditions: e.target.value }))} />
              </div>
              <div className="md:col-span-6">
                <Button className="bg-primary text-white hover:bg-primary/90 font-bold gap-2" disabled={!canWrite(role)} onClick={createPack}>
                  <Save className="w-4 h-4" />
                  Enregistrer
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Packs</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-slate-600">Chargement…</div>
              ) : packs.length ? (
                <>
                  <div className="md:hidden space-y-3">
                    {packs.map((p) => (
                      <div key={p.id} className="rounded-xl border bg-white p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{p.title}</div>
                            {p.label ? <div className="text-xs text-slate-600">{p.label}</div> : null}
                          </div>
                          <Button variant="outline" size="sm" className="gap-2" disabled={!canWrite(role)} onClick={() => deletePack(p.id)}>
                            <Trash2 className="w-4 h-4" />
                            Supprimer
                          </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Prix</div>
                            <div className="font-semibold tabular-nums whitespace-nowrap">{formatMoney(p.price, "MAD")}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Stock</div>
                            <div className="font-semibold tabular-nums">{p.stock ?? "—"}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-slate-500">Validité</div>
                            <div className="text-sm text-slate-700 whitespace-nowrap">
                              {p.valid_from || p.valid_to ? `${p.valid_from ?? ""} → ${p.valid_to ?? ""}` : "—"}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-500">Actif</div>
                            <div className="font-semibold">{p.active ? "Oui" : "Non"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[920px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Titre</TableHead>
                          <TableHead>Prix</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Validité</TableHead>
                          <TableHead>Actif</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {packs.map((p) => (
                          <TableRow key={p.id}>
                            <TableCell>
                              <div className="font-semibold">{p.title}</div>
                              {p.label ? <div className="text-xs text-slate-600">{p.label}</div> : null}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{formatMoney(p.price, "MAD")}</TableCell>
                            <TableCell className="tabular-nums">{p.stock ?? "—"}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {p.valid_from || p.valid_to ? `${p.valid_from ?? ""} → ${p.valid_to ?? ""}` : "—"}
                            </TableCell>
                            <TableCell>{p.active ? "Oui" : "Non"}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Button variant="outline" size="sm" className="gap-2" disabled={!canWrite(role)} onClick={() => deletePack(p.id)}>
                                <Trash2 className="w-4 h-4" />
                                Supprimer
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Aucun pack pour le moment.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!canWrite(role) ? (
        <div className="text-sm text-slate-600">Votre rôle ne permet pas de créer/modifier les créneaux et packs.</div>
      ) : null}
    </div>
  );
}
