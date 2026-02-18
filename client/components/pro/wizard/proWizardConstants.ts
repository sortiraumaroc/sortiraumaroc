// ============================================
// PRO ONBOARDING WIZARD CONSTANTS
// Reuses shared constants from admin wizard
// ============================================

import type { ProWizardData } from "../../../lib/pro/types";
import type { DaySchedule } from "../../admin/wizard/wizardConstants";
import { DAYS } from "../../admin/wizard/wizardConstants";

// Re-export what we need from admin wizard
export {
  MOROCCAN_REGIONS,
  MOROCCAN_CITIES,
  CITY_TO_REGION,
  UNIVERSE_OPTIONS,
  UNIVERSE_CONFIG,
  TAG_CONFIG,
  DAYS,
  DEFAULT_SCHEDULE,
} from "../../admin/wizard/wizardConstants";
export type { DaySchedule } from "../../admin/wizard/wizardConstants";

// ============================================
// WIZARD STEPS (6 steps for pro onboarding)
// ============================================
export const PRO_WIZARD_STEPS = [
  { id: 1, label: "Identité", required: true },
  { id: 2, label: "Localisation", required: true },
  { id: 3, label: "Contact", required: false },
  { id: 4, label: "Description", required: true },
  { id: 5, label: "Médias", required: false },
  { id: 6, label: "Horaires", required: false },
] as const;

export const TOTAL_PRO_WIZARD_STEPS = PRO_WIZARD_STEPS.length;

// ============================================
// INITIAL DATA FACTORY
// Pre-fills from existing establishment data
// ============================================
export function createInitialProWizardData(
  establishment?: Record<string, unknown> | null,
): Partial<ProWizardData> {
  const hours: Record<string, DaySchedule> = {};
  DAYS.forEach((d) => {
    hours[d.key] = {
      open: false,
      mode: "continu",
      ranges: [{ from: "09:00", to: "23:00" }],
    };
  });

  const base: Partial<ProWizardData> = {
    name: "",
    universe: "",
    category: "",
    subcategory: "",
    specialties: [],
    city: "",
    region: "",
    neighborhood: "",
    postal_code: "",
    address: "",
    lat: "",
    lng: "",
    phone_country: "+212",
    phone_national: "",
    whatsapp_country: "+212",
    whatsapp_national: "",
    email: "",
    website: "",
    google_maps_url: "",
    social_instagram: "",
    social_facebook: "",
    social_tiktok: "",
    social_snapchat: "",
    social_youtube: "",
    social_tripadvisor: "",
    description_short: "",
    description_long: "",
    cover_url: "",
    logo_url: "",
    gallery_urls: [],
    hours,
  };

  if (!establishment) return base;

  // Pre-fill from establishment
  const e = establishment;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const social = (e.social_links ?? {}) as Record<string, string>;
  const existingHours = (e.hours ?? {}) as Record<string, DaySchedule>;

  // Parse phone: may be stored as "+212XXXXXXXXX" or just the number
  let phoneCountry = "+212";
  let phoneNational = str(e.phone);
  if (phoneNational.startsWith("+212")) {
    phoneCountry = "+212";
    phoneNational = phoneNational.slice(4);
  } else if (phoneNational.startsWith("0")) {
    phoneNational = phoneNational.slice(1);
  }

  let whatsappCountry = "+212";
  let whatsappNational = str(e.whatsapp);
  if (whatsappNational.startsWith("+212")) {
    whatsappCountry = "+212";
    whatsappNational = whatsappNational.slice(4);
  } else if (whatsappNational.startsWith("0")) {
    whatsappNational = whatsappNational.slice(1);
  }

  // Merge existing hours into default schedule
  const mergedHours: Record<string, DaySchedule> = { ...hours };
  for (const day of DAYS) {
    if (existingHours[day.key]) {
      mergedHours[day.key] = existingHours[day.key];
    }
  }

  return {
    ...base,
    name: str(e.name),
    universe: str(e.universe),
    category: str(e.category),
    subcategory: str(e.subcategory),
    specialties: arr(e.specialties).filter((s): s is string => typeof s === "string"),
    city: str(e.city),
    region: str(e.region),
    neighborhood: str((e.extra as Record<string, unknown>)?.neighborhood ?? ""),
    postal_code: str(e.postal_code),
    address: str(e.address),
    lat: e.lat != null ? String(e.lat) : "",
    lng: e.lng != null ? String(e.lng) : "",
    phone_country: phoneCountry,
    phone_national: phoneNational,
    whatsapp_country: whatsappCountry,
    whatsapp_national: whatsappNational,
    email: str(e.email),
    website: str(e.website),
    google_maps_url: str(social.google_maps ?? ""),
    social_instagram: str(social.instagram ?? ""),
    social_facebook: str(social.facebook ?? ""),
    social_tiktok: str(social.tiktok ?? ""),
    social_snapchat: str(social.snapchat ?? ""),
    social_youtube: str(social.youtube ?? ""),
    social_tripadvisor: str(social.tripadvisor ?? ""),
    description_short: str(e.description_short),
    description_long: str(e.description_long),
    cover_url: str(e.cover_url),
    logo_url: str(e.logo_url),
    gallery_urls: arr(e.gallery_urls).filter((u): u is string => typeof u === "string"),
    hours: mergedHours,
  };
}
