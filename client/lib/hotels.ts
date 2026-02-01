import type { HotelAmenity, RoomType } from "@/components/hotel/HotelSections";
import { hotelAmenityPresets } from "@/components/hotel/HotelSections";

export type HotelRatingSource = "Tripadvisor" | "Google" | "Booking" | "Expedia" | "Autre";

export type HotelReviewSummary = {
  pros: string[];
  cons: string[];
};

export type SocialMediaLink = {
  platform: string;
  url: string;
};

export type HotelData = {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  stars: 5 | 4 | 3;
  rating: {
    value: number;
    source: HotelRatingSource;
    reviewCount: number;
  };
  address: string;
  phone: string;
  email: string;
  website: string;
  checkIn: string;
  checkOut: string;
  description: string;
  highlights: string[];
  images: string[];
  amenities: HotelAmenity[];
  rooms: RoomType[];
  mapQuery: string;
  reviewUrl: string;
  reviewSummary: HotelReviewSummary;
  socialMedia: SocialMediaLink[];
  policies?: string[];
};

const HOTELS: Record<string, HotelData> = {
  "movenpick-malabata-tanger": {
    id: "movenpick-malabata-tanger",
    name: "Mövenpick Hotel & Casino Malabata Tanger",
    city: "Tanger",
    neighborhood: "Malabata",
    stars: 5,
    rating: {
      value: 3.4,
      source: "Tripadvisor",
      reviewCount: 728,
    },
    address: "Avenue Mohamed VI, Baie de Tanger, 90000 Tanger, Maroc",
    phone: "+212 5393-29300",
    email: "hotel.tangier.casino@movenpick.com",
    website: "https://movenpick.accor.com/en/africa/morocco/tangier/hotel-malabata-tanger.html",
    checkIn: "À partir de 14:00",
    checkOut: "Jusqu’à 12:00",
    description:
      "Un hôtel 5 étoiles en bord d’océan avec vues sur la baie de Tanger, combinant détente (piscine, jardins, spa) et divertissement grâce au casino sur place, tout en restant proche du centre-ville.",
    highlights: [
      "Vue sur la baie de Tanger et le détroit de Gibraltar",
      "Grandes piscines extérieures et jardins",
      "Spa & espace bien-être",
      "Casino sur place",
      "Plusieurs restaurants & bars (dont piano bar)",
      "Accès rapide au centre de Tanger en voiture",
    ],
    images: [
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fd332c834fb5c4f018505f206e14b6fd1?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F6a1593c196f44a5bb01efb3b4f1d6259?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F45b385209b5b4d97ac91bfeb29602f43?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fcb4a1c9126f942f6ab1a9326cc52d13e?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F8b62006af81f4ab8bb0092b255f5b7d0?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F016b9bf81a76447c900a13739d7d9760?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F645859620c6e40bc8c739241a5407519?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc05b0832c602422ebe253307157f5c45?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fa72c9d95d2b1497bb5218ba1babc5355?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fcb4a1c9126f942f6ab1a9326cc52d13e?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fb4173ef022bd4e24b904ff2503452978?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fa015a55872044f7c975065eb5178848b?format=webp&width=1600",
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2F7329ef6141c0401cb9dcfbfd5b792bf0?format=webp&width=1600",
    ],
    amenities: [
      hotelAmenityPresets.pool,
      hotelAmenityPresets.spa,
      hotelAmenityPresets.gym,
      hotelAmenityPresets.casino,
      hotelAmenityPresets.restaurant,
      hotelAmenityPresets.wifi,
      hotelAmenityPresets.parking,
      hotelAmenityPresets.meeting,
      hotelAmenityPresets.rooms,
      hotelAmenityPresets.bath,
      hotelAmenityPresets.security,
      hotelAmenityPresets.location,
    ],
    rooms: [
      {
        name: "Classic (King/Twin)",
        occupancy: "Jusqu’à 3 personnes",
        highlights: ["Vue mer (selon catégorie)", "Wi‑Fi", "Climatisation", "Salle de bain privée"],
        priceFromMad: 3252,
      },
      {
        name: "Premium (King/Twin)",
        occupancy: "Jusqu’à 3 personnes",
        highlights: ["Vue mer (selon catégorie)", "Espace plus généreux", "Wi‑Fi", "Climatisation"],
      },
      {
        name: "Executive (King/Twin)",
        occupancy: "Jusqu’à 3 personnes",
        highlights: ["Vue mer (selon catégorie)", "Services premium", "Wi‑Fi", "Climatisation"],
      },
      {
        name: "Junior Suite",
        occupancy: "Jusqu’à 4 personnes",
        highlights: ["Salon", "Vue mer (selon catégorie)", "Wi‑Fi", "Climatisation"],
      },
      {
        name: "Ambassador / Presidential / Royal Suite",
        occupancy: "Jusqu’à 6 personnes (selon suite)",
        highlights: ["Suites panoramiques", "Espace salon", "Vue mer (selon catégorie)", "Services haut de gamme"],
      },
    ],
    mapQuery: "Mövenpick Hotel & Casino Malabata Tanger",
    reviewUrl: "https://www.google.com/search?q=M%C3%B6venpick%20Hotel%20%26%20Casino%20Malabata%20Tanger%20avis",
    reviewSummary: {
      pros: [
        "Emplacement apprécié et vue sur mer",
        "Piscine et espaces extérieurs",
        "Personnel souvent jugé accueillant",
      ],
      cons: [
        "Retours variables sur l’entretien selon les chambres",
        "Expérience pouvant dépendre de la saison et des disponibilités",
      ],
    },
    socialMedia: [
      { platform: "instagram", url: "https://www.instagram.com/movenpickhotels/" },
      { platform: "linkedin", url: "https://fr.linkedin.com/company/m%C3%B6venpick-tanger" },
    ],
    policies: [
      "Arrivez 10 minutes avant l’heure prévue.",
      "Annulation gratuite jusqu’à 6h avant.",
      "Merci de signaler allergies ou besoins spécifiques lors de la réservation.",
    ],
  },
};

HOTELS["304"] = HOTELS["movenpick-malabata-tanger"];

export function getHotelById(id: string): HotelData | null {
  return HOTELS[id] ?? null;
}

export function listHotels(): HotelData[] {
  const unique = new Map<string, HotelData>();
  for (const h of Object.values(HOTELS)) {
    unique.set(h.id, h);
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}
