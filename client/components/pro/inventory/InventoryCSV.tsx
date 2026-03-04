import { useRef, useState } from "react";
import { Download, Upload, Loader2, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { ProInventoryCategory, ProInventoryItem } from "@/lib/pro/types";
import { createProInventoryItem, createProInventoryCategory } from "@/lib/pro/api";
import { labelById, INVENTORY_LABELS } from "./inventoryLabels";
import { ALL_ALLERGENS, DIETARY_PREFERENCES, SPICY_LEVELS } from "./inventoryAllergens";

type Props = {
  establishmentId: string;
  categories: ProInventoryCategory[];
  items: ProInventoryItem[];
  canWrite: boolean;
  onImportComplete: () => void;
  itemLabel?: string;
};

type ImportResult = {
  success: number;
  failed: number;
  errors: string[];
};

// =============================================================================
// EXPORT CSV
// =============================================================================

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSVRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCSV).join(",");
}

export function exportInventoryToCSV(
  categories: ProInventoryCategory[],
  items: ProInventoryItem[]
): string {
  const categoryMap = new Map(categories.map((c) => [c.id, c.title]));

  const headers = [
    "titre",
    "description",
    "categorie",
    "prix_base_mad",
    "labels",
    "allergenes",
    "regimes",
    "niveau_epice",
    "actif",
    "visible_si_indisponible",
    "photos",
    "variantes",
  ];

  const rows: string[] = [buildCSVRow(headers)];

  for (const item of items) {
    const categoryName = item.category_id ? categoryMap.get(item.category_id) ?? "" : "";
    const labels = (item.labels ?? []).join(";");
    const photos = (item.photos ?? []).join(";");

    // Meta data
    const meta = item.meta ?? {};
    const allergens = Array.isArray(meta.allergens) ? meta.allergens.join(";") : "";
    const dietary = Array.isArray(meta.dietary) ? meta.dietary.join(";") : "";
    const spicyLevel = typeof meta.spicy_level === "string" ? meta.spicy_level : "";

    // Variantes format: "titre:prix;titre:prix"
    const variants = (item.variants ?? [])
      .filter((v) => v.is_active)
      .map((v) => `${v.title || ""}:${(v.price / 100).toFixed(2)}`)
      .join(";");

    const priceMAD = typeof item.base_price === "number" ? (item.base_price / 100).toFixed(2) : "";

    rows.push(
      buildCSVRow([
        item.title,
        item.description,
        categoryName,
        priceMAD,
        labels,
        allergens,
        dietary,
        spicyLevel,
        item.is_active ? "oui" : "non",
        item.visible_when_unavailable ? "oui" : "non",
        photos,
        variants,
      ])
    );
  }

  return rows.join("\n");
}

export function downloadCSV(content: string, filename: string) {
  const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
  const blob = new Blob([BOM + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =============================================================================
// IMPORT CSV / XLSX
// =============================================================================

async function parseXLSX(file: File): Promise<string[][]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  // Use first worksheet (the "Import" sheet if from our template)
  const ws = wb.getWorksheet(1);
  if (!ws) return [];

  const rows: string[][] = [];
  ws.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      // Pad with empty strings if columns were skipped
      while (cells.length < colNumber - 1) cells.push("");
      const val = cell.value;
      if (val === null || val === undefined) {
        cells.push("");
      } else if (typeof val === "object" && "text" in val) {
        // RichText
        cells.push(String((val as { text: string }).text ?? ""));
      } else {
        cells.push(String(val));
      }
    });
    rows.push(cells);
  });

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(content: string): string[][] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  return lines.map(parseCSVLine);
}

async function importCSVRow(
  establishmentId: string,
  row: string[],
  headers: string[],
  categoryMap: Map<string, string>, // name -> id
  existingCategories: ProInventoryCategory[]
): Promise<{ success: boolean; error?: string }> {
  const getValue = (headerName: string): string => {
    const idx = headers.indexOf(headerName);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  };

  const title = getValue("titre");
  if (!title) {
    return { success: false, error: "Titre manquant" };
  }

  const description = getValue("description") || null;
  const categoryName = getValue("categorie");
  const priceStr = getValue("prix_base_mad");
  const labelsStr = getValue("labels");
  const allergensStr = getValue("allergenes");
  const dietaryStr = getValue("regimes");
  const spicyLevel = getValue("niveau_epice");
  const activeStr = getValue("actif").toLowerCase();
  const visibleStr = getValue("visible_si_indisponible").toLowerCase();
  const photosStr = getValue("photos");

  // Resolve category
  let categoryId: string | null = null;
  if (categoryName) {
    if (categoryMap.has(categoryName.toLowerCase())) {
      categoryId = categoryMap.get(categoryName.toLowerCase())!;
    } else {
      // Create category if it doesn't exist
      try {
        const result = await createProInventoryCategory({
          establishmentId,
          data: { title: categoryName },
        });
        // Handle moderation response
        if ("pending" in result && result.pending) {
          // Category creation is pending moderation, skip assigning it
        } else if ("category" in result) {
          categoryId = result.category.id;
          categoryMap.set(categoryName.toLowerCase(), categoryId);
        }
      } catch {
        // Ignore category creation error, continue without category
      }
    }
  }

  // Parse price (in MAD, convert to centimes)
  let basePrice: number | null = null;
  if (priceStr) {
    const parsed = parseFloat(priceStr.replace(",", "."));
    if (!isNaN(parsed) && parsed >= 0) {
      basePrice = Math.round(parsed * 100);
    }
  }

  // Parse labels
  const labels = labelsStr
    ? labelsStr.split(";").filter((l) => INVENTORY_LABELS.some((il) => il.id === l))
    : [];

  // Parse allergens
  const allergens = allergensStr
    ? allergensStr.split(";").filter((a) => ALL_ALLERGENS.some((al) => al.id === a))
    : [];

  // Parse dietary
  const dietary = dietaryStr
    ? dietaryStr.split(";").filter((d) => DIETARY_PREFERENCES.some((dp) => dp.id === d))
    : [];

  // Parse photos
  const photos = photosStr ? photosStr.split(";").filter((p) => p.startsWith("http")) : [];

  // Build meta
  const meta: Record<string, unknown> = {};
  if (allergens.length > 0) meta.allergens = allergens;
  if (dietary.length > 0) meta.dietary = dietary;
  if (spicyLevel && SPICY_LEVELS.some((s) => s.id === spicyLevel)) {
    meta.spicy_level = spicyLevel;
  }

  try {
    await createProInventoryItem({
      establishmentId,
      data: {
        title,
        description,
        category_id: categoryId,
        base_price: basePrice,
        currency: "MAD",
        labels,
        photos,
        is_active: activeStr !== "non",
        visible_when_unavailable: visibleStr !== "non",
        meta: Object.keys(meta).length > 0 ? meta : undefined,
      },
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InventoryCSVDialog({
  open,
  onOpenChange,
  establishmentId,
  categories,
  items,
  canWrite,
  onImportComplete,
  itemLabel = "produits",
}: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const handleExport = () => {
    const csv = exportInventoryToCSV(categories, items);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `inventaire_${date}.csv`);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const isXlsx = file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls");

      let rows: string[][];
      if (isXlsx) {
        rows = await parseXLSX(file);
      } else {
        const content = await file.text();
        rows = parseCSV(content);
      }

      if (rows.length < 2) {
        setImportResult({ success: 0, failed: 0, errors: ["Fichier vide ou invalide"] });
        setImporting(false);
        return;
      }

      const headers = rows[0].map((h) =>
        h.toLowerCase().trim()
          // Map Excel display headers → internal CSV header names
          .replace("titre *", "titre")
          .replace("prix (mad)", "prix_base_mad")
          .replace("allergènes", "allergenes")
          .replace("régimes", "regimes")
          .replace("niveau épice", "niveau_epice")
          .replace("visible si indispo", "visible_si_indisponible")
          .replace("photos (urls)", "photos")
      );
      // Filter out empty/example rows (italic rows from template)
      const dataRows = rows.slice(1).filter((row) => {
        const firstCell = (row[0] ?? "").trim();
        // Skip empty rows and example rows from our template
        if (!firstCell) return false;
        if (firstCell.toLowerCase().startsWith("exemple ")) return false;
        if (firstCell.toLowerCase().startsWith("supprimez ces lignes")) return false;
        return true;
      });

      // Build category map for quick lookup
      const categoryMap = new Map<string, string>();
      for (const cat of categories) {
        categoryMap.set(cat.title.toLowerCase(), cat.id);
      }

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const result = await importCSVRow(
          establishmentId,
          row,
          headers,
          categoryMap,
          categories
        );

        if (result.success) {
          success++;
        } else {
          failed++;
          errors.push(`Ligne ${i + 2}: ${result.error || "Erreur inconnue"}`);
        }
      }

      setImportResult({ success, failed, errors: errors.slice(0, 10) });

      if (success > 0) {
        onImportComplete();
      }
    } catch (e) {
      setImportResult({
        success: 0,
        failed: 0,
        errors: [e instanceof Error ? e.message : "Erreur lors de la lecture du fichier"],
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const downloadTemplate = async () => {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Sortir Au Maroc";

    // ===================== Sheet 1 — Import =====================
    const ws = wb.addWorksheet("Import");

    const columns = [
      { header: "Titre *", key: "titre", width: 28 },
      { header: "Description", key: "description", width: 36 },
      { header: "Catégorie", key: "categorie", width: 20 },
      { header: "Prix (MAD)", key: "prix_base_mad", width: 14 },
      { header: "Labels", key: "labels", width: 28 },
      { header: "Allergènes", key: "allergenes", width: 28 },
      { header: "Régimes", key: "regimes", width: 22 },
      { header: "Niveau épice", key: "niveau_epice", width: 16 },
      { header: "Actif", key: "actif", width: 10 },
      { header: "Visible si indispo", key: "visible_si_indisponible", width: 20 },
      { header: "Photos (URLs)", key: "photos", width: 36 },
      { header: "Variantes", key: "variantes", width: 32 },
    ];
    ws.columns = columns;

    // Header style
    const brandColor = "A3001D";
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brandColor}` } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FF333333" } },
      };
    });
    ws.getRow(1).height = 30;

    // Example rows
    const examples = [
      ["Exemple Plat", "Description du plat", "Entrées", 12.5, "best_seller;traditionnel", "gluten;lait", "halal", "mild", "oui", "oui", "https://example.com/photo.jpg", ""],
      ["Exemple Boisson", "Jus d'orange frais", "Boissons", 3.0, "", "", "vegan", "none", "oui", "oui", "", ""],
    ];
    for (const ex of examples) {
      const row = ws.addRow(ex);
      row.eachCell((cell) => {
        cell.font = { italic: true, color: { argb: "FF888888" }, size: 10 };
      });
    }

    // Instructions row
    ws.addRow([]);
    const noteRow = ws.addRow(["Supprimez ces lignes d'exemple et remplissez vos données. Les valeurs acceptées pour chaque colonne sont listées dans l'onglet Référence."]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF666666" }, size: 9 };
    ws.mergeCells(noteRow.number, 1, noteRow.number, columns.length);

    // ===================== Sheet 2 — Référence =====================
    const ref = wb.addWorksheet("Référence");
    ref.columns = [
      { header: "Champ", key: "field", width: 22 },
      { header: "Valeur acceptée", key: "value", width: 24 },
      { header: "Description", key: "desc", width: 40 },
    ];
    // Header style
    ref.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${brandColor}` } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    ref.getRow(1).height = 28;

    const addSection = (field: string, items: { id: string; title: string }[]) => {
      for (const item of items) {
        ref.addRow([field, item.id, item.title]);
      }
    };

    // Labels
    addSection("labels", INVENTORY_LABELS);
    ref.addRow([]);

    // Allergènes
    addSection("allergenes", ALL_ALLERGENS);
    ref.addRow([]);

    // Régimes
    addSection("regimes", DIETARY_PREFERENCES);
    ref.addRow([]);

    // Niveaux épice
    addSection("niveau_epice", SPICY_LEVELS.map((s) => ({ id: s.id, title: s.title })));
    ref.addRow([]);

    // Actif / Visible
    ref.addRow(["actif", "oui", "Produit actif (par défaut)"]);
    ref.addRow(["actif", "non", "Produit désactivé"]);
    ref.addRow(["visible_si_indisponible", "oui", "Reste visible même si indisponible"]);
    ref.addRow(["visible_si_indisponible", "non", "Masqué si indisponible"]);
    ref.addRow([]);

    // Séparateurs
    ref.addRow(["photos", "URL;URL;...", "URLs séparées par des point-virgules"]);
    ref.addRow(["labels / allergenes / regimes", "val1;val2;...", "Valeurs séparées par des point-virgules"]);
    ref.addRow(["variantes", "titre:prix;titre:prix", 'Ex: "Grande:15.00;Petite:10.00"']);

    // Zebra striping on reference sheet
    ref.eachRow((row, idx) => {
      if (idx === 1) return; // Skip header
      if (idx % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8F8F8" } };
        });
      }
    });

    // Generate & download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "modele_import_sam.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Import / Export
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Export */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4">
            <p className="text-sm text-slate-600">
              {items.length > 0
                ? `Exportez vos ${items.length} ${itemLabel.toLowerCase()} au format CSV.`
                : `Aucun ${itemLabel.toLowerCase()} à exporter.`}
            </p>
            <Button
              variant="outline"
              className="gap-2 shrink-0"
              onClick={handleExport}
              disabled={items.length === 0}
            >
              <Download className="w-4 h-4" />
              Exporter
            </Button>
          </div>

          {/* Import */}
          <div className="rounded-lg border border-slate-200 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={downloadTemplate}
              >
                <FileSpreadsheet className="w-4 h-4" />
                Modèle Excel
              </Button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileSelect}
                className="hidden"
                disabled={!canWrite || importing}
              />
              <Button
                className="gap-2 bg-primary text-white hover:bg-primary/90"
                onClick={() => fileInputRef.current?.click()}
                disabled={!canWrite || importing}
              >
                {importing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {importing ? "Import en cours..." : "Importer"}
              </Button>
            </div>

            {/* Import result */}
            {importResult && (
              <div
                className={`mt-3 p-3 rounded-md text-sm ${
                  importResult.failed === 0 && importResult.success > 0
                    ? "bg-emerald-50 border border-emerald-200"
                    : importResult.success === 0
                    ? "bg-red-50 border border-red-200"
                    : "bg-amber-50 border border-amber-200"
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {importResult.failed === 0 && importResult.success > 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  {importResult.success} importé{importResult.success > 1 ? "s" : ""}
                  {importResult.failed > 0 && `, ${importResult.failed} erreur${importResult.failed > 1 ? "s" : ""}`}
                </div>
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 text-xs text-slate-600 space-y-1">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Format hint */}
            <p className="mt-2 text-xs text-slate-500">
              Formats acceptés : <span className="font-medium">.xlsx</span> et <span className="font-medium">.csv</span>. Le modèle Excel contient un onglet <span className="font-medium">Référence</span> avec toutes les valeurs acceptées.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
