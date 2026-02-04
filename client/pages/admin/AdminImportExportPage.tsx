import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Upload,
  XCircle,
  Building2,
  Users,
  Clock,
  CheckCircle,
  Copy,
  Eye,
} from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { isAdminSuperadmin } from "@/lib/adminApi";

type ImportPreviewItem = {
  row: number;
  data: {
    nom: string;
    ville: string;
    pro_email: string;
    universe?: string;
    telephone?: string;
  };
  valid: boolean;
  error?: string;
  isNew: boolean;
  existingMatch?: {
    id: string;
    name: string;
    city: string;
    status: string;
    phone: string | null;
  };
};

type ImportResult = {
  row: number;
  status: "success" | "error" | "skipped";
  establishment_id?: string;
  establishment_name?: string;
  pro_email?: string;
  temporary_password?: string;
  error?: string;
};

type Stats = {
  totalEstablishments: number;
  pendingEstablishments: number;
  activeEstablishments: number;
  totalPros: number;
};

type NewProCredential = {
  email: string;
  password: string;
};

export function AdminImportExportPage() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Import state
  const [importing, setImporting] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<{
    total: number;
    valid: number;
    invalid: number;
    newCount: number;
    existingCount: number;
    preview: ImportPreviewItem[];
  } | null>(null);
  const [importResults, setImportResults] = useState<{
    total: number;
    success: number;
    errors: number;
    results: ImportResult[];
    newProCredentials?: NewProCredential[];
  } | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sendEmails, setSendEmails] = useState(false);

  // Dialogs
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [resultsDialogOpen, setResultsDialogOpen] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Load stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/import-export/stats", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset
    setPreviewData(null);
    setImportResults(null);

    // Read file
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
      setFileName(file.name);
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Preview import
  const handlePreview = useCallback(async () => {
    if (!fileContent) return;

    setPreviewing(true);
    try {
      const res = await fetch("/api/admin/import-export/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: fileContent, format: "csv" }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: data.error || "Erreur lors de l'analyse",
          variant: "destructive",
        });
        return;
      }

      setPreviewData(data);
      setPreviewDialogOpen(true);
    } catch {
      toast({
        title: "Erreur",
        description: "Erreur lors de l'analyse du fichier",
        variant: "destructive",
      });
    } finally {
      setPreviewing(false);
    }
  }, [fileContent, toast]);

  // Execute import
  const handleImport = useCallback(async () => {
    if (!fileContent) return;

    setImporting(true);
    setPreviewDialogOpen(false);

    try {
      const res = await fetch("/api/admin/import-export/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: fileContent, format: "csv", sendEmails }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: data.error || "Erreur lors de l'import",
          variant: "destructive",
        });
        return;
      }

      setImportResults(data);
      setResultsDialogOpen(true);

      // Refresh stats
      void loadStats();

      toast({
        title: "Import terminé",
        description: `${data.success} établissement(s) importé(s) avec succès`,
      });
    } catch {
      toast({
        title: "Erreur",
        description: "Erreur lors de l'import",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      setFileContent(null);
      setFileName(null);
    }
  }, [fileContent, sendEmails, toast, loadStats]);

  // Download template
  const handleDownloadTemplate = useCallback(() => {
    window.location.href = "/api/admin/import-export/template";
  }, []);

  // Download Excel template with dropdowns
  const handleDownloadExcel = useCallback(() => {
    window.location.href = "/api/admin/import-export/excel-template";
  }, []);

  // Download taxonomy reference (CSV)
  const handleDownloadTaxonomy = useCallback(() => {
    window.location.href = "/api/admin/import-export/taxonomy";
  }, []);

  // Export establishments
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      window.location.href = "/api/admin/import-export/export";
      toast({
        title: "Export en cours",
        description: "Le téléchargement va commencer...",
      });
    } finally {
      setTimeout(() => setExporting(false), 1000);
    }
  }, [toast]);

  // Copy credentials to clipboard
  const handleCopyCredentials = useCallback(() => {
    if (!importResults?.newProCredentials) return;

    const text = importResults.newProCredentials
      .map((c) => `Email: ${c.email}\nMot de passe: ${c.password}`)
      .join("\n\n");

    navigator.clipboard.writeText(text);
    toast({ title: "Copié", description: "Identifiants copiés dans le presse-papier" });
  }, [importResults, toast]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Import / Export"
        description="Importer ou exporter des établissements en masse"
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total établissements</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? "..." : stats?.totalEstablishments ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {loadingStats ? "..." : stats?.pendingEstablishments ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actifs</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loadingStats ? "..." : stats?.activeEstablishments ?? 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comptes PRO</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingStats ? "..." : stats?.totalPros ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList>
          <TabsTrigger value="import" className="gap-2">
            <Upload className="h-4 w-4" />
            Import
          </TabsTrigger>
          {isAdminSuperadmin() && (
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              Export
            </TabsTrigger>
          )}
        </TabsList>

        {/* Import Tab */}
        <TabsContent value="import" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Importer des établissements
              </CardTitle>
              <CardDescription>
                Importez une liste d'établissements depuis un fichier CSV. Les comptes PRO seront
                créés automatiquement si nécessaire.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Template downloads */}
              <div className="space-y-4">
                {/* Main Excel template - recommended */}
                <div className="rounded-lg border-2 border-green-400 bg-green-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-green-800">📊 Fichier Excel avec listes déroulantes</h4>
                        <Badge className="bg-green-600">Recommandé</Badge>
                      </div>
                      <p className="text-sm text-green-700 mt-1">
                        Template complet avec menus déroulants pour l'univers, la ville, la région et l'ambiance.
                        Inclut un guide de taxonomie et la liste des sous-catégories.
                      </p>
                      <ul className="text-xs text-green-600 mt-2 space-y-1">
                        <li>✓ Sélection univers, ville, région via liste déroulante</li>
                        <li>✓ Guide des sous-catégories par univers</li>
                        <li>✓ Liste des équipements par type d'établissement</li>
                        <li>✓ Validation automatique des champs obligatoires</li>
                      </ul>
                    </div>
                    <Button onClick={handleDownloadExcel} className="gap-2 bg-green-600 hover:bg-green-700 shrink-0">
                      <FileSpreadsheet className="h-4 w-4" />
                      Télécharger Excel
                    </Button>
                  </div>
                </div>

                {/* Alternative CSV templates */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3">
                      <div>
                        <h4 className="font-medium text-slate-700">Template CSV simple</h4>
                        <p className="text-xs text-slate-500">
                          Fichier CSV basique avec exemples
                        </p>
                      </div>
                      <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2 w-full" size="sm">
                        <FileText className="h-4 w-4" />
                        CSV Template
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3">
                      <div>
                        <h4 className="font-medium text-slate-700">Taxonomie CSV</h4>
                        <p className="text-xs text-slate-500">
                          Liste de tous les termes autorisés
                        </p>
                      </div>
                      <Button variant="outline" onClick={handleDownloadTaxonomy} className="gap-2 w-full" size="sm">
                        <Download className="h-4 w-4" />
                        CSV Taxonomie
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* File upload */}
              <div className="space-y-2">
                <Label>Fichier CSV</Label>
                <div
                  className={cn(
                    "rounded-lg border-2 border-dashed p-8 text-center transition-colors",
                    fileName
                      ? "border-green-300 bg-green-50"
                      : "border-slate-300 hover:border-slate-400"
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="csv-upload"
                  />
                  <label htmlFor="csv-upload" className="cursor-pointer">
                    {fileName ? (
                      <div className="space-y-2">
                        <FileText className="mx-auto h-10 w-10 text-green-500" />
                        <p className="font-medium text-green-700">{fileName}</p>
                        <p className="text-sm text-slate-500">Cliquez pour changer de fichier</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="mx-auto h-10 w-10 text-slate-400" />
                        <p className="font-medium">Cliquez ou glissez un fichier CSV</p>
                        <p className="text-sm text-slate-500">
                          Colonnes requises : nom, ville
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Options */}
              {fileName && (
                <div className="flex items-center space-x-2 rounded-lg border p-4">
                  <Switch id="send-emails" checked={sendEmails} onCheckedChange={setSendEmails} />
                  <Label htmlFor="send-emails" className="cursor-pointer">
                    Envoyer les accès par email aux nouveaux PRO
                  </Label>
                </div>
              )}

              {/* Actions */}
              {fileName && (
                <div className="flex gap-2">
                  <Button
                    onClick={handlePreview}
                    disabled={previewing || importing}
                    variant="outline"
                    className="gap-2"
                  >
                    {previewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Prévisualiser
                  </Button>
                  <Button
                    onClick={handleImport}
                    disabled={importing || previewing}
                    className="gap-2"
                  >
                    {importing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {importing ? "Import en cours..." : "Lancer l'import"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Import instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Format du fichier</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-medium text-slate-900">Colonnes obligatoires</h4>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    <li>
                      <code className="rounded bg-slate-100 px-1">nom</code> - Nom de
                      l'établissement
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">ville</code> - Ville
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900">Informations de base</h4>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    <li>
                      <code className="rounded bg-slate-100 px-1">universe</code> - Catégorie
                      (restaurants, sport, loisirs, hebergement...)
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">subcategory</code> - Sous-catégorie
                      (gastronomique, spa, riad...)
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">adresse</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">code_postal</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">region</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">pays</code>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900">Contact & Réseaux sociaux</h4>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    <li>
                      <code className="rounded bg-slate-100 px-1">telephone</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">whatsapp</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">email_etablissement</code>
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">site_web</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">instagram</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">facebook</code>
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900">Descriptions & Infos pratiques</h4>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    <li>
                      <code className="rounded bg-slate-100 px-1">description_courte</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">description_longue</code>
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">horaires</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">prix_min</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">prix_max</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">devise</code>
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">tags</code> (séparés par virgules),{" "}
                      <code className="rounded bg-slate-100 px-1">amenities</code> (séparés par virgules)
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">latitude</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">longitude</code> - Coordonnées GPS
                    </li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900">Propriétaire PRO (optionnel)</h4>
                  <ul className="mt-1 list-inside list-disc text-slate-600">
                    <li>
                      <code className="rounded bg-slate-100 px-1">pro_email</code> - Email du
                      propriétaire (un compte sera créé automatiquement)
                    </li>
                    <li>
                      <code className="rounded bg-slate-100 px-1">pro_nom</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">pro_prenom</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">pro_telephone</code>,{" "}
                      <code className="rounded bg-slate-100 px-1">pro_entreprise</code>
                    </li>
                  </ul>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-amber-800">
                  <strong>Note :</strong> Les établissements importés ont le statut "En attente" et
                  doivent être validés manuellement. Le template inclut 3 exemples à supprimer avant import.
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Export Tab (superadmin only) */}
        {isAdminSuperadmin() && (
          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Exporter les établissements
                </CardTitle>
                <CardDescription>
                  Téléchargez la liste complète des établissements au format CSV
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">Export complet</h4>
                      <p className="text-sm text-slate-500">
                        Tous les établissements avec leurs informations PRO
                      </p>
                    </div>
                    <Button onClick={handleExport} disabled={exporting} className="gap-2">
                      {exporting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Exporter en CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Preview Dialog */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Prévisualisation de l'import</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                {previewData && (
                  <>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="outline">{previewData.total} ligne(s)</Badge>
                      <Badge variant="default" className="bg-green-500">
                        {previewData.newCount} nouveau(x)
                      </Badge>
                      <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                        {previewData.existingCount} déjà existant(s)
                      </Badge>
                      {previewData.invalid > 0 && (
                        <Badge variant="destructive">{previewData.invalid} erreur(s)</Badge>
                      )}
                    </div>
                    {previewData.existingCount > 0 && (
                      <p className="text-amber-600 text-xs">
                        ⚠️ Les établissements marqués "Existe déjà" ne seront pas importés pour éviter les doublons.
                      </p>
                    )}
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-28">Statut</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Ville</TableHead>
                  <TableHead>Univers</TableHead>
                  <TableHead>Email PRO</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData?.preview.map((item) => (
                  <TableRow
                    key={item.row}
                    className={cn(
                      !item.valid && "bg-red-50",
                      item.valid && !item.isNew && "bg-amber-50"
                    )}
                  >
                    <TableCell className="font-mono text-xs">{item.row}</TableCell>
                    <TableCell>
                      {!item.valid ? (
                        <Badge variant="destructive" className="text-xs">
                          <XCircle className="h-3 w-3 mr-1" />
                          Erreur
                        </Badge>
                      ) : item.isNew ? (
                        <Badge variant="default" className="bg-green-500 text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Nouveau
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Existe déjà
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.data.nom}</TableCell>
                    <TableCell>{item.data.ville}</TableCell>
                    <TableCell className="text-sm text-slate-500">{item.data.universe || "-"}</TableCell>
                    <TableCell className="text-sm">{item.data.pro_email || "-"}</TableCell>
                    <TableCell className="text-xs max-w-[200px]">
                      {item.error ? (
                        <span className="text-red-600">{item.error}</span>
                      ) : item.existingMatch ? (
                        <span className="text-amber-600">
                          Correspond à: {item.existingMatch.name} ({item.existingMatch.city})
                          {item.existingMatch.status && ` - ${item.existingMatch.status}`}
                        </span>
                      ) : (
                        <span className="text-green-600">Prêt à importer</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <div className="flex-1 text-sm text-slate-500">
              {previewData && previewData.newCount > 0 && (
                <span>
                  Seuls les <strong>{previewData.newCount}</strong> nouveaux établissements seront importés.
                </span>
              )}
            </div>
            <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || (previewData?.newCount ?? 0) === 0}
              className="gap-2"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Importer {previewData?.newCount ?? 0} établissement(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results Dialog */}
      <Dialog open={resultsDialogOpen} onOpenChange={setResultsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Résultats de l'import</DialogTitle>
            <DialogDescription>
              {importResults && (
                <div className="flex gap-4 mt-2">
                  <Badge variant="default" className="bg-green-500">
                    {importResults.success} réussi(s)
                  </Badge>
                  {importResults.errors > 0 && (
                    <Badge variant="destructive">{importResults.errors} erreur(s)</Badge>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Établissement</TableHead>
                  <TableHead>Email PRO</TableHead>
                  <TableHead>Détail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importResults?.results.map((item) => (
                  <TableRow key={item.row}>
                    <TableCell className="font-mono text-xs">{item.row}</TableCell>
                    <TableCell>
                      {item.status === "success" ? (
                        <Badge variant="default" className="bg-green-500">
                          OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Erreur</Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.establishment_name}</TableCell>
                    <TableCell className="text-sm">{item.pro_email}</TableCell>
                    <TableCell>
                      {item.error ? (
                        <span className="text-sm text-red-600">{item.error}</span>
                      ) : item.temporary_password ? (
                        <span className="text-sm text-green-600">Nouveau compte créé</span>
                      ) : (
                        <span className="text-sm text-slate-500">Compte existant</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2">
            {importResults?.newProCredentials && importResults.newProCredentials.length > 0 && (
              <Button
                variant="outline"
                onClick={() => {
                  setResultsDialogOpen(false);
                  setCredentialsDialogOpen(true);
                }}
                className="gap-2"
              >
                <Users className="h-4 w-4" />
                Voir les identifiants ({importResults.newProCredentials.length})
              </Button>
            )}
            <Button onClick={() => setResultsDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Identifiants des nouveaux comptes PRO
            </DialogTitle>
            <DialogDescription>
              Ces identifiants ne seront plus accessibles après fermeture. Copiez-les maintenant.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[400px] overflow-auto">
            {importResults?.newProCredentials?.map((cred, i) => (
              <div key={i} className="rounded-lg border bg-slate-50 p-3 font-mono text-sm">
                <div>
                  <span className="text-slate-500">Email:</span> {cred.email}
                </div>
                <div>
                  <span className="text-slate-500">Mot de passe:</span>{" "}
                  <span className="font-bold text-slate-900">{cred.password}</span>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCopyCredentials} className="gap-2">
              <Copy className="h-4 w-4" />
              Tout copier
            </Button>
            <Button onClick={() => setCredentialsDialogOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
