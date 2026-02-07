/**
 * Best Restaurants Maroc Scraper - SAM Import CHR
 *
 * Scrape les établissements depuis bestrestaurantsmaroc.com
 * Structure: /fr/recherche/ville/[nom-ville].html
 */

import type {
  RawPlace,
  ConnectorConfig,
  ConnectorResult,
  RawPhoto,
  SocialLinks,
} from "./types";
import {
  BaseConnector,
  type SearchParams,
  registerConnector,
} from "./base";
import { extractSocialLinks } from "../utils";

// ============================================
// CONFIGURATION
// ============================================

const BASE_URL = "https://bestrestaurantsmaroc.com";

// Mapping villes -> slug URL
const CITY_SLUGS: Record<string, string> = {
  marrakech: "marrakech",
  casablanca: "casablanca",
  rabat: "rabat",
  tanger: "tanger",
  agadir: "agadir",
  essaouira: "essaouira",
  fes: "fes",
  fès: "fes",
  ouarzazate: "ouarzazate",
  taghazout: "taghazout",
  beni_mellal: "beni-mellal",
  benimellal: "beni-mellal",
  "beni mellal": "beni-mellal",
  bouskoura: "bouskoura",
  "dar bouazza": "dar-bouazza",
  darbouazza: "dar-bouazza",
  "desert agafay": "desert-agafay-desert-maroc",
  agafay: "desert-agafay-desert-maroc",
};

// ============================================
// HELPERS
// ============================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

// ============================================
// CONNECTOR
// ============================================

export class BestRestaurantsMarocConnector extends BaseConnector {
  readonly source = "bestrestaurantsmaroc" as const;

  constructor(config: Partial<ConnectorConfig> = {}) {
    super({
      rateLimitPerSecond: 0.5, // Très respectueux
      respectRobots: true,
      userAgent: "SAM-Import-Bot/1.0 (+https://sam.ma/bot)",
      ...config,
    });
    this.initRateLimiter();
  }

  async search(params: SearchParams): Promise<ConnectorResult> {
    const startTime = Date.now();
    const { city, category, keywords, limit = 50 } = params;

    // Normaliser le nom de ville
    const normalizedCity = city.toLowerCase().replace(/[_-]/g, " ").trim();
    const citySlug = CITY_SLUGS[normalizedCity] || CITY_SLUGS[city.toLowerCase()];

    if (!citySlug) {
      this.logInfo(`City ${city} not in predefined list, trying direct slug`);
    }

    const allPlaces: RawPlace[] = [];
    const seenUrls = new Set<string>();

    try {
      // URL de recherche par ville
      const searchSlug = citySlug || city.toLowerCase().replace(/\s+/g, "-");
      const listUrl = `${BASE_URL}/fr/recherche/ville/${searchSlug}.html`;
      this.logInfo(`Fetching: ${listUrl}`);

      const listHtml = await this.fetchPage(listUrl);
      if (!listHtml) {
        return this.createSuccessResult(BASE_URL, [], Date.now() - startTime, 200);
      }

      // Extraire les liens vers les fiches restaurant
      const restaurantLinks = this.extractRestaurantLinks(listHtml);
      this.logInfo(`Found ${restaurantLinks.length} restaurant links for ${city}`);

      for (const link of restaurantLinks) {
        if (allPlaces.length >= limit) break;
        if (seenUrls.has(link)) continue;
        seenUrls.add(link);

        // Filtrer par keywords si spécifiés
        if (keywords?.length) {
          const linkLower = link.toLowerCase();
          if (!keywords.some((kw) => linkLower.includes(kw.toLowerCase()))) {
            continue;
          }
        }

        const fullUrl = link.startsWith("http") ? link : `${BASE_URL}${link}`;

        try {
          const place = await this.scrapeRestaurantPage(fullUrl, city, category);
          if (place) {
            allPlaces.push(place);
            this.logInfo(`Scraped: ${place.name}`);
          }
        } catch (err) {
          this.logWarn(`Failed to scrape: ${fullUrl}`, {
            error: (err as Error).message,
          });
        }
      }

      this.logInfo(`Scraped ${allPlaces.length} places from Best Restaurants Maroc for ${city}`);

      return this.createSuccessResult(
        BASE_URL,
        allPlaces,
        Date.now() - startTime,
        200
      );
    } catch (error) {
      this.logError(`Search failed for ${city}`, {
        error: (error as Error).message,
      });
      return this.createErrorResult(
        BASE_URL,
        error as Error,
        Date.now() - startTime
      );
    }
  }

  async getDetails(url: string): Promise<RawPlace | null> {
    try {
      return await this.scrapeRestaurantPage(url);
    } catch (error) {
      this.logError(`Failed to get details: ${url}`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Récupère une page HTML
   */
  private async fetchPage(url: string): Promise<string | null> {
    return this.executeWithRateLimit(async () => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.userAgent || "Mozilla/5.0 (compatible; SAM-Bot/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limited");
        }
        if (response.status === 404) {
          this.logInfo(`Page not found: ${url}`);
          return null;
        }
        this.logWarn(`HTTP ${response.status} for ${url}`);
        return null;
      }

      return response.text();
    });
  }

  /**
   * Extrait les liens vers les fiches restaurant
   */
  private extractRestaurantLinks(html: string): string[] {
    const links: string[] = [];

    // Pattern pour les liens de restaurants sur bestrestaurantsmaroc
    // Structure typique: /fr/restaurants/[slug].html ou /fr/[ville]/[slug].html
    const patterns = [
      /<a[^>]+href=["'](\/fr\/restaurants\/[^"']+\.html)["']/gi,
      /<a[^>]+href=["'](\/fr\/[^\/]+\/[^"']+\.html)["']/gi,
      /<a[^>]+href=["'](https?:\/\/(?:www\.)?bestrestaurantsmaroc\.com\/fr\/[^"']+\.html)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let href = match[1];

        // Normaliser en path relatif
        if (href.startsWith("http")) {
          try {
            const url = new URL(href);
            href = url.pathname;
          } catch {
            continue;
          }
        }

        // Filtrer les liens de navigation
        if (
          href &&
          href.includes(".html") &&
          !href.includes("/recherche/") &&
          !href.includes("/page/") &&
          !href.includes("/contact") &&
          !href.includes("/about") &&
          !href.includes("/mentions") &&
          !links.includes(href)
        ) {
          links.push(href);
        }
      }
    }

    return links;
  }

  /**
   * Scrape une page de fiche restaurant
   */
  private async scrapeRestaurantPage(
    url: string,
    defaultCity?: string,
    defaultCategory?: string
  ): Promise<RawPlace | null> {
    const html = await this.fetchPage(url);
    if (!html) return null;

    // Extraire le nom
    const name = this.extractName(html);
    if (!name) {
      this.logWarn(`Could not extract name from: ${url}`);
      return null;
    }

    // Extraire les autres champs
    const address = this.extractAddress(html);
    const phone = this.extractPhone(html);
    const website = this.extractWebsite(html);
    const photos = this.extractPhotos(html);
    const socialLinks = this.extractSocialLinksFromPage(html);
    const description = this.extractDescription(html);
    const coords = this.extractCoordinates(html);
    const tags = this.extractTags(html);
    const priceRange = this.extractPriceRange(html);
    const city = this.extractCityFromContent(html) || defaultCity;

    return {
      source: "bestrestaurantsmaroc",
      sourceUrl: url,
      externalId: this.generateExternalId(url),
      fetchedAt: new Date().toISOString(),

      name: decodeHtmlEntities(name),
      category: defaultCategory || "restaurant", // Ce site est spécialisé restaurants
      description: description ? decodeHtmlEntities(description) : undefined,

      address: address ? decodeHtmlEntities(address) : undefined,
      city: city || "",

      phone,
      website,
      priceRange,

      latitude: coords?.lat,
      longitude: coords?.lng,

      photos,
      socialLinks,
      tags,

      rawData: {
        url,
        scrapedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Extrait le nom de l'établissement
   */
  private extractName(html: string): string | undefined {
    const patterns = [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<h1[^>]*class=["'][^"']*(?:title|name)[^"']*["'][^>]*>([^<]+)</i,
      /<h1[^>]*>([^<]+)</i,
      /<title[^>]*>([^<]+)</i,
    ];

    for (const regex of patterns) {
      const match = html.match(regex);
      if (match?.[1]) {
        const title = stripHtml(match[1]);
        return title
          .replace(/\s*[-|–]\s*Best\s*Restaurants?\s*Maroc.*/i, "")
          .replace(/\s*[-|–]\s*bestrestaurantsmaroc.*/i, "")
          .trim();
      }
    }

    return undefined;
  }

  /**
   * Extrait l'adresse
   */
  private extractAddress(html: string): string | undefined {
    const patterns = [
      /<[^>]+itemprop=["']streetAddress["'][^>]*>([^<]+)</i,
      /<[^>]+itemprop=["']address["'][^>]*>([^<]+)</i,
      /<[^>]+class=["'][^"']*(?:address|adresse|location)[^"']*["'][^>]*>([^<]{10,200})</i,
      /(?:adresse|address|lieu)\s*:\s*([^<]{10,200})/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const addr = stripHtml(match[1]);
        if (addr.length > 5) return addr;
      }
    }

    return undefined;
  }

  /**
   * Extrait le numéro de téléphone
   */
  private extractPhone(html: string): string | undefined {
    const patterns = [
      /href=["']tel:([^"']+)["']/i,
      /<[^>]+itemprop=["']telephone["'][^>]*>([^<]+)</i,
      /((?:\+212|00212|0)[\s.-]?[5-7][\s\d.-]{8,14})/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1].replace(/[\s.-]/g, "").replace(/^00/, "+");
      }
    }

    return undefined;
  }

  /**
   * Extrait le site web
   */
  private extractWebsite(html: string): string | undefined {
    const patterns = [
      /<a[^>]+href=["'](https?:\/\/(?!(?:www\.)?(?:facebook|instagram|twitter|tiktok|youtube|wa\.me|bestrestaurantsmaroc))[^"']+)["'][^>]*>[\s\S]*?(?:site\s*web|website|visiter)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && !match[1].includes("bestrestaurantsmaroc")) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extrait les photos
   */
  private extractPhotos(html: string): RawPhoto[] {
    const photos: RawPhoto[] = [];
    const seenUrls = new Set<string>();

    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
      /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:gallery|slider|photo|main|featured)[^"']*["']/gi,
      /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && photos.length < 10) {
        let url = match[1];

        if (
          url &&
          !seenUrls.has(url) &&
          !url.includes("logo") &&
          !url.includes("icon") &&
          !url.includes("avatar") &&
          url.length > 10
        ) {
          if (url.startsWith("//")) {
            url = "https:" + url;
          } else if (url.startsWith("/")) {
            url = BASE_URL + url;
          }

          if (url.startsWith("http")) {
            seenUrls.add(url);
            photos.push({
              url,
              credit: "bestrestaurantsmaroc.com",
            });
          }
        }
      }
    }

    return photos;
  }

  /**
   * Extrait les liens sociaux
   */
  private extractSocialLinksFromPage(html: string): SocialLinks | undefined {
    const links: string[] = [];

    const pattern = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|twitter\.com|tiktok\.com)\/[^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      links.push(match[1]);
    }

    const waPattern = /<a[^>]+href=["'](https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"']+)["']/gi;
    while ((match = waPattern.exec(html)) !== null) {
      links.push(match[1]);
    }

    if (links.length === 0) return undefined;

    return extractSocialLinks(links);
  }

  /**
   * Extrait la description
   */
  private extractDescription(html: string): string | undefined {
    const patterns = [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const desc = stripHtml(match[1]);
        if (desc.length > 20 && desc.length < 1000) {
          return desc;
        }
      }
    }

    return undefined;
  }

  /**
   * Extrait les coordonnées GPS
   */
  private extractCoordinates(html: string): { lat: number; lng: number } | undefined {
    const patterns = [
      /"latitude":\s*["']?(-?\d+\.?\d*)["']?,?\s*"longitude":\s*["']?(-?\d+\.?\d*)["']?/,
      /google\.com\/maps[^"']*[@/](-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /data-lat=["'](-?\d+\.?\d*)["'][^>]*data-lng=["'](-?\d+\.?\d*)["']/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && match?.[2]) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lng) && lat > 20 && lat < 40 && lng > -20 && lng < 0) {
          return { lat, lng };
        }
      }
    }

    return undefined;
  }

  /**
   * Extrait les tags
   */
  private extractTags(html: string): string[] {
    const tags: string[] = [];

    const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
    if (keywordsMatch?.[1]) {
      tags.push(...keywordsMatch[1].split(",").map((t) => t.trim().toLowerCase()).filter(t => t.length > 2));
    }

    // Cuisine type
    const cuisineMatch = html.match(/cuisine\s*:\s*([^<,]{3,50})/i);
    if (cuisineMatch?.[1]) {
      tags.push(stripHtml(cuisineMatch[1]).toLowerCase());
    }

    return [...new Set(tags)].slice(0, 15);
  }

  /**
   * Extrait la gamme de prix
   */
  private extractPriceRange(html: string): string | undefined {
    // Chercher des indicateurs de prix
    const priceMatch = html.match(/(?:prix|price|budget)\s*:\s*([€$]{1,4}|[\d\s-]+(?:dh|mad|€))/i);
    if (priceMatch?.[1]) {
      const price = priceMatch[1].trim();
      const euroCount = (price.match(/€/g) || []).length;
      if (euroCount > 0) return "€".repeat(euroCount);
      if (price.includes("$")) return price;
    }
    return undefined;
  }

  /**
   * Extrait la ville depuis le contenu
   */
  private extractCityFromContent(html: string): string | undefined {
    const cities = Object.keys(CITY_SLUGS);
    const htmlLower = html.toLowerCase();

    for (const city of cities) {
      // Chercher dans des patterns structurés
      if (
        htmlLower.includes(`"${city}"`) ||
        htmlLower.includes(`>${city}<`) ||
        htmlLower.includes(`ville: ${city}`) ||
        htmlLower.includes(`city: ${city}`)
      ) {
        return city;
      }
    }

    return undefined;
  }

  /**
   * Génère un ID externe depuis l'URL
   */
  private generateExternalId(url: string): string {
    try {
      const path = new URL(url).pathname;
      return path.replace(/^\//, "").replace(/\/$/, "").replace(/\.html$/, "").replace(/\//g, "_");
    } catch {
      return url.replace(/[^a-z0-9]/gi, "_");
    }
  }
}

// ============================================
// EXPORT ET ENREGISTREMENT
// ============================================

export function createBestRestaurantsMarocConnector(
  config?: Partial<ConnectorConfig>
): BestRestaurantsMarocConnector {
  const connector = new BestRestaurantsMarocConnector(config);
  registerConnector(connector);
  return connector;
}
