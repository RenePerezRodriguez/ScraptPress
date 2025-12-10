/**
 * Type Definitions - Replace any types with specific interfaces
 * Improves type safety and IDE autocomplete
 */

/**
 * Copart API Response Types
 */
export interface CopartApiData {
  lotNumber: number;
  lotNumberStr: string;
  makeCode: string;
  modelCode: string;
  modelName: string;
  year: number;
  vin: string;
  odometer: number;
  odometerBrand: string;
  primaryDamage: string;
  secondaryDamage: string;
  titleState: string;
  titleType: string;
  saleStatus: string;
  currentBid: number;
  buyNowPrice?: number;
  estimatedRetailValue?: number;
  damageDescription?: string;
  highlights?: string;
  bodyStyle?: string;
  fuelType?: string;
  cylinders?: number;
  transmission?: string;
  drivelineType?: string;
  keys?: string;
  color?: string;
  location?: string;
  state?: string;
  city?: string;
  zip?: string;
  saleDate?: string;
  auctionDate?: string;
  timezone?: string;
  odometer_type?: string;
  images?: CopartImageData[];
  solrImages?: CopartSolrImage[];
  videos?: CopartVideoData[];
  buildSheet?: CopartBuildSheet;
  seller?: CopartSellerData;
  conditionReport?: CopartConditionReport;
  [key: string]: unknown; // For additional dynamic properties
}

export interface CopartImageData {
  url: string;
  link: string;
  sequence?: number;
  created?: string;
}

export interface CopartSolrImage {
  location: string;
  sequence: number;
}

export interface CopartVideoData {
  url: string;
  type: string;
  thumbnail?: string;
  engine?: boolean;
}

export interface CopartBuildSheet {
  Make?: string;
  Model?: string;
  Series?: string;
  Trim?: string;
  Body?: string;
  BodyType?: string;
  Doors?: number | string;
  Seats?: number | string;
  Bed?: string;
  WheelBase?: string;
  DriveType?: string;
  engine?: CopartEngineData[];
  equipment?: {
    INTERIOR?: Array<{ description: string }>;
    SAFETY?: Array<{ description: string }>;
    EXTERIOR?: Array<{ description: string }>;
    MECHANICAL?: Array<{ description: string }>;
    ENTERTAINMENT?: Array<{ description: string }>;
  };
  styles?: Array<{
    id: number;
    name: string;
    trim: string;
    baseMsrp: number;
  }>;
}

export interface CopartEngineData {
  name?: string;
  engineType?: string;
  cylinders?: number;
  displacement?: string;
  blockType?: string;
  fuelType?: string;
  horsepower?: number;
  torque?: number;
}

export interface CopartSellerData {
  id?: string;
  name?: string;
  type?: string;
  branch?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

export interface CopartConditionReport {
  overallCondition?: string;
  damageDetails?: Array<{
    area: string;
    severity: string;
    description: string;
  }>;
  inspectionDate?: string;
  inspector?: string;
  notes?: string;
}

/**
 * Worker Stats Types
 */
export interface WorkerHealthStats {
  healthy: boolean;
  stats: {
    workerId?: string;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    activeJobs: number;
    averageProcessingTime: number;
    successRate: number;
    concurrency?: number;
    error?: string;
  };
}

/**
 * Repository Types
 */
export interface PopularSearch {
  query: string;
  count: number;
  lastSearched?: Date;
  avgResults?: number;
  avg_results?: number;
  total_results?: number;
}

export interface ApiHealthMetric {
  endpoint?: string;
  timestamp?: Date;
  responseTime?: number;
  statusCode?: number;
  success?: boolean;
  error?: string;
  period?: string;
  total_requests?: number;
  successful_requests?: number;
  failed_requests?: number;
  avg_response_time_ms?: number;
  success_rate?: number;
}

export interface VehicleRequestData {
  query?: string;
  lotNumber?: string;
  page?: number;
  limit?: number;
  filters?: Record<string, unknown>;
  clientIp?: string;
  apiKey?: string;
  userAgent?: string;
}

/**
 * Queue Types
 */
export interface JobMetadata {
  [key: string]: unknown;
  priority?: number;
  retries?: number;
  timeout?: number;
  createdAt?: Date;
  clientIp?: string;
  apiKey?: string;
}

export interface QueueStats {
  active?: number;
  waiting?: number;
  queued?: number;
  processing?: number;
  completed?: number;
  failed?: number;
  delayed?: number;
  averageWaitTime?: number;
  averageProcessingTime?: number;
  successRate?: number;
}

/**
 * Cache Types
 */
export interface CacheStats {
  keys?: number;
  hits?: number;
  misses?: number;
  hitRate?: number;
  memoryUsage?: number;
  ttl?: Record<string, number>;
  connected?: boolean;
  info?: string;
  error?: unknown;
}

/**
 * Proxy Types
 */
export interface PlaywrightProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

/**
 * Security Types
 */
export interface SecurityStats {
  totalRequests?: number;
  blockedRequests?: number;
  suspiciousRequests?: number;
  blockRate?: number;
  topBlockedIps?: Array<{
    ip: string;
    count: number;
  }>;
  topBlockedApiKeys?: Array<{
    apiKey: string;
    count: number;
  }>;
  config?: {
    rateLimits: Record<string, unknown>;
    maxConcurrentJobs: Record<string, unknown>;
    jobLimits: Record<string, unknown>;
  };
  validation?: {
    queryMinLength: number;
    queryMaxLength: number;
    maxPage: number;
    maxLimit: number;
  };
}

/**
 * AI/Gemini Types
 */
export interface GeminiImagePart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

export interface AiExtractionResult {
  data: unknown;
  confidence?: number;
  model?: string;
  processingTime?: number;
}

/**
 * Error Types (extending base errors.ts)
 */
export interface ErrorContext {
  requestId?: string;
  userId?: string;
  ip?: string;
  endpoint?: string;
  method?: string;
  query?: Record<string, unknown>;
  stack?: string;
  [key: string]: unknown;
}

/**
 * Batch Repository Types
 */
export interface BatchVehicle {
  lot_number?: string;
  lotNumber?: string;
  data?: unknown;
  timestamp?: Date;
  source?: 'copart' | 'iaai' | 'manheim';
  [key: string]: unknown; // Allow OptimizedVehicle fields
}

/**
 * Retry Types
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  exponentialBase?: number;
  onRetry?: (attempt: number, error: Error) => void | Promise<void>;
  shouldRetry?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  totalTime: number;
  error?: Error;
}

/**
 * Scraping Strategy Types
 */
export interface ScrapingResult {
  vehicles: unknown[];
  totalFound: number;
  page: number;
  hasMore: boolean;
  source: string;
  timestamp: Date;
}

/**
 * API Version Types
 */
export interface APIVersion {
  version: string;
  status: 'stable' | 'beta' | 'deprecated';
  releaseDate: Date;
  deprecationDate?: Date;
  documentation: string;
  changes: string[];
}
