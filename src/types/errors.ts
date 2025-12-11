/**
 * Error Codes Enum - Standardized error codes for the API
 */
export enum ErrorCode {
  // Authentication errors (401)
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_ADMIN_REQUIRED = 'AUTH_ADMIN_REQUIRED',

  // Authorization errors (403)
  FORBIDDEN = 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',

  // Rate limiting errors (429)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CONCURRENT_JOBS_EXCEEDED = 'CONCURRENT_JOBS_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_QUERY = 'INVALID_QUERY',
  INVALID_PAGE_NUMBER = 'INVALID_PAGE_NUMBER',
  INVALID_LIMIT = 'INVALID_LIMIT',
  INVALID_LOT_NUMBER = 'INVALID_LOT_NUMBER',
  INVALID_EMAIL = 'INVALID_EMAIL',
  XSS_DETECTED = 'XSS_DETECTED',
  SQL_INJECTION_DETECTED = 'SQL_INJECTION_DETECTED',

  // Resource errors (404)
  NOT_FOUND = 'NOT_FOUND',
  VEHICLE_NOT_FOUND = 'VEHICLE_NOT_FOUND',
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  BATCH_NOT_FOUND = 'BATCH_NOT_FOUND',

  // Scraping errors (500)
  SCRAPE_FAILED = 'SCRAPE_FAILED',
  BROWSER_ERROR = 'BROWSER_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  COPART_BLOCKED = 'COPART_BLOCKED',
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',

  // External service errors (502-504)
  REDIS_ERROR = 'REDIS_ERROR',
  REDIS_UNAVAILABLE = 'REDIS_UNAVAILABLE',
  FIRESTORE_ERROR = 'FIRESTORE_ERROR',
  FIRESTORE_TIMEOUT = 'FIRESTORE_TIMEOUT',
  GEMINI_API_ERROR = 'GEMINI_API_ERROR',

  // Worker errors (500)
  WORKER_ERROR = 'WORKER_ERROR',
  JOB_QUEUE_ERROR = 'JOB_QUEUE_ERROR',
  JOB_TIMEOUT = 'JOB_TIMEOUT',
  JOB_FAILED = 'JOB_FAILED',

  // Internal errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Standard API Error Response
 */
export interface ApiErrorResponse {
  success: false;
  error: string;
  code: ErrorCode;
  message?: string;
  details?: unknown;
  timestamp: string;
  requestId?: string;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  code: ErrorCode,
  error: string,
  message?: string,
  details?: unknown,
  requestId?: string,
): ApiErrorResponse {
  return {
    success: false,
    error,
    code,
    message,
    details,
    timestamp: new Date().toISOString(),
    requestId,
  };
}

/**
 * HTTP status code mapper
 */
export const ErrorStatusMap: Record<ErrorCode, number> = {
  // 400 - Bad Request
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_QUERY]: 400,
  [ErrorCode.INVALID_PAGE_NUMBER]: 400,
  [ErrorCode.INVALID_LIMIT]: 400,
  [ErrorCode.INVALID_LOT_NUMBER]: 400,
  [ErrorCode.INVALID_EMAIL]: 400,
  [ErrorCode.XSS_DETECTED]: 400,
  [ErrorCode.SQL_INJECTION_DETECTED]: 400,

  // 401 - Unauthorized
  [ErrorCode.AUTH_FAILED]: 401,
  [ErrorCode.AUTH_TOKEN_MISSING]: 401,
  [ErrorCode.AUTH_TOKEN_INVALID]: 401,

  // 403 - Forbidden
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.AUTH_ADMIN_REQUIRED]: 403,
  [ErrorCode.INSUFFICIENT_PERMISSIONS]: 403,

  // 404 - Not Found
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.VEHICLE_NOT_FOUND]: 404,
  [ErrorCode.JOB_NOT_FOUND]: 404,
  [ErrorCode.BATCH_NOT_FOUND]: 404,

  // 429 - Too Many Requests
  [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
  [ErrorCode.CONCURRENT_JOBS_EXCEEDED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,

  // 500 - Internal Server Error
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.SCRAPE_FAILED]: 500,
  [ErrorCode.BROWSER_ERROR]: 500,
  [ErrorCode.EXTRACTION_FAILED]: 500,
  [ErrorCode.WORKER_ERROR]: 500,
  [ErrorCode.JOB_QUEUE_ERROR]: 500,
  [ErrorCode.JOB_TIMEOUT]: 500,
  [ErrorCode.JOB_FAILED]: 500,
  [ErrorCode.CONFIGURATION_ERROR]: 500,
  [ErrorCode.UNKNOWN_ERROR]: 500,

  // 502 - Bad Gateway
  [ErrorCode.REDIS_ERROR]: 502,
  [ErrorCode.REDIS_UNAVAILABLE]: 502,
  [ErrorCode.FIRESTORE_ERROR]: 502,
  [ErrorCode.GEMINI_API_ERROR]: 502,

  // 503 - Service Unavailable
  [ErrorCode.COPART_BLOCKED]: 503,

  // 504 - Gateway Timeout
  [ErrorCode.NETWORK_ERROR]: 504,
  [ErrorCode.FIRESTORE_TIMEOUT]: 504,
};
