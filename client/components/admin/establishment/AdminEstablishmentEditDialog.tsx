import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, MapPin, Utensils, Building2, Tags } from "lucide-react";
import { loadAdminSessionToken } from "@/lib/adminApi";

// Import taxonomy data
import {
  type ActivityCategory,
  CATEGORY_CONFIGS,
  getActivitiesByCategory,
  CUISINE_TYPES,
  SPORT_ACTIVITIES,
  LOISIRS_ACTIVITIES,
  HEBERGEMENT_ACTIVITIES,
  CULTURE_ACTIVITIES,
  SHOPPING_ACTIVITIES,
  VEHICLE_TYPES,
} from "@/lib/taxonomy";

// Moroccan cities (main ones first, then alphabetical)
const MOROCCAN_CITIES = [
  "Casablanca",
  "Marrakech",
  "Rabat",
  "Fès",
  "Tanger",
  "Agadir",
  "Meknès",
  "Oujda",
  "Kénitra",
  "Tétouan",
  "Salé",
  "Nador",
  "Mohammedia",
  "El Jadida",
  "Béni Mellal",
  "Essaouira",
  "Dakhla",
  "Laâyoune",
  "Ifrane",
  "Ouarzazate",
  "Errachidia",
  "Al Hoceima",
  "Chefchaouen",
  "Safi",
  "Settat",
  "Khémisset",
  "Khouribga",
  "Larache",
  "Guelmim",
  "Berkane",
];

// Universe configuration with labels and categories
const UNIVERSE_CONFIG: Record<string, {
  label: string;
  categories: { id: string; name: string }[];
  subcategories: Record<string, { id: string; name: string }[]>;
}> = {
  restaurants: {
    label: "Boire & Manger",
    categories: [
      { id: "restaurant", name: "Restaurant" },
      { id: "cafe", name: "Café" },
      { id: "bar", name: "Bar" },
      { id: "lounge", name: "Lounge" },
      { id: "rooftop", name: "Rooftop" },
      { id: "club", name: "Club" },
      { id: "fastfood", name: "Fast Food" },
      { id: "patisserie", name: "Pâtisserie" },
      { id: "glacier", name: "Glacier" },
      { id: "brasserie", name: "Brasserie" },
      { id: "traiteur", name: "Traiteur" },
    ],
    subcategories: {
      restaurant: CUISINE_TYPES.map(c => ({ id: c.toLowerCase().replace(/\s+/g, "_"), name: c })),
      cafe: [
        { id: "cafe_classique", name: "Café classique" },
        { id: "coffee_shop", name: "Coffee Shop" },
        { id: "salon_the", name: "Salon de thé" },
        { id: "brunch", name: "Brunch" },
      ],
      bar: [
        { id: "bar_cocktails", name: "Bar à cocktails" },
        { id: "bar_vins", name: "Bar à vins" },
        { id: "pub", name: "Pub" },
        { id: "sports_bar", name: "Sports Bar" },
      ],
      lounge: [
        { id: "lounge_bar", name: "Lounge Bar" },
        { id: "shisha_lounge", name: "Shisha Lounge" },
        { id: "chicha", name: "Chicha" },
      ],
      rooftop: [
        { id: "rooftop_bar", name: "Rooftop Bar" },
        { id: "rooftop_restaurant", name: "Rooftop Restaurant" },
      ],
      club: [
        { id: "nightclub", name: "Nightclub" },
        { id: "discotheque", name: "Discothèque" },
        { id: "club_prive", name: "Club privé" },
      ],
      fastfood: [
        { id: "burger", name: "Burger" },
        { id: "pizza", name: "Pizza" },
        { id: "tacos", name: "Tacos" },
        { id: "snack", name: "Snack" },
        { id: "food_truck", name: "Food Truck" },
      ],
      patisserie: [
        { id: "patisserie_francaise", name: "Pâtisserie française" },
        { id: "patisserie_marocaine", name: "Pâtisserie marocaine" },
        { id: "patisserie_orientale", name: "Pâtisserie orientale" },
      ],
      glacier: [
        { id: "glacier_artisanal", name: "Glacier artisanal" },
        { id: "frozen_yogurt", name: "Frozen Yogurt" },
      ],
      brasserie: [
        { id: "brasserie_classique", name: "Brasserie classique" },
        { id: "brasserie_moderne", name: "Brasserie moderne" },
      ],
      traiteur: [
        { id: "traiteur_evenementiel", name: "Traiteur événementiel" },
        { id: "traiteur_livraison", name: "Traiteur livraison" },
      ],
    },
  },
  sport: {
    label: "Sport & Bien-être",
    categories: [
      { id: "hammam", name: "Hammam" },
      { id: "spa", name: "Spa" },
      { id: "massage", name: "Massage" },
      { id: "institut_beaute", name: "Institut beauté" },
      { id: "coiffure", name: "Coiffure / Barber" },
      { id: "salle_sport", name: "Salle de sport" },
      { id: "yoga_pilates", name: "Yoga / Pilates" },
      { id: "piscine", name: "Piscine" },
      { id: "padel", name: "Padel" },
      { id: "tennis", name: "Tennis" },
      { id: "foot5", name: "Foot 5" },
      { id: "crossfit", name: "CrossFit" },
      { id: "arts_martiaux", name: "Arts martiaux" },
    ],
    subcategories: {
      hammam: [
        { id: "hammam_traditionnel", name: "Hammam traditionnel" },
        { id: "hammam_moderne", name: "Hammam moderne" },
        { id: "hammam_luxe", name: "Hammam de luxe" },
      ],
      spa: [
        { id: "spa_luxe", name: "Spa de luxe" },
        { id: "day_spa", name: "Day Spa" },
        { id: "spa_hotel", name: "Spa d'hôtel" },
      ],
      massage: [
        { id: "massage_relaxant", name: "Massage relaxant" },
        { id: "massage_sportif", name: "Massage sportif" },
        { id: "massage_thai", name: "Massage thaïlandais" },
        { id: "reflexologie", name: "Réflexologie" },
      ],
      institut_beaute: [
        { id: "soins_visage", name: "Soins du visage" },
        { id: "soins_corps", name: "Soins du corps" },
        { id: "epilation", name: "Épilation" },
        { id: "manucure_pedicure", name: "Manucure / Pédicure" },
      ],
      coiffure: [
        { id: "coiffeur_femme", name: "Coiffeur femme" },
        { id: "coiffeur_homme", name: "Coiffeur homme" },
        { id: "barbier", name: "Barbier" },
        { id: "salon_mixte", name: "Salon mixte" },
      ],
      salle_sport: [
        { id: "fitness", name: "Fitness" },
        { id: "musculation", name: "Musculation" },
        { id: "cardio", name: "Cardio" },
        { id: "cours_collectifs", name: "Cours collectifs" },
      ],
      yoga_pilates: [
        { id: "yoga_hatha", name: "Yoga Hatha" },
        { id: "yoga_vinyasa", name: "Yoga Vinyasa" },
        { id: "pilates_mat", name: "Pilates Mat" },
        { id: "pilates_reformer", name: "Pilates Reformer" },
      ],
      piscine: [
        { id: "piscine_interieure", name: "Piscine intérieure" },
        { id: "piscine_exterieure", name: "Piscine extérieure" },
        { id: "aquagym", name: "Aquagym" },
      ],
      padel: [
        { id: "padel_indoor", name: "Padel indoor" },
        { id: "padel_outdoor", name: "Padel outdoor" },
      ],
      tennis: [
        { id: "tennis_terre_battue", name: "Tennis terre battue" },
        { id: "tennis_dur", name: "Tennis dur" },
        { id: "tennis_indoor", name: "Tennis indoor" },
      ],
      foot5: [
        { id: "foot5_indoor", name: "Foot 5 indoor" },
        { id: "foot5_outdoor", name: "Foot 5 outdoor" },
      ],
      crossfit: [
        { id: "crossfit_box", name: "CrossFit Box" },
        { id: "functional_training", name: "Functional Training" },
      ],
      arts_martiaux: [
        { id: "boxe", name: "Boxe" },
        { id: "mma", name: "MMA" },
        { id: "judo", name: "Judo" },
        { id: "karate", name: "Karaté" },
        { id: "taekwondo", name: "Taekwondo" },
      ],
    },
  },
  loisirs: {
    label: "Loisirs",
    categories: [
      { id: "escape_game", name: "Escape Game" },
      { id: "karting", name: "Karting" },
      { id: "quad_buggy", name: "Quad / Buggy" },
      { id: "jet_ski", name: "Jet Ski" },
      { id: "parachute", name: "Parachute / Parapente" },
      { id: "golf", name: "Golf" },
      { id: "bowling", name: "Bowling" },
      { id: "laser_game", name: "Laser Game" },
      { id: "paintball", name: "Paintball" },
      { id: "aquapark", name: "Aquapark" },
      { id: "surf_kite", name: "Surf / Kite" },
      { id: "equitation", name: "Équitation" },
      { id: "parc_attractions", name: "Parc d'attractions" },
    ],
    subcategories: {
      escape_game: [
        { id: "escape_horreur", name: "Escape game horreur" },
        { id: "escape_aventure", name: "Escape game aventure" },
        { id: "escape_enquete", name: "Escape game enquête" },
        { id: "escape_famille", name: "Escape game famille" },
      ],
      karting: [
        { id: "karting_indoor", name: "Karting indoor" },
        { id: "karting_outdoor", name: "Karting outdoor" },
      ],
      quad_buggy: [
        { id: "quad", name: "Quad" },
        { id: "buggy", name: "Buggy" },
        { id: "ssv", name: "SSV" },
      ],
      jet_ski: [
        { id: "jet_ski", name: "Jet ski" },
        { id: "paddle", name: "Paddle" },
        { id: "kayak", name: "Kayak" },
        { id: "wakeboard", name: "Wakeboard" },
      ],
      parachute: [
        { id: "parachute", name: "Parachute" },
        { id: "parapente", name: "Parapente" },
        { id: "saut_elastique", name: "Saut à l'élastique" },
      ],
      golf: [
        { id: "golf_18", name: "Golf 18 trous" },
        { id: "golf_9", name: "Golf 9 trous" },
        { id: "mini_golf", name: "Mini-golf" },
        { id: "driving_range", name: "Driving Range" },
      ],
      bowling: [
        { id: "bowling_classique", name: "Bowling classique" },
        { id: "bowling_vip", name: "Bowling VIP" },
      ],
      laser_game: [
        { id: "laser_game_indoor", name: "Laser game indoor" },
        { id: "laser_game_outdoor", name: "Laser game outdoor" },
      ],
      paintball: [
        { id: "paintball_outdoor", name: "Paintball outdoor" },
        { id: "airsoft", name: "Airsoft" },
      ],
      aquapark: [
        { id: "parc_aquatique", name: "Parc aquatique" },
        { id: "plage_privee", name: "Plage privée" },
      ],
      surf_kite: [
        { id: "surf", name: "Surf" },
        { id: "kitesurf", name: "Kitesurf" },
        { id: "windsurf", name: "Windsurf" },
      ],
      equitation: [
        { id: "centre_equestre", name: "Centre équestre" },
        { id: "balade_cheval", name: "Balade à cheval" },
        { id: "balade_chameau", name: "Balade en chameau" },
      ],
      parc_attractions: [
        { id: "parc_attractions", name: "Parc d'attractions" },
        { id: "fete_foraine", name: "Fête foraine" },
      ],
    },
  },
  hebergement: {
    label: "Hébergement",
    categories: [
      { id: "hotel", name: "Hôtel" },
      { id: "riad", name: "Riad" },
      { id: "maison_hotes", name: "Maison d'hôtes" },
      { id: "appartement", name: "Appartement" },
      { id: "villa", name: "Villa" },
      { id: "resort", name: "Resort" },
      { id: "auberge", name: "Auberge" },
      { id: "glamping", name: "Glamping" },
    ],
    subcategories: {
      hotel: [
        { id: "hotel_5_etoiles", name: "Hôtel 5 étoiles" },
        { id: "hotel_4_etoiles", name: "Hôtel 4 étoiles" },
        { id: "hotel_3_etoiles", name: "Hôtel 3 étoiles" },
        { id: "hotel_2_etoiles", name: "Hôtel 2 étoiles" },
        { id: "hotel_boutique", name: "Hôtel boutique" },
        { id: "palace", name: "Palace" },
      ],
      riad: [
        { id: "riad_traditionnel", name: "Riad traditionnel" },
        { id: "riad_luxe", name: "Riad de luxe" },
        { id: "riad_charme", name: "Riad de charme" },
      ],
      maison_hotes: [
        { id: "chambre_hotes", name: "Chambre d'hôtes" },
        { id: "gite", name: "Gîte" },
      ],
      appartement: [
        { id: "studio", name: "Studio" },
        { id: "appartement_standing", name: "Appartement standing" },
        { id: "loft", name: "Loft" },
      ],
      villa: [
        { id: "villa_piscine", name: "Villa avec piscine" },
        { id: "villa_luxe", name: "Villa de luxe" },
        { id: "villa_bord_mer", name: "Villa bord de mer" },
      ],
      resort: [
        { id: "resort_all_inclusive", name: "Resort all-inclusive" },
        { id: "resort_spa", name: "Resort & Spa" },
        { id: "resort_golf", name: "Resort Golf" },
      ],
      auberge: [
        { id: "auberge_montagne", name: "Auberge de montagne" },
        { id: "auberge_campagne", name: "Auberge de campagne" },
      ],
      glamping: [
        { id: "tente_luxe", name: "Tente de luxe" },
        { id: "dome", name: "Dôme" },
        { id: "bivouac_desert", name: "Bivouac désert" },
      ],
    },
  },
  culture: {
    label: "Culture",
    categories: [
      { id: "musee", name: "Musée" },
      { id: "monument", name: "Monument" },
      { id: "visite_guidee", name: "Visite guidée" },
      { id: "theatre", name: "Théâtre" },
      { id: "spectacle", name: "Spectacle" },
      { id: "concert", name: "Concert" },
      { id: "expo", name: "Exposition" },
      { id: "atelier", name: "Atelier" },
      { id: "festival", name: "Festival" },
    ],
    subcategories: {
      musee: [
        { id: "musee_art", name: "Musée d'art" },
        { id: "musee_histoire", name: "Musée d'histoire" },
        { id: "musee_sciences", name: "Musée des sciences" },
        { id: "musee_ethnographique", name: "Musée ethnographique" },
      ],
      monument: [
        { id: "monument_historique", name: "Monument historique" },
        { id: "palais", name: "Palais" },
        { id: "medina", name: "Médina" },
        { id: "site_archeologique", name: "Site archéologique" },
        { id: "mosquee", name: "Mosquée" },
      ],
      visite_guidee: [
        { id: "visite_ville", name: "Visite de ville" },
        { id: "visite_nocturne", name: "Visite nocturne" },
        { id: "excursion", name: "Excursion" },
      ],
      theatre: [
        { id: "theatre_classique", name: "Théâtre classique" },
        { id: "theatre_contemporain", name: "Théâtre contemporain" },
        { id: "comedie", name: "Comédie" },
      ],
      spectacle: [
        { id: "spectacle_musique", name: "Spectacle musical" },
        { id: "spectacle_danse", name: "Spectacle de danse" },
        { id: "one_man_show", name: "One-man-show" },
      ],
      concert: [
        { id: "concert_musique_live", name: "Musique live" },
        { id: "concert_jazz", name: "Jazz" },
        { id: "concert_gnaoua", name: "Gnaoua" },
        { id: "concert_andalou", name: "Musique andalouse" },
      ],
      expo: [
        { id: "expo_art", name: "Exposition d'art" },
        { id: "expo_photo", name: "Exposition photo" },
        { id: "galerie", name: "Galerie d'art" },
      ],
      atelier: [
        { id: "atelier_cuisine", name: "Atelier cuisine" },
        { id: "atelier_poterie", name: "Atelier poterie" },
        { id: "atelier_calligraphie", name: "Atelier calligraphie" },
        { id: "atelier_artisanat", name: "Atelier artisanat" },
      ],
      festival: [
        { id: "festival_musique", name: "Festival de musique" },
        { id: "festival_cinema", name: "Festival de cinéma" },
        { id: "festival_gastronomie", name: "Festival gastronomique" },
      ],
    },
  },
  shopping: {
    label: "Shopping",
    categories: [
      { id: "mode", name: "Mode" },
      { id: "chaussures", name: "Chaussures" },
      { id: "beaute", name: "Beauté / Parfumerie" },
      { id: "bijoux", name: "Bijoux" },
      { id: "maison_deco", name: "Maison / Déco" },
      { id: "artisanat", name: "Artisanat" },
      { id: "epicerie_fine", name: "Épicerie fine" },
      { id: "concept_store", name: "Concept store" },
      { id: "centre_commercial", name: "Centre commercial" },
    ],
    subcategories: {
      mode: [
        { id: "mode_femme", name: "Mode femme" },
        { id: "mode_homme", name: "Mode homme" },
        { id: "mode_enfant", name: "Mode enfant" },
        { id: "createur", name: "Créateur" },
        { id: "vintage", name: "Vintage" },
      ],
      chaussures: [
        { id: "chaussures_femme", name: "Chaussures femme" },
        { id: "chaussures_homme", name: "Chaussures homme" },
        { id: "maroquinerie", name: "Maroquinerie" },
      ],
      beaute: [
        { id: "parfumerie", name: "Parfumerie" },
        { id: "cosmetiques", name: "Cosmétiques" },
        { id: "maquillage", name: "Maquillage" },
      ],
      bijoux: [
        { id: "bijoux_fantaisie", name: "Bijoux fantaisie" },
        { id: "bijoux_precieux", name: "Bijoux précieux" },
        { id: "montres", name: "Montres" },
      ],
      maison_deco: [
        { id: "decoration", name: "Décoration" },
        { id: "mobilier", name: "Mobilier" },
        { id: "luminaires", name: "Luminaires" },
        { id: "art_table", name: "Art de la table" },
        { id: "tapis", name: "Tapis" },
      ],
      artisanat: [
        { id: "artisanat_marocain", name: "Artisanat marocain" },
        { id: "poterie", name: "Poterie" },
        { id: "ceramique", name: "Céramique" },
        { id: "cuir", name: "Cuir" },
        { id: "textile", name: "Textile" },
      ],
      epicerie_fine: [
        { id: "traiteur", name: "Traiteur" },
        { id: "patisserie", name: "Pâtisserie" },
        { id: "chocolaterie", name: "Chocolaterie" },
        { id: "produits_terroir", name: "Produits du terroir" },
      ],
      concept_store: [
        { id: "concept_store_mode", name: "Concept store mode" },
        { id: "multimarques", name: "Multimarques" },
      ],
      centre_commercial: [
        { id: "mall", name: "Mall" },
        { id: "souk", name: "Souk" },
        { id: "marche", name: "Marché" },
      ],
    },
  },
  rentacar: {
    label: "Location de véhicules",
    categories: [
      { id: "voiture", name: "Voiture" },
      { id: "moto", name: "Moto / Scooter" },
      { id: "utilitaire", name: "Utilitaire" },
      { id: "luxe", name: "Véhicule de luxe" },
      { id: "avec_chauffeur", name: "Avec chauffeur" },
    ],
    subcategories: {
      voiture: VEHICLE_TYPES.slice(0, 12).map(v => ({ id: v.toLowerCase().replace(/\s+/g, "_"), name: v })),
      moto: [
        { id: "moto", name: "Moto" },
        { id: "scooter", name: "Scooter" },
        { id: "quad", name: "Quad" },
      ],
      utilitaire: [
        { id: "utilitaire", name: "Utilitaire" },
        { id: "minibus", name: "Minibus" },
        { id: "van", name: "Van" },
      ],
      luxe: [
        { id: "voiture_luxe", name: "Voiture de luxe" },
        { id: "voiture_sport", name: "Voiture de sport" },
        { id: "cabriolet", name: "Cabriolet" },
      ],
      avec_chauffeur: [
        { id: "berline_chauffeur", name: "Berline avec chauffeur" },
        { id: "suv_chauffeur", name: "SUV avec chauffeur" },
        { id: "minibus_chauffeur", name: "Minibus avec chauffeur" },
      ],
    },
  },
};

// All universes for the dropdown
const UNIVERSES = Object.entries(UNIVERSE_CONFIG).map(([key, config]) => ({
  id: key,
  name: config.label,
}));

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishment: {
    id: string;
    name: string;
    city: string;
    universe: string;
    category?: string;
    subcategory: string;
  } | null;
  onSaved: () => void;
};

async function adminApiFetch(path: string, options: RequestInit = {}): Promise<any> {
  const sessionToken = loadAdminSessionToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (sessionToken) {
    headers["x-admin-session"] = sessionToken;
  }

  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
  }

  return payload;
}

export function AdminEstablishmentEditDialog({ open, onOpenChange, establishment, onSaved }: Props) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [universe, setUniverse] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open && establishment) {
      setName(establishment.name || "");
      setCity(establishment.city || "");
      const uni = establishment.universe || "restaurants";
      setUniverse(uni);

      // Try to resolve category from DB data
      const dbSubcategory = (establishment.subcategory || "").trim();
      const dbCategory = (establishment.category || "").trim();
      const config = UNIVERSE_CONFIG[uni];

      if (config) {
        // 1) If subcategory is in "category / subcategory" format, parse it
        if (dbSubcategory.includes("/")) {
          const parts = dbSubcategory.split("/").map(s => s.trim());
          const catPart = parts[0] || "";
          const subPart = parts[1] || "";
          // Match category by id or name (case-insensitive)
          const matchedCat = config.categories.find(c =>
            c.id === catPart || c.name.toLowerCase() === catPart.toLowerCase()
          );
          setCategory(matchedCat?.id || catPart);
          // Match subcategory by id or name
          const catSubs = config.subcategories[matchedCat?.id || catPart] || [];
          const matchedSub = catSubs.find(s =>
            s.id === subPart || s.name.toLowerCase() === subPart.toLowerCase()
          );
          setSubcategory(matchedSub?.id || subPart);
        }
        // 2) Try using the separate category field from DB
        else if (dbCategory) {
          const matchedCat = config.categories.find(c =>
            c.id === dbCategory || c.name.toLowerCase() === dbCategory.toLowerCase()
          );
          setCategory(matchedCat?.id || dbCategory);
          // Try to match subcategory in that category's subcategories
          if (dbSubcategory && matchedCat) {
            const catSubs = config.subcategories[matchedCat.id] || [];
            const matchedSub = catSubs.find(s =>
              s.id === dbSubcategory || s.name.toLowerCase() === dbSubcategory.toLowerCase()
            );
            setSubcategory(matchedSub?.id || dbSubcategory);
          } else {
            setSubcategory(dbSubcategory);
          }
        }
        // 3) Try matching subcategory directly as a category name
        else if (dbSubcategory) {
          const matchedCat = config.categories.find(c =>
            c.id === dbSubcategory || c.name.toLowerCase() === dbSubcategory.toLowerCase()
          );
          if (matchedCat) {
            setCategory(matchedCat.id);
            setSubcategory("");
          } else {
            // Try to find which category contains this as a subcategory
            let found = false;
            for (const [catId, subs] of Object.entries(config.subcategories)) {
              const matchedSub = subs.find(s =>
                s.id === dbSubcategory || s.name.toLowerCase() === dbSubcategory.toLowerCase()
              );
              if (matchedSub) {
                setCategory(catId);
                setSubcategory(matchedSub.id);
                found = true;
                break;
              }
            }
            if (!found) {
              setCategory(dbSubcategory);
              setSubcategory("");
            }
          }
        } else {
          setCategory("");
          setSubcategory("");
        }
      } else {
        setCategory("");
        setSubcategory("");
      }
    }
  }, [open, establishment]);

  // Get available categories for selected universe
  const availableCategories = useMemo(() => {
    const config = UNIVERSE_CONFIG[universe];
    return config?.categories || [];
  }, [universe]);

  // Get available subcategories for selected category
  const availableSubcategories = useMemo(() => {
    const config = UNIVERSE_CONFIG[universe];
    if (!config) return [];
    return config.subcategories[category] || [];
  }, [universe, category]);

  // Reset category when universe changes
  useEffect(() => {
    if (availableCategories.length > 0 && !availableCategories.find(c => c.id === category)) {
      setCategory(availableCategories[0].id);
      setSubcategory("");
    }
  }, [universe, availableCategories, category]);

  // Reset subcategory when category changes
  useEffect(() => {
    if (availableSubcategories.length > 0 && !availableSubcategories.find(s => s.id === subcategory)) {
      setSubcategory(availableSubcategories[0]?.id || "");
    }
  }, [category, availableSubcategories, subcategory]);

  const handleSave = async () => {
    if (!establishment) return;

    setSaving(true);
    try {
      // Build subcategory string (category / subcategory)
      const subcategoryValue = subcategory ? `${category} / ${subcategory}` : category;

      await adminApiFetch(
        `/api/admin/establishments/${encodeURIComponent(establishment.id)}/profile`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            city,
            universe,
            subcategory: subcategoryValue,
          }),
        }
      );

      toast({ title: "Fiche établissement mise à jour" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Erreur lors de la sauvegarde",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!establishment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Modifier la fiche établissement
          </DialogTitle>
          <DialogDescription>
            Modifiez les informations de base de l'établissement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="est_name">Nom de l'établissement</Label>
            <Input
              id="est_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom de l'établissement"
            />
          </div>

          {/* City */}
          <div className="space-y-2">
            <Label htmlFor="est_city" className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              Ville
            </Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger id="est_city">
                <SelectValue placeholder="Sélectionner une ville" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {MOROCCAN_CITIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Universe */}
          <div className="space-y-2">
            <Label htmlFor="est_universe" className="flex items-center gap-1">
              <Utensils className="w-3 h-3" />
              Univers
            </Label>
            <Select value={universe} onValueChange={setUniverse}>
              <SelectTrigger id="est_universe">
                <SelectValue placeholder="Sélectionner un univers" />
              </SelectTrigger>
              <SelectContent>
                {UNIVERSES.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label htmlFor="est_category" className="flex items-center gap-1">
              <Tags className="w-3 h-3" />
              Catégorie
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="est_category">
                <SelectValue placeholder="Sélectionner une catégorie" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {availableCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subcategory */}
          {availableSubcategories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="est_subcategory">Sous-catégorie</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger id="est_subcategory">
                  <SelectValue placeholder="Sélectionner une sous-catégorie" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableSubcategories.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
