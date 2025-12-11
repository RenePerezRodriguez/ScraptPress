/**
 * Vehicle Routes - Individual vehicle details
 * Single Responsibility: Route to VehicleController
 */

import express from 'express';
import { authenticateApiKey } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { asyncHandler } from '../utils/asyncHandler';
import { VehicleController } from '../controllers/vehicle.controller';

const router = express.Router();
const vehicleController = new VehicleController();

/**
 * GET /api/vehicle/:lotNumber
 * Get vehicle basic info from cache (Firestore)
 *
 * Operation: getVehicleByLot
 */
router.get(
  '/:lotNumber',
  authenticateApiKey,
  rateLimiter(),
  asyncHandler(vehicleController.getVehicle.bind(vehicleController)),
);

/**
 * GET /api/vehicle/:lotNumber/details
 * Fetch extended details for a specific vehicle from Copart
 * This includes: full VIN, complete image gallery, highlights, engine video
 *
 * Operation: getVehicleDetails
 */
router.get(
  '/:lotNumber/details',
  authenticateApiKey,
  rateLimiter(),
  asyncHandler(vehicleController.getVehicleDetails.bind(vehicleController)),
);

export default router;
