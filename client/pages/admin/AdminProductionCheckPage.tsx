import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Server, Database, Globe, Settings, Shield } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshIconButton } from "@/components/ui/refresh-icon-button";
import { adminHealth, adminProductionCheck, type AdminProductionCheckItem } from "@/lib/adminApi";

type UiCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
  source: "server" | "client";
  category: "env" | "table" | "endpoint" | "seo" | "config";
};

function StatusBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
        OK
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100">
      KO
    </Badge>
  );
}

async function fetchOk(url: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit" });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

type FetchTextResult = { ok: true; text: string } | { ok: false; detail: string };

async function fetchText(url: string): Promise<FetchTextResult> {
  try {
    const res = await fetch(url, { method: "GET", credentials: "omit" });
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "Network error" };
  }
}

function validateSitemapAlternates(xml: string): { ok: boolean; detail?: string } {
  const hasNs = xml.includes("xmlns:xhtml=");
  const hasLinks = xml.includes("<xhtml:link");
  const hasFr = xml.includes('hreflang="fr"');
  const hasEn = xml.includes('hreflang="en"');
  const hasDefault = xml.includes('hreflang="x-default"');

  if (!hasNs) return { ok: false, detail: "xmlns:xhtml manquant" };
  if (!hasLinks) return { ok: false, detail: "xhtml:link manquant" };
  if (!hasFr || !hasEn) return { ok: false, detail: "alternates fr/en manquants" };
  if (!hasDefault) return { ok: false, detail: "alternate x-default manquant" };

  return { ok: true };
}

function validateRobotsHasSitemap(text: string): { ok: boolean; detail?: string } {
  const normalized = text.toLowerCase();
  const hasSitemapLine = normalized.includes("sitemap:");
  const hasSitemapXml = normalized.includes("/sitemap.xml");

  if (!hasSitemapLine) return { ok: false, detail: "ligne Sitemap: manquante" };
  if (!hasSitemapXml) return { ok: false, detail: "référence /sitemap.xml manquante" };
  return { ok: true };
}

function getCategoryFromKey(key: string): UiCheck["category"] {
  if (key.startsWith("env:") || key.startsWith("client:")) return "env";
  if (key.startsWith("table:")) return "table";
  if (key.startsWith("endpoint:")) return "endpoint";
  if (key.startsWith("seo:")) return "seo";
  return "config";
}

const CATEGORY_CONFIG: Record<UiCheck["category"], { label: string; icon: React.ElementType; color: string }> = {
  env: { label: "Environnement", icon: Settings, color: "text-blue-600" },
  table: { label: "Base de données", icon: Database, color: "text-violet-600" },
  endpoint: { label: "Endpoints API", icon: Server, color: "text-amber-600" },
  seo: { label: "SEO", icon: Globe, color: "text-emerald-600" },
  config: { label: "Configuration", icon: Shield, color: "text-slate-600" },
};

function CheckGroup({ category, checks }: { category: UiCheck["category"]; checks: UiCheck[] }) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;
  const okCount = checks.filter((c) => c.ok).length;
  const total = checks.length;
  const allOk = okCount === total;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="font-semibold text-sm text-slate-900">{config.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${allOk ? "text-emerald-600" : "text-amber-600"}`}>
            {okCount}/{total}
          </span>
          {allOk ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {checks.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-slate-800">{c.label}</div>
              {c.detail && (
                <div className="text-xs text-slate-500 font-mono truncate">{c.detail}</div>
              )}
            </div>
            <StatusBadge ok={c.ok} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminProductionCheckPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverChecks, setServerChecks] = useState<AdminProductionCheckItem[] | null>(null);
  const [serverMeta, setServerMeta] = useState<{ at: string; node_env: string; allow_demo_routes: boolean } | null>(null);
  const [clientChecks, setClientChecks] = useState<UiCheck[] | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const results = await Promise.all([
        adminHealth().catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "adminHealth failed" })),
        adminProductionCheck(),
        fetchOk("/api/ping"),
        fetchText("/sitemap.xml"),
        fetchText("/robots.txt"),
        fetchOk("/api/public/home"),
      ] as const);

      const [health, prod, ping, sitemap, robots, home] = results;

      if (health.ok !== true) {
        const msg = "error" in health && typeof health.error === "string" ? health.error : "adminHealth failed";
        throw new Error(msg);
      }

      setServerChecks(prod.checks);
      setServerMeta({ at: prod.at, node_env: prod.env.node_env, allow_demo_routes: prod.env.allow_demo_routes });

      const demoMode = String(import.meta.env.VITE_DEMO_MODE ?? "").toLowerCase() === "true";

      const local: UiCheck[] = [
        {
          key: "client:demo_mode",
          label: "Mode démo désactivé (client)",
          ok: !demoMode,
          detail: demoMode ? "VITE_DEMO_MODE=true" : undefined,
          source: "client",
          category: "env",
        },
        {
          key: "endpoint:ping",
          label: "API /api/ping",
          ok: ping.ok,
          detail: ping.ok ? undefined : "detail" in ping ? ping.detail : undefined,
          source: "client",
          category: "endpoint",
        },
        {
          key: "endpoint:public_home",
          label: "API /api/public/home",
          ok: home.ok,
          detail: home.ok ? undefined : "detail" in home ? home.detail : undefined,
          source: "client",
          category: "endpoint",
        },
        {
          key: "seo:sitemap",
          label: "Sitemap accessible",
          ok: sitemap.ok,
          detail: "detail" in sitemap ? sitemap.detail : undefined,
          source: "client",
          category: "seo",
        },
        {
          key: "seo:sitemap_alternates",
          label: "Sitemap hreflang (FR/EN)",
          ok: sitemap.ok ? validateSitemapAlternates(sitemap.text).ok : false,
          detail: sitemap.ok ? validateSitemapAlternates(sitemap.text).detail : "detail" in sitemap ? sitemap.detail : undefined,
          source: "client",
          category: "seo",
        },
        {
          key: "seo:robots",
          label: "Robots.txt accessible",
          ok: robots.ok,
          detail: "detail" in robots ? robots.detail : undefined,
          source: "client",
          category: "seo",
        },
        {
          key: "seo:robots_sitemap_ref",
          label: "Robots.txt référence sitemap",
          ok: robots.ok ? validateRobotsHasSitemap(robots.text).ok : false,
          detail: robots.ok ? validateRobotsHasSitemap(robots.text).detail : "detail" in robots ? robots.detail : undefined,
          source: "client",
          category: "seo",
        },
      ];

      setClientChecks(local);
    } catch (e) {
      setServerChecks(null);
      setServerMeta(null);
      setClientChecks(null);
      setError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const mergedChecks = useMemo<UiCheck[]>(() => {
    const server: UiCheck[] = (serverChecks ?? []).map((c) => ({
      ...c,
      source: "server" as const,
      category: getCategoryFromKey(c.key),
    }));
    return [...server, ...(clientChecks ?? [])];
  }, [clientChecks, serverChecks]);

  const groupedChecks = useMemo(() => {
    const groups: Record<UiCheck["category"], UiCheck[]> = {
      env: [],
      table: [],
      endpoint: [],
      seo: [],
      config: [],
    };
    for (const check of mergedChecks) {
      groups[check.category].push(check);
    }
    return groups;
  }, [mergedChecks]);

  const isDevMode = serverMeta?.node_env !== "production";

  // En mode dev, on ignore le check NODE_ENV=production pour le calcul GO/NO-GO
  const goNoGo = useMemo(() => {
    if (!mergedChecks.length) return { ready: false, reason: "Chargement..." };

    // Critical checks (fail = NO-GO)
    const criticalChecks = mergedChecks.filter((c) => {
      // En dev, on ignore le check NODE_ENV
      if (isDevMode && c.key === "env:node_env_prod") return false;
      // Checks critiques : env, tables, endpoints
      return c.key.startsWith("env:") || c.key.startsWith("table:") || c.key.startsWith("endpoint:");
    });

    const failures = criticalChecks.filter((c) => !c.ok);

    if (failures.length > 0) {
      return { ready: false, reason: `${failures.length} check(s) critique(s) en échec` };
    }

    return { ready: true, reason: "Tous les checks critiques OK" };
  }, [mergedChecks, isDevMode]);

  const stats = useMemo(() => {
    const total = mergedChecks.length;
    const ok = mergedChecks.filter((c) => c.ok).length;
    const ko = total - ok;
    return { total, ok, ko };
  }, [mergedChecks]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Production check"
        description="Vérification automatique de l'environnement, base de données, API et SEO"
        actions={<RefreshIconButton className="h-9 w-9" loading={loading} label="Rafraîchir" onClick={() => void run()} />}
      />

      {/* Statut principal */}
      <Card className={`border-2 ${goNoGo.ready ? "border-emerald-200 bg-emerald-50/50" : isDevMode ? "border-amber-200 bg-amber-50/50" : "border-red-200 bg-red-50/50"}`}>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              {goNoGo.ready ? (
                <div className="h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
              ) : isDevMode ? (
                <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="h-8 w-8 text-amber-600" />
                </div>
              ) : (
                <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
              )}
              <div>
                <div className={`text-2xl font-bold ${goNoGo.ready ? "text-emerald-700" : isDevMode ? "text-amber-700" : "text-red-700"}`}>
                  {goNoGo.ready ? "GO" : isDevMode ? "DEV MODE" : "NO-GO"}
                </div>
                <div className="text-sm text-slate-600">{goNoGo.reason}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-emerald-600">{stats.ok}</div>
                <div className="text-xs text-slate-500">OK</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">{stats.ko}</div>
                <div className="text-xs text-slate-500">KO</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-slate-700">{stats.total}</div>
                <div className="text-xs text-slate-500">Total</div>
              </div>
            </div>
          </div>

          {serverMeta && (
            <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>Dernier check: <span className="font-mono">{new Date(serverMeta.at).toLocaleString()}</span></span>
              <span>NODE_ENV: <span className="font-mono">{serverMeta.node_env || "(unset)"}</span></span>
              <span>DEMO_ROUTES: <span className="font-mono">{serverMeta.allow_demo_routes ? "true" : "false"}</span></span>
            </div>
          )}

          {isDevMode && (
            <div className="mt-4 p-3 rounded-md bg-amber-100/50 border border-amber-200 text-sm text-amber-800">
              <span className="font-medium">Mode développement détecté.</span> Le check NODE_ENV=production est ignoré. En production, ce check sera requis.
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="text-sm text-red-700">{error}</div>
          </CardContent>
        </Card>
      )}

      {/* Checks groupés */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(["env", "table", "endpoint", "seo"] as const).map((category) => {
          const checks = groupedChecks[category];
          if (!checks.length) return null;
          return <CheckGroup key={category} category={category} checks={checks} />;
        })}
      </div>

      {/* Checklist manuelle */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">Vérifications manuelles recommandées</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>RLS policies sur tables sensibles</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>SEO: canonical, JSON-LD, Open Graph</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>Internationalisation FR/EN complète</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>Cycle complet de réservation</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>Notifications (email + push)</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-slate-400 mt-2 shrink-0" />
              <span>Paiements en sandbox puis live</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
