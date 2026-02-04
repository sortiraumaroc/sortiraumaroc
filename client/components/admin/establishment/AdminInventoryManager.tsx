import { useState, useCallback, useEffect, useMemo } from "react";
import {
  Bot,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Trash2,
  Edit2,
  Plus,
  ChevronDown,
  ChevronUp,
  Upload,
  FileText,
  Image as ImageIcon,
  RefreshCcw,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { useToast } from "@/hooks/use-toast";
import { loadAdminSessionToken } from "@/lib/adminApi";
import { AdminItemEditorDialog } from "./AdminItemEditorDialog";

// Types
type ProInventoryCategory = {
  id: string;
  establishment_id: string;
  parent_id?: string | null;
  title: string;
  description?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

type ProInventoryItem = {
  id: string;
  establishment_id: string;
  category_id?: string | null;
  title: string;
  description?: string | null;
  base_price?: number | null;
  currency?: string;
  labels?: string[];
  photos?: string[];
  is_active?: boolean;
  visible_when_unavailable?: boolean;
  scheduled_reactivation_at?: string | null;
  sort_order: number;
  meta?: Record<string, unknown> | null;
  created_at: string;
  variants?: Array<{
    id?: string;
    title?: string | null;
    quantity?: number | null;
    unit?: string | null;
    price: number;
    currency?: string;
    sort_order?: number;
    is_active?: boolean;
  }>;
};

type ExtractedItem = {
  title: string;
  description?: string;
  price?: number;
  category?: string;
  labels?: string[];
  selected: boolean;
};

type ExtractedCategory = {
  title: string;
  description?: string;
  selected: boolean;
};

type ExtractionResult = {
  categories: ExtractedCategory[];
  items: ExtractedItem[];
  confidence: number;
  itemCount: number;
  categoryCount: number;
};

type ImportStep = "input" | "review" | "importing" | "done";

type EditingExtractedItem = {
  index: number;
  item: ExtractedItem;
};

type Props = {
  establishmentId: string;
  establishmentName: string;
  universe: string | null | undefined;
};

// Admin API helper
async function adminApiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const sessionToken = loadAdminSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionToken) {
    headers["x-admin-session"] = sessionToken;
  }

  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

// List inventory for admin
async function adminListInventory(establishmentId: string): Promise<{
  categories: ProInventoryCategory[];
  items: ProInventoryItem[];
}> {
  const res = await adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory`
  );
  // Handle null or unexpected response
  if (!res || typeof res !== "object") {
    return { categories: [], items: [] };
  }
  return {
    categories: Array.isArray(res.categories) ? res.categories : [],
    items: Array.isArray(res.items) ? res.items : [],
  };
}

// Create category for admin
async function adminCreateCategory(
  establishmentId: string,
  data: { title: string; description?: string }
): Promise<{ category: ProInventoryCategory }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/categories`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

// Create item for admin
async function adminCreateItem(
  establishmentId: string,
  data: {
    title: string;
    description?: string;
    base_price?: number;
    category_id?: string;
    labels?: string[];
  }
): Promise<{ item: ProInventoryItem }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/items`,
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
}

// Update item for admin
async function adminUpdateItem(
  establishmentId: string,
  itemId: string,
  patch: Partial<{
    title: string;
    description: string | null;
    base_price: number | null;
    category_id: string | null;
    labels: string[];
    is_active: boolean;
  }>
): Promise<{ item: ProInventoryItem }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/items/${encodeURIComponent(itemId)}`,
    {
      method: "POST",
      body: JSON.stringify(patch),
    }
  );
}

// Delete item for admin
async function adminDeleteItem(
  establishmentId: string,
  itemId: string
): Promise<{ ok: true }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
    }
  );
}

// Delete category for admin
async function adminDeleteCategory(
  establishmentId: string,
  categoryId: string
): Promise<{ ok: true }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/categories/${encodeURIComponent(categoryId)}`,
    {
      method: "DELETE",
    }
  );
}

// Clear all inventory for admin
async function adminClearInventory(
  establishmentId: string
): Promise<{ ok: true; deleted: { categories: number; items: number } }> {
  return adminApiFetch(
    `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/clear`,
    {
      method: "POST",
    }
  );
}

export function AdminInventoryManager({
  establishmentId,
  establishmentName,
  universe,
}: Props) {
  const { toast } = useToast();

  // Inventory state
  const [categories, setCategories] = useState<ProInventoryCategory[]>([]);
  const [items, setItems] = useState<ProInventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("input");
  const [extracting, setExtracting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Text input for AI
  const [textContent, setTextContent] = useState("");

  // File upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Extraction results
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extractedCategories, setExtractedCategories] = useState<ExtractedCategory[]>([]);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Edit dialog (for existing items)
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProInventoryItem | null>(null);

  // Edit extracted item dialog (for items before import)
  const [editExtractedDialogOpen, setEditExtractedDialogOpen] = useState(false);
  const [editingExtractedItem, setEditingExtractedItem] = useState<EditingExtractedItem | null>(null);

  // Delete confirmations
  const [deleteItemConfirm, setDeleteItemConfirm] = useState<string | null>(null);
  const [clearAllConfirm, setClearAllConfirm] = useState(false);

  // Load inventory
  const loadInventory = useCallback(async () => {
    if (!establishmentId) return;

    setLoading(true);
    setError(null);

    try {
      const data = await adminListInventory(establishmentId);
      setCategories(data.categories);
      setItems(data.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  // Reset import dialog state
  const resetImportState = () => {
    setImportStep("input");
    setExtracting(false);
    setImportError(null);
    setTextContent("");
    setSelectedFile(null);
    setUploadProgress(0);
    setExtraction(null);
    setExtractedCategories([]);
    setExtractedItems([]);
    setExpandedCategories(new Set());
  };

  // Handle file selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.ms-excel",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setImportError("Type de fichier non supporté. Utilisez PDF, Word, Excel ou image (JPG, PNG).");
      return;
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      setImportError("Le fichier est trop volumineux (max 10 Mo).");
      return;
    }

    setSelectedFile(file);
    setImportError(null);
  };

  // Extract from text
  const handleTextExtract = async () => {
    if (!textContent.trim()) return;

    setExtracting(true);
    setImportError(null);

    try {
      const data = await adminApiFetch("/api/admin/ai/extract-menu", {
        method: "POST",
        body: JSON.stringify({
          establishmentId,
          text: textContent,
        }),
      });

      handleExtractionSuccess(data.extraction);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setExtracting(false);
    }
  };

  // Extract from file
  const handleFileExtract = async () => {
    if (!selectedFile) return;

    setExtracting(true);
    setImportError(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("establishmentId", establishmentId);

      const sessionToken = loadAdminSessionToken();
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers["x-admin-session"] = sessionToken;
      }

      const res = await fetch("/api/admin/ai/extract-menu-file", {
        method: "POST",
        credentials: "include",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "Erreur lors de l'extraction");
      }

      const data = await res.json();
      handleExtractionSuccess(data.extraction);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setExtracting(false);
      setUploadProgress(0);
    }
  };

  // Handle extraction success
  const handleExtractionSuccess = (result: ExtractionResult) => {
    setExtraction(result);
    setExtractedCategories(result.categories.map((c) => ({ ...c, selected: true })));
    setExtractedItems(result.items.map((i) => ({ ...i, selected: true })));
    setExpandedCategories(new Set(result.categories.map((c) => c.title)));
    setImportStep("review");
  };

  // Toggle selection
  const toggleCategory = (title: string) => {
    setExtractedCategories((prev) =>
      prev.map((c) => (c.title === title ? { ...c, selected: !c.selected } : c))
    );
  };

  const toggleItem = (index: number) => {
    setExtractedItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
    );
  };

  const toggleAllItems = (selected: boolean) => {
    setExtractedItems((prev) => prev.map((item) => ({ ...item, selected })));
  };

  const toggleCategoryExpand = (title: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  // Edit extracted item (before import)
  const openEditExtractedItem = (index: number) => {
    const item = extractedItems[index];
    if (item) {
      setEditingExtractedItem({ index, item: { ...item } });
      setEditExtractedDialogOpen(true);
    }
  };

  const handleSaveExtractedItem = () => {
    if (!editingExtractedItem) return;

    setExtractedItems((prev) =>
      prev.map((item, i) =>
        i === editingExtractedItem.index ? editingExtractedItem.item : item
      )
    );
    setEditExtractedDialogOpen(false);
    setEditingExtractedItem(null);
  };

  const handleDeleteExtractedItem = (index: number) => {
    setExtractedItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Import selected items
  const handleImport = async () => {
    const selectedCats = extractedCategories.filter((c) => c.selected);
    const selectedItms = extractedItems.filter((i) => i.selected);

    if (selectedItms.length === 0) {
      setImportError("Aucun produit sélectionné");
      return;
    }

    setImportStep("importing");
    setImportError(null);

    try {
      // Create a map to track category titles to IDs
      const categoryMap = new Map<string, string>();

      // First, create categories
      for (const cat of selectedCats) {
        try {
          const res = await adminCreateCategory(establishmentId, {
            title: cat.title,
            description: cat.description,
          });
          categoryMap.set(cat.title, res.category.id);
        } catch (err) {
          console.warn(`Failed to create category ${cat.title}:`, err);
          // Try to find existing category
          const existing = categories.find(
            (c) => c.title.toLowerCase() === cat.title.toLowerCase()
          );
          if (existing) {
            categoryMap.set(cat.title, existing.id);
          }
        }
      }

      // Then create items
      let successCount = 0;
      for (const item of selectedItms) {
        try {
          const categoryId = item.category ? categoryMap.get(item.category) : undefined;
          await adminCreateItem(establishmentId, {
            title: item.title,
            description: item.description,
            base_price: item.price,
            category_id: categoryId,
            labels: item.labels,
          });
          successCount++;
        } catch (err) {
          console.warn(`Failed to create item ${item.title}:`, err);
        }
      }

      toast({
        title: "Import terminé",
        description: `${successCount} produit(s) importé(s) avec succès.`,
      });

      setImportStep("done");
      await loadInventory();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Erreur lors de l'import");
      setImportStep("review");
    }
  };

  // Edit item
  const openEditDialog = (item: ProInventoryItem) => {
    setEditingItem(item);
    setEditDialogOpen(true);
  };

  const handleEditDialogSaved = async () => {
    toast({ title: "Produit modifié" });
    setEditDialogOpen(false);
    setEditingItem(null);
    await loadInventory();
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    try {
      await adminDeleteItem(establishmentId, itemId);
      toast({ title: "Produit supprimé" });
      setDeleteItemConfirm(null);
      await loadInventory();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de la suppression",
        variant: "destructive",
      });
    }
  };

  // Clear all inventory
  const handleClearAll = async () => {
    try {
      const result = await adminClearInventory(establishmentId);
      toast({
        title: "Inventaire vidé",
        description: `${result.deleted.categories} catégorie(s) et ${result.deleted.items} produit(s) supprimés.`,
      });
      setClearAllConfirm(false);
      await loadInventory();
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de la suppression",
        variant: "destructive",
      });
    }
  };

  // Group items by category
  const itemsByCategory = useMemo(() => {
    const groups: Record<string, ProInventoryItem[]> = {};
    const uncategorized: ProInventoryItem[] = [];

    for (const item of items) {
      if (item.category_id) {
        const cat = categories.find((c) => c.id === item.category_id);
        const key = cat?.title ?? "Sans catégorie";
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      } else {
        uncategorized.push(item);
      }
    }

    if (uncategorized.length > 0) {
      groups["Sans catégorie"] = uncategorized;
    }

    return groups;
  }, [items, categories]);

  // Extracted items by category for review
  const extractedItemsByCategory = useMemo(() => {
    const groups: Record<string, Array<{ item: ExtractedItem; index: number }>> = {};

    extractedItems.forEach((item, index) => {
      const cat = item.category || "Sans catégorie";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push({ item, index });
    });

    return groups;
  }, [extractedItems]);

  const selectedItemsCount = extractedItems.filter((i) => i.selected).length;
  const selectedCategoriesCount = extractedCategories.filter((c) => c.selected).length;

  return (
    <Card className="border-slate-200">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-primary" />
              Inventaire / Menu (Admin)
            </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {items.length} produit{items.length > 1 ? "s" : ""} • {categories.length} catégorie{categories.length > 1 ? "s" : ""}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => void loadInventory()}
              disabled={loading}
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          <Button
            className="gap-2"
            onClick={() => {
              resetImportState();
              setImportDialogOpen(true);
            }}
          >
            <Sparkles className="w-4 h-4" />
            Import IA
          </Button>

          {items.length > 0 && (
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => setClearAllConfirm(true)}
            >
              <Trash2 className="w-4 h-4" />
              Tout supprimer
            </Button>
          )}
        </div>

        {/* Current inventory display */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Chargement...
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <div className="text-lg font-medium mb-1">Aucun produit</div>
            <div className="text-sm">
              Utilisez l'import IA pour ajouter des produits depuis un fichier ou du texte.
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {Object.entries(itemsByCategory).map(([categoryName, categoryItems]) => (
              <div key={categoryName} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-3 py-2 font-medium text-sm text-slate-800 flex items-center justify-between">
                  <span>{categoryName}</span>
                  <Badge variant="secondary" className="text-xs">
                    {categoryItems.length}
                  </Badge>
                </div>
                <div className="divide-y divide-slate-100">
                  {categoryItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 p-3 hover:bg-slate-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-slate-900 truncate">
                          {item.title}
                        </div>
                        {item.description && (
                          <div className="text-xs text-slate-500 truncate">
                            {item.description}
                          </div>
                        )}
                        {item.labels && item.labels.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {item.labels.slice(0, 3).map((l) => (
                              <Badge key={l} variant="outline" className="text-xs py-0">
                                {l}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      {item.base_price != null && (
                        <div className="text-sm font-medium text-slate-700 shrink-0">
                          {item.base_price.toFixed(2)} MAD
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => openEditDialog(item)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setDeleteItemConfirm(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Import Dialog */}
      <Dialog
        open={importDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetImportState();
          setImportDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              Import IA du menu
            </DialogTitle>
            <DialogDescription>
              Importez des produits depuis un fichier ou du texte pour <strong>{establishmentName}</strong>
            </DialogDescription>
          </DialogHeader>

          {/* Step: Input */}
          {importStep === "input" && (
            <div className="space-y-4 mt-4">
              {/* File upload */}
              <div className="space-y-2">
                <Label>Upload un fichier</Label>
                <div className="border-2 border-dashed border-slate-200 rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 text-slate-400" />
                      <div className="text-sm text-slate-600">
                        {selectedFile ? (
                          <span className="font-medium text-primary">{selectedFile.name}</span>
                        ) : (
                          <>
                            <span className="font-medium text-primary">Cliquez pour uploader</span>
                            {" "}ou glissez-déposez
                          </>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        PDF, Word, Excel, JPG, PNG (max 10 Mo)
                      </div>
                    </div>
                  </label>
                </div>
                {selectedFile && (
                  <Button
                    onClick={handleFileExtract}
                    disabled={extracting}
                    className="w-full gap-2"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyse en cours...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Analyser le fichier
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">Ou</span>
                </div>
              </div>

              {/* Text input */}
              <div className="space-y-2">
                <Label>Collez le contenu du menu</Label>
                <Textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Collez ici le contenu du menu (copié depuis un PDF, Word, site web, etc.)..."
                  rows={10}
                  className="resize-none font-mono text-sm"
                  disabled={extracting}
                />
                <div className="text-xs text-slate-500">
                  Max 50 000 caractères. Actuellement : {textContent.length.toLocaleString()} caractères
                </div>
              </div>

              <Button
                onClick={handleTextExtract}
                disabled={!textContent.trim() || extracting}
                className="w-full gap-2"
              >
                {extracting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyse en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Analyser le texte
                  </>
                )}
              </Button>

              <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3">
                <div className="font-medium text-slate-700 mb-1">
                  <Sparkles className="w-4 h-4 inline mr-1" />
                  L'IA va extraire automatiquement :
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Les catégories (entrées, plats, desserts, chambres, prestations...)</li>
                  <li>Les noms des produits/services</li>
                  <li>Les descriptions</li>
                  <li>Les prix (convertis en nombre)</li>
                  <li>Les labels détectés (végétarien, épicé, luxe, etc.)</li>
                </ul>
              </div>

              {importError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {importError}
                </div>
              )}
            </div>
          )}

          {/* Step: Review */}
          {importStep === "review" && extraction && (
            <div className="space-y-4 mt-4">
              {/* Stats */}
              <div className="flex items-center gap-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <div className="flex-1">
                  <div className="font-medium text-emerald-800">
                    {extraction.itemCount} produits et {extraction.categoryCount} catégories détectés
                  </div>
                  <div className="text-xs text-emerald-600">
                    Confiance: {Math.round(extraction.confidence * 100)}%
                  </div>
                </div>
              </div>

              {/* Selection controls */}
              <div className="flex items-center justify-between text-sm">
                <div className="text-slate-600">
                  {selectedItemsCount} produit{selectedItemsCount > 1 ? "s" : ""} et{" "}
                  {selectedCategoriesCount} catégorie{selectedCategoriesCount > 1 ? "s" : ""} sélectionné{selectedItemsCount > 1 ? "s" : ""}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAllItems(true)}
                    className="text-primary hover:underline text-xs"
                  >
                    Tout sélectionner
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => toggleAllItems(false)}
                    className="text-primary hover:underline text-xs"
                  >
                    Tout désélectionner
                  </button>
                </div>
              </div>

              {/* Categories and items list */}
              <div className="max-h-[40vh] overflow-y-auto space-y-2 border border-slate-200 rounded-lg p-2">
                {Object.entries(extractedItemsByCategory).map(([category, items]) => {
                  const isExpanded = expandedCategories.has(category);
                  const extractedCat = extractedCategories.find((c) => c.title === category);

                  return (
                    <div key={category} className="border border-slate-100 rounded-lg overflow-hidden">
                      {/* Category header */}
                      <div
                        className="flex items-center gap-2 p-2 bg-slate-50 cursor-pointer hover:bg-slate-100"
                        onClick={() => toggleCategoryExpand(category)}
                      >
                        {extractedCat && (
                          <Checkbox
                            checked={extractedCat.selected}
                            onCheckedChange={() => toggleCategory(category)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <div className="flex-1 font-medium text-sm text-slate-800">
                          {category}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {items.length}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>

                      {/* Items */}
                      {isExpanded && (
                        <div className="divide-y divide-slate-100">
                          {items.map(({ item, index }) => (
                            <div
                              key={index}
                              className={`flex items-start gap-2 p-2 ${
                                item.selected ? "bg-white" : "bg-slate-50 opacity-60"
                              }`}
                            >
                              <Checkbox
                                checked={item.selected}
                                onCheckedChange={() => toggleItem(index)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-slate-900 truncate">
                                  {item.title}
                                </div>
                                {item.description && (
                                  <div className="text-xs text-slate-500 line-clamp-2">
                                    {item.description}
                                  </div>
                                )}
                                {item.labels && item.labels.length > 0 && (
                                  <div className="flex gap-1 mt-1">
                                    {item.labels.slice(0, 3).map((l) => (
                                      <Badge key={l} variant="outline" className="text-xs py-0">
                                        {l}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {item.price != null && (
                                <div className="text-sm font-medium text-slate-700 shrink-0">
                                  {item.price.toFixed(2)} MAD
                                </div>
                              )}
                              {/* Edit/Delete buttons */}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditExtractedItem(index);
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteExtractedItem(index);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {importError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {importError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-slate-200">
                <Button variant="outline" onClick={() => setImportStep("input")}>
                  Retour
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={selectedItemsCount === 0}
                  className="flex-1 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base py-5"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  ENREGISTRER {selectedItemsCount} produit{selectedItemsCount > 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Importing */}
          {importStep === "importing" && (
            <div className="space-y-4 mt-4 text-center py-8">
              <Loader2 className="w-12 h-12 text-primary mx-auto animate-spin" />
              <div className="font-medium text-slate-900">Import en cours...</div>
              <div className="text-sm text-slate-600">
                Création des catégories et produits dans l'inventaire.
              </div>
            </div>
          )}

          {/* Step: Done */}
          {importStep === "done" && (
            <div className="space-y-4 mt-4 text-center py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
              <div className="font-medium text-slate-900">Import terminé</div>
              <div className="text-sm text-slate-600">
                Les produits ont été ajoutés à l'inventaire.
              </div>
              <Button onClick={() => setImportDialogOpen(false)}>Fermer</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Item Dialog - Using full-featured admin dialog */}
      <AdminItemEditorDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        establishmentId={establishmentId}
        universe={universe}
        categories={categories}
        item={editingItem}
        onSaved={handleEditDialogSaved}
      />

      {/* Delete Item Confirm */}
      <AlertDialog
        open={!!deleteItemConfirm}
        onOpenChange={(open) => !open && setDeleteItemConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce produit ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteItemConfirm && handleDeleteItem(deleteItemConfirm)}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Confirm */}
      <AlertDialog open={clearAllConfirm} onOpenChange={setClearAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer tout l'inventaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action supprimera toutes les catégories et tous les produits. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleClearAll}
            >
              Tout supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Extracted Item Dialog */}
      <Dialog
        open={editExtractedDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditExtractedDialogOpen(false);
            setEditingExtractedItem(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Modifier le produit
            </DialogTitle>
            <DialogDescription>
              Modifiez les informations avant l'import
            </DialogDescription>
          </DialogHeader>

          {editingExtractedItem && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="extracted-title">Nom du produit *</Label>
                <Input
                  id="extracted-title"
                  value={editingExtractedItem.item.title}
                  onChange={(e) =>
                    setEditingExtractedItem({
                      ...editingExtractedItem,
                      item: { ...editingExtractedItem.item, title: e.target.value },
                    })
                  }
                  placeholder="Ex: Tajine de poulet"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extracted-description">Description</Label>
                <Textarea
                  id="extracted-description"
                  value={editingExtractedItem.item.description || ""}
                  onChange={(e) =>
                    setEditingExtractedItem({
                      ...editingExtractedItem,
                      item: { ...editingExtractedItem.item, description: e.target.value || undefined },
                    })
                  }
                  placeholder="Description du produit..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extracted-price">Prix (MAD)</Label>
                <Input
                  id="extracted-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingExtractedItem.item.price ?? ""}
                  onChange={(e) =>
                    setEditingExtractedItem({
                      ...editingExtractedItem,
                      item: {
                        ...editingExtractedItem.item,
                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                      },
                    })
                  }
                  placeholder="Ex: 85.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extracted-category">Catégorie</Label>
                <Input
                  id="extracted-category"
                  value={editingExtractedItem.item.category || ""}
                  onChange={(e) =>
                    setEditingExtractedItem({
                      ...editingExtractedItem,
                      item: { ...editingExtractedItem.item, category: e.target.value || undefined },
                    })
                  }
                  placeholder="Ex: Plats principaux"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extracted-labels">Labels (séparés par virgule)</Label>
                <Input
                  id="extracted-labels"
                  value={editingExtractedItem.item.labels?.join(", ") || ""}
                  onChange={(e) =>
                    setEditingExtractedItem({
                      ...editingExtractedItem,
                      item: {
                        ...editingExtractedItem.item,
                        labels: e.target.value
                          ? e.target.value.split(",").map((l) => l.trim()).filter(Boolean)
                          : undefined,
                      },
                    })
                  }
                  placeholder="Ex: végétarien, épicé, populaire"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setEditExtractedDialogOpen(false);
                setEditingExtractedItem(null);
              }}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveExtractedItem}
              disabled={!editingExtractedItem?.item.title?.trim()}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
