/**
 * Proxy Rotator Service
 * Manages proxy rotation to distribute requests and avoid IP-based rate limiting
 *
 * NOTA: Requiere proxies configurados. Para desarrollo local, se puede desactivar.
 */

import { Logger } from '../../config/logger';
import type { PlaywrightProxyConfig } from '../../types';

const logger = Logger.getInstance();

interface ProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  protocol?: 'http' | 'https' | 'socks5';
}

interface ProxyStats {
  proxy: string;
  successCount: number;
  failCount: number;
  lastUsed: number;
  avgResponseTime: number;
  isHealthy: boolean;
}

export class ProxyRotatorService {
  private static instance: ProxyRotatorService;
  private proxies: ProxyConfig[] = [];
  private proxyStats: Map<string, ProxyStats> = new Map();
  private currentIndex = 0;
  private enabled = false;

  private constructor() {
    this.loadProxiesFromEnv();
  }

  static getInstance(): ProxyRotatorService {
    if (!ProxyRotatorService.instance) {
      ProxyRotatorService.instance = new ProxyRotatorService();
    }
    return ProxyRotatorService.instance;
  }

  /**
   * Carga proxies desde variables de entorno
   * Format: PROXIES=host1:port1:user1:pass1,host2:port2:user2:pass2
   */
  private loadProxiesFromEnv(): void {
    const proxiesEnv = process.env.PROXIES;

    if (!proxiesEnv) {
      logger.info('ℹ️  No proxies configured (PROXIES env variable not set)');
      logger.info('💡 Tip: Set PROXIES=host1:port1:user:pass,host2:port2 for proxy rotation');
      return;
    }

    try {
      const proxyStrings = proxiesEnv.split(',');

      for (const proxyStr of proxyStrings) {
        const [host, port, username, password] = proxyStr.trim().split(':');

        if (!host || !port) {
          logger.warn(`⚠️  Invalid proxy format: ${proxyStr}`);
          continue;
        }

        const proxy: ProxyConfig = {
          host,
          port: parseInt(port),
          username,
          password,
          protocol: 'http',
        };

        this.proxies.push(proxy);

        // Inicializar stats
        const proxyKey = this.getProxyKey(proxy);
        this.proxyStats.set(proxyKey, {
          proxy: proxyKey,
          successCount: 0,
          failCount: 0,
          lastUsed: 0,
          avgResponseTime: 0,
          isHealthy: true,
        });
      }

      if (this.proxies.length > 0) {
        this.enabled = true;
        logger.info(`✅ Loaded ${this.proxies.length} proxies for rotation`);
        logger.info(`🔄 Proxy rotation: ENABLED`);
      }
    } catch (error) {
      logger.error('❌ Error loading proxies:', error);
    }
  }

  /**
   * Verifica si el proxy rotation está habilitado
   */
  isEnabled(): boolean {
    return this.enabled && this.proxies.length > 0;
  }

  /**
   * Obtiene el siguiente proxy disponible (round-robin con health check)
   */
  getNextProxy(): ProxyConfig | null {
    if (!this.isEnabled()) {
      return null;
    }

    // Intentar hasta 2 veces el número de proxies para encontrar uno saludable
    const maxAttempts = this.proxies.length * 2;

    for (let i = 0; i < maxAttempts; i++) {
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      const proxy = this.proxies[this.currentIndex];
      const stats = this.proxyStats.get(this.getProxyKey(proxy));

      // Verificar si el proxy está saludable
      if (stats && stats.isHealthy) {
        logger.debug(`🔄 Using proxy: ${this.getProxyKey(proxy)}`);
        return proxy;
      }

      // Si el proxy está marcado como no saludable, verificar si pasó suficiente tiempo
      if (stats && !stats.isHealthy) {
        const timeSinceLastUse = Date.now() - stats.lastUsed;
        const cooldownPeriod = 5 * 60 * 1000; // 5 minutos

        if (timeSinceLastUse > cooldownPeriod) {
          logger.info(`🔄 Retry unhealthy proxy after cooldown: ${this.getProxyKey(proxy)}`);
          stats.isHealthy = true;
          return proxy;
        }
      }
    }

    logger.warn('⚠️  No healthy proxies available');
    return null;
  }

  /**
   * Obtiene un proxy aleatorio (útil para evitar patrones)
   */
  getRandomProxy(): ProxyConfig | null {
    if (!this.isEnabled()) {
      return null;
    }

    const healthyProxies = this.proxies.filter((p) => {
      const stats = this.proxyStats.get(this.getProxyKey(p));
      return stats && stats.isHealthy;
    });

    if (healthyProxies.length === 0) {
      return this.getNextProxy(); // Fallback a round-robin
    }

    const randomIndex = Math.floor(Math.random() * healthyProxies.length);
    return healthyProxies[randomIndex];
  }

  /**
   * Registra el uso exitoso de un proxy
   */
  recordSuccess(proxy: ProxyConfig, responseTimeMs: number): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);

    if (!stats) return;

    stats.successCount++;
    stats.lastUsed = Date.now();
    stats.isHealthy = true;

    // Calcular promedio de tiempo de respuesta
    stats.avgResponseTime =
      (stats.avgResponseTime * (stats.successCount - 1) + responseTimeMs) / stats.successCount;

    logger.debug(`✅ Proxy success: ${key} (${responseTimeMs}ms)`);
  }

  /**
   * Registra el fallo de un proxy
   */
  recordFailure(proxy: ProxyConfig, error: string): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);

    if (!stats) return;

    stats.failCount++;
    stats.lastUsed = Date.now();

    // Marcar como no saludable si tiene muchos fallos
    const failRate = stats.failCount / (stats.successCount + stats.failCount);
    if (failRate > 0.5 || stats.failCount > 3) {
      stats.isHealthy = false;
      logger.warn(
        `⚠️  Proxy marked unhealthy: ${key} (fail rate: ${(failRate * 100).toFixed(1)}%)`,
      );
    }

    logger.debug(`❌ Proxy failure: ${key} - ${error}`);
  }

  /**
   * Convierte ProxyConfig a string de conexión para Playwright
   */
  getPlaywrightProxyConfig(proxy: ProxyConfig): PlaywrightProxyConfig {
    return {
      server: `${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`,
      username: proxy.username,
      password: proxy.password,
    };
  }

  /**
   * Obtiene estadísticas de todos los proxies
   */
  getStats(): ProxyStats[] {
    return Array.from(this.proxyStats.values());
  }

  /**
   * Resetea las estadísticas de un proxy (útil para testing)
   */
  resetProxyStats(proxy: ProxyConfig): void {
    const key = this.getProxyKey(proxy);
    const stats = this.proxyStats.get(key);

    if (stats) {
      stats.successCount = 0;
      stats.failCount = 0;
      stats.avgResponseTime = 0;
      stats.isHealthy = true;
      logger.info(`🔄 Reset stats for proxy: ${key}`);
    }
  }

  /**
   * Genera key única para un proxy
   */
  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.host}:${proxy.port}`;
  }

  /**
   * Agrega proxies programáticamente (útil para testing)
   */
  addProxy(proxy: ProxyConfig): void {
    this.proxies.push(proxy);
    const key = this.getProxyKey(proxy);

    this.proxyStats.set(key, {
      proxy: key,
      successCount: 0,
      failCount: 0,
      lastUsed: 0,
      avgResponseTime: 0,
      isHealthy: true,
    });

    this.enabled = true;
    logger.info(`➕ Added proxy: ${key}`);
  }
}
