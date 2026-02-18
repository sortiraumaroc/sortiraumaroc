import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit3, Loader2, Plus, Trash2, Calendar, User, Tag, Eye, FileText, Globe, Search } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { RichTextEditor } from "@/components/admin/content/RichTextEditor";
import { CmsBlocksEditor } from "@/components/admin/content/blocks/CmsBlocksEditor";
import { BlogPollStatsPanel } from "@/components/admin/content/BlogPollStatsPanel";
import type { CmsBlockDraft } from "@/components/admin/content/blocks/types";
import {
  AdminApiError,
  createAdminCmsBlogArticle,
  createAdminCmsBlogAuthor,
  createAdminContentPage,
  deleteAdminCmsBlogArticle,
  listAdminCmsBlogArticleBlocks,
  listAdminCmsBlogArticles,
  listAdminCmsBlogAuthors,
  listAdminCmsBlogCategories,
  listAdminContentPageBlocks,
  listAdminContentPages,
  replaceAdminCmsBlogArticleBlocks,
  replaceAdminContentPageBlocks,
  updateAdminCmsBlogArticle,
  updateAdminCmsBlogAuthor,
  updateAdminContentPage,
  type BlogArticleAdmin,
  type BlogAuthorAdmin,
  type BlogCategoryAdmin,
  type CmsBlockInput,
  type ContentPageAdmin,
} from "@/lib/adminApi";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function normalizeSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

function humanAdminError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Une erreur est survenue.";
}

function isoToLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local expects: YYYY-MM-DDTHH:mm
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function localInputValueToIso(value: string): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type PageEditorState = {
  id?: string;

  page_key: string;
  slug_fr: string;
  slug_en: string;
  status: "draft" | "published";

  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;

  body_html_fr: string;
  body_html_en: string;

  // SEO (preferred)
  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  // OG
  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string;

  // Canonical/robots
  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  // Legal UX / advanced
  show_toc: boolean;
  related_links_json: string;
  schema_jsonld_fr_json: string;
  schema_jsonld_en_json: string;

  blocks: CmsBlockDraft[];
};

type BlogEditorState = {
  id?: string;

  slug: string;

  // Publication
  is_published: boolean;
  original_is_published: boolean;
  published_at_local: string; // datetime-local input value (manual override when provided)

  // Read count
  show_read_count: boolean;
  read_count: number;

  // Author (Phase 1)
  author_id: string | null;
  author_name: string; // compat/cache

  // Categories (Phase 1)
  primary_category_id: string | null;
  category: string; // compat/cache (slug)
  secondary_category_ids: string[];

  // Content
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  body_html_fr: string;
  body_html_en: string;

  // SEO
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;

  blocks: CmsBlockDraft[];
};

function blocksToApiInput(blocks: CmsBlockDraft[]): CmsBlockInput[] {
  return blocks.map((b) => ({
    type: b.type,
    is_enabled: b.is_enabled,
    data: b.data,
    data_fr: b.data_fr,
    data_en: b.data_en,
  }));
}

function apiBlocksToDrafts(
  items: Array<{
    id: string;
    sort_order: number;
    type: string;
    is_enabled: boolean;
    data: unknown;
    data_fr: unknown;
    data_en: unknown;
  }>,
): CmsBlockDraft[] | [] {
  if (!Array.isArray(items)) return [];

  const asRecord = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v) ? (v as any) : {};

  return items
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((b) => ({
      localId: String(
        b.id ??
          globalThis.crypto?.randomUUID?.() ??
          `${Date.now()}-${Math.random()}`,
      ),
      type: b.type as any,
      is_enabled: Boolean(b.is_enabled),
      data: asRecord(b.data),
      data_fr: asRecord(b.data_fr),
      data_en: asRecord(b.data_en),
    }));
}

function emptyPageEditor(): PageEditorState {
  return {
    page_key: "",
    slug_fr: "",
    slug_en: "",
    status: "draft",

    title_fr: "",
    title_en: "",
    page_subtitle_fr: "",
    page_subtitle_en: "",

    body_html_fr: "",
    body_html_en: "",

    seo_title_fr: "",
    seo_title_en: "",
    seo_description_fr: "",
    seo_description_en: "",

    og_title_fr: "",
    og_title_en: "",
    og_description_fr: "",
    og_description_en: "",
    og_image_url: "",

    canonical_url_fr: "",
    canonical_url_en: "",
    robots: "",

    show_toc: false,
    related_links_json: "[]",
    schema_jsonld_fr_json: "",
    schema_jsonld_en_json: "",

    blocks: [],
  };
}

function emptyBlogEditor(): BlogEditorState {
  return {
    slug: "",

    is_published: false,
    original_is_published: false,
    published_at_local: "",

    show_read_count: false,
    read_count: 0,

    author_id: null,
    author_name: "",

    primary_category_id: null,
    category: "",
    secondary_category_ids: [],

    title_fr: "",
    title_en: "",
    excerpt_fr: "",
    excerpt_en: "",
    body_html_fr: "",
    body_html_en: "",
    meta_title_fr: "",
    meta_title_en: "",
    meta_description_fr: "",
    meta_description_en: "",
    blocks: [],
  };
}

export function AdminContentPage() {
  const { toast } = useToast();

  const [tab, setTab] = useState<"pages" | "blog">("pages");

  // ---------------------------------------------------------------------------
  // Pages (Mode B: Supabase content_pages + content_page_blocks)
  // ---------------------------------------------------------------------------

  const [pages, setPages] = useState<ContentPageAdmin[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const [pageDialogOpen, setPageDialogOpen] = useState(false);
  const [pageDialogLoading, setPageDialogLoading] = useState(false);
  const [pageSaving, setPageSaving] = useState(false);
  const [pageEditor, setPageEditor] = useState<PageEditorState | null>(null);
  const [pageSlugFrError, setPageSlugFrError] = useState<string | null>(null);
  const [pageSlugEnError, setPageSlugEnError] = useState<string | null>(null);

  const refreshPages = useCallback(async () => {
    setPagesLoading(true);
    setPagesError(null);

    try {
      const res = await listAdminContentPages(undefined);
      const items = Array.isArray(res.items) ? res.items : [];
      const collator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });
      setPages(
        [...items].sort((a, b) => {
          const aLabel = String((a as any)?.title_fr ?? (a as any)?.page_key ?? (a as any)?.slug_fr ?? (a as any)?.slug ?? "");
          const bLabel = String((b as any)?.title_fr ?? (b as any)?.page_key ?? (b as any)?.slug_fr ?? (b as any)?.slug ?? "");
          return collator.compare(aLabel, bLabel);
        }),
      );
    } catch (e) {
      setPages([]);
      setPagesError(humanAdminError(e));
    } finally {
      setPagesLoading(false);
    }
  }, []);

  const openNewPage = useCallback(() => {
    setPageSlugFrError(null);
    setPageSlugEnError(null);
    setPageEditor(emptyPageEditor());
    setPageDialogOpen(true);
  }, []);

  const openPage = useCallback(
    async (row: ContentPageAdmin) => {
      setPageSlugFrError(null);
      setPageSlugEnError(null);
      setPageDialogOpen(true);
      setPageDialogLoading(true);
      setPageEditor(null);

      try {
        const blocksRes = await listAdminContentPageBlocks(undefined, row.id);
        const blocks = apiBlocksToDrafts((blocksRes.items ?? []) as any);

        setPageEditor({
          id: row.id,

          page_key: row.page_key ?? "",
          slug_fr: row.slug_fr ?? row.slug ?? "",
          slug_en: row.slug_en ?? row.slug ?? "",
          status: row.status === "published" ? "published" : "draft",

          title_fr: row.title_fr ?? "",
          title_en: row.title_en ?? "",
          page_subtitle_fr: row.page_subtitle_fr ?? "",
          page_subtitle_en: row.page_subtitle_en ?? "",

          body_html_fr: row.body_html_fr ?? "",
          body_html_en: row.body_html_en ?? "",

          seo_title_fr: row.seo_title_fr ?? "",
          seo_title_en: row.seo_title_en ?? "",
          seo_description_fr: row.seo_description_fr ?? "",
          seo_description_en: row.seo_description_en ?? "",

          og_title_fr: row.og_title_fr ?? "",
          og_title_en: row.og_title_en ?? "",
          og_description_fr: row.og_description_fr ?? "",
          og_description_en: row.og_description_en ?? "",
          og_image_url: row.og_image_url ?? "",

          canonical_url_fr: row.canonical_url_fr ?? "",
          canonical_url_en: row.canonical_url_en ?? "",
          robots: row.robots ?? "",

          show_toc: Boolean(row.show_toc),
          related_links_json: JSON.stringify(row.related_links ?? [], null, 2),
          schema_jsonld_fr_json: row.schema_jsonld_fr
            ? JSON.stringify(row.schema_jsonld_fr, null, 2)
            : "",
          schema_jsonld_en_json: row.schema_jsonld_en
            ? JSON.stringify(row.schema_jsonld_en, null, 2)
            : "",

          blocks,
        });
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
        setPageDialogOpen(false);
      } finally {
        setPageDialogLoading(false);
      }
    },
    [toast],
  );

  const validatePageSlug = useCallback(
    (
      nextSlugRaw: string,
      currentId: string | undefined,
      field: "slug_fr" | "slug_en",
    ) => {
      const slug = normalizeSlug(nextSlugRaw);
      if (!slug) return { slug, error: "Slug requis." };
      if (!isValidSlug(slug))
        return {
          slug,
          error: "Format invalide (minuscules, chiffres, tirets).",
        };

      const exists = pages.some(
        (p) =>
          p.id !== currentId && String((p as any)[field] ?? "").trim() === slug,
      );
      if (exists) return { slug, error: "Ce slug existe déjà." };

      return { slug, error: null };
    },
    [pages],
  );

  const savePage = useCallback(async () => {
    if (!pageEditor) return;

    const { slug: slugFr, error: frError } = validatePageSlug(
      pageEditor.slug_fr,
      pageEditor.id,
      "slug_fr",
    );
    const { slug: slugEn, error: enError } = validatePageSlug(
      pageEditor.slug_en,
      pageEditor.id,
      "slug_en",
    );

    setPageSlugFrError(frError);
    setPageSlugEnError(enError);

    if (frError || enError) return;

    let relatedLinks: unknown = [];
    if (pageEditor.related_links_json.trim()) {
      try {
        relatedLinks = JSON.parse(pageEditor.related_links_json);
      } catch {
        toast({
          title: "Erreur",
          description: "related_links : JSON invalide",
          variant: "destructive",
        });
        return;
      }
    }

    let schemaJsonLdFr: unknown = null;
    if (pageEditor.schema_jsonld_fr_json.trim()) {
      try {
        schemaJsonLdFr = JSON.parse(pageEditor.schema_jsonld_fr_json);
      } catch {
        toast({
          title: "Erreur",
          description: "schema_jsonld_fr : JSON invalide",
          variant: "destructive",
        });
        return;
      }
    }

    let schemaJsonLdEn: unknown = null;
    if (pageEditor.schema_jsonld_en_json.trim()) {
      try {
        schemaJsonLdEn = JSON.parse(pageEditor.schema_jsonld_en_json);
      } catch {
        toast({
          title: "Erreur",
          description: "schema_jsonld_en : JSON invalide",
          variant: "destructive",
        });
        return;
      }
    }

    const pageKey = pageEditor.page_key.trim() || slugFr;
    const titleForLegacy = (pageEditor.title_fr || pageEditor.title_en).trim();

    setPageSaving(true);
    try {
      if (!pageEditor.id) {
        const created = await createAdminContentPage(undefined, {
          slug: slugFr,
          page_key: pageKey,
          slug_fr: slugFr,
          slug_en: slugEn,
          status: pageEditor.status,
          is_published: pageEditor.status === "published",

          title: titleForLegacy,
          body_markdown: "",

          title_fr: pageEditor.title_fr,
          title_en: pageEditor.title_en,
          page_subtitle_fr: pageEditor.page_subtitle_fr,
          page_subtitle_en: pageEditor.page_subtitle_en,
          body_html_fr: pageEditor.body_html_fr,
          body_html_en: pageEditor.body_html_en,

          seo_title_fr: pageEditor.seo_title_fr,
          seo_title_en: pageEditor.seo_title_en,
          seo_description_fr: pageEditor.seo_description_fr,
          seo_description_en: pageEditor.seo_description_en,

          // keep legacy SEO in sync
          meta_title_fr: pageEditor.seo_title_fr,
          meta_title_en: pageEditor.seo_title_en,
          meta_description_fr: pageEditor.seo_description_fr,
          meta_description_en: pageEditor.seo_description_en,

          og_title_fr: pageEditor.og_title_fr,
          og_title_en: pageEditor.og_title_en,
          og_description_fr: pageEditor.og_description_fr,
          og_description_en: pageEditor.og_description_en,
          og_image_url: pageEditor.og_image_url || null,

          canonical_url_fr: pageEditor.canonical_url_fr,
          canonical_url_en: pageEditor.canonical_url_en,
          robots: pageEditor.robots,

          show_toc: pageEditor.show_toc,
          related_links: relatedLinks,
          schema_jsonld_fr: schemaJsonLdFr,
          schema_jsonld_en: schemaJsonLdEn,
        });

        const id = created.item.id;
        await replaceAdminContentPageBlocks(undefined, {
          pageId: id,
          blocks: blocksToApiInput(pageEditor.blocks),
        });
      } else {
        await updateAdminContentPage(undefined, {
          id: pageEditor.id,
          slug: slugFr,
          page_key: pageKey,
          slug_fr: slugFr,
          slug_en: slugEn,
          status: pageEditor.status,
          is_published: pageEditor.status === "published",

          title: titleForLegacy,
          body_markdown: "",

          title_fr: pageEditor.title_fr,
          title_en: pageEditor.title_en,
          page_subtitle_fr: pageEditor.page_subtitle_fr,
          page_subtitle_en: pageEditor.page_subtitle_en,
          body_html_fr: pageEditor.body_html_fr,
          body_html_en: pageEditor.body_html_en,

          seo_title_fr: pageEditor.seo_title_fr,
          seo_title_en: pageEditor.seo_title_en,
          seo_description_fr: pageEditor.seo_description_fr,
          seo_description_en: pageEditor.seo_description_en,

          meta_title_fr: pageEditor.seo_title_fr,
          meta_title_en: pageEditor.seo_title_en,
          meta_description_fr: pageEditor.seo_description_fr,
          meta_description_en: pageEditor.seo_description_en,

          og_title_fr: pageEditor.og_title_fr,
          og_title_en: pageEditor.og_title_en,
          og_description_fr: pageEditor.og_description_fr,
          og_description_en: pageEditor.og_description_en,
          og_image_url: pageEditor.og_image_url || null,

          canonical_url_fr: pageEditor.canonical_url_fr,
          canonical_url_en: pageEditor.canonical_url_en,
          robots: pageEditor.robots,

          show_toc: pageEditor.show_toc,
          related_links: relatedLinks,
          schema_jsonld_fr: schemaJsonLdFr,
          schema_jsonld_en: schemaJsonLdEn,
        });

        await replaceAdminContentPageBlocks(undefined, {
          pageId: pageEditor.id,
          blocks: blocksToApiInput(pageEditor.blocks),
        });
      }

      toast({ title: "Enregistré", description: "Page mise à jour." });
      setPageDialogOpen(false);
      await refreshPages();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setPageSaving(false);
    }
  }, [
    pageEditor,
    refreshPages,
    toast,
    validatePageSlug,
    pageSlugEnError,
    pageSlugFrError,
  ]);

  const pageColumns = useMemo<ColumnDef<ContentPageAdmin>[]>(() => {
    return [
      {
        accessorKey: "page_key",
        header: "Key",
        cell: ({ row }) => (
          <span className="font-semibold text-slate-900">
            {row.original.page_key}
          </span>
        ),
      },
      {
        accessorKey: "slug_fr",
        header: "Slug FR",
        cell: ({ row }) => (
          <span className="text-slate-800">{row.original.slug_fr}</span>
        ),
      },
      {
        accessorKey: "slug_en",
        header: "Slug EN",
        cell: ({ row }) => (
          <span className="text-slate-800">{row.original.slug_en}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => (
          <span
            className={
              row.original.status === "published"
                ? "text-emerald-700 font-semibold"
                : "text-slate-600"
            }
          >
            {row.original.status === "published" ? "Publié" : "Brouillon"}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Dernière MAJ",
        cell: ({ row }) => (
          <span className="text-slate-700">
            {row.original.updated_at
              ? row.original.updated_at.slice(0, 10)
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => openPage(row.original)}
          >
            <Edit3 className="h-4 w-4" />
            Éditer
          </Button>
        ),
      },
    ];
  }, [openPage]);

  useEffect(() => {
    void refreshPages();
  }, [refreshPages]);

  // ---------------------------------------------------------------------------
  // Blog (Mode B: Supabase blog_articles + blog_article_blocks)
  // ---------------------------------------------------------------------------

  const [blogArticles, setBlogArticles] = useState<BlogArticleAdmin[]>([]);
  const [blogAuthors, setBlogAuthors] = useState<BlogAuthorAdmin[]>([]);
  const [blogCategories, setBlogCategories] = useState<BlogCategoryAdmin[]>([]);
  const [blogLoading, setBlogLoading] = useState(false);
  const [blogAuthorsLoading, setBlogAuthorsLoading] = useState(false);
  const [blogCategoriesLoading, setBlogCategoriesLoading] = useState(false);
  const [blogError, setBlogError] = useState<string | null>(null);

  const [blogDialogOpen, setBlogDialogOpen] = useState(false);
  const [blogDialogLoading, setBlogDialogLoading] = useState(false);
  const [blogSaving, setBlogSaving] = useState(false);
  const [blogEditor, setBlogEditor] = useState<BlogEditorState | null>(null);
  const [blogSlugError, setBlogSlugError] = useState<string | null>(null);

  const refreshBlog = useCallback(async () => {
    setBlogLoading(true);
    setBlogError(null);

    try {
      const res = await listAdminCmsBlogArticles(undefined);
      const items = Array.isArray(res.items) ? res.items : [];

      const isoToMs = (iso: string | null | undefined): number => {
        if (!iso) return 0;
        const ms = Date.parse(iso);
        return Number.isFinite(ms) ? ms : 0;
      };

      setBlogArticles(
        [...items].sort((a, b) => {
          const aUpdated = isoToMs((a as any)?.updated_at);
          const bUpdated = isoToMs((b as any)?.updated_at);
          if (aUpdated !== bUpdated) return bUpdated - aUpdated;

          const aCreated = isoToMs((a as any)?.created_at);
          const bCreated = isoToMs((b as any)?.created_at);
          if (aCreated !== bCreated) return bCreated - aCreated;

          return String((a as any)?.slug ?? "").localeCompare(String((b as any)?.slug ?? ""));
        }),
      );
    } catch (e) {
      setBlogArticles([]);
      setBlogError(humanAdminError(e));
    } finally {
      setBlogLoading(false);
    }
  }, []);

  const loadBlogAuthorsAndCategories = useCallback(async () => {
    try {
      setBlogAuthorsLoading(true);
      const authorsRes = await listAdminCmsBlogAuthors(undefined);
      setBlogAuthors(Array.isArray(authorsRes.items) ? authorsRes.items : []);
    } catch (e) {
      setBlogAuthors([]);
    } finally {
      setBlogAuthorsLoading(false);
    }

    try {
      setBlogCategoriesLoading(true);
      const categoriesRes = await listAdminCmsBlogCategories(undefined);
      setBlogCategories(
        Array.isArray(categoriesRes.items) ? categoriesRes.items : [],
      );
    } catch (e) {
      setBlogCategories([]);
    } finally {
      setBlogCategoriesLoading(false);
    }
  }, []);

  const openNewBlog = useCallback(() => {
    setBlogSlugError(null);
    setBlogEditor(emptyBlogEditor());
    setBlogDialogOpen(true);
    void loadBlogAuthorsAndCategories();
  }, [loadBlogAuthorsAndCategories]);

  const openBlog = useCallback(
    async (row: BlogArticleAdmin) => {
      setBlogSlugError(null);
      setBlogDialogOpen(true);
      setBlogDialogLoading(true);
      setBlogEditor(null);

      try {
        const [blocksRes] = await Promise.all([
          listAdminCmsBlogArticleBlocks(undefined, row.id),
          loadBlogAuthorsAndCategories(),
        ]);

        const blocks = apiBlocksToDrafts((blocksRes.items ?? []) as any);

        const isPublished = Boolean(row.is_published);
        setBlogEditor({
          id: row.id,
          slug: row.slug ?? "",

          is_published: isPublished,
          original_is_published: isPublished,
          published_at_local: isoToLocalInputValue(row.published_at),

          show_read_count: Boolean(row.show_read_count),
          read_count: typeof row.read_count === "number" ? row.read_count : 0,

          author_id: row.author_id ?? null,
          author_name: row.author_name ?? "",

          primary_category_id: row.primary_category_id ?? null,
          category: row.category ?? "",
          secondary_category_ids: Array.isArray(row.secondary_category_ids)
            ? row.secondary_category_ids
            : [],

          title_fr: row.title_fr ?? "",
          title_en: row.title_en ?? "",
          excerpt_fr: row.excerpt_fr ?? "",
          excerpt_en: row.excerpt_en ?? "",
          body_html_fr: row.body_html_fr ?? "",
          body_html_en: row.body_html_en ?? "",
          meta_title_fr: row.meta_title_fr ?? "",
          meta_title_en: row.meta_title_en ?? "",
          meta_description_fr: row.meta_description_fr ?? "",
          meta_description_en: row.meta_description_en ?? "",
          blocks,
        });
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
        setBlogDialogOpen(false);
      } finally {
        setBlogDialogLoading(false);
      }
    },
    [toast, loadBlogAuthorsAndCategories],
  );

  const deleteBlog = useCallback(
    async (row: BlogArticleAdmin) => {
      const label = String(row.title_fr || row.slug || "").trim() || row.slug;
      const ok = window.confirm(`Supprimer l’article "${label}" ?`);
      if (!ok) return;

      try {
        await deleteAdminCmsBlogArticle(undefined, row.id);
        toast({ title: "Supprimé", description: "Article supprimé." });
        await refreshBlog();
      } catch (e) {
        toast({
          title: "Erreur",
          description: humanAdminError(e),
          variant: "destructive",
        });
      }
    },
    [refreshBlog, toast],
  );

  const validateBlogSlug = useCallback(
    (nextSlugRaw: string, currentId?: string) => {
      const slug = normalizeSlug(nextSlugRaw);
      if (!slug) return { slug, error: "Slug requis." };
      if (!isValidSlug(slug))
        return {
          slug,
          error: "Format invalide (minuscules, chiffres, tirets).",
        };

      const exists = blogArticles.some(
        (a) => a.id !== currentId && a.slug === slug,
      );
      if (exists) return { slug, error: "Ce slug existe déjà." };

      return { slug, error: null };
    },
    [blogArticles],
  );

  const saveBlog = useCallback(async () => {
    if (!blogEditor) return;

    const { slug, error } = validateBlogSlug(blogEditor.slug, blogEditor.id);
    setBlogSlugError(error);
    if (error) return;

    const legacyTitle = (blogEditor.title_fr || blogEditor.title_en).trim();
    const legacyDescription = (
      blogEditor.meta_description_fr ||
      blogEditor.meta_description_en ||
      blogEditor.excerpt_fr
    ).trim();
    const legacyShort = blogEditor.excerpt_fr.trim();
    const legacyContent = blogEditor.body_html_fr.trim();

    const publishedAtOverride = blogEditor.is_published
      ? localInputValueToIso(blogEditor.published_at_local)
      : null;

    setBlogSaving(true);
    try {
      if (!blogEditor.id) {
        const created = await createAdminCmsBlogArticle(undefined, {
          slug,
          is_published: blogEditor.is_published,
          published_at: publishedAtOverride,

          title: legacyTitle,
          description_google: legacyDescription,
          short: legacyShort,
          content: legacyContent,

          title_fr: blogEditor.title_fr,
          title_en: blogEditor.title_en,
          excerpt_fr: blogEditor.excerpt_fr,
          excerpt_en: blogEditor.excerpt_en,
          body_html_fr: blogEditor.body_html_fr,
          body_html_en: blogEditor.body_html_en,

          meta_title_fr: blogEditor.meta_title_fr,
          meta_title_en: blogEditor.meta_title_en,
          meta_description_fr: blogEditor.meta_description_fr,
          meta_description_en: blogEditor.meta_description_en,

          author_name: blogEditor.author_name,
          author_id: blogEditor.author_id,
          category: blogEditor.category,
          primary_category_id: blogEditor.primary_category_id,
          secondary_category_ids: blogEditor.secondary_category_ids,

          show_read_count: blogEditor.show_read_count,
        });

        const id = created.item.id;
        await replaceAdminCmsBlogArticleBlocks(undefined, {
          articleId: id,
          blocks: blocksToApiInput(blogEditor.blocks),
        });
      } else {
        await updateAdminCmsBlogArticle(undefined, {
          id: blogEditor.id,
          slug,
          is_published: blogEditor.is_published,
          published_at: publishedAtOverride,

          title: legacyTitle,
          description_google: legacyDescription,
          short: legacyShort,
          content: legacyContent,

          title_fr: blogEditor.title_fr,
          title_en: blogEditor.title_en,
          excerpt_fr: blogEditor.excerpt_fr,
          excerpt_en: blogEditor.excerpt_en,
          body_html_fr: blogEditor.body_html_fr,
          body_html_en: blogEditor.body_html_en,

          meta_title_fr: blogEditor.meta_title_fr,
          meta_title_en: blogEditor.meta_title_en,
          meta_description_fr: blogEditor.meta_description_fr,
          meta_description_en: blogEditor.meta_description_en,

          author_name: blogEditor.author_name,
          author_id: blogEditor.author_id,
          category: blogEditor.category,
          primary_category_id: blogEditor.primary_category_id,
          secondary_category_ids: blogEditor.secondary_category_ids,

          show_read_count: blogEditor.show_read_count,
        });

        await replaceAdminCmsBlogArticleBlocks(undefined, {
          articleId: blogEditor.id,
          blocks: blocksToApiInput(blogEditor.blocks),
        });
      }

      toast({ title: "Enregistré", description: "Article mis à jour." });
      setBlogDialogOpen(false);
      await refreshBlog();
    } catch (e) {
      toast({
        title: "Erreur",
        description: humanAdminError(e),
        variant: "destructive",
      });
    } finally {
      setBlogSaving(false);
    }
  }, [blogEditor, refreshBlog, toast, validateBlogSlug]);

  const blogColumns = useMemo<ColumnDef<BlogArticleAdmin>[]>(() => {
    return [
      {
        accessorKey: "slug",
        header: "Slug",
        cell: ({ row }) => (
          <span className="font-semibold text-slate-900">
            {row.original.slug}
          </span>
        ),
      },
      {
        accessorKey: "title_fr",
        header: "Titre (FR)",
        cell: ({ row }) => (
          <span className="text-slate-800">{row.original.title_fr || "—"}</span>
        ),
      },
      {
        accessorKey: "is_published",
        header: "Publié",
        cell: ({ row }) => (
          <span
            className={
              row.original.is_published
                ? "text-emerald-700 font-semibold"
                : "text-slate-600"
            }
          >
            {row.original.is_published ? "Oui" : "Non"}
          </span>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Dernière MAJ",
        cell: ({ row }) => (
          <span className="text-slate-700">
            {row.original.updated_at
              ? row.original.updated_at.slice(0, 10)
              : "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => openBlog(row.original)}
            >
              <Edit3 className="h-4 w-4" />
              Éditer
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="text-red-700 hover:text-red-700"
              onClick={() => void deleteBlog(row.original)}
              aria-label="Supprimer l’article"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    ];
  }, [deleteBlog, openBlog]);

  useEffect(() => {
    void refreshBlog();
  }, [refreshBlog]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Contenu"
        description="Gérez les pages et le blog."
        actions={
          tab === "pages" ? (
            <Button className="gap-2" onClick={openNewPage}>
              <Plus className="h-4 w-4" />
              Nouvelle page
            </Button>
          ) : (
            <Button className="gap-2" onClick={openNewBlog}>
              <Plus className="h-4 w-4" />
              Nouvel article
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="blog">Blog</TabsTrigger>
        </TabsList>

        <TabsContent value="pages" className="space-y-4">
          {pagesLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : pagesError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {pagesError}
            </div>
          ) : (
            <AdminDataTable columns={pageColumns} data={pages} />
          )}
        </TabsContent>

        <TabsContent value="blog" className="space-y-4">
          {blogLoading ? (
            <div className="flex items-center justify-center py-10 text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : blogError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {blogError}
            </div>
          ) : (
            <AdminDataTable columns={blogColumns} data={blogArticles} />
          )}
        </TabsContent>
      </Tabs>

      {/* Page editor */}
      <Dialog open={pageDialogOpen} onOpenChange={setPageDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {pageEditor?.id ? "Modifier la page" : "Nouvelle page"}
            </DialogTitle>
          </DialogHeader>

          {pageDialogLoading || !pageEditor ? (
            <div className="flex items-center justify-center py-10 text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Page key (interne)</Label>
                  <Input
                    value={pageEditor.page_key}
                    onChange={(e) =>
                      setPageEditor((prev) =>
                        prev ? { ...prev, page_key: e.target.value } : prev,
                      )
                    }
                    placeholder="terms-of-use"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Slug (FR)</Label>
                  <Input
                    value={pageEditor.slug_fr}
                    onChange={(e) => {
                      const next = e.target.value;
                      const validated = validatePageSlug(
                        next,
                        pageEditor.id,
                        "slug_fr",
                      );
                      setPageSlugFrError(validated.error);
                      setPageEditor((prev) =>
                        prev
                          ? { ...prev, slug_fr: validated.slug || next }
                          : prev,
                      );
                    }}
                    placeholder="a-propos"
                  />
                  {pageSlugFrError ? (
                    <div className="text-xs text-red-700">
                      {pageSlugFrError}
                    </div>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Slug (EN)</Label>
                  <Input
                    value={pageEditor.slug_en}
                    onChange={(e) => {
                      const next = e.target.value;
                      const validated = validatePageSlug(
                        next,
                        pageEditor.id,
                        "slug_en",
                      );
                      setPageSlugEnError(validated.error);
                      setPageEditor((prev) =>
                        prev
                          ? { ...prev, slug_en: validated.slug || next }
                          : prev,
                      );
                    }}
                    placeholder="about"
                  />
                  {pageSlugEnError ? (
                    <div className="text-xs text-red-700">
                      {pageSlugEnError}
                    </div>
                  ) : null}
                </div>

                <div className="md:col-span-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      Publication
                    </div>
                    <div className="text-xs text-slate-600">
                      Rend la page visible côté public
                    </div>
                  </div>
                  <Switch
                    checked={pageEditor.status === "published"}
                    onCheckedChange={(checked) =>
                      setPageEditor((prev) =>
                        prev
                          ? { ...prev, status: checked ? "published" : "draft" }
                          : prev,
                      )
                    }
                  />
                </div>
              </div>

              <Tabs defaultValue="fr">
                <TabsList className="flex flex-wrap">
                  <TabsTrigger value="fr">FR</TabsTrigger>
                  <TabsTrigger value="en">EN</TabsTrigger>
                  <TabsTrigger value="seo">SEO</TabsTrigger>
                  <TabsTrigger value="og">OG</TabsTrigger>
                  <TabsTrigger value="advanced">Avancé</TabsTrigger>
                  <TabsTrigger value="blocks">Blocs</TabsTrigger>
                </TabsList>

                <TabsContent value="fr" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Titre (FR)</Label>
                    <Input
                      value={pageEditor.title_fr}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, title_fr: e.target.value } : prev,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Sous-titre (FR)</Label>
                    <Input
                      value={pageEditor.page_subtitle_fr}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev
                            ? { ...prev, page_subtitle_fr: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contenu (FR)</Label>
                    <RichTextEditor
                      value={pageEditor.body_html_fr}
                      onChange={(html) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, body_html_fr: html } : prev,
                        )
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="en" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title (EN)</Label>
                    <Input
                      value={pageEditor.title_en}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, title_en: e.target.value } : prev,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Subtitle (EN)</Label>
                    <Input
                      value={pageEditor.page_subtitle_en}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev
                            ? { ...prev, page_subtitle_en: e.target.value }
                            : prev,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Content (EN)</Label>
                    <RichTextEditor
                      value={pageEditor.body_html_en}
                      onChange={(html) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, body_html_en: html } : prev,
                        )
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="seo" className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SEO title (FR)</Label>
                      <Input
                        value={pageEditor.seo_title_fr}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, seo_title_fr: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SEO title (EN)</Label>
                      <Input
                        value={pageEditor.seo_title_en}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, seo_title_en: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>SEO description (FR)</Label>
                      <Textarea
                        value={pageEditor.seo_description_fr}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, seo_description_fr: e.target.value }
                              : prev,
                          )
                        }
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>SEO description (EN)</Label>
                      <Textarea
                        value={pageEditor.seo_description_en}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, seo_description_en: e.target.value }
                              : prev,
                          )
                        }
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Canonical URL (FR)</Label>
                      <Input
                        value={pageEditor.canonical_url_fr}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, canonical_url_fr: e.target.value }
                              : prev,
                          )
                        }
                        placeholder="https://sam.ma/content/a-propos"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Canonical URL (EN)</Label>
                      <Input
                        value={pageEditor.canonical_url_en}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, canonical_url_en: e.target.value }
                              : prev,
                          )
                        }
                        placeholder="https://sam.ma/en/content/about"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Robots</Label>
                    <Input
                      value={pageEditor.robots}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, robots: e.target.value } : prev,
                        )
                      }
                      placeholder="index,follow"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="og" className="space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>OG title (FR)</Label>
                      <Input
                        value={pageEditor.og_title_fr}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, og_title_fr: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>OG title (EN)</Label>
                      <Input
                        value={pageEditor.og_title_en}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, og_title_en: e.target.value }
                              : prev,
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>OG description (FR)</Label>
                      <Textarea
                        value={pageEditor.og_description_fr}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, og_description_fr: e.target.value }
                              : prev,
                          )
                        }
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>OG description (EN)</Label>
                      <Textarea
                        value={pageEditor.og_description_en}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? { ...prev, og_description_en: e.target.value }
                              : prev,
                          )
                        }
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>OG image URL</Label>
                    <Input
                      value={pageEditor.og_image_url}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev
                            ? { ...prev, og_image_url: e.target.value }
                            : prev,
                        )
                      }
                      placeholder="https://…/og.png"
                    />
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-6">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">
                        Table des matières
                      </div>
                      <div className="text-xs text-slate-600">
                        Active la structure "Sommaire" sur les pages légales
                      </div>
                    </div>
                    <Switch
                      checked={pageEditor.show_toc}
                      onCheckedChange={(checked) =>
                        setPageEditor((prev) =>
                          prev ? { ...prev, show_toc: checked } : prev,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>related_links (JSON)</Label>
                    <Textarea
                      value={pageEditor.related_links_json}
                      onChange={(e) =>
                        setPageEditor((prev) =>
                          prev
                            ? { ...prev, related_links_json: e.target.value }
                            : prev,
                        )
                      }
                      rows={6}
                    />
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>schema_jsonld_fr (JSON)</Label>
                      <Textarea
                        value={pageEditor.schema_jsonld_fr_json}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  schema_jsonld_fr_json: e.target.value,
                                }
                              : prev,
                          )
                        }
                        rows={8}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>schema_jsonld_en (JSON)</Label>
                      <Textarea
                        value={pageEditor.schema_jsonld_en_json}
                        onChange={(e) =>
                          setPageEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  schema_jsonld_en_json: e.target.value,
                                }
                              : prev,
                          )
                        }
                        rows={8}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="blocks" className="space-y-4">
                  <CmsBlocksEditor
                    blocks={pageEditor.blocks}
                    onChange={(blocks) =>
                      setPageEditor((prev) =>
                        prev ? { ...prev, blocks } : prev,
                      )
                    }
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPageDialogOpen(false)}
              disabled={pageSaving}
            >
              Annuler
            </Button>
            <Button
              className="gap-2"
              onClick={savePage}
              disabled={
                pageSaving ||
                !!pageSlugFrError ||
                !!pageSlugEnError ||
                pageDialogLoading
              }
            >
              {pageSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blog editor */}
      <Dialog open={blogDialogOpen} onOpenChange={setBlogDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {blogEditor?.id ? "Modifier l’article" : "Nouvel article"}
            </DialogTitle>
          </DialogHeader>

          {blogDialogLoading || !blogEditor ? (
            <div className="flex items-center justify-center py-10 text-slate-700">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Quick settings bar - compact row */}
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
                {/* Slug */}
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                  <Input
                    value={blogEditor.slug}
                    onChange={(e) => {
                      const next = e.target.value;
                      const validated = validateBlogSlug(next, blogEditor.id);
                      setBlogSlugError(validated.error);
                      setBlogEditor((prev) =>
                        prev ? { ...prev, slug: validated.slug || next } : prev,
                      );
                    }}
                    placeholder="slug-article"
                    className="h-8 text-sm bg-white"
                  />
                </div>

                {/* Publication toggle */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white">
                  <Switch
                    checked={blogEditor.is_published}
                    onCheckedChange={(checked) =>
                      setBlogEditor((prev) =>
                        prev ? { ...prev, is_published: checked } : prev,
                      )
                    }
                  />
                  <span className={`text-xs font-medium ${blogEditor.is_published ? "text-emerald-700" : "text-slate-500"}`}>
                    {blogEditor.is_published ? "Publié" : "Brouillon"}
                  </span>
                </div>

                {/* Read count toggle */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white">
                  <Eye className="h-4 w-4 text-slate-400" />
                  <Switch
                    checked={blogEditor.show_read_count}
                    onCheckedChange={(checked) =>
                      setBlogEditor((prev) =>
                        prev ? { ...prev, show_read_count: checked } : prev,
                      )
                    }
                  />
                  <span className="text-xs text-slate-500">{blogEditor.read_count}</span>
                </div>
              </div>

              {blogSlugError ? (
                <div className="text-xs text-red-700 -mt-2 px-1">{blogSlugError}</div>
              ) : null}

              {/* Metadata grid - compact */}
              <div className="grid gap-3 md:grid-cols-4">
                {/* Author */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <User className="h-3 w-3" />
                    Auteur
                  </Label>
                  {blogAuthorsLoading ? (
                    <div className="text-xs text-slate-400 py-1">Chargement...</div>
                  ) : (
                    <Select
                      value={blogEditor.author_id ?? "__none__"}
                      onValueChange={(value) =>
                        setBlogEditor((prev) =>
                          prev
                            ? value === "__none__"
                              ? { ...prev, author_id: null, author_name: "" }
                              : {
                                  ...prev,
                                  author_id: value,
                                  author_name: blogAuthors.find((a) => a.id === value)?.display_name ?? "",
                                }
                            : prev,
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Aucun" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucun</SelectItem>
                        {blogAuthors.map((author) => (
                          <SelectItem key={author.id} value={author.id}>
                            {author.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Primary Category */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Tag className="h-3 w-3" />
                    Catégorie
                  </Label>
                  {blogCategoriesLoading ? (
                    <div className="text-xs text-slate-400 py-1">Chargement...</div>
                  ) : (
                    <Select
                      value={blogEditor.primary_category_id ?? "__none__"}
                      onValueChange={(value) =>
                        setBlogEditor((prev) =>
                          prev
                            ? value === "__none__"
                              ? { ...prev, primary_category_id: null, category: "" }
                              : {
                                  ...prev,
                                  primary_category_id: value,
                                  category: blogCategories.find((c) => c.id === value)?.slug ?? "",
                                }
                            : prev,
                        )
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Aucune" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Aucune</SelectItem>
                        {blogCategories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Publication Date */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Date
                  </Label>
                  <Input
                    type="datetime-local"
                    value={blogEditor.published_at_local}
                    onChange={(e) =>
                      setBlogEditor((prev) =>
                        prev ? { ...prev, published_at_local: e.target.value } : prev,
                      )
                    }
                    disabled={!blogEditor.is_published}
                    className="h-8 text-sm disabled:opacity-50"
                  />
                </div>

                {/* Secondary Categories - Popover */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Tag className="h-3 w-3" />
                    Tags
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full h-8 text-sm justify-start font-normal">
                        {blogEditor.secondary_category_ids.length > 0
                          ? `${blogEditor.secondary_category_ids.length} sélectionné(s)`
                          : "Aucun tag"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="start">
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {blogCategories.length === 0 ? (
                          <div className="text-xs text-slate-500 py-2 text-center">Aucune catégorie</div>
                        ) : (
                          blogCategories.map((cat) => (
                            <div key={cat.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-50">
                              <Checkbox
                                id={`cat-${cat.id}`}
                                checked={blogEditor.secondary_category_ids.includes(cat.id)}
                                onCheckedChange={(checked) =>
                                  setBlogEditor((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          secondary_category_ids: checked
                                            ? [...prev.secondary_category_ids, cat.id]
                                            : prev.secondary_category_ids.filter((id) => id !== cat.id),
                                        }
                                      : prev,
                                  )
                                }
                              />
                              <label htmlFor={`cat-${cat.id}`} className="text-sm cursor-pointer flex-1">
                                {cat.title}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Tabs defaultValue="fr">
                <TabsList className="flex flex-wrap bg-slate-100 p-1 rounded-lg">
                  <TabsTrigger value="fr" className="gap-1.5 data-[state=active]:bg-white">
                    <span className={`w-2 h-2 rounded-full ${blogEditor.title_fr || blogEditor.body_html_fr ? "bg-emerald-500" : "bg-slate-300"}`} />
                    Français
                  </TabsTrigger>
                  <TabsTrigger value="en" className="gap-1.5 data-[state=active]:bg-white">
                    <span className={`w-2 h-2 rounded-full ${blogEditor.title_en || blogEditor.body_html_en ? "bg-emerald-500" : "bg-slate-300"}`} />
                    English
                  </TabsTrigger>
                  <TabsTrigger value="seo" className="gap-1.5 data-[state=active]:bg-white">
                    <Search className="h-3.5 w-3.5" />
                    SEO
                    {(blogEditor.meta_title_fr || blogEditor.meta_description_fr) && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="blocks" className="gap-1.5 data-[state=active]:bg-white">
                    <FileText className="h-3.5 w-3.5" />
                    Blocs
                    {blogEditor.blocks.length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{blogEditor.blocks.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="fr" className="space-y-4 mt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Titre</Label>
                      <Input
                        value={blogEditor.title_fr}
                        onChange={(e) =>
                          setBlogEditor((prev) =>
                            prev ? { ...prev, title_fr: e.target.value } : prev,
                          )
                        }
                        placeholder="Titre de l'article en français"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Extrait</Label>
                      <Textarea
                        value={blogEditor.excerpt_fr}
                        onChange={(e) =>
                          setBlogEditor((prev) =>
                            prev ? { ...prev, excerpt_fr: e.target.value } : prev,
                          )
                        }
                        rows={2}
                        placeholder="Résumé court pour les aperçus"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Contenu</Label>
                    <RichTextEditor
                      value={blogEditor.body_html_fr}
                      onChange={(html) =>
                        setBlogEditor((prev) =>
                          prev ? { ...prev, body_html_fr: html } : prev,
                        )
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="en" className="space-y-4 mt-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        value={blogEditor.title_en}
                        onChange={(e) =>
                          setBlogEditor((prev) =>
                            prev ? { ...prev, title_en: e.target.value } : prev,
                          )
                        }
                        placeholder="Article title in English"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Excerpt</Label>
                      <Textarea
                        value={blogEditor.excerpt_en}
                        onChange={(e) =>
                          setBlogEditor((prev) =>
                            prev ? { ...prev, excerpt_en: e.target.value } : prev,
                          )
                        }
                        rows={2}
                        placeholder="Short summary for previews"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <RichTextEditor
                      value={blogEditor.body_html_en}
                      onChange={(html) =>
                        setBlogEditor((prev) =>
                          prev ? { ...prev, body_html_en: html } : prev,
                        )
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="seo" className="space-y-4 mt-4">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Français</div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Meta title</Label>
                        <Input
                          value={blogEditor.meta_title_fr}
                          onChange={(e) =>
                            setBlogEditor((prev) =>
                              prev ? { ...prev, meta_title_fr: e.target.value } : prev,
                            )
                          }
                          placeholder={blogEditor.title_fr || "Titre SEO"}
                          className="h-8 text-sm"
                        />
                        <div className="text-[10px] text-slate-400">{blogEditor.meta_title_fr.length}/60 caractères</div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Meta description</Label>
                        <Textarea
                          value={blogEditor.meta_description_fr}
                          onChange={(e) =>
                            setBlogEditor((prev) =>
                              prev ? { ...prev, meta_description_fr: e.target.value } : prev,
                            )
                          }
                          rows={2}
                          placeholder={blogEditor.excerpt_fr || "Description pour Google"}
                          className="text-sm"
                        />
                        <div className="text-[10px] text-slate-400">{blogEditor.meta_description_fr.length}/160 caractères</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-4">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">English</div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2">
                        <Label className="text-xs">Meta title</Label>
                        <Input
                          value={blogEditor.meta_title_en}
                          onChange={(e) =>
                            setBlogEditor((prev) =>
                              prev ? { ...prev, meta_title_en: e.target.value } : prev,
                            )
                          }
                          placeholder={blogEditor.title_en || "SEO title"}
                          className="h-8 text-sm"
                        />
                        <div className="text-[10px] text-slate-400">{blogEditor.meta_title_en.length}/60 characters</div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Meta description</Label>
                        <Textarea
                          value={blogEditor.meta_description_en}
                          onChange={(e) =>
                            setBlogEditor((prev) =>
                              prev ? { ...prev, meta_description_en: e.target.value } : prev,
                            )
                          }
                          rows={2}
                          placeholder={blogEditor.excerpt_en || "Description for Google"}
                          className="text-sm"
                        />
                        <div className="text-[10px] text-slate-400">{blogEditor.meta_description_en.length}/160 characters</div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="blocks" className="space-y-4 mt-4">
                  <CmsBlocksEditor
                    blocks={blogEditor.blocks}
                    onChange={(blocks) =>
                      setBlogEditor((prev) =>
                        prev ? { ...prev, blocks } : prev,
                      )
                    }
                  />

                  {blogEditor.id ? <BlogPollStatsPanel articleId={blogEditor.id} /> : null}
                </TabsContent>
              </Tabs>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBlogDialogOpen(false)}
              disabled={blogSaving}
            >
              Annuler
            </Button>
            <Button
              className="gap-2"
              onClick={saveBlog}
              disabled={blogSaving || !!blogSlugError || blogDialogLoading}
            >
              {blogSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
