import type { RequestHandler, Router } from "express";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { sendSambookingEmail } from "../email";
import { requireSuperadmin } from "./admin";

// Types
type ImportRow = {
  // Établissement
  nom: string;
  universe?: string;
  subcategory?: string;
  ville: string;
  adresse?: string;
  code_postal?: string;
  region?: string;
  telephone?: string;
  whatsapp?: string;
  email_etablissement?: string;
  site_web?: string;
  description_courte?: string;
  description_longue?: string;
  horaires?: string;
  prix_min?: string;
  prix_max?: string;
  tags?: string;
  amenities?: string;
  // Pro (optionnel - peut être renseigné plus tard)
  pro_email?: string;
  pro_nom?: string;
  pro_prenom?: string;
  pro_telephone?: string;
  pro_entreprise?: string;
};

type ImportResult = {
  row: number;
  status: "success" | "error" | "skipped";
  establishment_id?: string;
  establishment_name?: string;
  pro_email?: string;
  pro_user_id?: string;
  temporary_password?: string;
  error?: string;
};

type ExportRow = {
  id: string;
  nom: string;
  universe: string;
  subcategory: string;
  ville: string;
  adresse: string;
  code_postal: string;
  region: string;
  telephone: string;
  whatsapp: string;
  email_etablissement: string;
  site_web: string;
  description_courte: string;
  description_longue: string;
  status: string;
  verified: boolean;
  premium: boolean;
  created_at: string;
  pro_email: string;
  pro_nom: string;
  pro_telephone: string;
  pro_entreprise: string;
};

// Helper: Parse CSV string
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Parse data rows
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim().toLowerCase()] = values[j]?.trim() || "";
    }
    rows.push(row);
  }

  return rows;
}

// Helper: Parse a single CSV line (handles quoted fields)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = false;
      }
    } else if ((char === "," || char === ";") && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);

  return result;
}

// Helper: Convert to CSV
function toCSV(rows: ExportRow[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.join(";")];

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = String((row as Record<string, unknown>)[h] ?? "");
      // Escape quotes and wrap in quotes if contains separator or quotes
      if (val.includes(";") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    });
    lines.push(values.join(";"));
  }

  return lines.join("\n");
}

// Helper: Generate random password
function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Helper: Get first defined value (checks for key existence, not just truthy)
function getFirstDefined(raw: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (key in raw) return raw[key] || "";
  }
  return "";
}

// Helper: Normalize row to ImportRow
function normalizeRow(raw: Record<string, string>): ImportRow {
  return {
    nom: getFirstDefined(raw, "nom", "name", "etablissement"),
    universe: getFirstDefined(raw, "universe", "categorie", "category"),
    subcategory: getFirstDefined(raw, "subcategory", "sous_categorie"),
    ville: getFirstDefined(raw, "ville", "city"),
    adresse: getFirstDefined(raw, "adresse", "address"),
    code_postal: getFirstDefined(raw, "code_postal", "postal_code", "cp"),
    region: raw.region || "",
    telephone: getFirstDefined(raw, "telephone", "phone", "tel"),
    whatsapp: raw.whatsapp || "",
    email_etablissement: getFirstDefined(raw, "email_etablissement", "email"),
    site_web: getFirstDefined(raw, "site_web", "website", "url"),
    description_courte: getFirstDefined(raw, "description_courte", "description_short"),
    description_longue: getFirstDefined(raw, "description_longue", "description_long", "description"),
    horaires: getFirstDefined(raw, "horaires", "hours", "opening_hours"),
    prix_min: getFirstDefined(raw, "prix_min", "price_min"),
    prix_max: getFirstDefined(raw, "prix_max", "price_max"),
    tags: raw.tags || "",
    amenities: getFirstDefined(raw, "amenities", "equipements"),
    pro_email: getFirstDefined(raw, "pro_email", "proprietaire_email", "owner_email"),
    pro_nom: getFirstDefined(raw, "pro_nom", "proprietaire_nom", "owner_name"),
    pro_prenom: getFirstDefined(raw, "pro_prenom", "proprietaire_prenom"),
    pro_telephone: getFirstDefined(raw, "pro_telephone", "proprietaire_telephone"),
    pro_entreprise: getFirstDefined(raw, "pro_entreprise", "company_name"),
  };
}

// Helper: Validate row
function validateRow(row: ImportRow): string | null {
  if (!row.nom?.trim()) return "Nom de l'établissement manquant";
  if (!row.ville?.trim()) return "Ville manquante";

  // Validate email format only if pro_email is provided and looks like an email (contains @)
  if (row.pro_email?.trim()) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // If it doesn't contain @, it's probably not meant to be an email - clear it
    if (!row.pro_email.includes("@")) {
      row.pro_email = ""; // Clear invalid value (likely data from wrong column)
    } else if (!emailRegex.test(row.pro_email.trim())) {
      return `Email Pro invalide: ${row.pro_email}`;
    }
  }

  return null;
}

// Get Supabase client with service role
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required");
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Parse hours string to JSON
function parseHours(hoursStr: string): Record<string, unknown> | null {
  if (!hoursStr?.trim()) return null;

  // Try to parse as JSON first
  try {
    return JSON.parse(hoursStr);
  } catch {
    // Simple format: "Lun-Ven: 9h-18h, Sam: 10h-16h"
    // For now, store as raw string in extra field
    return null;
  }
}

// Parse comma-separated string to array
function parseArray(str: string): string[] {
  if (!str?.trim()) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Send welcome email to new Pro with credentials
async function sendProWelcomeEmail(args: {
  email: string;
  password: string;
  establishmentName: string;
  proName?: string;
}): Promise<void> {
  const proSpaceUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL}/pro`
    : "https://sortiraumaroc.ma/pro";

  const greeting = args.proName ? `Bonjour ${args.proName},` : "Bonjour,";

  const bodyText = `${greeting}

Bienvenue sur Sortir Au Maroc ! Votre compte professionnel a été créé pour gérer votre établissement "${args.establishmentName}".

Voici vos identifiants de connexion :

Email : ${args.email}
Mot de passe temporaire : ${args.password}

Pour des raisons de sécurité, nous vous recommandons de changer votre mot de passe dès votre première connexion.

Vous pouvez accéder à votre espace Pro pour :
• Compléter les informations de votre établissement
• Ajouter des photos et une description
• Configurer vos disponibilités et tarifs
• Gérer vos réservations

À très bientôt sur Sortir Au Maroc !`;

  await sendSambookingEmail({
    emailId: `pro-welcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fromKey: "pro",
    to: [args.email],
    subject: `Bienvenue sur Sortir Au Maroc - Vos accès pour ${args.establishmentName}`,
    bodyText,
    ctaLabel: "Accéder à mon espace Pro",
    ctaUrl: proSpaceUrl,
  });
}

export function registerAdminImportExportRoutes(router: Router): void {
  // Download CSV template
  router.get("/api/admin/import-export/template", ((req, res) => {
    const template = [
      "nom;universe;subcategory;ville;adresse;code_postal;region;telephone;whatsapp;email_etablissement;site_web;description_courte;description_longue;horaires;prix_min;prix_max;tags;amenities;pro_email;pro_nom;pro_prenom;pro_telephone;pro_entreprise",
      "Spa Oasis;sport;spa;Marrakech;123 Rue Mohammed V;40000;Marrakech-Safi;+212524000000;+212600000000;contact@spa-oasis.ma;https://spa-oasis.ma;Spa de luxe au cœur de Marrakech;Description détaillée du spa...;Lun-Dim: 9h-21h;200;1500;relaxation,bien-être;hammam,piscine,sauna;proprietaire@email.com;Benali;Ahmed;+212600000001;Spa Oasis SARL",
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="template_etablissements.csv"');
    res.send("\ufeff" + template); // BOM for Excel UTF-8
  }) as RequestHandler);

  // Preview import (validate without saving)
  router.post("/api/admin/import-export/preview", (async (req, res) => {
    try {
      const { content, format } = req.body as { content: string; format?: "csv" | "json" };

      if (!content?.trim()) {
        return res.status(400).json({ error: "Contenu vide" });
      }

      let rows: Record<string, string>[];

      if (format === "json") {
        try {
          const parsed = JSON.parse(content);
          rows = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return res.status(400).json({ error: "JSON invalide" });
        }
      } else {
        rows = parseCSV(content);
      }

      if (rows.length === 0) {
        return res.status(400).json({ error: "Aucune donnée trouvée" });
      }

      const preview: Array<{
        row: number;
        data: ImportRow;
        valid: boolean;
        error?: string;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const normalized = normalizeRow(rows[i]);
        const error = validateRow(normalized);
        preview.push({
          row: i + 1,
          data: normalized,
          valid: !error,
          error: error || undefined,
        });
      }

      const validCount = preview.filter((p) => p.valid).length;
      const invalidCount = preview.filter((p) => !p.valid).length;

      return res.json({
        total: rows.length,
        valid: validCount,
        invalid: invalidCount,
        preview: preview.slice(0, 50), // Return first 50 for preview
      });
    } catch (error) {
      console.error("[Import] Preview error:", error);
      return res.status(500).json({ error: "Erreur lors de l'analyse du fichier" });
    }
  }) as RequestHandler);

  // Execute import
  router.post("/api/admin/import-export/import", (async (req, res) => {
    try {
      const { content, format, sendEmails } = req.body as {
        content: string;
        format?: "csv" | "json";
        sendEmails?: boolean;
      };

      if (!content?.trim()) {
        return res.status(400).json({ error: "Contenu vide" });
      }

      const supabase = getSupabaseAdmin();

      let rows: Record<string, string>[];
      if (format === "json") {
        const parsed = JSON.parse(content);
        rows = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        rows = parseCSV(content);
      }

      const results: ImportResult[] = [];
      const proCache = new Map<string, { user_id: string; password?: string }>();

      for (let i = 0; i < rows.length; i++) {
        const rowNum = i + 1;
        const normalized = normalizeRow(rows[i]);
        const validationError = validateRow(normalized);

        if (validationError) {
          results.push({
            row: rowNum,
            status: "error",
            establishment_name: normalized.nom,
            error: validationError,
          });
          continue;
        }

        try {
          // 1. Find or create Pro user (only if pro_email is provided)
          let proInfo: { user_id: string; password?: string } | null = null;

          if (normalized.pro_email?.trim()) {
            proInfo = proCache.get(normalized.pro_email.toLowerCase()) || null;

            if (!proInfo) {
              // Check if user exists
              const { data: existingUsers } = await supabase.auth.admin.listUsers();
              const existingUser = existingUsers?.users?.find(
                (u) => u.email?.toLowerCase() === normalized.pro_email!.toLowerCase()
              );

              if (existingUser) {
                proInfo = { user_id: existingUser.id };
              } else {
                // Create new user
                const tempPassword = generateTemporaryPassword();
                const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                  email: normalized.pro_email.trim(),
                  password: tempPassword,
                  email_confirm: true,
                  user_metadata: {
                    display_name: [normalized.pro_prenom, normalized.pro_nom].filter(Boolean).join(" ") || undefined,
                  },
                });

                if (createError || !newUser?.user) {
                  results.push({
                    row: rowNum,
                    status: "error",
                    establishment_name: normalized.nom,
                    error: `Erreur création compte Pro: ${createError?.message || "Inconnue"}`,
                  });
                  continue;
                }

                proInfo = { user_id: newUser.user.id, password: tempPassword };

                // Create pro_profiles entry
                await supabase.from("pro_profiles").upsert({
                  user_id: newUser.user.id,
                  email: normalized.pro_email.trim(),
                  first_name: normalized.pro_prenom || null,
                  last_name: normalized.pro_nom || null,
                  phone: normalized.pro_telephone || null,
                  company_name: normalized.pro_entreprise || null,
                  client_type: "A",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                });
              }

              proCache.set(normalized.pro_email.toLowerCase(), proInfo);
            }
          }

          // 2. Create establishment
          const establishmentData: Record<string, unknown> = {
            name: normalized.nom.trim(),
            universe: normalized.universe?.trim() || null,
            subcategory: normalized.subcategory?.trim() || null,
            city: normalized.ville.trim(),
            address: normalized.adresse?.trim() || null,
            postal_code: normalized.code_postal?.trim() || null,
            region: normalized.region?.trim() || null,
            phone: normalized.telephone?.trim() || null,
            whatsapp: normalized.whatsapp?.trim() || null,
            website: normalized.site_web?.trim() || null,
            description_short: normalized.description_courte?.trim() || null,
            description_long: normalized.description_longue?.trim() || null,
            hours: parseHours(normalized.horaires || ""),
            tags: parseArray(normalized.tags || ""),
            amenities: parseArray(normalized.amenities || ""),
            status: "pending" as const,
            verified: false,
            premium: false,
            booking_enabled: false,
            extra: {
              imported: true,
              imported_at: new Date().toISOString(),
              email_etablissement: normalized.email_etablissement || null,
              prix_min: normalized.prix_min ? parseFloat(normalized.prix_min) : null,
              prix_max: normalized.prix_max ? parseFloat(normalized.prix_max) : null,
              awaiting_pro_assignment: !proInfo, // Flag for establishments without Pro
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Only set created_by if we have a Pro user (avoid null constraint violation)
          if (proInfo) {
            establishmentData.created_by = proInfo.user_id;
          }

          const { data: establishment, error: estError } = await supabase
            .from("establishments")
            .insert(establishmentData)
            .select("id")
            .single();

          if (estError || !establishment) {
            results.push({
              row: rowNum,
              status: "error",
              establishment_name: normalized.nom,
              error: `Erreur création établissement: ${estError?.message || "Inconnue"}`,
            });
            continue;
          }

          // 3. Create membership (only if Pro exists)
          if (proInfo) {
            await supabase.from("pro_establishment_memberships").insert({
              establishment_id: establishment.id,
              user_id: proInfo.user_id,
              role: "owner",
              created_at: new Date().toISOString(),
            });

            // 4. Send welcome email with credentials if requested
            if (sendEmails && proInfo.password && normalized.pro_email) {
              try {
                await sendProWelcomeEmail({
                  email: normalized.pro_email.trim(),
                  password: proInfo.password,
                  establishmentName: normalized.nom.trim(),
                  proName: [normalized.pro_prenom, normalized.pro_nom].filter(Boolean).join(" ") || undefined,
                });
              } catch (emailError) {
                console.error("[Import] Email send error:", emailError);
                // Don't fail the import if email fails
              }
            }
          }

          results.push({
            row: rowNum,
            status: "success",
            establishment_id: establishment.id,
            establishment_name: normalized.nom,
            pro_email: normalized.pro_email || undefined,
            pro_user_id: proInfo?.user_id,
            temporary_password: proInfo?.password,
          });
        } catch (err) {
          results.push({
            row: rowNum,
            status: "error",
            establishment_name: normalized.nom,
            error: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      return res.json({
        total: rows.length,
        success: successCount,
        errors: errorCount,
        results,
        // Only include credentials for new PROs if not sending emails
        newProCredentials: sendEmails
          ? undefined
          : results
              .filter((r) => r.status === "success" && r.temporary_password)
              .map((r) => ({
                email: r.pro_email,
                password: r.temporary_password,
              })),
      });
    } catch (error) {
      console.error("[Import] Import error:", error);
      return res.status(500).json({ error: "Erreur lors de l'import" });
    }
  }) as RequestHandler);

  // Export establishments to CSV (superadmin only)
  router.get("/api/admin/import-export/export", (async (req, res) => {
    if (!requireSuperadmin(req, res)) return;

    try {
      const { status, city, universe } = req.query as {
        status?: string;
        city?: string;
        universe?: string;
      };

      const supabase = getSupabaseAdmin();

      // Build query
      let query = supabase.from("establishments").select(`
        id,
        name,
        universe,
        subcategory,
        city,
        address,
        postal_code,
        region,
        phone,
        whatsapp,
        website,
        description_short,
        description_long,
        status,
        verified,
        premium,
        created_at,
        created_by,
        extra
      `);

      if (status) query = query.eq("status", status);
      if (city) query = query.ilike("city", `%${city}%`);
      if (universe) query = query.eq("universe", universe);

      const { data: establishments, error } = await query.order("created_at", { ascending: false });

      if (error) {
        console.error("[Export] Query error:", error);
        return res.status(500).json({ error: "Erreur lors de la récupération des données" });
      }

      if (!establishments || establishments.length === 0) {
        return res.status(404).json({ error: "Aucun établissement trouvé" });
      }

      // Get Pro info for each establishment
      const creatorIds = [...new Set(establishments.map((e) => e.created_by).filter(Boolean))];

      const { data: proProfiles } = await supabase
        .from("pro_profiles")
        .select("user_id, email, first_name, last_name, phone, company_name")
        .in("user_id", creatorIds);

      const proMap = new Map(proProfiles?.map((p) => [p.user_id, p]) || []);

      // Build export rows
      const exportRows: ExportRow[] = establishments.map((e) => {
        const pro = proMap.get(e.created_by);
        const extra = (e.extra as Record<string, unknown>) || {};

        return {
          id: e.id,
          nom: e.name || "",
          universe: e.universe || "",
          subcategory: e.subcategory || "",
          ville: e.city || "",
          adresse: e.address || "",
          code_postal: e.postal_code || "",
          region: e.region || "",
          telephone: e.phone || "",
          whatsapp: e.whatsapp || "",
          email_etablissement: (extra.email_etablissement as string) || "",
          site_web: e.website || "",
          description_courte: e.description_short || "",
          description_longue: e.description_long || "",
          status: e.status || "",
          verified: e.verified || false,
          premium: e.premium || false,
          created_at: e.created_at || "",
          pro_email: pro?.email || "",
          pro_nom: [pro?.first_name, pro?.last_name].filter(Boolean).join(" ") || "",
          pro_telephone: pro?.phone || "",
          pro_entreprise: pro?.company_name || "",
        };
      });

      const csv = toCSV(exportRows);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="etablissements_export_${new Date().toISOString().slice(0, 10)}.csv"`
      );
      res.send("\ufeff" + csv); // BOM for Excel UTF-8
    } catch (error) {
      console.error("[Export] Export error:", error);
      return res.status(500).json({ error: "Erreur lors de l'export" });
    }
  }) as RequestHandler);

  // Get stats for import/export page
  router.get("/api/admin/import-export/stats", (async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();

      const [
        { count: totalEstablishments },
        { count: pendingEstablishments },
        { count: activeEstablishments },
        { count: totalPros },
      ] = await Promise.all([
        supabase.from("establishments").select("*", { count: "exact", head: true }),
        supabase.from("establishments").select("*", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("establishments").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("pro_profiles").select("*", { count: "exact", head: true }),
      ]);

      return res.json({
        totalEstablishments: totalEstablishments || 0,
        pendingEstablishments: pendingEstablishments || 0,
        activeEstablishments: activeEstablishments || 0,
        totalPros: totalPros || 0,
      });
    } catch (error) {
      console.error("[Stats] Error:", error);
      return res.status(500).json({ error: "Erreur lors de la récupération des statistiques" });
    }
  }) as RequestHandler);
}
