// ============================================
// WIZARD CONSTANTS
// Shared constants for the establishment creation wizard
// ============================================

// ============================================
// MOROCCAN REGIONS (12 official regions)
// ============================================
export const MOROCCAN_REGIONS: { name: string; cities: string[] }[] = [
  {
    name: "Béni Mellal-Khénifra",
    cities: ["Béni Mellal", "Khouribga"],
  },
  {
    name: "Casablanca-Settat",
    cities: ["Casablanca", "Mohammedia", "El Jadida", "Settat"],
  },
  {
    name: "Dakhla-Oued Ed-Dahab",
    cities: ["Dakhla"],
  },
  {
    name: "Drâa-Tafilalet",
    cities: ["Errachidia", "Ouarzazate"],
  },
  {
    name: "Fès-Meknès",
    cities: ["Fès", "Meknès", "Ifrane", "Khémisset"],
  },
  {
    name: "Guelmim-Oued Noun",
    cities: ["Guelmim"],
  },
  {
    name: "Laâyoune-Sakia El Hamra",
    cities: ["Laâyoune"],
  },
  {
    name: "L'Oriental",
    cities: ["Oujda", "Nador", "Berkane"],
  },
  {
    name: "Marrakech-Safi",
    cities: ["Marrakech", "Safi", "Essaouira"],
  },
  {
    name: "Rabat-Salé-Kénitra",
    cities: ["Rabat", "Salé", "Kénitra"],
  },
  {
    name: "Souss-Massa",
    cities: ["Agadir"],
  },
  {
    name: "Tanger-Tétouan-Al Hoceima",
    cities: ["Tanger", "Tétouan", "Al Hoceima", "Larache", "Chefchaouen"],
  },
];

// Flat list of all cities (sorted alphabetically)
export const MOROCCAN_CITIES = MOROCCAN_REGIONS
  .flatMap((r) => r.cities)
  .sort((a, b) => a.localeCompare(b, "fr"));

// Map: city name → region name (for auto-fill)
export const CITY_TO_REGION: Record<string, string> = Object.fromEntries(
  MOROCCAN_REGIONS.flatMap((r) => r.cities.map((c) => [c, r.name]))
);

// ============================================
// UNIVERSE OPTIONS
// ============================================
export const UNIVERSE_OPTIONS = [
  { value: "restaurants", label: "Boire & Manger" },
  { value: "sport", label: "Sport & Bien-être" },
  { value: "loisirs", label: "Loisirs" },
  { value: "hebergement", label: "Hébergement" },
  { value: "culture", label: "Culture" },
  { value: "shopping", label: "Shopping" },
  { value: "rentacar", label: "Location de véhicules" },
];

// ============================================
// CUISINE TYPES (used for restaurant subcategories)
// ============================================
const CUISINE_TYPES = [
  "Afghan", "Africain", "Afternoon Tea", "Algérien", "Allemand", "Alsacien",
  "Américain", "Anglais", "Argentin", "Asiatique", "Auvergnat", "Basque",
  "Bouchon lyonnais", "Brésilien", "Cambodgien", "Canadien", "Chinois",
  "Colombien", "Coréen", "Corse", "Créole", "Crêperie", "Cubain",
  "Égyptien", "Espagnol", "Éthiopien", "Français", "Franco-belge",
  "Fruits de mer", "Fusion", "Grec", "Hawaïen", "Indien", "Iranien",
  "Israélien", "Italien", "Japonais", "Latino", "Libanais", "Marocain",
  "Méditerranéen", "Mexicain", "Oriental", "Pakistanais", "Péruvien",
  "Portugais", "Provençal", "Russe", "Savoyard", "Scandinave", "Steakhouse",
  "Sud-Ouest", "Syrien", "Thaïlandais", "Tunisien", "Turc", "Vegan",
  "Végétarien", "Vénézuélien", "Vietnamien",
];

// ============================================
// UNIVERSE CONFIG
// ============================================
export const UNIVERSE_CONFIG: Record<string, {
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
        { id: "parapharmacie", name: "Parapharmacie" },
      ],
      bijoux: [
        { id: "bijouterie", name: "Bijouterie" },
        { id: "joaillerie", name: "Joaillerie" },
        { id: "fantaisie", name: "Fantaisie" },
      ],
      maison_deco: [
        { id: "mobilier", name: "Mobilier" },
        { id: "decoration", name: "Décoration" },
        { id: "luminaires", name: "Luminaires" },
      ],
      artisanat: [
        { id: "artisanat_marocain", name: "Artisanat marocain" },
        { id: "tapis", name: "Tapis" },
        { id: "poterie", name: "Poterie" },
        { id: "cuir", name: "Cuir" },
      ],
      epicerie_fine: [
        { id: "epicerie_bio", name: "Épicerie bio" },
        { id: "produits_terroir", name: "Produits du terroir" },
        { id: "confiserie", name: "Confiserie" },
      ],
      concept_store: [
        { id: "lifestyle", name: "Lifestyle" },
        { id: "cadeaux", name: "Cadeaux" },
        { id: "multi_marques", name: "Multi-marques" },
      ],
      centre_commercial: [
        { id: "centre_commercial", name: "Centre commercial" },
        { id: "galerie_marchande", name: "Galerie marchande" },
      ],
    },
  },
  rentacar: {
    label: "Location de véhicules",
    categories: [
      { id: "citadine", name: "Citadine" },
      { id: "compacte", name: "Compacte" },
      { id: "berline", name: "Berline" },
      { id: "suv", name: "SUV" },
      { id: "4x4", name: "4x4" },
      { id: "monospace", name: "Monospace" },
      { id: "utilitaire", name: "Utilitaire" },
      { id: "luxe", name: "Luxe" },
      { id: "cabriolet", name: "Cabriolet" },
      { id: "electrique", name: "Électrique" },
    ],
    subcategories: {},
  },
};

// ============================================
// TAG CONFIG
// ============================================
export const TAG_CONFIG: Record<string, {
  specialties: string[];
  tags: string[];
  amenities: string[];
  ambiance: string[];
  service_types?: string[];
}> = {
  restaurants: {
    specialties: [
      "Marocain", "Méditerranéen", "Italien", "Japonais", "Asiatique", "Français",
      "Healthy", "Grillades", "Seafood", "Brunch", "Végétarien", "Vegan",
      "Pâtisserie", "Café", "Oriental", "Libanais", "Mexicain", "Indien",
      "Steakhouse", "Fusion", "Gastronomique", "Street food",
    ],
    tags: [
      "Nouveau", "Tendance", "Incontournable", "Bon plan", "Coup de cœur", "Premium",
      "Brunch", "Déjeuner", "Dîner", "Afterwork", "Rooftop", "Shisha",
      "Live music", "DJ", "Idéal en couple", "Entre amis", "Familial",
      "Business", "Groupe", "Anniversaire", "Instagrammable",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Valet", "Climatisation", "Accès PMR", "Paiement carte",
      "Terrasse", "Vue mer", "Vue", "Menu kids", "Chaise bébé",
      "Options végétariennes", "Options vegan", "Sans gluten", "Halal",
      "Cocktails", "Happy hour", "Musique live", "Salle privée", "Réservation en ligne",
    ],
    ambiance: [
      "Cosy", "Chic", "Lounge", "Calme", "Festif", "Convivial", "Intimiste",
      "Moderne", "Traditionnel", "Romantique", "Speakeasy",
      "Ambiance club", "Live band", "DJ set", "Candlelight", "Ambiance marocaine",
    ],
    service_types: [
      "Buffet à volonté", "Servi à table", "À la carte",
    ],
  },
  loisirs: {
    specialties: [
      "Escape game", "Bowling", "Laser game", "Karting", "Quad", "Paintball",
      "Jet ski", "Paddle", "Surf", "Plongée", "Golf", "Équitation",
      "Parachute", "Parapente", "Accrobranche", "Randonnée", "Aquapark",
    ],
    tags: [
      "Nouveau", "Tendance", "Sensations", "Team building",
      "Kids friendly", "Familial", "Entre amis", "Groupe", "Outdoor", "Indoor",
      "Sport", "Anniversaire", "Événement",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Douches", "Vestiaires", "Matériel inclus", "Coach", "Casiers",
      "Espace détente", "Réservation en ligne", "Café/Snack",
    ],
    ambiance: [
      "Sportive", "Aventure", "Détente", "Adrénaline", "Family fun",
      "Moderne", "Nature", "Convivial", "Festif",
    ],
  },
  sport: {
    specialties: [
      "Hammam", "Massage", "Spa", "Yoga", "Pilates", "CrossFit", "Fitness",
      "Musculation", "Boxe", "Natation", "Padel", "Tennis", "Réflexologie",
      "Soins du visage", "Épilation", "Manucure", "Pédicure", "Coiffure", "Barber",
    ],
    tags: [
      "Nouveau", "Tendance", "Premium", "Coup de cœur",
      "Idéal en couple", "Entre amis", "Solo", "Homme", "Femme", "Mixte",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Douches", "Vestiaires", "Serviettes fournies", "Casiers", "Jacuzzi",
      "Sauna", "Piscine", "Réservation en ligne",
    ],
    ambiance: [
      "Zen", "Luxueux", "Moderne", "Traditionnel", "Cosy", "Intimiste",
      "Professionnel", "Détente", "Bien-être",
    ],
  },
  hebergement: {
    specialties: [
      "Riad", "Hôtel", "Villa", "Resort", "All inclusive", "Boutique hotel",
      "Maison d'hôtes", "Glamping", "Éco-lodge", "Suite", "Bungalow",
    ],
    tags: [
      "Nouveau", "Tendance", "Premium", "Coup de cœur", "Week-end",
      "Séjour romantique", "Voyage d'affaires", "All inclusive", "Vue mer",
      "Vue montagne", "Plage", "Pet friendly",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Petit-déjeuner", "Room service", "Réception 24/7", "Navette aéroport",
      "Piscine", "Spa", "Salle de sport", "Plage privée", "Kids club",
      "Conciergerie", "Salles de réunion", "Restaurant",
    ],
    ambiance: [
      "Luxueux", "Romantique", "Familial", "Business", "Zen", "Bohème",
      "Traditionnel", "Moderne", "Vue panoramique", "Adults only",
    ],
  },
  culture: {
    specialties: [
      "Visite guidée", "Musée", "Monument", "Galerie d'art", "Théâtre",
      "Spectacle", "Atelier cuisine", "Atelier poterie", "Cours de danse",
      "Excursion", "Festival", "Concert",
    ],
    tags: [
      "Nouveau", "Incontournable", "Historique", "Artistique", "Éducatif",
      "Familial", "Groupe", "Privatisable",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Boutique souvenirs", "Café", "Vestiaire", "Audio guide", "Guide multilingue",
    ],
    ambiance: [
      "Culturel", "Contemplatif", "Interactif", "Immersif",
    ],
  },
  rentacar: {
    specialties: [
      "Citadine", "Compacte", "Berline", "SUV", "4x4", "Monospace",
      "Utilitaire", "Luxe", "Cabriolet", "Électrique",
    ],
    tags: [
      "Nouveau", "Bon plan", "Premium", "Kilométrage illimité", "Assurance incluse",
      "GPS inclus", "Siège bébé disponible", "Livraison possible",
    ],
    amenities: [
      "Parking", "Paiement carte", "Assurance tous risques", "Assistance 24/7",
      "Livraison aéroport", "Livraison hôtel", "GPS", "Siège enfant",
    ],
    ambiance: [],
  },
  shopping: {
    specialties: [
      "Mode", "Chaussures", "Beauté", "Bijoux", "Déco", "Artisanat",
      "Épicerie fine", "Concept store",
    ],
    tags: [
      "Nouveau", "Tendance", "Premium", "Bon plan", "Coup de cœur", "Soldes",
      "Outlet", "Créateurs", "Made in Morocco",
    ],
    amenities: [
      "Wi-Fi", "Parking", "Climatisation", "Accès PMR", "Paiement carte",
      "Cabines d'essayage", "Emballage cadeau", "Livraison",
    ],
    ambiance: [
      "Luxueux", "Moderne", "Traditionnel", "Bohème", "Minimaliste",
    ],
  },
};

// ============================================
// DAYS
// ============================================
export const DAYS = [
  { key: "monday", label: "Lundi" },
  { key: "tuesday", label: "Mardi" },
  { key: "wednesday", label: "Mercredi" },
  { key: "thursday", label: "Jeudi" },
  { key: "friday", label: "Vendredi" },
  { key: "saturday", label: "Samedi" },
  { key: "sunday", label: "Dimanche" },
];

// ============================================
// DAY SCHEDULE TYPE
// ============================================
export type DaySchedule = {
  open: boolean;
  mode?: "continu" | "coupure";
  ranges?: { from: string; to: string }[];
  // Legacy v1 fields (kept for backward compat — server transforms to ranges)
  continuous?: boolean;
  openTime1?: string;
  closeTime1?: string;
  openTime2?: string;
  closeTime2?: string;
};

// ============================================
// DEFAULT SCHEDULE
// ============================================
export const DEFAULT_SCHEDULE: DaySchedule = {
  open: true,
  mode: "continu",
  ranges: [{ from: "09:00", to: "23:00" }],
};

// ============================================
// HIGHLIGHTS SUGGESTIONS
// ============================================
export const HIGHLIGHTS_SUGGESTIONS = [
  "Vue exceptionnelle", "Chef réputé", "Terrasse panoramique", "Cadre intimiste",
  "Service personnalisé", "Produits locaux", "Décor authentique", "Ambiance romantique",
];

// ============================================
// WIZARD DATA TYPE
// ============================================
export type WizardData = {
  // Step 1
  name: string;
  universe: string;
  category: string;
  subcategory: string;
  specialties: string[];
  // Step 2
  country: string;
  region: string;
  city: string;
  neighborhood: string;
  postal_code: string;
  address: string;
  lat: string;
  lng: string;
  // Step 3
  phone: string;
  whatsapp: string;
  booking_email: string;
  google_maps_link: string;
  website: string;
  owner_email: string;
  // Step 4
  short_description: string;
  long_description: string;
  // Step 5
  logoFile: File | null;
  coverFile: File | null;
  galleryFiles: File[];
  // Existing media URLs (populated in edit mode)
  logoUrl: string | null;
  coverUrl: string | null;
  galleryUrls: string[];
  // Step 6
  hours: Record<string, DaySchedule>;
  // Step 7
  ambiance_tags: string[];
  service_types: string[];
  general_tags: string[];
  amenities: string[];
  highlights: string[];
  social_links: {
    instagram: string;
    facebook: string;
    snapchat: string;
    youtube: string;
    tiktok: string;
    tripadvisor: string;
    waze: string;
    google_maps: string;
  };
};

// ============================================
// INITIAL WIZARD DATA FACTORY
// ============================================
export function createInitialWizardData(): WizardData {
  const hours: Record<string, DaySchedule> = {};
  DAYS.forEach(d => {
    hours[d.key] = { open: false, mode: "continu", ranges: [{ from: "09:00", to: "18:00" }] };
  });
  return {
    name: "",
    universe: "restaurants",
    category: "",
    subcategory: "",
    specialties: [],
    country: "Maroc",
    region: "",
    city: "",
    neighborhood: "",
    postal_code: "",
    address: "",
    lat: "",
    lng: "",
    phone: "",
    whatsapp: "",
    booking_email: "",
    google_maps_link: "",
    website: "",
    owner_email: "",
    short_description: "",
    long_description: "",
    logoFile: null,
    coverFile: null,
    galleryFiles: [],
    logoUrl: null,
    coverUrl: null,
    galleryUrls: [],
    hours,
    ambiance_tags: [],
    service_types: [],
    general_tags: [],
    amenities: [],
    highlights: [],
    social_links: {
      instagram: "",
      facebook: "",
      snapchat: "",
      youtube: "",
      tiktok: "",
      tripadvisor: "",
      waze: "",
      google_maps: "",
    },
  };
}

// ============================================
// WIZARD STEPS
// ============================================
export const WIZARD_STEPS = [
  { id: 1, label: "Identité", required: true },
  { id: 2, label: "Localisation", required: true },
  { id: 3, label: "Coordonnées", required: true },
  { id: 4, label: "Descriptions", required: true },
  { id: 5, label: "Médias", required: true },
  { id: 6, label: "Horaires", required: false },
  { id: 7, label: "Tags & extras", required: false },
];
