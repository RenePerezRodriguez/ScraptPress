import { Request, Response } from 'express';
import { platformFactory, scrapeFromUrl } from '../../services/scrapers/platforms/platform.factory';
import eventBus from '../../services/event-bus';
import { VehicleMapper } from '../utils/vehicle.mapper';
import { CacheService } from '../../services/cache.service';
import { VehicleRepository } from '../../services/repositories/vehicle.repository';
import { Logger } from '../../config/logger';
import {
  ScraperApiRequest,
  ScraperApiResponse,
  VehicleByLotResponse,
  ErrorResponse
} from '../../types/vehicle.types';

const cache = CacheService.getInstance();
const logger = Logger.getInstance();

class ScraperController {

  // Handles direct URL scraping
  async scrape(req: Request, res: Response) {
    const { startUrl, maxItems } = req.body;

    if (!startUrl) {
      return res.status(400).json({ error: 'startUrl is required' });
    }
    if (!startUrl.includes('copart.com')) {
      return res.status(400).json({ error: 'Invalid URL. Only copart.com URLs are supported.' });
    }

    try {
      const scraper = platformFactory.createScraper('copart');
      const numMaxItems = maxItems ? parseInt(maxItems as string, 10) : undefined;
      const scrapedData = await scraper.scrape(startUrl, numMaxItems);

      // Save vehicles to Firestore
      let savedCount = 0;
      for (const vehicle of scrapedData) {
        const saved = await VehicleRepository.upsertVehicle(vehicle);
        if (saved) savedCount++;
      }

      logger.info(`Saved ${savedCount}/${scrapedData.length} vehicles to Firestore`);

      res.status(200).json({
        message: `Scraping successful. Found ${scrapedData.length} items, saved ${savedCount} to database.`,
        data: scrapedData,
        saved: savedCount,
      });

    } catch (error) {
      logger.error('Controller error:', error);
      res.status(500).json({ error: 'An error occurred while scraping.' });
    }
  }

  // Handles search-based scraping
  async search(req: Request, res: Response) {
    const { query, make, model, year, maxItems } = req.query;

    if (!query && !make && !model && !year) {
      return res.status(400).json({ error: 'At least one search parameter is required.' });
    }

    const searchTerms = [query, year, make, model].filter(Boolean) as string[];
    const searchQuery = searchTerms.join(' ');
    const searchUrl = `https://www.copart.com/vehicleFinder?query=${encodeURIComponent(searchQuery)}`;

    try {
      logger.info(`Executing search with URL: ${searchUrl}`);
      const scraper = platformFactory.createScraper('copart');
      const numMaxItems = maxItems ? parseInt(maxItems as string, 10) : undefined;
      // For compatibility we perform a direct (blocking) scrape here
      const scrapedData = await scraper.scrape(searchUrl, numMaxItems);

      // Directly return the scraped data without saving
      res.status(200).json({
        message: `Search successful. Scraped ${scrapedData.length} items.`,
        searchUrl,
        data: scrapedData,
      });

    } catch (error) {
      logger.error('Search controller error:', error);
      res.status(500).json({ error: 'An error occurred during the search.' });
    }
  }

  // SSE endpoint to stream logs and results
  events(req: Request, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const onLog = (payload: any) => {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch (e) {
        // ignore
      }
    };

    eventBus.on('log', onLog);

    req.on('close', () => {
      eventBus.removeListener('log', onLog);
    });
  }

  // Start scraping in background and stream logs via SSE
  async start(req: Request, res: Response) {
    const { query, maxItems } = req.body || req.query;
    if (!query) return res.status(400).json({ error: 'query required' });

    res.status(202).json({ status: 'started' });

    (async () => {
      try {
        eventBus.emit('log', { level: 'info', msg: `Starting scrape for: ${query}` });
        const scraper = platformFactory.createScraper('copart');
        const items = await scraper.scrape(`https://www.copart.com/lotSearchResults?free=true&query=${encodeURIComponent(String(query))}`, maxItems ? parseInt(String(maxItems), 10) : undefined, (payload: any) => {
          eventBus.emit('log', payload);
        });

        // Save vehicles to Firestore
        let savedCount = 0;
        for (const vehicle of items) {
          const saved = await VehicleRepository.upsertVehicle(vehicle);
          if (saved) savedCount++;
        }

        logger.info(`Scraped ${items.length} vehicles, saved ${savedCount} to Firestore`);
        eventBus.emit('log', { level: 'done', count: items.length, saved: savedCount, results: items });
      } catch (err) {
        eventBus.emit('log', { level: 'error', msg: String(err) });
      }
    })();
  }

  // Clean API endpoint for external consumption - Returns optimized data
  async api(req: Request, res: Response) {
    const params = (req.body && Object.keys(req.body).length > 0) ? req.body : req.query;
    const { query, page: pageParam, count } = params as any;

    if (!query) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'query parameter is required',
        details: 'POST /api/scraper/vehicles with body: { "query": "tesla", "count": 12, "page": 1 }'
      };
      return res.status(400).json(errorResponse);
    }

    try {
      // Parse page number (default: 1)
      const parsed = pageParam ? parseInt(String(pageParam), 10) : NaN;
      const pageNumber = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

      // Normalize requested count
      const rawRequested = count ?? params.maxItems ?? params.limit ?? params.perPage;
      const parsedCount = rawRequested ? parseInt(String(rawRequested), 10) : NaN;
      const requestedCount = Number.isInteger(parsedCount) && parsedCount > 0 ? parsedCount : 12;
      const numMaxItems = Math.min(Math.max(requestedCount, 1), 100);

      // Check cache first
      const cacheKey = `search:${query}:${numMaxItems}:${pageNumber}`;
      const cachedResults = await cache.get(cacheKey);
      
      if (cachedResults) {
        return res.status(200).json({
          ...cachedResults,
          source: 'redis',
          cached: true,
          cacheTimestamp: new Date().toISOString(),
        });
      }

      // Cache miss - scrape data
      logger.info(`Fresh scraping: "${query}" page ${pageNumber} with ${numMaxItems} items`);
      const scraper = platformFactory.createScraper('copart');
      const vehicles = await scraper.scrape(
        `https://www.copart.com/lotSearchResults?free=true&query=${encodeURIComponent(String(query))}`,
        numMaxItems,
        undefined,
        pageNumber,
        numMaxItems  // Pass count explicitly to use in size parameter
      );

      // Save vehicles to Firestore in background
      (async () => {
        let savedCount = 0;
        for (const vehicle of vehicles) {
          const saved = await VehicleRepository.upsertVehicle(vehicle);
          if (saved) savedCount++;
        }
        logger.info(`Background save: ${savedCount}/${vehicles.length} vehicles to Firestore`);
      })().catch(err => logger.error('Background save error:', err));

      // Response with pagination info
      const response: ScraperApiResponse = {
        success: true,
        source: 'copart',
        fresh: true,
        query: String(query),
        page: pageNumber,
        itemsPerPage: numMaxItems,
        requested: requestedCount,
        returned: vehicles.length,
        maxItems: numMaxItems,
        timestamp: new Date().toISOString(),
        vehicles,
        pagination: {
          currentPage: pageNumber,
          itemsPerPage: numMaxItems,
          totalReturned: vehicles.length,
          hasMore: vehicles.length === numMaxItems
        }
      };

      // Cache the results (1 hour TTL)
      await cache.set(cacheKey, response, 3600);

      res.status(200).json(response);
    } catch (error: unknown) {
      logger.error('API error:', error);
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'An error occurred while searching vehicles.',
        details: error instanceof Error ? error.message : 'Unknown error'
      };
      res.status(500).json(errorResponse);
    }
  }

  // Get detailed vehicle info by lot number (single lot page scrape)
  async vehicleByLot(req: Request, res: Response) {
    const lot = req.params.lot || req.query.lot;
    
    if (!lot) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'lot parameter is required in path or query'
      };
      return res.status(400).json(errorResponse);
    }

    try {
      const scraper = platformFactory.createScraper('copart');
      const searchUrl = `https://www.copart.com/lotSearchResults?free=true&query=${encodeURIComponent(String(lot))}`;
      const vehicles = await scraper.scrape(searchUrl, 1);

      if (!vehicles || vehicles.length === 0) {
        const errorResponse: ErrorResponse = {
          success: false,
          error: 'Lot not found or no data extracted'
        };
        return res.status(404).json(errorResponse);
      }

      // Vehicle is already optimized from scraper service
      const response: VehicleByLotResponse = {
        success: true,
        lot: String(lot),
        vehicle: vehicles[0]
      };

      return res.status(200).json(response);
    } catch (err: unknown) {
      logger.error('vehicleByLot error:', err);
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Error extracting lot data',
        details: err instanceof Error ? err.message : String(err)
      };
      return res.status(500).json(errorResponse);
    }
  }
}

export default new ScraperController();

