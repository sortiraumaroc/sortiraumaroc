import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileCode,
  Upload,
  Loader2,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  Database,
  FileUp,
  Search,
  Clock,
  XCircle,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { PaginationControls } from "@/components/admin/table/PaginationControls";
import {
  parseSqlFile,
  previewSqlImport,
  executeSqlImport,
  type SqlParseResult,
  type SqlPreviewResult,
  type SqlDuplicateGroup,
} from "@/lib/adminImportSql";

// ─── Helpers ────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  active: "Actif",
  suspended: "Désactivé",
  rejected: "Rejeté",
};

function statusBadgeVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "pending": return "secondary";
    case "rejected": return "destructive";
    default: return "outline";
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function completenessLabel(score: number): string {
  if (score >= 60) return "text-emerald-600";
  if (score >= 30) return "text-amber-600";
  return "text-red-600";
}

// ─── History types ──────────────────────────────────────────────────────

type ImportHistoryEntry = {
  id: string;
  fileName: string;
  date: Date;
  status: "parsed" | "previewed" | "imported" | "error";
  totalRows: number;
  importedCount?: number;
  deletedCount?: number;
  errorCount?: number;
  errorMessage?: string;
};

// ─── Component ──────────────────────────────────────────────────────────

interface Props {
  adminKey?: string;
}

export function SqlImportTab({ adminKey }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File state
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);

  // Parse state
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState<SqlParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Preview state
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<SqlPreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Selected main table for duplicate detection
  const [mainTable, setMainTable] = useState<string | null>(null);

  // Selection state
  const [deleteIds, setDeleteIds] = useState<Set<string>>(() => new Set());
  const [skipSqlIndices, setSkipSqlIndices] = useState<Set<number>>(() => new Set());

  // New-only pagination
  const [newOnlyPage, setNewOnlyPage] = useState(0);
  const [newOnlyPageSize, setNewOnlyPageSize] = useState(25);

  // Execute state
  const [executing, setExecuting] = useState(false);

  // Import history
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);

  // Reset pagination when preview changes
  useEffect(() => { setNewOnlyPage(0); }, [previewResult]);

  // ─── File handling ──────────────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseResult(null);
    setPreviewResult(null);
    setParseError(null);
    setPreviewError(null);
    setDeleteIds(new Set());
    setSkipSqlIndices(new Set());
    setMainTable(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileContent(event.target?.result as string);
      setFileName(file.name);
    };
    reader.readAsText(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // ─── Parse ──────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    if (!fileContent || !fileName) return;

    setParsing(true);
    setParseError(null);
    setParseResult(null);
    setPreviewResult(null);

    try {
      const result = await parseSqlFile(fileContent);
      setParseResult(result);

      // Auto-select the main table (one with "name" column, or fallback to most columns)
      if (result.tables.length === 1) {
        setMainTable(result.tables[0].table);
      } else if (result.tables.length > 1) {
        const withName = result.tables.find((t) =>
          t.columns.some((c) => c === "name" || c === "nom"),
        );
        if (withName) {
          setMainTable(withName.table);
        } else {
          // Pick the one with most columns
          const sorted = [...result.tables].sort((a, b) => b.columns.length - a.columns.length);
          setMainTable(sorted[0].table);
        }
      }

      setHistory((prev) => [{
        id: crypto.randomUUID(),
        fileName: fileName,
        date: new Date(),
        status: "parsed" as const,
        totalRows: result.totalRows,
      }, ...prev].slice(0, 20));

      toast({
        title: "SQL analysé",
        description: `${result.totalRows} ligne(s) trouvée(s) dans ${result.tables.length} table(s)`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur de parsing";
      setParseError(msg);

      setHistory((prev) => [{
        id: crypto.randomUUID(),
        fileName: fileName,
        date: new Date(),
        status: "error" as const,
        totalRows: 0,
        errorMessage: msg,
      }, ...prev].slice(0, 20));
    } finally {
      setParsing(false);
    }
  }, [fileContent, fileName, toast]);

  // ─── Preview ──────────────────────────────────────────────────────

  const handlePreview = useCallback(async () => {
    if (!parseResult?.rows.length) return;

    setPreviewing(true);
    setPreviewError(null);

    try {
      // Only send rows from the selected main table (not auxiliary tables like photos, workdays, etc.)
      const rowsToPreview = mainTable
        ? parseResult.rows.filter((r) => r._source_table === mainTable)
        : parseResult.rows;

      const result = await previewSqlImport(rowsToPreview);
      setPreviewResult(result);
      setDeleteIds(new Set());
      setSkipSqlIndices(new Set());
      setPreviewOpen(true);

      setHistory((prev) => {
        const updated = [...prev];
        const last = updated.find((h) => h.fileName === fileName && h.status === "parsed");
        if (last) last.status = "previewed";
        return updated;
      });
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Erreur de détection");
    } finally {
      setPreviewing(false);
    }
  }, [parseResult, fileName, mainTable]);

  // ─── Auto-select less complete ────────────────────────────────────

  const autoSelectLessComplete = useCallback(() => {
    if (!previewResult) return;

    const newDeleteIds = new Set<string>();
    const newSkipIndices = new Set<number>();

    for (const group of previewResult.groups) {
      const allItems: Array<{ type: "sql" | "existing"; completeness: number; id?: string; index?: number }> = [
        ...group.sqlRows.map((r) => ({ type: "sql" as const, completeness: r.completeness, index: r.index })),
        ...group.existingRows.map((r) => ({ type: "existing" as const, completeness: r.completeness, id: r.id })),
      ].sort((a, b) => b.completeness - a.completeness);

      for (let i = 1; i < allItems.length; i++) {
        const item = allItems[i];
        if (item.type === "existing" && item.id) {
          newDeleteIds.add(item.id);
        } else if (item.type === "sql" && item.index !== undefined) {
          newSkipIndices.add(item.index);
        }
      }
    }

    setDeleteIds(newDeleteIds);
    setSkipSqlIndices(newSkipIndices);
  }, [previewResult]);

  // ─── Toggle selection ─────────────────────────────────────────────

  const toggleDeleteId = (id: string) => {
    setDeleteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSkipSqlIndex = (index: number) => {
    setSkipSqlIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  // ─── Execute ──────────────────────────────────────────────────────

  const handleDeleteDuplicates = useCallback(async () => {
    if (!previewResult) return;

    const idsToDelete = Array.from(deleteIds);
    const indicesToSkip = Array.from(skipSqlIndices);

    if (idsToDelete.length === 0 && indicesToSkip.length === 0) {
      toast({ title: "Rien à supprimer", description: "Aucun doublon sélectionné.", variant: "destructive" });
      return;
    }

    setExecuting(true);

    try {
      // Only delete — no imports
      const result = await executeSqlImport([], idsToDelete);

      // Remove deleted existing rows + skipped SQL rows from previewResult
      setPreviewResult((prev) => {
        if (!prev) return prev;
        const updatedGroups = prev.groups
          .map((g) => ({
            ...g,
            existingRows: g.existingRows.filter((r) => !deleteIds.has(r.id)),
            sqlRows: g.sqlRows.filter((r) => !skipSqlIndices.has(r.index)),
          }))
          .filter((g) => g.sqlRows.length + g.existingRows.length > 1);

        // Move groups with only 1 item to newOnly
        const newNewOnly = [...prev.newOnly];
        const stillGroups: typeof updatedGroups = [];
        for (const g of updatedGroups) {
          if (g.sqlRows.length === 1 && g.existingRows.length === 0) {
            newNewOnly.push(g.sqlRows[0]);
          } else if (g.sqlRows.length === 0 && g.existingRows.length === 1) {
            stillGroups.push(g); // Keep single existing rows in groups view
          } else {
            stillGroups.push(g);
          }
        }

        const totalDups = stillGroups.reduce((s, g) => s + g.sqlRows.length, 0);

        return {
          ...prev,
          groups: stillGroups,
          newOnly: newNewOnly,
          stats: {
            total: prev.stats.total - indicesToSkip.length,
            duplicates: totalDups,
            new: newNewOnly.length,
          },
        };
      });

      setDeleteIds(new Set());
      setSkipSqlIndices(new Set());

      setHistory((prev) => [{
        id: crypto.randomUUID(),
        fileName: fileName ?? "unknown.sql",
        date: new Date(),
        status: "imported" as const,
        totalRows: idsToDelete.length + indicesToSkip.length,
        importedCount: 0,
        deletedCount: result.deletedCount,
        errorCount: result.errorCount,
      }, ...prev].slice(0, 20));

      toast({
        title: "Doublons supprimés",
        description: `${result.deletedCount} fiche(s) supprimée(s) de la base${indicesToSkip.length > 0 ? `, ${indicesToSkip.length} ligne(s) SQL exclue(s)` : ""}${result.errorCount > 0 ? `, ${result.errorCount} erreur(s)` : ""}`,
      });

      if (result.errors.length > 0) {
        console.warn("SQL Import delete errors:", result.errors);
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de la suppression",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  }, [previewResult, deleteIds, skipSqlIndices, fileName, toast]);

  const handleImportRest = useCallback(async () => {
    if (!previewResult || !parseResult) return;

    setExecuting(true);

    try {
      const rowsToImport: Record<string, string | null>[] = [];

      for (const item of previewResult.newOnly) {
        rowsToImport.push(item.rawData);
      }

      for (const group of previewResult.groups) {
        for (const sqlRow of group.sqlRows) {
          if (!skipSqlIndices.has(sqlRow.index)) {
            rowsToImport.push(sqlRow.rawData);
          }
        }
      }

      if (rowsToImport.length === 0) {
        toast({ title: "Rien à importer", description: "Aucune ligne à importer.", variant: "destructive" });
        setExecuting(false);
        return;
      }

      // Import only — no deletions (those are handled separately)
      const result = await executeSqlImport(rowsToImport, []);

      setPreviewOpen(false);

      setHistory((prev) => [{
        id: crypto.randomUUID(),
        fileName: fileName ?? "unknown.sql",
        date: new Date(),
        status: "imported" as const,
        totalRows: rowsToImport.length,
        importedCount: result.importedCount,
        deletedCount: 0,
        errorCount: result.errorCount,
      }, ...prev.filter((h) => !(h.fileName === fileName && (h.status === "parsed" || h.status === "previewed")))].slice(0, 20));

      if (result.errorCount > 0 && result.errors.length > 0) {
        // Log first errors for debugging
        console.error("[SQL Import] Errors:", result.errors.slice(0, 10));
        toast({
          title: `Import SQL : ${result.importedCount} importée(s), ${result.errorCount} erreur(s)`,
          description: result.errors.slice(0, 3).join("\n"),
          variant: "destructive",
          duration: 15000,
        });
      } else {
        toast({
          title: "Import SQL terminé",
          description: `${result.importedCount} fiche(s) importée(s) avec succès !`,
        });
      }

      setParseResult(null);
      setPreviewResult(null);
      setFileContent(null);
      setFileName(null);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de l'importation",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  }, [previewResult, parseResult, skipSqlIndices, fileName, toast]);

  const totalSelections = deleteIds.size + skipSqlIndices.size;

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Upload + Analyze — compact single card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileCode className="h-5 w-5" />
            Import SQL
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sql"
            onChange={handleFileSelect}
            className="hidden"
            id="sql-upload"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-4 w-4" />
              {fileName ? "Changer" : "Choisir un .sql"}
            </Button>

            {fileName && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <FileCode className="h-4 w-4 text-slate-400" />
                <span className="font-medium">{fileName}</span>
                {fileContent && (
                  <Badge variant="outline" className="text-xs">
                    {(fileContent.length / 1024).toFixed(1)} KB
                  </Badge>
                )}
              </div>
            )}

            {fileName && fileContent && (
              <Button
                onClick={() => void handleParse()}
                disabled={parsing}
                size="sm"
                className="gap-2"
              >
                {parsing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {parsing ? "Analyse..." : "Analyser"}
              </Button>
            )}
          </div>

          {parseError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {parseError}
            </div>
          )}

          {/* Parse Results — inline */}
          {parseResult && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">{parseResult.totalRows} ligne(s)</span>
                  <span className="text-slate-400">dans</span>
                  <span className="font-medium">{parseResult.tables.length} table(s)</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {parseResult.tables.length > 1 && (
                    <select
                      className="h-8 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700"
                      value={mainTable ?? ""}
                      onChange={(e) => setMainTable(e.target.value || null)}
                    >
                      {parseResult.tables.map((t) => (
                        <option key={t.table} value={t.table}>
                          {t.table} ({t.rowCount})
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    onClick={() => void handlePreview()}
                    disabled={previewing || !parseResult.totalRows}
                    size="sm"
                    className="gap-2"
                  >
                    {previewing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    {previewing ? "Détection..." : "Détecter les doublons"}
                  </Button>
                </div>
              </div>

              {/* Tables chips */}
              <div className="flex flex-wrap gap-2">
                {parseResult.tables.map((t, i) => (
                  <div key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-slate-200 bg-white text-xs">
                    <span className="font-mono font-medium text-slate-700">{t.table}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.rowCount}</Badge>
                  </div>
                ))}
              </div>

              {/* Sample row toggle */}
              {parseResult.tables[0]?.sampleRow && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    Aperçu de la 1ère ligne
                  </summary>
                  <pre className="mt-1 max-h-32 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(parseResult.tables[0].sampleRow, null, 2)}
                  </pre>
                </details>
              )}

              {previewError && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {previewError}
                </div>
              )}

              {/* Quick stats if preview done but dialog closed */}
              {previewResult && !previewOpen && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                    <CheckCircle2 className="h-3 w-3 me-1" />
                    {previewResult.stats.new} nouvelles
                  </Badge>
                  <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                    <AlertTriangle className="h-3 w-3 me-1" />
                    {previewResult.stats.duplicates} doublons
                  </Badge>
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
                    Revoir les doublons
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {history.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-slate-400" />
              Historique des opérations
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="space-y-1.5">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-md border border-slate-100 bg-slate-50/50 text-sm"
                >
                  {entry.status === "imported" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {entry.status === "parsed" && <Database className="h-4 w-4 text-blue-500 shrink-0" />}
                  {entry.status === "previewed" && <Search className="h-4 w-4 text-indigo-500 shrink-0" />}
                  {entry.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}

                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-slate-800 truncate">{entry.fileName}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.status === "imported" && (
                      <span className="text-xs text-emerald-600">
                        {entry.importedCount} importé(s){entry.deletedCount ? `, ${entry.deletedCount} supprimé(s)` : ""}
                        {entry.errorCount ? `, ${entry.errorCount} erreur(s)` : ""}
                      </span>
                    )}
                    {entry.status === "parsed" && (
                      <span className="text-xs text-blue-600">{entry.totalRows} lignes analysées</span>
                    )}
                    {entry.status === "previewed" && (
                      <span className="text-xs text-indigo-600">Doublons détectés</span>
                    )}
                    {entry.status === "error" && (
                      <span className="text-xs text-red-600 truncate max-w-[200px]" title={entry.errorMessage}>
                        {entry.errorMessage}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 whitespace-nowrap">
                      {formatTime(entry.date)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preview / Duplicates Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Analyse des doublons — Import SQL
            </DialogTitle>
            <DialogDescription>
              {previewResult
                ? `${previewResult.stats.total} lignes analysées : ${previewResult.stats.new} nouvelles, ${previewResult.stats.duplicates} en doublon avec ${previewResult.groups.length} groupe(s).`
                : "Chargement..."}
            </DialogDescription>
          </DialogHeader>

          {previewResult && (
            <>
              <div className="flex items-center justify-between gap-2 px-1">
                <Button variant="outline" size="sm" onClick={autoSelectLessComplete}>
                  Auto-sélectionner les moins complets
                </Button>
                {totalSelections > 0 && (
                  <span className="text-sm text-slate-600">
                    {totalSelections} sélectionné(s) pour suppression/exclusion
                  </span>
                )}
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pe-1" style={{ maxHeight: "calc(90vh - 240px)" }}>
                <div className="space-y-6 pb-2">

                  {/* Duplicate Groups */}
                  {previewResult.groups.map((group, gi) => (
                    <DuplicateGroupCard
                      key={gi}
                      group={group}
                      deleteIds={deleteIds}
                      skipSqlIndices={skipSqlIndices}
                      onToggleDeleteId={toggleDeleteId}
                      onToggleSkipSqlIndex={toggleSkipSqlIndex}
                      onToggleAll={(checked) => {
                        if (checked) {
                          // Select all items in this group
                          for (const r of group.existingRows) {
                            if (!deleteIds.has(r.id)) toggleDeleteId(r.id);
                          }
                          for (const r of group.sqlRows) {
                            if (!skipSqlIndices.has(r.index)) toggleSkipSqlIndex(r.index);
                          }
                        } else {
                          // Deselect all items in this group
                          for (const r of group.existingRows) {
                            if (deleteIds.has(r.id)) toggleDeleteId(r.id);
                          }
                          for (const r of group.sqlRows) {
                            if (skipSqlIndices.has(r.index)) toggleSkipSqlIndex(r.index);
                          }
                        }
                      }}
                      disabled={executing}
                    />
                  ))}

                  {/* New-only rows */}
                  {previewResult.newOnly.length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50">
                      <div className="px-4 py-2.5 border-b border-emerald-200 bg-emerald-100/60 rounded-t-lg">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-sm text-emerald-800">
                            Nouvelles fiches (sans doublon)
                          </span>
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                            {previewResult.newOnly.length} fiches
                          </Badge>
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Nom</TableHead>
                              <TableHead>Ville</TableHead>
                              <TableHead>Complétude</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {previewResult.newOnly.slice(newOnlyPage * newOnlyPageSize, (newOnlyPage + 1) * newOnlyPageSize).map((item) => (
                              <TableRow key={item.index}>
                                <TableCell className="text-sm font-medium">{item.name ?? "—"}</TableCell>
                                <TableCell className="text-sm text-slate-600">{item.city ?? "—"}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Progress value={item.completeness} className="h-2 w-20" />
                                    <span className={`text-xs font-bold ${completenessLabel(item.completeness)}`}>
                                      {item.completeness}%
                                    </span>
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        {previewResult.newOnly.length > 0 && (
                          <PaginationControls
                            currentPage={newOnlyPage}
                            pageSize={newOnlyPageSize}
                            totalItems={previewResult.newOnly.length}
                            onPageChange={setNewOnlyPage}
                            onPageSizeChange={(s) => {
                              setNewOnlyPageSize(s);
                              setNewOnlyPage(0);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setPreviewOpen(false)}
              disabled={executing}
            >
              Fermer
            </Button>

            <div className="flex items-center gap-2">
              {(deleteIds.size > 0 || skipSqlIndices.size > 0) && (
                <Button
                  variant="destructive"
                  onClick={() => void handleDeleteDuplicates()}
                  disabled={executing}
                  className="gap-2"
                >
                  {executing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Supprimer ({deleteIds.size + skipSqlIndices.size})
                </Button>
              )}
              <Button
                onClick={() => void handleImportRest()}
                disabled={executing}
                className="gap-2"
              >
                {executing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {executing
                  ? "Import..."
                  : `Importer${previewResult ? ` (${previewResult.newOnly.length + previewResult.groups.reduce((s, g) => s + g.sqlRows.filter((r) => !skipSqlIndices.has(r.index)).length, 0)})` : ""}`}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── DuplicateGroupCard sub-component ────────────────────────────────────

function DuplicateGroupCard({
  group,
  deleteIds,
  skipSqlIndices,
  onToggleDeleteId,
  onToggleSkipSqlIndex,
  onToggleAll,
  disabled,
}: {
  group: SqlDuplicateGroup;
  deleteIds: Set<string>;
  skipSqlIndices: Set<number>;
  onToggleDeleteId: (id: string) => void;
  onToggleSkipSqlIndex: (index: number) => void;
  onToggleAll: (checked: boolean) => void;
  disabled: boolean;
}) {
  const allScores = [
    ...group.sqlRows.map((r) => r.completeness),
    ...group.existingRows.map((r) => r.completeness),
  ];
  const bestScore = Math.max(...allScores);

  const totalItems = group.existingRows.length + group.sqlRows.length;
  const selectedCount =
    group.existingRows.filter((r) => deleteIds.has(r.id)).length +
    group.sqlRows.filter((r) => skipSqlIndices.has(r.index)).length;
  const allSelected = selectedCount === totalItems;
  const someSelected = selectedCount > 0 && selectedCount < totalItems;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50">
      <div className="px-4 py-2.5 border-b border-slate-200 bg-slate-100/60 rounded-t-lg">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(checked) => onToggleAll(!!checked)}
            disabled={disabled}
          />
          <span className="font-semibold text-sm text-slate-800">{group.name}</span>
          {group.city && <Badge variant="outline" className="text-xs">{group.city}</Badge>}
          <Badge variant="secondary" className="text-xs">
            {totalItems} fiches
          </Badge>
          {group.existingRows.length > 0 && (
            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
              {group.existingRows.length} en base
            </Badge>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-200">
        {/* Existing rows (from DB) */}
        {group.existingRows.map((item) => {
          const isBest = item.completeness === bestScore;
          const isChecked = deleteIds.has(item.id);

          return (
            <div
              key={item.id}
              className={`px-4 py-3 flex items-center gap-3 transition ${
                isChecked ? "bg-red-50/60" : isBest ? "bg-emerald-50/40" : ""
              }`}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => onToggleDeleteId(item.id)}
                disabled={disabled}
              />

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {item.name ?? item.id}
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    En base
                  </Badge>
                  <Badge variant={statusBadgeVariant(item.status)} className="text-[10px]">
                    {STATUS_LABELS[item.status ?? ""] ?? item.status ?? "—"}
                  </Badge>
                  {isBest && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                      Plus complet
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                          <Progress value={item.completeness} className="h-2 flex-1" />
                          <span className={`text-xs font-bold ${completenessLabel(item.completeness)}`}>
                            {item.completeness}%
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.filledFields}/{item.totalFields} champs remplis</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-xs text-slate-500">
                    {item.filledFields}/{item.totalFields} champs
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(item.created_at)}</span>
                </div>
              </div>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`/admin/establishments/${encodeURIComponent(item.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent>Voir la fiche</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })}

        {/* SQL rows (from file) */}
        {group.sqlRows.map((item) => {
          const isBest = item.completeness === bestScore;
          const isChecked = skipSqlIndices.has(item.index);

          return (
            <div
              key={`sql-${item.index}`}
              className={`px-4 py-3 flex items-center gap-3 transition ${
                isChecked ? "bg-red-50/60" : isBest ? "bg-emerald-50/40" : ""
              }`}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => onToggleSkipSqlIndex(item.index)}
                disabled={disabled}
              />

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">
                    {item.name ?? `Ligne ${item.index + 1}`}
                  </span>
                  <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-[10px]">
                    Fichier SQL
                  </Badge>
                  {isBest && (
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
                      Plus complet
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center gap-2 flex-1 max-w-[200px]">
                          <Progress value={item.completeness} className="h-2 flex-1" />
                          <span className={`text-xs font-bold ${completenessLabel(item.completeness)}`}>
                            {item.completeness}%
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{item.filledFields}/{item.totalFields} champs remplis</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-xs text-slate-500">
                    {item.filledFields}/{item.totalFields} champs
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
