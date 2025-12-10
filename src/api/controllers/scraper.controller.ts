/**
 * ScraperController - Single Responsibility: Server-Sent Events streaming
 * Handles real-time event broadcasting for scraping progress
 *
 * DEPRECATED METHODS REMOVED (use SearchController/VehicleController):
 * - scrape() → Use SearchController.intelligentSearch()
 * - search() → Use SearchController.intelligentSearch()
 * - start() → Use SearchController.intelligentSearch() with async=true
 * - api() → Use SearchController.intelligentSearch()
 * - vehicleByLot() → Use VehicleController.getVehicleDetails()
 */

import { Request, Response } from 'express';
import eventBus from '../../services/infrastructure/event-bus';
import { Logger } from '../../config/logger';

const logger = Logger.getInstance();

class ScraperController {
  /**
   * GET /api/scraper/events
   * Server-Sent Events endpoint to stream real-time scraping logs
   * Used by frontend to display live progress updates
   */
  events(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    logger.info('📡 SSE client connected');

    const onLog = (payload: unknown) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        logger.warn('Failed to write SSE data:', e);
      }
    };

    eventBus.on('log', onLog);

    req.on('close', () => {
      eventBus.removeListener('log', onLog);
      logger.info('📡 SSE client disconnected');
    });
  }
}

export default new ScraperController();
