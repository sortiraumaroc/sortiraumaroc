import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminApiError, createAdminCity, deleteAdminCity, updateAdminCity, type AdminCity } from "@/lib/adminApi";

import { normalizeText } from "../utils";
import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";

function cityLabel(c: AdminCity): string {
  return c.name || "(sans nom)";
}

export function CitiesSettingsCard(props: {
  cities: AdminCity[];
  onCitiesChange: (next: AdminCity[]) => void;
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { cities, onCitiesChange, onReport, onToast } = props;

  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftActive, setDraftActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(() => {
    return [...cities].sort((a, b) => cityLabel(a).localeCompare(cityLabel(b), "fr"));
  }, [cities]);

  const create = async () => {
    const name = normalizeText(draftName);
    if (!name) {
      onToast({ title: "❌ Erreur", description: "Nom de ville requis", variant: "destructive" });
      return;
    }

    if (sorted.some((c) => normalizeText(c.name).toLowerCase() === name.toLowerCase())) {
      onToast({ title: "⚠️ Rien à faire", description: "Cette ville existe déjà." });
      onReport({ noop: 1 });
      return;
    }

    setSaving(true);
    try {
      const res = await createAdminCity(undefined, { name, active: draftActive });
      onCitiesChange([...cities, res.item]);
      onToast({ title: "✔️ Paramètres mis à jour", description: `Ville ajoutée : ${name}` });
      onReport({ created: 1 });
      setOpen(false);
      setDraftName("");
      setDraftActive(true);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (city: AdminCity, nextActive: boolean) => {
    if (city.active === nextActive) {
      onToast({ title: "⚠️ Rien à faire", description: "Aucun changement." });
      onReport({ noop: 1 });
      return;
    }

    setSaving(true);
    try {
      const res = await updateAdminCity(undefined, { id: city.id, active: nextActive });
      onCitiesChange(cities.map((c) => (c.id === city.id ? res.item : c)));
      onToast({ title: "✔️ Paramètres mis à jour", description: `${cityLabel(city)} → ${nextActive ? "Activée" : "Désactivée"}` });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (city: AdminCity) => {
    setSaving(true);
    try {
      await deleteAdminCity(undefined, city.id);
      onCitiesChange(cities.filter((c) => c.id !== city.id));
      onToast({ title: "✔️ Paramètres mis à jour", description: `Ville supprimée : ${cityLabel(city)}` });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Villes & zones</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Gestion des villes affichées côté USER/Pro.</div>
                <div className="text-slate-500">Table : admin_cities</div>
              </div>
            }
          />
        </div>
        <Button onClick={() => setOpen(true)} disabled={saving}>
          + Ajouter ville
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!sorted.length ? <div className="text-sm text-slate-600">Aucune ville pour le moment.</div> : null}

        <div className="space-y-2">
          {sorted.map((city) => (
            <div key={city.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900 truncate">{cityLabel(city)}</div>
                <div className="text-xs text-slate-500">{city.active ? "Visible pour réservation" : "Masquée USER/Pro"}</div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={city.active} disabled={saving} onCheckedChange={(v) => void toggleActive(city, v)} />
                <Button variant="outline" size="sm" disabled={saving} onClick={() => void remove(city)}>
                  Supprimer
                </Button>
              </div>
            </div>
          ))}
        </div>

        <Dialog open={open} onOpenChange={(v) => (!saving ? setOpen(v) : null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ajouter une ville</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="text-xs font-semibold text-slate-600">Nom</div>
                <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Casablanca" />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Activer pour réservation</div>
                  <InfoTooltip content={<>Si OFF → ville masquée côté USER/Pro.</>} />
                </div>
                <Switch checked={draftActive} onCheckedChange={setDraftActive} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                Annuler
              </Button>
              <Button onClick={() => void create()} disabled={saving}>
                {saving ? "Enregistrement…" : "Créer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
