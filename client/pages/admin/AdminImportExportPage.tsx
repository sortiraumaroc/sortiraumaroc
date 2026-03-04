import { useCallback, useEffect, useRef, useState } from "react";
import { AdminEstablishmentsNav } from "./establishments/AdminEstablishmentsNav";
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
  Database,
  Play,
  Check,
  X,
  RefreshCw,
  AlertTriangle,
  Search,
  MapPin,
  Phone,
  Globe,
  Mail,
  ExternalLink,
  Trash2,
  CircleDot,
  Sparkles,
  Timer,
  CheckCheck,
  XOctagon,
  Ban,
  FileCode,
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// CHR Import types and functions
import {
  listImportSources,
  listChrCategories,
  listBatches,
  createBatch,
  runBatch,
  deleteBatch,
  listStagingEntries,
  getStagingEntry,
  approveStagingEntry,
  rejectStagingEntry,
  bulkApproveStagingEntries,
  bulkRejectStagingEntries,
  cleanupStagingDuplicates,
  getImportStats,
  getStagingExportUrl,
  getStatusColor,
  getStatusLabel,
  getBatchStatusColor,
  getBatchStatusLabel,
  getSourceLabel,
  getCategoryLabel,
  MOROCCAN_CITIES,
  type ImportSource,
  type ChrCategory,
  type ImportBatch,
  type StagingEntry,
  type StagingStatus,
  type ImportSourceInfo,
  type ChrCategoryInfo,
  type ImportStats,
} from "@/lib/adminImportChr";
import { SqlImportTab } from "@/components/admin/SqlImportTab";
import { PaginationControls } from "@/components/admin/table/PaginationControls";

/**
 * Convertit une chaîne en Title Case
 * Ex: "THE CLOUD COFFEE LAB" -> "The Cloud Coffee Lab"
 */
function toTitleCase(str: string): string {
  if (!str) return str;
  // Mots qu'on garde en minuscule (sauf en début de phrase)
  const minorWords = new Set(["de", "du", "la", "le", "les", "des", "et", "ou", "à", "au", "aux", "en", "par", "pour", "sur", "avec", "sans", "sous", "chez"]);

  return str
    .toLowerCase()
    .split(" ")
    .map((word, index) => {
      if (!word) return word;
      // Premier mot toujours capitalisé, ou si le mot n'est pas un mot mineur
      if (index === 0 || !minorWords.has(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(" ");
}

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

  // ============================================
  // CHR STATE
  // ============================================
  const [chrSources, setChrSources] = useState<ImportSourceInfo[]>([]);
  const [chrCategories, setChrCategories] = useState<ChrCategoryInfo[]>([]);
  const [chrBatches, setChrBatches] = useState<ImportBatch[]>([]);
  const [chrStagingEntries, setChrStagingEntries] = useState<StagingEntry[]>([]);
  const [chrStats, setChrStats] = useState<ImportStats | null>(null);
  const [chrLoading, setChrLoading] = useState(false);

  // CHR Staging filters
  const [chrStagingFilters, setChrStagingFilters] = useState<{
    status?: StagingStatus;
    city?: string;
    category?: string;
    search?: string;
  }>({});
  const [chrStagingTotal, setChrStagingTotal] = useState(0);
  const [chrStagingPage, setChrStagingPage] = useState(1);
  const [chrStagingPageSize, setChrStagingPageSize] = useState(25);

  // CHR Batches pagination
  const [chrBatchPage, setChrBatchPage] = useState(0);
  const [chrBatchPageSize, setChrBatchPageSize] = useState(25);

  // CHR Selection
  const [chrSelectedIds, setChrSelectedIds] = useState<Set<string>>(new Set());

  // CHR Detail drawer
  const [chrSelectedEntry, setChrSelectedEntry] = useState<StagingEntry | null>(null);
  const [chrDrawerOpen, setChrDrawerOpen] = useState(false);

  // CHR New batch dialog
  const [chrNewBatchOpen, setChrNewBatchOpen] = useState(false);
  const [chrNewBatchConfig, setChrNewBatchConfig] = useState<{
    sources: ImportSource[];
    cities: string[];
    categories: ChrCategory[];
    keywords: string;
  }>({
    sources: [],
    cities: [],
    categories: [],
    keywords: "",
  });

  // CHR sub-tab
  const [chrSubTab, setChrSubTab] = useState<"staging" | "batches">("staging");

  // CHR Cleanup loading state
  const [chrCleaningDuplicates, setChrCleaningDuplicates] = useState(false);

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

  // ============================================
  // CHR DATA LOADING
  // ============================================
  const loadChrInitialData = useCallback(async () => {
    setChrLoading(true);
    try {
      const [sourcesData, categoriesData, statsData] = await Promise.all([
        listImportSources(),
        listChrCategories(),
        getImportStats(),
      ]);
      setChrSources(sourcesData);
      setChrCategories(categoriesData);
      setChrStats(statsData);
      await loadChrBatches();
      await loadChrStagingEntries();
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setChrLoading(false);
    }
  }, [toast]);

  const loadChrBatches = useCallback(async () => {
    try {
      const { batches: data } = await listBatches(20, 0);
      setChrBatches(data);
    } catch (error) {
      console.error("Failed to load batches:", error);
    }
  }, []);

  const loadChrStagingEntries = useCallback(async () => {
    try {
      const { entries, total } = await listStagingEntries(
        chrStagingFilters,
        chrStagingPageSize,
        (chrStagingPage - 1) * chrStagingPageSize
      );
      setChrStagingEntries(entries);
      setChrStagingTotal(total);
    } catch (error) {
      console.error("Failed to load staging:", error);
    }
  }, [chrStagingFilters, chrStagingPage, chrStagingPageSize]);

  // Load CHR staging when filters change
  useEffect(() => {
    if (chrStats) {
      loadChrStagingEntries();
    }
  }, [chrStagingFilters, chrStagingPage, chrStats, loadChrStagingEntries]);

  // ============================================
  // CHR POLLING FOR RUNNING BATCHES
  // ============================================
  useEffect(() => {
    // Check if any batch is running
    const hasRunningBatch = chrBatches.some(
      (b) => b.status === "running" || b.status === "pending"
    );

    if (!hasRunningBatch) return;

    // Poll every 3 seconds while a batch is running
    const interval = setInterval(async () => {
      try {
        const { batches: data } = await listBatches(20, 0);
        setChrBatches(data);

        // Check if batch just completed
        const wasRunning = chrBatches.some((b) => b.status === "running");
        const nowRunning = data.some((b) => b.status === "running");

        if (wasRunning && !nowRunning) {
          // Batch completed - refresh staging and stats
          await loadChrStagingEntries();
          const newStats = await getImportStats();
          setChrStats(newStats);

          // Find completed batch
          const completed = data.find(
            (b) =>
              b.status === "completed" &&
              chrBatches.find((old) => old.id === b.id)?.status === "running"
          );

          if (completed) {
            toast({
              title: "Collecte terminée",
              description: `${completed.totalNormalized} établissements collectés, ${completed.totalDuplicates} doublons détectés`,
            });
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [chrBatches, loadChrStagingEntries, toast]);

  // ============================================
  // CHR HANDLERS
  // ============================================
  async function handleChrCreateBatch() {
    if (chrNewBatchConfig.sources.length === 0) {
      toast({
        title: "Erreur",
        description: "Sélectionnez au moins une source",
        variant: "destructive",
      });
      return;
    }
    if (chrNewBatchConfig.cities.length === 0) {
      toast({
        title: "Erreur",
        description: "Sélectionnez au moins une ville",
        variant: "destructive",
      });
      return;
    }

    try {
      const batch = await createBatch({
        sources: chrNewBatchConfig.sources,
        cities: chrNewBatchConfig.cities,
        categories:
          chrNewBatchConfig.categories.length > 0
            ? chrNewBatchConfig.categories
            : undefined,
        keywords: chrNewBatchConfig.keywords
          ? chrNewBatchConfig.keywords.split(",").map((k) => k.trim())
          : undefined,
      });

      // Lancer le batch immédiatement
      await runBatch(batch.id);

      toast({
        title: "Batch créé",
        description: "L'import a démarré en arrière-plan",
      });

      setChrNewBatchOpen(false);
      setChrNewBatchConfig({
        sources: [],
        cities: [],
        categories: [],
        keywords: "",
      });

      // Rafraîchir
      await loadChrBatches();
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleChrApprove(entry: StagingEntry) {
    try {
      await approveStagingEntry(entry.id);
      toast({
        title: "Établissement importé",
        description: `${entry.name} créé en DRAFT`,
      });
      await loadChrStagingEntries();
      setChrDrawerOpen(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleChrReject(entry: StagingEntry, notes?: string) {
    try {
      await rejectStagingEntry(entry.id, notes);
      toast({ title: "Entrée rejetée" });
      await loadChrStagingEntries();
      setChrDrawerOpen(false);
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleChrBulkApprove() {
    if (chrSelectedIds.size === 0) return;

    try {
      const result = await bulkApproveStagingEntries(Array.from(chrSelectedIds));
      toast({
        title: "Import en masse",
        description: `${result.success} importés, ${result.failed} échoués`,
      });
      setChrSelectedIds(new Set());
      await loadChrStagingEntries();
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleChrBulkReject() {
    if (chrSelectedIds.size === 0) return;

    try {
      await bulkRejectStagingEntries(Array.from(chrSelectedIds));
      toast({ title: `${chrSelectedIds.size} entrées rejetées` });
      setChrSelectedIds(new Set());
      await loadChrStagingEntries();
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleChrCleanupDuplicates() {
    if (!confirm("Voulez-vous nettoyer automatiquement les doublons ? Cette action supprimera les entrées en double et gardera les plus complètes.")) {
      return;
    }

    setChrCleaningDuplicates(true);
    try {
      const result = await cleanupStagingDuplicates();
      toast({
        title: "Nettoyage terminé",
        description: `${result.deletedCount} doublons supprimés, ${result.keptCount} entrées conservées (${result.groups} groupes traités)`,
      });
      // Rafraîchir les données
      await loadChrStagingEntries();
      const newStats = await getImportStats();
      setChrStats(newStats);
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setChrCleaningDuplicates(false);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm("Supprimer ce batch et toutes ses entrées staging associées ?")) {
      return;
    }

    try {
      await deleteBatch(batchId);
      toast({
        title: "Batch supprimé",
        description: "Le batch et ses données ont été supprimés",
      });
      await loadChrBatches();
      // Rafraîchir aussi les stats et le staging
      const newStats = await getImportStats();
      setChrStats(newStats);
      await loadChrStagingEntries();
    } catch (error) {
      toast({
        title: "Erreur",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  function toggleChrSelect(id: string) {
    const newSet = new Set(chrSelectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setChrSelectedIds(newSet);
  }

  function toggleChrSelectAll() {
    if (chrSelectedIds.size === chrStagingEntries.length) {
      setChrSelectedIds(new Set());
    } else {
      setChrSelectedIds(new Set(chrStagingEntries.map((e) => e.id)));
    }
  }

  async function openChrEntryDetail(entry: StagingEntry) {
    try {
      const fullEntry = await getStagingEntry(entry.id);
      setChrSelectedEntry(fullEntry);
      setChrDrawerOpen(true);
    } catch (error) {
      console.error("Failed to load entry details:", error);
    }
  }

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
      <AdminEstablishmentsNav />
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
          <TabsTrigger value="chr" className="gap-2" onClick={() => {
            if (!chrStats) {
              loadChrInitialData();
            }
          }}>
            <Database className="h-4 w-4" />
            CHR
          </TabsTrigger>
          <TabsTrigger value="sql" className="gap-2">
            <FileCode className="h-4 w-4" />
            SQL
          </TabsTrigger>
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
                <div className="flex items-center gap-x-2 rounded-lg border p-4">
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

        {/* CHR Tab */}
        <TabsContent value="chr" className="space-y-4">
          {chrLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* CHR Header with action button */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Import CHR</h3>
                  <p className="text-sm text-muted-foreground">
                    Collecte automatique d'établissements depuis plusieurs sources
                  </p>
                </div>
                <Button onClick={() => setChrNewBatchOpen(true)}>
                  <Play className="h-4 w-4 me-2" />
                  Nouvelle collecte
                </Button>
              </div>

              {/* CHR Stats Cards */}
              {chrStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{chrStats.staging.total}</div>
                      <div className="text-sm text-muted-foreground">
                        Total en staging
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-blue-600">
                        {chrStats.staging.byStatus["new"] || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">À valider</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-green-600">
                        {chrStats.staging.byStatus["imported"] || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Importés</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-red-600">
                        {chrStats.staging.byStatus["rejected"] || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">Rejetés</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* CHR Sub-tabs */}
              <Tabs value={chrSubTab} onValueChange={(v) => setChrSubTab(v as "staging" | "batches")}>
                <TabsList>
                  <TabsTrigger value="staging">
                    Staging ({chrStats?.staging.byStatus["new"] || 0})
                  </TabsTrigger>
                  <TabsTrigger value="batches">Historique batches</TabsTrigger>
                </TabsList>

                {/* CHR STAGING TAB */}
                <TabsContent value="staging" className="space-y-4">
                  {/* Filters */}
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex-1 min-w-[200px]">
                          <Input
                            placeholder="Rechercher..."
                            value={chrStagingFilters.search || ""}
                            onChange={(e) =>
                              setChrStagingFilters({
                                ...chrStagingFilters,
                                search: e.target.value || undefined,
                              })
                            }
                            className="max-w-xs"
                          />
                        </div>

                        <Select
                          value={chrStagingFilters.status || "all"}
                          onValueChange={(v) =>
                            setChrStagingFilters({
                              ...chrStagingFilters,
                              status: v === "all" ? undefined : (v as StagingStatus),
                            })
                          }
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Statut" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tous</SelectItem>
                            <SelectItem value="new">Nouveau</SelectItem>
                            <SelectItem value="approved">Approuvé</SelectItem>
                            <SelectItem value="rejected">Rejeté</SelectItem>
                            <SelectItem value="imported">Importé</SelectItem>
                          </SelectContent>
                        </Select>

                        <Select
                          value={chrStagingFilters.city || "all"}
                          onValueChange={(v) =>
                            setChrStagingFilters({
                              ...chrStagingFilters,
                              city: v === "all" ? undefined : v,
                            })
                          }
                        >
                          <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="Ville" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes</SelectItem>
                            {MOROCCAN_CITIES.map((city) => (
                              <SelectItem key={city.value} value={city.value}>
                                {city.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button
                          variant="outline"
                          onClick={() => {
                            setChrStagingFilters({});
                            setChrStagingPage(1);
                          }}
                        >
                          <RefreshCw className="h-4 w-4 me-2" />
                          Réinitialiser
                        </Button>

                        <a
                          href={getStagingExportUrl(chrStagingFilters)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline">
                            <Download className="h-4 w-4 me-2" />
                            Export CSV
                          </Button>
                        </a>

                        <Button
                          variant="outline"
                          onClick={handleChrCleanupDuplicates}
                          disabled={chrCleaningDuplicates}
                          className="text-orange-600 border-orange-300 hover:bg-orange-50"
                        >
                          {chrCleaningDuplicates ? (
                            <Loader2 className="h-4 w-4 me-2 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 me-2" />
                          )}
                          Nettoyer doublons
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bulk Actions */}
                  {chrSelectedIds.size > 0 && (
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <span className="font-medium">{chrSelectedIds.size} sélectionné(s)</span>
                      <Button size="sm" onClick={handleChrBulkApprove}>
                        <Check className="h-4 w-4 me-2" />
                        Valider
                      </Button>
                      <Button size="sm" variant="destructive" onClick={handleChrBulkReject}>
                        <X className="h-4 w-4 me-2" />
                        Rejeter
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setChrSelectedIds(new Set())}
                      >
                        Annuler
                      </Button>
                    </div>
                  )}

                  {/* Table */}
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="p-3 text-start w-10">
                                <Checkbox
                                  checked={
                                    chrSelectedIds.size === chrStagingEntries.length &&
                                    chrStagingEntries.length > 0
                                  }
                                  onCheckedChange={toggleChrSelectAll}
                                />
                              </th>
                              <th className="p-3 text-start">Nom</th>
                              <th className="p-3 text-start whitespace-nowrap">Catégorie</th>
                              <th className="p-3 text-start whitespace-nowrap">Ville</th>
                              <th className="p-3 text-start whitespace-nowrap">Sources</th>
                              <th className="p-3 text-start whitespace-nowrap">Score</th>
                              <th className="p-3 text-start whitespace-nowrap">Statut</th>
                              <th className="p-3 text-start whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chrStagingEntries.map((entry) => (
                              <tr
                                key={entry.id}
                                className="border-t hover:bg-muted/30 cursor-pointer"
                                onClick={() => openChrEntryDetail(entry)}
                              >
                                <td
                                  className="p-3"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Checkbox
                                    checked={chrSelectedIds.has(entry.id)}
                                    onCheckedChange={() => toggleChrSelect(entry.id)}
                                  />
                                </td>
                                <td className="p-3">
                                  <div className="font-medium">{toTitleCase(entry.name)}</div>
                                  {entry.addressFull && (
                                    <div className="text-sm text-muted-foreground truncate max-w-xs">
                                      {entry.addressFull}
                                    </div>
                                  )}
                                </td>
                                <td className="p-3">
                                  <Badge variant="outline">
                                    {getCategoryLabel(entry.category)}
                                  </Badge>
                                </td>
                                <td className="p-3 capitalize whitespace-nowrap">{entry.city}</td>
                                <td className="p-3 whitespace-nowrap">
                                  <div className="flex gap-1">
                                    {entry.sources.map((s, i) => (
                                      <Badge
                                        key={i}
                                        variant="secondary"
                                        className="text-xs"
                                      >
                                        {s.source}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                        entry.confidenceScore >= 85
                                          ? "bg-red-100 text-red-800"
                                          : entry.confidenceScore >= 50
                                            ? "bg-yellow-100 text-yellow-800"
                                            : "bg-green-100 text-green-800"
                                      }`}
                                    >
                                      {entry.confidenceScore}
                                    </div>
                                    {entry.confidenceScore >= 85 && (
                                      <AlertTriangle className="h-4 w-4 text-red-500" />
                                    )}
                                  </div>
                                </td>
                                <td className="p-3 whitespace-nowrap">
                                  <Badge className={getStatusColor(entry.status)}>
                                    {getStatusLabel(entry.status)}
                                  </Badge>
                                </td>
                                <td
                                  className="p-3"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex gap-2">
                                    {entry.status === "new" && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleChrApprove(entry)}
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => handleChrReject(entry)}
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => openChrEntryDetail(entry)}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      <PaginationControls
                        currentPage={chrStagingPage - 1}
                        pageSize={chrStagingPageSize}
                        totalItems={chrStagingTotal}
                        onPageChange={(p) => setChrStagingPage(p + 1)}
                        onPageSizeChange={(s) => {
                          setChrStagingPageSize(s);
                          setChrStagingPage(1);
                        }}
                      />
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* CHR BATCHES TAB */}
                <TabsContent value="batches" className="space-y-4">
                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="p-3 text-start">Date</th>
                              <th className="p-3 text-start">Sources</th>
                              <th className="p-3 text-start">Villes</th>
                              <th className="p-3 text-start">Progression</th>
                              <th className="p-3 text-start">Collectés</th>
                              <th className="p-3 text-start">Normalisés</th>
                              <th className="p-3 text-start">Doublons</th>
                              <th className="p-3 text-end">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chrBatches.slice(chrBatchPage * chrBatchPageSize, (chrBatchPage + 1) * chrBatchPageSize).map((batch) => (
                              <tr key={batch.id} className={cn(
                                "border-t",
                                batch.status === "running" && "bg-blue-50/50"
                              )}>
                                <td className="p-3">
                                  {new Date(batch.createdAt).toLocaleDateString("fr-FR")}
                                </td>
                                <td className="p-3">
                                  <div className="flex flex-wrap gap-1">
                                    {batch.sources.map((s) => (
                                      <Badge key={s} variant="outline" className="text-xs">
                                        {getSourceLabel(s)}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="p-3">
                                  {batch.cities.slice(0, 3).join(", ")}
                                  {batch.cities.length > 3 && ` +${batch.cities.length - 3}`}
                                </td>
                                <td className="p-3">
                                  {/* Colonne Progression avec icône dynamique */}
                                  <div className="flex items-center gap-2">
                                    {batch.status === "pending" && (
                                      <>
                                        <Timer className="h-5 w-5 text-slate-400" />
                                        <span className="text-sm text-slate-500">En attente</span>
                                      </>
                                    )}
                                    {batch.status === "running" && (
                                      <>
                                        <div className="relative">
                                          <CircleDot className="h-5 w-5 text-blue-500 animate-pulse" />
                                          <Sparkles className="h-3 w-3 text-blue-400 absolute -top-1 -end-1 animate-bounce" />
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-sm font-medium text-blue-600">En cours</span>
                                          <span className="text-xs text-blue-500 animate-pulse">Scraping...</span>
                                        </div>
                                      </>
                                    )}
                                    {batch.status === "completed" && (
                                      <>
                                        <CheckCheck className="h-5 w-5 text-green-500" />
                                        <span className="text-sm text-green-600">Terminé</span>
                                      </>
                                    )}
                                    {batch.status === "failed" && (
                                      <>
                                        <XOctagon className="h-5 w-5 text-red-500" />
                                        <span className="text-sm text-red-600">Échoué</span>
                                      </>
                                    )}
                                    {batch.status === "cancelled" && (
                                      <>
                                        <Ban className="h-5 w-5 text-slate-400" />
                                        <span className="text-sm text-slate-500">Annulé</span>
                                      </>
                                    )}
                                  </div>
                                </td>
                                <td className="p-3">
                                  <span className={cn(
                                    batch.status === "running" && "animate-pulse font-medium text-blue-600"
                                  )}>
                                    {batch.totalFetched}
                                  </span>
                                </td>
                                <td className="p-3">
                                  <span className={cn(
                                    batch.status === "running" && "animate-pulse font-medium text-blue-600"
                                  )}>
                                    {batch.totalNormalized}
                                  </span>
                                </td>
                                <td className="p-3">{batch.totalDuplicates}</td>
                                <td className="p-3 text-end">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteBatch(batch.id)}
                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                    disabled={batch.status === "running"}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {chrBatches.length > 0 && (
                        <PaginationControls
                          currentPage={chrBatchPage}
                          pageSize={chrBatchPageSize}
                          totalItems={chrBatches.length}
                          onPageChange={setChrBatchPage}
                          onPageSizeChange={(s) => {
                            setChrBatchPageSize(s);
                            setChrBatchPage(0);
                          }}
                        />
                      )}

                      {/* Aperçu détaillé en temps réel pour le batch en cours */}
                      {chrBatches.some((b) => b.status === "running") && (
                        <div className="border-t bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="relative">
                              <Loader2 className="h-6 w-6 text-blue-600 animate-spin" />
                            </div>
                            <div>
                              <h4 className="font-medium text-blue-800">Collecte en cours...</h4>
                              <p className="text-sm text-blue-600">Les données sont en train d'être récupérées</p>
                            </div>
                          </div>

                          {/* Progress bar simulée */}
                          <div className="mb-3">
                            <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse"
                                style={{
                                  width: '100%',
                                  animation: 'indeterminate 1.5s infinite linear',
                                }}
                              />
                            </div>
                          </div>

                          {/* Détails du batch en cours */}
                          {chrBatches.filter((b) => b.status === "running").map((batch) => (
                            <div key={batch.id} className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div className="bg-white/60 rounded-lg p-3">
                                <div className="text-slate-500 text-xs mb-1">Sources</div>
                                <div className="font-medium">{batch.sources.map(getSourceLabel).join(", ")}</div>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3">
                                <div className="text-slate-500 text-xs mb-1">Villes ciblées</div>
                                <div className="font-medium">{batch.cities.join(", ")}</div>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3">
                                <div className="text-slate-500 text-xs mb-1">Éléments récupérés</div>
                                <div className="font-medium text-blue-600 animate-pulse">
                                  {batch.totalFetched} lieu(x)
                                </div>
                              </div>
                              <div className="bg-white/60 rounded-lg p-3">
                                <div className="text-slate-500 text-xs mb-1">En traitement</div>
                                <div className="font-medium text-indigo-600 animate-pulse">
                                  {batch.totalNormalized} normalisé(s)
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Animation CSS pour la barre de progression indéterminée */}
                          <style>{`
                            @keyframes indeterminate {
                              0% { transform: translateX(-100%); }
                              100% { transform: translateX(100%); }
                            }
                          `}</style>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </TabsContent>

        {/* SQL Tab */}
        <TabsContent value="sql" className="space-y-4">
          <SqlImportTab />
        </TabsContent>
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
                          <XCircle className="h-3 w-3 me-1" />
                          Erreur
                        </Badge>
                      ) : item.isNew ? (
                        <Badge variant="default" className="bg-green-500 text-xs">
                          <CheckCircle2 className="h-3 w-3 me-1" />
                          Nouveau
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                          <AlertCircle className="h-3 w-3 me-1" />
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

      {/* CHR NEW BATCH DIALOG */}
      <Dialog open={chrNewBatchOpen} onOpenChange={setChrNewBatchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle collecte CHR</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Sources */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Sources à utiliser
              </label>
              <div className="grid grid-cols-2 gap-2">
                {chrSources.map((source) => (
                  <label
                    key={source.slug}
                    className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${
                      chrNewBatchConfig.sources.includes(source.slug)
                        ? "border-primary bg-primary/5"
                        : ""
                    } ${!source.enabled ? "opacity-50" : ""}`}
                  >
                    <Checkbox
                      checked={chrNewBatchConfig.sources.includes(source.slug)}
                      disabled={!source.enabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            sources: [...chrNewBatchConfig.sources, source.slug],
                          });
                        } else {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            sources: chrNewBatchConfig.sources.filter(
                              (s) => s !== source.slug
                            ),
                          });
                        }
                      }}
                    />
                    <div>
                      <div className="font-medium">{source.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {source.type === "api" ? "API officielle" : "Scraper"}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Villes */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Villes à scanner
              </label>
              <div className="grid grid-cols-3 gap-2">
                {MOROCCAN_CITIES.map((city) => (
                  <label
                    key={city.value}
                    className={`flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${
                      chrNewBatchConfig.cities.includes(city.value)
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <Checkbox
                      checked={chrNewBatchConfig.cities.includes(city.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            cities: [...chrNewBatchConfig.cities, city.value],
                          });
                        } else {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            cities: chrNewBatchConfig.cities.filter(
                              (c) => c !== city.value
                            ),
                          });
                        }
                      }}
                    />
                    {city.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Catégories (optionnel) */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Catégories (optionnel - toutes si vide)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {chrCategories.map((cat) => (
                  <label
                    key={cat.slug}
                    className={`flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-muted/50 ${
                      chrNewBatchConfig.categories.includes(cat.slug as ChrCategory)
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <Checkbox
                      checked={chrNewBatchConfig.categories.includes(
                        cat.slug as ChrCategory
                      )}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            categories: [
                              ...chrNewBatchConfig.categories,
                              cat.slug as ChrCategory,
                            ],
                          });
                        } else {
                          setChrNewBatchConfig({
                            ...chrNewBatchConfig,
                            categories: chrNewBatchConfig.categories.filter(
                              (c) => c !== cat.slug
                            ),
                          });
                        }
                      }}
                    />
                    {getCategoryLabel(cat.slug)}
                  </label>
                ))}
              </div>
            </div>

            {/* Keywords (optionnel) */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Mots-clés (optionnel, séparés par des virgules)
              </label>
              <Input
                placeholder="pizza, sushi, brunch..."
                value={chrNewBatchConfig.keywords}
                onChange={(e) =>
                  setChrNewBatchConfig({
                    ...chrNewBatchConfig,
                    keywords: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChrNewBatchOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleChrCreateBatch}>
              <Play className="h-4 w-4 me-2" />
              Lancer la collecte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CHR DETAIL DRAWER */}
      <Sheet open={chrDrawerOpen} onOpenChange={setChrDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {chrSelectedEntry && (
            <>
              <SheetHeader>
                <SheetTitle>{toTitleCase(chrSelectedEntry.name)}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Status et score */}
                <div className="flex items-center gap-4">
                  <Badge className={getStatusColor(chrSelectedEntry.status)}>
                    {getStatusLabel(chrSelectedEntry.status)}
                  </Badge>
                  {chrSelectedEntry.confidenceScore >= 85 && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 me-1" />
                      Doublon probable ({chrSelectedEntry.confidenceScore}%)
                    </Badge>
                  )}
                </div>

                {/* Doublons potentiels */}
                {chrSelectedEntry.dedupeCandidates &&
                  chrSelectedEntry.dedupeCandidates.length > 0 && (
                    <Card className="border-yellow-200 bg-yellow-50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-yellow-800">
                          Doublons potentiels détectés
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {chrSelectedEntry.dedupeCandidates.map((candidate, i) => (
                          <div key={i} className="text-sm py-2 border-t first:border-t-0">
                            <div className="font-medium">
                              {candidate.name} ({candidate.city})
                            </div>
                            <div className="text-muted-foreground">
                              Score: {candidate.score}% -{" "}
                              {candidate.reasons.join(", ")}
                            </div>
                            {candidate.establishmentId && (
                              <a
                                href={`/admin/establishments/${candidate.establishmentId}`}
                                target="_blank"
                                className="text-primary hover:underline text-xs"
                              >
                                Voir l'établissement existant
                              </a>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}

                {/* Infos principales */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">
                      Catégorie
                    </label>
                    <div className="font-medium">
                      {getCategoryLabel(chrSelectedEntry.category)}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">
                      Ville
                    </label>
                    <div className="font-medium capitalize">
                      {chrSelectedEntry.city}
                    </div>
                  </div>
                </div>

                {/* Contact */}
                <div className="space-y-2">
                  {chrSelectedEntry.addressFull && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <span>{chrSelectedEntry.addressFull}</span>
                    </div>
                  )}
                  {chrSelectedEntry.phoneE164 && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{chrSelectedEntry.phoneE164}</span>
                    </div>
                  )}
                  {chrSelectedEntry.websiteUrl && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a
                        href={chrSelectedEntry.websiteUrl}
                        target="_blank"
                        className="text-primary hover:underline"
                      >
                        {chrSelectedEntry.websiteUrl}
                      </a>
                    </div>
                  )}
                  {chrSelectedEntry.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{chrSelectedEntry.email}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {chrSelectedEntry.descriptionShort && (
                  <div>
                    <label className="text-sm text-muted-foreground">
                      Description
                    </label>
                    <p className="mt-1">{chrSelectedEntry.descriptionShort}</p>
                  </div>
                )}

                {/* Photos */}
                {chrSelectedEntry.photos && chrSelectedEntry.photos.length > 0 && (
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Photos ({chrSelectedEntry.photos.length})
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {chrSelectedEntry.photos.slice(0, 6).map((photo, i) => (
                        <img
                          key={i}
                          src={photo.url}
                          alt=""
                          className="w-full h-24 object-cover rounded"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Sources */}
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">
                    Sources
                  </label>
                  {chrSelectedEntry.sources.map((source, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-2 border-t"
                    >
                      <Badge variant="outline">
                        {getSourceLabel(source.source)}
                      </Badge>
                      <a
                        href={source.sourceUrl}
                        target="_blank"
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                      >
                        Voir <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                {chrSelectedEntry.status === "new" && (
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      className="flex-1"
                      onClick={() => handleChrApprove(chrSelectedEntry)}
                    >
                      <Check className="h-4 w-4 me-2" />
                      Valider (créer en DRAFT)
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleChrReject(chrSelectedEntry)}
                    >
                      <X className="h-4 w-4 me-2" />
                      Rejeter
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
