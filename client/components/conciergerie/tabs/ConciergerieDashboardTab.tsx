import { useEffect, useState } from "react";
import {
  Route,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  PlusCircle,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ConciergeProfile, JourneyListItem } from "@shared/conciergerieTypes";
import { listJourneys } from "@/lib/conciergerie/api";

type Props = {
  concierge: ConciergeProfile;
};

type Stats = {
  total: number;
  draft: number;
  requesting: number;
  confirmed: number;
  completed: number;
};

export default function ConciergerieDashboardTab({ concierge }: Props) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    draft: 0,
    requesting: 0,
    confirmed: 0,
    completed: 0,
  });
  const [recentJourneys, setRecentJourneys] = useState<JourneyListItem[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const { journeys, total } = await listJourneys({ per_page: 50 });
        setStats({
          total,
          draft: journeys.filter((j) => j.status === "draft").length,
          requesting: journeys.filter((j) =>
            j.status === "requesting" || j.status === "partially_accepted",
          ).length,
          confirmed: journeys.filter((j) => j.status === "confirmed").length,
          completed: journeys.filter((j) => j.status === "completed").length,
        });
        setRecentJourneys(journeys.slice(0, 5));
      } catch (e) {
        console.error("[conciergerie] Dashboard load error:", e);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Bonjour, {concierge.user.first_name || "Conciergerie"} !
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Bienvenue dans votre espace conciergerie — {concierge.concierge.name}
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Route className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-slate-500">Total parcours</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.requesting}</p>
                <p className="text-xs text-slate-500">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.confirmed}</p>
                <p className="text-xs text-slate-500">Confirmés</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.draft}</p>
                <p className="text-xs text-slate-500">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent journeys */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Parcours récents</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJourneys.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Route className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Aucun parcours créé</p>
              <p className="text-sm mt-1">
                Créez votre premier parcours pour commencer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentJourneys.map((j) => (
                <div
                  key={j.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-white hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">
                      {j.title || `Parcours du ${j.desired_date}`}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {j.client_name} · {j.party_size} pers. · {j.desired_date}
                    </p>
                  </div>
                  <StatusBadge status={j.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    draft: { label: "Brouillon", className: "bg-slate-100 text-slate-600" },
    requesting: { label: "En cours", className: "bg-amber-100 text-amber-700" },
    partially_accepted: { label: "Partiel", className: "bg-blue-100 text-blue-700" },
    confirmed: { label: "Confirmé", className: "bg-green-100 text-green-700" },
    cancelled: { label: "Annulé", className: "bg-red-100 text-red-600" },
    completed: { label: "Terminé", className: "bg-slate-200 text-slate-700" },
  };

  const c = config[status] ?? { label: status, className: "bg-slate-100 text-slate-600" };
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-full ${c.className}`}>
      {c.label}
    </span>
  );
}
