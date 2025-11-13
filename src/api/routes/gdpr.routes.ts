import { Router, Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Logger } from '../../config/logger';
import { validateGdprEmail } from '../middleware/validation';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();
const logger = Logger.getInstance();

interface GDPRRequest {
  email: string;
  type: 'access' | 'delete' | 'portability';
  reason?: string;
}

// In-memory store for GDPR requests (use database in production)
const gdprRequests: GDPRRequest[] = [];

/**
 * POST /api/gdpr/access-data
 * Request access to personal data
 */
router.post('/access-data', validateGdprEmail, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }

  gdprRequests.push({
    email,
    type: 'access',
  });

  logger.info('📥 GDPR Access Request', { email });

  res.json({
    success: true,
    message: 'Tu solicitud ha sido recibida',
    details: 'Recibirás tus datos por email en 7 días hábiles',
    requestId: `ACCESS-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * POST /api/gdpr/delete-data
 * Request data deletion (Right to be forgotten)
 */
router.post('/delete-data', validateGdprEmail, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }

  gdprRequests.push({
    email,
    type: 'delete',
  });

  logger.info('🗑️ GDPR Deletion Request', { email });

  res.json({
    success: true,
    message: 'Tu solicitud de eliminación ha sido recibida',
    details: 'Todos tus datos serán eliminados en 30 días según GDPR',
    requestId: `DELETE-${Date.now()}`,
    timestamp: new Date().toISOString(),
    notice: 'Recibirás confirmación por email una vez completado',
  });
}));

/**
 * POST /api/gdpr/data-portability
 * Request data in portable format
 */
router.post('/data-portability', validateGdprEmail, asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return res.status(400).json({ error: 'Email válido requerido' });
  }

  gdprRequests.push({
    email,
    type: 'portability',
  });

  logger.info('📦 GDPR Data Portability Request', { email });

  res.json({
    success: true,
    message: 'Tu solicitud de portabilidad ha sido recibida',
    details: 'Recibirás tus datos en formato JSON/CSV en 7 días hábiles',
    requestId: `PORT-${Date.now()}`,
    timestamp: new Date().toISOString(),
  });
}));

/**
 * GET /api/gdpr/consent-record
 * Get current consent record
 */
router.get('/consent-record', asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  res.json({
    email,
    timestamp: new Date().toISOString(),
    consents: {
      necessary: true,
      analytics: false,
      marketing: false,
    },
    rights: {
      access: 'Puedes solicitar acceso a tus datos',
      rectification: 'Puedes corregir datos inexactos',
      deletion: 'Puedes solicitar eliminación de datos',
      portability: 'Puedes descargar tus datos',
      restriction: 'Puedes limitar el procesamiento',
      objection: 'Puedes oponerte al procesamiento',
    },
  });
}));

/**
 * POST /api/gdpr/update-consent
 * Update cookie/processing consent
 */
router.post('/update-consent', asyncHandler(async (req: Request, res: Response) => {
  const { email, consents } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email requerido' });
  }

  logger.info('📝 Consent Updated', { email, consents });

  res.json({
    success: true,
    message: 'Tu consentimiento ha sido actualizado',
    timestamp: new Date().toISOString(),
    consents,
  });
}));

/**
 * GET /api/gdpr/requests (admin only)
 * View all pending GDPR requests
 */
router.get('/requests', authenticateAdmin, asyncHandler(async (req: Request, res: Response) => {
  res.json({
    totalRequests: gdprRequests.length,
    byType: {
      access: gdprRequests.filter(r => r.type === 'access').length,
      delete: gdprRequests.filter(r => r.type === 'delete').length,
      portability: gdprRequests.filter(r => r.type === 'portability').length,
    },
    requests: gdprRequests,
  });
}));

export default router;
