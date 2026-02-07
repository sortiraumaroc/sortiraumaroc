/**
 * Marrakech Best Of Scraper - SAM Import CHR
 *
 * Scrape les établissements depuis marrakechbestof.com
 * Structure: /categorie-bon-plan/[category]/
 * Focus exclusif sur Marrakech
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

const BASE_URL = "https://marrakechbestof.com";

// Mapping catégorie CHR -> paths sur le site
const CATEGORY_PATHS: Record<string, string[]> = {
  restaurant: ["/categorie-bon-plan/restaurants/"],
  rooftop: ["/categorie-bon-plan/piscines/"], // Souvent combiné avec piscines
  club: ["/categorie-bon-plan/activites/"], // Inclut nightlife
  lounge: ["/categorie-bon-plan/spas/"], // Lounges spa
  cafe: [], // Pas de catégorie dédiée
  bar: [], // Pas de catégorie dédiée
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

export class MarrakechBestOfConnector extends BaseConnector {
  readonly source = "marrakechbestof" as const;

  constructor(config: Partial<ConnectorConfig> = {}) {
    super({
      enabled: false, // DÉSACTIVÉ: Le site charge le contenu via AJAX, nécessite headless browser
      rateLimitPerSecond: 0.5,
      respectRobots: true,
      userAgent: "SAM-Import-Bot/1.0 (+https://sam.ma/bot)",
      ...config,
    });
    this.initRateLimiter();
  }

  async search(params: SearchParams): Promise<ConnectorResult> {
    const startTime = Date.now();
    const { city, category, keywords, limit = 50 } = params;

    // Ce site est exclusivement pour Marrakech
    const normalizedCity = city.toLowerCase().replace(/[_-]/g, " ").trim();
    if (!normalizedCity.includes("marrakech") && normalizedCity !== "agafay") {
      this.logInfo(`City ${city} not supported - Marrakech Best Of is Marrakech-only`);
      return this.createSuccessResult(BASE_URL, [], Date.now() - startTime, 200);
    }

    const allPlaces: RawPlace[] = [];
    const seenUrls = new Set<string>();

    try {
      // Déterminer les paths à scraper
      let paths: string[];
      if (category) {
        paths = CATEGORY_PATHS[category] || [];
        if (paths.length === 0) {
          // Catégorie non supportée
          this.logInfo(`Category ${category} not available on Marrakech Best Of`);
          return this.createSuccessResult(BASE_URL, [], Date.now() - startTime, 200);
        }
      } else {
        // Toutes les catégories avec du contenu CHR
        paths = [
          "/categorie-bon-plan/restaurants/",
          "/categorie-bon-plan/piscines/",
          "/categorie-bon-plan/activites/",
        ];
      }

      for (const path of paths) {
        if (allPlaces.length >= limit) break;

        const listUrl = `${BASE_URL}${path}`;
        this.logInfo(`Fetching: ${listUrl}`);

        try {
          const listHtml = await this.fetchPage(listUrl);
          if (!listHtml) continue;

          // Extraire les liens vers les fiches
          const placeLinks = this.extractPlaceLinks(listHtml);
          this.logInfo(`Found ${placeLinks.length} links on ${path}`);

          for (const link of placeLinks) {
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
              const place = await this.scrapePlacePage(fullUrl, "marrakech", category);
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
        } catch (err) {
          this.logWarn(`Failed to fetch list: ${listUrl}`, {
            error: (err as Error).message,
          });
        }
      }

      this.logInfo(`Scraped ${allPlaces.length} places from Marrakech Best Of`);

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
      return await this.scrapePlacePage(url);
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
        this.logWarn(`HTTP ${response.status} for ${url}`);
        return null;
      }

      return response.text();
    });
  }

  /**
   * Extrait les liens vers les fiches établissement
   */
  private extractPlaceLinks(html: string): string[] {
    const links: string[] = [];

    // Pattern pour les liens sur marrakechbestof
    const patterns = [
      // Liens vers des pages de détail
      /<a[^>]+href=["'](\/[^"']+\/[^"']+\/)["'][^>]*class=["'][^"']*(?:card|article|item)[^"']*["']/gi,
      /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?(?:découvrir|voir|réserver)/gi,
      // Articles dans la liste
      /<article[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let href = match[1];

        // Normaliser
        if (href.startsWith("http") && !href.includes("marrakechbestof.com")) {
          continue;
        }

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
          !href.includes("/categorie-bon-plan/") &&
          !href.includes("/blog/") &&
          !href.includes("/contact") &&
          !href.includes("/about") &&
          !href.includes("#") &&
          !links.includes(href) &&
          href.length > 5
        ) {
          links.push(href);
        }
      }
    }

    return links;
  }

  /**
   * Scrape une page de fiche
   */
  private async scrapePlacePage(
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
    const category = defaultCategory || this.guessCategoryFromContent(html, url);

    return {
      source: "marrakechbestof",
      sourceUrl: url,
      externalId: this.generateExternalId(url),
      fetchedAt: new Date().toISOString(),

      name: decodeHtmlEntities(name),
      category,
      description: description ? decodeHtmlEntities(description) : undefined,

      address: address ? decodeHtmlEntities(address) : undefined,
      city: defaultCity || "marrakech",

      phone,
      website,

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
      /<h1[^>]*>([^<]+)</i,
      /<title[^>]*>([^<]+)</i,
    ];

    for (const regex of patterns) {
      const match = html.match(regex);
      if (match?.[1]) {
        const title = stripHtml(match[1]);
        return title
          .replace(/\s*[-|–]\s*Marrakech\s*Best\s*Of.*/i, "")
          .replace(/\s*[-|–]\s*marrakechbestof.*/i, "")
          .replace(/\s*à\s*Marrakech.*/i, "")
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
      /<a[^>]+href=["'](https?:\/\/(?!(?:www\.)?(?:facebook|instagram|twitter|tiktok|youtube|wa\.me|marrakechbestof))[^"']+)["'][^>]*>[\s\S]*?(?:site\s*web|website|visiter|réserver)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && !match[1].includes("marrakechbestof")) {
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
      /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:gallery|slider|photo|main|featured|hero)[^"']*["']/gi,
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
              credit: "marrakechbestof.com",
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
        // Vérifier que c'est à Marrakech (environ)
        if (!isNaN(lat) && !isNaN(lng) && lat > 31 && lat < 32 && lng > -8.5 && lng < -7) {
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

    return [...new Set(tags)].slice(0, 15);
  }

  /**
   * Devine la catégorie depuis le contenu
   */
  private guessCategoryFromContent(html: string, url: string): string | undefined {
    const lower = (html + url).toLowerCase();

    if (lower.includes("restaurant") || lower.includes("gastronomie") || lower.includes("dîner")) return "restaurant";
    if (lower.includes("piscine") || lower.includes("pool") || lower.includes("rooftop")) return "rooftop";
    if (lower.includes("spa") || lower.includes("hammam")) return "lounge";
    if (lower.includes("club") || lower.includes("nightlife") || lower.includes("soirée")) return "club";

    return undefined;
  }

  /**
   * Génère un ID externe depuis l'URL
   */
  private generateExternalId(url: string): string {
    try {
      const path = new URL(url).pathname;
      return path.replace(/^\//, "").replace(/\/$/, "").replace(/\//g, "_");
    } catch {
      return url.replace(/[^a-z0-9]/gi, "_");
    }
  }
}

// ============================================
// EXPORT ET ENREGISTREMENT
// ============================================

export function createMarrakechBestOfConnector(
  config?: Partial<ConnectorConfig>
): MarrakechBestOfConnector {
  const connector = new MarrakechBestOfConnector(config);
  registerConnector(connector);
  return connector;
}
