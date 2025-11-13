import fs from 'fs';
import path from 'path';

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
  data?: any;
}

export class Logger {
  private static instance: Logger;
  private logDir: string;
  private isDev: boolean;

  private constructor() {
    this.isDev = process.env.NODE_ENV !== 'production';
    this.logDir = path.join(process.cwd(), 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] ${level}: ${message}${dataStr}`;
  }

  private writeToFile(level: string, message: string, data?: any): void {
    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: level as any,
      message,
      data,
    };

    const logFile = path.join(this.logDir, `${level.toLowerCase()}.log`);
    const allLogsFile = path.join(this.logDir, 'all.log');

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      fs.appendFileSync(logFile, logLine);
      fs.appendFileSync(allLogsFile, logLine);
    } catch (error) {
      console.error('Error writing to log file:', error);
    }
  }

  info(message: string, data?: any): void {
    const formatted = this.formatMessage('INFO', message, data);
    console.log('\x1b[36m%s\x1b[0m', formatted); // Cyan
    this.writeToFile('INFO', message, data);
  }

  warn(message: string, data?: any): void {
    const formatted = this.formatMessage('WARN', message, data);
    console.warn('\x1b[33m%s\x1b[0m', formatted); // Yellow
    this.writeToFile('WARN', message, data);
  }

  error(message: string, error?: any): void {
    const formatted = this.formatMessage('ERROR', message, error);
    console.error('\x1b[31m%s\x1b[0m', formatted); // Red
    this.writeToFile('ERROR', message, error);
  }

  debug(message: string, data?: any): void {
    if (this.isDev) {
      const formatted = this.formatMessage('DEBUG', message, data);
      console.debug('\x1b[35m%s\x1b[0m', formatted); // Magenta
      this.writeToFile('DEBUG', message, data);
    }
  }
}

export default Logger;
