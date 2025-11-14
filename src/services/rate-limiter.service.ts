/**
 * Rate Limiter Service
 * Manages scraping rate limits to avoid detection and bans
 */

import { Logger } from '../config/logger';

const logger = Logger.getInstance();

interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxConcurrentScrapes: number;
  retryAfterMs: number;
  backoffMultiplier: number;
}

interface RequestRecord {
  timestamp: number;
  success: boolean;
}

export class RateLimiterService {
  private static instance: RateLimiterService;
  private requestHistory: RequestRecord[] = [];
  private activeScrapes = 0;
  private isRateLimited = false;
  private rateLimitUntil: number = 0;

  private config: RateLimitConfig = {
    maxRequestsPerMinute: 10, // Máximo 10 scrapes por minuto
    maxConcurrentScrapes: 3,   // Máximo 3 scrapes simultáneos
    retryAfterMs: 60000,       // Esperar 1 minuto después de rate limit
    backoffMultiplier: 2,      // Duplicar tiempo de espera en cada fallo
  };

  private constructor() {
    // Limpiar historial cada 5 minutos
    setInterval(() => this.cleanOldRecords(), 5 * 60 * 1000);
  }

  static getInstance(): RateLimiterService {
    if (!RateLimiterService.instance) {
      RateLimiterService.instance = new RateLimiterService();
    }
    return RateLimiterService.instance;
  }

  /**
   * Verifica si podemos hacer una nueva solicitud
   */
  canMakeRequest(): boolean {
    // Verificar si estamos en período de rate limit
    if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
      const remainingSeconds = Math.ceil((this.rateLimitUntil - Date.now()) / 1000);
      logger.warn(`⏳ Rate limited. Retry in ${remainingSeconds} seconds`);
      return false;
    }

    // Restaurar si el período terminó
    if (this.isRateLimited && Date.now() >= this.rateLimitUntil) {
      logger.info('✅ Rate limit period ended, resuming requests');
      this.isRateLimited = false;
    }

    // Verificar límite de solicitudes concurrentes
    if (this.activeScrapes >= this.config.maxConcurrentScrapes) {
      logger.warn(`⏸️  Max concurrent scrapes reached (${this.activeScrapes}/${this.config.maxConcurrentScrapes})`);
      return false;
    }

    // Verificar límite de solicitudes por minuto
    const recentRequests = this.getRequestsInLastMinute();
    if (recentRequests >= this.config.maxRequestsPerMinute) {
      logger.warn(`⏸️  Max requests per minute reached (${recentRequests}/${this.config.maxRequestsPerMinute})`);
      return false;
    }

    return true;
  }

  /**
   * Espera hasta que se pueda hacer una solicitud
   */
  async waitForAvailability(): Promise<void> {
    while (!this.canMakeRequest()) {
      // Esperar 5 segundos antes de verificar nuevamente
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  /**
   * Registra el inicio de un scrape
   */
  startScrape(): void {
    this.activeScrapes++;
    logger.debug(`🚀 Scrape started (active: ${this.activeScrapes}/${this.config.maxConcurrentScrapes})`);
  }

  /**
   * Registra el fin de un scrape (exitoso o fallido)
   */
  endScrape(success: boolean = true): void {
    this.activeScrapes = Math.max(0, this.activeScrapes - 1);
    
    this.requestHistory.push({
      timestamp: Date.now(),
      success
    });

    logger.debug(`✅ Scrape ended (active: ${this.activeScrapes}, success: ${success})`);
  }

  /**
   * Registra un rate limit detectado (HTTP 429, CAPTCHA, etc.)
   */
  recordRateLimit(retryAfterSeconds?: number): void {
    const waitTime = retryAfterSeconds 
      ? retryAfterSeconds * 1000 
      : this.config.retryAfterMs;

    this.isRateLimited = true;
    this.rateLimitUntil = Date.now() + waitTime;

    logger.error(`🚨 RATE LIMIT DETECTED! Waiting ${Math.ceil(waitTime / 1000)} seconds`);
    logger.warn('💡 Tip: Reduce scraping frequency or implement proxy rotation');
  }

  /**
   * Obtiene el número de solicitudes en el último minuto
   */
  private getRequestsInLastMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    return this.requestHistory.filter(r => r.timestamp > oneMinuteAgo).length;
  }

  /**
   * Limpia registros antiguos (>5 minutos)
   */
  private cleanOldRecords(): void {
    const fiveMinutesAgo = Date.now() - 5 * 60000;
    const before = this.requestHistory.length;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > fiveMinutesAgo);
    const cleaned = before - this.requestHistory.length;
    
    if (cleaned > 0) {
      logger.debug(`🧹 Cleaned ${cleaned} old request records`);
    }
  }

  /**
   * Obtiene estadísticas del rate limiter
   */
  getStats() {
    return {
      activeScrapes: this.activeScrapes,
      maxConcurrent: this.config.maxConcurrentScrapes,
      requestsLastMinute: this.getRequestsInLastMinute(),
      maxPerMinute: this.config.maxRequestsPerMinute,
      isRateLimited: this.isRateLimited,
      rateLimitEndsIn: this.isRateLimited 
        ? Math.ceil((this.rateLimitUntil - Date.now()) / 1000)
        : 0
    };
  }

  /**
   * Configura los límites (útil para testing o ajustes)
   */
  configure(config: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info(`⚙️  Rate limiter configured: ${JSON.stringify(this.config)}`);
  }
}
