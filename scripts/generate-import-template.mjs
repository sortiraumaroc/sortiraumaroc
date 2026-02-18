/**
 * Generate Excel template for bulk establishment import
 * Mirrors the 7-step admin wizard exactly
 *
 * Run: node scripts/generate-import-template.mjs
 */
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT = path.join(__dirname, '..', 'template-import-etablissements.xlsx');

// ── Universe mapping (wizard value → DB value) ──
const UNIVERSES = {
  'restaurants': { label: 'Boire & Manger', db: 'restaurant' },
  'sport': { label: 'Sport & Bien-être', db: 'wellness' },
  'loisirs': { label: 'Loisirs', db: 'loisir' },
  'hebergement': { label: 'Hébergement', db: 'hebergement' },
  'culture': { label: 'Culture', db: 'culture' },
  'shopping': { label: 'Shopping', db: 'shopping' },
  'rentacar': { label: 'Location de véhicules', db: 'rentacar' },
};

// ── Categories per universe ──
const CATEGORIES = {
  restaurants: [
    { id: 'restaurant', label: 'Restaurant' },
    { id: 'cafe', label: 'Café' },
    { id: 'bar', label: 'Bar' },
    { id: 'lounge', label: 'Lounge' },
    { id: 'rooftop', label: 'Rooftop' },
    { id: 'club', label: 'Club' },
    { id: 'fastfood', label: 'Fast Food' },
    { id: 'patisserie', label: 'Pâtisserie' },
    { id: 'glacier', label: 'Glacier' },
    { id: 'brasserie', label: 'Brasserie' },
    { id: 'traiteur', label: 'Traiteur' },
  ],
  sport: [
    { id: 'hammam', label: 'Hammam' },
    { id: 'spa', label: 'Spa' },
    { id: 'massage', label: 'Massage' },
    { id: 'institut_beaute', label: 'Institut beauté' },
    { id: 'coiffure', label: 'Coiffure / Barber' },
    { id: 'salle_sport', label: 'Salle de sport' },
    { id: 'yoga_pilates', label: 'Yoga / Pilates' },
    { id: 'piscine', label: 'Piscine' },
    { id: 'padel', label: 'Padel' },
    { id: 'tennis', label: 'Tennis' },
    { id: 'foot5', label: 'Foot 5' },
    { id: 'crossfit', label: 'CrossFit' },
    { id: 'arts_martiaux', label: 'Arts martiaux' },
  ],
  loisirs: [
    { id: 'escape_game', label: 'Escape Game' },
    { id: 'karting', label: 'Karting' },
    { id: 'quad_buggy', label: 'Quad / Buggy' },
    { id: 'jet_ski', label: 'Jet Ski' },
    { id: 'parachute', label: 'Parachute / Parapente' },
    { id: 'golf', label: 'Golf' },
    { id: 'bowling', label: 'Bowling' },
    { id: 'laser_game', label: 'Laser Game' },
    { id: 'paintball', label: 'Paintball' },
    { id: 'aquapark', label: 'Aquapark' },
    { id: 'surf_kite', label: 'Surf / Kite' },
    { id: 'equitation', label: 'Équitation' },
    { id: 'parc_attractions', label: "Parc d'attractions" },
  ],
  hebergement: [
    { id: 'hotel', label: 'Hôtel' },
    { id: 'riad', label: 'Riad' },
    { id: 'maison_hotes', label: "Maison d'hôtes" },
    { id: 'appartement', label: 'Appartement' },
    { id: 'villa', label: 'Villa' },
    { id: 'resort', label: 'Resort' },
    { id: 'auberge', label: 'Auberge' },
    { id: 'glamping', label: 'Glamping' },
  ],
  culture: [
    { id: 'musee', label: 'Musée' },
    { id: 'monument', label: 'Monument' },
    { id: 'visite_guidee', label: 'Visite guidée' },
    { id: 'theatre', label: 'Théâtre' },
    { id: 'spectacle', label: 'Spectacle' },
    { id: 'concert', label: 'Concert' },
    { id: 'expo', label: 'Exposition' },
    { id: 'atelier', label: 'Atelier' },
    { id: 'festival', label: 'Festival' },
  ],
  shopping: [
    { id: 'mode', label: 'Mode' },
    { id: 'chaussures', label: 'Chaussures' },
    { id: 'beaute', label: 'Beauté / Parfumerie' },
    { id: 'bijoux', label: 'Bijoux' },
    { id: 'maison_deco', label: 'Maison / Déco' },
    { id: 'artisanat', label: 'Artisanat' },
    { id: 'epicerie_fine', label: 'Épicerie fine' },
    { id: 'concept_store', label: 'Concept store' },
    { id: 'centre_commercial', label: 'Centre commercial' },
  ],
  rentacar: [
    { id: 'citadine', label: 'Citadine' },
    { id: 'compacte', label: 'Compacte' },
    { id: 'berline', label: 'Berline' },
    { id: 'suv', label: 'SUV' },
    { id: '4x4', label: '4x4' },
    { id: 'monospace', label: 'Monospace' },
    { id: 'utilitaire', label: 'Utilitaire' },
    { id: 'luxe', label: 'Luxe' },
    { id: 'cabriolet', label: 'Cabriolet' },
    { id: 'electrique', label: 'Électrique' },
  ],
};

// ── Subcategories per category ──
const SUBCATEGORIES = {
  // Restaurants
  restaurant: [
    'Afghan','Africain','Afternoon Tea','Algérien','Allemand','Alsacien','Américain','Anglais',
    'Argentin','Asiatique','Auvergnat','Basque','Bouchon lyonnais','Brésilien','Cambodgien',
    'Canadien','Chinois','Colombien','Coréen','Corse','Créole','Crêperie','Cubain','Égyptien',
    'Espagnol','Éthiopien','Français','Franco-belge','Fruits de mer','Fusion','Grec','Hawaïen',
    'Indien','Iranien','Israélien','Italien','Japonais','Latino','Libanais','Marocain',
    'Méditerranéen','Mexicain','Oriental','Pakistanais','Péruvien','Portugais','Provençal',
    'Russe','Savoyard','Scandinave','Steakhouse','Sud-Ouest','Syrien','Thaïlandais','Tunisien',
    'Turc','Vegan','Végétarien','Vénézuélien','Vietnamien',
  ],
  cafe: ['Café classique','Coffee Shop','Salon de thé','Brunch'],
  bar: ['Bar à cocktails','Bar à vins','Pub','Sports Bar'],
  lounge: ['Lounge Bar','Shisha Lounge','Chicha'],
  rooftop: ['Rooftop Bar','Rooftop Restaurant'],
  club: ['Nightclub','Discothèque','Club privé'],
  fastfood: ['Burger','Pizza','Tacos','Snack','Food Truck'],
  patisserie: ['Pâtisserie française','Pâtisserie marocaine','Pâtisserie orientale'],
  glacier: ['Glacier artisanal','Frozen Yogurt'],
  brasserie: ['Brasserie classique','Brasserie moderne'],
  traiteur: ['Traiteur événementiel','Traiteur livraison'],
  // Sport
  hammam: ['Hammam traditionnel','Hammam moderne','Hammam & Spa'],
  spa: ['Spa luxe','Day Spa','Spa hôtel'],
  massage: ['Massage relaxant','Massage sportif','Massage thaï'],
  institut_beaute: ['Soins visage','Soins corps','Épilation','Manucure / Pédicure'],
  coiffure: ['Coiffeur homme','Coiffeur femme','Barber shop'],
  salle_sport: ['Musculation','Fitness','CrossFit','Boxe'],
  yoga_pilates: ['Yoga','Pilates','Méditation'],
  piscine: ['Piscine couverte','Piscine plein air','Aquagym'],
  padel: ['Padel indoor','Padel outdoor'],
  tennis: ['Tennis terre battue','Tennis dur','Tennis indoor'],
  foot5: ['Foot 5 indoor','Foot 5 outdoor'],
  crossfit: ['CrossFit box','Functional training'],
  arts_martiaux: ['Karaté','Judo','Taekwondo','MMA','Boxe thaï'],
  // Loisirs
  escape_game: ['Horreur','Aventure','Enquête','Famille'],
  karting: ['Karting indoor','Karting outdoor'],
  quad_buggy: ['Quad désert','Buggy désert','Quad montagne'],
  jet_ski: ['Jet Ski','Flyboard','Bouée tractée'],
  parachute: ['Parachute','Parapente','Saut à l\'élastique'],
  golf: ['Golf 18 trous','Golf 9 trous','Mini-golf','Practice'],
  bowling: ['Bowling classique','Bowling VIP'],
  laser_game: ['Laser Game indoor','Laser Game outdoor'],
  paintball: ['Paintball indoor','Paintball outdoor'],
  aquapark: ['Parc aquatique','Toboggans','Piscine à vagues'],
  surf_kite: ['Surf','Kitesurf','Windsurf','Stand-up Paddle'],
  equitation: ['Cours d\'équitation','Randonnée équestre','Poney club'],
  parc_attractions: ['Manèges','Parc à thème','Parc aventure'],
  // Hébergement
  hotel: ['1 étoile','2 étoiles','3 étoiles','4 étoiles','5 étoiles','Boutique hôtel'],
  riad: ['Riad traditionnel','Riad de charme','Riad luxe'],
  maison_hotes: ['Maison d\'hôtes de charme','Maison d\'hôtes familiale'],
  appartement: ['Studio','T2','T3','Loft'],
  villa: ['Villa avec piscine','Villa de luxe','Villa familiale'],
  resort: ['Resort balnéaire','Resort montagne','Resort golf'],
  auberge: ['Auberge de jeunesse','Auberge de charme'],
  glamping: ['Tente lodge','Cabane','Yourte','Dôme'],
  // Culture
  musee: ['Musée d\'art','Musée historique','Musée scientifique'],
  monument: ['Monument historique','Site archéologique','Palais'],
  visite_guidee: ['Visite culturelle','Visite gastronomique','Visite nocturne'],
  theatre: ['Théâtre classique','Théâtre contemporain','One-man show'],
  spectacle: ['Spectacle vivant','Spectacle musical','Spectacle de rue'],
  concert: ['Concert live','Concert classique','Festival musique'],
  expo: ['Exposition permanente','Exposition temporaire','Galerie d\'art'],
  atelier: ['Atelier cuisine','Atelier artisanat','Atelier peinture'],
  festival: ['Festival culturel','Festival musique','Festival cinéma'],
  // Shopping
  mode: ['Prêt-à-porter','Haute couture','Streetwear','Vintage'],
  chaussures: ['Chaussures homme','Chaussures femme','Sneakers'],
  beaute: ['Parfumerie','Cosmétiques','Soins naturels'],
  bijoux: ['Bijouterie','Joaillerie','Bijoux fantaisie'],
  maison_deco: ['Décoration','Ameublement','Luminaires'],
  artisanat: ['Artisanat marocain','Tapis','Poterie','Maroquinerie'],
  epicerie_fine: ['Épicerie orientale','Bio','Gourmet'],
  concept_store: ['Concept store mode','Concept store lifestyle'],
  centre_commercial: ['Centre commercial','Galerie marchande','Mall'],
};

// ── Cities ──
const CITIES = [
  'Agadir','Al Hoceima','Béni Mellal','Berkane','Casablanca','Chefchaouen',
  'Dakhla','El Jadida','Errachidia','Essaouira','Fès','Guelmim','Ifrane',
  'Kénitra','Khémisset','Khouribga','Laâyoune','Larache','Marrakech',
  'Meknès','Mohammedia','Nador','Oujda','Ouarzazate','Rabat','Safi',
  'Salé','Settat','Tanger','Tétouan',
];

const CITY_TO_REGION = {
  'Agadir': 'Souss-Massa',
  'Al Hoceima': 'Tanger-Tétouan-Al Hoceima',
  'Béni Mellal': 'Béni Mellal-Khénifra',
  'Berkane': "L'Oriental",
  'Casablanca': 'Casablanca-Settat',
  'Chefchaouen': 'Tanger-Tétouan-Al Hoceima',
  'Dakhla': 'Dakhla-Oued Ed-Dahab',
  'El Jadida': 'Casablanca-Settat',
  'Errachidia': 'Drâa-Tafilalet',
  'Essaouira': 'Marrakech-Safi',
  'Fès': 'Fès-Meknès',
  'Guelmim': 'Guelmim-Oued Noun',
  'Ifrane': 'Fès-Meknès',
  'Kénitra': 'Rabat-Salé-Kénitra',
  'Khémisset': 'Rabat-Salé-Kénitra',
  'Khouribga': 'Béni Mellal-Khénifra',
  'Laâyoune': 'Laâyoune-Sakia El Hamra',
  'Larache': 'Tanger-Tétouan-Al Hoceima',
  'Marrakech': 'Marrakech-Safi',
  'Meknès': 'Fès-Meknès',
  'Mohammedia': 'Casablanca-Settat',
  'Nador': "L'Oriental",
  'Oujda': "L'Oriental",
  'Ouarzazate': 'Drâa-Tafilalet',
  'Rabat': 'Rabat-Salé-Kénitra',
  'Safi': 'Marrakech-Safi',
  'Salé': 'Rabat-Salé-Kénitra',
  'Settat': 'Casablanca-Settat',
  'Tanger': 'Tanger-Tétouan-Al Hoceima',
  'Tétouan': 'Tanger-Tétouan-Al Hoceima',
};

const DAYS_FR = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const DAYS_EN = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SAM Import Template';
  wb.created = new Date();

  // ═══════════════════════════════════════════════
  //  SHEET 1: DONNÉES ÉTABLISSEMENTS (main data)
  // ═══════════════════════════════════════════════
  const ws = wb.addWorksheet('Établissements', {
    properties: { tabColor: { argb: 'FFA3001D' } },
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
  });

  // Header style
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA3001D' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  const sectionFont = { bold: true, color: { argb: 'FF333333' }, size: 10 };
  const requiredFont = { bold: true, color: { argb: 'FFCC0000' }, size: 9 };

  // Define columns
  const columns = [
    // Step 1 — Identité
    { header: 'Nom *', key: 'name', width: 35, step: 1, required: true, note: 'Nom de l\'établissement (min 2 caractères)' },
    { header: 'Univers *', key: 'universe', width: 22, step: 1, required: true, note: 'Voir onglet "Référentiels" pour les valeurs' },
    { header: 'Catégorie', key: 'category', width: 22, step: 1, required: false, note: 'Dépend de l\'univers choisi. Voir onglet "Référentiels"' },
    { header: 'Sous-catégorie', key: 'subcategory', width: 25, step: 1, required: false, note: 'Dépend de la catégorie choisie. Voir onglet "Référentiels"' },
    { header: 'Spécialités', key: 'specialties', width: 40, step: 1, required: false, note: 'Séparées par des virgules. Ex: Marocain, Italien, Sushi' },
    // Step 2 — Localisation
    { header: 'Ville *', key: 'city', width: 18, step: 2, required: true, note: 'Voir onglet "Référentiels" pour les villes' },
    { header: 'Quartier', key: 'neighborhood', width: 20, step: 2, required: false, note: 'Ex: Guéliz, Maârif, Agdal...' },
    { header: 'Code postal', key: 'postal_code', width: 14, step: 2, required: false, note: 'Ex: 40000' },
    { header: 'Adresse *', key: 'address', width: 40, step: 2, required: true, note: 'Adresse complète' },
    { header: 'Latitude *', key: 'lat', width: 14, step: 2, required: true, note: 'Ex: 33.5943 (décimal)' },
    { header: 'Longitude *', key: 'lng', width: 14, step: 2, required: true, note: 'Ex: -7.6700 (décimal)' },
    // Step 3 — Coordonnées
    { header: 'Téléphone *', key: 'phone', width: 18, step: 3, required: true, note: 'Format: +212 6XXXXXXXX ou 06XXXXXXXX' },
    { header: 'WhatsApp', key: 'whatsapp', width: 18, step: 3, required: false, note: 'Format: +212 6XXXXXXXX ou 06XXXXXXXX' },
    { header: 'Email réservation', key: 'booking_email', width: 30, step: 3, required: false, note: 'Email pour recevoir les réservations. CRITIQUE: sans cet email, pas de bouton Réserver' },
    { header: 'Lien Google Maps *', key: 'google_maps_url', width: 45, step: 3, required: true, note: 'URL complète Google Maps' },
    { header: 'Site web', key: 'website', width: 35, step: 3, required: false, note: 'https://www.votre-site.ma' },
    { header: 'Email propriétaire', key: 'owner_email', width: 30, step: 3, required: false, note: 'Email du propriétaire pour créer son compte pro' },
    // Step 4 — Descriptions
    { header: 'Description courte *', key: 'description_short', width: 50, step: 4, required: true, note: 'Max 200 caractères. Utilisée pour le SEO et les cartes.' },
    { header: 'Description longue', key: 'description_long', width: 60, step: 4, required: false, note: 'Max 750 caractères. Description détaillée.' },
    // Step 5 — Médias
    { header: 'URL Logo', key: 'logo_url', width: 40, step: 5, required: false, note: 'URL d\'une image carrée (PNG transparent idéal). Laissez vide pour upload manuel.' },
    { header: 'URL Cover *', key: 'cover_url', width: 40, step: 5, required: false, note: 'URL de l\'image de couverture (16:9). Laissez vide pour upload manuel.' },
    { header: 'URLs Galerie', key: 'gallery_urls', width: 50, step: 5, required: false, note: 'URLs séparées par des virgules (max 12). Laissez vide pour upload manuel.' },
    // Step 6 — Horaires (optionnel)
    ...DAYS_FR.map((day, i) => ({
      header: `${day} - Ouvert?`, key: `${DAYS_EN[i]}_open`, width: 14, step: 6, required: false,
      note: 'OUI ou NON',
    })),
    ...DAYS_FR.map((day, i) => ({
      header: `${day} - Horaires`, key: `${DAYS_EN[i]}_hours`, width: 22, step: 6, required: false,
      note: 'Format: 09:00-23:00 (continu) ou 12:00-15:00,19:00-23:00 (coupure)',
    })),
    // Step 7 — Tags & Extras (optionnel)
    { header: 'Tags ambiance', key: 'ambiance_tags', width: 40, step: 7, required: false, note: 'Séparés par virgules. Ex: Romantique, Familial, Branché' },
    { header: 'Tags généraux', key: 'tags', width: 40, step: 7, required: false, note: 'Séparés par virgules. Ex: Terrasse, Parking, WiFi' },
    { header: 'Équipements', key: 'amenities', width: 40, step: 7, required: false, note: 'Séparés par virgules. Ex: Climatisation, Terrasse, Parking' },
    { header: 'Points forts', key: 'highlights', width: 40, step: 7, required: false, note: 'Séparés par virgules. Ex: Vue exceptionnelle, Chef réputé' },
    { header: 'Instagram', key: 'social_instagram', width: 35, step: 7, required: false, note: 'URL complète Instagram' },
    { header: 'Facebook', key: 'social_facebook', width: 35, step: 7, required: false, note: 'URL complète Facebook' },
    { header: 'TikTok', key: 'social_tiktok', width: 35, step: 7, required: false, note: 'URL complète TikTok' },
    { header: 'Snapchat', key: 'social_snapchat', width: 30, step: 7, required: false, note: 'URL complète Snapchat' },
    { header: 'YouTube', key: 'social_youtube', width: 30, step: 7, required: false, note: 'URL complète YouTube' },
    { header: 'TripAdvisor', key: 'social_tripadvisor', width: 35, step: 7, required: false, note: 'URL complète TripAdvisor' },
  ];

  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));

  // ── Row 1: Step section headers (merged) ──
  ws.spliceRows(1, 0, []);
  const stepRanges = {};
  columns.forEach((col, i) => {
    const colIdx = i + 1;
    if (!stepRanges[col.step]) stepRanges[col.step] = { start: colIdx, end: colIdx };
    else stepRanges[col.step].end = colIdx;
  });

  const stepLabels = {
    1: '① IDENTITÉ',
    2: '② LOCALISATION',
    3: '③ COORDONNÉES',
    4: '④ DESCRIPTIONS',
    5: '⑤ MÉDIAS',
    6: '⑥ HORAIRES (optionnel)',
    7: '⑦ TAGS & EXTRAS (optionnel)',
  };

  const stepColors = {
    1: 'FFA3001D',
    2: 'FF2E7D32',
    3: 'FF1565C0',
    4: 'FF6A1B9A',
    5: 'FFE65100',
    6: 'FF00838F',
    7: 'FF4E342E',
  };

  for (const [step, range] of Object.entries(stepRanges)) {
    const startCol = String.fromCharCode(64 + range.start > 90 ? 0 : 64 + range.start);
    // Use proper column letter conversion for large column numbers
    const getColLetter = (n) => {
      let result = '';
      while (n > 0) {
        n--;
        result = String.fromCharCode(65 + (n % 26)) + result;
        n = Math.floor(n / 26);
      }
      return result;
    };

    if (range.start !== range.end) {
      ws.mergeCells(1, range.start, 1, range.end);
    }
    const cell = ws.getCell(1, range.start);
    cell.value = stepLabels[step];
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: stepColors[step] } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // ── Row 2: Column headers ──
  const headerRow = ws.getRow(2);
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF999999' } },
    };
    // Add comment/note
    if (col.note) {
      cell.note = {
        texts: [{ text: col.note, font: { size: 9 } }],
      };
    }
  });
  headerRow.height = 30;
  ws.getRow(1).height = 28;

  // ── Data validation dropdowns ──
  const universeList = Object.entries(UNIVERSES).map(([k, v]) => v.label).join(',');
  const cityList = CITIES.join(',');

  // Add validation for 100 data rows
  for (let row = 3; row <= 102; row++) {
    // Universe dropdown
    ws.getCell(row, 2).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${universeList}"`],
      showErrorMessage: true,
      errorTitle: 'Univers invalide',
      error: 'Choisissez un univers dans la liste',
    };

    // City dropdown
    ws.getCell(row, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${cityList}"`],
      showErrorMessage: true,
      errorTitle: 'Ville invalide',
      error: 'Choisissez une ville dans la liste',
    };

    // Day open/closed dropdowns
    for (let d = 0; d < 7; d++) {
      const dayOpenCol = columns.findIndex(c => c.key === `${DAYS_EN[d]}_open`) + 1;
      ws.getCell(row, dayOpenCol).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"OUI,NON"'],
      };
    }

    // Alternate row coloring
    if (row % 2 === 1) {
      columns.forEach((_, i) => {
        ws.getCell(row, i + 1).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' },
        };
      });
    }
  }

  // Add example row
  const exampleData = {
    name: 'Le Jardin Secret',
    universe: 'Boire & Manger',
    category: 'restaurant',
    subcategory: 'Marocain',
    specialties: 'Marocain, Méditerranéen, Grillades',
    city: 'Marrakech',
    neighborhood: 'Guéliz',
    postal_code: '40000',
    address: '15 Avenue Mohammed V, Guéliz',
    lat: 31.6295,
    lng: -7.9811,
    phone: '+212 524123456',
    whatsapp: '+212 661234567',
    booking_email: 'reservation@lejardinsecret.ma',
    google_maps_url: 'https://maps.google.com/?cid=12345678901234567',
    website: 'https://www.lejardinsecret.ma',
    owner_email: 'proprietaire@gmail.com',
    description_short: 'Restaurant marocain d\'exception au cœur de Guéliz. Cuisine raffinée, cadre authentique et service irréprochable.',
    description_long: 'Niché au cœur du quartier Guéliz à Marrakech, Le Jardin Secret vous accueille dans un cadre enchanteur alliant tradition marocaine et modernité. Notre chef vous propose une carte variée de spécialités marocaines revisitées avec des produits frais et locaux.',
    logo_url: '',
    cover_url: '',
    gallery_urls: '',
    monday_open: 'OUI', monday_hours: '12:00-15:00,19:00-23:00',
    tuesday_open: 'OUI', tuesday_hours: '12:00-15:00,19:00-23:00',
    wednesday_open: 'OUI', wednesday_hours: '12:00-15:00,19:00-23:00',
    thursday_open: 'OUI', thursday_hours: '12:00-15:00,19:00-23:00',
    friday_open: 'OUI', friday_hours: '12:00-23:30',
    saturday_open: 'OUI', saturday_hours: '12:00-23:30',
    sunday_open: 'NON', sunday_hours: '',
    ambiance_tags: 'Romantique, Terrasse, Vue jardin',
    tags: 'Terrasse, Parking gratuit, WiFi, Climatisé',
    amenities: 'Climatisation, Terrasse, Parking, WiFi gratuit, Accès PMR',
    highlights: 'Vue exceptionnelle, Chef réputé, Produits locaux',
    social_instagram: 'https://instagram.com/lejardinsecret',
    social_facebook: 'https://facebook.com/lejardinsecret',
    social_tiktok: '',
    social_snapchat: '',
    social_youtube: '',
    social_tripadvisor: 'https://tripadvisor.com/Restaurant_Review-lejardinsecret',
  };

  const exRow = ws.getRow(3);
  columns.forEach((col, i) => {
    const cell = exRow.getCell(i + 1);
    cell.value = exampleData[col.key] ?? '';
    cell.font = { italic: true, color: { argb: 'FF888888' }, size: 10 };
  });

  // ═══════════════════════════════════════════════
  //  SHEET 2: RÉFÉRENTIELS (lookup data)
  // ═══════════════════════════════════════════════
  const refWs = wb.addWorksheet('Référentiels', {
    properties: { tabColor: { argb: 'FF1565C0' } },
  });

  const refHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1565C0' } };
  const refHeaderFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };

  // Section 1: Univers
  let refRow = 1;
  const addRefHeader = (title, colSpan = 3) => {
    refWs.mergeCells(refRow, 1, refRow, colSpan);
    const cell = refWs.getCell(refRow, 1);
    cell.value = title;
    cell.fill = refHeaderFill;
    cell.font = refHeaderFont;
    cell.alignment = { horizontal: 'center' };
    refRow++;
  };

  const addSubHeader = (headers) => {
    headers.forEach((h, i) => {
      const cell = refWs.getCell(refRow, i + 1);
      cell.value = h;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
      cell.font = { bold: true, size: 10 };
    });
    refRow++;
  };

  // Univers
  addRefHeader('UNIVERS', 3);
  addSubHeader(['Valeur à saisir', 'Valeur base de données', 'Description']);
  refWs.getColumn(1).width = 25;
  refWs.getColumn(2).width = 25;
  refWs.getColumn(3).width = 40;

  for (const [key, val] of Object.entries(UNIVERSES)) {
    refWs.getCell(refRow, 1).value = val.label;
    refWs.getCell(refRow, 2).value = val.db;
    refWs.getCell(refRow, 3).value = `Wizard: ${key}`;
    refRow++;
  }
  refRow++;

  // Villes
  addRefHeader('VILLES', 3);
  addSubHeader(['Ville', 'Région (auto)', '']);
  for (const city of CITIES) {
    refWs.getCell(refRow, 1).value = city;
    refWs.getCell(refRow, 2).value = CITY_TO_REGION[city] || '';
    refRow++;
  }
  refRow++;

  // Catégories par univers
  for (const [univKey, cats] of Object.entries(CATEGORIES)) {
    const univLabel = UNIVERSES[univKey]?.label || univKey;
    addRefHeader(`CATÉGORIES — ${univLabel}`, 3);
    addSubHeader(['Valeur catégorie', 'Label', 'Sous-catégories disponibles']);
    for (const cat of cats) {
      refWs.getCell(refRow, 1).value = cat.id;
      refWs.getCell(refRow, 2).value = cat.label;
      const subs = SUBCATEGORIES[cat.id];
      refWs.getCell(refRow, 3).value = subs ? subs.join(', ') : '(aucune)';
      refWs.getCell(refRow, 3).alignment = { wrapText: true };
      refRow++;
    }
    refRow++;
  }

  // ═══════════════════════════════════════════════
  //  SHEET 3: INSTRUCTIONS
  // ═══════════════════════════════════════════════
  const instrWs = wb.addWorksheet('Instructions', {
    properties: { tabColor: { argb: 'FF4CAF50' } },
  });

  instrWs.getColumn(1).width = 80;

  const instructions = [
    { text: 'TEMPLATE D\'IMPORT — ÉTABLISSEMENTS SAM.MA', style: 'title' },
    { text: '' },
    { text: 'COMMENT REMPLIR CE FICHIER', style: 'section' },
    { text: '' },
    { text: '1. Remplissez l\'onglet "Établissements" — une ligne par établissement' },
    { text: '2. La ligne 3 contient un exemple (en italique gris) — supprimez-la avant import' },
    { text: '3. Les colonnes marquées * sont obligatoires' },
    { text: '4. Consultez l\'onglet "Référentiels" pour les valeurs acceptées' },
    { text: '' },
    { text: 'CHAMPS OBLIGATOIRES', style: 'section' },
    { text: '' },
    { text: '  Étape 1 — Identité :  Nom, Univers' },
    { text: '  Étape 2 — Localisation :  Ville, Adresse, Latitude, Longitude' },
    { text: '  Étape 3 — Coordonnées :  Téléphone, Lien Google Maps' },
    { text: '  Étape 4 — Descriptions :  Description courte (max 200 car.)' },
    { text: '  Étape 5 — Médias :  Laissez vide (upload manuel après import)' },
    { text: '  Étape 6 — Horaires :  Optionnel. OUI/NON + format horaires' },
    { text: '  Étape 7 — Tags :  Optionnel. Valeurs séparées par virgules' },
    { text: '' },
    { text: 'FORMAT DES HORAIRES', style: 'section' },
    { text: '' },
    { text: '  Colonne "Ouvert?" :  OUI ou NON' },
    { text: '  Colonne "Horaires" :' },
    { text: '    • Service continu :  09:00-23:00' },
    { text: '    • Avec coupure :    12:00-15:00,19:00-23:00' },
    { text: '    • Laissez vide si "NON" dans la colonne Ouvert' },
    { text: '' },
    { text: 'FORMAT DES LISTES (spécialités, tags, etc.)', style: 'section' },
    { text: '' },
    { text: '  Séparez les valeurs par des virgules :' },
    { text: '  Ex: Marocain, Italien, Japonais' },
    { text: '  Ex: Terrasse, Parking, WiFi, Climatisé' },
    { text: '' },
    { text: 'UNIVERS — VALEURS ACCEPTÉES', style: 'section' },
    { text: '' },
    { text: '  Boire & Manger  →  restaurants (DB: restaurant)' },
    { text: '  Sport & Bien-être  →  sport (DB: wellness)' },
    { text: '  Loisirs  →  loisirs (DB: loisir)' },
    { text: '  Hébergement  →  hebergement (DB: hebergement)' },
    { text: '  Culture  →  culture (DB: culture)' },
    { text: '  Shopping  →  shopping (DB: shopping)' },
    { text: '  Location de véhicules  →  rentacar (DB: rentacar)' },
    { text: '' },
    { text: 'COORDONNÉES GPS', style: 'section' },
    { text: '' },
    { text: '  Pour trouver les coordonnées :' },
    { text: '  1. Allez sur Google Maps' },
    { text: '  2. Clic droit sur l\'emplacement' },
    { text: '  3. Copiez les coordonnées (lat, lng)' },
    { text: '  4. Latitude = premier nombre (ex: 33.5943)' },
    { text: '  5. Longitude = second nombre (ex: -7.6700)' },
    { text: '' },
    { text: 'IMAGES / MÉDIAS', style: 'section' },
    { text: '' },
    { text: '  Les colonnes URL Logo, URL Cover et URLs Galerie sont optionnelles.' },
    { text: '  Vous pouvez :', },
    { text: '  • Laisser vide et uploader manuellement après import via le wizard' },
    { text: '  • Fournir des URLs publiques d\'images existantes' },
    { text: '' },
    { text: 'APRÈS LE REMPLISSAGE', style: 'section' },
    { text: '' },
    { text: '  1. Supprimez la ligne d\'exemple (ligne 3)' },
    { text: '  2. Vérifiez que tous les champs obligatoires (*) sont remplis' },
    { text: '  3. Envoyez le fichier — l\'import sera effectué par script' },
  ];

  instructions.forEach((line, i) => {
    const cell = instrWs.getCell(i + 1, 1);
    cell.value = line.text;
    if (line.style === 'title') {
      cell.font = { bold: true, size: 16, color: { argb: 'FFA3001D' } };
    } else if (line.style === 'section') {
      cell.font = { bold: true, size: 12, color: { argb: 'FF1565C0' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    } else {
      cell.font = { size: 11 };
    }
  });

  // ═══════════════════════════════════════════════
  //  SAVE
  // ═══════════════════════════════════════════════
  await wb.xlsx.writeFile(OUTPUT);
  console.log(`✅ Template Excel créé: ${OUTPUT}`);
  console.log(`   → ${columns.length} colonnes`);
  console.log(`   → 3 onglets: Établissements, Référentiels, Instructions`);
  console.log(`   → Dropdowns: Univers, Ville, Ouvert (OUI/NON)`);
  console.log(`   → 100 lignes de données disponibles`);
}

main().catch(console.error);
