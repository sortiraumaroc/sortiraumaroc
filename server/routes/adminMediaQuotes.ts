/**
 * adminMediaQuotes.ts
 * -------------------------------------------------------------------
 * Admin handlers for the Media Quotes & Invoices module, plus
 * Pro Profiles (clients = Pro) management:
 *   - Pro profiles (list, get, update)
 *   - Media quotes (CRUD, items, public links, PDF, email, accept/reject)
 *   - Media invoices (list, get, convert from quote, PDF, email, mark paid)
 *
 * Extracted from admin.ts — Feb 2026.
 * -------------------------------------------------------------------
 */

import type { RequestHandler } from "express";
import { createHash, randomBytes } from "crypto";

import {
  requireAdminKey,
  requireSuperadmin,
  isRecord,
  getAdminSupabase,
  getAuditActorInfo,
  getAdminSessionSub,
} from "./adminHelpers";
import { createModuleLogger } from "../lib/logger";
import {
  generateMediaInvoicePdfBuffer,
  generateMediaQuotePdfBuffer,
} from "../billing/mediaPdf";
import { getBillingCompanyProfile } from "../billing/companyProfile";
import { sendLoggedEmail } from "../emailService";

const log = createModuleLogger("adminMediaQuotes");

// ---------------------------------------------------------------------------
// Local helper functions
// ---------------------------------------------------------------------------

function safeInt(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return 0;
}

function safeString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function safeCurrency(v: unknown): string {
  const c = typeof v === "string" ? v.trim().toUpperCase() : "";
  return c || "MAD";
}

function normalizeMediaPaymentMethod(v: unknown): "card" | "bank_transfer" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "card" || s === "cb" || s === "credit_card") return "card";
  if (s === "bank_transfer" || s === "virement" || s === "transfer")
    return "bank_transfer";
  return "bank_transfer";
}

function safeMoneyNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizePercent(v: unknown): number {
  const n = safeMoneyNumber(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, roundMoney(n)));
}

function normalizeLang(v: unknown): "fr" | "en" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "en" ? "en" : "fr";
}

function parseEmail(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

function safeIsoOrNull(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function getRequestBaseUrl(req: Parameters<RequestHandler>[0]): string {
  const host = String(
    req.get("x-forwarded-host") ?? req.get("host") ?? "",
  ).trim();
  const proto = String(
    req.get("x-forwarded-proto") ?? (req as any).protocol ?? "https",
  ).trim();
  if (!host) return "";
  return `${proto}://${host}`;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

/**
 * Equivalent to getAdminSessionSubAny in admin.ts — returns the session subject.
 * Uses getAdminSessionSub from adminHelpers which does the same thing.
 */
function getAdminSessionSubAny(
  req: Parameters<RequestHandler>[0],
): string | null {
  return getAdminSessionSub(req);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MediaExternalClientInput = {
  company_name?: unknown;
  contact_name?: unknown;
  email?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
  country?: unknown;
  notes?: unknown;
};

type MediaCreateQuoteInput = {
  pro_user_id?: unknown;
  establishment_id?: unknown;
  valid_until?: unknown;
  currency?: unknown;
  notes?: unknown;
  payment_terms?: unknown;
  delivery_estimate?: unknown;
};

type MediaAddQuoteItemInput = {
  catalog_item_id?: unknown;
  quantity?: unknown;

  // Superadmin-only (free lines)
  item_type?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  unit_price?: unknown;
  tax_rate?: unknown;
};

type MediaUpdateQuoteItemInput = {
  quantity?: unknown;
};

type MediaSendQuoteEmailInput = {
  lang?: unknown;
  to_email?: unknown;
};

type MediaUpdateQuoteInput = {
  status?: unknown;
  valid_until?: unknown;
  currency?: unknown;
  notes?: unknown;
  payment_terms?: unknown;
  delivery_estimate?: unknown;
};

type MediaConvertQuoteToInvoiceInput = {
  due_at?: unknown;
  notes?: unknown;
};

type MediaSendInvoiceEmailInput = {
  lang?: unknown;
  to_email?: unknown;
};

type MediaMarkInvoicePaidInput = {
  amount?: unknown;
  method?: unknown;
  reference?: unknown;
  paid_at?: unknown;
};

// ---------------------------------------------------------------------------
// Internal data-access helpers
// ---------------------------------------------------------------------------

async function nextMediaQuoteNumber(
  supabase: ReturnType<typeof getAdminSupabase>,
): Promise<string> {
  const { data, error } = await supabase.rpc("media_next_quote_number");
  if (error) throw new Error(error.message);
  const v = typeof data === "string" ? data.trim() : "";
  if (!v) throw new Error("quote_number_generation_failed");
  return v;
}

async function nextMediaInvoiceNumber(
  supabase: ReturnType<typeof getAdminSupabase>,
): Promise<string> {
  const { data, error } = await supabase.rpc("media_next_invoice_number");
  if (error) throw new Error(error.message);
  const v = typeof data === "string" ? data.trim() : "";
  if (!v) throw new Error("invoice_number_generation_failed");
  return v;
}

async function recomputeMediaQuoteTotals(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
}): Promise<void> {
  const { supabase, quoteId } = args;
  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select("line_subtotal,line_tax,line_total")
    .eq("quote_id", quoteId)
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (const it of (items ?? []) as any[]) {
    const s =
      typeof it?.line_subtotal === "number"
        ? it.line_subtotal
        : Number(it?.line_subtotal ?? 0);
    const t =
      typeof it?.line_tax === "number"
        ? it.line_tax
        : Number(it?.line_tax ?? 0);
    const tt =
      typeof it?.line_total === "number"
        ? it.line_total
        : Number(it?.line_total ?? 0);
    subtotal += Number.isFinite(s) ? s : 0;
    tax += Number.isFinite(t) ? t : 0;
    total += Number.isFinite(tt) ? tt : 0;
  }

  const patch = {
    subtotal_amount: roundMoney(subtotal),
    tax_amount: roundMoney(tax),
    total_amount: roundMoney(total),
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (updErr) throw new Error(updErr.message);
}

async function recomputeMediaInvoiceTotals(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
}): Promise<void> {
  const { supabase, invoiceId } = args;
  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select("line_subtotal,line_tax,line_total")
    .eq("invoice_id", invoiceId)
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  for (const it of (items ?? []) as any[]) {
    const s =
      typeof it?.line_subtotal === "number"
        ? it.line_subtotal
        : Number(it?.line_subtotal ?? 0);
    const t =
      typeof it?.line_tax === "number"
        ? it.line_tax
        : Number(it?.line_tax ?? 0);
    const tt =
      typeof it?.line_total === "number"
        ? it.line_total
        : Number(it?.line_total ?? 0);
    subtotal += Number.isFinite(s) ? s : 0;
    tax += Number.isFinite(t) ? t : 0;
    total += Number.isFinite(tt) ? tt : 0;
  }

  const patch = {
    subtotal_amount: roundMoney(subtotal),
    tax_amount: roundMoney(tax),
    total_amount: roundMoney(total),
    updated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("media_invoices")
    .update(patch)
    .eq("id", invoiceId);
  if (updErr) throw new Error(updErr.message);
}

function computeMediaLine(args: {
  unitPrice: number;
  quantity: number;
  taxRate: number;
}): {
  line_subtotal: number;
  line_tax: number;
  line_total: number;
} {
  const unitPrice = Number.isFinite(args.unitPrice) ? args.unitPrice : 0;
  const quantity = Number.isFinite(args.quantity)
    ? Math.max(1, Math.floor(args.quantity))
    : 1;
  const taxRate = Number.isFinite(args.taxRate)
    ? Math.max(0, Math.min(100, args.taxRate))
    : 0;

  const subtotal = roundMoney(unitPrice * quantity);
  const tax = roundMoney(subtotal * (taxRate / 100));
  const total = roundMoney(subtotal + tax);

  return { line_subtotal: subtotal, line_tax: tax, line_total: total };
}

async function getMediaQuoteWithItems(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
}) {
  const { supabase, quoteId } = args;

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select(
      "*,pro_user_id,establishment_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes),establishments(id,name,city)",
    )
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) throw new Error(quoteErr.message);
  if (!quote) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("quote_id", quoteId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  return { ...(quote as any), items: items ?? [] };
}

async function getMediaInvoiceWithItems(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
}) {
  const { supabase, invoiceId } = args;

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select(
      "*,pro_user_id,establishment_id,pro_profiles(user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes),establishments(id,name,city),media_quotes(id,quote_number)",
    )
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) throw new Error(invErr.message);
  if (!invoice) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("media_invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true })
    .limit(5000);

  if (itemsErr) throw new Error(itemsErr.message);

  return { ...(invoice as any), items: items ?? [] };
}

async function ensureMediaQuotePublicLink(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  quoteId: string;
  baseUrl: string;
  expiresDays?: number;
}): Promise<{ token: string; publicUrl: string; expiresAt: string }> {
  const { supabase, quoteId, baseUrl } = args;
  const expiresDays =
    typeof args.expiresDays === "number" && Number.isFinite(args.expiresDays)
      ? Math.max(1, Math.floor(args.expiresDays))
      : 30;

  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Keep at most one active link per quote (delete previous unused links)
  await supabase
    .from("media_quote_public_links")
    .delete()
    .eq("quote_id", quoteId)
    .is("used_at", null);

  const { error } = await supabase
    .from("media_quote_public_links")
    .insert({ quote_id: quoteId, token_hash: tokenHash, expires_at: expiresAt })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const publicUrl = `${baseUrl}/quotes/${encodeURIComponent(token)}`;
  return { token, publicUrl, expiresAt };
}

async function ensureMediaInvoicePublicLink(args: {
  supabase: ReturnType<typeof getAdminSupabase>;
  invoiceId: string;
  baseUrl: string;
  expiresDays?: number;
}): Promise<{ token: string; publicUrl: string; expiresAt: string }> {
  const { supabase, invoiceId, baseUrl } = args;
  const expiresDays =
    typeof args.expiresDays === "number" && Number.isFinite(args.expiresDays)
      ? Math.max(1, Math.floor(args.expiresDays))
      : 30;

  const token = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(token);
  const expiresAt = new Date(
    Date.now() + expiresDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Keep at most one active link per invoice (delete previous unused links)
  await supabase
    .from("media_invoice_public_links")
    .delete()
    .eq("invoice_id", invoiceId)
    .is("used_at", null);

  const { error } = await supabase
    .from("media_invoice_public_links")
    .insert({
      invoice_id: invoiceId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const publicUrl = `${baseUrl}/invoices/${encodeURIComponent(token)}`;
  return { token, publicUrl, expiresAt };
}

// ---------------------------------------------------------------------------
// Pro profiles (clients = Pro)
// ---------------------------------------------------------------------------

type ProProfileRow = {
  user_id: string;
  client_type: string;
  company_name: string | null;
  contact_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  country: string | null;
  ice: string | null;
  rc: string | null;
  notes: string | null;
};

type ProProfileAdminItem = ProProfileRow & {
  establishments: Array<{
    id: string;
    name: string | null;
    city: string | null;
  }>;
};

export const listAdminProProfiles: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(200, Math.max(1, Math.floor(limitRaw)))
    : 50;

  const supabase = getAdminSupabase();

  // 1) Récupérer les PROs depuis pro_profiles
  // Note: Using only columns that exist in the base table (extended fields may not be migrated yet)
  let query = supabase
    .from("pro_profiles")
    .select(
      "user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes",
    )
    .order("company_name", { ascending: true })
    .limit(limit);

  if (q) {
    const safe = q.replace(/,/g, " ").trim();
    const filters = [
      `company_name.ilike.%${safe}%`,
      `email.ilike.%${safe}%`,
      `contact_name.ilike.%${safe}%`,
      `city.ilike.%${safe}%`,
    ];
    if (isUuid(safe)) filters.push(`user_id.eq.${safe}`);
    query = query.or(filters.join(","));
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const profiles = (data ?? []) as any[];
  const existingUserIds = new Set(
    profiles.map((p) => String(p.user_id ?? "")).filter(Boolean)
  );

  // 2) Également récupérer les PROs créés via admin_audit_log qui n'ont pas d'entrée dans pro_profiles
  const { data: auditLogs } = await supabase
    .from("admin_audit_log")
    .select("entity_id,metadata,created_at")
    .eq("action", "pro.user.create")
    .not("entity_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);

  // Ajouter les PROs de l'audit log qui ne sont pas déjà dans pro_profiles
  for (const auditLog of (auditLogs ?? []) as any[]) {
    const userId = String(auditLog.entity_id ?? "");
    if (!userId || existingUserIds.has(userId)) continue;

    const metadata = auditLog.metadata ?? {};
    const email = String(metadata.email ?? "");

    // Filtrer par recherche si présente
    if (q) {
      const safe = q.toLowerCase();
      const matchesEmail = email.toLowerCase().includes(safe);
      const matchesId = isUuid(q) && userId === q;
      if (!matchesEmail && !matchesId) continue;
    }

    profiles.push({
      user_id: userId,
      client_type: "A",
      company_name: null,
      contact_name: null,
      first_name: null,
      last_name: null,
      email: email || null,
      phone: null,
      city: null,
      address: null,
      postal_code: null,
      country: "Maroc",
      ice: null,
      rc: null,
      notes: null,
    });
    existingUserIds.add(userId);
  }

  const userIds = Array.from(existingUserIds);

  const out: ProProfileAdminItem[] = [];
  if (!userIds.length) return res.json({ ok: true, items: out });

  const { data: memberships, error: memErr } = await supabase
    .from("pro_establishment_memberships")
    .select("user_id,establishment_id,role,created_at")
    .in("user_id", userIds)
    .limit(5000);

  if (memErr) return res.status(500).json({ error: memErr.message });

  const memRows = (memberships ?? []) as any[];
  const establishmentIds = Array.from(
    new Set(
      memRows.map((m) => String(m.establishment_id ?? "")).filter(Boolean),
    ),
  );

  const { data: establishments, error: estErr } = establishmentIds.length
    ? await supabase
        .from("establishments")
        .select("id,name,city")
        .in("id", establishmentIds)
        .limit(2000)
    : ({ data: [], error: null } as any);

  if (estErr) return res.status(500).json({ error: estErr.message });

  const estById = new Map<
    string,
    { id: string; name: string | null; city: string | null }
  >();
  for (const e of (establishments ?? []) as any[]) {
    const id = typeof e?.id === "string" ? e.id : "";
    if (!id) continue;
    estById.set(id, {
      id,
      name: typeof e.name === "string" ? e.name : null,
      city: typeof e.city === "string" ? e.city : null,
    });
  }

  const memByUser = new Map<
    string,
    Array<{ establishment_id: string; role: string; created_at: string | null }>
  >();
  for (const m of memRows) {
    const uid = typeof m?.user_id === "string" ? m.user_id : "";
    const eid =
      typeof m?.establishment_id === "string" ? m.establishment_id : "";
    if (!uid || !eid) continue;
    const list = memByUser.get(uid) ?? [];
    list.push({
      establishment_id: eid,
      role: String(m.role ?? ""),
      created_at: typeof m.created_at === "string" ? m.created_at : null,
    });
    memByUser.set(uid, list);
  }

  for (const p of profiles) {
    const uid = String(p.user_id ?? "");
    const mem = memByUser.get(uid) ?? [];
    mem.sort((a, b) => {
      const ar = a.role === "owner" ? 0 : 1;
      const br = b.role === "owner" ? 0 : 1;
      if (ar !== br) return ar - br;
      return String(a.created_at ?? "").localeCompare(
        String(b.created_at ?? ""),
      );
    });

    const establishmentsForUser = mem
      .map((m) => estById.get(m.establishment_id) ?? null)
      .filter(Boolean) as Array<{
      id: string;
      name: string | null;
      city: string | null;
    }>;

    out.push({
      user_id: uid,
      client_type: String(p.client_type ?? ""),
      company_name: typeof p.company_name === "string" ? p.company_name : null,
      contact_name: typeof p.contact_name === "string" ? p.contact_name : null,
      first_name: typeof p.first_name === "string" ? p.first_name : null,
      last_name: typeof p.last_name === "string" ? p.last_name : null,
      email: typeof p.email === "string" ? p.email : null,
      phone: typeof p.phone === "string" ? p.phone : null,
      city: typeof p.city === "string" ? p.city : null,
      address: typeof p.address === "string" ? p.address : null,
      postal_code: typeof p.postal_code === "string" ? p.postal_code : null,
      country: typeof p.country === "string" ? p.country : null,
      ice: typeof p.ice === "string" ? p.ice : null,
      rc: typeof p.rc === "string" ? p.rc : null,
      notes: typeof p.notes === "string" ? p.notes : null,
      establishments: establishmentsForUser,
    });
  }

  return res.json({ ok: true, items: out });
};

export const getAdminProProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = String(req.params.id ?? "").trim();
  if (!userId || !isUuid(userId)) {
    return res.status(400).json({ error: "ID utilisateur invalide" });
  }

  const supabase = getAdminSupabase();

  // Note: Using only columns that exist in the base table (extended fields may not be migrated yet)
  const { data: profile, error } = await supabase
    .from("pro_profiles")
    .select(
      "user_id,client_type,company_name,contact_name,email,phone,city,address,ice,notes",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });

  if (!profile) {
    // Check if the user exists in audit log
    const { data: auditLog } = await supabase
      .from("admin_audit_log")
      .select("entity_id,metadata")
      .eq("action", "pro.user.create")
      .eq("entity_id", userId)
      .maybeSingle();

    if (auditLog) {
      const metadata = auditLog.metadata ?? {};
      return res.json({
        ok: true,
        profile: {
          user_id: userId,
          client_type: "A",
          company_name: null,
          contact_name: null,
          email: String(metadata.email ?? "") || null,
          phone: null,
          city: null,
          address: null,
          ice: null,
          notes: null,
          establishments: [],
        },
      });
    }

    return res.status(404).json({ error: "Profil Pro non trouvé" });
  }

  // Get establishments
  const { data: memberships } = await supabase
    .from("pro_establishment_memberships")
    .select("establishment_id,role,created_at")
    .eq("user_id", userId)
    .limit(100);

  const establishmentIds = (memberships ?? [])
    .map((m: any) => String(m.establishment_id ?? ""))
    .filter(Boolean);

  let establishments: Array<{ id: string; name: string | null; city: string | null }> = [];
  if (establishmentIds.length) {
    const { data: estData } = await supabase
      .from("establishments")
      .select("id,name,city")
      .in("id", establishmentIds);

    establishments = (estData ?? []).map((e: any) => ({
      id: String(e.id ?? ""),
      name: typeof e.name === "string" ? e.name : null,
      city: typeof e.city === "string" ? e.city : null,
    }));
  }

  return res.json({
    ok: true,
    profile: {
      user_id: profile.user_id,
      client_type: String(profile.client_type ?? ""),
      company_name: profile.company_name,
      contact_name: profile.contact_name,
      first_name: (profile as any).first_name,
      last_name: (profile as any).last_name,
      email: profile.email,
      phone: profile.phone,
      city: profile.city,
      address: profile.address,
      postal_code: (profile as any).postal_code,
      country: (profile as any).country,
      ice: profile.ice,
      rc: (profile as any).rc,
      notes: profile.notes,
      establishments,
    },
  });
};

export const updateAdminProProfile: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const userId = String(req.params.id ?? "").trim();
  if (!userId || !isUuid(userId)) {
    return res.status(400).json({ error: "ID utilisateur invalide" });
  }

  const body = req.body ?? {};
  const updates: Record<string, any> = {};

  // Validate and collect fields to update
  if ("company_name" in body) {
    updates.company_name = typeof body.company_name === "string" ? body.company_name.trim() || null : null;
  }
  if ("contact_name" in body) {
    updates.contact_name = typeof body.contact_name === "string" ? body.contact_name.trim() || null : null;
  }
  if ("first_name" in body) {
    updates.first_name = typeof body.first_name === "string" ? body.first_name.trim() || null : null;
  }
  if ("last_name" in body) {
    updates.last_name = typeof body.last_name === "string" ? body.last_name.trim() || null : null;
  }
  if ("email" in body) {
    updates.email = typeof body.email === "string" ? body.email.trim().toLowerCase() || null : null;
  }
  if ("phone" in body) {
    updates.phone = typeof body.phone === "string" ? body.phone.trim() || null : null;
  }
  if ("city" in body) {
    updates.city = typeof body.city === "string" ? body.city.trim() || null : null;
  }
  if ("address" in body) {
    updates.address = typeof body.address === "string" ? body.address.trim() || null : null;
  }
  if ("postal_code" in body) {
    updates.postal_code = typeof body.postal_code === "string" ? body.postal_code.trim() || null : null;
  }
  if ("country" in body) {
    updates.country = typeof body.country === "string" ? body.country.trim() || null : null;
  }
  if ("ice" in body) {
    updates.ice = typeof body.ice === "string" ? body.ice.trim() || null : null;
  }
  if ("rc" in body) {
    updates.rc = typeof body.rc === "string" ? body.rc.trim() || null : null;
  }
  if ("notes" in body) {
    updates.notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
  }
  if ("client_type" in body) {
    const ct = String(body.client_type ?? "").toUpperCase();
    if (ct === "A" || ct === "B") {
      updates.client_type = ct;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Aucune modification fournie" });
  }

  const supabase = getAdminSupabase();

  // Check if profile exists, create if not
  const { data: existing } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    // Create new profile
    const { error: insertErr } = await supabase
      .from("pro_profiles")
      .insert({
        user_id: userId,
        client_type: updates.client_type ?? "A",
        ...updates,
      });

    if (insertErr) {
      log.error({ err: insertErr }, "Error creating pro_profile");
      return res.status(500).json({ error: insertErr.message });
    }
  } else {
    // Update existing profile
    const { error: updateErr } = await supabase
      .from("pro_profiles")
      .update(updates)
      .eq("user_id", userId);

    if (updateErr) {
      log.error({ err: updateErr }, "Error updating pro_profile");
      return res.status(500).json({ error: updateErr.message });
    }
  }

  // Log the update
  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "pro.profile.update",
    entity_type: "pro_profile",
    entity_id: userId,
    metadata: { updates, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  return res.json({ ok: true });
};

// ---------------------------------------------------------------------------
// Media Quotes
// ---------------------------------------------------------------------------

export const listAdminMediaQuotes: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "";
  const clientType =
    typeof req.query.client_type === "string"
      ? req.query.client_type.trim().toUpperCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("media_quotes")
    .select(
      "id,quote_number,status,client_type,pro_user_id,establishment_id,issued_at,valid_until,currency,subtotal_amount,tax_amount,total_amount,sent_at,accepted_at,rejected_at,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,city,ice),establishments(id,name,city)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);
  if (
    clientType &&
    clientType !== "ALL" &&
    (clientType === "A" || clientType === "B")
  )
    q = q.eq("pro_profiles.client_type", clientType);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, quotes: data ?? [] });
};

export const getAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });
    return res.json({ ok: true, quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const createAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;
  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });

  const body = req.body as MediaCreateQuoteInput;

  const proUserIdRaw = (body as any).pro_user_id;
  const proUserId = typeof proUserIdRaw === "string" ? proUserIdRaw.trim() : "";
  if (!proUserId || !isUuid(proUserId))
    return res.status(400).json({ error: "Identifiant Pro requis" });

  const establishmentIdRaw = (body as any).establishment_id;
  const establishmentId =
    typeof establishmentIdRaw === "string" ? establishmentIdRaw.trim() : "";
  const establishmentIdOrNull =
    establishmentId && isUuid(establishmentId) ? establishmentId : null;
  if (establishmentId && !establishmentIdOrNull)
    return res.status(400).json({ error: "Identifiant d'établissement invalide" });

  const validUntil = safeIsoOrNull(body.valid_until);
  const currency = safeCurrency(body.currency);

  const supabase = getAdminSupabase();

  const { data: pro, error: proErr } = await supabase
    .from("pro_profiles")
    .select("user_id")
    .eq("user_id", proUserId)
    .maybeSingle();

  if (proErr) return res.status(500).json({ error: proErr.message });
  if (!pro) return res.status(404).json({ error: "pro_not_found" });

  if (establishmentIdOrNull) {
    const { data: est, error: estErr } = await supabase
      .from("establishments")
      .select("id")
      .eq("id", establishmentIdOrNull)
      .maybeSingle();
    if (estErr) return res.status(500).json({ error: estErr.message });
    if (!est) return res.status(400).json({ error: "establishment_not_found" });
  }

  try {
    const quoteNumber = await nextMediaQuoteNumber(supabase);

    const payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ?? (body as any).paymentMethod,
    );

    const payload: Record<string, unknown> = {
      quote_number: quoteNumber,
      status: "draft",
      client_type: "pro",
      pro_user_id: proUserId,
      establishment_id: establishmentIdOrNull,
      issued_at: new Date().toISOString(),
      valid_until: validUntil,
      currency,
      payment_method,
      notes: safeString(body.notes),
      payment_terms: safeString(body.payment_terms),
      delivery_estimate: safeString(body.delivery_estimate),
      subtotal_amount: 0,
      tax_amount: 0,
      total_amount: 0,
      created_by_admin_id: (() => {
        const actorSub = getAdminSessionSubAny(req);
        return actorSub && isUuid(actorSub) ? actorSub : null;
      })(),
    };

    const { data, error } = await supabase
      .from("media_quotes")
      .insert(payload)
      .select("id")
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const actor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: actor.actor_id,
      action: "media.quote.create",
      entity_type: "media_quotes",
      entity_id: (data as any)?.id ?? null,
      metadata: { after: payload, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
    });

    const quote = await getMediaQuoteWithItems({
      supabase,
      quoteId: (data as any).id,
    });
    return res.json({ ok: true, quote });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const updateAdminMediaQuote: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaUpdateQuoteInput;

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const s =
      typeof body.status === "string" ? body.status.trim().toLowerCase() : "";
    const next =
      s === "draft" ||
      s === "sent" ||
      s === "accepted" ||
      s === "rejected" ||
      s === "expired" ||
      s === "cancelled"
        ? s
        : null;
    if (!next) return res.status(400).json({ error: "invalid_status" });
    patch.status = next;
    if (next === "sent") patch.sent_at = new Date().toISOString();
    if (next === "accepted") patch.accepted_at = new Date().toISOString();
    if (next === "rejected") patch.rejected_at = new Date().toISOString();
  }

  if (body.valid_until !== undefined)
    patch.valid_until = safeIsoOrNull(body.valid_until);
  if (body.currency !== undefined) patch.currency = safeCurrency(body.currency);
  if (body.notes !== undefined) patch.notes = safeString(body.notes);
  if (body.payment_terms !== undefined)
    patch.payment_terms = safeString(body.payment_terms);
  if (body.delivery_estimate !== undefined)
    patch.delivery_estimate = safeString(body.delivery_estimate);

  if (
    (body as any).payment_method !== undefined ||
    (body as any).paymentMethod !== undefined
  ) {
    patch.payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ?? (body as any).paymentMethod,
    );
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId)
    .select("id")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.quote.update",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const quote = await getMediaQuoteWithItems({
    supabase,
    quoteId: (data as any).id,
  });
  return res.json({ ok: true, quote });
};

export const addAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaAddQuoteItemInput;

  const quantityRaw = safeInt(body.quantity);
  const quantity = Math.max(1, quantityRaw || 1);

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status,client_type")
    .eq("id", quoteId)
    .maybeSingle();

  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const catalogItemId =
    typeof body.catalog_item_id === "string" ? body.catalog_item_id.trim() : "";

  // Catalog-linked line
  if (catalogItemId) {
    const { data: offer, error: offerErr } = await supabase
      .from("visibility_offers")
      .select(
        "id,title,description,type,category,currency,price_cents,tax_rate_bps,tax_rate,active,is_quotable,is_external_allowed,deleted_at",
      )
      .eq("id", catalogItemId)
      .maybeSingle();

    if (offerErr) return res.status(500).json({ error: offerErr.message });
    if (!offer)
      return res.status(404).json({ error: "catalog_item_not_found" });

    const isActive =
      Boolean((offer as any).active) && !(offer as any).deleted_at;
    const isQuotable = (offer as any).is_quotable !== false;
    const externalAllowed = (offer as any).is_external_allowed !== false;

    if (!isActive || !isQuotable)
      return res.status(400).json({ error: "catalog_item_not_quotable" });
    if ((quote as any).client_type === "external" && !externalAllowed)
      return res
        .status(400)
        .json({ error: "catalog_item_not_allowed_for_external" });

    const title = safeString((offer as any).title) ?? "";
    const itemType = safeString((offer as any).type) ?? "service";
    const category = safeString((offer as any).category);

    const unitPrice = roundMoney(
      (safeInt((offer as any).price_cents) || 0) / 100,
    );

    const taxRate = (() => {
      const n = Number((offer as any).tax_rate);
      if (Number.isFinite(n)) return normalizePercent(n);
      const bps = safeInt((offer as any).tax_rate_bps);
      return normalizePercent(bps / 100);
    })();

    const line = computeMediaLine({ unitPrice, quantity, taxRate });

    const payload: Record<string, unknown> = {
      quote_id: quoteId,
      catalog_item_id: catalogItemId,
      item_type: itemType,
      name_snapshot: title,
      description_snapshot: safeString((offer as any).description),
      category_snapshot: category,
      unit_price_snapshot: unitPrice,
      quantity,
      tax_rate_snapshot: taxRate,
      ...line,
    };

    const { error } = await supabase.from("media_quote_items").insert(payload);
    if (error) return res.status(500).json({ error: error.message });

    await recomputeMediaQuoteTotals({ supabase, quoteId });

    const next = await getMediaQuoteWithItems({ supabase, quoteId });
    return res.json({ ok: true, quote: next });
  }

  // Free line (superadmin only)
  if (!requireSuperadmin(req, res)) return;

  const itemType = safeString(body.item_type) ?? "service";
  const name = safeString(body.name);
  if (!name)
    return res.status(400).json({ error: "name is required for free line" });

  const unitPrice = roundMoney(safeMoneyNumber(body.unit_price));
  const taxRate = normalizePercent(body.tax_rate);

  const line = computeMediaLine({ unitPrice, quantity, taxRate });

  const payload: Record<string, unknown> = {
    quote_id: quoteId,
    catalog_item_id: null,
    item_type: itemType,
    name_snapshot: name,
    description_snapshot: safeString(body.description),
    category_snapshot: safeString(body.category),
    unit_price_snapshot: unitPrice,
    quantity,
    tax_rate_snapshot: taxRate,
    ...line,
  };

  const { error } = await supabase.from("media_quote_items").insert(payload);
  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const updateAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  if (!isRecord(req.body))
    return res.status(400).json({ error: "Corps de requête invalide" });
  const body = req.body as MediaUpdateQuoteItemInput;

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const { data: before, error: beforeErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("id", itemId)
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "item_not_found" });

  const patch: Record<string, unknown> = {};

  if (body.quantity !== undefined) {
    const q = safeInt(body.quantity);
    patch.quantity = Math.max(1, q || 1);
  }

  if (!Object.keys(patch).length)
    return res.status(400).json({ error: "Aucune modification fournie" });

  const nextQuantity =
    typeof patch.quantity === "number"
      ? (patch.quantity as number)
      : safeInt((before as any).quantity) || 1;

  const unitPrice = Number((before as any).unit_price_snapshot ?? 0);
  const taxRate = Number((before as any).tax_rate_snapshot ?? 0);

  const line = computeMediaLine({
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
    quantity: nextQuantity,
    taxRate: Number.isFinite(taxRate) ? taxRate : 0,
  });

  const fullPatch = { ...patch, ...line };

  const { error } = await supabase
    .from("media_quote_items")
    .update(fullPatch)
    .eq("id", itemId)
    .eq("quote_id", quoteId);

  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.quote_item.update",
    entity_type: "media_quote_items",
    entity_id: itemId,
    metadata: { before, after: fullPatch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const deleteAdminMediaQuoteItem: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  const itemId = typeof req.params.itemId === "string" ? req.params.itemId : "";

  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });
  if (!itemId) return res.status(400).json({ error: "Identifiant d'article requis" });

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id,status")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const quoteStatus = String((quote as any).status ?? "")
    .trim()
    .toLowerCase();
  if (quoteStatus !== "draft")
    return res.status(409).json({ error: "quote_not_editable" });

  const { data: before, error: beforeErr } = await supabase
    .from("media_quote_items")
    .select("*")
    .eq("id", itemId)
    .eq("quote_id", quoteId)
    .maybeSingle();

  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "item_not_found" });

  const { error } = await supabase
    .from("media_quote_items")
    .delete()
    .eq("id", itemId)
    .eq("quote_id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  await recomputeMediaQuoteTotals({ supabase, quoteId });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.quote_item.delete",
    entity_type: "media_quote_items",
    entity_id: itemId,
    metadata: { before, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const createAdminMediaQuotePublicLink: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: quote, error: quoteErr } = await supabase
    .from("media_quotes")
    .select("id")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteErr) return res.status(500).json({ error: quoteErr.message });
  if (!quote) return res.status(404).json({ error: "quote_not_found" });

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  try {
    const link = await ensureMediaQuotePublicLink({
      supabase,
      quoteId,
      baseUrl,
    });

    const actor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: actor.actor_id,
      action: "media.quote.public_link.create",
      entity_type: "media_quote_public_links",
      entity_id: quoteId,
      metadata: {
        expires_at: link.expiresAt,
        actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
      },
    });

    return res.json({
      ok: true,
      public_link: link.publicUrl,
      expires_at: link.expiresAt,
      token: link.token,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const downloadAdminMediaQuotePdf: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    const company = await getBillingCompanyProfile();
    const items = (quote.items ?? []).map((it: any) => ({
      name_snapshot: String(it.name_snapshot ?? ""),
      description_snapshot: it.description_snapshot ?? null,
      quantity: Number(it.quantity ?? 0),
      unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
      tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));

    const pdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items,
    });

    const filename = `${String((quote as any).quote_number ?? "devis")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const downloadAdminMediaInvoicePdf: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

    const company = await getBillingCompanyProfile();
    const items = (invoice.items ?? []).map((it: any) => ({
      name_snapshot: String(it.name_snapshot ?? ""),
      description_snapshot: it.description_snapshot ?? null,
      quantity: Number(it.quantity ?? 0),
      unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
      tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
      line_total: Number(it.line_total ?? 0),
    }));

    const pdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items,
    });

    const filename = `${String((invoice as any).invoice_number ?? "facture")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${filename}\"`,
    );
    return res.status(200).send(pdf);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const createAdminMediaInvoicePublicLink: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select("id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const baseUrl = getRequestBaseUrl(req);
  if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

  try {
    const link = await ensureMediaInvoicePublicLink({
      supabase,
      invoiceId,
      baseUrl,
    });

    const actor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: actor.actor_id,
      action: "media.invoice.public_link.create",
      entity_type: "media_invoice_public_links",
      entity_id: invoiceId,
      metadata: {
        expires_at: link.expiresAt,
        actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
      },
    });

    return res.json({
      ok: true,
      public_link: link.publicUrl,
      expires_at: link.expiresAt,
      token: link.token,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const sendAdminMediaQuoteEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaSendQuoteEmailInput)
    : ({} as MediaSendQuoteEmailInput);
  const lang = normalizeLang(body.lang);

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    if (
      !quote.items ||
      !Array.isArray(quote.items) ||
      quote.items.length === 0
    ) {
      return res.status(400).json({ error: "quote_has_no_items" });
    }

    const baseUrl = getRequestBaseUrl(req);
    if (!baseUrl) return res.status(500).json({ error: "missing_base_url" });

    const link = await ensureMediaQuotePublicLink({
      supabase,
      quoteId,
      baseUrl,
    });

    const pro = isRecord((quote as any).pro_profiles)
      ? ((quote as any).pro_profiles as any)
      : null;
    if (!pro) return res.status(500).json({ error: "missing_pro_profile" });

    const establishment = isRecord((quote as any).establishments)
      ? ((quote as any).establishments as any)
      : null;

    const proClientType = String(pro.client_type ?? "").toUpperCase();
    const isTypeA = proClientType === "A";

    const toEmail =
      parseEmail((body as any).to_email) || parseEmail(pro.email) || null;
    if (!toEmail)
      return res.status(400).json({ error: "Adresse email destinataire requise" });

    const contactName =
      safeString(pro.contact_name) || safeString(pro.company_name) || "";

    const companyName =
      safeString(pro.company_name) || safeString(establishment?.name) || "Pro";
    const establishmentName = safeString(establishment?.name) || "";

    const totalAmount = roundMoney(Number(quote.total_amount ?? 0));
    const dueDate = quote.valid_until
      ? new Date(String(quote.valid_until)).toLocaleDateString(
          lang === "en" ? "en-GB" : "fr-FR",
        )
      : "";

    const greeting = contactName
      ? lang === "en"
        ? `Hello ${contactName},`
        : `Bonjour ${contactName},`
      : lang === "en"
        ? "Hello,"
        : "Bonjour,";

    const issuerContactPhone =
      safeString(process.env.ISSUER_CONTACT_PHONE) || "";

    const subject =
      lang === "en"
        ? `Your quote — ${quote.quote_number}`
        : isTypeA
          ? `Votre devis SAM Media — ${quote.quote_number}`
          : `Votre devis — ${quote.quote_number}`;

    const bodyText =
      lang === "en"
        ? `${greeting}\n\nPlease find attached your quote ${quote.quote_number}.\n\nTotal: ${totalAmount} ${quote.currency}\nValid until: ${dueDate}\n\nView / accept the quote: ${link.publicUrl}\n\nBest regards,\nSAM Media`
        : isTypeA
          ? [
              greeting,
              ...(establishmentName
                ? [`Suite à nos échanges concernant ${establishmentName},`]
                : ["Suite à nos échanges, "]),
              `veuillez trouver ci-joint votre devis ${quote.quote_number}.`,
              "Récapitulatif",
              ...(establishmentName
                ? [`Établissement : ${establishmentName}`]
                : []),
              `Montant total : ${totalAmount} ${quote.currency}`,
              `Validité : jusqu'au ${dueDate}`.trim(),
              `👉 Consulter / accepter le devis : ${link.publicUrl}`,
              "Ce devis concerne des prestations de visibilité et de communication proposées par SAM Media.",
              "Cordialement,",
              "L'équipe SAM Media",
              ...(issuerContactPhone ? [issuerContactPhone] : []),
            ].join("\n\n")
          : [
              greeting,
              `Veuillez trouver ci-joint votre devis ${quote.quote_number} concernant nos services de visibilité et médias.`,
              "Récapitulatif",
              `Société : ${companyName}`,
              `Montant total : ${totalAmount} ${quote.currency}`,
              `Validité : jusqu'au ${dueDate}`.trim(),
              `👉 Consulter / accepter le devis : ${link.publicUrl}`,
              "Nous restons à votre disposition pour toute question.",
              "Cordialement,",
              "L'équipe SAM Media",
            ].join("\n\n");

    const emailId = randomBytes(16).toString("hex");

    const company = await getBillingCompanyProfile();
    const quotePdf = await generateMediaQuotePdfBuffer({
      company,
      quote: quote as any,
      items: (quote.items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const sent = await sendLoggedEmail({
      emailId,
      fromKey: "hello",
      to: [toEmail],
      subject,
      bodyText,
      ctaLabel: lang === "en" ? "View quote" : "Consulter le devis",
      ctaUrl: link.publicUrl,
      attachments: [
        {
          filename: `${quote.quote_number}.pdf`,
          content: quotePdf,
          contentType: "application/pdf",
        },
      ],
      variables: {
        quote_number: String(quote.quote_number ?? ""),
        total_amount: String(totalAmount),
        currency: String(quote.currency ?? ""),
        due_date: dueDate,
        public_link: link.publicUrl,
        contact_name: contactName,
        company_name: companyName,
        establishment_name: establishmentName,
        pro_client_type: proClientType,
        issuer_contact_phone: issuerContactPhone,
      },
      meta: {
        kind: "media_quote",
        quote_id: quoteId,
        pro_user_id: safeString((quote as any).pro_user_id) || null,
        pro_client_type: proClientType,
      },
    });

    if (sent.ok !== true) return res.status(500).json({ error: sent.error });

    const patchAfterSend: Record<string, unknown> = {
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await supabase
      .from("media_quotes")
      .update(patchAfterSend)
      .eq("id", quoteId);
    if (updErr) return res.status(500).json({ error: updErr.message });

    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "media.quote.send_email",
      entity_type: "media_quotes",
      entity_id: quoteId,
      metadata: {
        to: toEmail,
        lang,
        email_id: sent.emailId,
        pro_user_id: safeString((quote as any).pro_user_id) || null,
        pro_client_type: proClientType,
        actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      },
    });

    const next = await getMediaQuoteWithItems({ supabase, quoteId });
    return res.json({
      ok: true,
      quote: next,
      email_id: sent.emailId,
      public_link: link.publicUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const markAdminMediaQuoteAccepted: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch = {
    status: "accepted",
    accepted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.quote.mark_accepted",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

export const markAdminMediaQuoteRejected: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  const { data: before, error: beforeErr } = await supabase
    .from("media_quotes")
    .select("*")
    .eq("id", quoteId)
    .maybeSingle();
  if (beforeErr) return res.status(500).json({ error: beforeErr.message });
  if (!before) return res.status(404).json({ error: "quote_not_found" });

  const patch = {
    status: "rejected",
    rejected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("media_quotes")
    .update(patch)
    .eq("id", quoteId);
  if (error) return res.status(500).json({ error: error.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.quote.mark_rejected",
    entity_type: "media_quotes",
    entity_id: quoteId,
    metadata: { before, after: patch, actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
  });

  const next = await getMediaQuoteWithItems({ supabase, quoteId });
  return res.json({ ok: true, quote: next });
};

// ---------------------------------------------------------------------------
// Media Invoices
// ---------------------------------------------------------------------------

export const convertAdminMediaQuoteToInvoice: RequestHandler = async (
  req,
  res,
) => {
  if (!requireAdminKey(req, res)) return;

  const quoteId = typeof req.params.id === "string" ? req.params.id : "";
  if (!quoteId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaConvertQuoteToInvoiceInput)
    : ({} as MediaConvertQuoteToInvoiceInput);

  const supabase = getAdminSupabase();

  try {
    const quote = await getMediaQuoteWithItems({ supabase, quoteId });
    if (!quote) return res.status(404).json({ error: "quote_not_found" });

    const status = String(quote.status ?? "")
      .trim()
      .toLowerCase();
    if (status !== "accepted")
      return res.status(409).json({ error: "quote_not_accepted" });

    const { data: existing, error: existingErr } = await supabase
      .from("media_invoices")
      .select("id,invoice_number")
      .eq("source_quote_id", quoteId)
      .limit(1)
      .maybeSingle();

    if (existingErr)
      return res.status(500).json({ error: existingErr.message });
    if (existing)
      return res.status(409).json({
        error: "invoice_already_exists",
        invoice_id: (existing as any).id,
      });

    const invoiceNumber = await nextMediaInvoiceNumber(supabase);
    const dueAt = safeIsoOrNull(body.due_at);

    const payment_method = normalizeMediaPaymentMethod(
      (body as any).payment_method ??
        (body as any).paymentMethod ??
        (quote as any).payment_method,
    );

    const payload: Record<string, unknown> = {
      invoice_number: invoiceNumber,
      status: "issued",
      source_quote_id: quoteId,
      client_type: "pro",
      pro_user_id: (quote as any).pro_user_id,
      establishment_id: (quote as any).establishment_id ?? null,
      issued_at: new Date().toISOString(),
      due_at: dueAt,
      currency: quote.currency,
      payment_method,
      notes: safeString(body.notes) ?? safeString(quote.notes),
      subtotal_amount: roundMoney(Number(quote.subtotal_amount ?? 0)),
      tax_amount: roundMoney(Number(quote.tax_amount ?? 0)),
      total_amount: roundMoney(Number(quote.total_amount ?? 0)),
      paid_amount: 0,
      created_by_admin_id: (() => {
        const actorSub = getAdminSessionSubAny(req);
        return actorSub && isUuid(actorSub) ? actorSub : null;
      })(),
    };

    const { data: created, error: createErr } = await supabase
      .from("media_invoices")
      .insert(payload)
      .select("id")
      .single();
    if (createErr) return res.status(500).json({ error: createErr.message });

    const invoiceId = (created as any).id as string;

    const itemsPayload = (quote.items ?? []).map((it: any) => ({
      invoice_id: invoiceId,
      catalog_item_id: it.catalog_item_id ?? null,
      item_type: it.item_type,
      name_snapshot: it.name_snapshot,
      description_snapshot: it.description_snapshot ?? null,
      category_snapshot: it.category_snapshot ?? null,
      unit_price_snapshot: it.unit_price_snapshot,
      quantity: it.quantity,
      tax_rate_snapshot: it.tax_rate_snapshot,
      line_subtotal: it.line_subtotal,
      line_tax: it.line_tax,
      line_total: it.line_total,
    }));

    if (itemsPayload.length) {
      const { error: itemsErr } = await supabase
        .from("media_invoice_items")
        .insert(itemsPayload);
      if (itemsErr) return res.status(500).json({ error: itemsErr.message });
    }

    await recomputeMediaInvoiceTotals({ supabase, invoiceId });

    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "media.quote.convert_to_invoice",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: {
        quote_id: quoteId,
        invoice_number: invoiceNumber,
        actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      },
    });

    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    return res.json({ ok: true, invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const listAdminMediaInvoices: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const status =
    typeof req.query.status === "string"
      ? req.query.status.trim().toLowerCase()
      : "";

  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 200;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 200;

  const supabase = getAdminSupabase();

  let q = supabase
    .from("media_invoices")
    .select(
      "id,invoice_number,status,source_quote_id,client_type,pro_user_id,establishment_id,issued_at,due_at,currency,subtotal_amount,tax_amount,total_amount,paid_amount,created_at,updated_at,pro_profiles(user_id,client_type,company_name,contact_name,email,city,ice),establishments(id,name,city),media_quotes(quote_number)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status && status !== "all") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ ok: true, invoices: data ?? [] });
};

export const getAdminMediaInvoice: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });
    return res.json({ ok: true, invoice });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const sendAdminMediaInvoiceEmail: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaSendInvoiceEmailInput)
    : ({} as MediaSendInvoiceEmailInput);
  const lang = normalizeLang(body.lang);

  const supabase = getAdminSupabase();

  try {
    const invoice = await getMediaInvoiceWithItems({ supabase, invoiceId });
    if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

    const pro = isRecord((invoice as any).pro_profiles)
      ? ((invoice as any).pro_profiles as any)
      : null;
    if (!pro) return res.status(500).json({ error: "missing_pro_profile" });

    const establishment = isRecord((invoice as any).establishments)
      ? ((invoice as any).establishments as any)
      : null;

    const proClientType = String(pro.client_type ?? "").toUpperCase();
    const isTypeA = proClientType === "A";

    const toEmail =
      parseEmail((body as any).to_email) || parseEmail(pro.email) || null;
    if (!toEmail)
      return res.status(400).json({ error: "Adresse email destinataire requise" });

    const contactName =
      safeString(pro.contact_name) || safeString(pro.company_name) || "";

    const greeting = contactName
      ? lang === "en"
        ? `Hello ${contactName},`
        : `Bonjour ${contactName},`
      : lang === "en"
        ? "Hello,"
        : "Bonjour,";

    const companyName = safeString(pro.company_name) || "Pro";
    const establishmentName = safeString(establishment?.name) || "";

    const quoteNumber =
      safeString((invoice as any).media_quotes?.quote_number) || "";

    const totalAmount = roundMoney(Number(invoice.total_amount ?? 0));
    const dueDate = invoice.due_at
      ? new Date(String(invoice.due_at)).toLocaleDateString(
          lang === "en" ? "en-GB" : "fr-FR",
        )
      : "";

    const paymentLink = (() => {
      const raw = safeString((body as any).payment_link);
      if (!raw) return null;
      if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
      return null;
    })();

    const subject =
      lang === "en"
        ? `Your invoice — ${invoice.invoice_number}`
        : isTypeA
          ? `Facture ${invoice.invoice_number}${establishmentName ? ` — ${establishmentName}` : ""}`
          : `Facture ${invoice.invoice_number}`;

    const bodyText =
      lang === "en"
        ? `${greeting}\n\nPlease find attached your invoice ${invoice.invoice_number}${quoteNumber ? ` (quote: ${quoteNumber})` : ""}.\n\nTotal: ${totalAmount} ${invoice.currency}\nDue date: ${dueDate}\n\nBest regards,\nSAM Media`
        : isTypeA
          ? [
              greeting,
              `Veuillez trouver ci-joint votre facture ${invoice.invoice_number},`,
              ...(establishmentName
                ? [
                    `relative aux prestations réalisées pour ${establishmentName}.`,
                  ]
                : ["relative aux prestations réalisées."]),
              `Montant TTC : ${totalAmount} ${invoice.currency}`,
              `Échéance : ${dueDate}`.trim(),
              ...(paymentLink ? [`👉 Payer en ligne : ${paymentLink}`] : []),
              "Merci pour votre confiance,",
              "SAM Media",
            ].join("\n\n")
          : [
              greeting,
              `Veuillez trouver ci-joint votre facture ${invoice.invoice_number} concernant les services de visibilité fournis.`,
              `Société : ${companyName}`,
              `Montant TTC : ${totalAmount} ${invoice.currency}`,
              `Échéance : ${dueDate}`.trim(),
              ...(paymentLink ? [`👉 Payer en ligne : ${paymentLink}`] : []),
              "Cordialement,",
              "L'équipe SAM Media",
            ].join("\n\n");

    const emailId = randomBytes(16).toString("hex");

    const company = await getBillingCompanyProfile();
    const invoicePdf = await generateMediaInvoicePdfBuffer({
      company,
      invoice: invoice as any,
      items: (invoice.items ?? []).map((it: any) => ({
        name_snapshot: String(it.name_snapshot ?? ""),
        description_snapshot: it.description_snapshot ?? null,
        quantity: Number(it.quantity ?? 0),
        unit_price_snapshot: Number(it.unit_price_snapshot ?? 0),
        tax_rate_snapshot: Number(it.tax_rate_snapshot ?? 0),
        line_total: Number(it.line_total ?? 0),
      })),
    });

    const sent = await sendLoggedEmail({
      emailId,
      fromKey: "finance",
      to: [toEmail],
      subject,
      bodyText,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: invoicePdf,
          contentType: "application/pdf",
        },
      ],
      variables: {
        invoice_number: String(invoice.invoice_number ?? ""),
        quote_number: quoteNumber,
        total_amount: String(totalAmount),
        currency: String(invoice.currency ?? ""),
        due_date: dueDate,
        contact_name: contactName,
        company_name: companyName,
        establishment_name: establishmentName,
        payment_link: paymentLink,
        pro_client_type: proClientType,
      },
      meta: {
        kind: "media_invoice",
        invoice_id: invoiceId,
        pro_user_id: safeString((invoice as any).pro_user_id) || null,
        pro_client_type: proClientType,
      },
    });

    if (sent.ok !== true) return res.status(500).json({ error: sent.error });

    const auditActor = getAuditActorInfo(req);
    await supabase.from("admin_audit_log").insert({
      actor_id: auditActor.actor_id,
      action: "media.invoice.send_email",
      entity_type: "media_invoices",
      entity_id: invoiceId,
      metadata: {
        to: toEmail,
        lang,
        email_id: sent.emailId,
        pro_user_id: safeString((invoice as any).pro_user_id) || null,
        pro_client_type: proClientType,
        actor_email: auditActor.actor_email, actor_name: auditActor.actor_name, actor_role: auditActor.actor_role,
      },
    });

    return res.json({ ok: true, email_id: sent.emailId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e ?? "Error");
    return res.status(500).json({ error: msg });
  }
};

export const markAdminMediaInvoicePaid: RequestHandler = async (req, res) => {
  if (!requireAdminKey(req, res)) return;

  const invoiceId = typeof req.params.id === "string" ? req.params.id : "";
  if (!invoiceId) return res.status(400).json({ error: "Identifiant requis" });

  const body = isRecord(req.body)
    ? (req.body as MediaMarkInvoicePaidInput)
    : ({} as MediaMarkInvoicePaidInput);

  const amount = roundMoney(safeMoneyNumber(body.amount));
  if (!amount || amount <= 0)
    return res.status(400).json({ error: "amount must be > 0" });

  const methodRaw =
    typeof body.method === "string" ? body.method.trim().toLowerCase() : "";
  const method =
    methodRaw === "card" ||
    methodRaw === "bank_transfer" ||
    methodRaw === "cash" ||
    methodRaw === "other"
      ? methodRaw
      : "other";

  const paidAt = safeIsoOrNull(body.paid_at) ?? new Date().toISOString();

  const supabase = getAdminSupabase();

  const { data: invoice, error: invErr } = await supabase
    .from("media_invoices")
    .select("id,total_amount,paid_amount,status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (invErr) return res.status(500).json({ error: invErr.message });
  if (!invoice) return res.status(404).json({ error: "invoice_not_found" });

  const total = Number((invoice as any).total_amount ?? 0);
  const prevPaid = Number((invoice as any).paid_amount ?? 0);
  const nextPaid = roundMoney(prevPaid + amount);

  const nextStatus = nextPaid >= total ? "paid" : "partial";

  const { error: payErr } = await supabase
    .from("media_invoice_payments")
    .insert({
      invoice_id: invoiceId,
      method,
      amount,
      reference: safeString(body.reference),
      paid_at: paidAt,
    });
  if (payErr) return res.status(500).json({ error: payErr.message });

  const { error: updErr } = await supabase
    .from("media_invoices")
    .update({
      paid_amount: nextPaid,
      status: nextStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  if (updErr) return res.status(500).json({ error: updErr.message });

  const actor = getAuditActorInfo(req);
  await supabase.from("admin_audit_log").insert({
    actor_id: actor.actor_id,
    action: "media.invoice.mark_paid",
    entity_type: "media_invoices",
    entity_id: invoiceId,
    metadata: {
      amount,
      method,
      reference: safeString(body.reference),
      paid_at: paidAt,
      actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role,
    },
  });

  const next = await getMediaInvoiceWithItems({ supabase, invoiceId });
  return res.json({ ok: true, invoice: next });
};
