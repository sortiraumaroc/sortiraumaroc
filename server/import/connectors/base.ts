/**
 * Base Connector - SAM Import CHR
 *
 * Interface abstraite pour tous les connecteurs d'import.
 */

import type {
  ImportSource,
  RawPlace,
  ConnectorConfig,
  ConnectorResult,
} from "./types";
import { createRateLimiter, logImport, withRetry } from "../utils";

// ============================================
// CONFIGURATION PAR DÉFAUT
// ============================================

export const DEFAULT_CONNECTOR_CONFIG: ConnectorConfig = {
  enabled: true,
  rateLimitPerSecond: 1,
  maxRetries: 3,
  timeoutMs: 30000,
  userAgent: "SAM-Import-Bot/1.0 (+https://sam.ma)",
  respectRobots: true,
};

// ============================================
// INTERFACE CONNECTEUR
// ============================================

export interface SearchParams {
  city: string;
  category?: string;
  keywords?: string[];
  limit?: number;
}

export interface Connector {
  readonly source: ImportSource;
  readonly config: ConnectorConfig;

  /**
   * Recherche des établissements
   */
  search(params: SearchParams): Promise<ConnectorResult>;

  /**
   * Récupère les détails d'un établissement
   */
  getDetails(externalId: string): Promise<RawPlace | null>;

  /**
   * Vérifie si le connecteur est disponible
   */
  isAvailable(): Promise<boolean>;
}

// ============================================
// CLASSE ABSTRAITE
// ============================================

export abstract class BaseConnector implements Connector {
  abstract readonly source: ImportSource;
  readonly config: ConnectorConfig;
  protected rateLimiter!: ReturnType<typeof createRateLimiter>;

  constructor(config: Partial<ConnectorConfig> = {}) {
    this.config = { ...DEFAULT_CONNECTOR_CONFIG, ...config };
  }

  /**
   * Initialise le rate limiter - doit être appelé après la définition de source
   */
  protected initRateLimiter(): void {
    this.rateLimiter = createRateLimiter(
      `connector-${this.source}`,
      this.config.rateLimitPerSecond
    );
  }

  /**
   * Méthode abstraite à implémenter par chaque connecteur
   */
  abstract search(params: SearchParams): Promise<ConnectorResult>;

  /**
   * Récupère les détails (par défaut: non implémenté)
   */
  async getDetails(_externalId: string): Promise<RawPlace | null> {
    return null;
  }

  /**
   * Vérifie si le connecteur est disponible
   */
  async isAvailable(): Promise<boolean> {
    return this.config.enabled;
  }

  /**
   * Exécute une requête avec rate limiting et retry
   */
  protected async executeWithRateLimit<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    await this.rateLimiter.acquire();
    return withRetry(fn, {
      maxRetries: this.config.maxRetries,
    });
  }

  /**
   * Log une info
   */
  protected logInfo(message: string, data?: Record<string, unknown>): void {
    logImport("info", this.source, message, data);
  }

  /**
   * Log un warning
   */
  protected logWarn(message: string, data?: Record<string, unknown>): void {
    logImport("warn", this.source, message, data);
  }

  /**
   * Log une erreur
   */
  protected logError(message: string, data?: Record<string, unknown>): void {
    logImport("error", this.source, message, data);
  }

  /**
   * Crée un résultat d'erreur
   */
  protected createErrorResult(
    sourceUrl: string,
    error: Error,
    durationMs: number
  ): ConnectorResult {
    return {
      source: this.source,
      sourceUrl,
      success: false,
      durationMs,
      places: [],
      error: error.message,
      rateLimited: error.message.includes("rate") || error.message.includes("429"),
    };
  }

  /**
   * Crée un résultat de succès
   */
  protected createSuccessResult(
    sourceUrl: string,
    places: RawPlace[],
    durationMs: number,
    statusCode?: number
  ): ConnectorResult {
    return {
      source: this.source,
      sourceUrl,
      success: true,
      statusCode,
      durationMs,
      places,
    };
  }
}

// ============================================
// REGISTRY DES CONNECTEURS
// ============================================

const connectorRegistry = new Map<ImportSource, Connector>();

/**
 * Enregistre un connecteur
 */
export function registerConnector(connector: Connector): void {
  connectorRegistry.set(connector.source, connector);
}

/**
 * Récupère un connecteur
 */
export function getConnector(source: ImportSource): Connector | undefined {
  return connectorRegistry.get(source);
}

/**
 * Récupère tous les connecteurs disponibles
 */
export function getAvailableConnectors(): Connector[] {
  return Array.from(connectorRegistry.values()).filter((c) => c.config.enabled);
}

/**
 * Liste les sources disponibles
 */
export function getAvailableSources(): ImportSource[] {
  return getAvailableConnectors().map((c) => c.source);
}
