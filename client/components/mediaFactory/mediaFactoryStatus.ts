export type MediaJobStatus =
  | "paid_created"
  | "brief_pending"
  | "brief_submitted"
  | "brief_approved"
  | "scheduling"
  | "shoot_confirmed"
  | "checkin_pending"
  | "deliverables_expected"
  | "deliverables_submitted"
  | "deliverables_approved"
  | "editing"
  | "ready_delivery"
  | "scheduled_publish"
  | "delivered"
  | "closed"
  | (string & {});

export type MediaDeliverableStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | (string & {});

export type MediaJobStep = {
  key: MediaJobStatus;
  label: string;
};

export const MEDIA_JOB_STEPS: MediaJobStep[] = [
  { key: "paid_created", label: "Payé" },
  { key: "brief_pending", label: "Brief" },
  { key: "brief_submitted", label: "Brief soumis" },
  { key: "brief_approved", label: "Brief validé" },
  { key: "scheduling", label: "Planification" },
  { key: "shoot_confirmed", label: "Shooting" },
  { key: "checkin_pending", label: "Check-in" },
  { key: "deliverables_expected", label: "Livrables" },
  { key: "deliverables_submitted", label: "Soumis" },
  { key: "deliverables_approved", label: "Validé" },
  { key: "editing", label: "Montage" },
  { key: "ready_delivery", label: "Prêt" },
  { key: "scheduled_publish", label: "Publication" },
  { key: "delivered", label: "Livré" },
  { key: "closed", label: "Clôturé" },
];

export function mediaJobStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").trim();
  if (!s) return "—";
  const found = MEDIA_JOB_STEPS.find((x) => x.key === s);
  if (found) return found.label;
  return s;
}

export function mediaJobStatusBadgeClass(
  status: string | null | undefined,
): string {
  const s = (status ?? "").trim();
  if (!s) return "bg-slate-100 text-slate-700 border-slate-200";

  if (s === "paid_created")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "brief_pending")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "brief_submitted")
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "brief_approved")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "scheduling") return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "shoot_confirmed")
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "checkin_pending")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "deliverables_expected")
    return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "deliverables_submitted")
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "deliverables_approved")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "editing") return "bg-purple-50 text-purple-700 border-purple-200";
  if (s === "ready_delivery")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "scheduled_publish")
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "delivered")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "closed") return "bg-slate-200 text-slate-700 border-slate-300";

  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function mediaDeliverableStatusLabel(
  status: string | null | undefined,
): string {
  const s = (status ?? "").trim();
  if (!s) return "—";
  if (s === "not_started") return "Non démarré";
  if (s === "in_progress") return "En cours";
  if (s === "submitted") return "Soumis";
  if (s === "in_review") return "En revue";
  if (s === "approved") return "Validé";
  if (s === "rejected") return "Refusé";
  return s;
}

export function mediaDeliverableStatusBadgeClass(
  status: string | null | undefined,
): string {
  const s = (status ?? "").trim();
  if (!s) return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "not_started")
    return "bg-slate-100 text-slate-700 border-slate-200";
  if (s === "in_progress") return "bg-amber-50 text-amber-800 border-amber-200";
  if (s === "submitted") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "in_review")
    return "bg-purple-50 text-purple-700 border-purple-200";
  if (s === "approved")
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "rejected") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function mediaJobStepIndex(status: string | null | undefined): number {
  const s = (status ?? "").trim();
  const idx = MEDIA_JOB_STEPS.findIndex((x) => x.key === s);
  return idx >= 0 ? idx : 0;
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ---------------------------------------------------------------------------
// Smart Brief Templates par Univers - Formulaires Complets PRO
// ---------------------------------------------------------------------------

export type UniverseType =
  | "restaurant"
  | "hebergement"
  | "wellness"
  | "loisir"
  | "culture"
  | "shopping"
  | "sport_bien_etre"
  | "default";

export type BriefFieldTemplate = {
  key: string;
  label: string;
  hint: string;
  type: "text" | "textarea" | "select" | "multiselect" | "checkbox" | "date" | "url" | "file" | "number";
  options?: string[];
  required?: boolean;
  section?: string;
  icon?: string;
  accept?: string; // Pour les fichiers
  multiple?: boolean; // Pour les fichiers
};

export type BriefSectionTemplate = {
  key: string;
  title: string;
  icon: string;
  description?: string;
};

export type UniverseBriefTemplate = {
  universe: UniverseType;
  label: string;
  description: string;
  sections: BriefSectionTemplate[];
  fields: BriefFieldTemplate[];
};

// ---------------------------------------------------------------------------
// RESTAURANT - Formulaire Complet
// ---------------------------------------------------------------------------
const RESTAURANT_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "restaurant",
  label: "Restaurant",
  description: "Capturer l'ambiance, les plats signatures et l'expérience culinaire",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "unique", title: "4️⃣ Ce qui vous rend unique", icon: "⭐" },
    { key: "technique", title: "5️⃣ Informations techniques (livraison)", icon: "📦" },
    { key: "offre", title: "6️⃣ Offre ou avantage à mettre en avant", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web (si existant)", hint: "https://...", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "facebook", label: "Facebook", hint: "URL de la page", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Numéro de téléphone", hint: "+212...", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "Ex: Lun-Sam 12h-23h", type: "text", required: true, section: "general", icon: "🕒" },
    { key: "parking_disponible", label: "Parking disponible ?", hint: "", type: "select", options: ["Oui - Gratuit", "Oui - Payant", "Non"], section: "general", icon: "🅿️" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "Vous pouvez sélectionner plusieurs options", type: "multiselect", options: ["Présentation globale", "Mise en avant d'un plat ou d'une recette", "Offre promotionnelle", "Nouveauté (ouverture, nouvelle carte, nouveau chef…)", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "nature_video_autre", label: "Si autre, précisez", hint: "", type: "text", section: "contexte" },
    { key: "urgence_promo", label: "Y a-t-il une urgence ou un timing lié à une promo ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, dates exactes de validité", hint: "Ex: Du 15 au 30 janvier", type: "text", section: "contexte" },

    // SECTION 3: Positionnement & Storytelling
    { key: "definition_etablissement", label: "En une phrase, comment définiriez-vous votre établissement ?", hint: "Ex: 'Restaurant gastro marocain modernisé' / 'Street food premium halal' / 'Brunch & coffee house cosy'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Quel message principal souhaitez-vous transmettre ?", hint: "Ex: qualité des produits, rapidité, authenticité, prix attractifs, ambiance…", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs qui décrivent votre établissement", hint: "Sélectionnez jusqu'à 3 options", type: "multiselect", options: ["Familial", "Premium", "Romantique", "Branché", "Street food", "Accessible", "Ambiance festive", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "adjectifs_autre", label: "Si autre, précisez", hint: "", type: "text", section: "positionnement" },

    // SECTION 4: Ce qui vous rend unique
    { key: "signatures_carte", label: "Signature(s) de la carte", hint: "Plat star, recette maison, spécialité régionale…", type: "textarea", required: true, section: "unique", icon: "🍽" },
    { key: "nom_chef", label: "Nom du chef (optionnel)", hint: "", type: "text", section: "unique", icon: "🧑‍🍳" },
    { key: "produits_maison", label: "Produits maison ou importés", hint: "Pain maison, viande maturée, four spécial, machine premium, origine produit…", type: "textarea", section: "unique", icon: "📦" },
    { key: "public_cible", label: "Public cible", hint: "Sélectionnez vos cibles principales", type: "multiselect", options: ["Familles", "Jeunes", "Touristes", "Étudiants", "Professionnels", "Haut de gamme", "Autre"], required: true, section: "unique", icon: "👥" },
    { key: "public_cible_autre", label: "Si autre, précisez", hint: "", type: "text", section: "unique" },

    // SECTION 5: Informations techniques (livraison)
    { key: "plateformes_livraison", label: "Plateformes utilisées", hint: "Sélectionnez vos plateformes", type: "multiselect", options: ["Glovo", "Kooul", "Yassir", "Done", "Kaalix", "Nos livreurs", "Pas de livraison", "Autre"], section: "technique", icon: "🚴" },
    { key: "plateforme_autre", label: "Si autre, précisez", hint: "", type: "text", section: "technique" },
    { key: "delai_livraison", label: "Délai moyen de livraison constaté", hint: "Ex: 30-45 min", type: "text", section: "technique", icon: "⏱️" },
    { key: "packaging", label: "Packaging", hint: "Sélectionnez les caractéristiques", type: "multiselect", options: ["Premium", "Classique", "Recyclable", "Personnalisé avec logo", "Couverts inclus", "Couverts non inclus"], section: "technique", icon: "📦" },
    { key: "extras_inclus", label: "Y a-t-il des sauces, desserts ou boissons inclus/es ?", hint: "", type: "textarea", section: "technique", icon: "🎁" },

    // SECTION 6: Offre ou avantage
    { key: "promotion_en_cours", label: "Promotion en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description précise + dates", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif Sortir Au Maroc ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "Ex: SAM20 = -20% ou -50 MAD", type: "text", section: "offre" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Quel style souhaitez-vous ?", hint: "Plusieurs choix possibles", type: "multiselect", options: ["Fun & punchy", "Sérieux & premium", "Familier & street", "Storytelling & émotion", "Court & impactant", "Long & explicatif", "Surprenant / humour", "Autre"], required: true, section: "voix_off", icon: "🎙️" },
    { key: "style_voix_off_autre", label: "Si autre, précisez", hint: "", type: "text", section: "voix_off" },

    // SECTION 8: Informations complémentaires
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Phrases obligatoires, slogan, awards, labels, halal, vegan, sans gluten, etc.", type: "textarea", section: "complementaire", icon: "📝" },

    // SECTION 9: Validation finale
    { key: "autorisation_adaptation", label: "Acceptez-vous que Sortir Au Maroc adapte, reformule ou améliore votre brief ?", hint: "Pour une meilleure performance commerciale", type: "select", options: ["Oui, totalement", "Oui mais validation avant publication", "Non, respect strict du texte"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_etablissement", label: "3 photos de votre établissement", hint: "Format JPG/PNG, max 10MB par fichier", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_plats", label: "3 photos des plats phares", hint: "Format JPG/PNG, max 10MB par fichier", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "🍽️" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes (Instagram, YouTube, TikTok)", hint: "Optionnel - pour nous inspirer", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// HEBERGEMENT (Hôtel, Riad, Lodge) - Formulaire Complet
// ---------------------------------------------------------------------------
const HEBERGEMENT_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "hebergement",
  label: "Hôtel / Riad / Hébergement",
  description: "Valoriser les chambres, espaces communs et services hôteliers",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "unique", title: "4️⃣ Ce qui vous rend unique", icon: "⭐" },
    { key: "chambres", title: "5️⃣ Chambres & Hébergement", icon: "🛏️" },
    { key: "services", title: "6️⃣ Services & Équipements", icon: "🏊" },
    { key: "offre", title: "7️⃣ Offre ou avantage à mettre en avant", icon: "🎁" },
    { key: "voix_off", title: "8️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "9️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "🔟 Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_hebergement", label: "Type d'hébergement", hint: "", type: "select", options: ["Hôtel 5*", "Hôtel 4*", "Hôtel 3*", "Riad", "Maison d'hôtes", "Lodge", "Villa", "Appartement de luxe", "Autre"], required: true, section: "general", icon: "🏨" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "ville", label: "Ville", hint: "", type: "text", required: true, section: "general", icon: "🌆" },
    { key: "site_web", label: "Site web", hint: "https://...", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "facebook", label: "Facebook", hint: "URL de la page", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Numéro de téléphone", hint: "+212...", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "email_reservation", label: "Email réservation", hint: "", type: "text", section: "general", icon: "📧" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "Vous pouvez sélectionner plusieurs options", type: "multiselect", options: ["Présentation globale de l'établissement", "Focus sur une catégorie de chambres", "Mise en avant du Spa/Wellness", "Mise en avant du restaurant", "Offre promotionnelle / Package", "Événement spécial (mariage, séminaire)", "Nouveauté (rénovation, nouvelle aile)", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "nature_video_autre", label: "Si autre, précisez", hint: "", type: "text", section: "contexte" },
    { key: "urgence_promo", label: "Y a-t-il une urgence ou un timing lié à une promo ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, dates exactes de validité", hint: "Ex: Offre Saint-Valentin du 10 au 14 février", type: "text", section: "contexte" },

    // SECTION 3: Positionnement & Storytelling
    { key: "definition_etablissement", label: "En une phrase, comment définiriez-vous votre établissement ?", hint: "Ex: 'Riad de charme au cœur de la médina' / 'Resort all-inclusive face à l'océan' / 'Boutique-hôtel design & eco-friendly'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Quel message principal souhaitez-vous transmettre ?", hint: "Ex: luxe accessible, authenticité marocaine, vue exceptionnelle, service personnalisé, retraite zen…", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs qui décrivent votre établissement", hint: "Sélectionnez jusqu'à 3 options", type: "multiselect", options: ["Luxueux", "Authentique", "Romantique", "Familial", "Branché / Design", "Zen / Relaxant", "Historique / Patrimoine", "Éco-responsable", "All-inclusive", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "adjectifs_autre", label: "Si autre, précisez", hint: "", type: "text", section: "positionnement" },

    // SECTION 4: Ce qui vous rend unique
    { key: "atouts_majeurs", label: "Vos 3 atouts majeurs", hint: "Ce qui vous différencie de la concurrence", type: "textarea", required: true, section: "unique", icon: "💎" },
    { key: "vue_exceptionnelle", label: "Vue exceptionnelle ?", hint: "Mer, montagne, médina, jardin, piscine…", type: "text", section: "unique", icon: "🌅" },
    { key: "histoire_lieu", label: "Histoire du lieu (si pertinent)", hint: "Ex: Ancien palais du 18ème siècle, architecture Art Déco…", type: "textarea", section: "unique", icon: "📜" },
    { key: "public_cible", label: "Public cible", hint: "Sélectionnez vos cibles principales", type: "multiselect", options: ["Couples / Lune de miel", "Familles", "Voyageurs d'affaires", "Groupes / Séminaires", "Touristes internationaux", "Clientèle locale premium", "Influenceurs / Célébrités", "Autre"], required: true, section: "unique", icon: "👥" },
    { key: "public_cible_autre", label: "Si autre, précisez", hint: "", type: "text", section: "unique" },

    // SECTION 5: Chambres & Hébergement
    { key: "categories_chambres", label: "Catégories de chambres à filmer", hint: "Listez les types de chambres/suites disponibles", type: "textarea", required: true, section: "chambres", icon: "🛏️" },
    { key: "chambre_signature", label: "Suite/Chambre signature", hint: "Votre chambre la plus exceptionnelle", type: "text", section: "chambres", icon: "👑" },
    { key: "capacite_totale", label: "Capacité totale", hint: "Nombre de chambres/suites", type: "text", section: "chambres", icon: "🔢" },
    { key: "equipements_chambre", label: "Équipements remarquables des chambres", hint: "Jacuzzi privé, terrasse, cheminée, vue panoramique…", type: "textarea", section: "chambres", icon: "✨" },

    // SECTION 6: Services & Équipements
    { key: "services_disponibles", label: "Services disponibles", hint: "Sélectionnez tous les services", type: "multiselect", options: ["Piscine", "Spa / Hammam", "Restaurant gastronomique", "Bar / Lounge", "Room service 24h", "Conciergerie", "Transfert aéroport", "Parking privé", "Salle de fitness", "Kids club", "Business center", "Événements / Mariages", "Autre"], section: "services", icon: "🏊" },
    { key: "services_autre", label: "Autres services", hint: "", type: "text", section: "services" },
    { key: "restaurant_details", label: "Détails restaurant(s)", hint: "Nom, type de cuisine, chef…", type: "textarea", section: "services", icon: "🍽️" },
    { key: "spa_details", label: "Détails Spa (si applicable)", hint: "Soins signatures, hammam traditionnel…", type: "textarea", section: "services", icon: "💆" },

    // SECTION 7: Offre ou avantage
    { key: "promotion_en_cours", label: "Offre/Package en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description précise + dates", hint: "Ex: Package Romance: Chambre + Dîner + Spa à partir de 2500 MAD", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif Sortir Au Maroc ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "Ex: SAMHOTEL = -15% ou petit-déjeuner offert", type: "text", section: "offre" },
    { key: "prix_a_partir", label: "Prix \"à partir de\" (optionnel)", hint: "Ex: À partir de 800 MAD/nuit", type: "text", section: "offre", icon: "💰" },

    // SECTION 8: Ton de la voix off
    { key: "style_voix_off", label: "Quel style souhaitez-vous ?", hint: "Plusieurs choix possibles", type: "multiselect", options: ["Luxueux & raffiné", "Chaleureux & accueillant", "Moderne & dynamique", "Storytelling & émotion", "Zen & apaisant", "Court & impactant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },
    { key: "style_voix_off_autre", label: "Si autre, précisez", hint: "", type: "text", section: "voix_off" },

    // SECTION 9: Informations complémentaires
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Phrases obligatoires, récompenses (TripAdvisor, Booking), labels (Green Key, Clef Verte), certifications…", type: "textarea", section: "complementaire", icon: "📝" },
    { key: "meilleur_moment_journee", label: "Meilleur moment de la journée pour filmer", hint: "Ex: Matin pour la lumière, service du soir pour l'ambiance…", type: "text", section: "complementaire", icon: "🌅" },

    // SECTION 10: Validation finale
    { key: "autorisation_adaptation", label: "Acceptez-vous que Sortir Au Maroc adapte, reformule ou améliore votre brief ?", hint: "Pour une meilleure performance commerciale", type: "select", options: ["Oui, totalement", "Oui mais validation avant publication", "Non, respect strict du texte"], required: true, section: "validation", icon: "✅" },

    // SECTION 11: Upload
    { key: "photos_etablissement", label: "Photos de l'établissement (extérieur, lobby, espaces communs)", hint: "Format JPG/PNG, max 10MB par fichier", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_chambres", label: "Photos des chambres/suites", hint: "Format JPG/PNG, max 10MB par fichier", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "🛏️" },
    { key: "photos_services", label: "Photos des services (piscine, spa, restaurant)", hint: "Format JPG/PNG, max 10MB par fichier", type: "file", accept: "image/*", multiple: true, section: "upload", icon: "🏊" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes (Instagram, YouTube, TikTok)", hint: "Optionnel - pour nous inspirer", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// WELLNESS / SPA - Formulaire Complet
// ---------------------------------------------------------------------------
const WELLNESS_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "wellness",
  label: "Wellness / Spa / Hammam",
  description: "Créer une atmosphère zen et mettre en valeur les soins proposés",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "soins", title: "4️⃣ Soins & Prestations", icon: "💆" },
    { key: "espaces", title: "5️⃣ Espaces & Ambiance", icon: "🏛️" },
    { key: "offre", title: "6️⃣ Offre ou avantage à mettre en avant", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_etablissement", label: "Type d'établissement", hint: "", type: "select", options: ["Spa d'hôtel", "Spa indépendant", "Hammam traditionnel", "Centre de bien-être", "Institut de beauté premium", "Autre"], required: true, section: "general", icon: "🏛️" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web", hint: "https://...", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "@votrecompte", type: "url", section: "general", icon: "📱" },
    { key: "facebook", label: "Facebook", hint: "URL de la page", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Numéro de téléphone", hint: "+212...", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", required: true, section: "general", icon: "🕒" },
    { key: "reservation_obligatoire", label: "Réservation obligatoire ?", hint: "", type: "select", options: ["Oui", "Non", "Recommandée"], section: "general", icon: "📅" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation globale du spa", "Focus sur un soin signature", "Ambiance & atmosphère", "Offre promotionnelle", "Nouveauté (nouveau soin, rénovation)", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "nature_video_autre", label: "Si autre, précisez", hint: "", type: "text", section: "contexte" },
    { key: "urgence_promo", label: "Timing lié à une promo ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, dates exactes", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement & Storytelling
    { key: "definition_etablissement", label: "En une phrase, définissez votre spa", hint: "Ex: 'Hammam traditionnel aux rituels ancestraux' / 'Spa de luxe aux soins sur-mesure' / 'Oasis de bien-être au cœur de la ville'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal à transmettre", hint: "Ex: évasion sensorielle, authenticité marocaine, expertise des praticiens, produits naturels…", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs décrivant votre spa", hint: "", type: "multiselect", options: ["Zen", "Luxueux", "Authentique / Traditionnel", "Moderne", "Intimiste", "Régénérant", "Premium", "Nature / Bio", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "adjectifs_autre", label: "Si autre, précisez", hint: "", type: "text", section: "positionnement" },
    { key: "public_cible", label: "Public cible", hint: "", type: "multiselect", options: ["Femmes", "Hommes", "Couples", "Groupes (EVJF, anniversaires)", "Touristes", "Clientèle locale premium", "Autre"], required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Soins & Prestations
    { key: "soins_signatures", label: "Soins signatures à mettre en avant", hint: "Vos 3-5 soins phares", type: "textarea", required: true, section: "soins", icon: "💆" },
    { key: "rituels_specifiques", label: "Rituels spécifiques", hint: "Hammam traditionnel, gommage au savon noir, enveloppement…", type: "textarea", section: "soins", icon: "🧖" },
    { key: "produits_utilises", label: "Produits utilisés", hint: "Marques, produits naturels, huile d'argan, savon noir artisanal…", type: "textarea", section: "soins", icon: "🧴" },
    { key: "duree_soins", label: "Durée des soins principaux", hint: "Ex: Hammam 1h30, Massage 1h", type: "text", section: "soins", icon: "⏱️" },
    { key: "equipe_praticiens", label: "Équipe de praticiens", hint: "Nombre, spécialités, formations…", type: "textarea", section: "soins", icon: "👩‍⚕️" },

    // SECTION 5: Espaces & Ambiance
    { key: "espaces_disponibles", label: "Espaces disponibles", hint: "", type: "multiselect", options: ["Hammam traditionnel", "Salle de repos", "Jacuzzi", "Sauna", "Piscine chauffée", "Cabines de soins", "Salon de thé", "Terrasse", "Autre"], section: "espaces", icon: "🏛️" },
    { key: "espaces_autre", label: "Autres espaces", hint: "", type: "text", section: "espaces" },
    { key: "ambiance_souhaitee", label: "Ambiance à transmettre", hint: "", type: "select", options: ["Zen & méditative", "Luxueuse & raffinée", "Orientale & chaleureuse", "Moderne & épurée", "Nature & cocooning"], section: "espaces", icon: "✨" },
    { key: "elements_decoratifs", label: "Éléments décoratifs remarquables", hint: "Zellige, fontaine, bougies, architecture…", type: "textarea", section: "espaces", icon: "🎨" },

    // SECTION 6: Offre ou avantage
    { key: "promotion_en_cours", label: "Offre/Forfait en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description + dates", hint: "Ex: Forfait Détente 2h = 600 MAD au lieu de 800", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif Sortir Au Maroc ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },
    { key: "prix_a_partir", label: "Prix \"à partir de\" (optionnel)", hint: "", type: "text", section: "offre", icon: "💰" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off souhaité", hint: "", type: "multiselect", options: ["Zen & apaisant", "Luxueux & raffiné", "Chaleureux & invitant", "Storytelling sensoriel", "Court & impactant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },
    { key: "style_voix_off_autre", label: "Si autre, précisez", hint: "", type: "text", section: "voix_off" },

    // SECTION 8: Informations complémentaires
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Récompenses, labels, certifications bio, contre-indications à mentionner…", type: "textarea", section: "complementaire", icon: "📝" },
    { key: "figurants", label: "Figurants disponibles ?", hint: "Clients/modèles pour les prises de vue soins", type: "select", options: ["Oui, nous fournissons", "Non, SAM doit fournir", "À discuter"], section: "complementaire", icon: "👤" },

    // SECTION 9: Validation finale
    { key: "autorisation_adaptation", label: "Acceptez-vous l'adaptation par SAM ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_etablissement", label: "Photos des espaces", hint: "Hammam, cabines, salon de repos…", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_soins", label: "Photos des soins/produits", hint: "", type: "file", accept: "image/*", multiple: true, section: "upload", icon: "💆" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// LOISIRS / ACTIVITÉS - Formulaire Complet
// ---------------------------------------------------------------------------
const LOISIR_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "loisir",
  label: "Loisirs / Activités",
  description: "Capturer l'action, l'émotion et le fun des activités proposées",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "activites", title: "4️⃣ Activités à filmer", icon: "🎢" },
    { key: "pratique", title: "5️⃣ Informations pratiques", icon: "📋" },
    { key: "offre", title: "6️⃣ Offre ou avantage", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement/activité", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_activite", label: "Type d'activité", hint: "", type: "select", options: ["Parc d'attractions", "Karting", "Quad / Buggy", "Sports nautiques", "Parapente / Vol", "Escape Game", "Bowling / Laser Game", "Accrobranche", "Paintball / Airsoft", "Parc aquatique", "Zoo / Parc animalier", "Autre"], required: true, section: "general", icon: "🎢" },
    { key: "adresse_exacte", label: "Adresse / Lieu exact", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web", hint: "", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "facebook", label: "Facebook", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Téléphone", hint: "", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", required: true, section: "general", icon: "🕒" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation globale", "Focus sur une activité phare", "Ambiance & fun", "Offre promotionnelle", "Nouveauté (nouvelle attraction)", "Team building / Groupes", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "nature_video_autre", label: "Si autre, précisez", hint: "", type: "text", section: "contexte" },
    { key: "urgence_promo", label: "Timing lié à une promo/saison ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, précisez", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement & Storytelling
    { key: "definition_etablissement", label: "En une phrase, définissez votre activité", hint: "Ex: 'L'adrénaline à l'état pur' / 'Le fun en famille' / 'L'aventure au Maroc'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal", hint: "Ex: sensations fortes, convivialité, nature, sécurité…", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs", hint: "", type: "multiselect", options: ["Fun", "Adrénaline", "Familial", "Nature", "Sportif", "Convivial", "Unique", "Accessible à tous", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "public_cible", label: "Public cible", hint: "", type: "multiselect", options: ["Familles avec enfants", "Adolescents", "Groupes d'amis", "Couples", "Entreprises / Team building", "Touristes", "Autre"], required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Activités à filmer
    { key: "activites_principales", label: "Activités principales à filmer", hint: "Listez les 3-5 activités phares", type: "textarea", required: true, section: "activites", icon: "🎢" },
    { key: "activite_signature", label: "Activité signature", hint: "L'activité la plus impressionnante/unique", type: "text", section: "activites", icon: "👑" },
    { key: "moments_forts", label: "Moments forts à capturer", hint: "Ex: départ, action, arrivée, célébration, réactions…", type: "textarea", section: "activites", icon: "📸" },
    { key: "niveau_difficulte", label: "Niveaux de difficulté proposés", hint: "", type: "multiselect", options: ["Débutant / Famille", "Intermédiaire", "Confirmé / Expert", "Tous niveaux"], section: "activites", icon: "📊" },

    // SECTION 5: Informations pratiques
    { key: "age_minimum", label: "Âge minimum", hint: "Ex: À partir de 7 ans", type: "text", section: "pratique", icon: "👶" },
    { key: "duree_activite", label: "Durée moyenne de l'activité", hint: "", type: "text", section: "pratique", icon: "⏱️" },
    { key: "equipement_fourni", label: "Équipement fourni ?", hint: "Casques, gilets, combinaisons…", type: "textarea", section: "pratique", icon: "🦺" },
    { key: "reservation_obligatoire", label: "Réservation obligatoire ?", hint: "", type: "select", options: ["Oui", "Non", "Recommandée"], section: "pratique", icon: "📅" },
    { key: "parking", label: "Parking disponible ?", hint: "", type: "select", options: ["Oui - Gratuit", "Oui - Payant", "Non"], section: "pratique", icon: "🅿️" },
    { key: "restauration", label: "Restauration sur place ?", hint: "", type: "select", options: ["Oui", "Non", "Snacks/Boissons"], section: "pratique", icon: "🍔" },

    // SECTION 6: Offre ou avantage
    { key: "promotion_en_cours", label: "Offre en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description + dates", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif SAM ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },
    { key: "prix_a_partir", label: "Prix \"à partir de\"", hint: "", type: "text", section: "offre", icon: "💰" },
    { key: "formules_groupes", label: "Formules groupes / Team building", hint: "", type: "textarea", section: "offre", icon: "👥" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off", hint: "", type: "multiselect", options: ["Fun & dynamique", "Adrénaline & action", "Familial & rassurant", "Storytelling aventure", "Court & percutant", "Humour", "Autre"], required: true, section: "voix_off", icon: "🎙️" },

    // SECTION 8: Informations complémentaires
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Sécurité à mentionner, normes, assurances…", type: "textarea", section: "complementaire", icon: "📝" },
    { key: "saisonnalite", label: "Saisonnalité", hint: "Ouvert toute l'année ? Été uniquement ?", type: "text", section: "complementaire", icon: "🌞" },
    { key: "meteo_impact", label: "Impact météo", hint: "Activité annulée en cas de pluie ?", type: "text", section: "complementaire", icon: "🌧️" },

    // SECTION 9: Validation
    { key: "autorisation_adaptation", label: "Acceptez-vous l'adaptation par SAM ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_etablissement", label: "Photos de l'activité / du lieu", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_action", label: "Photos d'action / clients en activité", hint: "", type: "file", accept: "image/*", multiple: true, section: "upload", icon: "🎢" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// SPORT & BIEN-ÊTRE - Formulaire Complet
// ---------------------------------------------------------------------------
const SPORT_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "sport_bien_etre",
  label: "Sport & Fitness",
  description: "Montrer l'énergie, les équipements et l'accompagnement sportif",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "disciplines", title: "4️⃣ Disciplines & Cours", icon: "🏋️" },
    { key: "equipements", title: "5️⃣ Équipements & Espaces", icon: "🏢" },
    { key: "offre", title: "6️⃣ Offre ou avantage", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_etablissement", label: "Type d'établissement", hint: "", type: "select", options: ["Salle de sport / Fitness", "Club de tennis", "Club de golf", "Centre aquatique / Piscine", "Studio Yoga / Pilates", "CrossFit Box", "Salle de boxe / MMA", "Club multisports", "Autre"], required: true, section: "general", icon: "🏢" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web", hint: "", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Téléphone", hint: "", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", required: true, section: "general", icon: "🕒" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation globale", "Focus sur une discipline", "Ambiance & énergie", "Offre d'inscription", "Nouveauté (nouveau cours, nouvel espace)", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "urgence_promo", label: "Timing lié à une promo ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, précisez", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement
    { key: "definition_etablissement", label: "En une phrase, définissez votre club", hint: "Ex: 'Le fitness premium à Casablanca' / 'L'énergie collective qui transforme'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal", hint: "", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs", hint: "", type: "multiselect", options: ["Énergique", "Premium", "Convivial", "Familial", "Intense", "Motivant", "Modern", "Accessible", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "public_cible", label: "Public cible", hint: "", type: "multiselect", options: ["Débutants", "Sportifs confirmés", "Femmes", "Hommes", "Seniors", "Jeunes / Étudiants", "Familles", "Entreprises", "Autre"], required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Disciplines
    { key: "disciplines_proposees", label: "Disciplines proposées", hint: "", type: "multiselect", options: ["Musculation", "Cardio", "CrossFit", "Yoga", "Pilates", "Spinning / RPM", "Zumba / Dance", "Boxe / Kick-boxing", "Arts martiaux", "Natation", "Aquagym", "Tennis", "Padel", "Golf", "Autre"], section: "disciplines", icon: "🏋️" },
    { key: "disciplines_autre", label: "Autres disciplines", hint: "", type: "text", section: "disciplines" },
    { key: "cours_phares", label: "Cours phares à filmer", hint: "Les 3 cours les plus populaires", type: "textarea", required: true, section: "disciplines", icon: "👑" },
    { key: "coachs", label: "Coachs à mettre en avant", hint: "Noms, spécialités, certifications…", type: "textarea", section: "disciplines", icon: "👨‍🏫" },

    // SECTION 5: Équipements
    { key: "espaces_disponibles", label: "Espaces disponibles", hint: "", type: "multiselect", options: ["Salle de musculation", "Plateau cardio", "Studios cours collectifs", "Piscine", "Sauna / Hammam", "Terrains (tennis, padel)", "Parcours golf", "Vestiaires premium", "Espace détente", "Autre"], section: "equipements", icon: "🏢" },
    { key: "equipements_premium", label: "Équipements premium", hint: "Marques, machines spéciales…", type: "textarea", section: "equipements", icon: "💪" },
    { key: "superficie", label: "Superficie totale", hint: "Ex: 2000 m²", type: "text", section: "equipements", icon: "📐" },

    // SECTION 6: Offre
    { key: "promotion_en_cours", label: "Offre en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description + dates", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif SAM ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },
    { key: "formules_abonnement", label: "Formules d'abonnement", hint: "Mensuel, annuel, sans engagement…", type: "textarea", section: "offre", icon: "📋" },
    { key: "prix_a_partir", label: "Prix \"à partir de\"", hint: "", type: "text", section: "offre", icon: "💰" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off", hint: "", type: "multiselect", options: ["Énergique & motivant", "Premium & inspirant", "Fun & décomplexé", "Storytelling transformation", "Court & percutant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },

    // SECTION 8: Complémentaire
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "", type: "textarea", section: "complementaire", icon: "📝" },
    { key: "figurants", label: "Figurants/Membres disponibles pour le tournage ?", hint: "", type: "select", options: ["Oui", "Non", "À discuter"], section: "complementaire", icon: "👥" },

    // SECTION 9: Validation
    { key: "autorisation_adaptation", label: "Acceptez-vous l'adaptation par SAM ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_etablissement", label: "Photos des espaces", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_action", label: "Photos de cours / action", hint: "", type: "file", accept: "image/*", multiple: true, section: "upload", icon: "🏋️" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// CULTURE / MUSÉE - Formulaire Complet
// ---------------------------------------------------------------------------
const CULTURE_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "culture",
  label: "Culture / Musée / Galerie",
  description: "Valoriser le patrimoine, l'architecture et les expositions",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "collections", title: "4️⃣ Collections & Expositions", icon: "🖼️" },
    { key: "espaces", title: "5️⃣ Espaces & Architecture", icon: "🏛️" },
    { key: "offre", title: "6️⃣ Offre ou avantage", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_etablissement", label: "Type d'établissement", hint: "", type: "select", options: ["Musée", "Galerie d'art", "Monument historique", "Site archéologique", "Centre culturel", "Fondation", "Théâtre / Opéra", "Autre"], required: true, section: "general", icon: "🏛️" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web", hint: "", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Téléphone", hint: "", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", required: true, section: "general", icon: "🕒" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation globale", "Exposition temporaire", "Collection permanente", "Architecture & patrimoine", "Événement spécial", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "expo_temporaire", label: "Exposition temporaire à promouvoir ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🖼️" },
    { key: "dates_expo", label: "Si oui, dates de l'exposition", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement
    { key: "definition_etablissement", label: "En une phrase, définissez votre lieu", hint: "Ex: 'Le patrimoine marocain à portée de main' / 'L'art contemporain qui inspire'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal", hint: "", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs", hint: "", type: "multiselect", options: ["Historique", "Contemporain", "Interactif", "Éducatif", "Immersif", "Majestueux", "Intimiste", "Avant-gardiste", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "public_cible", label: "Public cible", hint: "", type: "multiselect", options: ["Touristes internationaux", "Touristes nationaux", "Familles", "Scolaires", "Étudiants / Jeunes", "Amateurs d'art", "Professionnels / Chercheurs", "Autre"], required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Collections
    { key: "collections_phares", label: "Collections / Œuvres phares", hint: "Les pièces maîtresses à filmer", type: "textarea", required: true, section: "collections", icon: "🖼️" },
    { key: "themes_collections", label: "Thèmes des collections", hint: "Art islamique, art contemporain, archéologie…", type: "textarea", section: "collections", icon: "📚" },
    { key: "artistes_majeurs", label: "Artistes majeurs exposés", hint: "", type: "textarea", section: "collections", icon: "🎨" },
    { key: "parcours_visite", label: "Parcours de visite", hint: "Chronologique, thématique, libre…", type: "text", section: "collections", icon: "🚶" },
    { key: "visite_guidee", label: "Visites guidées disponibles ?", hint: "", type: "select", options: ["Oui", "Non", "Sur réservation"], section: "collections", icon: "👤" },

    // SECTION 5: Espaces & Architecture
    { key: "points_architecturaux", label: "Points architecturaux remarquables", hint: "Façade, escalier, coupole, jardins…", type: "textarea", required: true, section: "espaces", icon: "🏛️" },
    { key: "espaces_filmer", label: "Espaces à filmer", hint: "", type: "multiselect", options: ["Hall d'entrée", "Salles d'exposition", "Jardins", "Terrasse / Vue", "Boutique", "Café / Restaurant", "Auditorium", "Autre"], section: "espaces", icon: "🏠" },
    { key: "histoire_batiment", label: "Histoire du bâtiment", hint: "Si pertinent", type: "textarea", section: "espaces", icon: "📜" },

    // SECTION 6: Offre
    { key: "tarifs", label: "Tarifs d'entrée", hint: "Plein tarif, réduit, gratuit pour…", type: "textarea", section: "offre", icon: "🎟️" },
    { key: "promotion_en_cours", label: "Offre en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif SAM ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off", hint: "", type: "multiselect", options: ["Culturel & éducatif", "Contemplatif & poétique", "Dynamique & moderne", "Storytelling historique", "Court & percutant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },

    // SECTION 8: Complémentaire
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Labels, récompenses, partenariats…", type: "textarea", section: "complementaire", icon: "📝" },
    { key: "restrictions_tournage", label: "Restrictions de tournage", hint: "Flash interdit, zones restreintes…", type: "textarea", section: "complementaire", icon: "⚠️" },

    // SECTION 9: Validation
    { key: "autorisation_adaptation", label: "Acceptez-vous l'adaptation par SAM ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_etablissement", label: "Photos du lieu / architecture", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_oeuvres", label: "Photos des œuvres / collections", hint: "", type: "file", accept: "image/*", multiple: true, section: "upload", icon: "🖼️" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// SHOPPING / COMMERCE - Formulaire Complet
// ---------------------------------------------------------------------------
const SHOPPING_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "shopping",
  label: "Shopping / Commerce",
  description: "Mettre en valeur les produits, l'expérience client et l'ambiance",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "produits", title: "4️⃣ Produits & Collections", icon: "🛍️" },
    { key: "experience", title: "5️⃣ Expérience Client", icon: "✨" },
    { key: "offre", title: "6️⃣ Offre ou avantage", icon: "🎁" },
    { key: "voix_off", title: "7️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "8️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "9️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de la boutique / marque", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_commerce", label: "Type de commerce", hint: "", type: "select", options: ["Boutique mode", "Concept store", "Bijouterie / Joaillerie", "Maroquinerie", "Décoration / Maison", "Artisanat / Souk", "Cosmétiques / Parfumerie", "Électronique", "Épicerie fine", "Centre commercial", "Autre"], required: true, section: "general", icon: "🏪" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web / E-commerce", hint: "", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Téléphone", hint: "", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", required: true, section: "general", icon: "🕒" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation de la boutique", "Focus sur une collection", "Nouveautés / Arrivages", "Soldes / Promotions", "Événement spécial", "Artisan / Savoir-faire", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "urgence_promo", label: "Timing lié aux soldes/fêtes ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, précisez", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement
    { key: "definition_etablissement", label: "En une phrase, définissez votre boutique", hint: "Ex: 'Le luxe marocain accessible' / 'L'artisanat revisité avec modernité'", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal", hint: "", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "adjectifs_etablissement", label: "3 adjectifs", hint: "", type: "multiselect", options: ["Luxueux", "Artisanal", "Moderne", "Traditionnel", "Éco-responsable", "Tendance", "Exclusif", "Accessible", "Autre"], required: true, section: "positionnement", icon: "⭐" },
    { key: "public_cible", label: "Public cible", hint: "", type: "multiselect", options: ["Touristes", "Clientèle locale premium", "Jeunes / Tendance", "Familles", "Professionnels", "Amateurs d'artisanat", "Autre"], required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Produits
    { key: "categories_produits", label: "Catégories de produits", hint: "Vêtements, accessoires, déco, bijoux…", type: "textarea", required: true, section: "produits", icon: "🛍️" },
    { key: "produits_phares", label: "Produits phares à filmer", hint: "Best-sellers, exclusivités, nouveautés", type: "textarea", required: true, section: "produits", icon: "👑" },
    { key: "marques_vendues", label: "Marques vendues (si applicable)", hint: "", type: "textarea", section: "produits", icon: "🏷️" },
    { key: "savoir_faire", label: "Savoir-faire / Fabrication", hint: "Artisanat local, fait main, matières nobles…", type: "textarea", section: "produits", icon: "🎨" },
    { key: "gamme_prix", label: "Gamme de prix", hint: "Ex: 200 - 5000 MAD", type: "text", section: "produits", icon: "💰" },

    // SECTION 5: Expérience Client
    { key: "ambiance_boutique", label: "Ambiance de la boutique", hint: "", type: "select", options: ["Luxe & raffiné", "Bohème & artisanal", "Moderne & épuré", "Traditionnel & authentique", "Tendance & urbain"], section: "experience", icon: "✨" },
    { key: "services_proposes", label: "Services proposés", hint: "", type: "multiselect", options: ["Conseil personnalisé", "Personnalisation / Sur-mesure", "Livraison", "Click & Collect", "Emballage cadeau", "Programme fidélité", "Autre"], section: "experience", icon: "🎁" },
    { key: "elements_distinctifs", label: "Éléments distinctifs de la boutique", hint: "Décoration, agencement, scénographie…", type: "textarea", section: "experience", icon: "🎨" },

    // SECTION 6: Offre
    { key: "promotion_en_cours", label: "Promotion en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description + dates", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif SAM ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },

    // SECTION 7: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off", hint: "", type: "multiselect", options: ["Luxueux & aspirationnel", "Chaleureux & authentique", "Tendance & dynamique", "Storytelling artisanal", "Court & impactant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },

    // SECTION 8: Complémentaire
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Labels, certifications, récompenses…", type: "textarea", section: "complementaire", icon: "📝" },

    // SECTION 9: Validation
    { key: "autorisation_adaptation", label: "Acceptez-vous l'adaptation par SAM ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 10: Upload
    { key: "photos_boutique", label: "Photos de la boutique", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "photos_produits", label: "Photos des produits phares", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "🛍️" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// DEFAULT - Formulaire Générique
// ---------------------------------------------------------------------------
const DEFAULT_BRIEF_TEMPLATE: UniverseBriefTemplate = {
  universe: "default",
  label: "Autre établissement",
  description: "Template standard pour tous les établissements",
  sections: [
    { key: "general", title: "1️⃣ Informations Générales", icon: "📌" },
    { key: "contexte", title: "2️⃣ Contexte de la Vidéo", icon: "🎯" },
    { key: "positionnement", title: "3️⃣ Positionnement & Storytelling", icon: "🧭" },
    { key: "offre", title: "4️⃣ Offre ou avantage", icon: "🎁" },
    { key: "voix_off", title: "5️⃣ Ton de la voix off", icon: "🎙️" },
    { key: "complementaire", title: "6️⃣ Informations complémentaires", icon: "📝" },
    { key: "validation", title: "7️⃣ Validation finale", icon: "✅" },
    { key: "upload", title: "📎 Upload obligatoire", icon: "📤" },
  ],
  fields: [
    // SECTION 1: Informations Générales
    { key: "nom_etablissement", label: "Nom de l'établissement", hint: "", type: "text", required: true, section: "general", icon: "📌" },
    { key: "type_activite", label: "Type d'activité", hint: "", type: "text", required: true, section: "general", icon: "🏢" },
    { key: "adresse_exacte", label: "Adresse exacte", hint: "", type: "text", required: true, section: "general", icon: "📍" },
    { key: "site_web", label: "Site web", hint: "", type: "url", section: "general", icon: "🔗" },
    { key: "instagram", label: "Instagram", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "tiktok", label: "TikTok", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "facebook", label: "Facebook", hint: "", type: "url", section: "general", icon: "📱" },
    { key: "telephone", label: "Téléphone", hint: "", type: "text", required: true, section: "general", icon: "☎️" },
    { key: "horaires", label: "Horaires d'ouverture", hint: "", type: "text", section: "general", icon: "🕒" },

    // SECTION 2: Contexte de la Vidéo
    { key: "nature_video", label: "Nature de la vidéo", hint: "", type: "multiselect", options: ["Présentation globale", "Focus sur un service/produit", "Offre promotionnelle", "Nouveauté", "Autre"], required: true, section: "contexte", icon: "🎯" },
    { key: "nature_video_autre", label: "Si autre, précisez", hint: "", type: "text", section: "contexte" },
    { key: "urgence_promo", label: "Timing lié à une promo ?", hint: "", type: "select", options: ["Oui", "Non"], section: "contexte", icon: "🔥" },
    { key: "dates_validite_promo", label: "Si oui, précisez", hint: "", type: "text", section: "contexte" },

    // SECTION 3: Positionnement
    { key: "definition_etablissement", label: "En une phrase, définissez votre établissement", hint: "", type: "text", required: true, section: "positionnement", icon: "🧭" },
    { key: "message_principal", label: "Message principal à transmettre", hint: "", type: "textarea", required: true, section: "positionnement", icon: "💬" },
    { key: "points_forts", label: "Vos 3 points forts", hint: "Ce qui vous différencie", type: "textarea", required: true, section: "positionnement", icon: "⭐" },
    { key: "public_cible", label: "Public cible", hint: "", type: "textarea", required: true, section: "positionnement", icon: "👥" },

    // SECTION 4: Offre
    { key: "promotion_en_cours", label: "Offre en cours ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "🎁" },
    { key: "description_promo", label: "Si oui, description + dates", hint: "", type: "textarea", section: "offre" },
    { key: "code_promo_sam", label: "Code promo exclusif SAM ?", hint: "", type: "select", options: ["Oui", "Non"], section: "offre", icon: "💳" },
    { key: "code_promo_details", label: "Si oui, Code + % ou valeur", hint: "", type: "text", section: "offre" },

    // SECTION 5: Ton de la voix off
    { key: "style_voix_off", label: "Style de voix off souhaité", hint: "", type: "multiselect", options: ["Fun & dynamique", "Sérieux & premium", "Chaleureux & invitant", "Storytelling & émotion", "Court & impactant", "Autre"], required: true, section: "voix_off", icon: "🎙️" },
    { key: "style_voix_off_autre", label: "Si autre, précisez", hint: "", type: "text", section: "voix_off" },

    // SECTION 6: Complémentaire
    { key: "souhaits_particuliers", label: "Souhaits particuliers", hint: "Phrases obligatoires, labels, certifications…", type: "textarea", section: "complementaire", icon: "📝" },

    // SECTION 7: Validation
    { key: "autorisation_adaptation", label: "Acceptez-vous que SAM adapte votre brief ?", hint: "", type: "select", options: ["Oui, totalement", "Oui mais validation avant", "Non, respect strict"], required: true, section: "validation", icon: "✅" },

    // SECTION 8: Upload
    { key: "photos_etablissement", label: "Photos de l'établissement", hint: "", type: "file", accept: "image/*", multiple: true, required: true, section: "upload", icon: "📸" },
    { key: "videos_existantes", label: "Liens vers vidéos existantes", hint: "", type: "textarea", section: "upload", icon: "🎬" },
  ],
};

// ---------------------------------------------------------------------------
// Export des templates
// ---------------------------------------------------------------------------
export const UNIVERSE_BRIEF_TEMPLATES: UniverseBriefTemplate[] = [
  RESTAURANT_BRIEF_TEMPLATE,
  HEBERGEMENT_BRIEF_TEMPLATE,
  WELLNESS_BRIEF_TEMPLATE,
  LOISIR_BRIEF_TEMPLATE,
  SPORT_BRIEF_TEMPLATE,
  CULTURE_BRIEF_TEMPLATE,
  SHOPPING_BRIEF_TEMPLATE,
  DEFAULT_BRIEF_TEMPLATE,
];

/**
 * Get the brief template for a specific universe
 */
export function getBriefTemplateForUniverse(
  universe: string | null | undefined,
): UniverseBriefTemplate {
  const u = (universe ?? "").toLowerCase().trim();

  // Map variations to canonical universe names
  const mapping: Record<string, UniverseType> = {
    restaurant: "restaurant",
    restaurants: "restaurant",
    hebergement: "hebergement",
    hotel: "hebergement",
    hotels: "hebergement",
    riad: "hebergement",
    lodge: "hebergement",
    "maison d'hôtes": "hebergement",
    wellness: "wellness",
    spa: "wellness",
    hammam: "wellness",
    "bien-être": "wellness",
    loisir: "loisir",
    loisirs: "loisir",
    activite: "loisir",
    activites: "loisir",
    parc: "loisir",
    sport_bien_etre: "sport_bien_etre",
    sport: "sport_bien_etre",
    fitness: "sport_bien_etre",
    "salle de sport": "sport_bien_etre",
    gym: "sport_bien_etre",
    culture: "culture",
    musee: "culture",
    museum: "culture",
    galerie: "culture",
    monument: "culture",
    shopping: "shopping",
    boutique: "shopping",
    commerce: "shopping",
    magasin: "shopping",
  };

  const canonical = mapping[u] ?? "default";
  return (
    UNIVERSE_BRIEF_TEMPLATES.find((t) => t.universe === canonical) ??
    UNIVERSE_BRIEF_TEMPLATES[UNIVERSE_BRIEF_TEMPLATES.length - 1]
  );
}

/**
 * Initialize empty brief data based on universe template
 */
export function initBriefDataForUniverse(
  universe: string | null | undefined,
): Record<string, string> {
  const template = getBriefTemplateForUniverse(universe);
  const data: Record<string, string> = {};
  for (const field of template.fields) {
    data[field.key] = "";
  }
  return data;
}

/**
 * Get sections for a specific universe
 */
export function getBriefSectionsForUniverse(
  universe: string | null | undefined,
): BriefSectionTemplate[] {
  const template = getBriefTemplateForUniverse(universe);
  return template.sections;
}

/**
 * Get fields for a specific section
 */
export function getBriefFieldsForSection(
  universe: string | null | undefined,
  sectionKey: string,
): BriefFieldTemplate[] {
  const template = getBriefTemplateForUniverse(universe);
  return template.fields.filter((f) => f.section === sectionKey);
}
