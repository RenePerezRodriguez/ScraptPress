import { Router, Request, Response } from 'express';
import { getFirestore } from '../../config/firebase';
import { asyncHandler } from '../utils/asyncHandler';
import logger from '../../config/logger';

const router = Router();

/**
 * Lookup a specific vehicle in Firestore batches
 * Used when navigating to vehicle details page from search results
 * Avoids re-scraping vehicles that are already cached in Firestore
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { query, lot } = req.query;

  if (!query || !lot) {
    return res.status(400).json({ 
      found: false,
      error: 'query and lot parameters are required' 
    });
  }

  const searchQuery = String(query).toLowerCase().trim();
  const lotNumber = String(lot);

  logger.info(`🔍 [FIRESTORE LOOKUP] Searching for lot ${lotNumber} in batches for query "${searchQuery}"`);

  try {
    const db = getFirestore();
    
    // Search in all batches for this query
    const batchesRef = db.collection('searches').doc(searchQuery).collection('batches');
    const batchesSnapshot = await batchesRef.get();

    if (batchesSnapshot.empty) {
      logger.info(`❌ [FIRESTORE LOOKUP] No batches found for query "${searchQuery}"`);
      return res.json({ found: false });
    }

    // Search through each batch for the specific lot number
    for (const batchDoc of batchesSnapshot.docs) {
      const batchData = batchDoc.data();
      const vehicles = batchData.vehicles || [];

      const foundVehicle = vehicles.find((v: any) => String(v.lot_number) === lotNumber);

      if (foundVehicle) {
        logger.info(`✅ [FIRESTORE LOOKUP] Found lot ${lotNumber} in batch ${batchDoc.id}`);
        return res.json({
          found: true,
          vehicle: foundVehicle,
          batch: batchDoc.id,
          query: searchQuery,
        });
      }
    }

    logger.info(`❌ [FIRESTORE LOOKUP] Lot ${lotNumber} not found in any batch for query "${searchQuery}"`);
    return res.json({ found: false });

  } catch (error) {
    logger.error('❌ [FIRESTORE LOOKUP] Error:', error);
    return res.status(500).json({
      found: false,
      error: 'Error searching Firestore batches',
    });
  }
}));

export default router;
