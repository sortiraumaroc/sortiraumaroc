import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Play,
  LayoutTemplate,
  List,
  Heading,
  Minus,
  AlignLeft,
  FileText,
  Highlighter,
  ListOrdered,
  AlertCircle,
  Info,
  MousePointerClick,
  Image as ImageIcon,
  FileDown,
  Vote,
  HelpCircle,
  GripVertical,
  Eye,
  EyeOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/admin/content/RichTextEditor";
import { uploadAdminCmsBlogDocument, uploadAdminCmsBlogImage } from "@/lib/adminApi";
import { processCmsBlogImage, type CmsImageCrop, defaultCropForImage } from "@/lib/cmsImage";
import { clipboardToStandardCmsBlocks } from "@/lib/richText";
import { ImageCropDialog } from "@/components/admin/content/media/ImageCropDialog";
import { cn } from "@/lib/utils";

import {
  CMS_BLOCK_TYPES,
  CMS_BLOCK_CATEGORIES,
  CMS_TEXT_STYLE_TOKENS,
  createEmptyBlock,
  getBlockLabel,
  type CmsBlockDraft,
  type CmsBlockType,
  type CmsTextStyleToken,
} from "./types";

// Icon mapping for block types
const BLOCK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutTemplate,
  List,
  Heading,
  Minus,
  AlignLeft,
  FileText,
  Highlighter,
  ListOrdered,
  AlertCircle,
  Info,
  MousePointerClick,
  Image: ImageIcon,
  FileDown,
  Play,
  Vote,
  HelpCircle,
};

function getBlockIcon(type: CmsBlockType): React.ComponentType<{ className?: string }> | null {
  const info = CMS_BLOCK_TYPES.find((t) => t.value === type);
  if (!info) return null;
  return BLOCK_ICONS[info.icon] ?? null;
}

function updateAt<T>(items: T[], index: number, next: T): T[] {
  return items.map((item, idx) => (idx === index ? next : item));
}

function removeAt<T>(items: T[], index: number): T[] {
  return items.filter((_, idx) => idx !== index);
}

function move<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function itemsToTextarea(items: unknown): string {
  return Array.isArray(items) ? items.map((v) => String(v ?? "").trim()).filter(Boolean).join("\n") : "";
}

function textareaToItems(text: string): string[] {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

type ParsedVideo = {
  provider: "youtube" | "vimeo";
  videoId: string;
  embedUrl: string;
  thumbnailUrl: string;
};

function buildVideoUrls(provider: string, videoId: string): { embedUrl: string; thumbnailUrl: string } | null {
  const p = provider.toLowerCase();
  const id = String(videoId ?? "").trim();
  if (!id) return null;

  if (p === "youtube") {
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (p === "vimeo") {
    return {
      embedUrl: `https://player.vimeo.com/video/${id}`,
      thumbnailUrl: `https://vumbnail.com/${id}.jpg`,
    };
  }

  return null;
}

function parseVideoUrl(input: string): ParsedVideo | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  const vimeoIdRegex = /^\d+$/;

  if (host === "youtu.be") {
    const id = pathParts[0] ?? "";
    if (!youtubeIdRegex.test(id)) return null;
    const urls = buildVideoUrls("youtube", id);
    if (!urls) return null;
    return { provider: "youtube", videoId: id, ...urls };
  }

  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    const first = pathParts[0] ?? "";

    const idFromWatch = url.searchParams.get("v") ?? "";
    if (first === "watch" && youtubeIdRegex.test(idFromWatch)) {
      const urls = buildVideoUrls("youtube", idFromWatch);
      if (!urls) return null;
      return { provider: "youtube", videoId: idFromWatch, ...urls };
    }

    if ((first === "embed" || first === "shorts" || first === "live") && youtubeIdRegex.test(pathParts[1] ?? "")) {
      const id = pathParts[1] ?? "";
      const urls = buildVideoUrls("youtube", id);
      if (!urls) return null;
      return { provider: "youtube", videoId: id, ...urls };
    }

    return null;
  }

  if (host === "vimeo.com") {
    const id = pathParts[0] ?? "";
    if (!vimeoIdRegex.test(id)) return null;
    const urls = buildVideoUrls("vimeo", id);
    if (!urls) return null;
    return { provider: "vimeo", videoId: id, ...urls };
  }

  if (host === "player.vimeo.com") {
    if ((pathParts[0] ?? "") !== "video") return null;
    const id = pathParts[1] ?? "";
    if (!vimeoIdRegex.test(id)) return null;
    const urls = buildVideoUrls("vimeo", id);
    if (!urls) return null;
    return { provider: "vimeo", videoId: id, ...urls };
  }

  return null;
}

type Props = {
  blocks: CmsBlockDraft[];
  onChange: (next: CmsBlockDraft[]) => void;
};

export function CmsBlocksEditor({ blocks, onChange }: Props) {
  const [newType, setNewType] = useState<CmsBlockType>("rich_text");
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const addBlock = () => {
    const block = createEmptyBlock(newType);
    // Auto-expand newly added block
    setExpandedBlocks((prev) => new Set([...prev, block.localId]));
    onChange([...blocks, block]);
  };

  const toggleExpand = (localId: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) {
        next.delete(localId);
      } else {
        next.add(localId);
      }
      return next;
    });
  };

  // Group blocks by category for the selector
  const blocksByCategory = CMS_BLOCK_CATEGORIES.map((cat) => ({
    ...cat,
    blocks: CMS_BLOCK_TYPES.filter((b) => b.category === cat.value),
  }));

  return (
    <div className="space-y-4">
      {/* Header with block type selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary">
            <Plus className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Ajouter un bloc</div>
            <div className="text-xs text-slate-500">{blocks.length} bloc{blocks.length !== 1 ? "s" : ""} • FR/EN séparés</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[240px]">
            <Select value={newType} onValueChange={(v) => setNewType(v as CmsBlockType)}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Type de bloc">
                  {(() => {
                    const info = CMS_BLOCK_TYPES.find((t) => t.value === newType);
                    const Icon = info ? BLOCK_ICONS[info.icon] : null;
                    return (
                      <span className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4 text-slate-500" />}
                        {info?.label ?? newType}
                      </span>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {blocksByCategory.map((cat) => (
                  <SelectGroup key={cat.value}>
                    <SelectLabel className="text-xs font-bold text-slate-500 uppercase tracking-wide">{cat.label}</SelectLabel>
                    {cat.blocks.map((t) => {
                      const Icon = BLOCK_ICONS[t.icon];
                      return (
                        <SelectItem key={t.value} value={t.value}>
                          <span className="flex items-center gap-2">
                            {Icon && <Icon className="h-4 w-4 text-slate-500" />}
                            <span>{t.label}</span>
                            <span className="text-xs text-slate-400 ms-1">— {t.description}</span>
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" className="gap-2" onClick={addBlock}>
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 px-6 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 mb-3">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <div className="text-sm font-medium text-slate-700">Aucun bloc</div>
          <div className="text-xs text-slate-500 mt-1">Sélectionnez un type ci-dessus et cliquez sur "Ajouter"</div>
        </div>
      ) : null}

      <div className="space-y-2">
        {blocks.map((block, index) => {
          const isExpanded = expandedBlocks.has(block.localId);
          const Icon = getBlockIcon(block.type);

          return (
            <Card key={block.localId} className={cn("transition-all", !block.is_enabled && "opacity-60")}>
              {/* Compact header - always visible */}
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors",
                  isExpanded && "border-b border-slate-100"
                )}
                onClick={() => toggleExpand(block.localId)}
              >
                <div className="flex items-center gap-2 text-slate-400">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-xs font-bold text-slate-500 w-5">{index + 1}</span>
                </div>

                <div className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-md",
                  block.is_enabled ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-400"
                )}>
                  {Icon && <Icon className="h-4 w-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{getBlockLabel(block.type)}</span>
                    {!block.is_enabled && (
                      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">(désactivé)</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {CMS_BLOCK_TYPES.find((t) => t.value === block.type)?.description ?? ""}
                  </div>
                </div>

                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onChange(updateAt(blocks, index, { ...block, is_enabled: !block.is_enabled }))}
                    title={block.is_enabled ? "Désactiver" : "Activer"}
                  >
                    {block.is_enabled ? <Eye className="h-4 w-4 text-slate-500" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === 0}
                    onClick={() => onChange(move(blocks, index, index - 1))}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={index === blocks.length - 1}
                    onClick={() => onChange(move(blocks, index, index + 1))}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => onChange(removeAt(blocks, index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
              </div>

              {/* Expandable content */}
              {isExpanded && (
                <CardContent className="pt-4 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={block.type}
                    onValueChange={(v) => {
                      const nextType = v as CmsBlockType;
                      const next = createEmptyBlock(nextType);
                      onChange(updateAt(blocks, index, { ...next, localId: block.localId, is_enabled: block.is_enabled }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CMS_BLOCK_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-slate-600">
                    {CMS_BLOCK_TYPES.find((t) => t.value === block.type)?.description ?? ""}
                  </div>
                </div>

                {block.type === "faq" ? (
                  <div className="space-y-2">
                    <Label>Catégorie FAQ</Label>
                    <Input
                      value={asString(asRecord(block.data).category)}
                      onChange={(e) => {
                        onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), category: e.target.value } }));
                      }}
                      placeholder="reservations"
                    />
                    <div className="text-xs text-slate-600">Ex: reservations, paiement, annulation…</div>
                  </div>
                ) : null}

                {block.type === "toc" ? (
                  <div className="space-y-2">
                    <Label>Comportement</Label>
                    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Sticky (desktop)</div>
                        <div className="text-xs text-slate-600">Le sommaire reste visible au scroll sur desktop.</div>
                      </div>
                      <Switch
                        checked={Boolean(asRecord(block.data).sticky ?? true)}
                        onCheckedChange={(checked) => onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), sticky: checked } }))}
                      />
                    </div>
                  </div>
                ) : null}

                {block.type === "heading" ? (
                  <div className="space-y-2">
                    <Label>Niveau de titre</Label>
                    <Select
                      value={String(asRecord(block.data).level ?? 2)}
                      onValueChange={(v) => onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), level: Number(v) } }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2">H2</SelectItem>
                        <SelectItem value="3">H3</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-slate-600">Utilisé pour le SEO et la table des matières.</div>
                  </div>
                ) : null}

                {block.type === "callout" ? (
                  <div className="space-y-2">
                    <Label>Style de callout</Label>
                    <Select
                      value={asString(asRecord(block.data).variant) || "info"}
                      onValueChange={(v) => onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), variant: v } }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Info</SelectItem>
                        <SelectItem value="warning">Warning</SelectItem>
                        <SelectItem value="success">Success</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {block.type === "accented_text" ? (
                  <div className="space-y-2">
                    <Label>Style couleur</Label>
                    <Select
                      value={asString(asRecord(block.data).textStyle) || "default"}
                      onValueChange={(v) =>
                        onChange(
                          updateAt(blocks, index, {
                            ...block,
                            data: { ...asRecord(block.data), textStyle: v as CmsTextStyleToken },
                          }),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CMS_TEXT_STYLE_TOKENS.map((token) => (
                          <SelectItem key={token} value={token}>
                            {token === "default"
                              ? "Default"
                              : token === "primary"
                                ? "Primary"
                                : token === "secondary"
                                  ? "Secondary"
                                  : token === "accent"
                                    ? "Accent / Highlight"
                                    : token === "success"
                                      ? "Success"
                                      : token === "warning"
                                        ? "Warning"
                                        : token === "danger"
                                          ? "Danger"
                                          : "Info"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-slate-600">Couleur contrôlée (token) — aucune couleur libre n’est stockée.</div>
                  </div>
                ) : null}
              </div>

              {block.type === "hero" ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Image de fond (URL)</Label>
                    <Input
                      value={asString(asRecord(block.data).background_url)}
                      onChange={(e) => onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), background_url: e.target.value } }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Alignement</Label>
                    <Select
                      value={asString(asRecord(block.data).align) || "left"}
                      onValueChange={(v) => onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), align: v } }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">Gauche</SelectItem>
                        <SelectItem value="center">Centre</SelectItem>
                        <SelectItem value="right">Droite</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              {block.type === "image" ? (
                <ImageBlockSharedFields block={block} index={index} blocks={blocks} onChange={onChange} />
              ) : null}

              {block.type === "document" ? (
                <DocumentBlockSharedFields block={block} index={index} blocks={blocks} onChange={onChange} />
              ) : null}

              {block.type === "video" ? (
                <VideoBlockSharedFields block={block} index={index} blocks={blocks} onChange={onChange} />
              ) : null}

              {block.type === "poll" ? (
                <PollBlockSharedFields block={block} index={index} blocks={blocks} onChange={onChange} />
              ) : null}

              <div className="grid gap-6 lg:grid-cols-2">
                <LocaleFields
                  title="Français"
                  locale="fr"
                  type={block.type}
                  value={block.data_fr}
                  onChange={(next) => onChange(updateAt(blocks, index, { ...block, data_fr: next }))}
                  onPasteConvertToBlocks={({ html, text, cleanedHtml, cleanedText }) => {
                    if (block.type !== "rich_text") return false;

                    const specs = clipboardToStandardCmsBlocks({ html, text });
                    if (!specs || !specs.length) return false;

                    // Only replace the block when we actually produced multiple standard blocks.
                    if (specs.length === 1 && specs[0]?.type === "rich_text") return false;

                    const nextBlocks = specs
                      .map((spec) => {
                        const next = createEmptyBlock(spec.type as CmsBlockType);
                        const shared = "data" in spec ? spec.data : undefined;
                        if (shared) next.data = { ...asRecord(next.data), ...shared };
                        const localized = "locale" in spec ? spec.locale : undefined;
                        if (localized) next.data_fr = { ...asRecord(next.data_fr), ...localized };
                        return next;
                      })
                      .filter((b) => b.type);

                    if (!nextBlocks.length) return false;

                    onChange([...blocks.slice(0, index), ...nextBlocks, ...blocks.slice(index + 1)]);
                    return true;
                  }}
                />
                <LocaleFields
                  title="English"
                  locale="en"
                  type={block.type}
                  value={block.data_en}
                  onChange={(next) => onChange(updateAt(blocks, index, { ...block, data_en: next }))}
                  onPasteConvertToBlocks={({ html, text }) => {
                    if (block.type !== "rich_text") return false;

                    const specs = clipboardToStandardCmsBlocks({ html, text });
                    if (!specs || !specs.length) return false;
                    if (specs.length === 1 && specs[0]?.type === "rich_text") return false;

                    const nextBlocks = specs
                      .map((spec) => {
                        const next = createEmptyBlock(spec.type as CmsBlockType);
                        const shared = "data" in spec ? spec.data : undefined;
                        if (shared) next.data = { ...asRecord(next.data), ...shared };
                        const localized = "locale" in spec ? spec.locale : undefined;
                        if (localized) next.data_en = { ...asRecord(next.data_en), ...localized };
                        return next;
                      })
                      .filter((b) => b.type);

                    if (!nextBlocks.length) return false;

                    onChange([...blocks.slice(0, index), ...nextBlocks, ...blocks.slice(index + 1)]);
                    return true;
                  }}
                />
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

type ImageBlockSharedFieldsProps = {
  block: CmsBlockDraft;
  index: number;
  blocks: CmsBlockDraft[];
  onChange: (next: CmsBlockDraft[]) => void;
};

type DocumentBlockSharedFieldsProps = {
  block: CmsBlockDraft;
  index: number;
  blocks: CmsBlockDraft[];
  onChange: (next: CmsBlockDraft[]) => void;
};

type VideoBlockSharedFieldsProps = {
  block: CmsBlockDraft;
  index: number;
  blocks: CmsBlockDraft[];
  onChange: (next: CmsBlockDraft[]) => void;
};

type PollBlockSharedFieldsProps = {
  block: CmsBlockDraft;
  index: number;
  blocks: CmsBlockDraft[];
  onChange: (next: CmsBlockDraft[]) => void;
};

function ImageBlockSharedFields({ block, index, blocks, onChange }: ImageBlockSharedFieldsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropDialogFile, setCropDialogFile] = useState<File | null>(null);
  const [cropDraft, setCropDraft] = useState<CmsImageCrop>(defaultCropForImage());

  const record = asRecord(block.data);
  const src = asString(record.src);

  const updateData = (patch: Record<string, unknown>) => {
    onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), ...patch } }));
  };

  const onPick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFileSelected = (file: File) => {
    setError(null);
    setCropDraft(defaultCropForImage());
    setCropDialogFile(file);
    setCropDialogOpen(true);
  };

  const onConfirmCrop = async (crop: CmsImageCrop) => {
    const file = cropDialogFile;
    if (!file) return;

    setUploading(true);
    setError(null);

    const processed = await processCmsBlogImage({ file, crop });
    if (processed.ok === false) {
      setUploading(false);
      setError(processed.message);
      return;
    }

    try {
      const upload = await uploadAdminCmsBlogImage(undefined, {
        file: new Blob([processed.image.blob], { type: processed.image.mimeType }),
        fileName: file.name,
      });

      updateData({
        src: upload.item.public_url,
        ratio: "16:9",
        storage_bucket: upload.item.bucket,
        storage_path: upload.item.path,
        mime_type: upload.item.mime_type,
        size_bytes: upload.item.size_bytes,
      });

      setUploading(false);
    } catch (e) {
      setUploading(false);
      setError(e instanceof Error ? e.message : "Upload impossible");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Source image (URL)</Label>
          <Input
            value={src}
            onChange={(e) => updateData({ src: e.target.value })}
            placeholder="https://..."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="gap-2" onClick={onPick} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Uploader & recadrer
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                // allow selecting the same file again
                e.currentTarget.value = "";
                if (f) onFileSelected(f);
              }}
            />
          </div>
          <div className="text-xs text-slate-600">
            Le pipeline convertit l’image en 1200×675 (16:9) et compresse sous 2Mo.
          </div>

          {error ? <div className="text-xs text-red-700">{error}</div> : null}
        </div>

        <div className="space-y-2">
          <Label>Ratio</Label>
          <Select
            value={asString(asRecord(block.data).ratio) || "auto"}
            onValueChange={(v) => updateData({ ratio: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="16:9">16:9</SelectItem>
              <SelectItem value="4:3">4:3</SelectItem>
              <SelectItem value="1:1">1:1</SelectItem>
            </SelectContent>
          </Select>

          {src ? (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="text-xs font-semibold text-slate-700">Aperçu</div>
              <div className="mt-2 aspect-[16/9] overflow-hidden rounded-md bg-white">
                <img src={src} alt="" className="h-full w-full object-cover" />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ImageCropDialog
        open={cropDialogOpen}
        onOpenChange={(o) => {
          setCropDialogOpen(o);
          if (!o) setCropDialogFile(null);
        }}
        file={cropDialogFile}
        value={cropDraft}
        onConfirm={(next) => {
          setCropDraft(next);
          void onConfirmCrop(next);
        }}
      />
    </div>
  );
}

function DocumentBlockSharedFields({ block, index, blocks, onChange }: DocumentBlockSharedFieldsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const record = asRecord(block.data);
  const url = asString(record.url);
  const fileName = asString(record.file_name);
  const sizeBytes = typeof record.size_bytes === "number" && Number.isFinite(record.size_bytes) ? Math.max(0, Math.floor(record.size_bytes)) : 0;

  const updateData = (patch: Record<string, unknown>) => {
    onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), ...patch } }));
  };

  const onPick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const onFileSelected = async (file: File) => {
    setError(null);

    if (!file) return;

    const mime = String(file.type || "").toLowerCase();
    if (mime && !mime.includes("application/pdf")) {
      setError("Le fichier doit être un PDF.");
      return;
    }

    const maxBytes = 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError("PDF trop lourd (max 10MB).");
      return;
    }

    setUploading(true);

    try {
      const upload = await uploadAdminCmsBlogDocument(undefined, { file, fileName: file.name });
      updateData({
        url: upload.item.public_url,
        file_name: upload.item.file_name,
        size_bytes: upload.item.size_bytes,
        storage_bucket: upload.item.bucket,
        storage_path: upload.item.path,
        mime_type: upload.item.mime_type,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload impossible");
    } finally {
      setUploading(false);
    }
  };

  const humanSize = (n: number): string => {
    if (!n) return "";
    const kb = n / 1024;
    if (kb < 1024) return `${Math.round(kb)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Document PDF (URL)</Label>
          <Input value={url} onChange={(e) => updateData({ url: e.target.value })} placeholder="https://..." />
          <div className="text-xs text-slate-600">URL publique du PDF. L’upload via bouton remplit ce champ automatiquement.</div>
        </div>

        <div className="space-y-2">
          <Label>Upload PDF</Label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFileSelected(f);
                e.target.value = "";
              }}
            />

            <Button type="button" variant="outline" className="gap-2" disabled={uploading} onClick={onPick}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Upload..." : "Choisir un PDF"}
            </Button>

            {url ? (
              <a href={url} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline" className="gap-2">
                  Ouvrir
                </Button>
              </a>
            ) : null}
          </div>

          {fileName || sizeBytes ? (
            <div className="text-xs text-slate-600">
              {fileName ? <span className="font-semibold">{fileName}</span> : null}
              {fileName && sizeBytes ? <span> · </span> : null}
              {sizeBytes ? <span>{humanSize(sizeBytes)}</span> : null}
            </div>
          ) : null}

          {error ? <div className="text-sm text-red-700">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

function VideoBlockSharedFields({ block, index, blocks, onChange }: VideoBlockSharedFieldsProps) {
  const record = asRecord(block.data);
  const url = asString(record.url);
  const provider = asString(record.provider);
  const videoId = asString(record.video_id);

  const updateData = (patch: Record<string, unknown>) => {
    onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), ...patch } }));
  };

  const parsed = url ? parseVideoUrl(url) : null;
  const effectiveProvider = parsed?.provider ?? provider;
  const effectiveId = parsed?.videoId ?? videoId;
  const urls = effectiveProvider && effectiveId ? buildVideoUrls(effectiveProvider, effectiveId) : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>URL Vidéo (YouTube / Vimeo)</Label>
          <Input
            value={url}
            onChange={(e) => {
              const nextUrl = e.target.value;
              const nextParsed = parseVideoUrl(nextUrl);
              updateData({
                url: nextUrl,
                provider: nextParsed?.provider ?? "",
                video_id: nextParsed?.videoId ?? "",
              });
            }}
            placeholder="https://www.youtube.com/watch?v=..."
          />
          <div className="text-xs text-slate-600">
            Colle une URL YouTube ou Vimeo. Le système extrait automatiquement le provider + l’identifiant.
          </div>

          {url && !parsed ? (
            <div className="text-sm text-amber-800">
              URL non reconnue. Formats acceptés : youtube.com/watch?v=…, youtu.be/…, vimeo.com/…
            </div>
          ) : null}

          {effectiveProvider && effectiveId ? (
            <div className="text-xs text-slate-700">
              <span className="font-semibold">Provider :</span> {effectiveProvider} · <span className="font-semibold">ID :</span> {effectiveId}
            </div>
          ) : null}

          {url ? (
            <div className="mt-2">
              <a href={url} target="_blank" rel="noreferrer">
                <Button type="button" variant="outline">
                  Ouvrir la vidéo
                </Button>
              </a>
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label>Aperçu (thumbnail)</Label>
          {urls ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
              <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-white">
                <img src={urls.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                <div className="absolute inset-0 grid place-items-center">
                  <div className="rounded-full bg-black/55 p-3 text-white">
                    <Play className="h-5 w-5" />
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-600">
                Lazy-load : l’iframe ne sera chargé qu’au clic ou à l’intersection (front public).
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Colle une URL valide pour voir l’aperçu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PollBlockSharedFields({ block, index, blocks, onChange }: PollBlockSharedFieldsProps) {
  const record = asRecord(block.data);
  const pollId = asString(record.poll_id);

  const updateData = (patch: Record<string, unknown>) => {
    onChange(updateAt(blocks, index, { ...block, data: { ...asRecord(block.data), ...patch } }));
  };

  return (
    <div className="space-y-2">
      <Label>ID du sondage</Label>
      <Input value={pollId} onChange={(e) => updateData({ poll_id: e.target.value })} placeholder="uuid" />
      <div className="text-xs text-slate-600">
        Identifiant technique (UUID). Sert à associer les votes à ce sondage. Ne change pas après publication.
      </div>
    </div>
  );
}

type LocaleFieldsProps = {
  title: string;
  locale: "fr" | "en";
  type: CmsBlockType;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  onPasteConvertToBlocks?: (payload: { html: string; text: string; cleanedHtml: string; cleanedText: string }) => boolean;
};

function LocaleFields({ title, locale, type, value, onChange, onPasteConvertToBlocks }: LocaleFieldsProps) {
  const record = asRecord(value);

  if (type === "divider") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Séparateur : pas de contenu à renseigner.
      </div>
    );
  }

  if (type === "faq") {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Bloc FAQ: pas de contenu spécifique à la langue (il utilise la FAQ publiée).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>

      {type === "toc" ? (
        <div className="space-y-2">
          <Label>Titre</Label>
          <Input value={asString(record.title)} onChange={(e) => onChange({ ...record, title: e.target.value })} placeholder="Sommaire" />
          <div className="text-xs text-slate-600">Le sommaire liste automatiquement les titres (H2/H3) définis plus bas.</div>
        </div>
      ) : null}

      {type === "heading" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Texte du titre</Label>
            <Input value={asString(record.text)} onChange={(e) => onChange({ ...record, text: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Ancre (id)</Label>
            <Input value={asString(record.anchor)} onChange={(e) => onChange({ ...record, anchor: e.target.value })} placeholder="ex: definitions" />
            <div className="text-xs text-slate-600">Sans espace. Utilisé pour les liens du sommaire.</div>
          </div>
        </div>
      ) : null}

      {type === "paragraph" ? (
        <div className="space-y-2">
          <Label>Texte</Label>
          <Textarea value={asString(record.text)} onChange={(e) => onChange({ ...record, text: e.target.value })} rows={5} />
        </div>
      ) : null}

      {type === "bullets" || type === "numbered" ? (
        <div className="space-y-2">
          <Label>Éléments (1 par ligne)</Label>
          <Textarea
            value={itemsToTextarea(record.items)}
            onChange={(e) => onChange({ ...record, items: textareaToItems(e.target.value) })}
            rows={6}
            placeholder="- Premier point\n- Deuxième point"
          />
        </div>
      ) : null}

      {type === "callout" || type === "notice" ? (
        <>
          <div className="space-y-2">
            <Label>Titre (optionnel)</Label>
            <Input value={asString(record.title)} onChange={(e) => onChange({ ...record, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Texte</Label>
            <Textarea value={asString(record.text)} onChange={(e) => onChange({ ...record, text: e.target.value })} rows={5} />
          </div>
        </>
      ) : null}

      {type === "accented_text" ? (
        <div className="space-y-2">
          <Label>Texte</Label>
          <RichTextEditor
            value={asString(record.html)}
            onChange={(html) => onChange({ ...record, html })}
            placeholder="Texte à mettre en valeur…"
            editorClassName="min-h-[120px]"
          />
          <div className="text-xs text-slate-600">Le style est appliqué au bloc entier (pas par mot).</div>
        </div>
      ) : null}

      {type === "rich_text" ? (
        <div className="space-y-2">
          <Label>Contenu</Label>
          <RichTextEditor
            value={asString(record.html)}
            onChange={(html) => onChange({ ...record, html })}
            placeholder="Écrivez votre texte…"
            editorClassName="min-h-[180px]"
            onPasteCleanCopy={onPasteConvertToBlocks}
          />
        </div>
      ) : null}

      {type === "hero" ? (
        <>
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={asString(record.heading)} onChange={(e) => onChange({ ...record, heading: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Sous-titre</Label>
            <Textarea
              value={asString(record.subheading)}
              onChange={(e) => onChange({ ...record, subheading: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Label bouton</Label>
              <Input value={asString(record.cta_label)} onChange={(e) => onChange({ ...record, cta_label: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Lien bouton</Label>
              <Input value={asString(record.cta_href)} onChange={(e) => onChange({ ...record, cta_href: e.target.value })} placeholder="/contact" />
            </div>
          </div>
        </>
      ) : null}

      {type === "cta" ? (
        <>
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={asString(record.title)} onChange={(e) => onChange({ ...record, title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Texte</Label>
            <Textarea value={asString(record.text)} onChange={(e) => onChange({ ...record, text: e.target.value })} rows={3} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Label bouton</Label>
              <Input
                value={asString(record.button_label)}
                onChange={(e) => onChange({ ...record, button_label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Lien bouton</Label>
              <Input
                value={asString(record.button_href)}
                onChange={(e) => onChange({ ...record, button_href: e.target.value })}
                placeholder="/pro"
              />
            </div>
          </div>
        </>
      ) : null}

      {type === "image" ? (
        <>
          <div className="space-y-2">
            <Label>Texte alternatif (alt)</Label>
            <Input value={asString(record.alt)} onChange={(e) => onChange({ ...record, alt: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Légende</Label>
            <Textarea value={asString(record.caption)} onChange={(e) => onChange({ ...record, caption: e.target.value })} rows={2} />
          </div>
        </>
      ) : null}

      {type === "document" ? (
        <>
          <div className="space-y-2">
            <Label>Titre (optionnel)</Label>
            <Input value={asString(record.title)} onChange={(e) => onChange({ ...record, title: e.target.value })} placeholder="Ex: Guide PDF" />
            <div className="text-xs text-slate-600">Affiché au-dessus du bouton.</div>
          </div>
          <div className="space-y-2">
            <Label>Label du bouton</Label>
            <Input value={asString(record.cta_label)} onChange={(e) => onChange({ ...record, cta_label: e.target.value })} placeholder="Télécharger" />
          </div>
        </>
      ) : null}

      {type === "video" ? (
        <div className="space-y-2">
          <Label>Légende (optionnel)</Label>
          <Textarea value={asString(record.caption)} onChange={(e) => onChange({ ...record, caption: e.target.value })} rows={2} />
          <div className="text-xs text-slate-600">Affichée sous la vidéo.</div>
        </div>
      ) : null}

      {type === "poll" ? (
        <>
          <div className="space-y-2">
            <Label>Question</Label>
            <Textarea value={asString(record.question)} onChange={(e) => onChange({ ...record, question: e.target.value })} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Réponses (1 par ligne)</Label>
            <Textarea
              value={itemsToTextarea(record.options)}
              onChange={(e) => onChange({ ...record, options: textareaToItems(e.target.value) })}
              rows={6}
              placeholder="Option 1\nOption 2\nOption 3"
            />
            <div className="text-xs text-slate-600">Choix unique côté public. Minimum 2 réponses.</div>
          </div>
        </>
      ) : null}
    </div>
  );
}
