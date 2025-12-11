import fs from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'SUCCESS';
  section: string;
  message: string;
  requestId?: string; // Add request ID support
  data?: unknown;
}

/**
 * Logger Service - Registra eventos con estructura clara
 *
 * Niveles:
 * - ℹ️ INFO: Eventos generales del sistema
 * - ✅ SUCCESS: Operaciones completadas exitosamente
 * - ⚠️ WARN: Advertencias (posibles problemas)
 * - ❌ ERROR: Errores que requieren atención
 * - 🔍 DEBUG: Información de depuración (solo en desarrollo)
 *
 * Ejemplo:
 * logger.info('SEARCH', 'Búsqueda iniciada', { query: 'toyota' });
 * logger.success('BATCH', 'Batch completado', { size: 100, duration: 240 });
 */
export class Logger {
  private static instance: Logger;
  private logDir: string | null = null;
  private isDev: boolean;
  private currentRequestId?: string; // Track current request ID

  private constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';

    // Only write to files in development or if explicitly enabled
    if (this.isDev || process.env.LOG_TO_FILE === 'true') {
      this.logDir = path.join(process.cwd(), 'logs');

      // Crear directorio de logs si no existe
      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
      } catch (error) {
        console.warn('⚠️ Could not create logs directory, file logging disabled:', error);
        this.logDir = null;
      }
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Set request ID for current context (useful for middleware)
   */
  setRequestId(requestId: string): void {
    this.currentRequestId = requestId;
  }

  /**
   * Clear request ID after request completes
   */
  clearRequestId(): void {
    this.currentRequestId = undefined;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatConsoleMessage(
    level: string,
    icon: string,
    section: string,
    message: string,
  ): string {
    const time = this.getTimestamp().split('T')[1].split('Z')[0]; // HH:MM:SS.mmm
    const requestIdStr = this.currentRequestId ? ` [${this.currentRequestId}]` : '';
    return `[${time}]${requestIdStr} ${icon} [${section}] ${message}`;
  }

  private writeToFile(entry: LogEntry): void {
    if (!this.logDir) return;

    const logFile = path.join(this.logDir, `${entry.level.toLowerCase()}.log`);
    const allLogsFile = path.join(this.logDir, 'all.log');
    const logLine = JSON.stringify(entry) + '\n';

    try {
      fs.appendFileSync(logFile, logLine);
      fs.appendFileSync(allLogsFile, logLine);
    } catch (error) {
      console.error('Error escribiendo en archivo de log:', error);
    }
  }

  /**
   * INFO - Eventos generales del sistema
   * Uso: logger.info('SEARCH', 'Búsqueda iniciada', { query: 'toyota' })
   * Uso legacy: logger.info('Búsqueda iniciada')
   */
  info(sectionOrMessage: string, message?: string, data?: unknown): void {
    // Soporte para ambos formatos
    const isLegacy = message === undefined;
    const section = isLegacy ? 'GENERAL' : sectionOrMessage;
    const msg = isLegacy ? sectionOrMessage : message!;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'INFO',
      section,
      message: msg,
      requestId: this.currentRequestId,
      data,
    };

    const formatted = this.formatConsoleMessage('INFO', 'ℹ️', section, msg);
    console.log('\x1b[36m%s\x1b[0m', formatted); // Cyan

    if (data) {
      console.log('  └─ Datos:', data);
    }

    this.writeToFile(entry);
  }

  /**
   * SUCCESS - Operaciones completadas exitosamente
   * Uso: logger.success('BATCH', 'Batch completado', { size: 100 })
   * Uso legacy: logger.success('Batch completado')
   */
  success(sectionOrMessage: string, message?: string, data?: unknown): void {
    const isLegacy = message === undefined;
    const section = isLegacy ? 'GENERAL' : sectionOrMessage;
    const msg = isLegacy ? sectionOrMessage : message!;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'SUCCESS',
      section,
      message: msg,
      requestId: this.currentRequestId,
      data,
    };

    const formatted = this.formatConsoleMessage('SUCCESS', '✅', section, msg);
    console.log('\x1b[32m%s\x1b[0m', formatted); // Green

    if (data) {
      console.log('  └─ Datos:', data);
    }

    this.writeToFile(entry);
  }

  /**
   * WARN - Advertencias (posibles problemas)
   * Uso: logger.warn('RATE-LIMIT', 'Rate limit detectado', { remaining: 0 })
   * Uso legacy: logger.warn('Rate limit detectado')
   */
  warn(sectionOrMessage: string, message?: string | unknown, data?: unknown): void {
    // Detectar si el segundo parámetro es un error object (legacy)
    const isLegacy =
      message === undefined || (typeof message === 'object' && !(message instanceof String));
    const section = isLegacy ? 'GENERAL' : sectionOrMessage;
    const msg = isLegacy ? sectionOrMessage : (message as string);
    const finalData = isLegacy ? message : data;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'WARN',
      section,
      message: msg,
      requestId: this.currentRequestId,
      data: finalData,
    };

    const formatted = this.formatConsoleMessage('WARN', '⚠️', section, msg);
    console.warn('\x1b[33m%s\x1b[0m', formatted); // Yellow

    if (finalData) {
      console.log('  └─ Datos:', finalData);
    }

    this.writeToFile(entry);
  }

  /**
   * ERROR - Errores que requieren atención
   * Uso: logger.error('SCRAPE', 'Error en scraping', error)
   * Uso legacy: logger.error('Error en scraping', error)
   */
  error(sectionOrMessage: string, messageOrError?: string | unknown, errorData?: unknown): void {
    // Detectar formato legacy (message, error) vs nuevo (section, message, error)
    const isLegacy = typeof messageOrError === 'object' || messageOrError === undefined;
    const section = isLegacy ? 'ERROR' : sectionOrMessage;
    const msg = isLegacy ? sectionOrMessage : (messageOrError as string);
    const finalError = isLegacy ? messageOrError : errorData;

    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level: 'ERROR',
      section,
      message: msg,
      requestId: this.currentRequestId,
      data: finalError,
    };

    const formatted = this.formatConsoleMessage('ERROR', '❌', section, msg);
    console.error('\x1b[31m%s\x1b[0m', formatted); // Red

    if (finalError) {
      if (finalError instanceof Error) {
        console.error('  ├─ Error:', finalError.message);
        console.error('  └─ Stack:', finalError.stack);
      } else {
        console.error('  └─ Detalles:', finalError);
      }
    }

    this.writeToFile(entry);
  }

  /**
   * DEBUG - Información de depuración (solo en desarrollo)
   * Uso: logger.debug('EXTRACT', 'VIN extraído', { vin: '...' })
   * Uso legacy: logger.debug('VIN extraído')
   */
  debug(sectionOrMessage: string, message?: string | unknown, data?: unknown): void {
    if (this.isDev) {
      const isLegacy =
        message === undefined || (typeof message !== 'string' && typeof message !== 'number');
      const section = isLegacy ? 'DEBUG' : sectionOrMessage;
      const msg = isLegacy ? sectionOrMessage : (message as string);
      const finalData = isLegacy ? (typeof message === 'object' ? message : undefined) : data;

      const entry: LogEntry = {
        timestamp: this.getTimestamp(),
        level: 'DEBUG',
        section,
        message: msg,
        requestId: this.currentRequestId,
        data: finalData,
      };

      const formatted = this.formatConsoleMessage('DEBUG', '🔍', section, msg);
      console.debug('\x1b[35m%s\x1b[0m', formatted); // Magenta

      if (finalData) {
        console.log('  └─ Datos:', finalData);
      }

      this.writeToFile(entry);
    }
  }
}

// Export singleton instance as default
const loggerInstance = Logger.getInstance();
export default loggerInstance;
