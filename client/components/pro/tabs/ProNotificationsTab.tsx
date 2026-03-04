import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";

import {
  getProNotificationPreferences,
  setProNotificationPreferences,
  subscribeToProNotificationPreferencesChanges,
  loadProNotificationPreferencesFromBackend,
} from "@/lib/pro/notificationPreferences";

import {
  buildDemoNotificationsForToday,
  buildSystemNotificationsForToday,
  filterNotificationsForDay,
  filterNotificationsForEstablishment,
  formatRelativeTimeFr,
  getLocalDayWindow,
  getNotificationTargetTab,
  sortNotificationsByCreatedAtDesc,
} from "@/lib/pro/notifications";
import { isDemoModeEnabled } from "@/lib/demoMode";
import { getProDashboardAlerts, markProNotificationRead } from "@/lib/pro/api";
import type { Establishment, ProInvoice, ProNotification } from "@/lib/pro/types";

import { NotificationBody } from "@/components/NotificationBody";
import { formatHeureHhHMM } from "@shared/datetime";

type Props = {
  establishment: Establishment;
  user: User;
  onNavigateToTab?: (tab: string) => void;
};

function categoryBadge(category: string) {
  const base = "bg-slate-100 text-slate-700 border-slate-200";
  if (category === "moderation") return "bg-amber-100 text-amber-700 border-amber-200";
  if (category === "billing") return "bg-red-100 text-red-700 border-red-200";
  if (category === "booking") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (category === "messages") return "bg-sky-100 text-sky-700 border-sky-200";
  if (category === "visibility") return "bg-violet-100 text-violet-700 border-violet-200";
  return base;
}

function isLocalOnlyNotificationId(id: string) {
  return id.startsWith("demo-") || id.startsWith("demo-today-") || id.startsWith("system-") || id.startsWith("system:");
}

export function ProNotificationsTab({ establishment, user, onNavigateToTab }: Props) {
  const [items, setItems] = useState<ProNotification[]>([]);
  const [invoicesDue, setInvoicesDue] = useState<ProInvoice[]>([]);
  const [preferences, setPreferences] = useState(() => getProNotificationPreferences());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);

    const { start, end } = getLocalDayWindow(new Date());

    try {
      const res = await getProDashboardAlerts(establishment.id);
      const invoices = (res.invoicesDue ?? []) as ProInvoice[];
      const notifications = (res.notifications ?? []) as ProNotification[];

      setInvoicesDue(invoices);

      const today = filterNotificationsForDay(notifications);
      const scoped = establishment.id ? filterNotificationsForEstablishment(today, establishment.id) : today;
      setItems(sortNotificationsByCreatedAtDesc(scoped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setInvoicesDue([]);
      setItems([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    void load();
    // Sync preferences from backend on mount (best-effort)
    void loadProNotificationPreferencesFromBackend().then((prefs) => {
      setPreferences(prefs);
    });
  }, [user.id, establishment.id]);

  useEffect(() => {
    return subscribeToProNotificationPreferencesChanges(() => {
      setPreferences(getProNotificationPreferences());
    });
  }, []);

  const systemItems = useMemo(
    () =>
      buildSystemNotificationsForToday({
        userId: user.id,
        establishment,
        invoicesDue,
      }),
    [establishment, invoicesDue, user.id],
  );

  const demoItems = useMemo(() => buildDemoNotificationsForToday(user.id, establishment.id ?? null), [establishment.id, user.id]);

  const activeItems = useMemo(() => {
    const base = items.length ? items : isDemoModeEnabled() ? demoItems : [];
    return sortNotificationsByCreatedAtDesc([...systemItems, ...base]);
  }, [demoItems, items, systemItems]);

  const unread = useMemo(() => activeItems.filter((x) => !x.read_at).length, [activeItems]);

  const markRead = async (id: string) => {
    if (isLocalOnlyNotificationId(id)) return;

    setSaving(id);
    try {
      await markProNotificationRead({ establishmentId: establishment.id, notificationId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
    await load();
    setSaving(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Non lues</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-extrabold tabular-nums">{unread}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-slate-600">Période</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">Aujourd’hui</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Préférences"
            description="Activez/désactivez les pop-ups et le son."
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Pop-ups temps réel</div>
              <div className="mt-1 text-xs text-slate-500">Affiche une notification visuelle lors d’un nouvel événement.</div>
            </div>
            <Switch
              checked={preferences.popupsEnabled}
              onCheckedChange={(checked) => setProNotificationPreferences({ ...preferences, popupsEnabled: checked })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">Son</div>
              <div className="mt-1 text-xs text-slate-500">Joue un petit son à l’arrivée d’une notification.</div>
            </div>
            <Switch checked={preferences.soundEnabled} onCheckedChange={(checked) => setProNotificationPreferences({ ...preferences, soundEnabled: checked })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Notifications"
            description="Alertes du jour (réservations, messages, modération, facturation, visibilité)."
          />
        </CardHeader>
        <CardContent>
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {loading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Chargement…
            </div>
          ) : activeItems.length ? (
            <>
              <div className="md:hidden space-y-3">
                {activeItems.map((n) => {
                  const targetTab = getNotificationTargetTab(n);
                  const canNavigate = !!targetTab && !!onNavigateToTab;
                  const time = formatHeureHhHMM(n.created_at);

                  return (
                    <div key={n.id} className="rounded-xl border bg-white p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={categoryBadge(n.category)}>{n.category}</Badge>
                            <div className="text-xs text-slate-500 whitespace-nowrap">{formatRelativeTimeFr(n.created_at)} · {time}</div>
                          </div>
                          <div className="mt-2 font-semibold text-slate-900">{n.title}</div>
                          <NotificationBody body={n.body} className="mt-1 text-xs text-slate-600" dateClassName="text-[0.7rem]" />
                          <div className="mt-2 text-xs text-slate-500">Statut: {n.read_at ? "Lu" : "Non lu"}</div>
                        </div>

                        <div className="flex flex-col gap-2 shrink-0">
                          {canNavigate ? (
                            <Button variant="outline" size="sm" className="gap-2" onClick={() => onNavigateToTab(targetTab)}>
                              <ExternalLink className="w-4 h-4" />
                              Ouvrir
                            </Button>
                          ) : null}

                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={isLocalOnlyNotificationId(n.id) || !!n.read_at || saving === n.id}
                            onClick={() => markRead(n.id)}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Marquer lu
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[860px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Catégorie</TableHead>
                      <TableHead>Titre</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-end">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeItems.map((n) => {
                      const targetTab = getNotificationTargetTab(n);
                      const canNavigate = !!targetTab && !!onNavigateToTab;

                      return (
                        <TableRow key={n.id}>
                          <TableCell>
                            <div className="text-sm font-semibold text-slate-900">{formatRelativeTimeFr(n.created_at)}</div>
                            <div className="text-xs text-slate-500 tabular-nums">{formatHeureHhHMM(n.created_at)}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={categoryBadge(n.category)}>{n.category}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="font-semibold">{n.title}</div>
                            <NotificationBody body={n.body} className="text-xs text-slate-600" dateClassName="text-[0.7rem]" />
                          </TableCell>
                          <TableCell>{n.read_at ? "Lu" : "Non lu"}</TableCell>
                          <TableCell className="text-end whitespace-nowrap">
                            {canNavigate ? (
                              <Button variant="outline" size="sm" className="gap-2 me-2" onClick={() => onNavigateToTab(targetTab)}>
                                <ExternalLink className="w-4 h-4" />
                                Ouvrir
                              </Button>
                            ) : null}

                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={isLocalOnlyNotificationId(n.id) || !!n.read_at || saving === n.id}
                              onClick={() => markRead(n.id)}
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Marquer lu
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-600">Aucune notification aujourd’hui.</div>
          )}

          {!items.length ? <div className="mt-3 text-xs text-slate-500">Mode démo : affichage des alertes du jour.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
