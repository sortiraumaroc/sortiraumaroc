import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, CheckCircle2, ExternalLink, Loader2, RefreshCcw, XCircle } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

import {
  adminHealth,
  getAdminNotificationsUnreadCount,
  listAdminEstablishmentReservations,
  listAdminLogs,
  listAdminWaitlist,
  listModerationQueue,
  listEstablishments,
} from "@/lib/adminApi";
import { getPublicEstablishment } from "@/lib/publicApi";

type CheckStatus = "idle" | "running" | "pass" | "fail";

type CheckState = {
  status: CheckStatus;
  message?: string;
  meta?: Record<string, unknown>;
};

type CheckDefinition = {
  id: string;
  title: string;
  description: string;
  link: { to: string; label: string };
  run: () => Promise<CheckState>;
};

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin" />;
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "fail") return <XCircle className="h-4 w-4 text-red-600" />;
  return <Activity className="h-4 w-4 text-slate-500" />;
}

function statusBadge(status: CheckStatus) {
  if (status === "pass") return { label: "OK", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "fail") return { label: "KO", cls: "bg-red-100 text-red-700 border-red-200" };
  if (status === "running") return { label: "En cours", cls: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "À tester", cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

async function resolveSampleEstablishmentId(): Promise<string> {
  const active = await listEstablishments(undefined, "active");
  const firstActive = (active.items ?? [])[0];
  if (firstActive?.id) return firstActive.id;

  const all = await listEstablishments(undefined);
  const first = (all.items ?? [])[0];
  if (first?.id) return first.id;

  throw new Error("Aucun établissement trouvé");
}

type PublicOffersCheckCandidate = {
  establishmentId: string;
  payload: Awaited<ReturnType<typeof getPublicEstablishment>>;
  candidatesChecked: number;
};

async function resolveSampleEstablishmentWithPublicOffers(): Promise<PublicOffersCheckCandidate> {
  const [activeRes, allRes] = await Promise.all([listEstablishments(undefined, "active"), listEstablishments(undefined)]);
  const ids: string[] = [];
  for (const row of [...(activeRes.items ?? []), ...(allRes.items ?? [])]) {
    const id = typeof (row as any)?.id === "string" ? String((row as any).id) : "";
    if (!id) continue;
    if (ids.includes(id)) continue;
    ids.push(id);
  }

  if (!ids.length) throw new Error("Aucun établissement trouvé");

  let firstPayload: Awaited<ReturnType<typeof getPublicEstablishment>> | null = null;
  let firstId: string | null = null;

  const maxChecks = 12;
  let checked = 0;

  for (const id of ids.slice(0, maxChecks)) {
    checked += 1;
    try {
      const payload = await getPublicEstablishment({ ref: id });
      if (!firstPayload) {
        firstPayload = payload;
        firstId = id;
      }

      const slots = payload.offers?.slots ?? [];
      const packs = payload.offers?.packs ?? [];
      const dates = payload.offers?.availableSlots ?? [];
      const hasAny = Boolean(slots.length || packs.length || dates.length);

      if (hasAny) return { establishmentId: id, payload, candidatesChecked: checked };
    } catch {
      // ignore: try next establishment
    }
  }

  if (firstPayload && firstId) return { establishmentId: firstId, payload: firstPayload, candidatesChecked: checked };
  throw new Error("Impossible de récupérer un établissement côté public");
}

export function AdminAuditTestsPage() {
  const [checks, setChecks] = useState<Record<string, CheckState>>({});

  const setCheck = (id: string, next: CheckState) => {
    setChecks((prev) => ({ ...prev, [id]: next }));
  };

  const run = async (id: string, fn: () => Promise<CheckState>) => {
    setCheck(id, { status: "running" });
    try {
      const res = await fn();
      setCheck(id, res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setCheck(id, { status: "fail", message: msg });
    }
  };

  const definitions = useMemo<CheckDefinition[]>(
    () => [
      {
          id: "admin.health",
          title: "API Superadmin",
          description: "Vérifie que /api/admin/* répond (session + serveur).",
          link: { to: "/admin/logs", label: "Logs" },
          run: async () => {
            const res = await adminHealth(undefined);
            if (res.ok !== true) return { status: "fail", message: "adminHealth a répondu ok=false" };
            return { status: "pass", message: "API admin opérationnelle" };
          },
        },
        {
          id: "public.establishment",
          title: "Public ↔ Établissement",
          description: "Vérifie qu’un établissement visible côté admin est récupérable côté public.",
          link: { to: "/admin/establishments", label: "Établissements" },
          run: async () => {
            const establishmentId = await resolveSampleEstablishmentId();
            const payload = await getPublicEstablishment({ ref: establishmentId });
            const id = payload.establishment?.id;
            if (!id) return { status: "fail", message: "Réponse public invalide (establishment.id manquant)" };
            const name = payload.establishment?.name ?? "(sans nom)";
            return {
              status: "pass",
              message: `OK — ${name}`,
              meta: { establishmentId },
            };
          },
        },
        {
          id: "public.slots",
          title: "Disponibilités (slots 30min)",
          description: "Vérifie que l’API public renvoie des offres et/ou des disponibilités de booking (availableSlots).",
          link: { to: "/admin/reservations", label: "Réservations" },
          run: async () => {
            const { establishmentId, payload, candidatesChecked } = await resolveSampleEstablishmentWithPublicOffers();

            const dates = payload.offers?.availableSlots ?? [];
            const packs = payload.offers?.packs ?? [];
            const slots = payload.offers?.slots ?? [];

            const hasAvailability = Array.isArray(dates) && dates.some((d) => (d.services ?? []).some((s) => (s.times ?? []).length));
            const hasOffers = Boolean(slots.length || packs.length);

            const msg = `slots=${slots.length} · dates=${dates.length} · packs=${packs.length}`;
            const checkedMsg = candidatesChecked > 1 ? ` · checked=${candidatesChecked}` : "";

            if (!hasOffers && !hasAvailability) {
              return {
                status: "fail",
                message: `Aucune offre / dispo visible (${msg}${checkedMsg})`,
                meta: { establishmentId },
              };
            }

            return {
              status: "pass",
              message: hasAvailability ? `Disponibilités OK (${msg}${checkedMsg})` : `Offres OK, mais pas de dispo aujourd’hui (${msg}${checkedMsg})`,
              meta: { establishmentId },
            };
          },
        },
        {
          id: "admin.reservations",
          title: "Admin ↔ Réservations",
          description: "Vérifie que la liste des réservations d’un établissement est accessible côté superadmin.",
          link: { to: "/admin/reservations", label: "Réservations" },
          run: async () => {
            const establishmentId = await resolveSampleEstablishmentId();
            const res = await listAdminEstablishmentReservations(undefined, establishmentId);
            const count = (res.items ?? []).length;
            return {
              status: "pass",
              message: `OK — ${count} réservations retournées`,
              meta: { establishmentId, count },
            };
          },
        },
        {
          id: "admin.moderation",
          title: "Modération établissement (diff)",
          description: "Vérifie que la file de modération est lisible et que les drafts existent.",
          link: { to: "/admin/moderation", label: "Modération" },
          run: async () => {
            const res = await listModerationQueue(undefined, "pending");
            const items = res.items ?? [];
            const pending = items.filter((x) => String((x as any).status ?? "") === "pending").length;
            return {
              status: "pass",
              message: `OK — ${items.length} items (pending=${pending})`,
              meta: { pending, total: items.length },
            };
          },
        },
        {
          id: "admin.notifications",
          title: "Notifications admin",
          description: "Vérifie le compteur non lu (cloche) et l’accès à la table admin_notifications.",
          link: { to: "/admin/notifications", label: "Notifications" },
          run: async () => {
            const res = await getAdminNotificationsUnreadCount(undefined);
            const unread = res.unread ?? 0;
            return { status: "pass", message: `OK — unread=${unread}`, meta: { unread } };
          },
        },
        {
          id: "admin.waitlist",
          title: "Admin ↔ Liste d’attente",
          description: "Vérifie que /api/admin/waitlist répond et que la page de monitoring est accessible.",
          link: { to: "/admin/waitlist", label: "Liste d’attente" },
          run: async () => {
            const establishmentId = await resolveSampleEstablishmentId();
            const res = await listAdminWaitlist(undefined, { establishment_id: establishmentId, limit: 10 });
            const count = (res.items ?? []).length;
            return { status: "pass", message: `OK — ${count} entrées retournées`, meta: { establishmentId, count } };
          },
        },
        {
          id: "admin.auditlog",
          title: "Audit log",
          description: "Vérifie que admin_audit_log est accessible via /api/admin/logs.",
          link: { to: "/admin/logs", label: "Journaux" },
          run: async () => {
            const res = await listAdminLogs(undefined, { limit: 5 });
            const count = (res.items ?? []).length;
            return { status: "pass", message: `OK — ${count} logs retournés`, meta: { count } };
          },
        },
    ],
    [],
  );

  const runAll = async () => {
    for (const def of definitions) {
      // Run sequentially: later checks depend on earlier connectivity.
      // eslint-disable-next-line no-await-in-loop
      await run(def.id, def.run);
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Audit & Tests"
        description="Checklist QA interne (superadmin) — diagnostics rapides et traçables."
      />

      <Card>
        <CardHeader>
          <SectionHeader
            title="Lancer une vérification"
            description="Chaque test affiche ✅ OK / ❌ KO + un message et des liens rapides. Objectif: détecter les ruptures USER ↔ Pro ↔ ADMIN."
          />
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2">
          <Button className="gap-2" onClick={() => void runAll()}>
            <RefreshCcw className="h-4 w-4" />
            Lancer tous les tests
          </Button>
          <Button variant="outline" asChild className="gap-2">
            <Link to="/admin/logs">
              <ExternalLink className="h-4 w-4" />
              Ouvrir les journaux
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {definitions.map((def) => {
          const state = checks[def.id] ?? { status: "idle" as const };
          const badge = statusBadge(state.status);

          return (
            <Card key={def.id}>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <StatusIcon status={state.status} />
                    {def.title}
                  </span>
                  <Badge className={badge.cls}>{badge.label}</Badge>
                </CardTitle>
                <div className="text-sm text-slate-500">{def.description}</div>
              </CardHeader>
              <CardContent className="space-y-3">
                {state.message ? <div className="text-sm text-slate-700">{state.message}</div> : <div className="text-sm text-slate-500">—</div>}

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={state.status === "running"}
                    onClick={() => void run(def.id, def.run)}
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Tester
                  </Button>
                  <Button variant="outline" asChild className="gap-2">
                    <Link to={def.link.to}>
                      <ExternalLink className="h-4 w-4" />
                      {def.link.label}
                    </Link>
                  </Button>
                  {state.meta && typeof state.meta.establishmentId === "string" ? (
                    <Button variant="outline" asChild className="gap-2">
                      <Link to={`/restaurant/${encodeURIComponent(state.meta.establishmentId)}`}>
                        <ExternalLink className="h-4 w-4" />
                        Front office
                      </Link>
                    </Button>
                  ) : null}
                </div>

                <div className="text-xs text-slate-500 font-mono">{def.id}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Notes"
            description="Cette page ne modifie pas la base. Pour les scénarios E2E 'création/réservation/annulation', on ajoutera des endpoints QA dédiés (strictement superadmin) avec audit log."
          />
        </CardHeader>
      </Card>
    </div>
  );
}
