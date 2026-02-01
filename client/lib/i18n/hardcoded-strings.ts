// This file maps common hardcoded strings found in the codebase
// These keys should be merged into client/lib/i18n/messages.ts

export type HardcodedStringKey = keyof typeof hardcodedStringKeys;

export const hardcodedStringKeys = {
  // Establishment & Entity Terms
  "establishment.not_found": { fr: "Établissement introuvable", en: "Establishment not found" },
  "establishment.label": { fr: "Établissement", en: "Establishment" },
  "establishment.establishments": { fr: "Établissements", en: "Establishments" },
  "establishment.fallback_name": { fr: "Établissement", en: "Establishment" },
  
  // Reviews
  "reviews.title": { fr: "Avis clients", en: "Customer Reviews" },
  "reviews.posting_restriction": { fr: "Seuls les clients ayant visité l'établissement peuvent déposer un avis", en: "Only customers who have visited can leave a review" },
  
  // Reservation
  "reservation.label": { fr: "Réservation", en: "Reservation" },
  "reservation.not_found": { fr: "Réservation introuvable", en: "Reservation not found" },
  "reservation_prefix": { fr: "Réservation:", en: "Reservation:" },
  
  // Restaurant Features & Cuisine
  "cuisine.moroccan.traditional": { fr: "Cuisine marocaine tradition", en: "Traditional Moroccan cuisine" },
  "cuisine.home_cooking": { fr: "Cuisine maison à base de produits locaux", en: "Home cooking with local products" },
  "feature.ambience.authentic": { fr: "Ambiance authentique", en: "Authentic atmosphere" },
  "feature.terrace_panoramic": { fr: "Terrasse panoramique", en: "Panoramic terrace" },
  "feature.terrace_weather": { fr: "Terrasse agréable (selon météo)", en: "Pleasant terrace (weather permitting)" },
  "feature.medina_view": { fr: "Vue sur la médina", en: "Medina view" },
  
  // Hotel Features
  "hotel.occupancy": { fr: "Jusqu'à 2 personnes", en: "Up to 2 people" },
  "hotel.feature.private_bathroom": { fr: "Salle de bain privée", en: "Private bathroom" },
  "hotel.feature.air_conditioned": { fr: "Chambres climatisées", en: "Air-conditioned rooms" },
  "hotel.feature.sea_view": { fr: "Vue sur la baie", en: "Bay view" },
  "hotel.feature.spa": { fr: "Spa & bien‑être", en: "Spa & wellness" },
  "hotel.feature.gym": { fr: "Salle de sport", en: "Gym" },
  "hotel.feature.casino": { fr: "Casino sur place", en: "On-site casino" },
  "hotel.feature.meeting_rooms": { fr: "Salles de réunion", en: "Meeting rooms" },
  "hotel.cancellation_policy": { fr: "Annulation gratuite jusqu'à 6h avant.", en: "Free cancellation up to 6 hours before." },
  "hotel.allergy_notice": { fr: "Merci de signaler allergies ou besoins spécifiques lors de la réservation.", en: "Please report any allergies or special needs when booking." },
  
  // Booking & Reservation
  "booking.finalise_intro": { fr: "Finalisez votre réservation en quelques étapes.", en: "Complete your reservation in a few steps." },
  "booking.finalise_with_name": { fr: "Finalisez votre réservation chez {name} en quelques étapes.", en: "Complete your reservation at {name} in a few steps." },
  
  // Shared Features/Tags
  "tag.terrace": { fr: "Terrasse", en: "Terrace" },
  "tag.private_room": { fr: "Salle privée", en: "Private room" },
  "tag.rooftop": { fr: "Rooftop", en: "Rooftop" },
  "tag.speakeasy": { fr: "Speakeasy", en: "Speakeasy" },
  "tag.payment_cash": { fr: "Paiement cash", en: "Cash payment" },
  "tag.online_booking": { fr: "Réservation en ligne", en: "Online booking" },
  "tag.recommendation": { fr: "Réservation conseillée", en: "Reservation recommended" },
  "tag.couple_friendly": { fr: "Idéal en couple", en: "Ideal for couples" },
  "tag.open_late": { fr: "Ouvert tard", en: "Open late" },
  "tag.private_beach": { fr: "Plage privée", en: "Private beach" },
  
  // Admin Pages
  "admin.establishments.title": { fr: "Établissements", en: "Establishments" },
  "admin.establishments.description": { fr: "Liste, statut, et actions de modération sur les fiches.", en: "List, status, and moderation actions on records." },
  "admin.establishments.create_button": { fr: "Créer un nouvel établissement", en: "Create new establishment" },
  "admin.establishments.dialog_title": { fr: "Créer un établissement", en: "Create establishment" },
  "admin.establishments.name_placeholder": { fr: "Nom de l'établissement", en: "Establishment name" },
  "admin.establishments.empty_state": { fr: "Aucun établissement.", en: "No establishments." },
  "admin.establishments.choose": { fr: "Choisir un établissement", en: "Choose an establishment" },
  "admin.establishments.choose_prompt": { fr: "Choisissez un établissement pour afficher ses réservations.", en: "Choose an establishment to view its reservations." },
  "admin.error.no_establishment_found": { fr: "Aucun établissement trouvé", en: "No establishment found" },
  
  // Leisure & Activities
  "leisure.suitable_beginners": { fr: "Convient aux débutants", en: "Suitable for beginners" },
  "leisure.quick_booking": { fr: "Réservation rapide (créneaux)", en: "Quick booking (by slot)" },
  
  // Wellness
  "wellness.warm_welcome": { fr: "Accueil chaleureux et professionnel", en: "Warm and professional welcome" },
  "wellness.slot_based": { fr: "Réservation par créneaux pour éviter l'attente", en: "Slot-based booking to avoid waiting" },
  "wellness.cabins": { fr: "Cabines individuelles et duo", en: "Individual and duo cabins" },
  "wellness.quality_care": { fr: "Soins de qualité, réservation fluide.", en: "Quality care, smooth booking." },
  
  // Contact Form
  "contact_reason.owner": { fr: "Je suis propriétaire d'un établissement et je souhaite en savoir plus sur SAM Pro", en: "I own a venue and want to learn more about SAM Pro" },
  "contact_reason.client": { fr: "Je suis client et je souhaite faire une réservation", en: "I'm a customer and want to make a reservation" },
  "contact_reason.job": { fr: "Je recherche un emploi dans un établissement", en: "I'm looking for a job at a venue" },
  
  // Other
  "add_establishment.cta": { fr: "Ajouter mon établissement maintenant", en: "Add my establishment now" },
  "add_establishment.page_title": { fr: "Ajouter mon établissement – Sortir Au Maroc", en: "Add my establishment – Sortir Au Maroc" },
  "messages.from.user": { fr: "Vous", en: "You" },
  "messages.from.establishment": { fr: "Établissement", en: "Establishment" },
  "notification.new_booking": { fr: "Nouvelle réservation", en: "New reservation" },
  "notification.new_confirmed": { fr: "Nouvelle réservation confirmée", en: "New booking confirmed" },
  "error.review.empty": { fr: "Avis vide", en: "Empty review" },
  "error.review.too_long": { fr: "Avis trop long", en: "Review too long" },
  "chart.label.reservations_30d": { fr: "Réservations (30j)", en: "Reservations (30d)" },

  // Home
  "home.enable_geolocation_nearby": {
    fr: "Activer la géolocalisation pour des résultats à proximité",
    en: "Enable geolocation to see nearby results",
  },
};

// Helper function to get translated string
export function getTranslation(key: string, locale: 'fr' | 'en'): string | undefined {
  const entry = hardcodedStringKeys[key as keyof typeof hardcodedStringKeys];
  if (!entry) return undefined;
  return entry[locale];
}
