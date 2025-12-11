/**
 * Scraping Lock Service
 * Prevents duplicate scraping of the same batch across concurrent requests
 * Uses in-memory locks to coordinate scraping operations
 */

import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

interface LockInfo {
  query: string;
  page: number;
  limit: number;
  startTime: number;
  lockId: string;
}

class ScrapingLockService {
  private locks: Map<string, LockInfo> = new Map();
  private readonly LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos max lock time

  /**
   * Try to acquire a lock for scraping a specific page with limit
   * Returns lockId if successful, null if already locked
   */
  acquireLock(query: string, page: number, limit: number): string | null {
    const lockKey = this.getLockKey(query, page, limit);
    const existingLock = this.locks.get(lockKey);

    // Check if lock exists and is still valid
    if (existingLock) {
      const elapsed = Date.now() - existingLock.startTime;

      // If lock is expired, remove it
      if (elapsed > this.LOCK_TIMEOUT_MS) {
        logger.warn(
          `🔓 Lock expired for ${lockKey} (${Math.round(elapsed / 1000)}s old), removing...`,
        );
        this.locks.delete(lockKey);
      } else {
        logger.info(`🔒 Lock already held for ${lockKey} (${Math.round(elapsed / 1000)}s ago)`);
        return null; // Lock is active, cannot acquire
      }
    }

    // Create new lock
    const lockId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    this.locks.set(lockKey, {
      query,
      page,
      limit,
      startTime: Date.now(),
      lockId,
    });

    logger.info(`🔐 Lock acquired for ${lockKey} (lockId: ${lockId})`);
    return lockId;
  }

  /**
   * Release a lock after scraping is complete
   */
  releaseLock(query: string, page: number, limit: number, lockId: string): boolean {
    const lockKey = this.getLockKey(query, page, limit);
    const existingLock = this.locks.get(lockKey);

    if (!existingLock) {
      logger.warn(`🔓 No lock found for ${lockKey}`);
      return false;
    }

    // Verify lockId matches (prevent accidental release by wrong caller)
    if (existingLock.lockId !== lockId) {
      logger.error(
        `🔒 Lock ID mismatch for ${lockKey}! Expected ${existingLock.lockId}, got ${lockId}`,
      );
      return false;
    }

    this.locks.delete(lockKey);
    const duration = Date.now() - existingLock.startTime;
    logger.info(`🔓 Lock released for ${lockKey} (held for ${Math.round(duration / 1000)}s)`);
    return true;
  }

  /**
   * Check if a page+limit combination is currently being scraped
   */
  isLocked(query: string, page: number, limit: number): boolean {
    const lockKey = this.getLockKey(query, page, limit);
    const lock = this.locks.get(lockKey);

    if (!lock) {
      return false;
    }

    // Check if lock is expired
    const elapsed = Date.now() - lock.startTime;
    if (elapsed > this.LOCK_TIMEOUT_MS) {
      this.locks.delete(lockKey);
      return false;
    }

    return true;
  }

  /**
   * Wait for a lock to be released (with timeout)
   * Returns true if lock was released, false if timeout
   */
  async waitForLock(
    query: string,
    page: number,
    limit: number,
    maxWaitMs: number = 15 * 60 * 1000, // 15 minutos default
  ): Promise<boolean> {
    const lockKey = this.getLockKey(query, page, limit);
    const startWait = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    logger.info(`⏳ Waiting for lock ${lockKey} (max ${Math.round(maxWaitMs / 1000)}s)...`);

    while (this.isLocked(query, page, limit)) {
      const elapsed = Date.now() - startWait;

      if (elapsed >= maxWaitMs) {
        logger.warn(`⏱️ Wait timeout for ${lockKey} after ${Math.round(elapsed / 1000)}s`);
        return false;
      }

      // Wait before checking again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      logger.debug(`⏳ Still waiting for ${lockKey} (${Math.round(elapsed / 1000)}s elapsed)...`);
    }

    const totalWait = Date.now() - startWait;
    logger.info(`✅ Lock ${lockKey} released after waiting ${Math.round(totalWait / 1000)}s`);
    return true;
  }

  /**
   * Get lock key for a query+page+limit combination
   */
  private getLockKey(query: string, page: number, limit: number): string {
    return `${query.toLowerCase().trim()}:page:${page}:limit:${limit}`;
  }

  /**
   * Get current lock info for debugging
   */
  getLockInfo(query: string, page: number, limit: number): LockInfo | null {
    const lockKey = this.getLockKey(query, page, limit);
    return this.locks.get(lockKey) || null;
  }

  /**
   * Get all active locks (for monitoring)
   */
  getAllLocks(): LockInfo[] {
    return Array.from(this.locks.values());
  }

  /**
   * Clear all locks (for cleanup/restart)
   */
  clearAllLocks(): void {
    const count = this.locks.size;
    this.locks.clear();
    logger.info(`🧹 Cleared ${count} locks`);
  }

  /**
   * Clean up expired locks (run periodically)
   */
  cleanupExpiredLocks(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, lock] of this.locks.entries()) {
      const elapsed = now - lock.startTime;
      if (elapsed > this.LOCK_TIMEOUT_MS) {
        this.locks.delete(key);
        cleaned++;
        logger.info(`🧹 Cleaned expired lock: ${key} (${Math.round(elapsed / 1000)}s old)`);
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleanup complete: Removed ${cleaned} expired locks`);
    }

    return cleaned;
  }
}

// Singleton instance
export const scrapingLockService = new ScrapingLockService();

// Run cleanup every 5 minutes
setInterval(
  () => {
    scrapingLockService.cleanupExpiredLocks();
  },
  5 * 60 * 1000,
);
