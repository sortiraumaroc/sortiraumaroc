import type { RequestHandler } from "express";
import type { Express } from "express";
import fs from "fs/promises";
import path from "path";

import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { requireAdminKey } from "./adminHelpers";
import { zBody, zParams } from "../lib/validate";
import { createRateLimiter } from "../middleware/rateLimiter";

const blogReadRateLimiter = createRateLimiter("blog-read", {
  windowMs: 60_000,
  maxRequests: 30,
});

const blogVoteRateLimiter = createRateLimiter("blog-vote", {
  windowMs: 60_000,
  maxRequests: 10,
});
import {
  updateFixedPageSchema,
  createBlogArticleSchema,
  updateBlogArticleSchema,
  voteBlogPollSchema,
  BlogSlugParams,
  BlogPollParams,
  ContentKeyParams,
  BlogArticleIdParams,
} from "../schemas/mysqlContent";
import {
  FIXED_CONTENT_PAGES,
  getFixedContentPageDefinition,
  type FixedContentPageKey,
} from "../../shared/fixedContentPages";

const log = createModuleLogger("mysqlContent");

type MysqlContentRow = {
  id: number;
  titre: string;
  contenu: string;
};

type MysqlBlogArticleRow = {
  blog_article_id: number;
  title: string;
  description_google: string;
  slug: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  place_id: number;
  blog_category_id: number;
  blog_author_id: number;
  date_creation: string; // ISO
  active: 0 | 1;
};

type MysqlBlogCategoryRow = {
  blog_category_id: number;
  name: string;
  title: string;
  slug: string;
  icon: string;
};

type MysqlBlogAuthorRow = {
  blog_author_id: number;
  name: string;
  title: string;
  description: string;
  img: string;
  email: string;
  password: string;
  status: 0 | 1;
};

type StoreShape = {
  content: MysqlContentRow[];
  blog_article: MysqlBlogArticleRow[];
  blog_category: MysqlBlogCategoryRow[];
  blog_author: MysqlBlogAuthorRow[];
};

const STORE_PATH = path.resolve(process.cwd(), "server", "data", "mysql-demo-store.json");

async function ensureStoreDir() {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function readStore(): Promise<StoreShape> {
  await ensureStoreDir();
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;

    return {
      content: Array.isArray(parsed.content) ? (parsed.content as MysqlContentRow[]) : [],
      blog_article: Array.isArray(parsed.blog_article) ? (parsed.blog_article as MysqlBlogArticleRow[]) : [],
      blog_category: Array.isArray(parsed.blog_category) ? (parsed.blog_category as MysqlBlogCategoryRow[]) : [],
      blog_author: Array.isArray(parsed.blog_author) ? (parsed.blog_author as MysqlBlogAuthorRow[]) : [],
    };
  } catch { /* intentional: store file may not exist */
    return { content: [], blog_article: [], blog_category: [], blog_author: [] };
  }
}

async function writeStore(next: StoreShape): Promise<void> {
  await ensureStoreDir();
  await fs.writeFile(STORE_PATH, JSON.stringify(next, null, 2), "utf8");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Number(v);
}

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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function ensureFixedContentRow(store: StoreShape, key: FixedContentPageKey): { store: StoreShape; row: MysqlContentRow } {
  const def = getFixedContentPageDefinition(key);
  if (!def) throw new Error("unknown_fixed_page");

  const existing = store.content.find((c) => c.id === def.contentId);
  if (existing) return { store, row: existing };

  const next: MysqlContentRow = { id: def.contentId, titre: def.label, contenu: "" };
  return { store: { ...store, content: [...store.content, next] }, row: next };
}

// ---------------------------------------------------------------------------
// ADMIN: Pages (table `content`) with fixed mapping
// ---------------------------------------------------------------------------

export const listAdminFixedPages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const store = await readStore();

  const items = FIXED_CONTENT_PAGES.map((p) => {
    const row = store.content.find((c) => c.id === p.contentId) ?? null;
    return {
      key: p.key,
      label: p.label,
      content_id: p.contentId,
      titre: row ? row.titre : "",
      exists: Boolean(row),
      updated_at: null,
    };
  });

  res.json({ items });
};

export const getAdminFixedPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const key = String(req.params.key || "").trim().toLowerCase();
  const def = getFixedContentPageDefinition(key);
  if (!def) return res.status(404).json({ error: "Not found" });

  const store = await readStore();
  const ensured = ensureFixedContentRow(store, def.key);
  if (ensured.store !== store) await writeStore(ensured.store);

  res.json({
    item: {
      key: def.key,
      label: def.label,
      id: ensured.row.id,
      titre: ensured.row.titre,
      contenu: ensured.row.contenu,
      updated_at: null,
    },
  });
};

export const updateAdminFixedPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const key = String(req.params.key || "").trim().toLowerCase();
  const def = getFixedContentPageDefinition(key);
  if (!def) return res.status(404).json({ error: "Not found" });

  const payload = isRecord(req.body) ? req.body : {};
  const titre = asString(payload.titre).trim();
  const contenu = asString(payload.contenu);

  const store = await readStore();
  const ensured = ensureFixedContentRow(store, def.key);

  const nextRow: MysqlContentRow = {
    ...ensured.row,
    titre,
    contenu,
  };

  const nextStore: StoreShape = {
    ...ensured.store,
    content: ensured.store.content.map((c) => (c.id === nextRow.id ? nextRow : c)),
  };

  await writeStore(nextStore);
  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// ADMIN: Blog (tables blog_article/blog_category/blog_author)
// ---------------------------------------------------------------------------

export const listAdminBlogCategories: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const store = await readStore();
  res.json({ items: store.blog_category });
};

export const listAdminBlogAuthors: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  const store = await readStore();
  res.json({ items: store.blog_author });
};

export const listAdminBlogArticles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const store = await readStore();

  const categoriesById = new Map(store.blog_category.map((c) => [c.blog_category_id, c] as const));
  const authorsById = new Map(store.blog_author.map((a) => [a.blog_author_id, a] as const));

  const items = store.blog_article
    .slice()
    .sort((a, b) => String(b.date_creation).localeCompare(String(a.date_creation)))
    .map((row) => {
      const category = categoriesById.get(row.blog_category_id) ?? null;
      const author = authorsById.get(row.blog_author_id) ?? null;

      return {
        ...row,
        category: category
          ? {
              blog_category_id: category.blog_category_id,
              title: category.title,
              slug: category.slug,
            }
          : null,
        author: author
          ? {
              blog_author_id: author.blog_author_id,
              name: author.name,
              title: author.title,
            }
          : null,
      };
    });

  res.json({ items });
};

export const createAdminBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const store = await readStore();
  if (!store.blog_category.length || !store.blog_author.length) {
    return res.status(400).json({
      error: "Impossible de créer un article : aucune catégorie ou aucun auteur disponible dans la base (blog_category/blog_author).",
    });
  }

  const payload = isRecord(req.body) ? req.body : {};
  const title = asString(payload.title).trim();
  const slug = normalizeSlug(asString(payload.slug));

  if (!title) return res.status(400).json({ error: "title is required" });
  if (!slug || !isValidSlug(slug)) return res.status(400).json({ error: "Invalid slug" });
  if (store.blog_article.some((a) => a.slug === slug)) return res.status(409).json({ error: "Slug already exists" });

  const maxId = store.blog_article.reduce((acc, it) => Math.max(acc, it.blog_article_id), 0);

  const blogCategoryId = asNumber(payload.blog_category_id) || store.blog_category[0]!.blog_category_id;
  const blogAuthorId = asNumber(payload.blog_author_id) || store.blog_author[0]!.blog_author_id;

  const next: MysqlBlogArticleRow = {
    blog_article_id: maxId + 1,
    title,
    slug,
    description_google: asString(payload.description_google).trim(),
    short: asString(payload.short),
    content: asString(payload.content),
    img: asString(payload.img).trim(),
    miniature: asString(payload.miniature).trim(),
    place_id: asNumber(payload.place_id) || 0,
    blog_category_id: blogCategoryId,
    blog_author_id: blogAuthorId,
    date_creation: new Date().toISOString(),
    active: payload.active ? 1 : 0,
  };

  const nextStore: StoreShape = { ...store, blog_article: [next, ...store.blog_article] };
  await writeStore(nextStore);

  res.json({ item: next });
};

export const updateAdminBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" });

  const store = await readStore();
  const existing = store.blog_article.find((a) => a.blog_article_id === id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const payload = isRecord(req.body) ? req.body : {};

  const title = asString(payload.title ?? existing.title).trim();
  const slug = normalizeSlug(asString(payload.slug ?? existing.slug));

  if (!title) return res.status(400).json({ error: "title is required" });
  if (!slug || !isValidSlug(slug)) return res.status(400).json({ error: "Invalid slug" });
  if (store.blog_article.some((a) => a.blog_article_id !== id && a.slug === slug)) {
    return res.status(409).json({ error: "Slug already exists" });
  }

  const nextActive = typeof payload.active === "boolean" ? (payload.active ? 1 : 0) : existing.active;

  const next: MysqlBlogArticleRow = {
    ...existing,
    title,
    slug,
    description_google: asString(payload.description_google ?? existing.description_google).trim(),
    short: asString(payload.short ?? existing.short),
    content: asString(payload.content ?? existing.content),
    img: asString(payload.img ?? existing.img).trim(),
    miniature: asString(payload.miniature ?? existing.miniature).trim(),
    blog_category_id: Number.isFinite(asNumber(payload.blog_category_id)) ? asNumber(payload.blog_category_id) : existing.blog_category_id,
    blog_author_id: Number.isFinite(asNumber(payload.blog_author_id)) ? asNumber(payload.blog_author_id) : existing.blog_author_id,
    active: nextActive,
  };

  const nextStore: StoreShape = {
    ...store,
    blog_article: store.blog_article.map((a) => (a.blog_article_id === id ? next : a)),
  };

  await writeStore(nextStore);
  res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// PUBLIC: list published blog articles
// ---------------------------------------------------------------------------

function mapPublicBlogListItem(row: any, lang: "fr" | "en") {
  return {
    slug: String(row.slug ?? ""),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    published_at: row.published_at ?? null,
    is_published: Boolean(row.is_published),
    title: String(row.title ?? ""),
    description_google: String(row.description_google ?? ""),
    short: String(row.short ?? ""),
    content: String(row.content ?? ""),
    img: String(row.img ?? ""),
    miniature: String(row.miniature ?? ""),
    title_fr: String(row.title_fr ?? ""),
    title_en: String(row.title_en ?? ""),
    excerpt_fr: String(row.excerpt_fr ?? ""),
    excerpt_en: String(row.excerpt_en ?? ""),
    meta_title_fr: String(row.meta_title_fr ?? ""),
    meta_title_en: String(row.meta_title_en ?? ""),
    meta_description_fr: String(row.meta_description_fr ?? ""),
    meta_description_en: String(row.meta_description_en ?? ""),
    author_name: String(row.author_name ?? ""),
    category: String(row.category ?? ""),
    resolved: {
      lang,
      title: String(lang === "en" ? row.title_en ?? "" : row.title_fr ?? ""),
      excerpt: String(lang === "en" ? row.excerpt_en ?? "" : row.excerpt_fr ?? ""),
      meta_title: String(lang === "en" ? row.meta_title_en ?? "" : row.meta_title_fr ?? ""),
      meta_description: String(lang === "en" ? row.meta_description_en ?? "" : row.meta_description_fr ?? ""),
    },
  };
}

export const listPublicBlogArticles: RequestHandler = async (req, res) => {
  const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim().toLowerCase() : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const safeLimit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  // MODE B (Supabase/Postgres)
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("blog_articles")
      .select(
        "slug,created_at,updated_at,published_at,is_published,title,description_google,short,content,img,miniature,title_fr,title_en,excerpt_fr,excerpt_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,author_name,category",
      )
      .eq("is_published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    if (!error && data) {
      const items = (data as any[]).map((row) => mapPublicBlogListItem(row, lang));
      return res.json({ items });
    }
  } catch (err) {
    log.warn({ err }, "blog list Supabase failed, falling back");
  }

  // MODE A fallback (JSON store)
  const store = await readStore();
  const items = store.blog_article
    .filter((a) => a.active === 1)
    .slice()
    .sort((a, b) => String(b.date_creation).localeCompare(String(a.date_creation)))
    .slice(0, safeLimit);

  res.json({ items });
};

// ---------------------------------------------------------------------------
// PUBLIC: author by slug + published articles
// ---------------------------------------------------------------------------

type PublicBlogAuthorV2 = {
  id: string;
  slug: string;
  display_name: string;
  bio_short: string;
  avatar_url: string | null;
  role: string;
  profile_url: string | null;
};

export const getPublicBlogAuthorBySlug: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  if (!slug) return res.status(400).json({ error: "slug is required" });

  const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim().toLowerCase() : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
  const safeLimit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.floor(limitRaw))) : 12;

  const pageRaw = typeof req.query.page === "string" ? Number(req.query.page) : 1;
  const safePage = Number.isFinite(pageRaw) ? Math.max(1, Math.floor(pageRaw)) : 1;

  // MODE B (Supabase/Postgres)
  try {
    const supabase = getAdminSupabase();

    const { data: authorData, error: authorErr } = await supabase
      .from("blog_authors")
      .select("id,slug,display_name,bio_short,avatar_url,role,profile_url,is_active")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (!authorErr && authorData) {
      const authorRow = authorData as any;
      const authorId = String(authorRow.id ?? "");
      if (!authorId) return res.status(404).json({ error: "Not found" });

      const from = (safePage - 1) * safeLimit;
      const to = from + safeLimit - 1;

      const { data, error, count } = await supabase
        .from("blog_articles")
        .select(
          "slug,created_at,updated_at,published_at,is_published,title,description_google,short,content,img,miniature,title_fr,title_en,excerpt_fr,excerpt_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,author_name,category",
          { count: "exact" },
        )
        .eq("is_published", true)
        .eq("author_id", authorId)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) return res.status(500).json({ error: error.message });

      const items = (data ?? []).map((row: any) => mapPublicBlogListItem(row, lang));

      const author: PublicBlogAuthorV2 = {
        id: authorId,
        slug: String(authorRow.slug ?? ""),
        display_name: String(authorRow.display_name ?? ""),
        bio_short: String(authorRow.bio_short ?? ""),
        avatar_url: typeof authorRow.avatar_url === "string" ? authorRow.avatar_url : null,
        role: String(authorRow.role ?? ""),
        profile_url: typeof authorRow.profile_url === "string" ? authorRow.profile_url : null,
      };

      return res.json({ author, items, page: safePage, limit: safeLimit, total: typeof count === "number" ? count : items.length });
    }

    if (authorErr && (authorErr as any).code === "PGRST116") {
      return res.status(404).json({ error: "Not found" });
    }
  } catch (err) {
    log.warn({ err }, "blog author Supabase failed, falling back");
  }

  // MODE A fallback (JSON store)
  const store = await readStore();
  const author = store.blog_author
    .filter((a) => a.status === 1)
    .map((a) => ({ row: a, slug: normalizeSlug(String(a.name || a.title || "")) }))
    .find((a) => a.slug === slug)?.row;

  if (!author) return res.status(404).json({ error: "Not found" });

  const all = store.blog_article
    .filter((a) => a.active === 1 && a.blog_author_id === author.blog_author_id)
    .slice()
    .sort((a, b) => String(b.date_creation).localeCompare(String(a.date_creation)));

  const start = (safePage - 1) * safeLimit;
  const items = all.slice(start, start + safeLimit);

  return res.json({
    author: {
      slug,
      display_name: String(author.name || author.title || "").trim(),
      bio_short: String(author.description || "").trim(),
      avatar_url: String(author.img || "").trim() || null,
      role: "",
      profile_url: null,
    },
    items,
    page: safePage,
    limit: safeLimit,
    total: all.length,
  });
};

// ---------------------------------------------------------------------------
// PUBLIC: blog article by slug (published only)
// ---------------------------------------------------------------------------

export const getPublicBlogArticleBySlug: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  if (!slug) return res.status(400).json({ error: "slug is required" });

  const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim().toLowerCase() : "";
  const lang = langRaw === "en" ? "en" : "fr";

  // MODE B (Supabase/Postgres)
  try {
    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("blog_articles")
      .select(
        "id,slug,created_at,updated_at,published_at,is_published,title,description_google,short,content,img,miniature,title_fr,title_en,excerpt_fr,excerpt_en,body_html_fr,body_html_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,author_name,category,show_read_count,read_count",
      )
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (!error && data) {
      const row = data as any;
      const articleId = String(row.id ?? "");

      const { data: blocksData, error: blocksErr } = articleId
        ? await supabase
            .from("blog_article_blocks")
            .select("id,sort_order,type,is_enabled,data,data_fr,data_en,created_at,updated_at")
            .eq("article_id", articleId)
            .eq("is_enabled", true)
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: true })
            .limit(500)
        : { data: [], error: null };

      if (blocksErr) return res.status(500).json({ error: blocksErr.message });

      const mergeData = (shared: unknown, localized: unknown) => {
        const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
        if (isPlainObject(shared) && isPlainObject(localized)) return { ...shared, ...localized };
        if (localized !== undefined && localized !== null) return localized;
        return shared;
      };

      const blocks = (blocksData ?? []).map((b: any) => {
        const shared = b.data ?? {};
        const localized = lang === "en" ? b.data_en ?? {} : b.data_fr ?? {};

        return {
          id: String(b.id ?? ""),
          sort_order: typeof b.sort_order === "number" ? b.sort_order : 0,
          type: String(b.type ?? ""),
          data: shared,
          data_fr: b.data_fr ?? {},
          data_en: b.data_en ?? {},
          resolved: {
            lang,
            data: mergeData(shared, localized),
          },
        };
      });

      const item = {
        slug: String(row.slug ?? ""),
        created_at: row.created_at ?? null,
        updated_at: row.updated_at ?? null,
        published_at: row.published_at ?? null,
        is_published: Boolean(row.is_published),
        // legacy/compat
        title: String(row.title ?? ""),
        description_google: String(row.description_google ?? ""),
        short: String(row.short ?? ""),
        content: String(row.content ?? ""),
        img: String(row.img ?? ""),
        miniature: String(row.miniature ?? ""),
        // bilingual
        title_fr: String(row.title_fr ?? ""),
        title_en: String(row.title_en ?? ""),
        excerpt_fr: String(row.excerpt_fr ?? ""),
        excerpt_en: String(row.excerpt_en ?? ""),
        body_html_fr: String(row.body_html_fr ?? ""),
        body_html_en: String(row.body_html_en ?? ""),
        meta_title_fr: String(row.meta_title_fr ?? ""),
        meta_title_en: String(row.meta_title_en ?? ""),
        meta_description_fr: String(row.meta_description_fr ?? ""),
        meta_description_en: String(row.meta_description_en ?? ""),
        author_name: String(row.author_name ?? ""),
        category: String(row.category ?? ""),

        show_read_count: Boolean(row.show_read_count),
        read_count: typeof row.read_count === "number" && Number.isFinite(row.read_count) ? Math.max(0, Math.floor(row.read_count)) : 0,

        blocks,
        resolved: {
          lang,
          title: String(lang === "en" ? row.title_en ?? "" : row.title_fr ?? ""),
          excerpt: String(lang === "en" ? row.excerpt_en ?? "" : row.excerpt_fr ?? ""),
          body_html: String(lang === "en" ? row.body_html_en ?? "" : row.body_html_fr ?? ""),
          meta_title: String(lang === "en" ? row.meta_title_en ?? "" : row.meta_title_fr ?? ""),
          meta_description: String(lang === "en" ? row.meta_description_en ?? "" : row.meta_description_fr ?? ""),
          blocks: blocks.map((blk: any) => ({ id: blk.id, sort_order: blk.sort_order, type: blk.type, data: blk.resolved.data })),
        },
      };

      return res.json({ item });
    }
  } catch (err) {
    log.warn({ err }, "blog article Supabase failed, falling back");
  }

  // MODE A fallback (JSON store)
  const store = await readStore();
  const row = store.blog_article.find((a) => a.slug === slug && a.active === 1);
  if (!row) return res.status(404).json({ error: "Not found" });

  res.json({ item: row });
};

// ---------------------------------------------------------------------------
// PUBLIC: increment read count (anti-spam handled client-side)
// ---------------------------------------------------------------------------

export const markPublicBlogArticleRead: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  if (!slug) return res.status(400).json({ error: "slug is required" });

  // MODE B (Supabase/Postgres)
  try {
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("blog_articles")
      .select("id,read_count,is_published")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (error || !data) return res.status(404).json({ error: "Not found" });

    const row = data as any;
    const id = String(row.id ?? "");
    if (!id) return res.status(404).json({ error: "Not found" });

    const current = typeof row.read_count === "number" && Number.isFinite(row.read_count) ? Math.max(0, Math.floor(row.read_count)) : 0;
    const next = current + 1;

    const { error: updateErr } = await supabase.from("blog_articles").update({ read_count: next }).eq("id", id);
    if (updateErr) return res.status(500).json({ error: updateErr.message });

    return res.json({ ok: true, read_count: next });
  } catch (err) {
    log.warn({ err }, "blog read count Supabase failed, falling back");
  }

  // MODE A fallback: read_count is not supported in the demo store.
  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// PUBLIC: Polls (vote + results)
// ---------------------------------------------------------------------------

type ResolvedPollBlock = {
  pollId: string;
  optionsCount: number;
};

function resolvePollBlockFromRows(args: { pollId: string; rows: any[] }): ResolvedPollBlock | null {
  const pollId = args.pollId;

  const asRecordLocal = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as any) : {});
  const asStringLocal = (v: unknown): string => (typeof v === "string" ? v : "");

  const row = args.rows.find((r) => asStringLocal(asRecordLocal(r.data).poll_id).trim() === pollId) ?? null;
  if (!row) return null;

  const fr = asRecordLocal(row.data_fr);
  const en = asRecordLocal(row.data_en);
  const optsFr = Array.isArray(fr.options) ? fr.options.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
  const optsEn = Array.isArray(en.options) ? en.options.map((v) => String(v ?? "").trim()).filter(Boolean) : [];
  const optionsCount = Math.max(optsFr.length, optsEn.length);

  if (optionsCount < 2) return null;

  return { pollId, optionsCount };
}

async function computePollResults(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  articleId: string;
  pollId: string;
  userId?: string | null;
}): Promise<{ total_votes: number; counts: Array<{ option_index: number; count: number; percent: number }>; my_vote: number | null }> {
  const { supabase, articleId, pollId } = args;

  const { data: votesData, error: votesErr } = await supabase
    .from("blog_poll_votes")
    .select("option_index")
    .eq("article_id", articleId)
    .eq("poll_id", pollId)
    .limit(10000);

  if (votesErr) throw new Error(votesErr.message);

  const raw = Array.isArray(votesData) ? votesData : [];
  const countsMap = new Map<number, number>();
  for (const r of raw) {
    const idx = (r as any)?.option_index;
    if (typeof idx === "number" && Number.isFinite(idx)) {
      const key = Math.max(0, Math.floor(idx));
      countsMap.set(key, (countsMap.get(key) ?? 0) + 1);
    }
  }

  const total = raw.length;
  const counts = Array.from(countsMap.entries())
    .map(([option_index, count]) => ({ option_index, count, percent: total ? Math.round((count / total) * 100) : 0 }))
    .sort((a, b) => a.option_index - b.option_index);

  let myVote: number | null = null;
  if (args.userId) {
    const { data: myData } = await supabase
      .from("blog_poll_votes")
      .select("option_index")
      .eq("article_id", articleId)
      .eq("poll_id", pollId)
      .eq("user_id", args.userId)
      .limit(1);

    const row = Array.isArray(myData) ? (myData[0] as any) : null;
    if (row && typeof row.option_index === "number" && Number.isFinite(row.option_index)) {
      myVote = Math.max(0, Math.floor(row.option_index));
    }
  }

  return { total_votes: total, counts, my_vote: myVote };
}

export const votePublicBlogPoll: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  const pollId = String(req.params.pollId || "").trim();
  if (!slug) return res.status(400).json({ error: "slug is required" });
  if (!pollId || !isUuid(pollId)) return res.status(400).json({ error: "pollId is invalid" });

  // Auth required
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "unauthorized" });

  const payload = isRecord(req.body) ? req.body : {};
  const optionIndexRaw = (payload as any).option_index;

  // Optional (bonus): extra signal, not used for uniqueness.
  const sessionIdRaw = typeof (payload as any).session_id === "string" ? (payload as any).session_id.trim() : "";
  const sessionId = sessionIdRaw && isUuid(sessionIdRaw) ? sessionIdRaw : null;

  const optionIndex = typeof optionIndexRaw === "number" && Number.isFinite(optionIndexRaw) ? Math.max(0, Math.floor(optionIndexRaw)) : NaN;
  if (!Number.isFinite(optionIndex)) return res.status(400).json({ error: "option_index is required" });

  try {
    const supabase = getAdminSupabase();

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) return res.status(401).json({ error: "unauthorized" });

    const userId = typeof userData.user.id === "string" ? userData.user.id.trim() : "";
    if (!userId || !isUuid(userId)) return res.status(401).json({ error: "unauthorized" });

    const { data: article, error: artErr } = await supabase
      .from("blog_articles")
      .select("id")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (artErr || !article) return res.status(404).json({ error: "Not found" });

    const articleId = String((article as any).id ?? "");
    if (!articleId) return res.status(404).json({ error: "Not found" });

    const { data: blocksData, error: blocksErr } = await supabase
      .from("blog_article_blocks")
      .select("id,type,is_enabled,data,data_fr,data_en")
      .eq("article_id", articleId)
      .eq("type", "poll")
      .eq("is_enabled", true)
      .limit(100);

    if (blocksErr) return res.status(500).json({ error: blocksErr.message });

    const poll = resolvePollBlockFromRows({ pollId, rows: blocksData ?? [] });
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    if (optionIndex < 0 || optionIndex >= poll.optionsCount) {
      return res.status(400).json({ error: "option_index out of bounds" });
    }

    const { data: existing } = await supabase
      .from("blog_poll_votes")
      .select("option_index")
      .eq("article_id", articleId)
      .eq("poll_id", pollId)
      .eq("user_id", userId)
      .limit(1);

    if (Array.isArray(existing) && existing.length) {
      const results = await computePollResults({ supabase, articleId, pollId, userId });
      return res.json({ ok: true, already_voted: true, ...results });
    }

    const { error: insertErr } = await supabase.from("blog_poll_votes").insert({
      article_id: articleId,
      poll_id: pollId,
      user_id: userId,
      ...(sessionId ? { session_id: sessionId } : {}),
      option_index: optionIndex,
    });

    if (insertErr) {
      const results = await computePollResults({ supabase, articleId, pollId, userId });
      return res.json({ ok: true, already_voted: true, ...results });
    }

    const results = await computePollResults({ supabase, articleId, pollId, userId });
    return res.json({ ok: true, already_voted: false, ...results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
  }
};

export const getPublicBlogPollResults: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  const pollId = String(req.params.pollId || "").trim();
  if (!slug) return res.status(400).json({ error: "slug is required" });
  if (!pollId || !isUuid(pollId)) return res.status(400).json({ error: "pollId is invalid" });

  // Optional auth: when logged in, we can return my_vote.
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";

  try {
    const supabase = getAdminSupabase();

    let userId: string | null = null;
    if (token) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (!userErr && userData.user) {
        const uid = typeof userData.user.id === "string" ? userData.user.id.trim() : "";
        userId = uid && isUuid(uid) ? uid : null;
      }
    }

    const { data: article, error: artErr } = await supabase
      .from("blog_articles")
      .select("id")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (artErr || !article) return res.status(404).json({ error: "Not found" });

    const articleId = String((article as any).id ?? "");
    if (!articleId) return res.status(404).json({ error: "Not found" });

    const { data: blocksData, error: blocksErr } = await supabase
      .from("blog_article_blocks")
      .select("id,type,is_enabled,data,data_fr,data_en")
      .eq("article_id", articleId)
      .eq("type", "poll")
      .eq("is_enabled", true)
      .limit(100);

    if (blocksErr) return res.status(500).json({ error: blocksErr.message });

    const poll = resolvePollBlockFromRows({ pollId, rows: blocksData ?? [] });
    if (!poll) return res.status(404).json({ error: "Poll not found" });

    const results = await computePollResults({ supabase, articleId, pollId, userId });
    return res.json({ ok: true, ...results });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "Server error" });
  }
};

// ---------------------------------------------------------------------------
// PUBLIC: related articles by category (simple)
// ---------------------------------------------------------------------------

export const listPublicBlogRelatedArticles: RequestHandler = async (req, res) => {
  const slug = normalizeSlug(String(req.params.slug || ""));
  if (!slug) return res.status(400).json({ error: "slug is required" });

  const langRaw = typeof req.query.lang === "string" ? req.query.lang.trim().toLowerCase() : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 6;
  const safeLimit = Number.isFinite(limitRaw) ? Math.min(12, Math.max(1, Math.floor(limitRaw))) : 6;

  // MODE B (Supabase/Postgres)
  try {
    const supabase = getAdminSupabase();

    const { data: current, error: currentErr } = await supabase
      .from("blog_articles")
      .select("slug,category")
      .eq("slug", slug)
      .eq("is_published", true)
      .single();

    if (currentErr || !current) return res.json({ items: [] });

    const category = String((current as any).category ?? "").trim();
    if (!category) return res.json({ items: [] });

    const { data, error } = await supabase
      .from("blog_articles")
      .select(
        "slug,created_at,updated_at,published_at,is_published,title,description_google,short,content,img,miniature,title_fr,title_en,excerpt_fr,excerpt_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,author_name,category",
      )
      .eq("is_published", true)
      .eq("category", category)
      .neq("slug", slug)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(safeLimit);

    if (!error && data) {
      const items = (data as any[]).map((row) => mapPublicBlogListItem(row, lang));
      return res.json({ items });
    }
  } catch (err) {
    log.warn({ err }, "blog related Supabase failed, falling back");
  }

  // MODE A fallback (JSON store)
  const store = await readStore();
  const current = store.blog_article.find((a) => a.slug === slug && a.active === 1);
  if (!current) return res.json({ items: [] });

  const items = store.blog_article
    .filter((a) => a.active === 1 && a.slug !== slug && a.blog_category_id === current.blog_category_id)
    .slice()
    .sort((a, b) => String(b.date_creation).localeCompare(String(a.date_creation)))
    .slice(0, safeLimit);

  return res.json({ items });
};

// ---------------------------------------------------------------------------
// Register routes
// ---------------------------------------------------------------------------

export function registerMysqlContentRoutes(app: Express) {
  // Public blog routes
  app.get("/api/public/blog", listPublicBlogArticles);
  app.get("/api/public/blog/author/:slug", zParams(BlogSlugParams), getPublicBlogAuthorBySlug);
  app.get("/api/public/blog/:slug", zParams(BlogSlugParams), getPublicBlogArticleBySlug);
  app.get("/api/public/blog/:slug/related", zParams(BlogSlugParams), listPublicBlogRelatedArticles);
  app.post("/api/public/blog/:slug/read", zParams(BlogSlugParams), blogReadRateLimiter, markPublicBlogArticleRead);
  app.post("/api/public/blog/:slug/polls/:pollId/vote", zParams(BlogPollParams), blogVoteRateLimiter, zBody(voteBlogPollSchema), votePublicBlogPoll);
  app.post("/api/public/blog/:slug/polls/:pollId/results", zParams(BlogPollParams), blogReadRateLimiter, getPublicBlogPollResults);

  // Admin content routes
  app.get("/api/admin/mysql/content/pages", listAdminFixedPages);
  app.get("/api/admin/mysql/content/pages/:key", zParams(ContentKeyParams), getAdminFixedPage);
  app.post("/api/admin/mysql/content/pages/:key/update", zParams(ContentKeyParams), zBody(updateFixedPageSchema), updateAdminFixedPage);
  app.get("/api/admin/mysql/blog/categories", listAdminBlogCategories);
  app.get("/api/admin/mysql/blog/authors", listAdminBlogAuthors);
  app.get("/api/admin/mysql/blog/articles", listAdminBlogArticles);
  app.post("/api/admin/mysql/blog/articles", zBody(createBlogArticleSchema), createAdminBlogArticle);
  app.post("/api/admin/mysql/blog/articles/:id/update", zParams(BlogArticleIdParams), zBody(updateBlogArticleSchema), updateAdminBlogArticle);
}
