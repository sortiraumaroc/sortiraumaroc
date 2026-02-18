import express from "express";
import type { RequestHandler, Express } from "express";
import { requireAdminKey, computeCompletenessScore, normalizeEstName, getAuditActorInfo } from "./admin";
import { getAdminSupabase } from "../supabaseAdmin";

// ─── SQL Parser ─────────────────────────────────────────────────────────

/**
 * Parse INSERT INTO statements from a .sql file.
 * Supports:
 *   INSERT INTO table_name (col1, col2, ...) VALUES (v1, v2, ...), (v1, v2, ...);
 *   INSERT INTO "schema"."table" (col1, col2) VALUES (...);
 */

function unquoteSqlString(val: string): string | null {
  const trimmed = val.trim();
  if (trimmed.toUpperCase() === "NULL") return null;
  if (trimmed.toUpperCase() === "TRUE") return "true";
  if (trimmed.toUpperCase() === "FALSE") return "false";
  // Quoted string: 'value' or E'value'
  if (/^[eE]?'/.test(trimmed)) {
    const start = trimmed.indexOf("'") + 1;
    const end = trimmed.lastIndexOf("'");
    if (end > start) {
      return trimmed.slice(start, end).replace(/''/g, "'").replace(/\\'/g, "'");
    }
  }
  // Numeric
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  return trimmed;
}

/**
 * Split a VALUES tuple respecting quoted strings, nested parentheses, etc.
 * E.g. "'hello', 'it''s me', NULL, 42" → ["'hello'", "'it''s me'", "NULL", "42"]
 */
function splitValuesRow(inside: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuote = false;
  let depth = 0;

  for (let i = 0; i < inside.length; i++) {
    const ch = inside[i];

    if (inQuote) {
      current += ch;
      if (ch === "'" && inside[i + 1] === "'") {
        current += "'";
        i++; // skip escaped quote
      } else if (ch === "'") {
        inQuote = false;
      }
      continue;
    }

    if (ch === "'") {
      inQuote = true;
      current += ch;
      continue;
    }

    if (ch === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim()) parts.push(current);
  return parts;
}

/**
 * Extract all value tuples from the VALUES clause.
 * Handles multi-row inserts: VALUES (...), (...), (...)
 */
function extractValueTuples(valuesClause: string): string[][] {
  const tuples: string[][] = [];
  let pos = 0;

  while (pos < valuesClause.length) {
    // Find opening paren
    const openIdx = valuesClause.indexOf("(", pos);
    if (openIdx === -1) break;

    // Find matching close paren
    let depth = 1;
    let inQuote = false;
    let closeIdx = openIdx + 1;

    while (closeIdx < valuesClause.length && depth > 0) {
      const ch = valuesClause[closeIdx];
      if (inQuote) {
        if (ch === "'" && valuesClause[closeIdx + 1] === "'") {
          closeIdx++; // skip escaped
        } else if (ch === "'") {
          inQuote = false;
        }
      } else {
        if (ch === "'") inQuote = true;
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
      if (depth > 0) closeIdx++;
    }

    const inside = valuesClause.slice(openIdx + 1, closeIdx);
    const values = splitValuesRow(inside);
    tuples.push(values);
    pos = closeIdx + 1;
  }

  return tuples;
}

type ParsedInsert = {
  table: string;
  columns: string[];
  rows: Record<string, string | null>[];
};

function parseInsertStatements(sql: string): ParsedInsert[] {
  const results: ParsedInsert[] = [];

  // Normalize line endings
  const normalized = sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split SQL into individual statements on semicolons (respecting quoted strings)
  const statements: string[] = [];
  let currentStmt = "";
  let inQuote = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuote) {
      currentStmt += ch;
      if (ch === "'" && normalized[i + 1] === "'") {
        currentStmt += "'";
        i++;
      } else if (ch === "'") {
        inQuote = false;
      }
      continue;
    }
    if (ch === "'") {
      inQuote = true;
      currentStmt += ch;
      continue;
    }
    if (ch === ";") {
      if (currentStmt.trim()) statements.push(currentStmt.trim());
      currentStmt = "";
      continue;
    }
    currentStmt += ch;
  }
  if (currentStmt.trim()) statements.push(currentStmt.trim());

  // Process each statement — match header then extract values
  // Supports: "table", `table`, and unquoted table names (+ optional schema prefix)
  const headerRegex = /^INSERT\s+INTO\s+(?:(?:"[^"]*"|`[^`]*`)\s*\.\s*)?(?:"([^"]+)"|`([^`]+)`|([a-zA-Z_][\w]*))\s*\(([^)]+)\)\s*VALUES\s*/i;

  for (const stmt of statements) {
    const match = headerRegex.exec(stmt);
    if (!match) continue;

    const table = (match[1] || match[2] || match[3] || "").toLowerCase();
    const columnsRaw = match[4];
    const valuesClause = stmt.slice(match[0].length);

    const columns = columnsRaw
      .split(",")
      .map((c) => c.trim().replace(/^["`]|["`]$/g, "").toLowerCase());

    const tuples = extractValueTuples(valuesClause);

    const rows: Record<string, string | null>[] = [];
    for (const tuple of tuples) {
      const row: Record<string, string | null> = {};
      for (let i = 0; i < columns.length; i++) {
        row[columns[i]] = i < tuple.length ? unquoteSqlString(tuple[i]) : null;
      }
      rows.push(row);
    }

    // Merge with existing result for same table
    const existing = results.find((r) => r.table === table);
    if (existing) {
      existing.rows.push(...rows);
    } else {
      results.push({ table, columns, rows });
    }
  }

  return results;
}

// ─── Completeness fields (shared constant) ──────────────────────────────

const COMPLETENESS_FIELD_KEYS = [
  "name", "description_short", "description_long", "address", "city",
  "postal_code", "region", "phone", "whatsapp", "email", "website",
  "cover_url", "gallery_urls", "hours", "universe", "subcategory",
  "lat", "lng", "tags", "amenities", "social_links", "specialties",
  "ambiance_tags",
];

function countFilledFields(row: Record<string, unknown>): number {
  let filled = 0;
  for (const k of COMPLETENESS_FIELD_KEYS) {
    const v = row[k];
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    filled++;
  }
  return filled;
}

// ─── Handlers ───────────────────────────────────────────────────────────

/**
 * POST /api/admin/import-sql/parse
 * Body: { content: string }
 * Returns parsed data from .sql file
 */
const parseSql: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;

    const content = typeof req.body?.content === "string" ? req.body.content : "";
    if (!content.trim()) {
      return res.status(400).json({ error: "Contenu SQL vide" });
    }

    const inserts = parseInsertStatements(content);

    if (inserts.length === 0) {
      return res.status(400).json({
        error: "Aucun INSERT INTO trouvé dans le fichier SQL",
      });
    }

    // Return summary of each table found
    const tables = inserts.map((ins) => ({
      table: ins.table,
      columns: ins.columns,
      rowCount: ins.rows.length,
      sampleRow: ins.rows[0] ?? null,
    }));

    // Flatten all rows with table source info
    const allRows = inserts.flatMap((ins) =>
      ins.rows.map((row) => ({
        ...row,
        _source_table: ins.table,
      })),
    );

    res.json({
      tables,
      totalRows: allRows.length,
      rows: allRows,
    });
  } catch (e) {
    console.error("[import-sql/parse] Error:", e);
    res.status(400).json({
      error: `Erreur de parsing SQL: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
};

/**
 * POST /api/admin/import-sql/preview
 * Body: { rows: Record<string, string | null>[] }
 * Compare parsed rows against existing DB, detect duplicates, return groups
 */
const previewSql: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;

    const rawRows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    // Filter to only rows that have a name-like field (skip auxiliary tables like photos, workdays, etc.)
    const rows = rawRows.filter((r: Record<string, unknown>) => {
      const name = r.name ?? r.nom;
      return name !== null && name !== undefined && String(name).trim() !== "";
    });
    if (rows.length === 0) {
      return res.json({ groups: [], newOnly: [], stats: { total: 0, duplicates: 0, new: 0 } });
    }

    const supabase = getAdminSupabase();

  // Fetch all existing establishments
  const { data: existing, error } = await supabase
    .from("establishments")
    .select("*")
    .limit(1000);

  if (error) return res.status(500).json({ error: error.message });

  type Row = Record<string, unknown> & { id: string; name: string | null; city: string | null; created_at: string | null; status: string | null };
  const existingRows = (existing ?? []) as Row[];

  // Build lookup map: normalizedName||normalizedCity → existing rows
  const existingMap = new Map<string, Row[]>();
  for (const row of existingRows) {
    const nName = normalizeEstName(row.name);
    const nCity = normalizeEstName(row.city);
    if (!nName) continue;
    const key = `${nName}||${nCity}`;
    const bucket = existingMap.get(key) ?? [];
    bucket.push(row);
    existingMap.set(key, bucket);
  }

  // Process SQL rows: detect duplicates
  type DuplicateGroupResult = {
    name: string;
    city: string;
    sqlRows: Array<{
      index: number;
      name: string | null;
      city: string | null;
      completeness: number;
      filledFields: number;
      totalFields: number;
      rawData: Record<string, string | null>;
    }>;
    existingRows: Array<{
      id: string;
      name: string | null;
      city: string | null;
      status: string | null;
      created_at: string | null;
      completeness: number;
      filledFields: number;
      totalFields: number;
    }>;
  };

  const groups = new Map<string, DuplicateGroupResult>();
  const newOnly: Array<{
    index: number;
    name: string | null;
    city: string | null;
    completeness: number;
    filledFields: number;
    totalFields: number;
    rawData: Record<string, string | null>;
  }> = [];

  const totalFields = COMPLETENESS_FIELD_KEYS.length;

  for (let i = 0; i < rows.length; i++) {
    const sqlRow = rows[i] as Record<string, string | null>;
    const name = sqlRow.name ?? sqlRow.nom ?? null;
    const city = sqlRow.city ?? sqlRow.ville ?? null;
    const nName = normalizeEstName(name);
    const nCity = normalizeEstName(city);

    const sqlScore = computeCompletenessScore(sqlRow);
    const sqlFilled = countFilledFields(sqlRow);

    const sqlItem = {
      index: i,
      name,
      city,
      completeness: sqlScore,
      filledFields: sqlFilled,
      totalFields,
      rawData: sqlRow,
    };

    if (!nName) {
      newOnly.push(sqlItem);
      continue;
    }

    const key = `${nName}||${nCity}`;
    const existingBucket = existingMap.get(key);

    if (existingBucket && existingBucket.length > 0) {
      // Duplicate found
      if (!groups.has(key)) {
        groups.set(key, {
          name: name ?? "",
          city: city ?? "",
          sqlRows: [],
          existingRows: existingBucket.map((eRow) => ({
            id: eRow.id,
            name: eRow.name,
            city: eRow.city,
            status: eRow.status,
            created_at: eRow.created_at,
            completeness: computeCompletenessScore(eRow),
            filledFields: countFilledFields(eRow),
            totalFields,
          })),
        });
      }
      groups.get(key)!.sqlRows.push(sqlItem);
    } else {
      // Check for duplicates within the SQL file itself
      const sqlGroupKey = `sql_${key}`;
      if (groups.has(sqlGroupKey)) {
        groups.get(sqlGroupKey)!.sqlRows.push(sqlItem);
      } else {
        // Check if another SQL row with same key exists
        const alreadySeen = newOnly.find((n) => {
          const nn = normalizeEstName(n.name);
          const nc = normalizeEstName(n.city);
          return nn === nName && nc === nCity;
        });
        if (alreadySeen) {
          // Move previous item to a group
          const grp: DuplicateGroupResult = {
            name: name ?? "",
            city: city ?? "",
            sqlRows: [alreadySeen, sqlItem],
            existingRows: [],
          };
          groups.set(sqlGroupKey, grp);
          // Remove from newOnly
          const idx = newOnly.indexOf(alreadySeen);
          if (idx !== -1) newOnly.splice(idx, 1);
        } else {
          newOnly.push(sqlItem);
        }
      }
    }
  }

  // Convert groups map to array, sort by group size
  const groupsArr = Array.from(groups.values())
    .map((g) => ({
      ...g,
      // Sort items within group: richest first
      sqlRows: g.sqlRows.sort((a, b) => b.completeness - a.completeness),
      existingRows: g.existingRows.sort((a, b) => b.completeness - a.completeness),
    }))
    .sort((a, b) => (b.sqlRows.length + b.existingRows.length) - (a.sqlRows.length + a.existingRows.length));

  res.json({
    groups: groupsArr,
    newOnly,
    stats: {
      total: rows.length,
      duplicates: groupsArr.reduce((s, g) => s + g.sqlRows.length, 0),
      new: newOnly.length,
    },
  });
  } catch (e) {
    console.error("[import-sql/preview] Error:", e);
    res.status(500).json({ error: `Erreur preview: ${e instanceof Error ? e.message : "Erreur inconnue"}` });
  }
};

/**
 * POST /api/admin/import-sql/execute
 * Body: { imports: Record<string, string | null>[], deleteIds: string[] }
 */
const executeSql: RequestHandler = async (req, res) => {
  try {
    if (!requireAdminKey(req, res)) return;

  const imports = Array.isArray(req.body?.imports) ? req.body.imports : [];
  const deleteIds = Array.isArray(req.body?.deleteIds) ? req.body.deleteIds : [];
  const actor = getAuditActorInfo(req);

  console.log(`[import-sql/execute] Received ${imports.length} rows to import, ${deleteIds.length} to delete`);
  if (imports.length > 0) {
    const sample = imports[0];
    console.log("[import-sql/execute] Sample row keys:", Object.keys(sample).join(", "));
    console.log("[import-sql/execute] Sample row.name:", sample.name, "| row.slug:", sample.slug, "| row.city:", JSON.stringify(sample.city), "| row.type_blog:", sample.type_blog);
  }

  const supabase = getAdminSupabase();
  let importedCount = 0;
  let deletedCount = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // 1. Delete selected duplicates
  for (const id of deleteIds) {
    if (typeof id !== "string" || !id) continue;

    // Delete memberships first
    await supabase
      .from("pro_establishment_memberships")
      .delete()
      .eq("establishment_id", id);

    const { error } = await supabase
      .from("establishments")
      .delete()
      .eq("id", id);

    if (error) {
      errorCount++;
      errors.push(`Suppression ${id}: ${error.message}`);
    } else {
      deletedCount++;

      // Audit log
      await supabase.from("admin_audit_log").insert({
        action: "establishment.delete",
        entity_type: "establishment",
        entity_id: id,
        actor_id: actor.actor_id,
        metadata: { source: "sql_import_dedup", deleted_at: new Date().toISOString(), actor_email: actor.actor_email, actor_name: actor.actor_name, actor_role: actor.actor_role },
      });
    }
  }

  // ─── Helper: map a raw SQL row → clean establishment object ────────
  const VALID_UNIVERSES = new Set(["restaurant", "loisir", "hebergement", "wellness", "culture", "evenement"]);
  const UNIVERSE_ALIASES: Record<string, string> = {
    restaurants: "restaurant", resto: "restaurant", café: "restaurant", cafe: "restaurant",
    bar: "restaurant", brasserie: "restaurant", traiteur: "restaurant",
    loisirs: "loisir", sport: "loisir", divertissement: "loisir",
    hotel: "hebergement", hotels: "hebergement", riad: "hebergement", maison_hote: "hebergement",
    spa: "wellness", hammam: "wellness", bien_etre: "wellness",
    musee: "culture", galerie: "culture", theatre: "culture",
    shopping: "loisir",
    blog: "restaurant", facebook: "restaurant",
  };

  function asStr(v: unknown): string {
    return typeof v === "string" ? v.trim() : "";
  }

  function firstNonEmpty(...vals: unknown[]): string | null {
    for (const v of vals) {
      const s = asStr(v);
      if (s) return s;
    }
    return null;
  }

  function mapRawRow(row: Record<string, string | null>): Record<string, unknown> | null {
    delete row._source_table;

    const latRaw = firstNonEmpty(row.lat, row.latitude);
    const lngRaw = firstNonEmpty(row.lng, row.longitude, row.langitude);

    const rawUniverse = asStr(row.universe) || asStr(row.categorie) || asStr(row.category) || asStr(row.type_blog);
    const uniLower = rawUniverse.toLowerCase();
    const mappedUniverse = VALID_UNIVERSES.has(uniLower) ? uniLower : (UNIVERSE_ALIASES[uniLower] ?? "restaurant");

    const rawCity = asStr(row.city) || asStr(row.ville);
    let city = rawCity;
    if (!city && asStr(row.address)) {
      const m = asStr(row.address).match(/,\s*([A-Za-zÀ-ÿ\s-]+?)(?:\s+\d{4,5})?\s*,?\s*(?:Maroc|Morocco)?$/i);
      if (m) city = m[1].trim();
    }

    const name = firstNonEmpty(row.name, row.nom);
    if (!name) return null;

    const establishment: Record<string, unknown> = {
      name,
      slug: firstNonEmpty(row.slug),
      city: city || "Non spécifiée",
      universe: mappedUniverse,
      subcategory: firstNonEmpty(row.subcategory, row.sous_categorie) || "general",
      address: firstNonEmpty(row.address, row.adresse),
      postal_code: firstNonEmpty(row.postal_code, row.code_postal),
      region: firstNonEmpty(row.region),
      country: firstNonEmpty(row.country, row.pays) || "Maroc",
      phone: firstNonEmpty(row.phone, row.telephone, row.tel, row.phone_order),
      whatsapp: firstNonEmpty(row.whatsapp),
      email: firstNonEmpty(row.email, row.email_order),
      website: firstNonEmpty(row.website, row.site_web),
      description_short: firstNonEmpty(row.description_short, row.description_courte, row.slogan),
      description_long: firstNonEmpty(row.description_long, row.description),
      cover_url: firstNonEmpty(row.cover_url, row.image, row.img, row.image_de_couverture),
      lat: latRaw ? parseFloat(latRaw) || null : null,
      lng: lngRaw ? parseFloat(lngRaw) || null : null,
      price_range: firstNonEmpty(row.price_range) ?? (asStr(row.price) ? parseInt(asStr(row.price)) || null : null),
      premium: row.premium === "1" || row.premium === "true" ? true : (row.premium === "0" || row.premium === "false" ? false : undefined),
      status: "pending",
    };

    // Social links
    if (!asStr(row.social_links)) {
      const sl: Record<string, string> = {};
      if (asStr(row.facebook_id_ou_slug)) sl.facebook = asStr(row.facebook_id_ou_slug);
      if (asStr(row.tripadvisor_link)) sl.tripadvisor = asStr(row.tripadvisor_link);
      if (Object.keys(sl).length > 0) establishment.social_links = sl;
    }

    // Array fields
    for (const af of ["tags", "amenities", "specialties", "gallery_urls", "ambiance_tags", "cuisine_types"]) {
      const val = asStr(row[af]);
      if (val) {
        try { establishment[af] = JSON.parse(val); } catch {
          establishment[af] = val.split(",").map((s) => s.trim()).filter(Boolean);
        }
      }
    }

    // JSON fields
    for (const jf of ["hours", "social_links", "extra", "mix_experience"]) {
      const val = asStr(row[jf]);
      if (val) {
        try { establishment[jf] = JSON.parse(val); } catch { /* skip malformed */ }
      }
    }

    // Remove null/undefined/empty values → keep only actual data
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(establishment)) {
      if (v !== null && v !== undefined && v !== "") clean[k] = v;
    }

    // Generate slug if missing
    if (!clean.slug) {
      const sn = String(clean.name).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const sc = clean.city
        ? String(clean.city).toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
        : "";
      clean.slug = sc ? `${sn}-${sc}` : sn;
    }

    return clean;
  }

  // ─── 2. Map all rows first, then batch-insert ────────────────────
  const mappedRows: Record<string, unknown>[] = [];
  const usedSlugs = new Set<string>();

  for (const rawRow of imports) {
    if (!rawRow || typeof rawRow !== "object") continue;
    const clean = mapRawRow(rawRow as Record<string, string | null>);
    if (!clean) {
      errorCount++;
      errors.push("Row sans nom, ignorée");
      continue;
    }
    // Ensure slug uniqueness within this import batch
    let slug = String(clean.slug);
    while (usedSlugs.has(slug)) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }
    clean.slug = slug;
    usedSlugs.add(slug);
    mappedRows.push(clean);
  }

  console.log(`[import-sql/execute] Mapped ${mappedRows.length} rows (${errorCount} skipped without name)`);
  if (mappedRows.length > 0) {
    console.log("[import-sql/execute] Sample mapped:", JSON.stringify(mappedRows[0]).slice(0, 500));
  }

  // Batch insert in chunks of 50 rows for speed (instead of 1-by-1)
  const BATCH_SIZE = 50;
  for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
    const batch = mappedRows.slice(i, i + BATCH_SIZE);

    const { error: batchErr, data: batchData } = await supabase
      .from("establishments")
      .insert(batch)
      .select("id");

    if (!batchErr) {
      importedCount += batch.length;
    } else {
      // Batch insert failed — fall back to individual inserts for this chunk
      console.warn(`[import-sql/execute] Batch ${i}-${i + batch.length} failed: ${batchErr.message} (code: ${batchErr.code}). Falling back to individual inserts.`);

      for (const row of batch) {
        let insertError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: err } = await supabase
            .from("establishments")
            .insert(row);

          if (!err) {
            importedCount++;
            insertError = null;
            break;
          }

          // Slug conflict: append suffix and retry
          if (err.code === "23505" && err.message?.includes("slug") && attempt < 2) {
            row.slug = `${row.slug}-${Math.random().toString(36).slice(2, 6)}`;
            continue;
          }

          insertError = err;
          break;
        }

        if (insertError) {
          errorCount++;
          const errDetail = `Import "${row.name}" (slug: ${row.slug}): ${(insertError as any).message} (code: ${(insertError as any).code ?? "?"}, details: ${(insertError as any).details ?? "none"}, hint: ${(insertError as any).hint ?? "none"})`;
          errors.push(errDetail);
          if (errorCount <= 20) {
            console.error("[import-sql/execute] Insert error #" + errorCount + ":", errDetail);
            console.error("[import-sql/execute] Data keys:", Object.keys(row).join(", "));
          }
        }
      }
    }
  }

  // Audit log for bulk import
  if (importedCount > 0 || deletedCount > 0) {
    await supabase.from("admin_audit_log").insert({
      action: "establishment.sql_import",
      entity_type: "establishment",
      entity_id: null,
      actor_id: actor.actor_id,
      metadata: {
        importedCount,
        deletedCount,
        errorCount,
        timestamp: new Date().toISOString(),
        actor_email: actor.actor_email,
        actor_name: actor.actor_name,
        actor_role: actor.actor_role,
      },
    });
  }

  res.json({
    ok: true,
    importedCount,
    deletedCount,
    errorCount,
    errors: errors.slice(0, 50), // Limit errors in response
  });
  } catch (e) {
    console.error("[import-sql/execute] Error:", e);
    res.status(500).json({ error: `Erreur exécution: ${e instanceof Error ? e.message : "Erreur inconnue"}` });
  }
};

// ─── Route registration ─────────────────────────────────────────────────

export function registerAdminImportSqlRoutes(app: Express): void {
  // SQL files can be very large (30+ MB) — use a dedicated body parser with higher limit
  const bigJson = express.json({ limit: "50mb" });

  app.post("/api/admin/import-sql/parse", bigJson, parseSql);
  app.post("/api/admin/import-sql/preview", bigJson, previewSql);
  app.post("/api/admin/import-sql/execute", bigJson, executeSql);
}
