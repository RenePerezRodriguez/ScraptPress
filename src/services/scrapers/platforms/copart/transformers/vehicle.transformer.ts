/**
 * Vehicle Data Transformer for Copart
 * Converts raw Copart API data to internal VehicleData format
 */

import {
  CopartVehicleRaw,
  VehicleData,
  OptimizedVehicle,
  ExtendedVehicleData,
  ImageGalleryItem,
} from '../../../../../types/vehicle.types';

export class VehicleTransformer {
  /**
   * Extract engine video URL from API data
   */
  private static extractEngineVideo(apiData: CopartVehicleRaw): string {
    // Priority 1: Direct video URL from API (most reliable)
    if (apiData.engine_video && apiData.engine_video !== 'N/A') {
      return apiData.engine_video;
    }

    // Priority 2: Video URL from Solr API (when visiting individual lot)
    const videoUrl = apiData['videoUrl'] as string | undefined;
    if (videoUrl && typeof videoUrl === 'string') {
      return videoUrl;
    }

    // Priority 3: From 'videos' array if exists
    const videos = apiData['videos'] as Record<string, unknown>[];
    if (videos && Array.isArray(videos) && videos.length > 0) {
      const engineVideo = videos.find(
        (v) =>
          v['videoType'] === 'ENGINE' ||
          (v['description'] as string)?.toLowerCase().includes('engine'),
      );
      if (engineVideo && ((engineVideo['url'] as string) || (engineVideo['videoUrl'] as string))) {
        return (engineVideo['url'] as string) || (engineVideo['videoUrl'] as string);
      }
      // If no engine video, return first video
      if (videos[0] && ((videos[0]['url'] as string) || (videos[0]['videoUrl'] as string))) {
        return (videos[0]['url'] as string) || (videos[0]['videoUrl'] as string);
      }
    }

    // Priority 4: Try to construct from image hash (may not work for all vehicles)
    if (apiData.images_gallery && apiData.images_gallery.length > 0) {
      const firstImage = apiData.images_gallery[0];
      const imageUrl = firstImage.full || firstImage.thumbnail || firstImage.high_res;

      if (imageUrl && typeof imageUrl === 'string') {
        const baseMatch = imageUrl.match(/(https:\/\/.*?\/lpp\/\d+\/)([a-f0-9]{32})/);
        if (baseMatch) {
          const baseUrl = baseMatch[1];
          const imageHash = baseMatch[2];
          return `${baseUrl}${imageHash}_O.mp4`;
        }
      }
    }

    return 'N/A';
  }

  /**
   * Build ImageGalleryItem[] from separate thumbnail/full/high_res arrays or Solr images
   */
  private static buildImageGallery(apiData: CopartVehicleRaw): ImageGalleryItem[] {
    // Priority 1: Solr images (from /lotdetails/solr/lot-images API)
    const solrImages = apiData['solrImages'];
    if (solrImages && Array.isArray(solrImages) && solrImages.length > 0) {
      return (solrImages as Record<string, string>[]).map((img) => ({
        thumbnail: img['thumbnailUrl'] || img['fullUrl'] || '',
        full: img['fullUrl'] || img['thumbnailUrl'] || '',
        high_res: img['fullUrl'] || img['thumbnailUrl'] || '',
      }));
    }

    const thumbnails = (apiData.images_thumbnail || []) as string[];
    const fullImages = (apiData.images_full || []) as string[];
    const highResImages = (apiData.images_high_res || []) as string[];

    // If we already have images_gallery in the right format, use it
    if (
      apiData.images_gallery &&
      Array.isArray(apiData.images_gallery) &&
      apiData.images_gallery.length > 0 &&
      typeof apiData.images_gallery[0] === 'object'
    ) {
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
          high_res: highResImages[i] || fullImages[i] || thumbnails[i] || '',
        });
      }
    } else if (apiData['tims']) {
      // Fallback: Si solo tenemos tims (imagen principal), usarla
      const timsUrl = apiData['tims'] as string;
      const fullUrl = timsUrl.replace('_thb.jpg', '_ful.jpg').replace('_thb.png', '_ful.png');
      const hrsUrl = timsUrl.replace('_thb.jpg', '_hrs.jpg').replace('_thb.png', '_hrs.png');

      gallery.push({
        thumbnail: timsUrl,
        full: fullUrl,
        high_res: hrsUrl,
      });
    }

    return gallery;
  }

  /**
   * Transform raw Copart API data to VehicleData
   */
  static transformFromApi(apiData: CopartVehicleRaw): VehicleData {
    // Extract dynamic lot details if available
    const dynamicDetails = (apiData['dynamicLotDetails'] as Record<string, unknown>) || {};
    const ln = apiData['ln'] as string;
    const mkn = apiData['mkn'] as string;
    const lm = apiData['lm'] as string;
    const lmdn = apiData['lmdn'] as string;
    const mmod = apiData['mmod'] as string;
    const ess = apiData['ess'] as string;
    const obc = apiData['obc'] as number;
    const hb = apiData['hb'] as number; // High Bid from Search API
    const bnp = apiData['bnp'] as number;
    const ad = apiData['ad'] as number;
    const yn = apiData['yn'] as string;
    const locState = apiData['locState'] as string;
    const locCountry = apiData['locCountry'] as string;
    const orr = apiData['orr'] as number;
    const otu = apiData['otu'] as string;
    const dd = apiData['dd'] as string;
    const sdd = apiData['sdd'] as string;
    const bstl = apiData['bstl'] as string;
    const clr = apiData['clr'] as string;
    const egn = apiData['egn'] as string;
    const cy = apiData['cy'] as string;
    const drv = apiData['drv'] as string;
    const ft = apiData['ft'] as string;
    const dtc = apiData['dtc'] as string;
    const td = apiData['td'] as string;
    const hk = apiData['hk'] as string;
    const lcd = apiData['lcd'] as string;
    const tims = apiData['tims'] as string;

    return {
      // Identification
      lot_number:
        apiData.lotNumberStr || apiData.lot_number || apiData.lot_number_str || ln || 'N/A',

      // Vehicle info
      year: String(apiData.lcy || apiData.year || 'N/A'),
      make: mkn || apiData.make || lm || 'N/A',
      vehicle_model: lmdn || apiData.model || mmod || 'N/A',
      trim: apiData.trim || 'N/A',
      vin: apiData.fv || apiData.vin || 'N/A',

      // Auction info - usando dynamicLotDetails
      sale_status: ess || apiData.sale_status || 'N/A',
      current_bid: dynamicDetails.currentBid
        ? `$${dynamicDetails.currentBid}`
        : hb
          ? `$${hb}`
          : obc
            ? `$${obc}`
            : apiData.current_bid || '$0',
      current_bid_value: Number(dynamicDetails.currentBid || hb || obc || 0),
      buy_it_now_price: dynamicDetails.buyTodayBid
        ? `$${dynamicDetails.buyTodayBid}`
        : bnp
          ? `$${bnp}`
          : apiData.buy_it_now_price || 'N/A',
      buy_it_now_value: Number(dynamicDetails.buyTodayBid || bnp || 0),
      auction_date: ad ? new Date(ad).toISOString() : apiData.auction_date || 'Future',

      // Location
      location: yn || apiData.sale_location || apiData.location || 'N/A',
      location_city: apiData.location_city || locState || 'N/A',
      location_state: apiData.location_state || locState || 'N/A',
      location_country: apiData.location_country || locCountry || 'N/A',

      // Odometer
      odometer: orr ? `${orr} ${otu || ''}` : apiData.odometer || 'N/A',
      mileage_value: orr || 0,
      mileage_unit: otu || (orr ? 'mi' : undefined),
      odometer_status: apiData.odometer_status || otu || 'N/A',

      // Damage
      primary_damage: dd || apiData.primary_damage || 'N/A',
      secondary_damage: sdd || apiData.secondary_damage || 'N/A',

      // Exterior specs
      body_style: bstl || apiData.body_style || 'N/A',
      doors: String(apiData.doors || 'N/A'),
      color: clr || apiData.color || 'N/A',
      interior_color: apiData.interior_color || 'N/A',

      // Engine specs
      engine: egn || apiData.engine || 'N/A',
      cylinders: String(cy || apiData.cylinders || 'N/A'),
      drive: drv || apiData.drive || 'N/A',
      transmission: apiData.tcn || apiData.transmission || 'N/A',
      fuel: ft || apiData.fuel || 'N/A',

      // Title and documents
      doc_type: dtc || apiData.doc_type || 'N/A',
      title_type: apiData.title_type || td || 'N/A',
      is_clean_title: apiData.is_clean_title || 'No',
      has_keys: apiData.has_keys || (hk ? 'Yes' : 'N/A'),

      // Engine condition
      engine_condition: apiData.engine_condition || lcd || 'N/A',

      // Valuation
      estimated_retail_value: String(apiData.erv || apiData.estimated_retail_value || 'N/A'),

      // Media - usar imagen de BUENA calidad (ful en lugar de thb)
      imageUrl: tims ? tims.replace('_thb.jpg', '_ful.jpg').replace('_thb.png', '_ful.png') : 'N/A',
      images: tims ? [tims] : [],

      // Gallery with multiple resolutions - Build ImageGalleryItem[] from separate arrays
      images_gallery: VehicleTransformer.buildImageGallery(apiData),

      // Video - Extract from multiple sources
      engine_video: VehicleTransformer.extractEngineVideo(apiData),

      // Features and details
      highlights: apiData.highlights || [],
      damage_details: apiData.damage_details || [],

      // Link to Copart
      copart_url: `https://www.copart.com/lot/${apiData.lotNumberStr || apiData.lot_number || 'N/A'}`,
    };
  }

  /**
   * Optimize VehicleData for UI display
   * Reduces verbose data to essential fields only
   */
  static optimizeForUi(fullData: VehicleData | ExtendedVehicleData): OptimizedVehicle {
    const extendedData = fullData as ExtendedVehicleData;

    // DEBUG: Ver qué llega antes de optimizar
    // UI optimization complete

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
      mileage_value: fullData.mileage_value,
      mileage_unit: fullData.mileage_unit,
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
      current_bid_value: fullData.current_bid_value,
      buy_it_now_price: fullData.buy_it_now_price,
      buy_it_now_value: fullData.buy_it_now_value,
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
