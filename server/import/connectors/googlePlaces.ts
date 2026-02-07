/**
 * Google Places API Connector - SAM Import CHR
 *
 * Utilise l'API Google Places pour récupérer les établissements.
 * IMPORTANT: Ne PAS scraper Google, utiliser uniquement l'API officielle.
 */

import type {
  RawPlace,
  ConnectorConfig,
  ConnectorResult,
  OpeningHours,
  RawPhoto,
} from "./types";
import {
  BaseConnector,
  type SearchParams,
  registerConnector,
} from "./base";

// ============================================
// CONFIGURATION
// ============================================

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place";

// Mapping catégorie CHR -> types Google Places
const CATEGORY_TO_GOOGLE_TYPES: Record<string, string[]> = {
  restaurant: ["restaurant", "meal_takeaway", "meal_delivery"],
  cafe: ["cafe"],
  bar: ["bar", "night_club"],
  rooftop: ["restaurant", "bar"], // Pas de type spécifique, filtrer par nom
  lounge: ["bar", "restaurant"],
  patisserie: ["bakery"], // Pas de type spécifique pâtisserie
  tea_room: ["cafe"],
  fast_food: ["meal_takeaway", "fast_food_restaurant"],
  brasserie: ["restaurant"],
  snack: ["meal_takeaway", "restaurant"],
  glacier: ["cafe"], // Pas de type glace
  boulangerie: ["bakery"],
  traiteur: ["meal_takeaway"],
  food_truck: ["meal_takeaway"],
  club: ["night_club"],
};

// Mots-clés à ajouter automatiquement pour des recherches plus complètes
const CUISINE_KEYWORDS: Record<string, string[]> = {
  sushi: ["sushi", "japonais", "japanese restaurant"],
  italien: ["italien", "italian", "pizza", "pasta"],
  marocain: ["marocain", "moroccan", "tajine", "couscous"],
  chinois: ["chinois", "chinese"],
  indien: ["indien", "indian"],
  libanais: ["libanais", "lebanese"],
  mexicain: ["mexicain", "mexican", "tacos"],
  thaï: ["thaï", "thai"],
  burger: ["burger", "hamburger"],
  pizza: ["pizza", "pizzeria"],
  seafood: ["fruits de mer", "seafood", "poisson"],
  grill: ["grill", "grillades", "bbq", "barbecue"],
  brunch: ["brunch", "breakfast"],
};

// Mapping villes -> coordonnées centrales et rayon de couverture
interface CityConfig {
  lat: number;
  lng: number;
  radius: number; // Rayon en mètres pour couvrir toute la ville
  gridPoints?: Array<{ lat: number; lng: number }>; // Points de grille pour les grandes villes
}

const CITY_COORDINATES: Record<string, CityConfig> = {
  casablanca: {
    lat: 33.5731,
    lng: -7.5898,
    radius: 10000, // Rayon réduit à 10km pour plus de précision avec la grille
    // Grille étendue de 9 points pour couvrir toute la ville et obtenir plus de résultats
    gridPoints: [
      { lat: 33.5731, lng: -7.5898 }, // Centre-ville
      { lat: 33.5950, lng: -7.5400 }, // Anfa / Ain Diab (nord-est)
      { lat: 33.5400, lng: -7.6100 }, // Hay Hassani (sud-ouest)
      { lat: 33.5900, lng: -7.6400 }, // Sidi Moumen (nord-ouest)
      { lat: 33.5300, lng: -7.5200 }, // Maarif / Oasis (sud-est)
      { lat: 33.6100, lng: -7.6000 }, // Bernoussi (nord)
      { lat: 33.5500, lng: -7.5600 }, // Maârif / Gauthier (centre-est)
      { lat: 33.5650, lng: -7.6200 }, // Hay Mohammadi (centre-ouest)
      { lat: 33.6000, lng: -7.5100 }, // Bouskoura / Californie (est)
    ],
  },
  marrakech: {
    lat: 31.6295,
    lng: -7.9811,
    radius: 8000,
    gridPoints: [
      { lat: 31.6295, lng: -7.9811 }, // Centre (Médina)
      { lat: 31.6400, lng: -8.0100 }, // Guéliz
      { lat: 31.6150, lng: -7.9500 }, // Hivernage
      { lat: 31.6500, lng: -7.9600 }, // Palmeraie
      { lat: 31.6050, lng: -8.0000 }, // Kasbah
    ],
  },
  rabat: {
    lat: 34.0209,
    lng: -6.8416,
    radius: 8000,
    gridPoints: [
      { lat: 34.0209, lng: -6.8416 }, // Centre
      { lat: 34.0050, lng: -6.8500 }, // Agdal
      { lat: 34.0350, lng: -6.8200 }, // Hassan
      { lat: 34.0150, lng: -6.8100 }, // Océan
      { lat: 33.9950, lng: -6.8700 }, // Souissi
    ],
  },
  fes: {
    lat: 34.0331,
    lng: -5.0003,
    radius: 8000,
    gridPoints: [
      { lat: 34.0331, lng: -5.0003 }, // Centre
      { lat: 34.0500, lng: -4.9800 }, // Ville Nouvelle
      { lat: 34.0200, lng: -5.0200 }, // Médina
    ],
  },
  tanger: {
    lat: 35.7673,
    lng: -5.7998,
    radius: 8000,
    gridPoints: [
      { lat: 35.7673, lng: -5.7998 }, // Centre
      { lat: 35.7850, lng: -5.8200 }, // Zone touristique
      { lat: 35.7550, lng: -5.7800 }, // Malabata
    ],
  },
  agadir: {
    lat: 30.4278,
    lng: -9.5981,
    radius: 10000,
    gridPoints: [
      { lat: 30.4278, lng: -9.5981 }, // Centre
      { lat: 30.4400, lng: -9.6200 }, // Talborjt
      { lat: 30.4100, lng: -9.5700 }, // Marina
    ],
  },
  meknes: { lat: 33.8935, lng: -5.5547, radius: 10000 },
  oujda: { lat: 34.6814, lng: -1.9086, radius: 10000 },
  kenitra: { lat: 34.261, lng: -6.5802, radius: 10000 },
  tetouan: { lat: 35.5889, lng: -5.3626, radius: 8000 },
  essaouira: { lat: 31.5085, lng: -9.7595, radius: 6000 },
  mohammedia: { lat: 33.6861, lng: -7.3828, radius: 8000 },
  el_jadida: { lat: 33.2316, lng: -8.5007, radius: 8000 },
};

// ============================================
// TYPES GOOGLE PLACES API
// ============================================

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
  opening_hours?: {
    weekday_text?: string[];
    open_now?: boolean;
  };
  price_level?: number;
  rating?: number;
  user_ratings_total?: number;
  photos?: Array<{
    photo_reference: string;
    height: number;
    width: number;
  }>;
  types?: string[];
  url?: string; // Google Maps URL
  vicinity?: string;
  business_status?: string;
}

interface GoogleTextSearchResponse {
  results: GooglePlaceResult[];
  status: string;
  error_message?: string;
  next_page_token?: string;
}

interface GooglePlaceDetailsResponse {
  result: GooglePlaceResult;
  status: string;
  error_message?: string;
}

// ============================================
// CONNECTOR
// ============================================

export class GooglePlacesConnector extends BaseConnector {
  readonly source = "google" as const;
  private apiKey: string;

  constructor(config: Partial<ConnectorConfig> = {}) {
    super({
      rateLimitPerSecond: 10, // Google permet plus de requêtes
      ...config,
    });
    this.initRateLimiter();

    this.apiKey = process.env.GOOGLE_PLACES_API_KEY || "";

    if (!this.apiKey) {
      this.logWarn("GOOGLE_PLACES_API_KEY not configured. Connector disabled.");
      this.config.enabled = false;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.config.enabled && !!this.apiKey;
  }

  async search(params: SearchParams): Promise<ConnectorResult> {
    const startTime = Date.now();
    const { city, category, keywords, limit = 500 } = params; // Augmenté à 500

    // Construire la query
    const cityConfig = CITY_COORDINATES[city.toLowerCase().replace(/\s+/g, "_")];
    if (!cityConfig) {
      return this.createErrorResult(
        "",
        new Error(`Unknown city: ${city}`),
        Date.now() - startTime
      );
    }

    // Types Google à rechercher
    const googleTypes = category
      ? CATEGORY_TO_GOOGLE_TYPES[category] || ["restaurant"]
      : ["restaurant", "cafe", "bar"];

    const allPlaces: RawPlace[] = [];
    const seenIds = new Set<string>();

    // Points de recherche : utiliser la grille si disponible, sinon le centre
    const searchPoints = cityConfig.gridPoints || [{ lat: cityConfig.lat, lng: cityConfig.lng }];

    try {
      // Si des keywords sont spécifiés, faire des recherches dédiées par keyword
      const searchQueries: Array<{ query: string; type: string }> = [];

      if (keywords && keywords.length > 0) {
        // Recherche par mot-clé (ex: "sushi casablanca", "italien casablanca")
        for (const keyword of keywords) {
          const lowerKeyword = keyword.toLowerCase();

          // Ajouter le keyword principal
          for (const type of googleTypes.slice(0, 2)) {
            searchQueries.push({
              query: `${keyword} ${city}`,
              type,
            });
          }

          // Ajouter les variantes de cuisine si disponibles
          const cuisineVariants = CUISINE_KEYWORDS[lowerKeyword];
          if (cuisineVariants) {
            for (const variant of cuisineVariants) {
              if (variant.toLowerCase() !== lowerKeyword) {
                searchQueries.push({
                  query: `${variant} ${city}`,
                  type: "restaurant",
                });
              }
            }
          }
        }
      }

      // Ajouter aussi la recherche générale par catégorie
      for (const type of googleTypes) {
        searchQueries.push({
          query: `${category || "restaurant"} ${city}`,
          type,
        });
      }

      // Dédupliquer les queries
      const uniqueQueries = searchQueries.filter(
        (q, i, arr) => arr.findIndex((x) => x.query === q.query && x.type === q.type) === i
      );

      this.logInfo(`📍 Will search with ${uniqueQueries.length} queries across ${searchPoints.length} grid points`, {
        city,
        queries: uniqueQueries.map(q => q.query),
      });

      // Pour chaque point de la grille et chaque query
      for (const point of searchPoints) {
        if (allPlaces.length >= limit) break;

        for (const { query, type } of uniqueQueries) {
          if (allPlaces.length >= limit) break;

          const searchUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`);
          searchUrl.searchParams.set("query", query);
          searchUrl.searchParams.set("type", type);
          searchUrl.searchParams.set("location", `${point.lat},${point.lng}`);
          searchUrl.searchParams.set("radius", String(cityConfig.radius));
          searchUrl.searchParams.set("key", this.apiKey);
          searchUrl.searchParams.set("language", "fr");

          this.logInfo(`Searching Google Places: "${query}" at (${point.lat.toFixed(3)}, ${point.lng.toFixed(3)})`, { type, city });

          const response = await this.executeWithRateLimit(async () => {
            const res = await fetch(searchUrl.toString(), {
              headers: {
                Accept: "application/json",
              },
            });
            if (!res.ok) {
              throw new Error(`Google API error: ${res.status}`);
            }
            return res.json() as Promise<GoogleTextSearchResponse>;
          });

          if (response.status !== "OK" && response.status !== "ZERO_RESULTS") {
            this.logWarn(`Google API status: ${response.status}`, {
              error: response.error_message,
            });
            continue;
          }

          // Convertir les résultats
          let addedFromThisQuery = 0;
          for (const place of response.results || []) {
            if (seenIds.has(place.place_id)) continue;
            if (allPlaces.length >= limit) break;

            // Filtrer les établissements fermés
            if (place.business_status === "CLOSED_PERMANENTLY") continue;

            seenIds.add(place.place_id);
            const rawPlace = this.convertToRawPlace(place, city);
            allPlaces.push(rawPlace);
            addedFromThisQuery++;
          }

          this.logInfo(`  -> Added ${addedFromThisQuery} new places (total: ${allPlaces.length})`);

          // Pagination complète - suivre toutes les 3 pages disponibles (max Google)
          let pageToken = response.next_page_token;
          let pageNum = 1;
          while (pageToken && allPlaces.length < limit && pageNum <= 3) {
            // Google demande un délai avant d'utiliser le token
            await new Promise((r) => setTimeout(r, 2000));

            const nextUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/textsearch/json`);
            nextUrl.searchParams.set("pagetoken", pageToken);
            nextUrl.searchParams.set("key", this.apiKey);

            const nextResponse = await this.executeWithRateLimit(async () => {
              const res = await fetch(nextUrl.toString());
              if (!res.ok) throw new Error(`Google API error: ${res.status}`);
              return res.json() as Promise<GoogleTextSearchResponse>;
            });

            if (nextResponse.status !== "OK") break;

            let addedFromPage = 0;
            for (const place of nextResponse.results || []) {
              if (seenIds.has(place.place_id)) continue;
              if (allPlaces.length >= limit) break;
              if (place.business_status === "CLOSED_PERMANENTLY") continue;

              seenIds.add(place.place_id);
              const rawPlace = this.convertToRawPlace(place, city);
              allPlaces.push(rawPlace);
              addedFromPage++;
            }

            this.logInfo(`  -> Page ${pageNum + 1}: Added ${addedFromPage} new places (total: ${allPlaces.length})`);

            pageToken = nextResponse.next_page_token;
            pageNum++;
          }
        }
      }

      this.logInfo(`✅ Found ${allPlaces.length} unique places in ${city}`, {
        category,
        keywords,
        searchPoints: searchPoints.length,
      });

      return this.createSuccessResult(
        `${GOOGLE_PLACES_BASE_URL}/textsearch`,
        allPlaces,
        Date.now() - startTime,
        200
      );
    } catch (error) {
      this.logError(`Search failed for ${city}`, {
        error: (error as Error).message,
      });
      return this.createErrorResult(
        `${GOOGLE_PLACES_BASE_URL}/textsearch`,
        error as Error,
        Date.now() - startTime
      );
    }
  }

  async getDetails(placeId: string): Promise<RawPlace | null> {
    try {
      const detailsUrl = new URL(`${GOOGLE_PLACES_BASE_URL}/details/json`);
      detailsUrl.searchParams.set("place_id", placeId);
      detailsUrl.searchParams.set(
        "fields",
        "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,geometry,opening_hours,price_level,rating,user_ratings_total,photos,types,url,vicinity"
      );
      detailsUrl.searchParams.set("key", this.apiKey);
      detailsUrl.searchParams.set("language", "fr");

      const response = await this.executeWithRateLimit(async () => {
        const res = await fetch(detailsUrl.toString());
        if (!res.ok) throw new Error(`Google API error: ${res.status}`);
        return res.json() as Promise<GooglePlaceDetailsResponse>;
      });

      if (response.status !== "OK" || !response.result) {
        this.logWarn(`Place details not found: ${placeId}`);
        return null;
      }

      return this.convertToRawPlace(response.result);
    } catch (error) {
      this.logError(`Failed to get details for ${placeId}`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Convertit un résultat Google Places en RawPlace
   */
  private convertToRawPlace(
    place: GooglePlaceResult,
    defaultCity?: string
  ): RawPlace {
    // Extraire les photos
    const photos: RawPhoto[] =
      place.photos?.slice(0, 5).map((photo) => ({
        url: this.getPhotoUrl(photo.photo_reference),
        width: photo.width,
        height: photo.height,
      })) || [];

    // Convertir les horaires
    const openingHours = this.convertOpeningHours(place.opening_hours);

    // Deviner la catégorie depuis les types
    const category = this.guessCategory(place.types || []);

    return {
      source: "google",
      sourceUrl: place.url || `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
      externalId: place.place_id,
      fetchedAt: new Date().toISOString(),

      name: place.name,
      category,
      description: undefined,

      address: place.formatted_address || place.vicinity,
      city: defaultCity || this.extractCityFromAddress(place.formatted_address),
      neighborhood: place.vicinity,

      phone: place.international_phone_number || place.formatted_phone_number,
      website: place.website,

      latitude: place.geometry?.location.lat,
      longitude: place.geometry?.location.lng,
      googleMapsUrl: place.url,

      openingHours,
      priceRange: this.convertPriceLevel(place.price_level),
      rating: place.rating,
      reviewCount: place.user_ratings_total,

      photos,
      tags: place.types?.filter((t) => !t.includes("point_of_interest")),

      rawData: {
        place_id: place.place_id,
        business_status: place.business_status,
        types: place.types,
      },
    };
  }

  /**
   * Génère l'URL d'une photo Google Places
   */
  private getPhotoUrl(photoReference: string, maxWidth: number = 800): string {
    return `${GOOGLE_PLACES_BASE_URL}/photo?maxwidth=${maxWidth}&photo_reference=${photoReference}&key=${this.apiKey}`;
  }

  /**
   * Convertit les horaires Google en format standard
   */
  private convertOpeningHours(
    googleHours: GooglePlaceResult["opening_hours"]
  ): OpeningHours | undefined {
    if (!googleHours?.weekday_text?.length) return undefined;

    const dayMapping: Record<string, keyof OpeningHours> = {
      lundi: "monday",
      mardi: "tuesday",
      mercredi: "wednesday",
      jeudi: "thursday",
      vendredi: "friday",
      samedi: "saturday",
      dimanche: "sunday",
    };

    const hours: OpeningHours = {};

    for (const text of googleHours.weekday_text) {
      // Format: "lundi: 09:00 – 22:00" ou "lundi: Fermé"
      const [dayFr, time] = text.split(": ");
      const dayKey = dayMapping[dayFr?.toLowerCase()];
      if (dayKey && time) {
        hours[dayKey] = time;
      }
    }

    return hours;
  }

  /**
   * Convertit le price_level Google (0-4) en string
   */
  private convertPriceLevel(level: number | undefined): string | undefined {
    if (level === undefined || level === null) return undefined;
    return "€".repeat(Math.max(1, level));
  }

  /**
   * Devine la catégorie CHR depuis les types Google
   */
  private guessCategory(types: string[]): string | undefined {
    if (types.includes("night_club")) return "club";
    if (types.includes("bar")) return "bar";
    if (types.includes("cafe")) return "cafe";
    if (types.includes("bakery")) return "boulangerie";
    if (types.includes("meal_takeaway") || types.includes("fast_food_restaurant"))
      return "fast_food";
    if (types.includes("restaurant")) return "restaurant";
    return undefined;
  }

  /**
   * Extrait la ville de l'adresse formatée
   */
  private extractCityFromAddress(address: string | undefined): string {
    if (!address) return "";

    // Pattern: "..., Ville CODE, Maroc" ou "..., Ville, Maroc"
    const parts = address.split(",").map((p) => p.trim());

    // Chercher Maroc ou Morocco
    const marocIndex = parts.findIndex(
      (p) => p.toLowerCase().includes("maroc") || p.toLowerCase().includes("morocco")
    );

    if (marocIndex > 0) {
      // La ville est généralement avant le pays
      const cityPart = parts[marocIndex - 1];
      // Enlever le code postal s'il y en a un
      return cityPart.replace(/\d+/g, "").trim();
    }

    return "";
  }
}

// ============================================
// EXPORT ET ENREGISTREMENT
// ============================================

export function createGooglePlacesConnector(
  config?: Partial<ConnectorConfig>
): GooglePlacesConnector {
  const connector = new GooglePlacesConnector(config);
  registerConnector(connector);
  return connector;
}
