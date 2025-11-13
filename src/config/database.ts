import { Pool, QueryResult } from 'pg';
import { Logger } from '../config/logger';

const logger = Logger.getInstance();

// PostgreSQL connection pool configuration
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'copart_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, // maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Pool event handlers
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  logger.info('✅ New client connected to PostgreSQL');
});

pool.on('remove', () => {
  logger.info('Client removed from pool');
});

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    logger.info('✅ PostgreSQL connection test successful:', result.rows[0]);
    return true;
  } catch (error) {
    logger.error('❌ PostgreSQL connection test failed:', error);
    return false;
  }
}

// Query helper
export async function query<T extends Record<string, any> = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    
    if (duration > 1000) {
      logger.warn(`⏱️ Slow query (${duration}ms):`, text.substring(0, 100));
    }
    
    return result;
  } catch (error) {
    logger.error('Database query error:', error);
    throw error;
  }
}

// Get pool stats
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('📊 Database pool closed');
}

export default pool;
