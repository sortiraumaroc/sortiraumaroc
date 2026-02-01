import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  type NewsletterTemplate,
  listNewsletterTemplates,
  upsertNewsletterTemplate,
  duplicateNewsletterTemplate,
  deleteNewsletterTemplate,
  previewNewsletterTemplate,
} from "@/lib/adminApi";

import { AdminEmailsNav } from "./AdminEmailsNav";
import { NewsletterBlockEditor } from "./components/NewsletterBlockEditor";
import { NewsletterPreview } from "./components/NewsletterPreview";

// ============================================================================
// TYPES
// ============================================================================

type BlockType =
  | "header"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "columns"
  | "list"
  | "video"
  | "social"
  | "poll"
  | "countdown";

interface NewsletterBlock {
  id: string;
  type: BlockType;
  content_fr: Record<string, any>;
  content_en: Record<string, any>;
  settings: Record<string, any>;
}

interface DesignSettings {
  backgroundColor: string;
  fontFamily: string;
  headerColor: string;
  textColor: string;
  buttonColor: string;
  buttonTextColor: string;
  borderRadius?: string;
}

type TemplateDraft = {
  id?: string | null;
  name: string;
  description: string;
  category: string;
  audience: string;
  subject_fr: string;
  subject_en: string;
  preheader_fr: string;
  preheader_en: string;
  blocks: NewsletterBlock[];
  design_settings: DesignSettings;
  is_template: boolean;
  is_featured: boolean;
  enabled: boolean;
};

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_OPTIONS = [
  { value: "launch", label: "Lancement", color: "bg-blue-500" },
  { value: "promotion", label: "Promotion", color: "bg-red-500" },
  { value: "contest", label: "Jeu Concours", color: "bg-purple-500" },
  { value: "ramadan", label: "Ramadan", color: "bg-amber-600" },
  { value: "seasonal", label: "Saisonnier", color: "bg-green-500" },
  { value: "events", label: "Événements", color: "bg-pink-500" },
  { value: "pros", label: "Professionnels", color: "bg-indigo-500" },
  { value: "users", label: "Utilisateurs", color: "bg-teal-500" },
  { value: "general", label: "Général", color: "bg-gray-500" },
];

const AUDIENCE_OPTIONS = [
  { value: "all", label: "Tous" },
  { value: "users", label: "Utilisateurs" },
  { value: "pros", label: "Professionnels" },
  { value: "partners", label: "Partenaires" },
  { value: "prospects", label: "Prospects" },
];

const BLOCK_TYPES: Array<{
  type: BlockType;
  label: string;
  icon: string;
  description: string;
}> = [
  {
    type: "header",
    label: "En-tête",
    icon: "📰",
    description: "Titre et sous-titre",
  },
  {
    type: "text",
    label: "Texte",
    icon: "📝",
    description: "Paragraphe ou HTML",
  },
  { type: "image", label: "Image", icon: "🖼️", description: "Image ou bannière" },
  {
    type: "button",
    label: "Bouton CTA",
    icon: "🔘",
    description: "Bouton d'action",
  },
  {
    type: "divider",
    label: "Séparateur",
    icon: "➖",
    description: "Ligne horizontale",
  },
  { type: "spacer", label: "Espacement", icon: "↕️", description: "Espace vide" },
  {
    type: "columns",
    label: "Colonnes",
    icon: "▤",
    description: "2-3 colonnes avec icônes",
  },
  {
    type: "list",
    label: "Liste",
    icon: "📋",
    description: "Liste à puces ou numérotée",
  },
  { type: "video", label: "Vidéo", icon: "🎬", description: "Lien vidéo YouTube" },
  {
    type: "social",
    label: "Réseaux sociaux",
    icon: "📱",
    description: "Liens sociaux",
  },
  { type: "poll", label: "Sondage", icon: "📊", description: "Question à choix" },
  {
    type: "countdown",
    label: "Compte à rebours",
    icon: "⏰",
    description: "Timer jusqu'à une date",
  },
];

const DEFAULT_DESIGN: DesignSettings = {
  backgroundColor: "#FFFFFF",
  fontFamily: "Arial, sans-serif",
  headerColor: "#D4AF37",
  textColor: "#333333",
  buttonColor: "#D4AF37",
  buttonTextColor: "#FFFFFF",
  borderRadius: "8px",
};

function createDefaultDraft(): TemplateDraft {
  return {
    id: null,
    name: "",
    description: "",
    category: "general",
    audience: "all",
    subject_fr: "",
    subject_en: "",
    preheader_fr: "",
    preheader_en: "",
    blocks: [],
    design_settings: { ...DEFAULT_DESIGN },
    is_template: true,
    is_featured: false,
    enabled: true,
  };
}

function generateBlockId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AdminNewsletterPage() {
  const { toast } = useToast();

  // List state
  const [items, setItems] = useState<NewsletterTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(() => createDefaultDraft());
  const [editorTab, setEditorTab] = useState<string>("content");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(
    null
  );

  // Preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">(
    "desktop"
  );

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listNewsletterTemplates(undefined, {
        category: categoryFilter === "all" ? undefined : categoryFilter,
      });
      setItems(res.items ?? []);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ============================================================================
  // TEMPLATE ACTIONS
  // ============================================================================

  const openCreate = () => {
    setDraft(createDefaultDraft());
    setSelectedBlockIndex(null);
    setEditorTab("content");
    setEditorOpen(true);
  };

  const openEdit = (tpl: NewsletterTemplate) => {
    setDraft({
      id: tpl.id,
      name: tpl.name,
      description: tpl.description || "",
      category: tpl.category,
      audience: tpl.audience,
      subject_fr: tpl.subject_fr,
      subject_en: tpl.subject_en,
      preheader_fr: tpl.preheader_fr || "",
      preheader_en: tpl.preheader_en || "",
      blocks: (tpl.blocks as NewsletterBlock[]) || [],
      design_settings: (tpl.design_settings as DesignSettings) || {
        ...DEFAULT_DESIGN,
      },
      is_template: tpl.is_template,
      is_featured: tpl.is_featured,
      enabled: tpl.enabled,
    });
    setSelectedBlockIndex(null);
    setEditorTab("content");
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast({
        title: "Erreur",
        description: "Le nom est requis",
        variant: "destructive",
      });
      return;
    }

    try {
      await upsertNewsletterTemplate(undefined, {
        id: draft.id || undefined,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        category: draft.category,
        audience: draft.audience,
        subject_fr: draft.subject_fr.trim(),
        subject_en: draft.subject_en.trim(),
        preheader_fr: draft.preheader_fr.trim() || null,
        preheader_en: draft.preheader_en.trim() || null,
        blocks: draft.blocks,
        design_settings: draft.design_settings,
        is_template: draft.is_template,
        is_featured: draft.is_featured,
        enabled: draft.enabled,
      });

      toast({ title: "Template newsletter enregistré" });
      setEditorOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Sauvegarde échouée",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleDuplicate = async (tpl: NewsletterTemplate) => {
    try {
      await duplicateNewsletterTemplate(undefined, tpl.id);
      toast({ title: "Template dupliqué" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Duplication échouée",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (tpl: NewsletterTemplate) => {
    if (
      !window.confirm(
        `Supprimer le template "${tpl.name}" ? Cette action est irréversible.`
      )
    ) {
      return;
    }

    try {
      await deleteNewsletterTemplate(undefined, tpl.id);
      toast({ title: "Template supprimé" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Suppression échouée",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const openPreview = async () => {
    try {
      const res = await previewNewsletterTemplate(undefined, {
        subject: lang === "fr" ? draft.subject_fr : draft.subject_en,
        blocks: draft.blocks,
        design_settings: draft.design_settings,
        lang,
        variables: {
          first_name: "Ahmed",
          establishment_name: "Restaurant Test",
          promo_code: "PROMO2026",
          cta_url: "https://sortiaumaroc.com",
        },
      });
      setPreviewHtml(res.html);
      setPreviewOpen(true);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({
        title: "Aperçu échoué",
        description: msg,
        variant: "destructive",
      });
    }
  };

  // ============================================================================
  // BLOCK MANAGEMENT
  // ============================================================================

  const addBlock = (type: BlockType) => {
    const newBlock: NewsletterBlock = {
      id: generateBlockId(),
      type,
      content_fr: getDefaultBlockContent(type, "fr"),
      content_en: getDefaultBlockContent(type, "en"),
      settings: getDefaultBlockSettings(type),
    };

    setDraft((prev) => ({
      ...prev,
      blocks: [...prev.blocks, newBlock],
    }));
    setSelectedBlockIndex(draft.blocks.length);
  };

  const updateBlock = (index: number, updates: Partial<NewsletterBlock>) => {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.map((block, i) =>
        i === index ? { ...block, ...updates } : block
      ),
    }));
  };

  const removeBlock = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      blocks: prev.blocks.filter((_, i) => i !== index),
    }));
    setSelectedBlockIndex(null);
  };

  const moveBlock = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= draft.blocks.length) return;

    setDraft((prev) => {
      const newBlocks = [...prev.blocks];
      const [removed] = newBlocks.splice(fromIndex, 1);
      newBlocks.splice(toIndex, 0, removed);
      return { ...prev, blocks: newBlocks };
    });

    setSelectedBlockIndex(toIndex);
  };

  const duplicateBlock = (index: number) => {
    const block = draft.blocks[index];
    const newBlock: NewsletterBlock = {
      ...block,
      id: generateBlockId(),
      content_fr: { ...block.content_fr },
      content_en: { ...block.content_en },
      settings: { ...block.settings },
    };

    setDraft((prev) => ({
      ...prev,
      blocks: [
        ...prev.blocks.slice(0, index + 1),
        newBlock,
        ...prev.blocks.slice(index + 1),
      ],
    }));
    setSelectedBlockIndex(index + 1);
  };

  // ============================================================================
  // TABLE COLUMNS
  // ============================================================================

  const columns = useMemo<ColumnDef<NewsletterTemplate>[]>(() => {
    return [
      {
        accessorKey: "category",
        header: "Catégorie",
        cell: ({ row }) => {
          const cat = CATEGORY_OPTIONS.find(
            (c) => c.value === row.original.category
          );
          return (
            <Badge className={`${cat?.color || "bg-gray-500"} text-white`}>
              {cat?.label || row.original.category}
            </Badge>
          );
        },
      },
      { accessorKey: "name", header: "Nom" },
      {
        accessorKey: "audience",
        header: "Audience",
        cell: ({ row }) => {
          const aud = AUDIENCE_OPTIONS.find(
            (a) => a.value === row.original.audience
          );
          return <span className="text-slate-600">{aud?.label || row.original.audience}</span>;
        },
      },
      {
        accessorKey: "is_featured",
        header: "Vedette",
        cell: ({ row }) =>
          row.original.is_featured ? (
            <Badge className="bg-amber-500 text-white">Vedette</Badge>
          ) : null,
      },
      {
        accessorKey: "enabled",
        header: "Actif",
        cell: ({ row }) =>
          row.original.enabled ? (
            <Badge className="bg-green-600 text-white">Oui</Badge>
          ) : (
            <Badge variant="secondary">Non</Badge>
          ),
      },
      {
        accessorKey: "times_used",
        header: "Utilisations",
        cell: ({ row }) => (
          <span className="text-slate-500">{row.original.times_used || 0}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleDuplicate(row.original);
              }}
            >
              Dupliquer
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(row.original);
              }}
            >
              Supprimer
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Newsletter"
        description="Créez et gérez vos templates newsletter avec un éditeur visuel drag & drop."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              {loading ? "Chargement..." : "Rafraîchir"}
            </Button>
            <Button onClick={openCreate}>+ Nouveau template</Button>
          </div>
        }
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-full sm:w-72">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer par catégorie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les catégories</SelectItem>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              Appliquer
            </Button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Total templates</div>
            <div className="text-2xl font-bold">{items.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Templates vedette</div>
            <div className="text-2xl font-bold">
              {items.filter((i) => i.is_featured).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Actifs</div>
            <div className="text-2xl font-bold">
              {items.filter((i) => i.enabled).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-slate-500">Utilisations totales</div>
            <div className="text-2xl font-bold">
              {items.reduce((sum, i) => sum + (i.times_used || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <AdminDataTable
        data={items}
        columns={columns}
        isLoading={loading}
        searchPlaceholder="Rechercher un template..."
        onRowClick={(row) => openEdit(row)}
      />

      {/* ====================================================================== */}
      {/* EDITOR DIALOG */}
      {/* ====================================================================== */}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {draft.id ? "Modifier le template" : "Nouveau template newsletter"}
            </DialogTitle>
          </DialogHeader>

          <Tabs
            value={editorTab}
            onValueChange={setEditorTab}
            className="flex-1 flex flex-col overflow-hidden"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="content">Contenu</TabsTrigger>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="settings">Paramètres</TabsTrigger>
              <TabsTrigger value="preview">Aperçu</TabsTrigger>
            </TabsList>

            {/* ============================================================ */}
            {/* TAB: CONTENT */}
            {/* ============================================================ */}

            <TabsContent
              value="content"
              className="flex-1 overflow-hidden mt-4"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(80vh-200px)]">
                {/* Block Palette */}
                <div className="lg:col-span-2 overflow-y-auto border rounded-lg p-3 bg-slate-50">
                  <h4 className="font-semibold text-sm mb-3">
                    Ajouter un bloc
                  </h4>
                  <div className="space-y-2">
                    {BLOCK_TYPES.map((bt) => (
                      <button
                        key={bt.type}
                        onClick={() => addBlock(bt.type)}
                        className="w-full text-left p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{bt.icon}</span>
                          <div>
                            <div className="text-sm font-medium">{bt.label}</div>
                            <div className="text-xs text-slate-500">
                              {bt.description}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Blocks List */}
                <div className="lg:col-span-5 overflow-y-auto border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-sm">
                      Blocs ({draft.blocks.length})
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Langue:</span>
                      <Select
                        value={lang}
                        onValueChange={(v) => setLang(v as "fr" | "en")}
                      >
                        <SelectTrigger className="w-20 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="fr">FR</SelectItem>
                          <SelectItem value="en">EN</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {draft.blocks.length === 0 ? (
                    <div className="text-center text-slate-400 py-12">
                      <p className="text-lg mb-2">Aucun bloc</p>
                      <p className="text-sm">
                        Cliquez sur un type de bloc à gauche pour commencer
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {draft.blocks.map((block, index) => {
                        const blockType = BLOCK_TYPES.find(
                          (bt) => bt.type === block.type
                        );
                        const isSelected = selectedBlockIndex === index;

                        return (
                          <div
                            key={block.id}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                                : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                            onClick={() => setSelectedBlockIndex(index)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">
                                  {blockType?.icon}
                                </span>
                                <span className="font-medium text-sm">
                                  {blockType?.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveBlock(index, index - 1);
                                  }}
                                  disabled={index === 0}
                                >
                                  ↑
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveBlock(index, index + 1);
                                  }}
                                  disabled={index === draft.blocks.length - 1}
                                >
                                  ↓
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    duplicateBlock(index);
                                  }}
                                >
                                  ⎘
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeBlock(index);
                                  }}
                                >
                                  ×
                                </Button>
                              </div>
                            </div>

                            {/* Block Preview */}
                            <div className="text-xs text-slate-500 truncate">
                              {getBlockPreview(block, lang)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Block Editor */}
                <div className="lg:col-span-5 overflow-y-auto border rounded-lg p-3">
                  <h4 className="font-semibold text-sm mb-3">
                    Édition du bloc
                  </h4>
                  {selectedBlockIndex !== null &&
                  draft.blocks[selectedBlockIndex] ? (
                    <NewsletterBlockEditor
                      block={draft.blocks[selectedBlockIndex]}
                      lang={lang}
                      onChange={(updates) =>
                        updateBlock(selectedBlockIndex, updates)
                      }
                    />
                  ) : (
                    <div className="text-center text-slate-400 py-12">
                      <p>Sélectionnez un bloc pour l'éditer</p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* ============================================================ */}
            {/* TAB: DESIGN */}
            {/* ============================================================ */}

            <TabsContent value="design" className="flex-1 overflow-auto mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Couleurs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Fond de l'email</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.design_settings.backgroundColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                backgroundColor: e.target.value,
                              },
                            }))
                          }
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={draft.design_settings.backgroundColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                backgroundColor: e.target.value,
                              },
                            }))
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Couleur des en-têtes</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.design_settings.headerColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                headerColor: e.target.value,
                              },
                            }))
                          }
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={draft.design_settings.headerColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                headerColor: e.target.value,
                              },
                            }))
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Couleur du texte</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.design_settings.textColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                textColor: e.target.value,
                              },
                            }))
                          }
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={draft.design_settings.textColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                textColor: e.target.value,
                              },
                            }))
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Couleur des boutons</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.design_settings.buttonColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                buttonColor: e.target.value,
                              },
                            }))
                          }
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={draft.design_settings.buttonColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                buttonColor: e.target.value,
                              },
                            }))
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Texte des boutons</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={draft.design_settings.buttonTextColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                buttonTextColor: e.target.value,
                              },
                            }))
                          }
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                        <Input
                          value={draft.design_settings.buttonTextColor}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                buttonTextColor: e.target.value,
                              },
                            }))
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Typographie</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Police</Label>
                      <Select
                        value={draft.design_settings.fontFamily}
                        onValueChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            design_settings: {
                              ...prev.design_settings,
                              fontFamily: v,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Arial, sans-serif">
                            Arial
                          </SelectItem>
                          <SelectItem value="Georgia, serif">Georgia</SelectItem>
                          <SelectItem value="'Helvetica Neue', Helvetica, sans-serif">
                            Helvetica
                          </SelectItem>
                          <SelectItem value="'Trebuchet MS', sans-serif">
                            Trebuchet MS
                          </SelectItem>
                          <SelectItem value="Verdana, sans-serif">
                            Verdana
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Arrondi des bordures</Label>
                      <Select
                        value={draft.design_settings.borderRadius || "8px"}
                        onValueChange={(v) =>
                          setDraft((prev) => ({
                            ...prev,
                            design_settings: {
                              ...prev.design_settings,
                              borderRadius: v,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0px">Aucun</SelectItem>
                          <SelectItem value="4px">Léger (4px)</SelectItem>
                          <SelectItem value="8px">Moyen (8px)</SelectItem>
                          <SelectItem value="12px">Arrondi (12px)</SelectItem>
                          <SelectItem value="20px">Très arrondi (20px)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Presets */}
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Thèmes prédéfinis</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        {
                          name: "SAM Gold",
                          bg: "#FFFFFF",
                          header: "#D4AF37",
                          text: "#333333",
                          btn: "#D4AF37",
                          btnText: "#FFFFFF",
                        },
                        {
                          name: "Ramadan Night",
                          bg: "#F8F6F0",
                          header: "#1E3A5F",
                          text: "#333333",
                          btn: "#D4AF37",
                          btnText: "#1E3A5F",
                        },
                        {
                          name: "Pro Green",
                          bg: "#F0FDF4",
                          header: "#2C5530",
                          text: "#333333",
                          btn: "#2C5530",
                          btnText: "#FFFFFF",
                        },
                        {
                          name: "Flash Red",
                          bg: "#1a1a1a",
                          header: "#FF4500",
                          text: "#F3F4F6",
                          btn: "#FF4500",
                          btnText: "#FFFFFF",
                        },
                      ].map((theme) => (
                        <button
                          key={theme.name}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              design_settings: {
                                ...prev.design_settings,
                                backgroundColor: theme.bg,
                                headerColor: theme.header,
                                textColor: theme.text,
                                buttonColor: theme.btn,
                                buttonTextColor: theme.btnText,
                              },
                            }))
                          }
                          className="p-3 rounded-lg border hover:border-blue-500 transition-colors text-left"
                        >
                          <div className="flex gap-1 mb-2">
                            {[theme.bg, theme.header, theme.btn].map((c, i) => (
                              <div
                                key={i}
                                className="w-4 h-4 rounded-full border"
                                style={{ backgroundColor: c }}
                              />
                            ))}
                          </div>
                          <div className="text-sm font-medium">{theme.name}</div>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ============================================================ */}
            {/* TAB: SETTINGS */}
            {/* ============================================================ */}

            <TabsContent value="settings" className="flex-1 overflow-auto mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Nom du template *</Label>
                    <Input
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      placeholder="ex: Promo Ramadan 2026"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={draft.description}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Description interne du template..."
                      rows={3}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Catégorie</Label>
                      <Select
                        value={draft.category}
                        onValueChange={(v) =>
                          setDraft((prev) => ({ ...prev, category: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Audience</Label>
                      <Select
                        value={draft.audience}
                        onValueChange={(v) =>
                          setDraft((prev) => ({ ...prev, audience: v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIENCE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Objet FR *</Label>
                    <Input
                      value={draft.subject_fr}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          subject_fr: e.target.value,
                        }))
                      }
                      placeholder="Objet de l'email en français"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Objet EN *</Label>
                    <Input
                      value={draft.subject_en}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          subject_en: e.target.value,
                        }))
                      }
                      placeholder="Email subject in English"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Preheader FR</Label>
                    <Input
                      value={draft.preheader_fr}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          preheader_fr: e.target.value,
                        }))
                      }
                      placeholder="Texte d'aperçu (visible dans la boîte de réception)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Preheader EN</Label>
                    <Input
                      value={draft.preheader_en}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          preheader_en: e.target.value,
                        }))
                      }
                      placeholder="Preview text (visible in inbox)"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">Template réutilisable</div>
                      <div className="text-sm text-slate-500">
                        Ce template sera disponible pour créer des campagnes
                      </div>
                    </div>
                    <Switch
                      checked={draft.is_template}
                      onCheckedChange={(v) =>
                        setDraft((prev) => ({ ...prev, is_template: v }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">Mettre en vedette</div>
                      <div className="text-sm text-slate-500">
                        Afficher ce template en priorité dans la liste
                      </div>
                    </div>
                    <Switch
                      checked={draft.is_featured}
                      onCheckedChange={(v) =>
                        setDraft((prev) => ({ ...prev, is_featured: v }))
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <div className="font-medium">Actif</div>
                      <div className="text-sm text-slate-500">
                        Désactiver pour masquer ce template temporairement
                      </div>
                    </div>
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(v) =>
                        setDraft((prev) => ({ ...prev, enabled: v }))
                      }
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ============================================================ */}
            {/* TAB: PREVIEW */}
            {/* ============================================================ */}

            <TabsContent value="preview" className="flex-1 overflow-auto mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Select
                      value={lang}
                      onValueChange={(v) => setLang(v as "fr" | "en")}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                      </SelectContent>
                    </Select>

                    <div className="flex rounded-lg border overflow-hidden">
                      <button
                        onClick={() => setPreviewDevice("desktop")}
                        className={`px-3 py-1.5 text-sm ${
                          previewDevice === "desktop"
                            ? "bg-slate-100 font-medium"
                            : ""
                        }`}
                      >
                        Desktop
                      </button>
                      <button
                        onClick={() => setPreviewDevice("mobile")}
                        className={`px-3 py-1.5 text-sm ${
                          previewDevice === "mobile"
                            ? "bg-slate-100 font-medium"
                            : ""
                        }`}
                      >
                        Mobile
                      </button>
                    </div>
                  </div>

                  <Button onClick={() => void openPreview()}>
                    Générer l'aperçu
                  </Button>
                </div>

                <NewsletterPreview
                  blocks={draft.blocks}
                  design={draft.design_settings}
                  lang={lang}
                  device={previewDevice}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              Annuler
            </Button>
            <Button variant="outline" onClick={() => void openPreview()}>
              Aperçu complet
            </Button>
            <Button onClick={() => void save()}>
              {draft.id ? "Enregistrer" : "Créer le template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ====================================================================== */}
      {/* PREVIEW DIALOG */}
      {/* ====================================================================== */}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Aperçu de la newsletter</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-auto">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Desktop</div>
              <iframe
                title="preview-desktop"
                className="w-full h-[520px] rounded-lg border"
                srcDoc={previewHtml}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Mobile</div>
              <div className="mx-auto w-[390px] max-w-full">
                <iframe
                  title="preview-mobile"
                  className="w-full h-[520px] rounded-lg border"
                  srcDoc={previewHtml}
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getDefaultBlockContent(
  type: BlockType,
  _lang: "fr" | "en"
): Record<string, any> {
  switch (type) {
    case "header":
      return _lang === "fr"
        ? { title: "Titre de l'en-tête", subtitle: "Sous-titre" }
        : { title: "Header Title", subtitle: "Subtitle" };
    case "text":
      return _lang === "fr"
        ? { html: "<p>Votre texte ici...</p>" }
        : { html: "<p>Your text here...</p>" };
    case "image":
      return { url: "", alt: "" };
    case "button":
      return _lang === "fr"
        ? { text: "Cliquez ici", url: "{{cta_url}}" }
        : { text: "Click here", url: "{{cta_url}}" };
    case "divider":
      return {};
    case "spacer":
      return {};
    case "columns":
      return {
        columns: [
          { icon: "🎯", title: "Titre 1", text: "Description 1" },
          { icon: "💡", title: "Titre 2", text: "Description 2" },
          { icon: "⭐", title: "Titre 3", text: "Description 3" },
        ],
      };
    case "list":
      return _lang === "fr"
        ? { items: ["Élément 1", "Élément 2", "Élément 3"] }
        : { items: ["Item 1", "Item 2", "Item 3"] };
    case "video":
      return { url: "", thumbnail: "" };
    case "social":
      return {
        facebook: "",
        instagram: "",
        twitter: "",
        linkedin: "",
      };
    case "poll":
      return _lang === "fr"
        ? {
            question: "Votre question ?",
            options: ["Option A", "Option B", "Option C"],
          }
        : {
            question: "Your question?",
            options: ["Option A", "Option B", "Option C"],
          };
    case "countdown":
      return _lang === "fr"
        ? { endDate: "", text: "Fin de l'offre dans" }
        : { endDate: "", text: "Offer ends in" };
    default:
      return {};
  }
}

function getDefaultBlockSettings(type: BlockType): Record<string, any> {
  switch (type) {
    case "header":
      return { backgroundColor: "#D4AF37", textColor: "#FFFFFF" };
    case "button":
      return {
        backgroundColor: "#D4AF37",
        textColor: "#FFFFFF",
        align: "center",
      };
    case "image":
      return { fullWidth: false, borderRadius: "8px" };
    case "spacer":
      return { height: "24px" };
    case "divider":
      return { color: "#E5E7EB", thickness: "1px" };
    case "list":
      return { style: "check" };
    default:
      return {};
  }
}

function getBlockPreview(block: NewsletterBlock, lang: "fr" | "en"): string {
  const content = lang === "fr" ? block.content_fr : block.content_en;

  switch (block.type) {
    case "header":
      return content.title || "En-tête sans titre";
    case "text":
      const text = (content.html || "")
        .replace(/<[^>]*>/g, "")
        .substring(0, 50);
      return text || "Texte vide";
    case "image":
      return content.url || "Image non définie";
    case "button":
      return content.text || "Bouton";
    case "columns":
      return `${(content.columns || []).length} colonnes`;
    case "list":
      return `${(content.items || []).length} éléments`;
    case "poll":
      return content.question || "Sondage";
    case "countdown":
      return content.endDate || "Compte à rebours";
    case "divider":
      return "Séparateur";
    case "spacer":
      return `Espacement (${block.settings.height || "24px"})`;
    case "video":
      return content.url || "Vidéo non définie";
    case "social":
      return "Liens réseaux sociaux";
    default:
      return block.type;
  }
}
