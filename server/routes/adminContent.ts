/**
 * Admin Content Routes — CMS pages, FAQ articles, blog management.
 *
 * Extracted from the monolithic admin.ts (~2,430 lines).
 * Handles content pages, FAQ articles, CMS blog (articles, authors, categories,
 * blocks, polls, images, documents), and their public endpoints.
 */

import type { RequestHandler } from "express";
import {
  requireAdminKey,
  isRecord,
  asString,
  asNumber,
  asStringArray,
  getAdminSupabase,
  getAuditActorInfo,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("adminContent");

type ContentPageRow = {
  id: string;

  // Stable internal key + public slugs
  page_key: string;
  slug: string;
  slug_fr: string;
  slug_en: string;

  // status
  status: "draft" | "published" | string;
  is_published: boolean;

  // legacy/compat
  title: string;
  body_markdown: string;

  created_at: string;
  updated_at: string;

  // UI
  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;

  // legacy html (still supported)
  body_html_fr: string;
  body_html_en: string;

  // SEO (preferred)
  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  // SEO legacy (compat)
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;

  // OG
  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string | null;

  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  show_toc: boolean;
  related_links: unknown;

  schema_jsonld_fr: unknown;
  schema_jsonld_en: unknown;
};

type FaqArticleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  category: string | null;
  display_order: number;
  title: string;
  body: string;
  question_fr: string;
  question_en: string;
  answer_html_fr: string;
  answer_html_en: string;
  tags: string[] | null;
};

export const listAdminContentPages: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_pages")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as ContentPageRow[] });
};

export const createAdminContentPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = asString(req.body.slug);

  // New: stable key + locale slugs
  const pageKey = asString(req.body.page_key) ?? null;
  const slugFr = asString(req.body.slug_fr) ?? slug ?? null;
  const slugEn = asString(req.body.slug_en) ?? slug ?? null;

  // status
  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;
  const statusRaw = asString(req.body.status);
  const status =
    statusRaw === "published" || statusRaw === "draft"
      ? statusRaw
      : isPublished
        ? "published"
        : "draft";

  if (!slug) return res.status(400).json({ error: "Slug requis" });
  if (!slugFr) return res.status(400).json({ error: "Slug français requis" });
  if (!slugEn) return res.status(400).json({ error: "Slug anglais requis" });

  // Legacy fields (kept for backward compatibility)
  const legacyTitle = asString(req.body.title);
  const legacyBodyMarkdown = asString(req.body.body_markdown) ?? "";

  // New bilingual fields
  const titleFr = asString(req.body.title_fr) ?? "";
  const titleEn = asString(req.body.title_en) ?? "";
  const subtitleFr = asString(req.body.page_subtitle_fr) ?? "";
  const subtitleEn = asString(req.body.page_subtitle_en) ?? "";

  const bodyHtmlFr = asString(req.body.body_html_fr) ?? "";
  const bodyHtmlEn = asString(req.body.body_html_en) ?? "";

  // SEO (preferred)
  const seoTitleFr = asString(req.body.seo_title_fr) ?? "";
  const seoTitleEn = asString(req.body.seo_title_en) ?? "";
  const seoDescriptionFr = asString(req.body.seo_description_fr) ?? "";
  const seoDescriptionEn = asString(req.body.seo_description_en) ?? "";

  // SEO legacy (compat)
  const metaTitleFr = asString(req.body.meta_title_fr) ?? "";
  const metaTitleEn = asString(req.body.meta_title_en) ?? "";
  const metaDescriptionFr = asString(req.body.meta_description_fr) ?? "";
  const metaDescriptionEn = asString(req.body.meta_description_en) ?? "";

  // OG
  const ogTitleFr = asString(req.body.og_title_fr) ?? "";
  const ogTitleEn = asString(req.body.og_title_en) ?? "";
  const ogDescriptionFr = asString(req.body.og_description_fr) ?? "";
  const ogDescriptionEn = asString(req.body.og_description_en) ?? "";
  const ogImageUrl = asString(req.body.og_image_url);

  const canonicalUrlFr = asString(req.body.canonical_url_fr) ?? "";
  const canonicalUrlEn = asString(req.body.canonical_url_en) ?? "";
  const robots = asString(req.body.robots) ?? "";

  const showToc =
    typeof req.body.show_toc === "boolean" ? req.body.show_toc : false;
  const relatedLinks = req.body.related_links ?? [];
  const schemaJsonLdFr = req.body.schema_jsonld_fr ?? null;
  const schemaJsonLdEn = req.body.schema_jsonld_en ?? null;

  const title = (titleFr || titleEn || legacyTitle || "").trim();
  if (!title)
    return res.status(400).json({ error: "Titre requis (title_fr ou title)" });

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("content_pages")
    .insert({
      // Keep legacy slug aligned with FR slug for backward compatibility.
      slug: slugFr,
      page_key: pageKey ?? slugFr,
      slug_fr: slugFr,
      slug_en: slugEn,
      status,
      title,
      body_markdown: legacyBodyMarkdown,
      is_published: isPublished,
      title_fr: titleFr,
      title_en: titleEn,
      page_subtitle_fr: subtitleFr,
      page_subtitle_en: subtitleEn,
      body_html_fr: bodyHtmlFr,
      body_html_en: bodyHtmlEn,
      seo_title_fr: seoTitleFr,
      seo_title_en: seoTitleEn,
      seo_description_fr: seoDescriptionFr,
      seo_description_en: seoDescriptionEn,
      meta_title_fr: metaTitleFr,
      meta_title_en: metaTitleEn,
      meta_description_fr: metaDescriptionFr,
      meta_description_en: metaDescriptionEn,
      og_title_fr: ogTitleFr,
      og_title_en: ogTitleEn,
      og_description_fr: ogDescriptionFr,
      og_description_en: ogDescriptionEn,
      og_image_url: ogImageUrl ?? null,
      canonical_url_fr: canonicalUrlFr,
      canonical_url_en: canonicalUrlEn,
      robots,
      show_toc: showToc,
      related_links: relatedLinks,
      schema_jsonld_fr: schemaJsonLdFr,
      schema_jsonld_en: schemaJsonLdEn,
      updated_at: now,
      created_at: now,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.page.create",
    entity_type: "content_pages",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, is_published: isPublished, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ item: data as ContentPageRow });
};

export const updateAdminContentPage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = asString(req.body.slug); // legacy
  const pageKey = asString(req.body.page_key);
  const slugFr = asString(req.body.slug_fr);
  const slugEn = asString(req.body.slug_en);
  const statusRaw = asString(req.body.status);
  const status =
    statusRaw === "published" || statusRaw === "draft" ? statusRaw : undefined;

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBodyMarkdown = asString(req.body.body_markdown);

  // New bilingual fields
  const titleFr = asString(req.body.title_fr);
  const titleEn = asString(req.body.title_en);
  const subtitleFr = asString(req.body.page_subtitle_fr);
  const subtitleEn = asString(req.body.page_subtitle_en);

  const bodyHtmlFr = asString(req.body.body_html_fr);
  const bodyHtmlEn = asString(req.body.body_html_en);

  const seoTitleFr = asString(req.body.seo_title_fr);
  const seoTitleEn = asString(req.body.seo_title_en);
  const seoDescriptionFr = asString(req.body.seo_description_fr);
  const seoDescriptionEn = asString(req.body.seo_description_en);

  const metaTitleFr = asString(req.body.meta_title_fr);
  const metaTitleEn = asString(req.body.meta_title_en);
  const metaDescriptionFr = asString(req.body.meta_description_fr);
  const metaDescriptionEn = asString(req.body.meta_description_en);

  const ogTitleFr = asString(req.body.og_title_fr);
  const ogTitleEn = asString(req.body.og_title_en);
  const ogDescriptionFr = asString(req.body.og_description_fr);
  const ogDescriptionEn = asString(req.body.og_description_en);
  const ogImageUrl = asString(req.body.og_image_url);

  const canonicalUrlFr = asString(req.body.canonical_url_fr);
  const canonicalUrlEn = asString(req.body.canonical_url_en);
  const robots = asString(req.body.robots);

  const showToc =
    typeof req.body.show_toc === "boolean" ? req.body.show_toc : undefined;
  const relatedLinks = req.body.related_links;
  const schemaJsonLdFr = req.body.schema_jsonld_fr;
  const schemaJsonLdEn = req.body.schema_jsonld_en;

  const isPublished =
    typeof req.body.is_published === "boolean"
      ? req.body.is_published
      : undefined;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (pageKey !== undefined) patch.page_key = pageKey;

  // Legacy slug support (keep), but prefer slug_fr as the public slug.
  if (slugFr !== undefined) {
    patch.slug_fr = slugFr;
    patch.slug = slugFr;
  } else if (slug !== undefined) {
    patch.slug = slug;
  }

  if (slugEn !== undefined) patch.slug_en = slugEn;
  if (status !== undefined) patch.status = status;

  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyBodyMarkdown !== undefined)
    patch.body_markdown = legacyBodyMarkdown;

  if (titleFr !== undefined) patch.title_fr = titleFr;
  if (titleEn !== undefined) patch.title_en = titleEn;
  if (subtitleFr !== undefined) patch.page_subtitle_fr = subtitleFr;
  if (subtitleEn !== undefined) patch.page_subtitle_en = subtitleEn;

  if (bodyHtmlFr !== undefined) patch.body_html_fr = bodyHtmlFr;
  if (bodyHtmlEn !== undefined) patch.body_html_en = bodyHtmlEn;

  if (seoTitleFr !== undefined) patch.seo_title_fr = seoTitleFr;
  if (seoTitleEn !== undefined) patch.seo_title_en = seoTitleEn;
  if (seoDescriptionFr !== undefined)
    patch.seo_description_fr = seoDescriptionFr;
  if (seoDescriptionEn !== undefined)
    patch.seo_description_en = seoDescriptionEn;

  if (metaTitleFr !== undefined) patch.meta_title_fr = metaTitleFr;
  if (metaTitleEn !== undefined) patch.meta_title_en = metaTitleEn;
  if (metaDescriptionFr !== undefined)
    patch.meta_description_fr = metaDescriptionFr;
  if (metaDescriptionEn !== undefined)
    patch.meta_description_en = metaDescriptionEn;

  if (ogTitleFr !== undefined) patch.og_title_fr = ogTitleFr;
  if (ogTitleEn !== undefined) patch.og_title_en = ogTitleEn;
  if (ogDescriptionFr !== undefined) patch.og_description_fr = ogDescriptionFr;
  if (ogDescriptionEn !== undefined) patch.og_description_en = ogDescriptionEn;
  if (ogImageUrl !== undefined) patch.og_image_url = ogImageUrl || null;

  if (canonicalUrlFr !== undefined) patch.canonical_url_fr = canonicalUrlFr;
  if (canonicalUrlEn !== undefined) patch.canonical_url_en = canonicalUrlEn;
  if (robots !== undefined) patch.robots = robots;

  if (showToc !== undefined) patch.show_toc = showToc;
  if (relatedLinks !== undefined) patch.related_links = relatedLinks;
  if (schemaJsonLdFr !== undefined) patch.schema_jsonld_fr = schemaJsonLdFr;
  if (schemaJsonLdEn !== undefined) patch.schema_jsonld_en = schemaJsonLdEn;

  if (isPublished !== undefined) patch.is_published = isPublished;

  // Keep legacy title in sync if bilingual title changes but legacy title wasn't explicitly sent.
  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (titleFr !== undefined || titleEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (titleFr ?? "").trim() || (titleEn ?? "").trim() || "";
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_pages")
    .update(patch)
    .eq("id", id)
    .select("*");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.page.update",
    entity_type: "content_pages",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

type ContentPageBlockRow = {
  id: string;
  page_id: string;
  sort_order: number;
  type: string;
  is_enabled: boolean;
  data: unknown;
  data_fr: unknown;
  data_en: unknown;
  created_at: string;
  updated_at: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeBlockData(shared: unknown, localized: unknown): unknown {
  if (isPlainObject(shared) && isPlainObject(localized))
    return { ...shared, ...localized };
  if (localized !== undefined && localized !== null) return localized;
  return shared;
}

export const listAdminContentPageBlocks: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const pageId = typeof req.params.id === "string" ? req.params.id : "";
  if (!pageId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("content_page_blocks")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as ContentPageBlockRow[] });
};

export const replaceAdminContentPageBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const pageId = typeof req.params.id === "string" ? req.params.id : "";
  if (!pageId) return res.status(400).json({ error: "Identifiant requis" });

  const body = req.body;
  const blocksRaw = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.blocks)
      ? body.blocks
      : null;
  if (!blocksRaw)
    return res.status(400).json({ error: "Tableau de blocs requis" });

  const now = new Date().toISOString();
  const blocks = blocksRaw
    .map((b) => (isRecord(b) ? b : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .map((b, idx) => {
      const type = asString(b.type) ?? "";
      const isEnabled = typeof b.is_enabled === "boolean" ? b.is_enabled : true;
      const data = b.data !== undefined ? b.data : {};
      const dataFr = b.data_fr !== undefined ? b.data_fr : {};
      const dataEn = b.data_en !== undefined ? b.data_en : {};

      return {
        page_id: pageId,
        sort_order: idx,
        type,
        is_enabled: isEnabled,
        data,
        data_fr: dataFr,
        data_en: dataEn,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((b) => b.type);

  const supabase = getAdminSupabase();

  const { error: deleteErr } = await supabase
    .from("content_page_blocks")
    .delete()
    .eq("page_id", pageId);
  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  if (blocks.length) {
    const { error: insertErr } = await supabase
      .from("content_page_blocks")
      .insert(blocks);
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.page.blocks.replace",
    entity_type: "content_pages",
    entity_id: pageId,
    metadata: { count: blocks.length, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const listAdminFaqArticles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("faq_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as FaqArticleRow[] });
};

export const createAdminFaqArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBody = asString(req.body.body) ?? "";

  // New bilingual
  const questionFr = asString(req.body.question_fr) ?? "";
  const questionEn = asString(req.body.question_en) ?? "";
  const answerHtmlFr = asString(req.body.answer_html_fr) ?? "";
  const answerHtmlEn = asString(req.body.answer_html_en) ?? "";

  const category = asString(req.body.category) ?? "reservations";
  const displayOrder =
    typeof req.body.display_order === "number" &&
    Number.isFinite(req.body.display_order)
      ? req.body.display_order
      : 0;
  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.filter((t) => typeof t === "string")
    : [];

  const title = (questionFr || questionEn || legacyTitle || "").trim();
  if (!title)
    return res.status(400).json({ error: "Question requise (question_fr ou title)" });

  const body = (answerHtmlFr || legacyBody || "").trim();

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("faq_articles")
    .insert({
      title,
      body,
      category,
      display_order: displayOrder,
      question_fr: questionFr,
      question_en: questionEn,
      answer_html_fr: answerHtmlFr,
      answer_html_en: answerHtmlEn,
      is_published: isPublished,
      tags,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.faq.create",
    entity_type: "faq_articles",
    entity_id: (data as any)?.id ?? null,
    metadata: { is_published: isPublished, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ item: data as FaqArticleRow });
};

export const updateAdminFaqArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  // Legacy
  const legacyTitle = asString(req.body.title);
  const legacyBody = asString(req.body.body);

  // New bilingual
  const questionFr = asString(req.body.question_fr);
  const questionEn = asString(req.body.question_en);
  const answerHtmlFr = asString(req.body.answer_html_fr);
  const answerHtmlEn = asString(req.body.answer_html_en);

  const category = asString(req.body.category);
  const displayOrder =
    typeof req.body.display_order === "number" &&
    Number.isFinite(req.body.display_order)
      ? req.body.display_order
      : undefined;
  const isPublished =
    typeof req.body.is_published === "boolean"
      ? req.body.is_published
      : undefined;
  const tags = Array.isArray(req.body.tags)
    ? req.body.tags.filter((t) => typeof t === "string")
    : undefined;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyBody !== undefined) patch.body = legacyBody;

  if (questionFr !== undefined) patch.question_fr = questionFr;
  if (questionEn !== undefined) patch.question_en = questionEn;
  if (answerHtmlFr !== undefined) patch.answer_html_fr = answerHtmlFr;
  if (answerHtmlEn !== undefined) patch.answer_html_en = answerHtmlEn;

  if (category !== undefined) patch.category = category;
  if (displayOrder !== undefined) patch.display_order = displayOrder;
  if (isPublished !== undefined) patch.is_published = isPublished;
  if (tags !== undefined) patch.tags = tags;

  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (questionFr !== undefined || questionEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (questionFr ?? "").trim() || (questionEn ?? "").trim() || "";
  }

  const shouldSyncLegacyBody =
    legacyBody === undefined && answerHtmlFr !== undefined;
  if (shouldSyncLegacyBody) {
    patch.body = answerHtmlFr;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("faq_articles")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.faq.update",
    entity_type: "faq_articles",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

type BlogArticleRow = {
  id: string;
  slug: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  // legacy/compat
  title: string;
  description_google: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  // bilingual + SEO
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  body_html_fr: string;
  body_html_en: string;
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;
  // metadata (compat + phase 1)
  author_name: string;
  category: string;

  author_id: string | null;
  primary_category_id: string | null;
  secondary_category_ids: string[];

  show_read_count: boolean;
  read_count: number;
};

type BlogArticleBlockRow = {
  id: string;
  article_id: string;
  sort_order: number;
  type: string;
  is_enabled: boolean;
  data: unknown;
  data_fr: unknown;
  data_en: unknown;
  created_at: string;
  updated_at: string;
};

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

function isSafeUrlForRichText(raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;
  if (v.startsWith("/")) return true;
  if (v.startsWith("#")) return true;
  if (v.startsWith("mailto:")) return true;
  if (v.startsWith("tel:")) return true;

  try {
    const url = new URL(v);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { /* intentional: URL may be invalid */
    return false;
  }
}

function sanitizeHtmlForStorage(html: string): string {
  const raw = String(html ?? "");
  if (!raw) return "";

  // Best-effort, dependency-free sanitizer.
  // Client-side sanitization already enforces a strict allowlist.
  // This server-side pass is defense-in-depth against script injection.
  let out = raw;

  // Remove script/style/iframe/object/embed blocks entirely.
  out = out.replace(
    /<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
    "",
  );
  out = out.replace(
    /<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/\s*>/gi,
    "",
  );

  // Remove inline event handlers and inline styles.
  out = out.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  out = out.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Neutralize javascript: and other unsafe href/src.
  out = out.replace(
    /\s(href|src)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_m, attr, full, v1, v2, v3) => {
      const value = String(v1 ?? v2 ?? v3 ?? "").trim();
      if (!isSafeUrlForRichText(value)) {
        const quote = full.startsWith('"')
          ? '"'
          : full.startsWith("'")
            ? "'"
            : '"';
        return ` ${String(attr).toLowerCase()}=${quote}${quote}`;
      }
      return ` ${String(attr).toLowerCase()}=${full}`;
    },
  );

  return out;
}

const BLOG_TEXT_STYLE_TOKENS = new Set([
  "default",
  "primary",
  "secondary",
  "accent",
  "success",
  "warning",
  "danger",
  "info",
]);

type BlogVideoProvider = "youtube" | "vimeo";

function buildBlogVideoEmbedUrl(
  provider: BlogVideoProvider,
  videoId: string,
): string {
  if (provider === "youtube")
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  return `https://player.vimeo.com/video/${videoId}`;
}

function buildBlogVideoThumbnailUrl(
  provider: BlogVideoProvider,
  videoId: string,
): string {
  if (provider === "youtube")
    return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  return `https://vumbnail.com/${videoId}.jpg`;
}

function parseBlogVideoUrlAllowlist(
  input: string,
): { provider: BlogVideoProvider; videoId: string } | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch { /* intentional: URL may be invalid */
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);

  const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
  const vimeoIdRegex = /^\d+$/;

  if (host === "youtu.be") {
    const id = pathParts[0] ?? "";
    return youtubeIdRegex.test(id)
      ? { provider: "youtube", videoId: id }
      : null;
  }

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtube-nocookie.com"
  ) {
    const first = pathParts[0] ?? "";

    const idFromWatch = url.searchParams.get("v") ?? "";
    if (first === "watch" && youtubeIdRegex.test(idFromWatch))
      return { provider: "youtube", videoId: idFromWatch };

    if (
      (first === "embed" || first === "shorts" || first === "live") &&
      youtubeIdRegex.test(pathParts[1] ?? "")
    ) {
      const id = pathParts[1] ?? "";
      return { provider: "youtube", videoId: id };
    }

    return null;
  }

  if (host === "vimeo.com") {
    const id = pathParts[0] ?? "";
    return vimeoIdRegex.test(id) ? { provider: "vimeo", videoId: id } : null;
  }

  if (host === "player.vimeo.com") {
    if ((pathParts[0] ?? "") !== "video") return null;
    const id = pathParts[1] ?? "";
    return vimeoIdRegex.test(id) ? { provider: "vimeo", videoId: id } : null;
  }

  return null;
}

function sanitizeBlogBlockData(type: string, data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;

  const rec = data as Record<string, unknown>;
  let next: Record<string, unknown> | null = null;

  // Blocks that contain HTML: keep a defense-in-depth pass server-side.
  if (type === "rich_text" || type === "accented_text") {
    const html = typeof rec.html === "string" ? rec.html : null;
    if (html != null) {
      next = { ...(next ?? rec), html: sanitizeHtmlForStorage(html) };
    }
  }

  // Tokenized text style (never store arbitrary colors)
  if (type === "accented_text") {
    const raw = typeof rec.textStyle === "string" ? rec.textStyle : null;
    if (raw != null) {
      const token = raw.trim().toLowerCase();
      next = {
        ...(next ?? rec),
        textStyle: BLOG_TEXT_STYLE_TOKENS.has(token) ? token : "default",
      };
    }
  }

  if (type === "image") {
    const rawSrc = typeof rec.src === "string" ? rec.src : null;
    if (rawSrc != null) {
      const trimmed = rawSrc.trim();
      next = {
        ...(next ?? rec),
        src: trimmed && isSafeUrlForRichText(trimmed) ? trimmed : "",
      };
    }

    const ratioRaw = typeof rec.ratio === "string" ? rec.ratio : null;
    if (ratioRaw != null) {
      const r = ratioRaw.trim();
      const allowed =
        r === "auto" || r === "16:9" || r === "4:3" || r === "1:1";
      next = { ...(next ?? rec), ratio: allowed ? r : "auto" };
    }

    const altRaw = typeof rec.alt === "string" ? rec.alt : null;
    if (altRaw != null) {
      next = { ...(next ?? rec), alt: altRaw.trim() };
    }

    const captionRaw = typeof rec.caption === "string" ? rec.caption : null;
    if (captionRaw != null) {
      next = { ...(next ?? rec), caption: captionRaw.trim() };
    }
  }

  if (type === "document") {
    const urlRaw = typeof rec.url === "string" ? rec.url : null;
    if (urlRaw != null) {
      const trimmed = urlRaw.trim();
      next = {
        ...(next ?? rec),
        url: trimmed && isSafeUrlForRichText(trimmed) ? trimmed : "",
      };
    }

    const fileNameRaw =
      typeof rec.file_name === "string" ? rec.file_name : null;
    if (fileNameRaw != null) {
      const cleaned = fileNameRaw.trim().slice(0, 200);
      next = { ...(next ?? rec), file_name: cleaned };
    }

    const sizeRaw = rec.size_bytes;
    if (typeof sizeRaw === "number" && Number.isFinite(sizeRaw)) {
      next = { ...(next ?? rec), size_bytes: Math.max(0, Math.floor(sizeRaw)) };
    }

    const titleRaw = typeof rec.title === "string" ? rec.title : null;
    if (titleRaw != null) {
      next = { ...(next ?? rec), title: titleRaw.trim() };
    }

    const ctaRaw = typeof rec.cta_label === "string" ? rec.cta_label : null;
    if (ctaRaw != null) {
      next = { ...(next ?? rec), cta_label: ctaRaw.trim() };
    }
  }

  if (type === "video") {
    const urlRaw = typeof rec.url === "string" ? rec.url : null;
    const providerRaw = typeof rec.provider === "string" ? rec.provider : null;
    const videoIdRaw = typeof rec.video_id === "string" ? rec.video_id : null;

    const captionRaw = typeof rec.caption === "string" ? rec.caption : null;

    // Only apply provider/url sanitization if this record is the shared data object.
    if (urlRaw != null || providerRaw != null || videoIdRaw != null) {
      const trimmedUrl = urlRaw ? urlRaw.trim() : "";

      let provider: BlogVideoProvider | null = null;
      let videoId: string | null = null;

      if (trimmedUrl) {
        const parsed = parseBlogVideoUrlAllowlist(trimmedUrl);
        if (parsed) {
          provider = parsed.provider;
          videoId = parsed.videoId;
        }
      }

      // Fallback: accept provider + id only when strictly validated.
      if (!provider || !videoId) {
        const p = (providerRaw ?? "").trim().toLowerCase();
        const id = (videoIdRaw ?? "").trim();
        const youtubeIdRegex = /^[a-zA-Z0-9_-]{11}$/;
        const vimeoIdRegex = /^\d+$/;

        if (p === "youtube" && youtubeIdRegex.test(id)) {
          provider = "youtube";
          videoId = id;
        } else if (p === "vimeo" && vimeoIdRegex.test(id)) {
          provider = "vimeo";
          videoId = id;
        }
      }

      next = {
        ...(next ?? rec),
        url: provider && videoId ? trimmedUrl : "",
        provider: provider ?? "",
        video_id: videoId ?? "",
        embed_url:
          provider && videoId ? buildBlogVideoEmbedUrl(provider, videoId) : "",
        thumbnail_url:
          provider && videoId
            ? buildBlogVideoThumbnailUrl(provider, videoId)
            : "",
      };
    }

    // Localized fields
    if (captionRaw != null) {
      next = { ...(next ?? rec), caption: captionRaw.trim() };
    }
  }

  if (type === "poll") {
    const pollIdRaw = typeof rec.poll_id === "string" ? rec.poll_id : null;
    if (pollIdRaw != null) {
      const trimmed = pollIdRaw.trim();
      next = {
        ...(next ?? rec),
        poll_id: trimmed && isUuid(trimmed) ? trimmed : "",
      };
    }

    const questionRaw = typeof rec.question === "string" ? rec.question : null;
    if (questionRaw != null) {
      next = { ...(next ?? rec), question: questionRaw.trim().slice(0, 240) };
    }

    const optionsRaw = rec.options;
    if (Array.isArray(optionsRaw)) {
      const cleaned = optionsRaw
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
        .slice(0, 12);
      next = { ...(next ?? rec), options: cleaned };
    }
  }

  return next ?? data;
}

export const listAdminCmsBlogArticles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_articles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ items: (data ?? []) as BlogArticleRow[] });
};

export const createAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slug = normalizeSlug(asString(req.body.slug));
  if (!slug || !isValidSlug(slug))
    return res.status(400).json({ error: "Slug requis" });

  // Legacy fields (kept for compatibility with Mode A UI)
  const legacyTitle = asString(req.body.title) ?? "";
  const legacyDescription = asString(req.body.description_google) ?? "";
  const legacyShort = asString(req.body.short) ?? "";
  const legacyContent = asString(req.body.content) ?? "";
  const img = asString(req.body.img) ?? "";
  const miniature = asString(req.body.miniature) ?? "";

  // Bilingual
  const titleFr = asString(req.body.title_fr) ?? "";
  const titleEn = asString(req.body.title_en) ?? "";
  const excerptFr = asString(req.body.excerpt_fr) ?? "";
  const excerptEn = asString(req.body.excerpt_en) ?? "";
  const bodyHtmlFr = sanitizeHtmlForStorage(
    asString(req.body.body_html_fr) ?? "",
  );
  const bodyHtmlEn = sanitizeHtmlForStorage(
    asString(req.body.body_html_en) ?? "",
  );

  // SEO
  const metaTitleFr = asString(req.body.meta_title_fr) ?? "";
  const metaTitleEn = asString(req.body.meta_title_en) ?? "";
  const metaDescriptionFr = asString(req.body.meta_description_fr) ?? "";
  const metaDescriptionEn = asString(req.body.meta_description_en) ?? "";

  const supabase = getAdminSupabase();

  const authorNameInput = asString(req.body.author_name) ?? "";
  const authorIdRaw = asString(req.body.author_id);
  const authorId = authorIdRaw && isUuid(authorIdRaw) ? authorIdRaw : null;

  const primaryCategoryIdRaw = asString(req.body.primary_category_id);
  const primaryCategoryId =
    primaryCategoryIdRaw && isUuid(primaryCategoryIdRaw)
      ? primaryCategoryIdRaw
      : null;

  const secondaryCategoryIds = Array.isArray(req.body.secondary_category_ids)
    ? req.body.secondary_category_ids
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter((v): v is string => Boolean(v && isUuid(v)))
    : [];

  const showReadCount =
    typeof req.body.show_read_count === "boolean"
      ? req.body.show_read_count
      : false;

  const publishedAtRaw = asString(req.body.published_at);
  const publishedAtOverride =
    publishedAtRaw && Number.isFinite(Date.parse(publishedAtRaw))
      ? new Date(publishedAtRaw).toISOString()
      : null;

  let authorName = authorNameInput;
  if (authorId) {
    const { data: authorData } = await supabase
      .from("blog_authors")
      .select("display_name")
      .eq("id", authorId)
      .limit(1);
    const row = Array.isArray(authorData) ? (authorData[0] as any) : null;
    if (row?.display_name) authorName = String(row.display_name);
  }

  let category = asString(req.body.category) ?? "";
  if (primaryCategoryId) {
    const { data: categoryData } = await supabase
      .from("blog_categories")
      .select("slug")
      .eq("id", primaryCategoryId)
      .limit(1);
    const row = Array.isArray(categoryData) ? (categoryData[0] as any) : null;
    if (row?.slug) category = String(row.slug);
  }

  const isPublished =
    typeof req.body.is_published === "boolean" ? req.body.is_published : false;

  const title = (titleFr || titleEn || legacyTitle).trim();
  if (!title)
    return res.status(400).json({ error: "Titre requis (title_fr ou title)" });

  const now = new Date().toISOString();
  const publishedAt = isPublished ? (publishedAtOverride ?? now) : null;

  const { data, error } = await supabase
    .from("blog_articles")
    .insert({
      slug,
      is_published: isPublished,
      published_at: publishedAt,
      created_at: now,
      updated_at: now,

      title,
      description_google: legacyDescription,
      short: legacyShort,
      content: legacyContent,
      img,
      miniature,

      title_fr: titleFr,
      title_en: titleEn,
      excerpt_fr: excerptFr,
      excerpt_en: excerptEn,
      body_html_fr: bodyHtmlFr,
      body_html_en: bodyHtmlEn,
      meta_title_fr: metaTitleFr,
      meta_title_en: metaTitleEn,
      meta_description_fr: metaDescriptionFr,
      meta_description_en: metaDescriptionEn,

      author_name: authorName,
      category,

      author_id: authorId,
      primary_category_id: primaryCategoryId,
      secondary_category_ids: secondaryCategoryIds,
      show_read_count: showReadCount,
      read_count: 0,
    })
    .select("*")
    .single();

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      return res.status(409).json({ error: "Ce slug existe déjà" });
    }
    return res.status(500).json({ error: msg });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.create",
    entity_type: "blog_articles",
    entity_id: (data as any)?.id ?? null,
    metadata: { slug, is_published: isPublished, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ item: data as BlogArticleRow });
};

export const updateAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const slugRaw = asString(req.body.slug);
  const slug = slugRaw !== undefined ? normalizeSlug(slugRaw) : undefined;
  if (slug !== undefined && (!slug || !isValidSlug(slug)))
    return res.status(400).json({ error: "Slug invalide" });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (slug !== undefined) patch.slug = slug;

  const supabase = getAdminSupabase();

  const publishedAtRaw = asString(req.body.published_at);
  const publishedAtOverride =
    publishedAtRaw && Number.isFinite(Date.parse(publishedAtRaw))
      ? new Date(publishedAtRaw).toISOString()
      : null;

  if (typeof req.body.is_published === "boolean") {
    patch.is_published = req.body.is_published;
    patch.published_at = req.body.is_published
      ? (publishedAtOverride ?? new Date().toISOString())
      : null;
  } else if (publishedAtOverride) {
    const { data: currentData, error: currentErr } = await supabase
      .from("blog_articles")
      .select("is_published")
      .eq("id", id)
      .limit(1);

    if (!currentErr) {
      const current = Array.isArray(currentData)
        ? (currentData[0] as any)
        : null;
      if (current?.is_published) {
        patch.published_at = publishedAtOverride;
      }
    }
  }

  // legacy
  const legacyTitle = asString(req.body.title);
  const legacyDescription = asString(req.body.description_google);
  const legacyShort = asString(req.body.short);
  const legacyContent = asString(req.body.content);
  const img = asString(req.body.img);
  const miniature = asString(req.body.miniature);

  if (legacyTitle !== undefined) patch.title = legacyTitle;
  if (legacyDescription !== undefined)
    patch.description_google = legacyDescription;
  if (legacyShort !== undefined) patch.short = legacyShort;
  if (legacyContent !== undefined) patch.content = legacyContent;
  if (img !== undefined) patch.img = img;
  if (miniature !== undefined) patch.miniature = miniature;

  // bilingual
  const titleFr = asString(req.body.title_fr);
  const titleEn = asString(req.body.title_en);
  const excerptFr = asString(req.body.excerpt_fr);
  const excerptEn = asString(req.body.excerpt_en);
  const bodyHtmlFr = asString(req.body.body_html_fr);
  const bodyHtmlEn = asString(req.body.body_html_en);

  if (titleFr !== undefined) patch.title_fr = titleFr;
  if (titleEn !== undefined) patch.title_en = titleEn;
  if (excerptFr !== undefined) patch.excerpt_fr = excerptFr;
  if (excerptEn !== undefined) patch.excerpt_en = excerptEn;
  if (bodyHtmlFr !== undefined)
    patch.body_html_fr = sanitizeHtmlForStorage(bodyHtmlFr);
  if (bodyHtmlEn !== undefined)
    patch.body_html_en = sanitizeHtmlForStorage(bodyHtmlEn);

  // SEO
  const metaTitleFr = asString(req.body.meta_title_fr);
  const metaTitleEn = asString(req.body.meta_title_en);
  const metaDescriptionFr = asString(req.body.meta_description_fr);
  const metaDescriptionEn = asString(req.body.meta_description_en);

  if (metaTitleFr !== undefined) patch.meta_title_fr = metaTitleFr;
  if (metaTitleEn !== undefined) patch.meta_title_en = metaTitleEn;
  if (metaDescriptionFr !== undefined)
    patch.meta_description_fr = metaDescriptionFr;
  if (metaDescriptionEn !== undefined)
    patch.meta_description_en = metaDescriptionEn;

  const authorIdRaw = asString(req.body.author_id);
  if (authorIdRaw !== undefined) {
    const authorId = authorIdRaw && isUuid(authorIdRaw) ? authorIdRaw : null;
    patch.author_id = authorId;

    if (authorId) {
      const { data: authorData } = await supabase
        .from("blog_authors")
        .select("display_name")
        .eq("id", authorId)
        .limit(1);
      const row = Array.isArray(authorData) ? (authorData[0] as any) : null;
      patch.author_name = row?.display_name ? String(row.display_name) : "";
    } else {
      patch.author_name = "";
    }
  }

  const primaryCategoryIdRaw = asString(req.body.primary_category_id);
  if (primaryCategoryIdRaw !== undefined) {
    const primaryCategoryId =
      primaryCategoryIdRaw && isUuid(primaryCategoryIdRaw)
        ? primaryCategoryIdRaw
        : null;
    patch.primary_category_id = primaryCategoryId;

    if (primaryCategoryId) {
      const { data: categoryData } = await supabase
        .from("blog_categories")
        .select("slug")
        .eq("id", primaryCategoryId)
        .limit(1);
      const row = Array.isArray(categoryData) ? (categoryData[0] as any) : null;
      patch.category = row?.slug ? String(row.slug) : "";
    } else {
      patch.category = "";
    }
  }

  if (Array.isArray(req.body.secondary_category_ids)) {
    patch.secondary_category_ids = req.body.secondary_category_ids
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((v): v is string => Boolean(v && isUuid(v)));
  }

  if (typeof req.body.show_read_count === "boolean")
    patch.show_read_count = req.body.show_read_count;

  // Moderation handling for blogger articles
  const moderationStatus = asString(req.body.moderation_status);
  if (moderationStatus && ["draft", "pending", "approved", "rejected"].includes(moderationStatus)) {
    patch.moderation_status = moderationStatus;
    if (moderationStatus === "approved") {
      patch.moderation_reviewed_at = new Date().toISOString();
      patch.moderation_note = null;
    } else if (moderationStatus === "rejected") {
      patch.moderation_reviewed_at = new Date().toISOString();
      const moderationNote = asString(req.body.moderation_note);
      if (moderationNote) patch.moderation_note = moderationNote;
    }
  }

  const authorName = asString(req.body.author_name);
  const category = asString(req.body.category);
  if (authorIdRaw === undefined && authorName !== undefined)
    patch.author_name = authorName;
  if (primaryCategoryIdRaw === undefined && category !== undefined)
    patch.category = category;

  const shouldSyncLegacyTitle =
    legacyTitle === undefined &&
    (titleFr !== undefined || titleEn !== undefined);
  if (shouldSyncLegacyTitle) {
    patch.title = (titleFr ?? "").trim() || (titleEn ?? "").trim() || "";
  }

  const { data, error } = await supabase
    .from("blog_articles")
    .update(patch)
    .eq("id", id)
    .select("id");

  if (error) {
    const msg = error.message ?? "";
    if (
      msg.toLowerCase().includes("duplicate") ||
      msg.toLowerCase().includes("unique")
    ) {
      return res.status(409).json({ error: "Ce slug existe déjà" });
    }
    return res.status(500).json({ error: msg });
  }

  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.update",
    entity_type: "blog_articles",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const deleteAdminCmsBlogArticle: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: existingData, error: existingErr } = await supabase
    .from("blog_articles")
    .select("id,slug")
    .eq("id", id)
    .limit(1);

  if (existingErr) return res.status(500).json({ error: existingErr.message });

  const existing = Array.isArray(existingData)
    ? (existingData[0] as any)
    : null;
  if (!existing?.id) return res.status(404).json({ error: "Introuvable" });

  const slug = typeof existing.slug === "string" ? existing.slug : null;

  const { error: blocksErr } = await supabase
    .from("blog_article_blocks")
    .delete()
    .eq("article_id", id);
  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const { error: votesErr } = await supabase
    .from("blog_poll_votes")
    .delete()
    .eq("article_id", id);
  if (votesErr) return res.status(500).json({ error: votesErr.message });

  const { data: deletedData, error: deletedErr } = await supabase
    .from("blog_articles")
    .delete()
    .eq("id", id)
    .select("id");

  if (deletedErr) return res.status(500).json({ error: deletedErr.message });
  if (!deletedData || !Array.isArray(deletedData) || !deletedData.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.delete",
    entity_type: "blog_articles",
    entity_id: id,
    metadata: { slug, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

type BlogAuthorRow = {
  id: string;
  slug: string;
  display_name: string;
  bio_short: string;
  avatar_url: string | null;
  role: string;
  profile_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BlogCategoryRow = {
  id: string;
  slug: string;
  title: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

export const listAdminCmsBlogAuthors: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_authors")
    .select(
      "id,slug,display_name,bio_short,avatar_url,role,profile_url,is_active,created_at,updated_at",
    )
    .order("display_name", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogAuthorRow[] });
};

export const createAdminCmsBlogAuthor: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const displayName = (asString(req.body.display_name) ?? "").trim();
  if (!displayName)
    return res.status(400).json({ error: "Nom d'affichage requis" });

  const bioShort = (asString(req.body.bio_short) ?? "").trim();
  const avatarUrl = asString(req.body.avatar_url);
  const profileUrl = asString(req.body.profile_url);

  const roleRaw = (asString(req.body.role) ?? "editor").trim().toLowerCase();
  const role =
    roleRaw === "sam" ||
    roleRaw === "guest" ||
    roleRaw === "team" ||
    roleRaw === "editor"
      ? roleRaw
      : "editor";

  const isActive =
    typeof req.body.is_active === "boolean" ? req.body.is_active : true;

  const now = new Date().toISOString();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("blog_authors")
    .insert({
      display_name: displayName,
      bio_short: bioShort,
      avatar_url: avatarUrl ?? null,
      role,
      profile_url: profileUrl ?? null,
      is_active: isActive,
      created_at: now,
      updated_at: now,
    })
    .select(
      "id,slug,display_name,bio_short,avatar_url,role,profile_url,is_active,created_at,updated_at",
    )
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog_author.create",
    entity_type: "blog_authors",
    entity_id: (data as any)?.id ?? null,
    metadata: { display_name: displayName, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ item: data as BlogAuthorRow });
};

export const updateAdminCmsBlogAuthor: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id || !isUuid(id))
    return res.status(400).json({ error: "Identifiant requis" });
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (req.body.display_name !== undefined) {
    patch.display_name = (asString(req.body.display_name) ?? "").trim();
  }
  if (req.body.bio_short !== undefined) {
    patch.bio_short = (asString(req.body.bio_short) ?? "").trim();
  }
  if (req.body.avatar_url !== undefined) {
    patch.avatar_url = asString(req.body.avatar_url) ?? null;
  }
  if (req.body.profile_url !== undefined) {
    patch.profile_url = asString(req.body.profile_url) ?? null;
  }
  if (req.body.role !== undefined) {
    const roleRaw = (asString(req.body.role) ?? "editor").trim().toLowerCase();
    patch.role =
      roleRaw === "sam" ||
      roleRaw === "guest" ||
      roleRaw === "team" ||
      roleRaw === "editor"
        ? roleRaw
        : "editor";
  }
  if (typeof req.body.is_active === "boolean") {
    patch.is_active = req.body.is_active;
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_authors")
    .update(patch)
    .eq("id", id)
    .select("id");
  if (error) return res.status(500).json({ error: error.message });
  if (!data || !Array.isArray(data) || !data.length)
    return res.status(404).json({ error: "Introuvable" });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog_author.update",
    entity_type: "blog_authors",
    entity_id: id,
    metadata: { patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const listAdminCmsBlogCategories: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_categories")
    .select("id,slug,title,is_active,display_order,created_at,updated_at")
    .order("display_order", { ascending: true })
    .order("title", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogCategoryRow[] });
};

export const listAdminCmsBlogArticleBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("blog_article_blocks")
    .select("*")
    .eq("article_id", articleId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ items: (data ?? []) as BlogArticleBlockRow[] });
};

export const replaceAdminCmsBlogArticleBlocks: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const body = req.body;
  const blocksRaw = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.blocks)
      ? body.blocks
      : null;
  if (!blocksRaw)
    return res.status(400).json({ error: "Tableau de blocs requis" });

  const now = new Date().toISOString();
  const blocks = blocksRaw
    .map((b) => (isRecord(b) ? b : null))
    .filter((b): b is Record<string, unknown> => !!b)
    .map((b, idx) => {
      const type = asString(b.type) ?? "";
      const isEnabled = typeof b.is_enabled === "boolean" ? b.is_enabled : true;

      const data = sanitizeBlogBlockData(
        type,
        b.data !== undefined ? b.data : {},
      );
      const dataFr = sanitizeBlogBlockData(
        type,
        b.data_fr !== undefined ? b.data_fr : {},
      );
      const dataEn = sanitizeBlogBlockData(
        type,
        b.data_en !== undefined ? b.data_en : {},
      );

      return {
        article_id: articleId,
        sort_order: idx,
        type,
        is_enabled: isEnabled,
        data,
        data_fr: dataFr,
        data_en: dataEn,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((b) => b.type);

  const supabase = getAdminSupabase();

  const { error: deleteErr } = await supabase
    .from("blog_article_blocks")
    .delete()
    .eq("article_id", articleId);
  if (deleteErr) return res.status(500).json({ error: deleteErr.message });

  if (blocks.length) {
    const { error: insertErr } = await supabase
      .from("blog_article_blocks")
      .insert(blocks);
    if (insertErr) return res.status(500).json({ error: insertErr.message });
  }

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.blocks.replace",
    entity_type: "blog_articles",
    entity_id: articleId,
    metadata: { count: blocks.length, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  res.json({ ok: true });
};

export const getAdminCmsBlogPollStats: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const articleId = typeof req.params.id === "string" ? req.params.id : "";
  if (!articleId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: blocksData, error: blocksErr } = await supabase
    .from("blog_article_blocks")
    .select("id,type,is_enabled,data,data_fr,data_en")
    .eq("article_id", articleId)
    .eq("type", "poll")
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(200);

  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const pollBlocks = Array.isArray(blocksData) ? blocksData : [];

  const polls = pollBlocks
    .map((b: any) => {
      const shared = isRecord(b.data)
        ? (b.data as Record<string, unknown>)
        : {};
      const pollId =
        typeof shared.poll_id === "string" ? shared.poll_id.trim() : "";
      if (!pollId || !isUuid(pollId)) return null;

      const fr = isRecord(b.data_fr)
        ? (b.data_fr as Record<string, unknown>)
        : {};
      const en = isRecord(b.data_en)
        ? (b.data_en as Record<string, unknown>)
        : {};

      const questionFr =
        typeof fr.question === "string" ? fr.question.trim() : "";
      const questionEn =
        typeof en.question === "string" ? en.question.trim() : "";

      const optionsFr = Array.isArray(fr.options)
        ? fr.options.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
      const optionsEn = Array.isArray(en.options)
        ? en.options.map((v) => String(v ?? "").trim()).filter(Boolean)
        : [];
      const optionsCount = Math.max(optionsFr.length, optionsEn.length);
      if (optionsCount < 2) return null;

      return {
        block_id: String(b.id ?? ""),
        poll_id: pollId,
        question_fr: questionFr,
        question_en: questionEn,
        options_fr: optionsFr,
        options_en: optionsEn,
        options_count: optionsCount,
      };
    })
    .filter((v): v is any => !!v);

  if (!polls.length) return res.json({ items: [] });

  const { data: votesData, error: votesErr } = await supabase
    .from("blog_poll_votes")
    .select("id,poll_id,option_index,user_id,session_id")
    .eq("article_id", articleId)
    .limit(100000);

  if (votesErr) return res.status(500).json({ error: votesErr.message });

  const votes = Array.isArray(votesData) ? votesData : [];
  const byPoll = new Map<string, Map<number, number>>();
  const totals = new Map<string, number>();
  const totalsAuth = new Map<string, number>();
  const totalsLegacy = new Map<string, number>();
  const seenByPoll = new Map<string, Set<string>>();

  for (const v of votes) {
    const pollId =
      typeof (v as any).poll_id === "string" ? (v as any).poll_id.trim() : "";
    const option = (v as any).option_index;
    const userId =
      typeof (v as any).user_id === "string" ? (v as any).user_id.trim() : "";
    const sessionId =
      typeof (v as any).session_id === "string"
        ? (v as any).session_id.trim()
        : "";
    const rowId = typeof (v as any).id === "string" ? (v as any).id.trim() : "";

    if (!pollId) continue;
    if (typeof option !== "number" || !Number.isFinite(option)) continue;

    const voterKey = userId
      ? `u:${userId}`
      : sessionId
        ? `s:${sessionId}`
        : rowId
          ? `r:${rowId}`
          : "";
    if (!voterKey) continue;

    const seen = seenByPoll.get(pollId) ?? new Set<string>();
    if (seen.has(voterKey)) continue;
    seen.add(voterKey);
    seenByPoll.set(pollId, seen);

    const idx = Math.max(0, Math.floor(option));
    totals.set(pollId, (totals.get(pollId) ?? 0) + 1);

    if (userId) totalsAuth.set(pollId, (totalsAuth.get(pollId) ?? 0) + 1);
    else totalsLegacy.set(pollId, (totalsLegacy.get(pollId) ?? 0) + 1);

    const pollMap = byPoll.get(pollId) ?? new Map<number, number>();
    pollMap.set(idx, (pollMap.get(idx) ?? 0) + 1);
    byPoll.set(pollId, pollMap);
  }

  const items = polls.map((p: any) => {
    const total = totals.get(p.poll_id) ?? 0;
    const totalAuth = totalsAuth.get(p.poll_id) ?? 0;
    const totalLegacy = totalsLegacy.get(p.poll_id) ?? 0;
    const counts = byPoll.get(p.poll_id) ?? new Map<number, number>();

    const outCounts = Array.from({ length: p.options_count }).map((_, idx) => {
      const count = counts.get(idx) ?? 0;
      return {
        option_index: idx,
        count,
        percent: total ? Math.round((count / total) * 100) : 0,
      };
    });

    return {
      poll_id: p.poll_id,
      block_id: p.block_id,
      total_votes: total,
      total_votes_auth: totalAuth,
      total_votes_legacy: totalLegacy,
      counts: outCounts,
      question_fr: p.question_fr,
      question_en: p.question_en,
      options_fr: p.options_fr,
      options_en: p.options_en,
    };
  });

  return res.json({ items });
};

// ---------------------------------------------------------------------------
// CMS Media: Blog images (admin upload)
// ---------------------------------------------------------------------------

type CmsUploadedImage = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
};

const CMS_BLOG_IMAGES_BUCKET = "cms-blog-images";
const MAX_CMS_BLOG_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

function looksLikeJpeg(buffer: Buffer): boolean {
  return (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  );
}

function looksLikePng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function looksLikeWebp(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  );
}

function imageExtensionFromMime(mime: string): "jpg" | "png" | "webp" | null {
  const m = mime.toLowerCase();
  if (m.includes("image/jpeg")) return "jpg";
  if (m.includes("image/png")) return "png";
  if (m.includes("image/webp")) return "webp";
  return null;
}

function sanitizeImageFileName(input: string, ext: string): string {
  const v = String(input || "").trim();
  const base = v.replace(/[^a-zA-Z0-9._\- ]+/g, "").trim() || `image.${ext}`;
  const normalized = base.toLowerCase();
  // ensure extension
  if (normalized.endsWith(`.${ext}`)) return normalized;
  // strip any existing extension
  const noExt = normalized.replace(/\.[a-z0-9]+$/i, "");
  return `${noExt}.${ext}`;
}

export const uploadAdminCmsBlogImage: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  const ext = imageExtensionFromMime(contentType);
  if (!ext) return res.status(400).json({ error: "unsupported_image_type" });

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0)
    return res.status(400).json({ error: "missing_image_body" });
  if (body.length > MAX_CMS_BLOG_IMAGE_BYTES)
    return res.status(413).json({ error: "image_too_large" });

  // Signature checks.
  const signatureOk =
    (ext === "jpg" && looksLikeJpeg(body)) ||
    (ext === "png" && looksLikePng(body)) ||
    (ext === "webp" && looksLikeWebp(body));
  if (!signatureOk)
    return res.status(400).json({ error: "invalid_image_signature" });

  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeImageFileName(fileNameHeader, ext);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.${ext}`;

  const supabase = getAdminSupabase();
  const up = await supabase.storage
    .from(CMS_BLOG_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(CMS_BLOG_IMAGES_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.media.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CMS_BLOG_IMAGES_BUCKET,
      file_name: fileName,
      mime_type: contentType,
      size_bytes: body.length,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  const item: CmsUploadedImage = {
    bucket: CMS_BLOG_IMAGES_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: contentType,
    size_bytes: body.length,
    width: null,
    height: null,
  };

  res.json({ ok: true, item });
};

// ---------------------------------------------------------------------------
// CMS Media: Blog documents (PDF upload)
// ---------------------------------------------------------------------------

type CmsUploadedDocument = {
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
  file_name: string;
};

const CMS_BLOG_DOCUMENTS_BUCKET = "cms-blog-documents";
const MAX_CMS_BLOG_PDF_BYTES = 10 * 1024 * 1024; // 10MB

async function ensurePublicStorageBucket(
  supabase: ReturnType<typeof getAdminSupabase>,
  bucket: string,
): Promise<void> {
  try {
    const exists = await supabase.storage.getBucket(bucket);
    if (!exists.error) return;

    const msg = String(exists.error.message ?? "").toLowerCase();
    const status =
      (exists.error as any)?.statusCode ??
      (exists.error as any)?.status ??
      null;

    // If the bucket doesn't exist, attempt to create it.
    if (
      status === 404 ||
      msg.includes("not found") ||
      msg.includes("does not exist")
    ) {
      const created = await supabase.storage.createBucket(bucket, {
        public: true,
      });
      const cmsg = String(created.error?.message ?? "").toLowerCase();
      if (
        created.error &&
        !cmsg.includes("exists") &&
        !cmsg.includes("duplicate")
      ) {
        throw created.error;
      }
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: CMS blog storage bucket creation failed");
  }
}

export const uploadAdminCmsBlogDocument: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const contentType = (req.header("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/pdf")) {
    return res
      .status(400)
      .json({ error: "content_type_must_be_application_pdf" });
  }

  const body = req.body as unknown;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "pdf_body_required" });
  }

  if (body.length > MAX_CMS_BLOG_PDF_BYTES) {
    return res
      .status(413)
      .json({ error: "pdf_too_large", max_bytes: MAX_CMS_BLOG_PDF_BYTES });
  }

  if (!looksLikePdf(body)) {
    return res.status(400).json({ error: "invalid_pdf_signature" });
  }

  const fileNameHeader = req.header("x-file-name") ?? "";
  const fileName = sanitizeFileName(fileNameHeader);

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const id = randomBytes(12).toString("hex");
  const storagePath = `${y}/${m}/${id}.pdf`;

  const supabase = getAdminSupabase();
  await ensurePublicStorageBucket(supabase, CMS_BLOG_DOCUMENTS_BUCKET);

  const up = await supabase.storage
    .from(CMS_BLOG_DOCUMENTS_BUCKET)
    .upload(storagePath, body, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (up.error) return res.status(500).json({ error: up.error.message });

  const publicUrl =
    supabase.storage.from(CMS_BLOG_DOCUMENTS_BUCKET).getPublicUrl(storagePath)
      ?.data?.publicUrl ?? "";

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "content.blog.documents.upload",
    entity_type: "storage",
    entity_id: storagePath,
    metadata: {
      bucket: CMS_BLOG_DOCUMENTS_BUCKET,
      file_name: fileName,
      mime_type: "application/pdf",
      size_bytes: body.length,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  const item: CmsUploadedDocument = {
    bucket: CMS_BLOG_DOCUMENTS_BUCKET,
    path: storagePath,
    public_url: publicUrl,
    mime_type: "application/pdf",
    size_bytes: body.length,
    file_name: fileName,
  };

  res.json({ ok: true, item });
};

export const getPublicContentPage: RequestHandler = async (req, res) => {
  const slug =
    typeof req.params.slug === "string" ? req.params.slug.trim() : "";
  if (!slug) return res.status(400).json({ error: "Slug requis" });

  const langRaw =
    typeof req.query.lang === "string"
      ? req.query.lang.trim().toLowerCase()
      : "";
  const lang = langRaw === "en" ? "en" : "fr";

  const supabase = getAdminSupabase();
  const slugColumn = lang === "en" ? "slug_en" : "slug_fr";

  const { data, error } = await supabase
    .from("content_pages")
    .select(
      "id,page_key,slug,slug_fr,slug_en,status,is_published,title,body_markdown,updated_at,title_fr,title_en,page_subtitle_fr,page_subtitle_en,body_html_fr,body_html_en,seo_title_fr,seo_title_en,seo_description_fr,seo_description_en,meta_title_fr,meta_title_en,meta_description_fr,meta_description_en,og_title_fr,og_title_en,og_description_fr,og_description_en,og_image_url,canonical_url_fr,canonical_url_en,robots,show_toc,related_links,schema_jsonld_fr,schema_jsonld_en",
    )
    .eq(slugColumn, slug)
    .eq("status", "published")
    .single();

  if (error) return res.status(404).json({ error: error.message });

  const row = data as any;
  const pageId = String(row.id ?? "");

  const { data: blocksData, error: blocksErr } = pageId
    ? await supabase
        .from("content_page_blocks")
        .select(
          "id,sort_order,type,is_enabled,data,data_fr,data_en,updated_at,created_at",
        )
        .eq("page_id", pageId)
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(500)
    : { data: [], error: null };

  if (blocksErr) return res.status(500).json({ error: blocksErr.message });

  const blocks = (blocksData ?? []).map((b: any) => {
    const shared = b.data ?? {};
    const localized = lang === "en" ? (b.data_en ?? {}) : (b.data_fr ?? {});

    return {
      id: String(b.id ?? ""),
      sort_order: typeof b.sort_order === "number" ? b.sort_order : 0,
      type: String(b.type ?? ""),
      data: shared,
      data_fr: b.data_fr ?? {},
      data_en: b.data_en ?? {},
      resolved: {
        lang,
        data: mergeBlockData(shared, localized),
      },
    };
  });

  const item = {
    page_key: String(row.page_key ?? ""),
    slug: String(row.slug ?? ""),
    slug_fr: String(row.slug_fr ?? ""),
    slug_en: String(row.slug_en ?? ""),
    status: String(row.status ?? ""),
    is_published: Boolean(row.is_published),
    updated_at: row.updated_at,

    // legacy
    title: String(row.title ?? ""),
    body_markdown: String(row.body_markdown ?? ""),

    // bilingual
    title_fr: String(row.title_fr ?? ""),
    title_en: String(row.title_en ?? ""),
    page_subtitle_fr: String(row.page_subtitle_fr ?? ""),
    page_subtitle_en: String(row.page_subtitle_en ?? ""),
    body_html_fr: String(row.body_html_fr ?? ""),
    body_html_en: String(row.body_html_en ?? ""),

    // SEO (preferred)
    seo_title_fr: String(row.seo_title_fr ?? ""),
    seo_title_en: String(row.seo_title_en ?? ""),
    seo_description_fr: String(row.seo_description_fr ?? ""),
    seo_description_en: String(row.seo_description_en ?? ""),

    // SEO legacy (compat)
    meta_title_fr: String(row.meta_title_fr ?? ""),
    meta_title_en: String(row.meta_title_en ?? ""),
    meta_description_fr: String(row.meta_description_fr ?? ""),
    meta_description_en: String(row.meta_description_en ?? ""),

    // OG
    og_title_fr: String(row.og_title_fr ?? ""),
    og_title_en: String(row.og_title_en ?? ""),
    og_description_fr: String(row.og_description_fr ?? ""),
    og_description_en: String(row.og_description_en ?? ""),
    og_image_url: row.og_image_url ?? null,

    canonical_url_fr: String(row.canonical_url_fr ?? ""),
    canonical_url_en: String(row.canonical_url_en ?? ""),
    robots: String(row.robots ?? ""),

    show_toc: Boolean(row.show_toc),
    related_links: row.related_links ?? [],

    schema_jsonld_fr: row.schema_jsonld_fr ?? null,
    schema_jsonld_en: row.schema_jsonld_en ?? null,

    blocks,

    // resolved for lang
    resolved: {
      lang,
      // Strict: do not fall back to FR/legacy when EN is selected (and vice versa).
      title: String(
        lang === "en" ? (row.title_en ?? "") : (row.title_fr ?? ""),
      ),
      page_subtitle: String(
        lang === "en"
          ? (row.page_subtitle_en ?? "")
          : (row.page_subtitle_fr ?? ""),
      ),
      body_html: String(
        lang === "en" ? (row.body_html_en ?? "") : (row.body_html_fr ?? ""),
      ),

      seo_title: String(
        (lang === "en" ? (row.seo_title_en ?? "") : (row.seo_title_fr ?? "")) ||
          (lang === "en"
            ? (row.meta_title_en ?? "")
            : (row.meta_title_fr ?? "")),
      ),
      seo_description: String(
        (lang === "en"
          ? (row.seo_description_en ?? "")
          : (row.seo_description_fr ?? "")) ||
          (lang === "en"
            ? (row.meta_description_en ?? "")
            : (row.meta_description_fr ?? "")),
      ),

      meta_title: String(
        lang === "en" ? (row.meta_title_en ?? "") : (row.meta_title_fr ?? ""),
      ),
      meta_description: String(
        lang === "en"
          ? (row.meta_description_en ?? "")
          : (row.meta_description_fr ?? ""),
      ),

      og_title: String(
        lang === "en" ? (row.og_title_en ?? "") : (row.og_title_fr ?? ""),
      ),
      og_description: String(
        lang === "en"
          ? (row.og_description_en ?? "")
          : (row.og_description_fr ?? ""),
      ),
      og_image_url: row.og_image_url ?? null,

      canonical_url: String(
        lang === "en"
          ? (row.canonical_url_en ?? "")
          : (row.canonical_url_fr ?? ""),
      ),
      robots: String(row.robots ?? ""),

      related_links: row.related_links ?? [],
      schema_jsonld:
        lang === "en"
          ? (row.schema_jsonld_en ?? null)
          : (row.schema_jsonld_fr ?? null),

      blocks: blocks.map((b: any) => ({
        id: b.id,
        sort_order: b.sort_order,
        type: b.type,
        data: b.resolved.data,
      })),
    },
  };

  res.json({ item });
};

export const listPublicFaqArticles: RequestHandler = async (req, res) => {
  const langRaw =
    typeof req.query.lang === "string"
      ? req.query.lang.trim().toLowerCase()
      : "";
  const lang = langRaw === "en" ? "en" : "fr";

  // audience filter: "consumer", "pro", or undefined (all)
  const audienceRaw =
    typeof req.query.audience === "string"
      ? req.query.audience.trim().toLowerCase()
      : "";
  const audience =
    audienceRaw === "consumer" || audienceRaw === "pro" ? audienceRaw : "";

  const supabase = getAdminSupabase();
  let query = supabase
    .from("faq_articles")
    .select(
      "id,category,display_order,title,body,question_fr,question_en,answer_html_fr,answer_html_en,tags,updated_at,audience",
    )
    .eq("is_published", true)
    .order("category", { ascending: true })
    .order("display_order", { ascending: true })
    .order("updated_at", { ascending: false })
    .limit(500);

  // If audience specified, return items matching that audience OR "both"
  if (audience) {
    query = query.in("audience", [audience, "both"]);
  }

  const { data, error } = await query;

  if (error) return res.status(500).json({ error: error.message });

  const items = (data ?? []).map((row: any) => {
    const question = String(
      lang === "en" ? (row.question_en ?? "") : (row.question_fr ?? ""),
    );
    const answerHtml = String(
      lang === "en" ? (row.answer_html_en ?? "") : (row.answer_html_fr ?? ""),
    );

    return {
      id: String(row.id ?? ""),
      category: row.category ?? null,
      display_order:
        typeof row.display_order === "number" ? row.display_order : 0,
      tags: Array.isArray(row.tags) ? row.tags : [],
      updated_at: row.updated_at,
      // legacy
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      // bilingual
      question_fr: String(row.question_fr ?? ""),
      question_en: String(row.question_en ?? ""),
      answer_html_fr: String(row.answer_html_fr ?? ""),
      answer_html_en: String(row.answer_html_en ?? ""),
      // resolved
      resolved: {
        lang,
        question,
        answer_html: answerHtml,
      },
    };
  });

  res.json({ items });
};
