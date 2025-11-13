import { Router, Request, Response, NextFunction } from 'express';

// API Version interface
interface APIVersion {
  version: string;
  status: 'stable' | 'beta' | 'deprecated';
  releaseDate: Date;
  deprecationDate?: Date;
  documentation: string;
  changes: string[];
}

// Track API versions
const versions: Record<string, APIVersion> = {
  'v1': {
    version: 'v1',
    status: 'stable',
    releaseDate: new Date('2024-01-01'),
    documentation: '/docs/api/v1',
    changes: [
      'Initial API release',
      'Basic search endpoint',
      'Filter support',
      'Rate limiting',
    ],
  },
  'v2': {
    version: 'v2',
    status: 'beta',
    releaseDate: new Date('2024-06-01'),
    documentation: '/docs/api/v2',
    changes: [
      'PostgreSQL integration',
      'Advanced filtering',
      'Bulk operations',
      'Enhanced caching',
    ],
  },
};

/**
 * Middleware for API versioning
 * Supports: /api/v1/... or header Accept: application/vnd.copart+json;version=1
 */
export function apiVersionMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get version from URL path
  const pathMatch = req.path.match(/^\/api\/(v\d+)\//);
  let version = pathMatch ? pathMatch[1] : null;

  // Fallback to Accept header
  if (!version) {
    const accept = req.get('Accept');
    const headerMatch = accept?.match(/version=(\d+)/);
    version = headerMatch ? `v${headerMatch[1]}` : 'v1'; // Default to v1
  }

  // Validate version exists
  const versionInfo = versions[version];
  if (!versionInfo) {
    return res.status(400).json({
      error: 'Invalid API version',
      supportedVersions: Object.keys(versions),
    });
  }

  // Check if version is deprecated
  if (versionInfo.status === 'deprecated') {
    res.set('Warning', `299 - "API version ${version} is deprecated and will be removed on ${versionInfo.deprecationDate}"`);
  }

  // Attach version info to request
  (req as any).apiVersion = {
    ...versionInfo,
  };

  // Add version headers
  res.set('X-API-Version', version);
  res.set('X-API-Status', versionInfo.status);

  next();
}

/**
 * Version-specific route handler wrapper
 */
export function handleVersion<T extends Record<string, any>>(
  handlers: Partial<Record<string, (req: Request, res: Response) => Promise<void> | void>>
) {
  return async (req: Request, res: Response) => {
    const version = (req as any).apiVersion?.version || 'v1';
    const handler = handlers[version];

    if (!handler) {
      return res.status(400).json({
        error: `This endpoint is not available in API version ${version}`,
      });
    }

    try {
      await handler(req, res);
    } catch (error) {
      res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Get API version info
 */
export function getVersionInfo(version?: string): APIVersion | Record<string, APIVersion> {
  if (version) {
    return versions[version] || versions['v1'];
  }
  return versions;
}

/**
 * Create versioned router
 */
export function createVersionedRouter(basePath: string): Router {
  const router = Router();

  // Version info endpoint
  router.get('/versions', (req: Request, res: Response) => {
    res.json({
      current: (req as any).apiVersion,
      available: Object.values(versions).map(v => ({
        version: v.version,
        status: v.status,
        releaseDate: v.releaseDate,
        deprecationDate: v.deprecationDate,
        documentation: v.documentation,
      })),
    });
  });

  return router;
}

export default {
  versions,
  apiVersionMiddleware,
  handleVersion,
  getVersionInfo,
  createVersionedRouter,
};
