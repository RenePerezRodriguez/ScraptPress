/**
 * Vehicle Data Transformer for Copart
 * Converts raw Copart API data to internal VehicleData format
 */

import { 
  CopartVehicleRaw, 
  VehicleData, 
  OptimizedVehicle,
  ExtendedVehicleData 
} from '../../../../../types/vehicle.types';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

export class VehicleTransformer {
  /**
   * Extract engine video URL from API data
   */
  private static extractEngineVideo(apiData: any): string {
    // Priority 1: Direct video URL from API (most reliable)
    if (apiData.engine_video && apiData.engine_video !== 'N/A') {
      return apiData.engine_video;
    }
    
    // Priority 2: Video URL from Solr API (when visiting individual lot)
    if (apiData.videoUrl && typeof apiData.videoUrl === 'string') {
      return apiData.videoUrl;
    }
    
    // Priority 3: From 'videos' array if exists
    if (apiData.videos && Array.isArray(apiData.videos) && apiData.videos.length > 0) {
      const engineVideo = apiData.videos.find((v: any) => 
        v.videoType === 'ENGINE' || 
        v.description?.toLowerCase().includes('engine')
      );
      if (engineVideo && (engineVideo.url || engineVideo.videoUrl)) {
        return engineVideo.url || engineVideo.videoUrl;
      }
      // If no engine video, return first video
      if (apiData.videos[0] && (apiData.videos[0].url || apiData.videos[0].videoUrl)) {
        return apiData.videos[0].url || apiData.videos[0].videoUrl;
      }
    }
    
    // Priority 4: Try to construct from image hash (may not work for all vehicles)
    // Note: This often fails because video hashes are different from image hashes
    if (apiData.images_gallery && apiData.images_gallery.length > 0) {
      const firstImage = apiData.images_gallery[0];
      const imageUrl = firstImage.full || firstImage.thumbnail || firstImage.high_res;
      
      if (imageUrl && typeof imageUrl === 'string') {
        // Extract base URL and try common video patterns
        const baseMatch = imageUrl.match(/(https:\/\/.*?\/lpp\/\d+\/)([a-f0-9]{32})/);
        if (baseMatch) {
          const baseUrl = baseMatch[1];
          const imageHash = baseMatch[2];
          // Try constructing video URL (may 404 if video doesn't exist or uses different hash)
          return `${baseUrl}${imageHash}_O.mp4`;
        }
      }
    }
    
    return 'N/A';
  }

  /**
   * Build ImageGalleryItem[] from separate thumbnail/full/high_res arrays or Solr images
   */
  private static buildImageGallery(apiData: any): any[] {
    // Priority 1: Solr images (from /lotdetails/solr/lot-images API)
    if (apiData.solrImages && Array.isArray(apiData.solrImages) && apiData.solrImages.length > 0) {
      logger.debug(`   ✅ Using ${apiData.solrImages.length} images from Solr API`);
      return apiData.solrImages.map((img: any) => ({
        thumbnail: img.thumbnailUrl || img.fullUrl || '',
        full: img.fullUrl || img.thumbnailUrl || '',
        high_res: img.fullUrl || img.thumbnailUrl || '' // Solr doesn't provide high_res separately
      }));
    }
    
    const thumbnails = apiData.images_thumbnail || [];
    const fullImages = apiData.images_full || [];
    const highResImages = apiData.images_high_res || [];
    
    // If we already have images_gallery in the right format, use it
    if (apiData.images_gallery && Array.isArray(apiData.images_gallery) && 
        apiData.images_gallery.length > 0 && 
        typeof apiData.images_gallery[0] === 'object') {
      return apiData.images_gallery;
    }
    
    // Build gallery from separate arrays
    const gallery = [];
    const maxLength = Math.max(thumbnails.length, fullImages.length, highResImages.length);
    
    if (maxLength > 0) {
      for (let i = 0; i < maxLength; i++) {
        gallery.push({
          thumbnail: thumbnails[i] || fullImages[i] || highResImages[i] || '',
          full: fullImages[i] || highResImages[i] || thumbnails[i] || '',
          high_res: highResImages[i] || fullImages[i] || thumbnails[i] || ''
        });
      }
    } else if (apiData.tims) {
      // Fallback: Si solo tenemos tims (imagen principal), usarla
      const timsUrl = apiData.tims;
      const fullUrl = timsUrl.replace('_thb.jpg', '_ful.jpg').replace('_thb.png', '_ful.png');
      const hrsUrl = timsUrl.replace('_thb.jpg', '_hrs.jpg').replace('_thb.png', '_hrs.png');
      
      gallery.push({
        thumbnail: timsUrl,
        full: fullUrl,
        high_res: hrsUrl
      });
      
      logger.debug('   ✅ Using tims as single gallery item');
    }
    
    return gallery;
  }

  /**
   * Transform raw Copart API data to VehicleData
   */
  static transformFromApi(apiData: CopartVehicleRaw): VehicleData {
    // Extract dynamic lot details if available
    const dynamicDetails = (apiData as any).dynamicLotDetails || {};
    
    return {
      // Identification
      lot_number: apiData.lotNumberStr || apiData.lot_number || apiData.lot_number_str || (apiData as any).ln || 'N/A',

      // Vehicle info
      year: String(apiData.lcy || apiData.year || 'N/A'),
      make: apiData.mkn || apiData.make || (apiData as any).lm || 'N/A',
      vehicle_model: apiData.lmdn || apiData.model || (apiData as any).mmod || 'N/A',
      trim: apiData.trim || 'N/A',
      vin: apiData.fv || apiData.vin || 'N/A',

      // Auction info - usando dynamicLotDetails
      sale_status: (apiData as any).ess || apiData.sale_status || 'N/A',
      current_bid: dynamicDetails.currentBid ? `$${dynamicDetails.currentBid}` : 
                   (apiData as any).obc ? `$${(apiData as any).obc}` : 
                   apiData.current_bid || '$0',
      buy_it_now_price: dynamicDetails.buyTodayBid ? `$${dynamicDetails.buyTodayBid}` : 
                        (apiData as any).bnp ? `$${(apiData as any).bnp}` : 
                        apiData.buy_it_now_price || 'N/A',
      auction_date: (apiData as any).ad ? new Date((apiData as any).ad).toISOString() : 
                    apiData.auction_date || 'Future',

      // Location
      location: (apiData as any).yn || apiData.sale_location || apiData.location || 'N/A',
      location_city: apiData.location_city || (apiData as any).locState || 'N/A',
      location_state: apiData.location_state || (apiData as any).locState || 'N/A',
      location_country: apiData.location_country || (apiData as any).locCountry || 'N/A',

      // Odometer
      odometer: (apiData as any).orr ? `${(apiData as any).orr} ${(apiData as any).otu || ''}` : 
                apiData.odometer || 'N/A',
      odometer_status: apiData.odometer_status || (apiData as any).otu || 'N/A',

      // Damage
      primary_damage: (apiData as any).dd || apiData.primary_damage || 'N/A',
      secondary_damage: (apiData as any).sdd || apiData.secondary_damage || 'N/A',

      // Exterior specs
      body_style: (apiData as any).bstl || apiData.body_style || 'N/A',
      doors: String(apiData.doors || 'N/A'),
      color: (apiData as any).clr || apiData.color || 'N/A',
      interior_color: apiData.interior_color || 'N/A',

      // Engine specs
      engine: (apiData as any).egn || apiData.engine || 'N/A',
      cylinders: String((apiData as any).cy || apiData.cylinders || 'N/A'),
      drive: (apiData as any).drv || apiData.drive || 'N/A',
      transmission: apiData.tcn || apiData.transmission || 'N/A',
      fuel: (apiData as any).ft || apiData.fuel || 'N/A',

      // Title and documents
      doc_type: (apiData as any).dtc || apiData.doc_type || 'N/A',
      title_type: apiData.title_type || (apiData as any).td || 'N/A',
      is_clean_title: apiData.is_clean_title || 'No',
      has_keys: apiData.has_keys || ((apiData as any).hk ? 'Yes' : 'N/A'),

      // Engine condition
      engine_condition: apiData.engine_condition || (apiData as any).lcd || 'N/A',

      // Valuation
      estimated_retail_value: String(apiData.erv || apiData.estimated_retail_value || 'N/A'),

      // Media - usar imagen de BUENA calidad (ful en lugar de thb)
      imageUrl: (apiData as any).tims 
        ? (apiData as any).tims.replace('_thb.jpg', '_ful.jpg').replace('_thb.png', '_ful.png')
        : 'N/A',
      images: (apiData as any).tims ? [(apiData as any).tims] : [],

      // Gallery with multiple resolutions - Build ImageGalleryItem[] from separate arrays
      images_gallery: VehicleTransformer.buildImageGallery(apiData),

      // Video - Extract from multiple sources
      engine_video: VehicleTransformer.extractEngineVideo(apiData),

      // Features and details
      highlights: apiData.highlights || [],
      damage_details: apiData.damage_details || [],

      // Link to Copart
      copart_url: `https://www.copart.com/lot/${apiData.lotNumberStr || apiData.lot_number || 'N/A'}`
    };
  }

  /**
   * Optimize VehicleData for UI display
   * Reduces verbose data to essential fields only
   */
  static optimizeForUi(fullData: VehicleData | ExtendedVehicleData): OptimizedVehicle {
    const extendedData = fullData as ExtendedVehicleData;
    
    // DEBUG: Ver qué llega antes de optimizar
    logger.debug(`🔧 optimizeForUi - Lot ${fullData.lot_number}:`);
    logger.debug('   - imageUrl:', fullData.imageUrl ? 'EXISTS' : 'MISSING');
    logger.debug('   - images_gallery length:', fullData.images_gallery?.length || 0);
    logger.debug('   - engine_video:', fullData.engine_video);
    
    return {
      // Core identification
      lot_number: fullData.lot_number,
      vin: fullData.vin,

      // Vehicle basics (header display)
      year: fullData.year,
      make: fullData.make,
      model: fullData.vehicle_model,
      trim: fullData.trim,
      body_style: fullData.body_style,

      // Key specifications (specs grid)
      odometer: fullData.odometer,
      odometer_status: fullData.odometer_status,
      engine: fullData.engine,
      cylinders: fullData.cylinders,
      transmission: fullData.transmission,
      drive: fullData.drive,
      fuel: fullData.fuel,

      // Colors
      exterior_color: fullData.color,
      interior_color: fullData.interior_color,

      // Title and documents
      doc_type: fullData.doc_type,
      title_type: fullData.title_type,
      has_keys: fullData.has_keys,

      // Damage information
      primary_damage: fullData.primary_damage,
      secondary_damage: fullData.secondary_damage,

      // Pricing and status
      sale_status: fullData.sale_status,
      current_bid: fullData.current_bid,
      buy_it_now_price: fullData.buy_it_now_price,
      estimated_retail_value: fullData.estimated_retail_value,

      // Location
      location: fullData.location,
      auction_date: fullData.auction_date,

      // Media (optimized for gallery)
      imageUrl: fullData.imageUrl, // ⭐ Imagen principal
      images_gallery: fullData.images_gallery || [], // ⭐ Galería completa
      images:
        fullData.images_gallery && fullData.images_gallery.length > 0
          ? fullData.images_gallery
          : [],
      image_count: fullData.images_gallery?.length || 0,
      engine_video: fullData.engine_video,

      // Highlights (top features)
      highlights: fullData.highlights || [],

      // Link
      copart_url: fullData.copart_url,
      
      // ===== EXTENDED DATA =====
      
      // Seller information
      seller_name: extendedData.seller?.name,
      seller_title_code: extendedData.seller?.title_code,
      seller_title_description: extendedData.seller?.title_description,
      sale_name: extendedData.sale_name || extendedData.seller?.sale_name,
      
      // Technical specifications (key ones)
      brake_system: extendedData.specifications?.brake_system,
      base_weight: extendedData.specifications?.base_weight,
      displacement: extendedData.specifications?.displacement,
      wheelbase: extendedData.specifications?.wheelbase,
      fuel_tank_capacity: extendedData.specifications?.fuel_tank_capacity,
      city_mpg: extendedData.specifications?.city_mpg,
      highway_mpg: extendedData.specifications?.highway_mpg,
      passenger_capacity: extendedData.specifications?.passenger_capacity,
      
      // Full objects
      specifications: extendedData.specifications,
      styles: extendedData.styles,
      engines: extendedData.engines,
      features: extendedData.features,
      condition_report: extendedData.condition_report,
      
      // Additional info
      notes: extendedData.notes,
      run_and_drive: extendedData.run_and_drive,
    };
  }
}
