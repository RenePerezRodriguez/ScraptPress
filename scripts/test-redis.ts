/**
 * Test Redis Connection
 * Quick script to verify Redis Labs connection
 */

import * as dotenv from 'dotenv';
dotenv.config(); // Load .env variables

import { CacheService } from './services/cache.service';
import { Logger } from './config/logger';

const logger = Logger.getInstance();

async function testRedis() {
  logger.info('🧪 Testing Redis connection...');
  
  const cache = CacheService.getInstance();
  
  try {
    // Connect
    await cache.connect();
    logger.info('✅ Connected to Redis');
    
    // Test SET
    const testKey = 'test:connection';
    const testValue = { 
      message: 'Hello from ScraptPress!', 
      timestamp: new Date().toISOString() 
    };
    
    logger.info('📝 Setting test value...');
    await cache.set(testKey, testValue, 60);
    
    // Test GET
    logger.info('📖 Getting test value...');
    const retrieved = await cache.get(testKey);
    
    if (JSON.stringify(retrieved) === JSON.stringify(testValue)) {
      logger.info('✅ Redis READ/WRITE test PASSED');
      logger.debug('Retrieved value:', retrieved);
    } else {
      logger.error('❌ Redis READ/WRITE test FAILED');
      logger.debug('Expected:', testValue);
      logger.debug('Got:', retrieved);
    }
    
    // Test EXISTS
    const exists = await cache.exists(testKey);
    logger.info(`✅ Key exists check: ${exists}`);
    
    // Test DELETE
    await cache.del(testKey);
    const existsAfterDelete = await cache.exists(testKey);
    logger.debug(`✅ Key deleted, exists now: ${existsAfterDelete}`);
    
    // Get stats
    const stats = await cache.getStats();
    logger.debug('📊 Redis Stats:', stats);
    
    // Disconnect
    await cache.disconnect();
    logger.debug('✅ Redis connection test completed successfully!');
    
  } catch (error) {
    logger.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

testRedis();
