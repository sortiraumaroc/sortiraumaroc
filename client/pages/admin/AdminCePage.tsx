/**
 * Admin CE Page — Comités d'Entreprise management
 *
 * Tabs: Dashboard, Entreprises, Avantages, Scans
 */

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Building2, Gift, BarChart3, QrCode, Plus, Pencil, Trash2, RefreshCw, Download, Copy, Check, Users, Eye } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";

import {
  listCeCompanies,
  getCeCompany,
  createCeCompany,
  updateCeCompany,
  deleteCeCompany,
  regenerateCeCompanyLink,
  listCeCompanyEmployees,
  listCeCompanyScans,
  getCeDashboard,
  listCeAdvantages,
  createCeAdvantage,
  updateCeAdvantage,
  deleteCeAdvantage,
  getCeExportCompaniesUrl,
  getCeExportEmployeesUrl,
  getCeExportScansUrl,
} from "@/lib/ceApi";
import { getAdminHeaders } from "@/lib/adminApi";
import type {
  Company,
  CompanyWithStats,
  CeDashboardStats,
  EmployeeWithUser,
  ScanWithDetails,
  ProCeAdvantage,
  CreateCompanyPayload,
} from "../../../shared/ceTypes";

// ============================================================================
// Status Badges
// ============================================================================

function CompanyStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    active: { label: "Actif", className: "bg-green-100 text-green-800" },
    suspended: { label: "Suspendu", className: "bg-yellow-100 text-yellow-800" },
    expired: { label: "Expiré", className: "bg-red-100 text-red-800" },
  };
  const v = variants[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return <Badge className={v.className}>{v.label}</Badge>;
}

function EmployeeStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    pending: { label: "En attente", className: "bg-yellow-100 text-yellow-800" },
    active: { label: "Actif", className: "bg-green-100 text-green-800" },
    suspended: { label: "Suspendu", className: "bg-red-100 text-red-800" },
    deleted: { label: "Supprimé", className: "bg-gray-100 text-gray-800" },
  };
  const v = variants[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return <Badge className={v.className}>{v.label}</Badge>;
}

function ScanStatusBadge({ status }: { status: string }) {
  const variants: Record<string, { label: string; className: string }> = {
    validated: { label: "Validé", className: "bg-green-100 text-green-800" },
    refused: { label: "Refusé", className: "bg-red-100 text-red-800" },
    expired: { label: "Expiré", className: "bg-gray-100 text-gray-800" },
  };
  const v = variants[status] ?? { label: status, className: "bg-gray-100 text-gray-800" };
  return <Badge className={v.className}>{v.label}</Badge>;
}

function AdvantageTypeBadge({ type }: { type: string }) {
  const labels: Record<string, string> = {
    percentage: "Réduction %",
    fixed: "Réduction fixe",
    special_offer: "Offre spéciale",
    gift: "Cadeau",
    pack: "Pack",
  };
  return <Badge variant="outline">{labels[type] ?? type}</Badge>;
}

// ============================================================================
// Dashboard Tab
// ============================================================================

function DashboardTab() {
  const [stats, setStats] = useState<CeDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCeDashboard()
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Chargement...</div>;
  if (!stats) return <div className="p-6 text-red-500">Erreur de chargement</div>;

  const kpis = [
    { label: "Entreprises actives", value: stats.active_companies, icon: Building2 },
    { label: "Salariés actifs", value: stats.active_employees, icon: Users },
    { label: "En attente", value: stats.pending_employees, icon: Users },
    { label: "Avantages actifs", value: stats.active_advantages, icon: Gift },
    { label: "Scans aujourd'hui", value: stats.scans_today, icon: QrCode },
    { label: "Scans ce mois", value: stats.scans_this_month, icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-lg border p-4 text-center">
            <kpi.icon className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
            <p className="text-2xl font-bold">{kpi.value}</p>
            <p className="text-xs text-muted-foreground">{kpi.label}</p>
          </div>
        ))}
      </div>

      {stats.top_establishments.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="font-semibold mb-3">Top établissements (scans ce mois)</h3>
          <div className="space-y-2">
            {stats.top_establishments.map((e, i) => (
              <div key={e.establishment_id} className="flex items-center justify-between text-sm">
                <span>
                  <span className="text-muted-foreground mr-2">#{i + 1}</span>
                  {e.establishment_name}
                </span>
                <Badge variant="outline">{e.scans_count} scans</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Companies Tab
// ============================================================================

function CompaniesTab() {
  const [companies, setCompanies] = useState<CompanyWithStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [detailCompany, setDetailCompany] = useState<Company | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCeCompanies({ page: String(page), limit: "20", search });
      setCompanies(res.data);
      setTotal(res.total);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les entreprises", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  useEffect(() => { load(); }, [load]);

  const handleCopyLink = (c: CompanyWithStats) => {
    const url = `${window.location.origin}/ce/${c.registration_code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(c.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRegenerate = async (id: string) => {
    try {
      await regenerateCeCompanyLink(id);
      toast({ title: "Lien régénéré" });
      load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Supprimer cette entreprise CE ?")) return;
    try {
      await deleteCeCompany(id);
      toast({ title: "Entreprise supprimée" });
      load();
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  const handleExport = () => {
    const headers = getAdminHeaders();
    const url = getCeExportCompaniesUrl();
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Rechercher une entreprise..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
        <Button onClick={() => { setEditCompany(null); setEditOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nouvelle entreprise
        </Button>
        <Button variant="outline" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> CSV
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : companies.length === 0 ? (
        <p className="text-muted-foreground">Aucune entreprise CE</p>
      ) : (
        <>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Entreprise</th>
                  <th className="text-left p-3 font-medium">Statut</th>
                  <th className="text-center p-3 font-medium">Salariés</th>
                  <th className="text-center p-3 font-medium">Scans/mois</th>
                  <th className="text-left p-3 font-medium">Lien inscription</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/30">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {c.logo_url ? (
                          <img src={c.logo_url} alt="" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.contact_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3"><CompanyStatusBadge status={c.status} /></td>
                    <td className="p-3 text-center">
                      <span className="font-medium text-green-600">{c.active_employees_count}</span>
                      {c.pending_employees_count > 0 && (
                        <span className="text-yellow-600 ml-1">+{c.pending_employees_count}</span>
                      )}
                    </td>
                    <td className="p-3 text-center">{c.scans_this_month}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/ce/{c.registration_code}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleCopyLink(c)}>
                          {copiedId === c.id ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRegenerate(c.id)}>
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDetailCompany(c)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCompany(c); setEditOpen(true); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > 20 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{total} entreprises</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Précédent</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>Suivant</Button>
              </div>
            </div>
          )}
        </>
      )}

      <CompanyEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        company={editCompany}
        onSaved={load}
      />

      {detailCompany && (
        <CompanyDetailDialog
          open={!!detailCompany}
          onOpenChange={() => setDetailCompany(null)}
          company={detailCompany}
        />
      )}
    </div>
  );
}

// ============================================================================
// Company Edit Dialog
// ============================================================================

function CompanyEditDialog({
  open,
  onOpenChange,
  company,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [iceSiret, setIceSiret] = useState("");
  const [address, setAddress] = useState("");
  const [sector, setSector] = useState("");
  const [estimatedEmployees, setEstimatedEmployees] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contractStart, setContractStart] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [autoValidate, setAutoValidate] = useState(false);
  const [autoValidateDomain, setAutoValidateDomain] = useState("");
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open && company) {
      setName(company.name);
      setIceSiret(company.ice_siret ?? "");
      setAddress(company.address ?? "");
      setSector(company.sector ?? "");
      setEstimatedEmployees(company.estimated_employees ? String(company.estimated_employees) : "");
      setContactName(company.contact_name ?? "");
      setContactEmail(company.contact_email ?? "");
      setContactPhone(company.contact_phone ?? "");
      setContractStart(company.contract_start_date ?? "");
      setContractEnd(company.contract_end_date ?? "");
      setAutoValidate(company.auto_validate_employees);
      setAutoValidateDomain(company.auto_validate_domain ?? "");
      setWelcomeMessage(company.welcome_message ?? "");
    } else if (open) {
      setName(""); setIceSiret(""); setAddress(""); setSector("");
      setEstimatedEmployees(""); setContactName(""); setContactEmail("");
      setContactPhone(""); setContractStart(""); setContractEnd("");
      setAutoValidate(false); setAutoValidateDomain(""); setWelcomeMessage("");
    }
    setError(null);
  }, [open, company]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: CreateCompanyPayload = {
        name,
        ice_siret: iceSiret || undefined,
        address: address || undefined,
        sector: sector || undefined,
        estimated_employees: estimatedEmployees ? Number(estimatedEmployees) : undefined,
        contact_name: contactName || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined,
        contract_start_date: contractStart || undefined,
        contract_end_date: contractEnd || undefined,
        auto_validate_employees: autoValidate,
        auto_validate_domain: autoValidateDomain || undefined,
        welcome_message: welcomeMessage || undefined,
      };

      if (company) {
        await updateCeCompany(company.id, payload);
        toast({ title: "Entreprise mise à jour" });
      } else {
        await createCeCompany(payload);
        toast({ title: "Entreprise créée" });
      }

      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company ? "Modifier l'entreprise" : "Nouvelle entreprise CE"}</DialogTitle>
          <DialogDescription>
            {company ? "Modifiez les informations de l'entreprise." : "Créez une nouvelle entreprise pour le module Comité d'Entreprise."}
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Raison sociale *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'entreprise" />
          </div>
          <div>
            <Label>SIRET / ICE</Label>
            <Input value={iceSiret} onChange={(e) => setIceSiret(e.target.value)} placeholder="Identifiant fiscal" />
          </div>
          <div>
            <Label>Secteur d'activité</Label>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="Ex: Technologie" />
          </div>
          <div className="col-span-2">
            <Label>Adresse</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Adresse du siège" />
          </div>
          <div>
            <Label>Nombre de salariés estimé</Label>
            <Input type="number" value={estimatedEmployees} onChange={(e) => setEstimatedEmployees(e.target.value)} />
          </div>
          <div />
          <div>
            <Label>Contact - Nom</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div>
            <Label>Contact - Email</Label>
            <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </div>
          <div>
            <Label>Contact - Téléphone</Label>
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </div>
          <div />
          <div>
            <Label>Début de contrat</Label>
            <Input type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
          </div>
          <div>
            <Label>Fin de contrat</Label>
            <Input type="date" value={contractEnd} onChange={(e) => setContractEnd(e.target.value)} />
          </div>

          <div className="col-span-2 flex items-center gap-3 pt-2">
            <Switch checked={autoValidate} onCheckedChange={setAutoValidate} />
            <Label>Valider automatiquement les salariés</Label>
          </div>
          {autoValidate && (
            <div className="col-span-2">
              <Label>Domaine email pour auto-validation</Label>
              <Input value={autoValidateDomain} onChange={(e) => setAutoValidateDomain(e.target.value)} placeholder="@entreprise.ma" />
            </div>
          )}
          <div className="col-span-2">
            <Label>Message d'accueil</Label>
            <Textarea value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} placeholder="Message affiché aux salariés lors de l'inscription" rows={3} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Enregistrement..." : company ? "Mettre à jour" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Company Detail Dialog (Employees + Scans)
// ============================================================================

function CompanyDetailDialog({
  open,
  onOpenChange,
  company,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company;
}) {
  const [tab, setTab] = useState<"employees" | "scans">("employees");
  const [employees, setEmployees] = useState<EmployeeWithUser[]>([]);
  const [scans, setScans] = useState<ScanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      listCeCompanyEmployees(company.id, { limit: "50" }),
      listCeCompanyScans(company.id, { limit: "50" }),
    ])
      .then(([empRes, scanRes]) => {
        setEmployees(empRes.data);
        setScans(scanRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, company.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{company.name}</DialogTitle>
          <DialogDescription>Détails de l'entreprise CE</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="employees">Salariés ({employees.length})</TabsTrigger>
            <TabsTrigger value="scans">Scans ({scans.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="employees">
            {loading ? (
              <p className="text-muted-foreground p-4">Chargement...</p>
            ) : employees.length === 0 ? (
              <p className="text-muted-foreground p-4">Aucun salarié inscrit</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Nom</th>
                      <th className="text-left p-2 font-medium">Email</th>
                      <th className="text-left p-2 font-medium">Statut</th>
                      <th className="text-left p-2 font-medium">Profil</th>
                      <th className="text-left p-2 font-medium">Dernier scan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t">
                        <td className="p-2">{emp.user_name ?? "—"}</td>
                        <td className="p-2 text-muted-foreground">{emp.user_email ?? "—"}</td>
                        <td className="p-2"><EmployeeStatusBadge status={emp.status} /></td>
                        <td className="p-2">{emp.profile_complete ? <Badge className="bg-green-100 text-green-800">Complet</Badge> : <Badge className="bg-yellow-100 text-yellow-800">Incomplet</Badge>}</td>
                        <td className="p-2 text-muted-foreground text-xs">{emp.last_scan_at ? new Date(emp.last_scan_at).toLocaleDateString("fr") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="scans">
            {loading ? (
              <p className="text-muted-foreground p-4">Chargement...</p>
            ) : scans.length === 0 ? (
              <p className="text-muted-foreground p-4">Aucun scan</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">Salarié</th>
                      <th className="text-left p-2 font-medium">Établissement</th>
                      <th className="text-left p-2 font-medium">Avantage</th>
                      <th className="text-left p-2 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scans.map((scan) => (
                      <tr key={scan.id} className="border-t">
                        <td className="p-2 text-xs">{new Date(scan.scan_datetime).toLocaleString("fr")}</td>
                        <td className="p-2">{scan.employee_display_name ?? scan.employee_name ?? "—"}</td>
                        <td className="p-2">{scan.establishment_name ?? "—"}</td>
                        <td className="p-2">{scan.advantage_description ?? "—"}</td>
                        <td className="p-2"><ScanStatusBadge status={scan.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Advantages Tab
// ============================================================================

function AdvantagesTab() {
  const [advantages, setAdvantages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCeAdvantages({ page: String(page), limit: "20", search });
      setAdvantages(res.data);
      setTotal(res.total);
    } catch {}
    setLoading(false);
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Rechercher un avantage..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : advantages.length === 0 ? (
        <p className="text-muted-foreground">Aucun avantage CE configuré</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">Établissement</th>
                <th className="text-left p-3 font-medium">Type</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-center p-3 font-medium">Actif</th>
                <th className="text-left p-3 font-medium">Période</th>
              </tr>
            </thead>
            <tbody>
              {advantages.map((adv: any) => (
                <tr key={adv.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <p className="font-medium">{adv.establishments?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{adv.establishments?.city}</p>
                  </td>
                  <td className="p-3"><AdvantageTypeBadge type={adv.advantage_type} /></td>
                  <td className="p-3">{adv.description ?? "—"}</td>
                  <td className="p-3 text-center">{adv.is_active ? <Badge className="bg-green-100 text-green-800">Oui</Badge> : <Badge className="bg-gray-100 text-gray-800">Non</Badge>}</td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {adv.start_date ?? "—"} → {adv.end_date ?? "∞"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export function AdminCePage() {
  return (
    <div className="p-6 space-y-6">
      <AdminPageHeader
        title="Comités d'Entreprise"
        description="Gérez les entreprises, salariés et avantages CE"
        icon={<Briefcase className="w-6 h-6" />}
      />

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard"><BarChart3 className="w-4 h-4 mr-1" /> Dashboard</TabsTrigger>
          <TabsTrigger value="companies"><Building2 className="w-4 h-4 mr-1" /> Entreprises</TabsTrigger>
          <TabsTrigger value="advantages"><Gift className="w-4 h-4 mr-1" /> Avantages</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="advantages"><AdvantagesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
