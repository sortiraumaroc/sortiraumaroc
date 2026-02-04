import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Facebook,
  Ghost,
  HelpCircle,
  ImagePlus,
  Instagram,
  Loader2,
  Minus,
  Plus,
  Send,
  Trash2,
  Upload,
  Youtube,
  GripVertical,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { fileToAvatarDataUrl } from "@/lib/profilePhoto";
import { setProProfileAvatar, getProProfileAvatar } from "@/lib/pro/profile";
import {
  listEstablishmentProfileDraftChanges,
  listEstablishmentProfileDrafts,
  submitEstablishmentProfileUpdate,
} from "@/lib/pro/api";
import { isDemoModeEnabled } from "@/lib/demoMode";
import type { Establishment, EstablishmentProfileDraft, ProRole } from "@/lib/pro/types";
import {
  getPublicUniverses,
  getPublicCategories,
  getPublicCategoryImages,
  type PublicUniverse,
  type PublicCategoryItem,
  type PublicCategoryImageItem,
} from "@/lib/publicApi";
import { UsernameSection } from "@/components/pro/UsernameSection";

type Props = {
  establishment: Establishment;
  role: ProRole;
  onUpdated: () => Promise<void>;
  userId: string;
  userEmail: string | null;
};

function joinArray(v: string[] | null | undefined): string {
  return (v ?? []).join(", ");
}

function joinLines(v: string[] | null | undefined): string {
  return (v ?? []).join("\n");
}

function splitCsv(v: string): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitListInput(v: string): string[] {
  return String(v ?? "")
    .split(/[\n,]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeForDedup(v: string): string {
  return v
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function addToCsvField(current: string, valueToAdd: string): string {
  const normalizedToAdd = normalizeForDedup(valueToAdd);
  if (!normalizedToAdd) return current;

  const parts = splitCsv(current);
  const seen = new Set(parts.map((p) => normalizeForDedup(p)));
  if (seen.has(normalizedToAdd)) return current;

  return [...parts, valueToAdd].join(", ");
}

function addToLinesField(current: string, valueToAdd: string): string {
  const normalizedToAdd = normalizeForDedup(valueToAdd);
  if (!normalizedToAdd) return current;

  const parts = splitListInput(current);
  const seen = new Set(parts.map((p) => normalizeForDedup(p)));
  if (seen.has(normalizedToAdd)) return current;

  return [...parts, valueToAdd].join("\n");
}

type MixRow = { key: string; value: string };

function mixToRows(input: unknown): MixRow[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const rec = input as Record<string, unknown>;

  const out: MixRow[] = [];
  for (const [k, v] of Object.entries(rec)) {
    if (!k || typeof k !== "string") continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out.push({ key: k, value: String(v) });
      continue;
    }
    try {
      out.push({ key: k, value: JSON.stringify(v) });
    } catch {
      out.push({ key: k, value: "" });
    }
  }

  return out;
}

function parseMixValue(raw: string): unknown {
  const v = String(raw ?? "").trim();
  if (!v) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
  }

  if (v.toLowerCase() === "true") return true;
  if (v.toLowerCase() === "false") return false;

  return v;
}

function buildMixExperience(rows: MixRow[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};

  for (const row of rows) {
    const key = String(row.key ?? "").trim();
    if (!key) continue;

    const parsed = parseMixValue(row.value);
    if (parsed === null) continue;
    out[key] = parsed;
  }

  return Object.keys(out).length ? out : null;
}

type CompanyRole = "Propriétaire" | "Gérant" | "Agence" | "Autres" | "";

type CompanyInfoState = {
  contactLastName: string;
  contactFirstName: string;
  role: CompanyRole | string;
  address: string;
  email: string;
  phone1: string;
  phone2: string;
  ice: string;
};

function asPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function getCompanyInfoFromExtra(extra: unknown): CompanyInfoState {
  const extraObj = asPlainObject(extra);
  const company = asPlainObject(extraObj.company);
  return {
    contactLastName: typeof company.contact_last_name === "string" ? company.contact_last_name : "",
    contactFirstName: typeof company.contact_first_name === "string" ? company.contact_first_name : "",
    role: typeof company.role === "string" ? company.role : "",
    address: typeof company.address === "string" ? company.address : "",
    email: typeof company.email === "string" ? company.email : "",
    phone1: typeof company.phone1 === "string" ? company.phone1 : "",
    phone2: typeof company.phone2 === "string" ? company.phone2 : "",
    ice: typeof company.ice === "string" ? company.ice : "",
  };
}

function buildCompanyExtra(input: {
  companyContactLastName: string;
  companyContactFirstName: string;
  companyRole: string;
  companyAddress: string;
  companyEmail: string;
  companyPhone1: string;
  companyPhone2: string;
  companyIce: string;
}): Record<string, unknown> | null {
  const out: Record<string, string> = {};

  const add = (key: string, value: string) => {
    const v = String(value ?? "").trim();
    if (v) out[key] = v;
  };

  add("contact_last_name", input.companyContactLastName);
  add("contact_first_name", input.companyContactFirstName);
  add("role", input.companyRole);
  add("address", input.companyAddress);
  add("email", input.companyEmail);
  add("phone1", input.companyPhone1);
  add("phone2", input.companyPhone2);
  add("ice", input.companyIce);

  return Object.keys(out).length ? out : null;
}

function buildExtraUpdate(existingExtra: unknown, company: Record<string, unknown> | null): Record<string, unknown> {
  const base = { ...asPlainObject(existingExtra) };
  if (company) {
    base.company = company;
  } else {
    delete base.company;
  }
  return base;
}

type QuickAddWordsProps = {
  label: string;
  words: string[];
  disabled?: boolean;
  onAdd: (word: string) => void;
};

function QuickAddWords({ label, words, disabled, onAdd }: QuickAddWordsProps) {
  if (!words.length) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="flex flex-wrap gap-2">
        {words.map((w) => (
          <button
            key={w}
            type="button"
            disabled={disabled}
            onClick={() => onAdd(w)}
            className="text-sm italic text-slate-700 hover:text-slate-950 underline underline-offset-4 disabled:opacity-50 disabled:hover:text-slate-700"
          >
            {w}
          </button>
        ))}
      </div>
    </div>
  );
}


function formatDraftStatus(status: string) {
  if (status === "pending") return { label: "En attente", className: "bg-amber-100 text-amber-700 border-amber-200" };
  if (status === "approved") return { label: "Approuvée", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (status === "partially_accepted") {
    return { label: "Partiellement acceptée", className: "bg-sky-100 text-sky-700 border-sky-200" };
  }
  if (status === "rejected") return { label: "Rejetée", className: "bg-red-100 text-red-700 border-red-200" };
  return { label: status, className: "bg-slate-100 text-slate-700 border-slate-200" };
}

type EstablishmentProfileDraftChange = {
  id: string;
  draft_id: string;
  establishment_id: string;
  field: string;
  before: unknown;
  after: unknown;
  status: string;
  reason: string | null;
  created_at: string;
  decided_at: string | null;
};

const PROFILE_FIELD_LABELS: Record<string, string> = {
  name: "Nom",
  universe: "Univers",
  category: "Catégorie",
  subcategory: "Sous-catégorie",
  specialties: "Spécialités",
  city: "Ville",
  postal_code: "Code postal",
  region: "Région",
  country: "Pays",
  address: "Adresse",
  lat: "Latitude",
  lng: "Longitude",
  description_short: "Description courte",
  description_long: "Description longue",
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  website: "Site web",
  social_links: "Réseaux sociaux",
  hours: "Horaires",
  tags: "Tags",
  amenities: "Équipements",
  cover_url: "Photo de couverture",
  gallery_urls: "Photos (galerie)",
  ambiance_tags: "Ambiances",
  extra: "Infos complémentaires",
  mix_experience: "Points forts",
};

function profileFieldLabel(field: string): string {
  return PROFILE_FIELD_LABELS[field] ?? field;
}

function formatChangeStatus(status: string) {
  const s = (status ?? "").toLowerCase();
  if (s === "accepted") return { label: "Accepté", className: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (s === "rejected") return { label: "Refusé", className: "bg-red-100 text-red-700 border-red-200" };
  return { label: "En attente", className: "bg-amber-100 text-amber-700 border-amber-200" };
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function inlineValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() ? value.trim() : "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `${value.length} élément(s)`;
  if (typeof value === "object") return "(objet)";
  return String(value);
}

// Aliases for dialog usage
function formatFieldLabel(field: string): string {
  return profileFieldLabel(field);
}

function formatChangeValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    // If array of strings, join them
    if (value.every((v) => typeof v === "string")) return value.join(", ");
    return `${value.length} élément(s)`;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "(objet)";
    }
  }
  return String(value);
}

function buildDemoDraftHistory(params: { establishmentId: string; userId: string }): EstablishmentProfileDraft[] {
  const now = Date.now();
  const reasons = [
    "Description courte mise à jour",
    "Ajout de photos (galerie)",
    "Mise à jour des horaires",
    "Correction de l’adresse",
    "Ajout des réseaux sociaux",
  ];

  return reasons.map((reason, idx) => {
    const createdAt = new Date(now - (idx + 1) * 36 * 60 * 60 * 1000).toISOString();
    const decidedAt = new Date(now - (idx + 1) * 35 * 60 * 60 * 1000).toISOString();

    return {
      id: `demo-${params.establishmentId}-${idx + 1}`,
      establishment_id: params.establishmentId,
      created_by: params.userId,
      data: {},
      moderation_id: "demo-moderation",
      status: "approved",
      reason,
      created_at: createdAt,
      decided_at: decidedAt,
    };
  });
}

type WeekdayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type OpeningInterval = {
  type: "lunch" | "dinner";
  from: string;
  to: string;
};

type OpeningHours = Record<WeekdayKey, OpeningInterval[]>;

type DayEditorState = {
  open: boolean;
  mode: "continuous" | "split";
  aFrom: string;
  aTo: string;
  bFrom: string;
  bTo: string;
};

type OpeningHoursEditorState = Record<WeekdayKey, DayEditorState>;

const WEEKDAYS_ORDER: WeekdayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKDAY_LABELS_FR: Record<WeekdayKey, string> = {
  monday: "Lundi",
  tuesday: "Mardi",
  wednesday: "Mercredi",
  thursday: "Jeudi",
  friday: "Vendredi",
  saturday: "Samedi",
  sunday: "Dimanche",
};

function isTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function defaultHoursEditorState(): OpeningHoursEditorState {
  const mk = (): DayEditorState => ({
    open: false,
    mode: "continuous",
    aFrom: "09:00",
    aTo: "18:00",
    bFrom: "",
    bTo: "",
  });

  return {
    monday: mk(),
    tuesday: mk(),
    wednesday: mk(),
    thursday: mk(),
    friday: mk(),
    saturday: mk(),
    sunday: mk(),
  };
}

function hoursToEditorState(input: unknown): OpeningHoursEditorState {
  const base = defaultHoursEditorState();
  const rec = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  if (!rec) return base;

  for (const k of WEEKDAYS_ORDER) {
    const arr = rec[k];
    if (!Array.isArray(arr)) continue;
    const intervals = arr
      .filter((i): i is OpeningInterval =>
        !!i &&
        typeof i === "object" &&
        (i as OpeningInterval).type !== undefined &&
        ((i as OpeningInterval).type === "lunch" || (i as OpeningInterval).type === "dinner") &&
        typeof (i as OpeningInterval).from === "string" &&
        typeof (i as OpeningInterval).to === "string" &&
        isTime((i as OpeningInterval).from) &&
        isTime((i as OpeningInterval).to),
      )
      .map((i) => ({ type: i.type, from: i.from, to: i.to }));

    if (!intervals.length) continue;

    if (intervals.length === 1) {
      base[k] = {
        open: true,
        mode: "continuous",
        aFrom: intervals[0].from,
        aTo: intervals[0].to,
        bFrom: "",
        bTo: "",
      };
      continue;
    }

    const lunch = intervals.find((x) => x.type === "lunch") ?? intervals[0];
    const dinner = intervals.find((x) => x.type === "dinner") ?? intervals[1];

    base[k] = {
      open: true,
      mode: "split",
      aFrom: lunch.from,
      aTo: lunch.to,
      bFrom: dinner.from,
      bTo: dinner.to,
    };
  }

  return base;
}

function editorStateToHours(state: OpeningHoursEditorState): OpeningHours {
  const out: OpeningHours = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };

  for (const k of WEEKDAYS_ORDER) {
    const d = state[k];
    if (!d.open) {
      out[k] = [];
      continue;
    }

    if (d.mode === "continuous") {
      if (isTime(d.aFrom) && isTime(d.aTo)) {
        out[k] = [{ type: "lunch", from: d.aFrom, to: d.aTo }];
      } else {
        out[k] = [];
      }
      continue;
    }

    const intervals: OpeningInterval[] = [];
    if (isTime(d.aFrom) && isTime(d.aTo)) intervals.push({ type: "lunch", from: d.aFrom, to: d.aTo });
    if (isTime(d.bFrom) && isTime(d.bTo)) intervals.push({ type: "dinner", from: d.bFrom, to: d.bTo });
    out[k] = intervals;
  }

  return out;
}

function validateHours(state: OpeningHoursEditorState): { ok: true } | { ok: false; message: string } {
  for (const k of WEEKDAYS_ORDER) {
    const d = state[k];
    if (!d.open) continue;

    const label = WEEKDAY_LABELS_FR[k];

    if (!isTime(d.aFrom) || !isTime(d.aTo)) {
      return { ok: false, message: `Horaires invalides (${label})` };
    }

    if (d.mode === "split") {
      if (!isTime(d.bFrom) || !isTime(d.bTo)) {
        return { ok: false, message: `Deuxième plage invalide (${label})` };
      }
    }
  }

  return { ok: true };
}

type CountryOption = { code: string; label: string };

const PHONE_COUNTRIES: CountryOption[] = [
  { code: "+212", label: "Maroc (+212)" },
  { code: "+33", label: "France (+33)" },
  { code: "+34", label: "Espagne (+34)" },
  { code: "+44", label: "UK (+44)" },
];

const MOROCCO_REGIONS = [
  "Tanger-Tétouan-Al Hoceïma",
  "L’Oriental",
  "Fès-Meknès",
  "Rabat-Salé-Kénitra",
  "Béni Mellal-Khénifra",
  "Casablanca-Settat",
  "Marrakech-Safi",
  "Drâa-Tafilalet",
  "Souss-Massa",
  "Guelmim-Oued Noun",
  "Laâyoune-Sakia El Hamra",
  "Dakhla-Oued Ed-Dahab",
];

const MOROCCO_MAJOR_CITIES = [
  "Casablanca",
  "Rabat",
  "Marrakech",
  "Fès",
  "Tanger",
  "Agadir",
  "Meknès",
  "Oujda",
  "Kénitra",
  "Tétouan",
  "Safi",
  "El Jadida",
  "Mohammedia",
  "Nador",
  "Béni Mellal",
  "Khouribga",
  "Taza",
  "Essaouira",
  "Ouarzazate",
  "Errachidia",
  "Laâyoune",
  "Dakhla",
  "Guelmim",
  "Settat",
  "Berrechid",
  "Salé",
  "Temara",
  "Al Hoceïma",
  "Chefchaouen",
  "Ifrane",
  "Taroudant",
];

// ISO 3166-1 alpha-2 (used to build a full country list via Intl.DisplayNames)
const ISO_COUNTRY_CODES = [
  "AD",
  "AE",
  "AF",
  "AG",
  "AI",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AT",
  "AU",
  "AW",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BE",
  "BF",
  "BG",
  "BH",
  "BI",
  "BJ",
  "BL",
  "BM",
  "BN",
  "BO",
  "BQ",
  "BR",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CA",
  "CC",
  "CD",
  "CF",
  "CG",
  "CH",
  "CI",
  "CK",
  "CL",
  "CM",
  "CN",
  "CO",
  "CR",
  "CU",
  "CV",
  "CW",
  "CX",
  "CY",
  "CZ",
  "DE",
  "DJ",
  "DK",
  "DM",
  "DO",
  "DZ",
  "EC",
  "EE",
  "EG",
  "EH",
  "ER",
  "ES",
  "ET",
  "FI",
  "FJ",
  "FK",
  "FM",
  "FO",
  "FR",
  "GA",
  "GB",
  "GD",
  "GE",
  "GF",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GP",
  "GQ",
  "GR",
  "GS",
  "GT",
  "GU",
  "GW",
  "GY",
  "HK",
  "HM",
  "HN",
  "HR",
  "HT",
  "HU",
  "ID",
  "IE",
  "IL",
  "IM",
  "IN",
  "IO",
  "IQ",
  "IR",
  "IS",
  "IT",
  "JE",
  "JM",
  "JO",
  "JP",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KR",
  "KW",
  "KY",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LT",
  "LU",
  "LV",
  "LY",
  "MA",
  "MC",
  "MD",
  "ME",
  "MF",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MQ",
  "MR",
  "MS",
  "MT",
  "MU",
  "MV",
  "MW",
  "MX",
  "MY",
  "MZ",
  "NA",
  "NC",
  "NE",
  "NF",
  "NG",
  "NI",
  "NL",
  "NO",
  "NP",
  "NR",
  "NU",
  "NZ",
  "OM",
  "PA",
  "PE",
  "PF",
  "PG",
  "PH",
  "PK",
  "PL",
  "PM",
  "PN",
  "PR",
  "PS",
  "PT",
  "PW",
  "PY",
  "QA",
  "RE",
  "RO",
  "RS",
  "RU",
  "RW",
  "SA",
  "SB",
  "SC",
  "SD",
  "SE",
  "SG",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SX",
  "SY",
  "SZ",
  "TC",
  "TD",
  "TF",
  "TG",
  "TH",
  "TJ",
  "TK",
  "TL",
  "TM",
  "TN",
  "TO",
  "TR",
  "TT",
  "TV",
  "TW",
  "TZ",
  "UA",
  "UG",
  "UM",
  "US",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VG",
  "VI",
  "VN",
  "VU",
  "WF",
  "WS",
  "YE",
  "YT",
  "ZA",
  "ZM",
  "ZW",
];

type CountryListItem = { code: string; label: string };

function getAllCountries(locale: string = "fr"): CountryListItem[] {
  if (typeof Intl === "undefined") return ISO_COUNTRY_CODES.map((code) => ({ code, label: code }));
  const DisplayNamesCtor = (Intl as unknown as { DisplayNames?: unknown }).DisplayNames;
  if (typeof DisplayNamesCtor !== "function") return ISO_COUNTRY_CODES.map((code) => ({ code, label: code }));

  const dn = new (DisplayNamesCtor as new (locales: string[], opts: { type: "region" }) => { of: (code: string) => string | undefined })(
    [locale],
    { type: "region" },
  );

  const items = ISO_COUNTRY_CODES.map((code) => ({ code, label: dn.of(code) ?? code }));
  items.sort((a, b) => a.label.localeCompare(b.label, locale));

  // Put Morocco first for convenience.
  const idx = items.findIndex((x) => x.code === "MA");
  if (idx > 0) {
    const [ma] = items.splice(idx, 1);
    items.unshift(ma);
  }

  return items;
}

function splitE164(value: string | null | undefined): { country: string; national: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { country: "+212", national: "" };

  const digits = raw.replace(/\s+/g, "");
  const best = PHONE_COUNTRIES.slice().sort((a, b) => b.code.length - a.code.length).find((c) => digits.startsWith(c.code));
  if (best) {
    return { country: best.code, national: digits.slice(best.code.length).replace(/\D+/g, "") };
  }

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    const m = rest.match(/^(\d{1,3})(\d+)$/);
    if (m) return { country: `+${m[1]}`, national: m[2] };
  }

  return { country: "+212", national: digits.replace(/\D+/g, "") };
}

function toE164(country: string, national: string): string | null {
  const cc = String(country ?? "").trim();
  if (!cc.startsWith("+")) return null;

  const digits = String(national ?? "").replace(/\D+/g, "");
  if (!digits) return null;

  const normalized = digits.replace(/^0+/, "");
  if (!normalized) return null;

  return `${cc}${normalized}`;
}

type SocialKey = "instagram" | "facebook" | "snapchat" | "tiktok" | "youtube" | "google_maps";

const SOCIAL_FIELDS: Array<{
  key: SocialKey;
  label: string;
  placeholder: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/votrecompte", Icon: Instagram },
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/votrepag", Icon: Facebook },
  { key: "snapchat", label: "Snapchat", placeholder: "https://snapchat.com/add/votrecompte", Icon: Ghost },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@...", Icon: Youtube },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@...", Icon: ImagePlus },
  { key: "google_maps", label: "Google Maps", placeholder: "Lien Google Maps", Icon: HelpCircle },
];

function getSocialValue(input: unknown, key: SocialKey): string {
  if (!input || typeof input !== "object") return "";
  const v = (input as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}

function buildSocialLinks(state: Record<SocialKey, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key } of SOCIAL_FIELDS) {
    const v = state[key].trim();
    if (v) out[key] = v;
  }
  return out;
}

const SLIDER_EXAMPLE_IMAGES: string[] = [
  "https://images.pexels.com/photos/11038192/pexels-photo-11038192.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/756493/pexels-photo-756493.jpeg?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/26271085/pexels-photo-26271085.png?auto=compress&cs=tinysrgb&w=1400",
  "https://images.pexels.com/photos/3997981/pexels-photo-3997981.jpeg?auto=compress&cs=tinysrgb&w=1400",
];

function formatUrlShort(url: string): string {
  const v = url.trim();
  if (!v) return "";
  try {
    const u = new URL(v);
    const path = u.pathname.length > 18 ? `${u.pathname.slice(0, 18)}…` : u.pathname;
    return `${u.hostname}${path === "/" ? "" : path}`;
  } catch {
    return v.length > 24 ? `${v.slice(0, 24)}…` : v;
  }
}

export function ProEstablishmentTab({ establishment, role, onUpdated, userId, userEmail }: Props) {
  const [drafts, setDrafts] = useState<EstablishmentProfileDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingChanges, setPendingChanges] = useState<EstablishmentProfileDraftChange[]>([]);
  const [pendingChangesLoading, setPendingChangesLoading] = useState(false);
  const [pendingChangesError, setPendingChangesError] = useState<string | null>(null);

  // Draft detail popup state
  const [selectedDraftForDetail, setSelectedDraftForDetail] = useState<EstablishmentProfileDraft | null>(null);
  const [draftDetailChanges, setDraftDetailChanges] = useState<EstablishmentProfileDraftChange[]>([]);
  const [draftDetailLoading, setDraftDetailLoading] = useState(false);

  const demoDrafts = useMemo(
    () => buildDemoDraftHistory({ establishmentId: establishment.id, userId }),
    [establishment.id, userId],
  );

  const canShowDemoDrafts = isDemoModeEnabled();
  const showingDemoDrafts = canShowDemoDrafts && !loading && !drafts.length;

  const draftsToShow = useMemo(() => {
    const source = drafts.length ? drafts : canShowDemoDrafts ? demoDrafts : [];
    return [...source]
      .filter((d) => !!d?.created_at)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [canShowDemoDrafts, demoDrafts, drafts]);

  const canEdit = role === "owner" || role === "manager" || role === "marketing";

  const allCountries = useMemo(() => getAllCountries("fr"), []);
  const countryListId = `establishment-country-${establishment.id}`;
  const regionListId = `establishment-region-${establishment.id}`;
  const cityListId = `establishment-city-${establishment.id}`;

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const profileAvatarInputRef = useRef<HTMLInputElement | null>(null);

  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(() => getProProfileAvatar(userId));

  // Dynamic universes, categories (level 2), and subcategories (level 3) from database
  const [universesList, setUniversesList] = useState<PublicUniverse[]>([]);
  const [categoriesLevel2List, setCategoriesLevel2List] = useState<PublicCategoryItem[]>([]);
  const [categoriesList, setCategoriesList] = useState<PublicCategoryImageItem[]>([]);
  const [universesLoading, setUniversesLoading] = useState(true);
  const [categoriesLevel2Loading, setCategoriesLevel2Loading] = useState(false);

  const profileInitials = useMemo(() => {
    const email = (userEmail ?? "").trim();
    if (!email) return "PR";
    const base = email.includes("@") ? email.split("@", 1)[0] ?? "" : email;
    const cleaned = base.replace(/[^a-zA-Z0-9]+/g, " ").trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
    const p = parts[0] ?? "";
    if (p.length >= 2) return p.slice(0, 2).toUpperCase();
    if (p.length === 1) return (p + "P").toUpperCase();
    return "PR";
  }, [userEmail]);

  useEffect(() => {
    setProfileAvatarUrl(getProProfileAvatar(userId));
  }, [userId]);

  const [form, setForm] = useState(() => {
    const phone = splitE164(establishment.phone);
    const wa = splitE164(establishment.whatsapp);
    const company = getCompanyInfoFromExtra(establishment.extra);

    return {
      name: establishment.name ?? "",
      universe: establishment.universe ?? "",
      category: "", // Level 2 category (extracted from subcategory's category_slug if available)
      subcategory: establishment.subcategory ?? "",
      specialtiesCsv: joinArray(establishment.specialties),
      companyContactLastName: company.contactLastName,
      companyContactFirstName: company.contactFirstName,
      companyRole: company.role,
      companyAddress: company.address,
      companyEmail: company.email,
      companyPhone1: company.phone1,
      companyPhone2: company.phone2,
      companyIce: company.ice,
      city: establishment.city ?? "",
      postalCode: establishment.postal_code ?? "",
      region: establishment.region ?? "",
      country: establishment.country ?? "Maroc",
      address: establishment.address ?? "",
      lat: establishment.lat?.toString() ?? "",
      lng: establishment.lng?.toString() ?? "",
      descriptionShort: establishment.description_short ?? "",
      descriptionLong: establishment.description_long ?? "",
      phoneCountry: phone.country,
      phoneNational: phone.national,
      whatsappCountry: wa.country,
      whatsappNational: wa.national,
      website: establishment.website ?? "",
      email: establishment.email ?? "",
      tagsCsv: joinLines(establishment.tags),
      amenitiesCsv: joinLines(establishment.amenities),
      coverUrl: establishment.cover_url ?? "",
      galleryUrls: (establishment.gallery_urls ?? []) as string[],
      ambianceCsv: joinLines(establishment.ambiance_tags),
      social: {
        instagram: getSocialValue(establishment.social_links, "instagram"),
        facebook: getSocialValue(establishment.social_links, "facebook"),
        snapchat: getSocialValue(establishment.social_links, "snapchat"),
        tiktok: getSocialValue(establishment.social_links, "tiktok"),
        youtube: getSocialValue(establishment.social_links, "youtube"),
        google_maps: getSocialValue(establishment.social_links, "google_maps"),
      } as Record<SocialKey, string>,
      hoursEditor: hoursToEditorState(establishment.hours),
      mixRows: mixToRows(establishment.mix_experience),
    };
  });

  // Load universes from database on mount
  useEffect(() => {
    setUniversesLoading(true);
    getPublicUniverses()
      .then((res) => setUniversesList(res.universes))
      .catch(() => setUniversesList([]))
      .finally(() => setUniversesLoading(false));
  }, []);

  // Load categories (level 2) when universe changes
  useEffect(() => {
    const universeSlug = form.universe?.toLowerCase().trim();
    if (!universeSlug) {
      setCategoriesLevel2List([]);
      setCategoriesList([]);
      return;
    }
    setCategoriesLevel2Loading(true);
    getPublicCategories({ universe: universeSlug })
      .then((res) => setCategoriesLevel2List(res.items))
      .catch(() => setCategoriesLevel2List([]))
      .finally(() => setCategoriesLevel2Loading(false));
  }, [form.universe]);

  // Load subcategories (level 3) when universe or category changes
  useEffect(() => {
    const universeSlug = form.universe?.toLowerCase().trim();
    const categorySlug = form.category?.toLowerCase().trim();
    if (!universeSlug) {
      setCategoriesList([]);
      return;
    }
    getPublicCategoryImages({ universe: universeSlug, category: categorySlug || undefined })
      .then((res) => setCategoriesList(res.items))
      .catch(() => setCategoriesList([]));
  }, [form.universe, form.category]);

  const [hoursExpanded, setHoursExpanded] = useState<Record<WeekdayKey, boolean>>(() => {
    const out = {} as Record<WeekdayKey, boolean>;
    for (const k of WEEKDAYS_ORDER) out[k] = false;
    return out;
  });

  const [infoSectionOpen, setInfoSectionOpen] = useState(false);
  const [enterpriseSectionOpen, setEnterpriseSectionOpen] = useState(false);
  const [locationSectionOpen, setLocationSectionOpen] = useState(false);
  const [descriptionsSectionOpen, setDescriptionsSectionOpen] = useState(false);
  const [contactsSectionOpen, setContactsSectionOpen] = useState(false);
  const [mediaSectionOpen, setMediaSectionOpen] = useState(false);
  const [tagsSectionOpen, setTagsSectionOpen] = useState(false);

  const [hoursSectionOpen, setHoursSectionOpen] = useState(false);
  const [socialSectionOpen, setSocialSectionOpen] = useState(false);

  type MainSectionKey =
    | "enterprise"
    | "info"
    | "location"
    | "descriptions"
    | "contacts"
    | "media"
    | "tags"
    | "hours"
    | "social";

  // Load draft changes for detail popup
  const openDraftDetail = useCallback(
    async (draft: EstablishmentProfileDraft) => {
      setSelectedDraftForDetail(draft);
      setDraftDetailLoading(true);
      setDraftDetailChanges([]);

      try {
        const changes = await listEstablishmentProfileDraftChanges({
          establishmentId: establishment.id,
          draftId: draft.id,
        });
        setDraftDetailChanges(changes as EstablishmentProfileDraftChange[]);
      } catch {
        // If API fails, just show empty changes
        setDraftDetailChanges([]);
      } finally {
        setDraftDetailLoading(false);
      }
    },
    [establishment.id],
  );

  const setOnlyOpenSection = useCallback(
    (section: MainSectionKey, open: boolean) => {
      if (!open) {
        if (section === "enterprise") setEnterpriseSectionOpen(false);
        if (section === "info") setInfoSectionOpen(false);
        if (section === "location") setLocationSectionOpen(false);
        if (section === "descriptions") setDescriptionsSectionOpen(false);
        if (section === "contacts") setContactsSectionOpen(false);
        if (section === "media") setMediaSectionOpen(false);
        if (section === "tags") setTagsSectionOpen(false);
        if (section === "hours") setHoursSectionOpen(false);
        if (section === "social") setSocialSectionOpen(false);
        return;
      }

      setEnterpriseSectionOpen(section === "enterprise");
      setInfoSectionOpen(section === "info");
      setLocationSectionOpen(section === "location");
      setDescriptionsSectionOpen(section === "descriptions");
      setContactsSectionOpen(section === "contacts");
      setMediaSectionOpen(section === "media");
      setTagsSectionOpen(section === "tags");
      setHoursSectionOpen(section === "hours");
      setSocialSectionOpen(section === "social");
    },
    [],
  );

  useEffect(() => {
    const phone = splitE164(establishment.phone);
    const wa = splitE164(establishment.whatsapp);
    const company = getCompanyInfoFromExtra(establishment.extra);

    setForm({
      name: establishment.name ?? "",
      universe: establishment.universe ?? "",
      category: "", // Level 2 category (will be loaded dynamically)
      subcategory: establishment.subcategory ?? "",
      specialtiesCsv: joinArray(establishment.specialties),
      companyContactLastName: company.contactLastName,
      companyContactFirstName: company.contactFirstName,
      companyRole: company.role,
      companyAddress: company.address,
      companyEmail: company.email,
      companyPhone1: company.phone1,
      companyPhone2: company.phone2,
      companyIce: company.ice,
      city: establishment.city ?? "",
      postalCode: establishment.postal_code ?? "",
      region: establishment.region ?? "",
      country: establishment.country ?? "Maroc",
      address: establishment.address ?? "",
      lat: establishment.lat?.toString() ?? "",
      lng: establishment.lng?.toString() ?? "",
      descriptionShort: establishment.description_short ?? "",
      descriptionLong: establishment.description_long ?? "",
      phoneCountry: phone.country,
      phoneNational: phone.national,
      whatsappCountry: wa.country,
      whatsappNational: wa.national,
      website: establishment.website ?? "",
      email: establishment.email ?? "",
      tagsCsv: joinLines(establishment.tags),
      amenitiesCsv: joinLines(establishment.amenities),
      coverUrl: establishment.cover_url ?? "",
      galleryUrls: (establishment.gallery_urls ?? []) as string[],
      ambianceCsv: joinLines(establishment.ambiance_tags),
      social: {
        instagram: getSocialValue(establishment.social_links, "instagram"),
        facebook: getSocialValue(establishment.social_links, "facebook"),
        snapchat: getSocialValue(establishment.social_links, "snapchat"),
        tiktok: getSocialValue(establishment.social_links, "tiktok"),
        youtube: getSocialValue(establishment.social_links, "youtube"),
        google_maps: getSocialValue(establishment.social_links, "google_maps"),
      } as Record<SocialKey, string>,
      hoursEditor: hoursToEditorState(establishment.hours),
      mixRows: mixToRows(establishment.mix_experience),
    });

    setHoursExpanded(() => {
      const out = {} as Record<WeekdayKey, boolean>;
      for (const k of WEEKDAYS_ORDER) out[k] = false;
      return out;
    });

    setInfoSectionOpen(false);
    setEnterpriseSectionOpen(false);
    setLocationSectionOpen(false);
    setDescriptionsSectionOpen(false);
    setContactsSectionOpen(false);
    setMediaSectionOpen(false);
    setTagsSectionOpen(false);

    setHoursSectionOpen(false);
    setSocialSectionOpen(false);
  }, [establishment]);

  const quickSuggestions = useMemo(() => {
    const universeRaw = ((form.universe || establishment.universe) ?? "").toLowerCase();

    const universeKey = (() => {
      if (universeRaw.includes("heberg") || universeRaw.includes("hôtel") || universeRaw.includes("hotel") || universeRaw.includes("riad") || universeRaw.includes("lodge")) {
        return "hebergement";
      }
      if (universeRaw.includes("rest") || universeRaw.includes("food") || universeRaw.includes("bar") || universeRaw.includes("club") || universeRaw.includes("night")) {
        return "restaurant";
      }
      if (universeRaw.includes("loisir") || universeRaw.includes("spa") || universeRaw.includes("activité") || universeRaw.includes("activite") || universeRaw.includes("sport")) {
        return "loisir";
      }
      return universeRaw;
    })();

    const uniq = (items: string[]) => {
      const seen = new Set<string>();
      const out: string[] = [];
      for (const item of items) {
        const key = normalizeForDedup(item);
        if (!key) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
      return out;
    };

    const generalBase = [
      "Nouveau",
      "Tendance",
      "Incontournable",
      "Bon plan",
      "Coup de cœur",
      "Premium",
      "Accessible",
      "Ouvert tard",
      "Réservation conseillée",
      "Idéal en couple",
      "Entre amis",
      "Familial",
      "Business",
      "Kids friendly",
      "Groupe",
      "Anniversaire",
      "Événement",
      "Terrasse",
      "Vue",
      "Pet friendly",
      "Instagrammable",
      "Calme",
      "Festif",
    ];

    const generalByUniverse: Record<string, string[]> = {
      restaurant: [
        "Brunch",
        "Déjeuner",
        "Dîner",
        "Afterwork",
        "Cuisine du monde",
        "Gastronomique",
        "Street food",
        "Coffee shop",
        "Rooftop",
        "Shisha",
        "Live music",
        "DJ",
      ],
      hebergement: [
        "Week-end",
        "Séjour romantique",
        "Voyage d’affaires",
        "All inclusive",
        "Vue mer",
        "Vue montagne",
        "Plage",
        "Piscine",
        "Spa",
        "Kids club",
      ],
      loisir: [
        "Activité",
        "Sport",
        "Bien-être",
        "Outdoor",
        "Indoor",
        "Team building",
        "Kids friendly",
        "Sensations",
      ],
    };

    const ambianceBase = [
      "Cosy",
      "Chic",
      "Lounge",
      "Calme",
      "Festif",
      "Convivial",
      "Intimiste",
      "Musical",
      "Moderne",
      "Traditionnel",
      "Bohème",
      "Romantique",
      "Familial",
      "Vue panoramique",
      "Ambiance marocaine",
    ];

    const ambianceByUniverse: Record<string, string[]> = {
      restaurant: [
        "Rooftop",
        "Terrasse",
        "Speakeasy",
        "Ambiance club",
        "Live band",
        "DJ set",
        "Candlelight",
      ],
      hebergement: ["Resort", "Riad", "Boutique hotel", "Éco-lodge", "Luxury", "Zen", "Adults only"],
      loisir: ["Détente", "Sportive", "Aventure", "Bien-être", "Adrénaline", "Family fun"],
    };

    const amenitiesBase = [
      "Wi-Fi",
      "Parking",
      "Valet",
      "Climatisation",
      "Accès PMR",
      "Paiement carte",
      "Paiement cash",
      "Réservation en ligne",
      "Salle privée",
      "Espace fumeur",
      "Espace non-fumeur",
    ];

    const amenitiesByUniverse: Record<string, string[]> = {
      restaurant: [
        "Terrasse",
        "Vue mer",
        "Vue",
        "Menu kids",
        "Chaise bébé",
        "Options végétariennes",
        "Options vegan",
        "Sans gluten",
        "Halal",
        "Cocktails",
        "Mocktails",
        "Happy hour",
        "Musique live",
      ],
      hebergement: [
        "Petit-déjeuner",
        "Room service",
        "Réception 24/7",
        "Navette aéroport",
        "Piscine",
        "Spa",
        "Salle de sport",
        "Plage privée",
        "Kids club",
        "Conciergerie",
        "Salles de réunion",
        "Laverie",
      ],
      loisir: [
        "Douches",
        "Vestiaires",
        "Matériel inclus",
        "Coach",
        "Accès PMR",
        "Parking",
        "Réservation en ligne",
        "Casiers",
        "Espace détente",
      ],
    };

    const specialtiesBase = [
      "Marocain",
      "Méditerranéen",
      "Italien",
      "Japonais",
      "Asiatique",
      "Healthy",
      "Grillades",
      "Seafood",
      "Brunch",
      "Végétarien",
      "Vegan",
      "Pâtisserie",
      "Café",
    ];

    const specialtiesByUniverse: Record<string, string[]> = {
      restaurant: specialtiesBase,
      loisir: [
        "Hammam",
        "Massage",
        "Spa",
        "Padel",
        "Escape game",
        "Karting",
        "Piscine",
        "Yoga",
        "Laser game",
        "Quad",
        "Randonnée",
        "Surf",
        "Jet ski",
      ],
      hebergement: [
        "Riad",
        "Hôtel",
        "Villa",
        "Resort",
        "All inclusive",
        "Spa",
        "Piscine",
        "Vue mer",
        "Petit-déjeuner",
        "Suite",
        "Bungalow",
        "Éco-lodge",
      ],
    };

    return {
      generalTags: uniq([...(generalByUniverse[universeKey] ?? []), ...generalBase]),
      ambiance: uniq([...(ambianceByUniverse[universeKey] ?? []), ...ambianceBase]),
      amenities: uniq([...(amenitiesByUniverse[universeKey] ?? []), ...amenitiesBase]),
      specialties: uniq(specialtiesByUniverse[universeKey] ?? specialtiesBase),
    };
  }, [form.universe, establishment.universe]);

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const d = await listEstablishmentProfileDrafts(establishment.id);
      setDrafts(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrafts();
  }, [establishment.id]);

  const pendingDraft = useMemo(
    () => drafts.find((d) => String(d.status ?? "") === "pending") ?? null,
    [drafts],
  );

  useEffect(() => {
    if (!pendingDraft || pendingDraft.id.startsWith("demo-")) {
      setPendingChanges([]);
      setPendingChangesError(null);
      setPendingChangesLoading(false);
      return;
    }

    setPendingChangesLoading(true);
    setPendingChangesError(null);

    void (async () => {
      try {
        const data = await listEstablishmentProfileDraftChanges({ establishmentId: establishment.id, draftId: pendingDraft.id });
        setPendingChanges((data ?? []) as EstablishmentProfileDraftChange[]);
      } catch (e) {
        setPendingChanges([]);
        setPendingChangesError(e instanceof Error ? e.message : "Erreur");
      }

      setPendingChangesLoading(false);
    })();
  }, [pendingDraft?.id]);

  const validation = useMemo(() => {
    const hoursRes = validateHours(form.hoursEditor);
    if (hoursRes.ok === false) return { ok: false as const, message: hoursRes.message };

    return { ok: true as const };
  }, [form.hoursEditor, form.mixRows]);

  const sliderPreviewImages = useMemo(() => {
    const cover = form.coverUrl.trim();
    const gallery = form.galleryUrls;
    const list = [cover, ...gallery].filter(Boolean);
    return list.length ? list : SLIDER_EXAMPLE_IMAGES;
  }, [form.coverUrl, form.galleryUrls]);

  const addGalleryUrls = (urls: string[]) => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (!cleaned.length) return;

    setForm((p) => {
      const existing = p.galleryUrls.slice();
      const seen = new Set(existing.map((x) => x.trim()));
      for (const u of cleaned) {
        if (seen.has(u)) continue;
        existing.push(u);
        seen.add(u);
      }
      return { ...p, galleryUrls: existing.slice(0, 12) };
    });
  };

  const removeGalleryAt = (index: number) => {
    setForm((p) => ({ ...p, galleryUrls: p.galleryUrls.filter((_, i) => i !== index) }));
  };

  const moveGalleryItem = (fromIndex: number, toIndex: number) => {
    setForm((p) => {
      if (fromIndex === toIndex) return p;
      const list = p.galleryUrls.slice();
      if (fromIndex < 0 || fromIndex >= list.length) return p;
      if (toIndex < 0 || toIndex >= list.length) return p;

      const [item] = list.splice(fromIndex, 1);
      if (typeof item !== "string") return p;
      list.splice(toIndex, 0, item);
      return { ...p, galleryUrls: list };
    });
  };

  const onPickCover = async (file: File | null) => {
    if (!file) return;
    setError(null);

    const res = await fileToAvatarDataUrl(file, { maxDim: 1400, maxOutputChars: 1_600_000 });
    if (res.ok === false) {
      setError(res.message);
      return;
    }

    setForm((p) => ({ ...p, coverUrl: res.dataUrl }));
  };

  const onPickGallery = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError(null);

    const selected = Array.from(files).slice(0, 8);
    const out: string[] = [];

    for (const f of selected) {
      const res = await fileToAvatarDataUrl(f, { maxDim: 1400, maxOutputChars: 1_600_000 });
      if (res.ok === false) {
        setError(res.message);
        continue;
      }
      out.push(res.dataUrl);
    }

    addGalleryUrls(out);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!canEdit) return;

    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    setSubmitting(true);

    try {
      const phone = toE164(form.phoneCountry, form.phoneNational);
      const whatsapp = toE164(form.whatsappCountry, form.whatsappNational);

      const company = buildCompanyExtra({
        companyContactLastName: form.companyContactLastName,
        companyContactFirstName: form.companyContactFirstName,
        companyRole: form.companyRole,
        companyAddress: form.companyAddress,
        companyEmail: form.companyEmail,
        companyPhone1: form.companyPhone1,
        companyPhone2: form.companyPhone2,
        companyIce: form.companyIce,
      });

      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        universe: form.universe.trim() || null,
        subcategory: form.subcategory.trim() || null,
        specialties: splitCsv(form.specialtiesCsv),
        city: form.city.trim() || null,
        postal_code: form.postalCode.trim() || null,
        region: form.region.trim() || null,
        country: form.country.trim() || null,
        address: form.address.trim() || null,
        lat: form.lat.trim() ? Number(form.lat) : null,
        lng: form.lng.trim() ? Number(form.lng) : null,
        description_short: form.descriptionShort.trim() || null,
        description_long: form.descriptionLong.trim() || null,
        phone,
        whatsapp,
        website: form.website.trim() || null,
        email: form.email.trim() || null,
        tags: splitListInput(form.tagsCsv),
        amenities: splitListInput(form.amenitiesCsv),
        cover_url: form.coverUrl.trim() || null,
        gallery_urls: form.galleryUrls.slice(),
        ambiance_tags: splitListInput(form.ambianceCsv),
        social_links: buildSocialLinks(form.social),
        hours: editorStateToHours(form.hoursEditor),
        mix_experience: buildMixExperience(form.mixRows),
        ...(company || Object.prototype.hasOwnProperty.call(asPlainObject(establishment.extra), "company")
          ? { extra: buildExtraUpdate(establishment.extra, company) }
          : {}),
      };

      await submitEstablishmentProfileUpdate({ establishmentId: establishment.id, data: payload });

      await Promise.all([onUpdated(), loadDrafts()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l’envoi");
    } finally {
      setSubmitting(false);
    }
  };

  const SHORT_MAX = 160;
  const LONG_MAX = 2000;

  const moderationLocked = establishment.edit_status === "pending_modification";
  const canSubmit = canEdit && !submitting && !moderationLocked && validation.ok;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <SectionHeader
            title="Fiche établissement"
            description="Toute modification passe en modération. Une fois envoyée, la fiche reste visible avec les dernières informations validées."
          />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <Card className="border-slate-200">
                <Collapsible open={enterpriseSectionOpen} onOpenChange={(open) => setOnlyOpenSection("enterprise", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Informations entreprise"
                      description="Contact administratif, facturation et site web."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={enterpriseSectionOpen ? "Réduire" : "Ouvrir"}>
                            {enterpriseSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nom du contact</Label>
                        <Input value={form.companyContactLastName} onChange={(e) => setForm((p) => ({ ...p, companyContactLastName: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Prénom du contact</Label>
                        <Input value={form.companyContactFirstName} onChange={(e) => setForm((p) => ({ ...p, companyContactFirstName: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Fonction</Label>
                        <Select value={form.companyRole} onValueChange={(v) => setForm((p) => ({ ...p, companyRole: v }))} disabled={!canEdit}>
                          <SelectTrigger>
                            <SelectValue placeholder="Sélectionner" />
                          </SelectTrigger>
                          <SelectContent>
                            {(["Propriétaire", "Gérant", "Agence", "Autres"] as const).map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>ICE</Label>
                        <Input value={form.companyIce} onChange={(e) => setForm((p) => ({ ...p, companyIce: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Adresse</Label>
                        <Input value={form.companyAddress} onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Tél 1</Label>
                        <Input value={form.companyPhone1} onChange={(e) => setForm((p) => ({ ...p, companyPhone1: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Tél 2</Label>
                        <Input value={form.companyPhone2} onChange={(e) => setForm((p) => ({ ...p, companyPhone2: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Email</Label>
                        <Input value={form.companyEmail} onChange={(e) => setForm((p) => ({ ...p, companyEmail: e.target.value }))} disabled={!canEdit} type="email" />
                      </div>

                      <div className="space-y-2">
                        <Label>Site web</Label>
                        <Input
                          value={form.website}
                          onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="https://..."
                          inputMode="url"
                        />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={infoSectionOpen} onOpenChange={(open) => setOnlyOpenSection("info", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Informations principales"
                      description="Identité de l'établissement (nom, catégorie, spécialités)."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={infoSectionOpen ? "Réduire" : "Ouvrir"}>
                            {infoSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                      {/* Info: ces champs sont gérés par l'admin */}
                      <p className="text-sm text-slate-500 italic">
                        Ces informations sont gérées par l'équipe Sortir Au Maroc. Contactez-nous pour toute modification.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label className="text-slate-400">Nom</Label>
                          <Input
                            value={form.name}
                            disabled
                            className="bg-slate-50 text-slate-500 cursor-not-allowed"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-400">Univers</Label>
                          <Select value={form.universe} disabled>
                            <SelectTrigger className="bg-slate-50 text-slate-500 cursor-not-allowed">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {universesList.map((u) => (
                                <SelectItem key={u.slug} value={u.slug}>
                                  {u.label_fr}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-400">Catégorie</Label>
                          <Select value={form.category} disabled>
                            <SelectTrigger className="bg-slate-50 text-slate-500 cursor-not-allowed">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoriesLevel2List.map((c) => (
                                <SelectItem key={c.slug} value={c.slug}>
                                  {c.nameFr}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-400">Sous-catégorie</Label>
                          <Select value={form.subcategory} disabled>
                            <SelectTrigger className="bg-slate-50 text-slate-500 cursor-not-allowed">
                              <SelectValue placeholder="—" />
                            </SelectTrigger>
                            <SelectContent>
                              {categoriesList.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2 md:col-span-3">
                          <Label>Spécialités</Label>
                          <Input
                            value={form.specialtiesCsv}
                            onChange={(e) => setForm((p) => ({ ...p, specialtiesCsv: e.target.value }))}
                            disabled={!canEdit}
                          />
                          <QuickAddWords
                            label="Suggestions"
                            words={quickSuggestions.specialties}
                            disabled={!canEdit}
                            onAdd={(word) => setForm((p) => ({ ...p, specialtiesCsv: addToCsvField(p.specialtiesCsv, word) }))}
                          />
                        </div>

                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={locationSectionOpen} onOpenChange={(open) => setOnlyOpenSection("location", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Localisation"
                      description="Pays, région, ville, code postal, adresse et coordonnées (utile pour la carte et la recherche)."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={locationSectionOpen ? "Réduire" : "Ouvrir"}>
                            {locationSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pays</Label>
                        <Input
                          list={countryListId}
                          value={form.country}
                          onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="Maroc"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Région</Label>
                        <Input
                          list={regionListId}
                          value={form.region}
                          onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="ex. Marrakech-Safi"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Ville</Label>
                        <Input
                          list={cityListId}
                          value={form.city}
                          onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="ex. Marrakech"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Code postal</Label>
                        <Input
                          value={form.postalCode}
                          onChange={(e) => setForm((p) => ({ ...p, postalCode: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="ex. 40000"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label>Adresse</Label>
                        <Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Latitude</Label>
                        <Input value={form.lat} onChange={(e) => setForm((p) => ({ ...p, lat: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <div className="space-y-2">
                        <Label>Longitude</Label>
                        <Input value={form.lng} onChange={(e) => setForm((p) => ({ ...p, lng: e.target.value }))} disabled={!canEdit} />
                      </div>

                      <datalist id={countryListId}>
                        {allCountries.map((c) => (
                          <option key={c.code} value={c.label} />
                        ))}
                      </datalist>
                      <datalist id={regionListId}>
                        {MOROCCO_REGIONS.map((r) => (
                          <option key={r} value={r} />
                        ))}
                      </datalist>
                      <datalist id={cityListId}>
                        {MOROCCO_MAJOR_CITIES.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={descriptionsSectionOpen} onOpenChange={(open) => setOnlyOpenSection("descriptions", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Descriptions"
                      description="Ces textes s'affichent sur la fiche publique."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={descriptionsSectionOpen ? "Réduire" : "Ouvrir"}>
                            {descriptionsSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Description courte (SEO)</Label>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {Math.min(form.descriptionShort.length, SHORT_MAX)}/{SHORT_MAX}
                          </div>
                        </div>
                        <Textarea
                          value={form.descriptionShort}
                          onChange={(e) => setForm((p) => ({ ...p, descriptionShort: e.target.value }))}
                          disabled={!canEdit}
                          maxLength={SHORT_MAX}
                          placeholder="Résumé (ex: 1–2 phrases)"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Description longue</Label>
                          <div className="text-xs text-slate-500 tabular-nums">
                            {Math.min(form.descriptionLong.length, LONG_MAX)}/{LONG_MAX}
                          </div>
                        </div>
                        <Textarea
                          value={form.descriptionLong}
                          onChange={(e) => setForm((p) => ({ ...p, descriptionLong: e.target.value }))}
                          disabled={!canEdit}
                          maxLength={LONG_MAX}
                          className="min-h-[220px]"
                          placeholder="Détails, ambiance, services, conditions…"
                        />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={contactsSectionOpen} onOpenChange={(open) => setOnlyOpenSection("contacts", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Coordonnées"
                      description="Téléphone, WhatsApp et Email de réservation."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={contactsSectionOpen ? "Réduire" : "Ouvrir"}>
                            {contactsSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Téléphone</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                          <Select value={form.phoneCountry} onValueChange={(v) => setForm((p) => ({ ...p, phoneCountry: v }))} disabled={!canEdit}>
                            <SelectTrigger>
                              <SelectValue placeholder="Pays" />
                            </SelectTrigger>
                            <SelectContent>
                              {PHONE_COUNTRIES.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={form.phoneNational}
                            onChange={(e) => setForm((p) => ({ ...p, phoneNational: e.target.value }))}
                            disabled={!canEdit}
                            placeholder="Ex: 612345678"
                            inputMode="numeric"
                          />
                        </div>
                        <div className="text-xs text-slate-500">Sans zéro initial (ex: 6… au lieu de 06…)</div>
                      </div>

                      <div className="space-y-2">
                        <Label>WhatsApp</Label>
                        <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                          <Select value={form.whatsappCountry} onValueChange={(v) => setForm((p) => ({ ...p, whatsappCountry: v }))} disabled={!canEdit}>
                            <SelectTrigger>
                              <SelectValue placeholder="Pays" />
                            </SelectTrigger>
                            <SelectContent>
                              {PHONE_COUNTRIES.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            value={form.whatsappNational}
                            onChange={(e) => setForm((p) => ({ ...p, whatsappNational: e.target.value }))}
                            disabled={!canEdit}
                            placeholder="Ex: 612345678"
                            inputMode="numeric"
                          />
                        </div>
                      </div>

                      {/* Email de réservation - IMPORTANT pour activer le bouton Réserver */}
                      <div className={`space-y-2 p-3 rounded-lg border-2 ${form.email ? "border-emerald-500 bg-emerald-50" : "border-red-500 bg-red-50"}`}>
                        <Label className="flex items-center gap-2 font-semibold">
                          Email de réservation
                          {!form.email && <span className="text-red-600 text-xs font-normal">(Requis pour activer les réservations)</span>}
                          {form.email && <span className="text-emerald-600 text-xs font-normal">(Réservations activées)</span>}
                        </Label>
                        <Input
                          type="email"
                          value={form.email}
                          onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                          disabled={!canEdit}
                          placeholder="reservations@votre-etablissement.ma"
                          className={`${form.email ? "border-emerald-300" : "border-red-300"}`}
                        />
                        <p className="text-xs text-slate-600">
                          {form.email
                            ? "Les clients pourront réserver directement sur votre fiche établissement."
                            : "Sans email, le bouton « Réserver » ne sera pas affiché sur votre fiche."}
                        </p>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={mediaSectionOpen} onOpenChange={(open) => setOnlyOpenSection("media", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Médias"
                      description="Couverture et galerie (les images sont compressées automatiquement)."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={mediaSectionOpen ? "Réduire" : "Ouvrir"}>
                            {mediaSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-6">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label className="whitespace-nowrap">Couverture</Label>
                            <input
                              ref={coverInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.currentTarget.files?.[0] ?? null;
                                void onPickCover(f);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" className="gap-2" onClick={() => coverInputRef.current?.click()} disabled={!canEdit}>
                                  <Upload className="w-4 h-4" />
                                  Importer
                                </Button>
                                {form.coverUrl ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="gap-2 text-red-600 hover:text-red-700"
                                    onClick={() => setForm((p) => ({ ...p, coverUrl: "" }))}
                                    disabled={!canEdit}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Retirer
                                  </Button>
                                ) : null}
                              </div>
                              <div className="text-sm text-slate-600">Importez une image (compression automatique).</div>
                            </div>
                          </div>

                          {form.coverUrl ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                              <img src={form.coverUrl} alt="Cover" className="w-full max-h-56 object-cover rounded-md" />
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
                              Importez une image (compression automatique).
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label className="whitespace-nowrap">Galerie</Label>
                            <input
                              ref={galleryInputRef}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => {
                                void onPickGallery(e.currentTarget.files);
                                e.currentTarget.value = "";
                              }}
                            />
                            <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                              <Button type="button" variant="outline" className="gap-2" onClick={() => galleryInputRef.current?.click()} disabled={!canEdit}>
                                <ImagePlus className="w-4 h-4" />
                                Importer
                              </Button>
                              <div className="text-sm text-slate-600">Ajoutez des images (max 12). Compression automatique.</div>
                            </div>
                          </div>

                          {form.galleryUrls.length ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                              {form.galleryUrls.map((u, idx) => (
                                <div
                                  key={`${u}-${idx}`}
                                  className={
                                    "relative group rounded-md overflow-hidden border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-primary/40" +
                                    (canEdit ? " cursor-grab" : "")
                                  }
                                  draggable={canEdit}
                                  onDragStart={(e) => {
                                    if (!canEdit) return;
                                    e.dataTransfer.setData("text/plain", String(idx));
                                    e.dataTransfer.effectAllowed = "move";
                                  }}
                                  onDragOver={(e) => {
                                    if (!canEdit) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = "move";
                                  }}
                                  onDrop={(e) => {
                                    if (!canEdit) return;
                                    e.preventDefault();
                                    const from = Number(e.dataTransfer.getData("text/plain"));
                                    if (!Number.isFinite(from)) return;
                                    moveGalleryItem(from, idx);
                                  }}
                                >
                                  <img src={u} alt="Galerie" className="h-24 w-full object-cover" draggable={false} />

                                  <button
                                    type="button"
                                    className="absolute top-1 right-1 rounded-full bg-white/95 border border-slate-200 p-1 opacity-0 group-hover:opacity-100 transition"
                                    onClick={() => removeGalleryAt(idx)}
                                    disabled={!canEdit}
                                    aria-label="Supprimer"
                                  >
                                    <X className="w-4 h-4 text-red-600" />
                                  </button>

                                  {canEdit ? (
                                    <div className="absolute bottom-1 left-1 rounded-md bg-white/90 border border-slate-200 px-1.5 py-1 opacity-0 group-hover:opacity-100 transition">
                                      <GripVertical className="w-4 h-4 text-slate-600" />
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                              Importez des images pour la galerie.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">Aperçu — slider de la fiche</div>
                            <div className="text-sm text-slate-600">Format 16:9 · l’ordre suit la galerie (glisser-déposer).</div>
                          </div>
                          {!form.coverUrl.trim() && form.galleryUrls.length === 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                setForm((p) => ({
                                  ...p,
                                  coverUrl: SLIDER_EXAMPLE_IMAGES[0] ?? "",
                                  galleryUrls: SLIDER_EXAMPLE_IMAGES.slice(1, 12),
                                }))
                              }
                              disabled={!canEdit}
                            >
                              Utiliser ces exemples
                            </Button>
                          ) : null}
                        </div>

                        <div className="mt-3">
                          <Carousel opts={{ align: "start" }} className="w-full">
                            <CarouselContent>
                              {sliderPreviewImages.map((src, idx) => (
                                <CarouselItem key={`${src}-${idx}`}>
                                  <div className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                                    <AspectRatio ratio={16 / 9}>
                                      <img src={src} alt={`Slide ${idx + 1}`} className="h-full w-full object-cover" />
                                    </AspectRatio>
                                  </div>
                                </CarouselItem>
                              ))}
                            </CarouselContent>
                            <CarouselPrevious className="left-2 bg-white/90 hover:bg-white" />
                            <CarouselNext className="right-2 bg-white/90 hover:bg-white" />
                          </Carousel>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={tagsSectionOpen} onOpenChange={(open) => setOnlyOpenSection("tags", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Tags & services"
                      description="Ambiance, tags généraux, équipements et configuration avancée."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={tagsSectionOpen ? "Réduire" : "Ouvrir"}>
                            {tagsSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Tags / ambiance</Label>
                        <Textarea
                          value={form.ambianceCsv}
                          onChange={(e) => setForm((p) => ({ ...p, ambianceCsv: e.target.value }))}
                          disabled={!canEdit}
                          className="min-h-[120px]"
                          placeholder="Un tag par ligne"
                        />
                        <QuickAddWords
                          label="Suggestions"
                          words={quickSuggestions.ambiance}
                          disabled={!canEdit}
                          onAdd={(word) => setForm((p) => ({ ...p, ambianceCsv: addToLinesField(p.ambianceCsv, word) }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Tags généraux</Label>
                        <Textarea
                          value={form.tagsCsv}
                          onChange={(e) => setForm((p) => ({ ...p, tagsCsv: e.target.value }))}
                          disabled={!canEdit}
                          className="min-h-[120px]"
                          placeholder="Un tag par ligne"
                        />
                        <QuickAddWords
                          label="Suggestions"
                          words={quickSuggestions.generalTags}
                          disabled={!canEdit}
                          onAdd={(word) => setForm((p) => ({ ...p, tagsCsv: addToLinesField(p.tagsCsv, word) }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Équipements</Label>
                        <Textarea
                          value={form.amenitiesCsv}
                          onChange={(e) => setForm((p) => ({ ...p, amenitiesCsv: e.target.value }))}
                          disabled={!canEdit}
                          className="min-h-[120px]"
                          placeholder="Un équipement par ligne"
                        />
                        <QuickAddWords
                          label="Suggestions"
                          words={quickSuggestions.amenities}
                          disabled={!canEdit}
                          onAdd={(word) => setForm((p) => ({ ...p, amenitiesCsv: addToLinesField(p.amenitiesCsv, word) }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label>Points forts</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setForm((p) => ({ ...p, mixRows: [...p.mixRows, { key: `point_${Date.now()}`, value: "" }] }))}
                            disabled={!canEdit}
                          >
                            Ajouter
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500">Mettez en avant ce qui rend votre établissement unique.</p>

                        {form.mixRows.length ? (
                          <div className="space-y-2">
                            {form.mixRows.map((row, idx) => (
                              <div key={`${row.key}-${idx}`} className="flex gap-2 items-center">
                                <Input
                                  value={row.value}
                                  onChange={(e) =>
                                    setForm((p) => ({
                                      ...p,
                                      mixRows: p.mixRows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                                    }))
                                  }
                                  disabled={!canEdit}
                                  placeholder="Ex: Vue panoramique sur l'Atlas, Chef étoilé, Spa de 500m²..."
                                  className="flex-1"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-10 w-10 shrink-0"
                                  onClick={() => setForm((p) => ({ ...p, mixRows: p.mixRows.filter((_, i) => i !== idx) }))}
                                  disabled={!canEdit}
                                  aria-label="Supprimer"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-slate-600">Aucun point fort défini. Ajoutez vos arguments de vente !</div>
                        )}
                        <QuickAddWords
                          label="Suggestions"
                          words={["Vue exceptionnelle", "Chef réputé", "Terrasse panoramique", "Cadre intimiste", "Service personnalisé", "Produits locaux", "Décor authentique", "Ambiance romantique"]}
                          disabled={!canEdit}
                          onAdd={(word) => setForm((p) => ({ ...p, mixRows: [...p.mixRows, { key: `point_${Date.now()}`, value: word }] }))}
                        />
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={hoursSectionOpen} onOpenChange={(open) => setOnlyOpenSection("hours", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Horaires"
                      description="Choisissez les jours ouverts, puis un service continu ou avec coupure."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={hoursSectionOpen ? "Réduire" : "Ouvrir"}>
                            {hoursSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="space-y-4">
              {WEEKDAYS_ORDER.map((dayKey) => {
                const d = form.hoursEditor[dayKey];
                const expanded = !!hoursExpanded[dayKey];

                return (
                  <div key={dayKey} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <Collapsible open={expanded} onOpenChange={(open) => setHoursExpanded((p) => ({ ...p, [dayKey]: open }))}>
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={d.open}
                            onCheckedChange={(v) => {
                              const nextOpen = v === true;
                              setForm((p) => ({
                                ...p,
                                hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], open: nextOpen } },
                              }));
                              setHoursExpanded((p) => ({ ...p, [dayKey]: nextOpen ? true : false }));
                            }}
                            disabled={!canEdit}
                          />
                          <div className="font-bold text-slate-900">{WEEKDAY_LABELS_FR[dayKey]}</div>
                        </div>

                        {!d.open ? (
                          <Badge className="bg-slate-100 text-slate-700 border-slate-200 w-fit">Fermé</Badge>
                        ) : (
                          <CollapsibleTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-9 w-9"
                              aria-label={expanded ? "Réduire" : "Ouvrir"}
                            >
                              {expanded ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            </Button>
                          </CollapsibleTrigger>
                        )}
                      </div>

                      {d.open ? (
                        <CollapsibleContent>
                          <div className="mt-3 space-y-3">
                            <div className="w-full md:max-w-[260px]">
                              <div className="text-xs text-slate-500 mb-1">Type de service</div>
                              <Select
                                value={d.mode}
                                onValueChange={(v) =>
                                  setForm((p) => ({
                                    ...p,
                                    hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], mode: v as DayEditorState["mode"] } },
                                  }))
                                }
                                disabled={!canEdit}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Mode" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="continuous">Continu</SelectItem>
                                  <SelectItem value="split">Avec coupure</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div className="rounded-md border border-slate-200 bg-white p-3">
                                <div className="text-xs font-bold text-slate-700">Plage 1</div>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 [&>*]:min-w-0">
                                  <div>
                                    <div className="text-xs text-slate-500">De</div>
                                    <Input
                                      type="time"
                                      value={d.aFrom}
                                      onChange={(e) =>
                                        setForm((p) => ({
                                          ...p,
                                          hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], aFrom: e.target.value } },
                                        }))
                                      }
                                      disabled={!canEdit}
                                      className="h-9 px-2 min-w-0 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <div className="text-xs text-slate-500">À</div>
                                    <Input
                                      type="time"
                                      value={d.aTo}
                                      onChange={(e) =>
                                        setForm((p) => ({
                                          ...p,
                                          hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], aTo: e.target.value } },
                                        }))
                                      }
                                      disabled={!canEdit}
                                      className="h-9 px-2 min-w-0 text-sm"
                                    />
                                  </div>
                                </div>
                              </div>

                              {d.mode === "split" ? (
                                <div className="rounded-md border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-bold text-slate-700">Plage 2</div>
                                  <div className="mt-1 text-xs text-slate-500">Visible seulement en mode “avec coupure”.</div>
                                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 [&>*]:min-w-0">
                                    <div>
                                      <div className="text-xs text-slate-500">De</div>
                                      <Input
                                        type="time"
                                        value={d.bFrom}
                                        onChange={(e) =>
                                          setForm((p) => ({
                                            ...p,
                                            hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], bFrom: e.target.value } },
                                          }))
                                        }
                                        disabled={!canEdit}
                                        className="h-9 px-2 min-w-0 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <div className="text-xs text-slate-500">À</div>
                                      <Input
                                        type="time"
                                        value={d.bTo}
                                        onChange={(e) =>
                                          setForm((p) => ({
                                            ...p,
                                            hoursEditor: { ...p.hoursEditor, [dayKey]: { ...p.hoursEditor[dayKey], bTo: e.target.value } },
                                          }))
                                        }
                                        disabled={!canEdit}
                                        className="h-9 px-2 min-w-0 text-sm"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </CollapsibleContent>
                      ) : null}
                    </Collapsible>
                  </div>
                );
              })}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              <Card className="border-slate-200">
                <Collapsible open={socialSectionOpen} onOpenChange={(open) => setOnlyOpenSection("social", open)}>
                  <CardHeader className="pb-3">
                    <SectionHeader
                      title="Réseaux sociaux"
                      description="Ajoutez vos liens. Les icônes s'affichent uniquement si le champ est rempli."
                      titleClassName="text-sm"
                      actions={
                        <CollapsibleTrigger asChild>
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" aria-label={socialSectionOpen ? "Réduire" : "Ouvrir"}>
                            {socialSectionOpen ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </Button>
                        </CollapsibleTrigger>
                      }
                    />
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SOCIAL_FIELDS.map(({ key, label, placeholder, Icon }) => {
                const value = form.social[key];
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="flex items-center gap-2">
                        <Icon className={"w-4 h-4 " + (value.trim() ? "text-primary" : "text-slate-400")} />
                        {label}
                      </Label>
                      {value.trim() ? <div className="text-xs text-slate-500">{formatUrlShort(value)}</div> : null}
                    </div>
                    <Input
                      value={value}
                      onChange={(e) => setForm((p) => ({ ...p, social: { ...p.social, [key]: e.target.value } }))}
                      disabled={!canEdit}
                      placeholder={placeholder}
                    />
                  </div>
                );
              })}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </div>

            <div className="space-y-6 lg:sticky lg:top-6 h-fit">
              {/* Username Section */}
              <UsernameSection
                establishmentId={establishment.id}
                canEdit={canEdit}
              />

              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <SectionHeader
                    title="Résumé & modération"
                    description="Toute modification passe en modération. La fiche publique reste visible avec les dernières informations validées."
                    titleClassName="text-sm"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  {establishment.verified ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                      Établissement vérifié
                    </div>
                  ) : (
                    <div className="text-sm text-amber-700">Établissement en cours de validation</div>
                  )}

                  {moderationLocked ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">En cours de validation par SAM</Badge>
                      <div>Une modification est déjà en cours de modération. Vous pourrez soumettre à nouveau après validation.</div>
                    </div>
                  ) : null}

                  {!validation.ok ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      {validation.message}
                    </div>
                  ) : null}

                  {error ? <div className="text-sm text-red-600">{error}</div> : null}

                  <Button className="bg-primary text-white hover:bg-primary/90 font-bold gap-2 w-full" disabled={!canSubmit} onClick={handleSubmit}>
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Soumettre en modération
                  </Button>

                  {!canEdit ? <div className="text-sm text-slate-600">Votre rôle ne permet pas de modifier la fiche.</div> : null}
                </CardContent>
              </Card>

              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <SectionHeader
                    title="Compte Pro"
                    description="Photo de profil (utilisée dans l'espace Pro)."
                    titleClassName="text-sm"
                  />
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-14 w-14">
                      {profileAvatarUrl ? <AvatarImage src={profileAvatarUrl} alt="Photo de profil" /> : null}
                      <AvatarFallback className="bg-primary text-white font-extrabold">{profileInitials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-extrabold text-slate-900">Photo de profil</div>
                      <div className="text-xs text-slate-600">Recommandé: visage / logo simple.</div>
                    </div>
                  </div>

                  <input
                    ref={profileAvatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!file) return;
                      const res = await fileToAvatarDataUrl(file, { maxDim: 256 });
                      if (res.ok === false) {
                        setError(res.message);
                        return;
                      }
                      setError(null);
                      setProProfileAvatar(userId, res.dataUrl);
                      setProfileAvatarUrl(res.dataUrl);
                    }}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-2" onClick={() => profileAvatarInputRef.current?.click()}>
                      <Upload className="w-4 h-4" />
                      Importer
                    </Button>

                    {profileAvatarUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setProProfileAvatar(userId, null);
                          setProfileAvatarUrl(null);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                        Supprimer
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <SectionHeader
            title="Modifications en cours"
            description={pendingDraft
              ? "Vos changements sont en cours de validation par Sortir Au Maroc."
              : "Aucune modification en cours pour le moment."}
          />
        </CardHeader>
        <CardContent>
          {pendingDraft ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="bg-amber-100 text-amber-800 border-amber-200">En cours de validation par SAM</Badge>
                <div className="text-xs text-slate-600">Demandé le {new Date(pendingDraft.created_at).toLocaleString("fr-FR")}</div>
              </div>

              {pendingChangesError ? <div className="text-sm text-red-600">{pendingChangesError}</div> : null}

              {pendingChangesLoading ? (
                <div className="text-sm text-slate-600">Chargement…</div>
              ) : pendingChanges.length ? (
                <>
                  <div className="md:hidden space-y-3">
                    {pendingChanges.map((c) => {
                      const st = formatChangeStatus(c.status);
                      return (
                        <div key={c.id} className="rounded-xl border bg-white p-4 space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">{profileFieldLabel(c.field)}</div>
                              <div className="text-xs text-slate-600">{new Date(c.created_at).toLocaleString("fr-FR")}</div>
                            </div>
                            <Badge className={st.className}>{st.label}</Badge>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Ancienne valeur</div>
                            <div className="text-sm text-slate-700">{inlineValue(c.before)}</div>
                          </div>

                          <div>
                            <div className="text-xs text-slate-500">Nouvelle valeur</div>
                            <div className="text-sm text-slate-700">{inlineValue(c.after)}</div>
                          </div>

                          {c.reason ? (
                            <div className="text-xs text-slate-600">
                              Motif : <span className="font-medium">{c.reason}</span>
                            </div>
                          ) : null}

                          <details className="text-xs">
                            <summary className="cursor-pointer text-slate-600">Voir le détail</summary>
                            <div className="mt-2 space-y-2">
                              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 border border-slate-200 p-2">{safeJson(c.before)}</pre>
                              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 border border-slate-200 p-2">{safeJson(c.after)}</pre>
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>

                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[860px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Champ</TableHead>
                          <TableHead>Ancienne valeur</TableHead>
                          <TableHead>Nouvelle valeur</TableHead>
                          <TableHead>Statut</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingChanges.map((c) => {
                          const st = formatChangeStatus(c.status);
                          return (
                            <TableRow key={c.id}>
                              <TableCell className="font-semibold">{profileFieldLabel(c.field)}</TableCell>
                              <TableCell className="text-sm text-slate-700" title={safeJson(c.before)}>
                                {inlineValue(c.before)}
                              </TableCell>
                              <TableCell className="text-sm text-slate-700" title={safeJson(c.after)}>
                                {inlineValue(c.after)}
                              </TableCell>
                              <TableCell>
                                <Badge className={st.className}>{st.label}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-sm text-slate-600">Aucun changement détaillé disponible.</div>
              )}
            </div>
          ) : (
            <div className="text-sm text-slate-500 py-2">
              Aucune modification en attente de validation.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionHeader
            title="Historique des modifications"
            description={showingDemoDrafts ? "Exemples des 5 dernières modifications validées par la modération." : undefined}
          />
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-slate-600">Chargement…</div>
          ) : draftsToShow.length ? (
            <>
              <div className="md:hidden space-y-3">
                {draftsToShow.map((d) => {
                  const st = formatDraftStatus(d.status);
                  const when = new Date(d.created_at);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => void openDraftDetail(d)}
                      className="w-full text-left rounded-xl border bg-white p-4 space-y-2 hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-500">Date</div>
                          <div className="font-semibold whitespace-nowrap">
                            {Number.isFinite(when.getTime()) ? when.toLocaleString("fr-FR") : d.created_at}
                          </div>
                        </div>
                        <Badge className={st.className}>{st.label}</Badge>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Motif</div>
                        <div className="text-sm text-slate-700">{d.reason ?? "—"}</div>
                      </div>
                      <div className="text-xs text-primary font-medium">Cliquer pour voir les détails →</div>
                    </button>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Motif</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {draftsToShow.map((d) => {
                      const st = formatDraftStatus(d.status);
                      return (
                        <TableRow
                          key={d.id}
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() => void openDraftDetail(d)}
                        >
                          <TableCell className="whitespace-nowrap">{new Date(d.created_at).toLocaleString("fr-FR")}</TableCell>
                          <TableCell>
                            <Badge className={st.className}>{st.label}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{d.reason ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-xs text-primary font-medium">Voir détails →</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-600">Aucune modification envoyée pour le moment.</div>
          )}
        </CardContent>
      </Card>

      {/* Draft Detail Dialog */}
      <Dialog open={!!selectedDraftForDetail} onOpenChange={(open) => !open && setSelectedDraftForDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Détail de la modification
              {selectedDraftForDetail && (
                <Badge className={formatDraftStatus(selectedDraftForDetail.status).className}>
                  {formatDraftStatus(selectedDraftForDetail.status).label}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedDraftForDetail && (
            <div className="space-y-4">
              {/* Date and general info */}
              <div className="text-sm text-slate-500">
                Demandée le {new Date(selectedDraftForDetail.created_at).toLocaleString("fr-FR")}
                {selectedDraftForDetail.decided_at && (
                  <> — Traitée le {new Date(selectedDraftForDetail.decided_at).toLocaleString("fr-FR")}</>
                )}
              </div>

              {/* Global reason if rejected */}
              {selectedDraftForDetail.reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <div className="text-xs font-semibold text-red-700 mb-1">Motif de refus</div>
                  <div className="text-sm text-red-800">{selectedDraftForDetail.reason}</div>
                </div>
              )}

              {/* Changes list */}
              <div className="space-y-3">
                <div className="text-sm font-semibold text-slate-900">Champs modifiés</div>

                {draftDetailLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Chargement des détails…
                  </div>
                ) : draftDetailChanges.length === 0 ? (
                  <div className="text-sm text-slate-500">Aucun détail disponible.</div>
                ) : (
                  <div className="space-y-2">
                    {draftDetailChanges.map((change) => {
                      const isAccepted = change.status === "accepted";
                      const isRejected = change.status === "rejected";
                      const isPending = change.status === "pending";

                      return (
                        <div
                          key={change.id}
                          className={`rounded-lg border p-3 ${
                            isAccepted
                              ? "border-emerald-200 bg-emerald-50"
                              : isRejected
                                ? "border-red-200 bg-red-50"
                                : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="font-medium text-sm text-slate-900">
                              {formatFieldLabel(change.field)}
                            </div>
                            <Badge
                              className={
                                isAccepted
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : isRejected
                                    ? "bg-red-100 text-red-700 border-red-200"
                                    : "bg-amber-100 text-amber-700 border-amber-200"
                              }
                            >
                              {isAccepted ? "Accepté" : isRejected ? "Refusé" : "En attente"}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <div className="text-slate-500 mb-1">Avant</div>
                              <div className="text-slate-700 bg-white rounded p-2 border border-slate-200 break-words">
                                {formatChangeValue(change.before)}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 mb-1">Après</div>
                              <div className="text-slate-700 bg-white rounded p-2 border border-slate-200 break-words">
                                {formatChangeValue(change.after)}
                              </div>
                            </div>
                          </div>

                          {isRejected && change.reason && (
                            <div className="mt-2 text-xs text-red-700">
                              <span className="font-semibold">Motif :</span> {change.reason}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
