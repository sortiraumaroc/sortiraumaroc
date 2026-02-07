import type { RequestHandler, Router } from "express";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { sendSambookingEmail } from "../email";
import { requireSuperadmin } from "./admin";
import ExcelJS from "exceljs";

// Types
type ImportRow = {
  // Établissement - infos de base
  nom: string;
  universe?: string;
  subcategory?: string;
  ville: string;
  adresse?: string;
  code_postal?: string;
  region?: string;
  pays?: string;
  // Contact
  telephone?: string;
  whatsapp?: string;
  email_etablissement?: string;
  site_web?: string;
  instagram?: string;
  facebook?: string;
  // Descriptions
  description_courte?: string;
  description_longue?: string;
  // Informations pratiques
  horaires?: string;
  prix_min?: string;
  prix_max?: string;
  devise?: string;
  // SEO & Visibilité
  tags?: string;
  amenities?: string;
  latitude?: string;
  longitude?: string;
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
  slug: string;
  username: string;
  universe: string;
  subcategory: string;
  ville: string;
  adresse: string;
  code_postal: string;
  region: string;
  pays: string;
  telephone: string;
  whatsapp: string;
  email_etablissement: string;
  site_web: string;
  instagram: string;
  facebook: string;
  description_courte: string;
  description_longue: string;
  latitude: string;
  longitude: string;
  status: string;
  verified: boolean;
  premium: boolean;
  booking_enabled: boolean;
  menu_digital_enabled: boolean;
  created_at: string;
  pro_email: string;
  pro_nom: string;
  pro_telephone: string;
  pro_entreprise: string;
};

// Helper: Parse CSV string (supports multi-line quoted fields)
function parseCSV(content: string): Record<string, string>[] {
  // Parse all records in one pass, respecting quoted fields that span multiple lines
  const records = parseCSVRecords(content);
  if (records.length < 2) return [];

  const headers = records[0];
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < records.length; i++) {
    const values = records[i];
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j].trim().toLowerCase()] = values[j]?.trim() || "";
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse CSV content into an array of records (each record is an array of field values).
 * Handles:
 * - Quoted fields with embedded newlines, commas, semicolons
 * - Escaped quotes ("" inside quoted fields)
 * - Both , and ; as delimiters (auto-detected from header line)
 * - BOM character at start
 */
function parseCSVRecords(content: string): string[][] {
  // Strip BOM
  const text = content.startsWith("\ufeff") ? content.slice(1) : content;

  // Auto-detect delimiter from the first line
  const firstLineEnd = text.indexOf("\n");
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ";" : ",";

  const records: string[][] = [];
  let current = "";
  let inQuotes = false;
  let fields: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        fields.push(current);
        current = "";
      } else if (ch === "\r") {
        // Skip carriage return
        continue;
      } else if (ch === "\n") {
        fields.push(current);
        current = "";
        // Only add non-empty records (skip blank lines)
        if (fields.some((f) => f.trim())) {
          records.push(fields);
        }
        fields = [];
      } else {
        current += ch;
      }
    }
  }

  // Handle last record (no trailing newline)
  fields.push(current);
  if (fields.some((f) => f.trim())) {
    records.push(fields);
  }

  return records;
}

// Helper: Parse a single CSV line (handles quoted fields) — kept for toCSV compatibility
function parseCSVLine(line: string): string[] {
  const records = parseCSVRecords(line);
  return records[0] || [];
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
    // Infos de base
    nom: getFirstDefined(raw, "nom", "name", "etablissement"),
    universe: getFirstDefined(raw, "universe", "categorie", "category"),
    subcategory: getFirstDefined(raw, "subcategory", "sous_categorie"),
    ville: getFirstDefined(raw, "ville", "city"),
    adresse: getFirstDefined(raw, "adresse", "address"),
    code_postal: getFirstDefined(raw, "code_postal", "postal_code", "cp"),
    region: raw.region || "",
    pays: getFirstDefined(raw, "pays", "country") || "MA",
    // Contact
    telephone: getFirstDefined(raw, "telephone", "phone", "tel"),
    whatsapp: raw.whatsapp || "",
    email_etablissement: getFirstDefined(raw, "email_etablissement", "email"),
    site_web: getFirstDefined(raw, "site_web", "website", "url"),
    instagram: getFirstDefined(raw, "instagram", "insta"),
    facebook: getFirstDefined(raw, "facebook", "fb"),
    // Descriptions
    description_courte: getFirstDefined(raw, "description_courte", "description_short"),
    description_longue: getFirstDefined(raw, "description_longue", "description_long", "description"),
    // Infos pratiques
    horaires: getFirstDefined(raw, "horaires", "hours", "opening_hours"),
    prix_min: getFirstDefined(raw, "prix_min", "price_min"),
    prix_max: getFirstDefined(raw, "prix_max", "price_max"),
    devise: getFirstDefined(raw, "devise", "currency") || "MAD",
    // SEO & Visibilité
    tags: raw.tags || "",
    amenities: getFirstDefined(raw, "amenities", "equipements"),
    latitude: getFirstDefined(raw, "latitude", "lat"),
    longitude: getFirstDefined(raw, "longitude", "lng", "lon"),
    // Pro
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
  // Ville is recommended but not blocking — some phpMyAdmin exports use city_id instead

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

// ============================================
// TAXONOMY DEFINITIONS FOR EXCEL EXPORT
// ============================================

const UNIVERSES = [
  { id: "restaurants", label: "Manger & Boire" },
  { id: "sport", label: "Sport & Bien-être" },
  { id: "loisirs", label: "Loisirs" },
  { id: "hebergement", label: "Hébergement" },
  { id: "culture", label: "Culture" },
  { id: "shopping", label: "Shopping" },
  { id: "rentacar", label: "Se déplacer" },
];

const SUBCATEGORIES: Record<string, string[]> = {
  restaurants: [
    "Français", "Asiatique", "Italien", "Marocain", "Japonais", "Oriental", "Steakhouse",
    "Brunch", "Café", "Afghan", "Africain", "Algérien", "Allemand", "Américain", "Anglais",
    "Argentin", "Basque", "Brésilien", "Cambodgien", "Chinois", "Colombien", "Coréen",
    "Créole", "Crêperie", "Cubain", "Cuisine des îles", "Cuisine du monde", "Cuisine traditionnelle",
    "Égyptien", "Espagnol", "Éthiopien", "Fruits de mer", "Fusion", "Grec", "Hawaïen",
    "Indien", "Iranien", "Israélien", "Latino", "Libanais", "Méditerranéen", "Mexicain",
    "Pakistanais", "Péruvien", "Portugais", "Provençal", "Russe", "Scandinave", "Syrien",
    "Thaïlandais", "Tunisien", "Turc", "Vegan", "Végétarien", "Vietnamien"
  ],
  sport: [
    "Hammam", "Spa", "Massage", "Institut beauté", "Coiffeur / Barber", "Yoga / Pilates",
    "Salle de sport", "Coach personnel", "Padel", "Tennis", "Foot 5", "Crossfit", "Piscine",
    "Arts martiaux", "Autres"
  ],
  loisirs: [
    "Escape game", "Karting", "Quad / Buggy", "Jet ski / Paddle", "Parachute / Parapente",
    "Golf", "Balades (cheval / chameau)", "Aquapark", "Bowling", "Laser game", "Surf / Kite", "Autres"
  ],
  hebergement: [
    "Hôtel 5 étoiles", "Hôtel 4 étoiles", "Hôtel 3 étoiles", "Hôtel 2 étoiles", "Hôtel boutique",
    "Palace", "Resort", "Riad traditionnel", "Riad de luxe", "Maison d'hôtes", "Chambre d'hôtes",
    "Villa", "Appartement", "Studio", "Loft", "Auberge", "Gîte", "Chalet", "Bungalow", "Glamping", "Camping"
  ],
  culture: [
    "Musée d'art", "Musée d'histoire", "Musée des sciences", "Galerie d'art", "Exposition temporaire",
    "Monument historique", "Palais", "Château", "Médina", "Site archéologique", "Mosquée",
    "Théâtre", "Opéra", "Salle de concert", "Festival", "Spectacle", "Concert", "Ballet",
    "Visite guidée", "Visite audioguidée", "Atelier créatif", "Cours de cuisine", "Dégustation", "Autres"
  ],
  shopping: [
    "Mode femme", "Mode homme", "Mode enfant", "Prêt-à-porter", "Haute couture", "Créateur",
    "Vintage", "Seconde main", "Chaussures", "Maroquinerie", "Sacs", "Accessoires",
    "Bijoux fantaisie", "Bijoux précieux", "Montres", "Lunettes", "Parfumerie", "Cosmétiques",
    "Décoration", "Mobilier", "Art de la table", "Linge de maison", "Tapis",
    "Artisanat local", "Artisanat marocain", "Poterie", "Céramique", "Textile", "Cuir",
    "Épicerie fine", "Traiteur", "Pâtisserie", "Chocolaterie", "Thé et café",
    "Concept store", "Centre commercial", "Souk", "Marché", "Autres"
  ],
  rentacar: [
    "Citadine", "Compacte", "Berline", "SUV", "4x4", "Crossover", "Monospace", "Break",
    "Coupé", "Cabriolet", "Pick-up", "Utilitaire", "Minibus", "Van", "Camping-car",
    "Moto", "Scooter", "Quad", "Vélo", "Vélo électrique", "Trottinette électrique",
    "Voiture de luxe", "Voiture de sport", "Voiture électrique", "Voiture hybride",
    "Voiture avec chauffeur"
  ],
};

const AMBIANCES = [
  "Romantique", "Décontracté", "Familial", "Branché", "Cosy", "Terrasse", "Rooftop",
  "Vue panoramique", "Design", "Traditionnel", "Festif", "Intimiste", "Business",
  "Gastronomique", "Lounge", "Live music", "En plein air", "Bord de mer", "Piscine", "Jardin"
];

const AMENITIES_BY_UNIVERSE: Record<string, string[]> = {
  restaurants: [
    "WiFi gratuit", "Climatisation", "Terrasse", "Parking", "Réservation en ligne",
    "Carte bancaire acceptée", "Livraison", "À emporter", "Service voiturier",
    "Accès PMR", "Espace enfants", "Espace fumeur", "Musique live", "Écran TV"
  ],
  sport: [
    "Vestiaires", "Douches", "Sauna", "Hammam", "Jacuzzi", "Piscine", "Parking",
    "WiFi", "Serviettes fournies", "Casiers", "Coach disponible", "Cours collectifs",
    "Espace détente", "Bar à jus", "Boutique", "Accessible PMR"
  ],
  loisirs: [
    "Parking gratuit", "Vestiaires", "Cafétéria", "Boutique souvenirs", "Photos incluses",
    "Accessible aux enfants", "Groupe accepté", "Réservation obligatoire", "Équipement fourni"
  ],
  hebergement: [
    "Piscine intérieure", "Piscine extérieure", "Spa", "Hammam", "Sauna", "Jacuzzi",
    "Salle de sport", "Restaurant", "Bar", "Room service", "Petit-déjeuner inclus",
    "Parking gratuit", "WiFi gratuit", "Climatisation", "Terrasse", "Balcon", "Jardin",
    "Vue sur mer", "Vue sur montagne", "Animaux acceptés", "Accessible PMR", "Ascenseur",
    "Conciergerie", "Navette aéroport", "Kids club", "Plage privée", "Golf", "Tennis",
    "Cuisine équipée", "Lave-linge", "Coffre-fort", "Minibar"
  ],
  culture: [
    "Audioguide disponible", "Visite guidée", "Boutique", "Cafétéria", "Accessible PMR",
    "Parking", "Groupe accepté", "Scolaires acceptés", "Réservation recommandée"
  ],
  shopping: [
    "Parking", "Climatisation", "Livraison", "Click & collect", "Emballage cadeau",
    "Carte cadeau", "Programme fidélité", "Détaxe", "Personal shopper", "Retouches"
  ],
  rentacar: [
    "Kilométrage illimité", "Assurance tous risques", "Assistance 24h/24",
    "Livraison à l'aéroport", "Livraison à domicile", "Retour flexible",
    "Annulation gratuite", "Deuxième conducteur gratuit", "Jeune conducteur accepté",
    "Climatisation", "GPS", "Bluetooth", "Siège bébé disponible"
  ],
};

const MOROCCAN_CITIES = [
  "Casablanca", "Rabat", "Marrakech", "Fès", "Tanger", "Agadir", "Meknès", "Oujda",
  "Kénitra", "Tétouan", "Salé", "Nador", "Mohammedia", "El Jadida", "Béni Mellal",
  "Taza", "Khémisset", "Taourirt", "Khouribga", "Safi", "Settat", "Larache",
  "Guelmim", "Berrechid", "Essaouira", "Ouarzazate", "Al Hoceïma", "Dakhla",
  "Laâyoune", "Ifrane", "Errachidia", "Tinghir", "Chefchaouen", "Asilah", "Oualidia"
];

const MOROCCAN_REGIONS = [
  "Casablanca-Settat", "Rabat-Salé-Kénitra", "Marrakech-Safi", "Fès-Meknès",
  "Tanger-Tétouan-Al Hoceïma", "Souss-Massa", "Oriental", "Béni Mellal-Khénifra",
  "Drâa-Tafilalet", "Laâyoune-Sakia El Hamra", "Dakhla-Oued Ed-Dahab", "Guelmim-Oued Noun"
];

export function registerAdminImportExportRoutes(router: Router): void {
  // Download Excel template with dropdowns and validation
  router.get("/api/admin/import-export/excel-template", (async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Sortir Au Maroc";
      workbook.created = new Date();

      // ============================================
      // SHEET 1: Établissements (main data entry)
      // ============================================
      const mainSheet = workbook.addWorksheet("Établissements", {
        properties: { tabColor: { argb: "FFA3001D" } },
      });

      // Define columns
      mainSheet.columns = [
        { header: "Nom *", key: "nom", width: 30 },
        { header: "Univers *", key: "universe", width: 20 },
        { header: "Sous-catégorie", key: "subcategory", width: 25 },
        { header: "Ville *", key: "ville", width: 18 },
        { header: "Région", key: "region", width: 25 },
        { header: "Adresse", key: "adresse", width: 35 },
        { header: "Code postal", key: "code_postal", width: 12 },
        { header: "Téléphone", key: "telephone", width: 18 },
        { header: "WhatsApp", key: "whatsapp", width: 18 },
        { header: "Email établissement", key: "email_etablissement", width: 28 },
        { header: "Site web", key: "site_web", width: 30 },
        { header: "Instagram", key: "instagram", width: 20 },
        { header: "Facebook", key: "facebook", width: 20 },
        { header: "Description courte", key: "description_courte", width: 40 },
        { header: "Description longue", key: "description_longue", width: 50 },
        { header: "Horaires", key: "horaires", width: 30 },
        { header: "Prix min (MAD)", key: "prix_min", width: 14 },
        { header: "Prix max (MAD)", key: "prix_max", width: 14 },
        { header: "Ambiance", key: "ambiance", width: 20 },
        { header: "Équipements (séparés par ,)", key: "amenities", width: 40 },
        { header: "Tags (séparés par ,)", key: "tags", width: 30 },
        { header: "Latitude", key: "latitude", width: 12 },
        { header: "Longitude", key: "longitude", width: 12 },
        { header: "Email PRO", key: "pro_email", width: 28 },
        { header: "Nom PRO", key: "pro_nom", width: 18 },
        { header: "Prénom PRO", key: "pro_prenom", width: 18 },
        { header: "Téléphone PRO", key: "pro_telephone", width: 18 },
      ];

      // Style header row
      const headerRow = mainSheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFA3001D" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 25;

      // Add example rows
      mainSheet.addRow({
        nom: "Le Jardin Secret",
        universe: "restaurants",
        subcategory: "Français",
        ville: "Marrakech",
        region: "Marrakech-Safi",
        adresse: "32 Rue Moulay Ali, Médina",
        code_postal: "40000",
        telephone: "+212524378040",
        whatsapp: "+212661234567",
        email_etablissement: "contact@jardinsecret.ma",
        site_web: "https://jardinsecret.ma",
        instagram: "@jardinsecretmarrakech",
        description_courte: "Restaurant gastronomique dans un riad historique",
        ambiance: "Romantique",
        amenities: "WiFi gratuit,Climatisation,Terrasse,Parking",
        prix_min: 350,
        prix_max: 800,
      });

      mainSheet.addRow({
        nom: "Spa Oasis Wellness",
        universe: "sport",
        subcategory: "Spa",
        ville: "Casablanca",
        region: "Casablanca-Settat",
        adresse: "Boulevard Anfa, Quartier Gauthier",
        telephone: "+212522987654",
        ambiance: "Cosy",
        amenities: "Hammam,Piscine,Sauna,Jacuzzi,Parking",
        prix_min: 200,
        prix_max: 1500,
      });

      // Freeze header row
      mainSheet.views = [{ state: "frozen", ySplit: 1 }];

      // ============================================
      // SHEET 2: Référentiel (hidden data for dropdowns)
      // ============================================
      const refSheet = workbook.addWorksheet("_Référentiel", {
        state: "veryHidden", // Hidden from users
      });

      // Column A: Universes
      refSheet.getColumn(1).values = ["Univers", ...UNIVERSES.map((u) => u.id)];

      // Column B: Villes
      refSheet.getColumn(2).values = ["Villes", ...MOROCCAN_CITIES];

      // Column C: Régions
      refSheet.getColumn(3).values = ["Régions", ...MOROCCAN_REGIONS];

      // Column D: Ambiances
      refSheet.getColumn(4).values = ["Ambiances", ...AMBIANCES];

      // Columns E-K: Subcategories by universe
      const universeIds = UNIVERSES.map((u) => u.id);
      universeIds.forEach((univId, idx) => {
        const col = 5 + idx;
        const subs = SUBCATEGORIES[univId] || [];
        refSheet.getColumn(col).values = [univId, ...subs];
      });

      // ============================================
      // SHEET 3: Guide taxonomie (visible reference)
      // ============================================
      const guideSheet = workbook.addWorksheet("Guide taxonomie", {
        properties: { tabColor: { argb: "FF28A745" } },
      });

      // Title
      guideSheet.mergeCells("A1:D1");
      guideSheet.getCell("A1").value = "📚 GUIDE DE LA TAXONOMIE - SORTIR AU MAROC";
      guideSheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FFA3001D" } };
      guideSheet.getCell("A1").alignment = { horizontal: "center" };
      guideSheet.getRow(1).height = 30;

      let currentRow = 3;

      // Universes section
      guideSheet.getCell(`A${currentRow}`).value = "🌍 UNIVERS DISPONIBLES";
      guideSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow++;

      guideSheet.getCell(`A${currentRow}`).value = "Code";
      guideSheet.getCell(`B${currentRow}`).value = "Label";
      guideSheet.getCell(`C${currentRow}`).value = "Sous-catégories";
      guideSheet.getRow(currentRow).font = { bold: true };
      currentRow++;

      for (const univ of UNIVERSES) {
        const subs = SUBCATEGORIES[univ.id] || [];
        guideSheet.getCell(`A${currentRow}`).value = univ.id;
        guideSheet.getCell(`B${currentRow}`).value = univ.label;
        guideSheet.getCell(`C${currentRow}`).value = subs.slice(0, 10).join(", ") + (subs.length > 10 ? "..." : "");
        currentRow++;
      }

      currentRow += 2;

      // Cities section
      guideSheet.getCell(`A${currentRow}`).value = "🏙️ VILLES DU MAROC";
      guideSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow++;

      const citiesPerRow = 5;
      for (let i = 0; i < MOROCCAN_CITIES.length; i += citiesPerRow) {
        const chunk = MOROCCAN_CITIES.slice(i, i + citiesPerRow);
        chunk.forEach((city, idx) => {
          guideSheet.getCell(currentRow, idx + 1).value = city;
        });
        currentRow++;
      }

      currentRow += 2;

      // Regions section
      guideSheet.getCell(`A${currentRow}`).value = "📍 RÉGIONS DU MAROC";
      guideSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow++;

      for (const region of MOROCCAN_REGIONS) {
        guideSheet.getCell(`A${currentRow}`).value = region;
        currentRow++;
      }

      currentRow += 2;

      // Ambiances section
      guideSheet.getCell(`A${currentRow}`).value = "✨ AMBIANCES";
      guideSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow++;

      for (let i = 0; i < AMBIANCES.length; i += 4) {
        const chunk = AMBIANCES.slice(i, i + 4);
        chunk.forEach((amb, idx) => {
          guideSheet.getCell(currentRow, idx + 1).value = amb;
        });
        currentRow++;
      }

      currentRow += 2;

      // Amenities section
      guideSheet.getCell(`A${currentRow}`).value = "🛠️ ÉQUIPEMENTS PAR UNIVERS";
      guideSheet.getCell(`A${currentRow}`).font = { bold: true, size: 14 };
      currentRow++;

      for (const [univId, amenities] of Object.entries(AMENITIES_BY_UNIVERSE)) {
        const univLabel = UNIVERSES.find((u) => u.id === univId)?.label || univId;
        guideSheet.getCell(`A${currentRow}`).value = univLabel;
        guideSheet.getCell(`A${currentRow}`).font = { bold: true };
        guideSheet.getCell(`B${currentRow}`).value = amenities.join(", ");
        currentRow++;
      }

      // Set column widths for guide
      guideSheet.getColumn(1).width = 25;
      guideSheet.getColumn(2).width = 25;
      guideSheet.getColumn(3).width = 60;
      guideSheet.getColumn(4).width = 20;
      guideSheet.getColumn(5).width = 20;

      // ============================================
      // Add data validations (dropdowns) to main sheet
      // ============================================

      // Universe dropdown (column B)
      const universeList = UNIVERSES.map((u) => u.id).join(",");
      for (let row = 2; row <= 500; row++) {
        mainSheet.getCell(`B${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`"${universeList}"`],
          showErrorMessage: true,
          errorTitle: "Univers invalide",
          error: "Veuillez sélectionner un univers dans la liste",
        };
      }

      // Ville dropdown (column D)
      for (let row = 2; row <= 500; row++) {
        mainSheet.getCell(`D${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`_Référentiel!$B$2:$B$${MOROCCAN_CITIES.length + 1}`],
          showErrorMessage: true,
          errorTitle: "Ville invalide",
          error: "Veuillez sélectionner une ville dans la liste",
        };
      }

      // Region dropdown (column E)
      for (let row = 2; row <= 500; row++) {
        mainSheet.getCell(`E${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`_Référentiel!$C$2:$C$${MOROCCAN_REGIONS.length + 1}`],
          showErrorMessage: true,
          errorTitle: "Région invalide",
          error: "Veuillez sélectionner une région dans la liste",
        };
      }

      // Ambiance dropdown (column S = 19)
      for (let row = 2; row <= 500; row++) {
        mainSheet.getCell(`S${row}`).dataValidation = {
          type: "list",
          allowBlank: true,
          formulae: [`_Référentiel!$D$2:$D$${AMBIANCES.length + 1}`],
          showErrorMessage: true,
          errorTitle: "Ambiance invalide",
          error: "Veuillez sélectionner une ambiance dans la liste",
        };
      }

      // Mark required columns with light red background in header notes
      // (conditional formatting for blanks not fully supported by exceljs)
      mainSheet.getCell("A1").note = "Champ obligatoire";
      mainSheet.getCell("B1").note = "Champ obligatoire - Sélectionnez dans la liste";
      mainSheet.getCell("D1").note = "Champ obligatoire - Sélectionnez dans la liste";

      // ============================================
      // SHEET 4: Sous-catégories détaillées
      // ============================================
      const subcatSheet = workbook.addWorksheet("Sous-catégories", {
        properties: { tabColor: { argb: "FF17A2B8" } },
      });

      subcatSheet.columns = [
        { header: "Univers", key: "universe", width: 20 },
        { header: "Sous-catégorie", key: "subcategory", width: 35 },
      ];

      const subcatHeaderRow = subcatSheet.getRow(1);
      subcatHeaderRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      subcatHeaderRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF17A2B8" },
      };

      for (const [univId, subs] of Object.entries(SUBCATEGORIES)) {
        const univLabel = UNIVERSES.find((u) => u.id === univId)?.label || univId;
        for (const sub of subs) {
          subcatSheet.addRow({ universe: univLabel, subcategory: sub });
        }
      }

      // Generate buffer and send
      const buffer = await workbook.xlsx.writeBuffer();

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", 'attachment; filename="template_etablissements_sam.xlsx"');
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("[Excel Template] Error:", error);
      res.status(500).json({ error: "Erreur lors de la génération du fichier Excel" });
    }
  }) as RequestHandler);

  // Keep CSV taxonomy for backwards compatibility
  router.get("/api/admin/import-export/taxonomy", ((req, res) => {
    // Create a comprehensive taxonomy reference file
    const lines: string[] = [];

    // Sheet 1: Universes & Subcategories
    lines.push("=== UNIVERS ET SOUS-CATÉGORIES ===");
    lines.push("universe;universe_label;subcategory");
    for (const univ of UNIVERSES) {
      const subs = SUBCATEGORIES[univ.id] || [];
      if (subs.length === 0) {
        lines.push(`${univ.id};${univ.label};`);
      } else {
        for (const sub of subs) {
          lines.push(`${univ.id};${univ.label};${sub}`);
        }
      }
    }

    lines.push("");
    lines.push("=== AMBIANCES ===");
    lines.push("ambiance");
    for (const amb of AMBIANCES) {
      lines.push(amb);
    }

    lines.push("");
    lines.push("=== ÉQUIPEMENTS PAR UNIVERS ===");
    lines.push("universe;amenity");
    for (const [univ, amenities] of Object.entries(AMENITIES_BY_UNIVERSE)) {
      for (const am of amenities) {
        lines.push(`${univ};${am}`);
      }
    }

    lines.push("");
    lines.push("=== VILLES DU MAROC ===");
    lines.push("ville");
    for (const city of MOROCCAN_CITIES) {
      lines.push(city);
    }

    lines.push("");
    lines.push("=== RÉGIONS DU MAROC ===");
    lines.push("region");
    for (const region of MOROCCAN_REGIONS) {
      lines.push(region);
    }

    const content = lines.join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="taxonomie_sam.csv"');
    res.send("\ufeff" + content); // BOM for Excel UTF-8
  }) as RequestHandler);

  // Download CSV template
  router.get("/api/admin/import-export/template", ((req, res) => {
    // Headers avec tous les champs supportés
    const headers = [
      // Infos de base (obligatoires: nom, ville)
      "nom",
      "universe",
      "subcategory",
      "ville",
      "adresse",
      "code_postal",
      "region",
      "pays",
      // Contact
      "telephone",
      "whatsapp",
      "email_etablissement",
      "site_web",
      "instagram",
      "facebook",
      // Descriptions
      "description_courte",
      "description_longue",
      // Infos pratiques
      "horaires",
      "prix_min",
      "prix_max",
      "devise",
      // SEO & Visibilité
      "tags",
      "amenities",
      "latitude",
      "longitude",
      // Propriétaire PRO (optionnel)
      "pro_email",
      "pro_nom",
      "pro_prenom",
      "pro_telephone",
      "pro_entreprise",
    ];

    // Exemples de données
    const examples = [
      // Restaurant
      [
        "Le Jardin Secret",
        "restaurants",
        "gastronomique",
        "Marrakech",
        "32 Rue Moulay Ali;Médina",
        "40000",
        "Marrakech-Safi",
        "MA",
        "+212524378040",
        "+212661234567",
        "contact@jardinsecret.ma",
        "https://jardinsecret.ma",
        "@jardinsecretmarrakech",
        "LeJardinSecretMarrakech",
        "Restaurant gastronomique dans un riad historique",
        "Niché au cœur de la médina de Marrakech, Le Jardin Secret vous propose une expérience culinaire raffinée dans un cadre exceptionnel. Notre chef propose une cuisine marocaine revisitée avec des produits frais du terroir.",
        "Mar-Dim: 12h-15h et 19h-23h",
        "350",
        "800",
        "MAD",
        "gastronomique,romantique,terrasse",
        "wifi,climatisation,terrasse,parking",
        "31.6295",
        "-7.9811",
        "ahmed.benali@email.com",
        "Benali",
        "Ahmed",
        "+212661000001",
        "Jardin Secret SARL",
      ],
      // Spa
      [
        "Spa Oasis Wellness",
        "sport",
        "spa",
        "Casablanca",
        "Boulevard Anfa;Quartier Gauthier",
        "20000",
        "Casablanca-Settat",
        "MA",
        "+212522987654",
        "+212662345678",
        "info@spaoasis.ma",
        "https://spaoasis.ma",
        "@spaoasiscasa",
        "",
        "Spa de luxe avec hammam traditionnel",
        "Spa Oasis Wellness vous offre une parenthèse de bien-être au cœur de Casablanca. Découvrez nos soins signature, notre hammam traditionnel et nos massages relaxants.",
        "Lun-Dim: 9h-21h",
        "200",
        "1500",
        "MAD",
        "bien-être,relaxation,hammam",
        "hammam,piscine,sauna,jacuzzi,parking",
        "33.5883",
        "-7.6114",
        "sarah.alami@email.com",
        "Alami",
        "Sarah",
        "+212662000002",
        "Oasis Wellness SA",
      ],
      // Hôtel
      [
        "Riad Atlas",
        "hebergement",
        "riad",
        "Fès",
        "15 Derb Sidi Ahmed;Fès el-Bali",
        "30000",
        "Fès-Meknès",
        "MA",
        "+212535634000",
        "+212663456789",
        "reservation@riadatlas.ma",
        "https://riadatlas.ma",
        "@riadatlasfes",
        "RiadAtlasFes",
        "Riad authentique dans la médina de Fès",
        "Le Riad Atlas vous accueille dans un cadre traditionnel entièrement restauré. Nos 8 chambres et suites offrent confort moderne et décoration artisanale fassi.",
        "Check-in: 14h / Check-out: 12h",
        "800",
        "2500",
        "MAD",
        "riad,authentique,piscine",
        "wifi,piscine,terrasse,climatisation,petit-dejeuner",
        "34.0616",
        "-4.9775",
        "",
        "",
        "",
        "",
        "",
      ],
    ];

    const template = [headers.join(";"), ...examples.map((row) => row.join(";"))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="template_etablissements_sam.csv"');
    res.send("\ufeff" + template); // BOM for Excel UTF-8
  }) as RequestHandler);

  // Preview import (validate without saving + check for existing establishments)
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

      // Get Supabase client to check for existing establishments
      const supabase = getSupabaseAdmin();

      // Extract all names and cities for batch lookup
      const normalizedRows = rows.map(normalizeRow);
      const nameCityPairs = normalizedRows
        .filter((r) => r.nom && r.ville)
        .map((r) => ({ name: r.nom.trim().toLowerCase(), city: r.ville.trim().toLowerCase() }));

      // Fetch existing establishments that might match
      const { data: existingEstablishments } = await supabase
        .from("establishments")
        .select("id, name, city, status, phone")
        .or(
          nameCityPairs
            .slice(0, 100) // Limit to prevent too large query
            .map((p) => `and(name.ilike.%${p.name.replace(/'/g, "''")}%,city.ilike.%${p.city.replace(/'/g, "''")}%)`)
            .join(",")
        );

      // Create a map for quick lookup
      const existingMap = new Map<string, { id: string; name: string; city: string; status: string; phone: string | null }>();
      if (existingEstablishments) {
        for (const est of existingEstablishments) {
          const key = `${est.name?.toLowerCase().trim()}|${est.city?.toLowerCase().trim()}`;
          existingMap.set(key, est);
        }
      }

      const preview: Array<{
        row: number;
        data: ImportRow;
        valid: boolean;
        error?: string;
        existingMatch?: {
          id: string;
          name: string;
          city: string;
          status: string;
          phone: string | null;
        };
        isNew: boolean;
      }> = [];

      for (let i = 0; i < normalizedRows.length; i++) {
        const normalized = normalizedRows[i];
        const error = validateRow(normalized);

        // Check if establishment already exists
        const lookupKey = `${normalized.nom?.toLowerCase().trim()}|${normalized.ville?.toLowerCase().trim()}`;
        const existing = existingMap.get(lookupKey);

        // Also check for partial matches (same name, different city OR same city with similar name)
        let partialMatch: typeof existing = undefined;
        if (!existing && normalized.nom && normalized.ville) {
          for (const [, est] of existingMap) {
            // Same name, different city
            if (est.name?.toLowerCase().trim() === normalized.nom.toLowerCase().trim()) {
              partialMatch = est;
              break;
            }
            // Same city, similar name (contains)
            if (
              est.city?.toLowerCase().trim() === normalized.ville.toLowerCase().trim() &&
              (est.name?.toLowerCase().includes(normalized.nom.toLowerCase()) ||
                normalized.nom.toLowerCase().includes(est.name?.toLowerCase() || ""))
            ) {
              partialMatch = est;
              break;
            }
          }
        }

        preview.push({
          row: i + 1,
          data: normalized,
          valid: !error,
          error: error || undefined,
          existingMatch: existing || partialMatch || undefined,
          isNew: !existing && !partialMatch,
        });
      }

      const validCount = preview.filter((p) => p.valid).length;
      const invalidCount = preview.filter((p) => !p.valid).length;
      const newCount = preview.filter((p) => p.valid && p.isNew).length;
      const existingCount = preview.filter((p) => p.valid && !p.isNew).length;

      return res.json({
        total: rows.length,
        valid: validCount,
        invalid: invalidCount,
        newCount,
        existingCount,
        preview: preview.slice(0, 100), // Return first 100 for preview
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
            country_code: normalized.pays?.trim() || "MA",
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
              instagram: normalized.instagram || null,
              facebook: normalized.facebook || null,
              prix_min: normalized.prix_min ? parseFloat(normalized.prix_min) : null,
              prix_max: normalized.prix_max ? parseFloat(normalized.prix_max) : null,
              devise: normalized.devise || "MAD",
              latitude: normalized.latitude ? parseFloat(normalized.latitude) : null,
              longitude: normalized.longitude ? parseFloat(normalized.longitude) : null,
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
        slug,
        username,
        universe,
        subcategory,
        city,
        address,
        postal_code,
        region,
        country_code,
        phone,
        whatsapp,
        website,
        description_short,
        description_long,
        status,
        verified,
        premium,
        booking_enabled,
        menu_digital_enabled,
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
          slug: e.slug || "",
          username: e.username || "",
          universe: e.universe || "",
          subcategory: e.subcategory || "",
          ville: e.city || "",
          adresse: e.address || "",
          code_postal: e.postal_code || "",
          region: e.region || "",
          pays: e.country_code || "MA",
          telephone: e.phone || "",
          whatsapp: e.whatsapp || "",
          email_etablissement: (extra.email_etablissement as string) || "",
          site_web: e.website || "",
          instagram: (extra.instagram as string) || "",
          facebook: (extra.facebook as string) || "",
          description_courte: e.description_short || "",
          description_longue: e.description_long || "",
          latitude: (extra.latitude as string) || "",
          longitude: (extra.longitude as string) || "",
          status: e.status || "",
          verified: e.verified || false,
          premium: e.premium || false,
          booking_enabled: e.booking_enabled || false,
          menu_digital_enabled: e.menu_digital_enabled || false,
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
