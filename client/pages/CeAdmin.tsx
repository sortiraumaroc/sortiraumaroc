/**
 * CeAdmin — Espace Comité d'Entreprise (company admin portal)
 *
 * Route: /ce-admin/:slug
 * Auth: Supabase consumer auth → company_admins table
 */

import { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  ScanLine,
  Settings,
  LayoutDashboard,
  LogOut,
  ChevronDown,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Download,
  UserCheck,
  UserX,
  RotateCcw,
  Trash2,
  BarChart3,
  CalendarDays,
  TrendingUp,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { isAuthed, getConsumerAccessToken } from "@/lib/auth";
import { consumerSupabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  Company,
  CompanyDashboardStats,
  EmployeeWithUser,
  ScanWithDetails,
  EmployeeStatus,
} from "../../shared/ceTypes";

// ============================================================
// API helpers (inline — mirrors ceCompanyApi.ts)
// ============================================================

async function ceJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getConsumerAccessToken();
  if (!token) throw new Error("Non authentifié");
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Erreur serveur");
  return json;
}

// ============================================================
// Status Badges
// ============================================================

function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  const map: Record<EmployeeStatus, { label: string; variant: string; icon: React.ReactNode }> = {
    active: { label: "Actif", variant: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3 w-3" /> },
    pending: { label: "En attente", variant: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-3 w-3" /> },
    suspended: { label: "Suspendu", variant: "bg-red-100 text-red-700", icon: <XCircle className="h-3 w-3" /> },
    deleted: { label: "Supprimé", variant: "bg-gray-100 text-gray-500", icon: <Trash2 className="h-3 w-3" /> },
  };
  const m = map[status] ?? { label: status, variant: "bg-gray-100 text-gray-500", icon: null };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", m.variant)}>
      {m.icon} {m.label}
    </span>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    validated: { label: "Validé", cls: "bg-green-100 text-green-700" },
    refused: { label: "Refusé", cls: "bg-red-100 text-red-700" },
    expired: { label: "Expiré", cls: "bg-gray-100 text-gray-500" },
  };
  const m = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-500" };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>;
}

// ============================================================
// Dashboard Tab
// ============================================================

function DashboardTab({ stats, loading }: { stats: CompanyDashboardStats | null; loading: boolean }) {
  if (loading) return <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!stats) return <p className="text-muted-foreground py-8 text-center">Aucune donnée disponible.</p>;

  const kpis = [
    { label: "Salariés actifs", value: stats.active_employees, icon: UserCheck, color: "text-green-600" },
    { label: "En attente", value: stats.pending_employees, icon: Clock, color: "text-yellow-600" },
    { label: "Suspendus", value: stats.suspended_employees, icon: UserX, color: "text-red-600" },
    { label: "Total salariés", value: stats.total_employees, icon: Users, color: "text-blue-600" },
    { label: "Scans aujourd'hui", value: stats.scans_today, icon: ScanLine, color: "text-purple-600" },
    { label: "Scans cette semaine", value: stats.scans_this_week, icon: CalendarDays, color: "text-indigo-600" },
    { label: "Scans ce mois", value: stats.scans_this_month, icon: TrendingUp, color: "text-teal-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <k.icon className={cn("h-8 w-8 shrink-0", k.color)} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.top_establishments.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Top Établissements</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Établissement</TableHead>
                  <TableHead className="text-right">Scans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.top_establishments.map((e) => (
                  <TableRow key={e.establishment_id}>
                    <TableCell className="font-medium">{e.establishment_name}</TableCell>
                    <TableCell className="text-right">{e.scans_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Employees Tab
// ============================================================

function EmployeesTab({ companyId }: { companyId: string }) {
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: "validate" | "suspend" | "reactivate" | "delete"; name: string } | null>(null);
  const limit = 20;

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const data: any = await ceJson(`/api/ce/company/employees?${params}`);
      setEmployees(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const doAction = async (id: string, action: string) => {
    setActionLoading(id);
    try {
      await ceJson(`/api/ce/company/employees/${id}/${action}`, { method: "PUT" });
      toast({ title: "Succès", description: `Salarié ${action === "validate" ? "validé" : action === "suspend" ? "suspendu" : action === "reactivate" ? "réactivé" : "supprimé"}.` });
      fetch_();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const doDelete = async (id: string) => {
    setActionLoading(id);
    try {
      await ceJson(`/api/ce/company/employees/${id}`, { method: "DELETE" });
      toast({ title: "Succès", description: "Salarié supprimé." });
      fetch_();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Rechercher..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="active">Actifs</SelectItem>
              <SelectItem value="pending">En attente</SelectItem>
              <SelectItem value="suspended">Suspendus</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={fetch_}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Actualiser</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : employees.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Aucun salarié trouvé.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Téléphone</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Inscrit le</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.user_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{emp.user_email ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{emp.user_phone ?? "—"}</TableCell>
                  <TableCell><EmployeeStatusBadge status={emp.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(emp.created_at).toLocaleDateString("fr-FR")}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {emp.status === "pending" && (
                        <Button variant="ghost" size="sm" disabled={actionLoading === emp.id} onClick={() => setConfirmAction({ id: emp.id, action: "validate", name: emp.user_name ?? "ce salarié" })}>
                          <UserCheck className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {emp.status === "active" && (
                        <Button variant="ghost" size="sm" disabled={actionLoading === emp.id} onClick={() => setConfirmAction({ id: emp.id, action: "suspend", name: emp.user_name ?? "ce salarié" })}>
                          <UserX className="h-4 w-4 text-orange-600" />
                        </Button>
                      )}
                      {emp.status === "suspended" && (
                        <Button variant="ghost" size="sm" disabled={actionLoading === emp.id} onClick={() => setConfirmAction({ id: emp.id, action: "reactivate", name: emp.user_name ?? "ce salarié" })}>
                          <RotateCcw className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      {emp.status !== "deleted" && (
                        <Button variant="ghost" size="sm" disabled={actionLoading === emp.id} onClick={() => setConfirmAction({ id: emp.id, action: "delete", name: emp.user_name ?? "ce salarié" })}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{total} salarié{total > 1 ? "s" : ""}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
            <span className="px-3 py-1.5 text-sm">{page}/{totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
          </div>
        </div>
      )}

      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === "validate" && "Valider ce salarié ?"}
              {confirmAction?.action === "suspend" && "Suspendre ce salarié ?"}
              {confirmAction?.action === "reactivate" && "Réactiver ce salarié ?"}
              {confirmAction?.action === "delete" && "Supprimer ce salarié ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "validate" && `${confirmAction.name} sera activé et pourra utiliser ses avantages CE.`}
              {confirmAction?.action === "suspend" && `${confirmAction.name} ne pourra plus utiliser ses avantages CE.`}
              {confirmAction?.action === "reactivate" && `${confirmAction.name} retrouvera l'accès à ses avantages CE.`}
              {confirmAction?.action === "delete" && `${confirmAction.name} sera définitivement retiré de l'entreprise.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.action === "delete") doDelete(confirmAction.id);
                else doAction(confirmAction.id, confirmAction.action);
              }}
              className={confirmAction?.action === "delete" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// Scans Tab
// ============================================================

function ScansTab() {
  const [scans, setScans] = useState<ScanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      const data: any = await ceJson(`/api/ce/company/scans?${params}`);
      setScans(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{total} scan{total > 1 ? "s" : ""}</p>
        <Button variant="outline" size="sm" onClick={fetch_}><RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Actualiser</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : scans.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">Aucun scan enregistré.</p>
      ) : (
        <div className="rounded-md border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Salarié</TableHead>
                <TableHead>Établissement</TableHead>
                <TableHead>Avantage</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{new Date(s.scan_datetime).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                  <TableCell className="font-medium">{s.employee_display_name ?? s.employee_name ?? "—"}</TableCell>
                  <TableCell>{s.establishment_name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{s.advantage_description ?? "—"}</TableCell>
                  <TableCell><ScanStatusBadge status={s.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Précédent</Button>
          <span className="px-3 py-1.5">{page}/{totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Settings Tab
// ============================================================

function SettingsTab({ company, onUpdate }: { company: Company; onUpdate: () => void }) {
  const [autoValidate, setAutoValidate] = useState(company.auto_validate_employees);
  const [domain, setDomain] = useState(company.auto_validate_domain ?? "");
  const [welcome, setWelcome] = useState(company.welcome_message ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await ceJson("/api/ce/company/settings", {
        method: "PUT",
        body: JSON.stringify({
          auto_validate_employees: autoValidate,
          auto_validate_domain: domain || null,
          welcome_message: welcome || null,
        }),
      });
      toast({ title: "Paramètres enregistrés" });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Validation automatique</CardTitle>
          <CardDescription>Validez automatiquement les salariés dont l'email correspond à votre domaine.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch checked={autoValidate} onCheckedChange={setAutoValidate} />
            <Label>Activer la validation automatique</Label>
          </div>
          {autoValidate && (
            <div className="space-y-1.5">
              <Label>Domaine email</Label>
              <Input placeholder="monentreprise.ma" value={domain} onChange={(e) => setDomain(e.target.value)} />
              <p className="text-xs text-muted-foreground">Les salariés avec un email @{domain || "..."} seront validés automatiquement.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message d'accueil</CardTitle>
          <CardDescription>Affiché aux salariés lors de leur inscription.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea placeholder="Bienvenue dans le programme CE de notre entreprise..." value={welcome} onChange={(e) => setWelcome(e.target.value)} rows={4} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Main CeAdmin Page
// ============================================================

export default function CeAdmin() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [stats, setStats] = useState<CompanyDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");

  const fetchCompany = useCallback(async () => {
    try {
      const data: any = await ceJson("/api/ce/company/me");
      setCompany(data.data ?? data);
    } catch (e: any) {
      toast({ title: "Accès refusé", description: e.message, variant: "destructive" });
      navigate("/");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data: any = await ceJson("/api/ce/company/dashboard");
      setStats(data.data ?? data);
    } catch {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthed()) {
      navigate("/");
      return;
    }
    fetchCompany();
    fetchStats();
  }, [fetchCompany, fetchStats, navigate]);

  const signOut = async () => {
    await consumerSupabase.auth.signOut();
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) return null;

  const registrationUrl = `${window.location.origin}/ce/${company.registration_code}`;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img src={company.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <Building2 className="h-6 w-6 text-primary" />
            )}
            <div>
              <h1 className="text-sm font-semibold leading-tight">{company.name}</h1>
              <p className="text-xs text-muted-foreground">Espace Comité d'Entreprise</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="mr-1.5 h-4 w-4" /> Déconnexion
          </Button>
        </div>
      </header>

      {/* Registration Link Banner */}
      <div className="border-b bg-blue-50">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <div className="flex-1">
            <p className="text-xs font-medium text-blue-700">Lien d'inscription salariés</p>
            <code className="text-xs text-blue-600 break-all">{registrationUrl}</code>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              navigator.clipboard.writeText(registrationUrl);
              toast({ title: "Lien copié !" });
            }}
          >
            Copier
          </Button>
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6 w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard" className="gap-1.5"><LayoutDashboard className="h-4 w-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="employees" className="gap-1.5"><Users className="h-4 w-4" /> Salariés</TabsTrigger>
            <TabsTrigger value="scans" className="gap-1.5"><ScanLine className="h-4 w-4" /> Scans</TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-4 w-4" /> Paramètres</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <DashboardTab stats={stats} loading={statsLoading} />
          </TabsContent>

          <TabsContent value="employees">
            <EmployeesTab companyId={company.id} />
          </TabsContent>

          <TabsContent value="scans">
            <ScansTab />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab company={company} onUpdate={fetchCompany} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
