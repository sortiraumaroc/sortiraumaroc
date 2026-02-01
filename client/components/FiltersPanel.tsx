import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DatePickerInput } from "@/components/DatePickerInput";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityCategory } from "@/lib/taxonomy";
import { useI18n } from "@/lib/i18n";

interface FiltersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  category: ActivityCategory;
  onApplyFilters: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
}

export interface FilterState {
  priceRange: [number, number];
  rating: number;
  promotionsOnly: boolean;

  restaurantCulinarySpecialties?: string[];
  restaurantPriceTier?: "€" | "€€" | "€€€" | "€€€€";
  restaurantAvailability?: "now" | "tonight" | "tomorrow" | "specific";
  restaurantSpecificDate?: string;
  restaurantOffers?: string[];
  restaurantOptions?: string[];
  restaurantAmbiance?: string[];

  loisirsType?: string[];
  loisirsDuree?: string[];
  loisirsPublic?: string[];
  loisirsNiveau?: string[];
  loisirsOptions?: string[];
  loisirsMinParticipants?: number;
  loisirsPrivatisationPossible?: boolean;

  sportType?: string[];
  sportFormat?: string[];
  sportDuree?: string[];
  sportPublic?: string[];
  sportEquipements?: string[];
  sportOffres?: string[];
  sportNiveau?: string[];
  sportMinParticipants?: number;

  accommodationType?: string[];
  accommodationBudget?: string[];
  accommodationNotes?: string;
  accommodationEquipements?: string[];
  accommodationConditions?: string[];

  cultureType?: string[];
  cultureLangue?: string[];
  culturePublic?: string[];
  cultureAcces?: string[];
  cultureFormat?: string[];
  cultureDuree?: string[];
  cultureMinParticipants?: number;

  shoppingStoreType?: string[];
  shoppingBudget?: string[];
  shoppingServices?: string[];
}

const RESTAURANT_SPECIALTIES = [
  "Marocain",
  "Italien",
  "Sushi / Japonais",
  "Asiatique",
  "Steakhouse / Grillades",
  "Poisson & fruits de mer",
  "Burger / street-food",
  "Sain / vegan",
  "Brunch",
  "Pâtisserie / Desserts",
  "Fusion",
  "Autres",
];

const RESTAURANT_OFFERS = ["Avec packs", "Happy hour / heure creuse"];
const RESTAURANT_OPTIONS = ["Terrasse", "Vue mer", "Parking", "Salle privée", "Climatisation"];
const RESTAURANT_AMBIANCE = ["Romantique", "En famille", "Déjeuner business", "Tendance", "Halal", "Sain"];

const LOISIRS_TYPES = [
  "Escape game",
  "Karting",
  "Quad / Buggy",
  "Jet ski / Paddle",
  "Parachute / Parapente",
  "Golf",
  "Foot 5",
  "Balades (cheval / chameau)",
  "Aquapark",
  "Bowling",
  "Laser game",
  "Surf / Kite",
  "Autres",
];

const LOISIRS_DUREE = ["<30 min", "30–60 min", "1–2 h", "+2 h"];
const LOISIRS_PUBLIC = ["Enfants", "Adultes", "Famille", "Groupe", "Team building"];
const LOISIRS_NIVEAU = ["Débutant", "Intermédiaire", "Confirmé"];
const LOISIRS_OPTIONS = [
  "Équipement inclus",
  "Encadrement",
  "Vestiaires",
  "Douches",
  "Parking",
  "Indoor",
  "Outdoor",
];

const SPORT_TYPES = [
  "Hammam",
  "Spa",
  "Massage",
  "Institut beauté",
  "Coiffeur / Barber",
  "Yoga / Pilates",
  "Salle de sport",
  "Coach personnel",
  "Padel",
  "Tennis",
  "Foot 5",
  "Crossfit",
  "Piscine",
  "Arts martiaux",
  "Autres",
];

const SPORT_FORMAT = ["Individuel", "Cours collectif", "Accès libre", "Location terrain"];
const SPORT_DUREE = ["30", "45", "60", "90", "120"];
const SPORT_PUBLIC = ["Femme", "Homme", "Mixte", "Enfants"];
const SPORT_EQUIPEMENTS = [
  "Sauna",
  "Hammam",
  "Cabine privée",
  "Douches",
  "Vestiaires",
  "Parking",
  "Climatisation",
];
const SPORT_OFFRES = ["Packs", "Abonnements"];
const SPORT_NIVEAU = ["Débutant", "Intermédiaire", "Confirmé"];

const HEBERGEMENT_TYPES = ["Hôtel", "Riad", "Maison d'hôtes", "Appartement", "Villa", "Auberge", "Resort"];
const HEBERGEMENT_BUDGET = ["0–500", "500–1000", "1000–2000", "2000+"];
const HEBERGEMENT_NOTES = ["3+", "4+", "4.5+"];
const HEBERGEMENT_EQUIPEMENTS = [
  "Piscine",
  "Wifi",
  "Parking",
  "Climatisation",
  "Petit-déjeuner",
  "Spa",
  "Vue mer",
  "Salle de sport",
  "Navette",
];
const HEBERGEMENT_CONDITIONS = ["Annulation gratuite", "Paiement sur place"];

const CULTURE_TYPES = [
  "Visite guidée",
  "Musée / Monument",
  "Théâtre",
  "Salle spectacle",
  "Concert",
  "Expo",
  "Événement",
  "Atelier",
  "Autres",
];

const CULTURE_LANGUES = ["FR", "AR", "EN", "ES", "Autres"];
const CULTURE_PUBLIC = ["Enfants", "Adultes", "Famille", "Groupe"];
const CULTURE_ACCES = ["Gratuit", "Payant"];
const CULTURE_FORMAT = ["Privé", "Groupe"];
const CULTURE_DUREE = ["<1 h", "1–2 h", "+2 h"];

const SHOPPING_TYPES = [
  "Mode",
  "Chaussures",
  "Beauté / Parfumerie",
  "Optique",
  "Bijoux",
  "Maison / Déco",
  "Épicerie fine",
  "Artisanat",
  "Concept store",
  "Autres",
];

const SHOPPING_BUDGET = ["€", "€€", "€€€", "€€€€", "DHS"];
const SHOPPING_SERVICES = ["RDV showroom", "Click & Collect", "Personnalisation", "Livraison"];

const EN_OPTION_LABELS: Record<string, string> = {
  // Restaurants
  "Marocain": "Moroccan",
  "Italien": "Italian",
  "Sushi / Japonais": "Sushi / Japanese",
  "Asiatique": "Asian",
  "Steakhouse / Grillades": "Steakhouse / grilled",
  "Poisson & fruits de mer": "Seafood",
  "Burger / street-food": "Burger / street food",
  "Sain / vegan": "Healthy / vegan",
  "Brunch": "Brunch",
  "Pâtisserie / Desserts": "Pastries / desserts",
  "Fusion": "Fusion",
  "Autres": "Other",
  "Avec packs": "With packages",
  "Happy hour / heure creuse": "Happy hour / off-peak",
  "Terrasse": "Terrace",
  "Vue mer": "Sea view",
  "Parking": "Parking",
  "Salle privée": "Private room",
  "Climatisation": "Air conditioning",
  "Romantique": "Romantic",
  "En famille": "Family-friendly",
  "Déjeuner business": "Business lunch",
  "Tendance": "Trendy",
  "Halal": "Halal",
  "Sain": "Healthy",

  // Loisirs
  "Escape game": "Escape room",
  "Karting": "Go-karting",
  "Quad / Buggy": "Quad / buggy",
  "Jet ski / Paddle": "Jet ski / paddle",
  "Parachute / Parapente": "Parachuting / paragliding",
  "Golf": "Golf",
  "Foot 5": "5-a-side football",
  "Balades (cheval / chameau)": "Rides (horse / camel)",
  "Aquapark": "Water park",
  "Bowling": "Bowling",
  "Laser game": "Laser tag",
  "Surf / Kite": "Surf / kitesurf",
  "<30 min": "<30 min",
  "30–60 min": "30–60 min",
  "1–2 h": "1–2 h",
  "+2 h": "2+ h",
  "Enfants": "Kids",
  "Adultes": "Adults",
  "Famille": "Family",
  "Groupe": "Group",
  "Team building": "Team building",
  "Débutant": "Beginner",
  "Intermédiaire": "Intermediate",
  "Confirmé": "Advanced",
  "Équipement inclus": "Equipment included",
  "Encadrement": "Coaching",
  "Vestiaires": "Changing rooms",
  "Douches": "Showers",
  "Indoor": "Indoor",
  "Outdoor": "Outdoor",

  // Sport & wellness
  "Institut beauté": "Beauty institute",
  "Coiffeur / Barber": "Hairdresser / barber",
  "Yoga / Pilates": "Yoga / Pilates",
  "Salle de sport": "Gym",
  "Coach personnel": "Personal coach",
  "Piscine": "Pool",
  "Arts martiaux": "Martial arts",
  "Individuel": "Individual",
  "Cours collectif": "Group class",
  "Accès libre": "Open access",
  "Location terrain": "Court rental",
  "Femme": "Women",
  "Homme": "Men",
  "Mixte": "Mixed",
  "Cabine privée": "Private cabin",
  "Packs": "Packages",
  "Abonnements": "Subscriptions",

  // Accommodation
  "Hôtel": "Hotel",
  "Maison d'hôtes": "Guesthouse",
  "Appartement": "Apartment",
  "Auberge": "Hostel",
  "Wifi": "Wi‑Fi",
  "Petit-déjeuner": "Breakfast",
  "Navette": "Shuttle",
  "Annulation gratuite": "Free cancellation",
  "Paiement sur place": "Pay on arrival",

  // Culture
  "Visite guidée": "Guided tour",
  "Musée / Monument": "Museum / monument",
  "Théâtre": "Theatre",
  "Salle spectacle": "Show venue",
  "Expo": "Exhibition",
  "Événement": "Event",
  "Atelier": "Workshop",
  "Gratuit": "Free",
  "Payant": "Paid",
  "Privé": "Private",

  // Shopping
  "Mode": "Fashion",
  "Chaussures": "Shoes",
  "Beauté / Parfumerie": "Beauty / perfumery",
  "Optique": "Optics",
  "Bijoux": "Jewelry",
  "Maison / Déco": "Home / decor",
  "Épicerie fine": "Gourmet grocery",
  "Artisanat": "Crafts",
  "RDV showroom": "Showroom appointment",
  "Personnalisation": "Personalization",
  "Livraison": "Delivery",
};

function toggleInArray(current: string[] | undefined, value: string) {
  const arr = current || [];
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm italic transition whitespace-nowrap ${
        selected ? "bg-primary text-white border-primary" : "bg-white text-gray-700 border-slate-200 hover:bg-slate-50"
      }`}
      
    >
      {label}
    </button>
  );
}

function getDefaultFilters(category: ActivityCategory): FilterState {
  const base: FilterState = { priceRange: [0, 1000], rating: 0, promotionsOnly: false };

  switch (category) {
    case "restaurants":
      return {
        ...base,
        restaurantCulinarySpecialties: [],
        restaurantOffers: [],
        restaurantOptions: [],
        restaurantAmbiance: [],
      };
    case "loisirs":
      return {
        ...base,
        loisirsType: [],
        loisirsDuree: [],
        loisirsPublic: [],
        loisirsNiveau: [],
        loisirsOptions: [],
        loisirsMinParticipants: undefined,
        loisirsPrivatisationPossible: false,
      };
    case "sport":
      return {
        ...base,
        sportType: [],
        sportFormat: [],
        sportDuree: [],
        sportPublic: [],
        sportEquipements: [],
        sportOffres: [],
        sportNiveau: [],
        sportMinParticipants: undefined,
      };
    case "hebergement":
      return {
        ...base,
        accommodationType: [],
        accommodationBudget: [],
        accommodationNotes: undefined,
        accommodationEquipements: [],
        accommodationConditions: [],
      };
    case "culture":
      return {
        ...base,
        cultureType: [],
        cultureLangue: [],
        culturePublic: [],
        cultureAcces: [],
        cultureFormat: [],
        cultureDuree: [],
        cultureMinParticipants: undefined,
      };
    case "shopping":
      return {
        ...base,
        shoppingStoreType: [],
        shoppingBudget: [],
        shoppingServices: [],
      };
    default:
      return base;
  }
}

function getDefaultOpenSection(category: ActivityCategory): string {
  switch (category) {
    case "restaurants":
      return "specialites";
    case "loisirs":
      return "type";
    case "sport":
      return "type";
    case "hebergement":
      return "type";
    case "culture":
      return "type";
    case "shopping":
      return "type";
    default:
      return "type";
  }
}

export function FiltersPanel({ isOpen, onClose, category, onApplyFilters, initialFilters }: FiltersPanelProps) {
  const isMobile = useIsMobile();
  const { t, locale } = useI18n();

  const labelForOption = useCallback(
    (value: string) => (locale === "en" ? EN_OPTION_LABELS[value] ?? value : value),
    [locale],
  );

  const [filters, setFilters] = useState<FilterState>(() => ({ ...getDefaultFilters(category), ...initialFilters }));
  const [specialtyQuery, setSpecialtyQuery] = useState("");
  const [openSection, setOpenSection] = useState<string | undefined>(() => getDefaultOpenSection(category));

  useEffect(() => {
    setFilters({ ...getDefaultFilters(category), ...initialFilters });
    setSpecialtyQuery("");
    setOpenSection(getDefaultOpenSection(category));
  }, [category, initialFilters]);

  const handleApply = () => {
    onApplyFilters(filters);
    onClose();
  };

  const handleReset = () => {
    setFilters(getDefaultFilters(category));
    setSpecialtyQuery("");
    setOpenSection(getDefaultOpenSection(category));
  };

  const filteredRestaurantSpecialties = useMemo(() => {
    const q = specialtyQuery.trim().toLowerCase();
    if (!q) return RESTAURANT_SPECIALTIES;
    return RESTAURANT_SPECIALTIES.filter((s) => labelForOption(s).toLowerCase().includes(q));
  }, [labelForOption, specialtyQuery]);

  const accordion = (items: React.ReactNode) => (
    <Accordion
      type="single"
      collapsible
      value={openSection}
      onValueChange={(v) => setOpenSection(v || undefined)}
      className="w-full"
    >
      {items}
    </Accordion>
  );

  const restaurantFilters = accordion(
    <>
      <AccordionItem value="specialites">
        <AccordionTrigger className="text-left" >
          {t("filters.section.restaurant.specialties")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            <Input
              value={specialtyQuery}
              onChange={(e) => setSpecialtyQuery(e.target.value)}
              placeholder={t("filters.section.restaurant.specialties.search_placeholder")}
              className="h-10 md:h-11 bg-slate-50"
              
            />
            <div className="flex flex-wrap gap-2">
              {filteredRestaurantSpecialties.map((s) => (
                <Chip
                  key={s}
                  label={labelForOption(s)}
                  selected={(filters.restaurantCulinarySpecialties || []).includes(s)}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      restaurantCulinarySpecialties: toggleInArray(prev.restaurantCulinarySpecialties, s),
                    }))
                  }
                />
              ))}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="prix">
        <AccordionTrigger className="text-left" >
          {t("filters.section.price")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {(["€", "€€", "€€€", "€€€€"] as const).map((tier) => (
              <Chip
                key={tier}
                label={labelForOption(tier)}
                selected={filters.restaurantPriceTier === tier}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    restaurantPriceTier: prev.restaurantPriceTier === tier ? undefined : tier,
                  }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="disponibilite">
        <AccordionTrigger className="text-left" >
          {t("filters.section.availability")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Chip
                label={t("filters.availability.now")}
                selected={filters.restaurantAvailability === "now"}
                onClick={() => setFilters((p) => ({ ...p, restaurantAvailability: "now" }))}
              />
              <Chip
                label={t("filters.availability.tonight")}
                selected={filters.restaurantAvailability === "tonight"}
                onClick={() => setFilters((p) => ({ ...p, restaurantAvailability: "tonight" }))}
              />
              <Chip
                label={t("filters.availability.tomorrow")}
                selected={filters.restaurantAvailability === "tomorrow"}
                onClick={() => setFilters((p) => ({ ...p, restaurantAvailability: "tomorrow" }))}
              />
              <Chip
                label={t("filters.availability.specific")}
                selected={filters.restaurantAvailability === "specific"}
                onClick={() => setFilters((p) => ({ ...p, restaurantAvailability: "specific" }))}
              />
            </div>

            {filters.restaurantAvailability === "specific" && (
              <div className="max-w-[240px]">
                <DatePickerInput
                  value={filters.restaurantSpecificDate || ""}
                  onChange={(date) => setFilters((p) => ({ ...p, restaurantSpecificDate: date }))}
                />
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="offres">
        <AccordionTrigger className="text-left" >
          {t("filters.section.packs_offers")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {RESTAURANT_OFFERS.map((o) => (
              <Chip
                key={o}
                label={labelForOption(o)}
                selected={(filters.restaurantOffers || []).includes(o)}
                onClick={() => setFilters((p) => ({ ...p, restaurantOffers: toggleInArray(p.restaurantOffers, o) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="options">
        <AccordionTrigger className="text-left" >
          {t("filters.section.options")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {RESTAURANT_OPTIONS.map((o) => (
              <Chip
                key={o}
                label={labelForOption(o)}
                selected={(filters.restaurantOptions || []).includes(o)}
                onClick={() => setFilters((p) => ({ ...p, restaurantOptions: toggleInArray(p.restaurantOptions, o) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="ambiance">
        <AccordionTrigger className="text-left" >
          {t("filters.section.ambience")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {RESTAURANT_AMBIANCE.map((o) => (
              <Chip
                key={o}
                label={labelForOption(o)}
                selected={(filters.restaurantAmbiance || []).includes(o)}
                onClick={() => setFilters((p) => ({ ...p, restaurantAmbiance: toggleInArray(p.restaurantAmbiance, o) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );

  const loisirsFilters = accordion(
    <>
      <AccordionItem value="type">
        <AccordionTrigger className="text-left" >
          {t("filters.section.activity_type")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {LOISIRS_TYPES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.loisirsType || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, loisirsType: toggleInArray(p.loisirsType, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="duree">
        <AccordionTrigger className="text-left" >
          {t("filters.section.duration")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {LOISIRS_DUREE.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.loisirsDuree || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, loisirsDuree: toggleInArray(p.loisirsDuree, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="public">
        <AccordionTrigger className="text-left" >
          {t("filters.section.audience")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {LOISIRS_PUBLIC.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.loisirsPublic || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, loisirsPublic: toggleInArray(p.loisirsPublic, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="niveau">
        <AccordionTrigger className="text-left" >
          {t("filters.section.level")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {LOISIRS_NIVEAU.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.loisirsNiveau || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, loisirsNiveau: toggleInArray(p.loisirsNiveau, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="options">
        <AccordionTrigger className="text-left" >
          {t("filters.section.options")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {LOISIRS_OPTIONS.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.loisirsOptions || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, loisirsOptions: toggleInArray(p.loisirsOptions, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="contraintes">
        <AccordionTrigger className="text-left" >
          {t("filters.section.constraints")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm italic text-gray-700">{t("filters.constraints.min_people")}</div>
              <Input
                type="number"
                inputMode="numeric"
                value={typeof filters.loisirsMinParticipants === "number" ? String(filters.loisirsMinParticipants) : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed = raw === "" ? undefined : Number(raw);
                  setFilters((p) => ({ ...p, loisirsMinParticipants: Number.isFinite(parsed) ? parsed : undefined }));
                }}
                placeholder={t("filters.placeholder.example", { value: 4 })}
                className="h-10 md:h-11 bg-slate-50"
                
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-sm italic text-gray-700">{t("filters.constraints.privatization")}</div>
              <Switch
                checked={!!filters.loisirsPrivatisationPossible}
                onCheckedChange={(checked) => setFilters((p) => ({ ...p, loisirsPrivatisationPossible: checked }))}
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );

  const sportFilters = accordion(
    <>
      <AccordionItem value="type">
        <AccordionTrigger className="text-left" >
          {t("filters.section.type")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_TYPES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportType || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, sportType: toggleInArray(p.sportType, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="format">
        <AccordionTrigger className="text-left" >
          {t("filters.section.format")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_FORMAT.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportFormat || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, sportFormat: toggleInArray(p.sportFormat, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="duree">
        <AccordionTrigger className="text-left" >
          {t("filters.section.duration_minutes")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_DUREE.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportDuree || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, sportDuree: toggleInArray(p.sportDuree, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="public">
        <AccordionTrigger className="text-left" >
          {t("filters.section.audience")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_PUBLIC.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportPublic || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, sportPublic: toggleInArray(p.sportPublic, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="equipements">
        <AccordionTrigger className="text-left" >
          {t("filters.section.equipment")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_EQUIPEMENTS.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportEquipements || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({ ...p, sportEquipements: toggleInArray(p.sportEquipements, t) }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="offres">
        <AccordionTrigger className="text-left" >
          {t("filters.section.offers")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SPORT_OFFRES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.sportOffres || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, sportOffres: toggleInArray(p.sportOffres, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="contraintes">
        <AccordionTrigger className="text-left" >
          {t("filters.section.constraints")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm italic text-gray-700">{t("filters.constraints.min_people")}</div>
              <Input
                type="number"
                inputMode="numeric"
                value={typeof filters.sportMinParticipants === "number" ? String(filters.sportMinParticipants) : ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const parsed = raw === "" ? undefined : Number(raw);
                  setFilters((p) => ({ ...p, sportMinParticipants: Number.isFinite(parsed) ? parsed : undefined }));
                }}
                placeholder={t("filters.placeholder.example", { value: 4 })}
                className="h-10 md:h-11 bg-slate-50"
                
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm italic text-gray-700">{t("filters.section.level")}</div>
              <div className="flex flex-wrap gap-2">
                {SPORT_NIVEAU.map((t) => (
                  <Chip
                    key={t}
                    label={labelForOption(t)}
                    selected={(filters.sportNiveau || []).includes(t)}
                    onClick={() => setFilters((p) => ({ ...p, sportNiveau: toggleInArray(p.sportNiveau, t) }))}
                  />
                ))}
              </div>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );

  const hebergementFilters = accordion(
    <>
      <AccordionItem value="type">
        <AccordionTrigger className="text-left" >
          {t("filters.section.type")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {HEBERGEMENT_TYPES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.accommodationType || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, accommodationType: toggleInArray(p.accommodationType, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="budget">
        <AccordionTrigger className="text-left" >
          {t("filters.section.budget_per_night")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {HEBERGEMENT_BUDGET.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.accommodationBudget || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({ ...p, accommodationBudget: toggleInArray(p.accommodationBudget, t) }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="notes">
        <AccordionTrigger className="text-left" >
          {t("filters.section.ratings")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {HEBERGEMENT_NOTES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={filters.accommodationNotes === t}
                onClick={() => setFilters((p) => ({ ...p, accommodationNotes: p.accommodationNotes === t ? undefined : t }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="equipements">
        <AccordionTrigger className="text-left" >
          {t("filters.section.equipment")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {HEBERGEMENT_EQUIPEMENTS.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.accommodationEquipements || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    accommodationEquipements: toggleInArray(p.accommodationEquipements, t),
                  }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="conditions">
        <AccordionTrigger className="text-left" >
          {t("filters.section.conditions")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {HEBERGEMENT_CONDITIONS.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.accommodationConditions || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    accommodationConditions: toggleInArray(p.accommodationConditions, t),
                  }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );

  const cultureFilters = accordion(
    <>
      <AccordionItem value="type">
        <AccordionTrigger className="text-left" >
          {t("filters.section.type")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_TYPES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.cultureType || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, cultureType: toggleInArray(p.cultureType, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="langue">
        <AccordionTrigger className="text-left" >
          {t("filters.section.language")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_LANGUES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.cultureLangue || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, cultureLangue: toggleInArray(p.cultureLangue, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="public">
        <AccordionTrigger className="text-left" >
          {t("filters.section.audience")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_PUBLIC.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.culturePublic || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, culturePublic: toggleInArray(p.culturePublic, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="acces">
        <AccordionTrigger className="text-left" >
          {t("filters.section.access")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_ACCES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.cultureAcces || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, cultureAcces: toggleInArray(p.cultureAcces, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="format">
        <AccordionTrigger className="text-left" >
          {t("filters.section.format")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_FORMAT.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.cultureFormat || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, cultureFormat: toggleInArray(p.cultureFormat, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="duree">
        <AccordionTrigger className="text-left" >
          {t("filters.section.duration")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {CULTURE_DUREE.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.cultureDuree || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, cultureDuree: toggleInArray(p.cultureDuree, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="contraintes">
        <AccordionTrigger className="text-left" >
          {t("filters.section.constraints")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="space-y-2">
            <div className="text-sm italic text-gray-700">Minimum de personnes</div>
            <Input
              type="number"
              inputMode="numeric"
              value={typeof filters.cultureMinParticipants === "number" ? String(filters.cultureMinParticipants) : ""}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw === "" ? undefined : Number(raw);
                setFilters((p) => ({ ...p, cultureMinParticipants: Number.isFinite(parsed) ? parsed : undefined }));
              }}
              placeholder={t("filters.placeholder.example", { value: 10 })}
              className="h-10 md:h-11 bg-slate-50"
              
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </>
  );

  const shoppingFilters = accordion(
    <>
      <AccordionItem value="type">
        <AccordionTrigger className="text-left" >
          {t("filters.section.store_type")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SHOPPING_TYPES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.shoppingStoreType || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    shoppingStoreType: toggleInArray(p.shoppingStoreType, t),
                  }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="budget">
        <AccordionTrigger className="text-left" >
          {t("filters.section.budget")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SHOPPING_BUDGET.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.shoppingBudget || []).includes(t)}
                onClick={() => setFilters((p) => ({ ...p, shoppingBudget: toggleInArray(p.shoppingBudget, t) }))}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="services">
        <AccordionTrigger className="text-left" >
          {t("filters.section.services")}
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-wrap gap-2">
            {SHOPPING_SERVICES.map((t) => (
              <Chip
                key={t}
                label={labelForOption(t)}
                selected={(filters.shoppingServices || []).includes(t)}
                onClick={() =>
                  setFilters((p) => ({
                    ...p,
                    shoppingServices: toggleInArray(p.shoppingServices, t),
                  }))
                }
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

    </>
  );

  const categoryFilters =
    category === "restaurants"
      ? restaurantFilters
      : category === "loisirs"
        ? loisirsFilters
        : category === "sport"
          ? sportFilters
          : category === "hebergement"
            ? hebergementFilters
            : category === "culture"
              ? cultureFilters
              : category === "shopping"
                ? shoppingFilters
                : null;

  const content = (
    <div className="flex min-h-0 flex-col h-full font-[Circular_Std,_sans-serif]">
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between gap-4 px-4 py-4 border-b border-slate-200">
        <div className="text-lg font-semibold">{t("filters.title")}</div>
        <button
          type="button"
          className="p-2 rounded-md hover:bg-slate-100 transition"
          onClick={onClose}
          aria-label={t("common.close")}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 [webkit-overflow-scrolling:touch]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold" >
                  {t("filters.promotions.title")}
                </div>
                <div className="text-sm italic text-gray-700" >
                  {t("filters.promotions.subtitle")}
                </div>
                <div className="text-xs text-slate-500 mt-1" >
                  {t("filters.promotions.description")}
                </div>
              </div>
              <Switch
                checked={!!filters.promotionsOnly}
                onCheckedChange={(checked) => setFilters((p) => ({ ...p, promotionsOnly: checked }))}
              />
            </div>
          </div>

          {categoryFilters ? (
            categoryFilters
          ) : (
            <div className="text-sm italic text-gray-700">{t("filters.none_available")}</div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 bg-white/95 backdrop-blur border-t border-slate-200 px-4 py-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            className="flex-1 h-11 border-primary/40 text-primary bg-white hover:bg-primary/5"
          >
            {t("common.reset")}
          </Button>
          <Button type="button" variant="brand" onClick={handleApply} className="flex-1 h-11">
            {t("filters.apply")}
          </Button>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <SheetContent side="bottom" className="p-0 h-[100dvh] rounded-none font-[Circular_Std,_sans-serif]" hideCloseButton>
          <SheetHeader className="sr-only">
            <SheetTitle>{t("filters.title")}</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent
        hideCloseButton
        className="w-[min(1024px,calc(100vw-32px))] h-[80vh] max-h-[calc(100dvh-64px)] overflow-hidden p-0 font-[Circular_Std,_sans-serif]"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{t("filters.title")}</DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
