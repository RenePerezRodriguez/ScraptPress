/**
 * Vehicle Mapper Utility
 * Maps vehicle data to API response format
 */

import { VehicleData, OptimizedVehicle, ImageGalleryItem } from '../../types/vehicle.types';

export class VehicleMapper {
  /**
   * Map VehicleData to OptimizedVehicle format for API responses
   * Ensures all fields have fallback values
   */
  static toApiFormat(vehicle: VehicleData | OptimizedVehicle): OptimizedVehicle {
    // If already optimized, return as is
    if ('image_count' in vehicle) {
      return vehicle as OptimizedVehicle;
    }

    // Map VehicleData to OptimizedVehicle
    const fullVehicle = vehicle as VehicleData;

    // Build gallery ensuring we always return ImageGalleryItem[]
    const gallery = ((): ImageGalleryItem[] => {
      if (fullVehicle.images_gallery && Array.isArray(fullVehicle.images_gallery)) {
        return fullVehicle.images_gallery;
      }
      // If only simple images array exists, normalize it
      if (fullVehicle.images && Array.isArray(fullVehicle.images)) {
        return (fullVehicle.images as Array<string | ImageGalleryItem>).map((img) => {
          if (typeof img === 'string') {
            return { thumbnail: img, full: img, high_res: img };
          }
          return img; // already object
        });
      }
      return [];
    })();

    const primaryImage = fullVehicle.imageUrl || gallery[0]?.full || gallery[0]?.high_res || 'N/A';

    return {
      lot_number: fullVehicle.lot_number || 'N/A',
      vin: fullVehicle.vin || 'N/A',

      year: fullVehicle.year || 'N/A',
      make: fullVehicle.make || 'N/A',
      model: fullVehicle.vehicle_model || 'N/A',
      trim: fullVehicle.trim || 'N/A',
      body_style: fullVehicle.body_style || 'N/A',

      odometer: fullVehicle.odometer || 'N/A',
      engine: fullVehicle.engine || 'N/A',
      cylinders: fullVehicle.cylinders || 'N/A',
      transmission: fullVehicle.transmission || 'N/A',
      drive: fullVehicle.drive || 'N/A',
      fuel: fullVehicle.fuel || 'N/A',

      exterior_color: fullVehicle.color || 'N/A',
      interior_color: fullVehicle.interior_color || 'N/A',

      doc_type: fullVehicle.doc_type || 'N/A',
      title_type: fullVehicle.title_type || 'N/A',
      has_keys: fullVehicle.has_keys || 'N/A',

      primary_damage: fullVehicle.primary_damage || 'N/A',
      secondary_damage: fullVehicle.secondary_damage || 'N/A',

      sale_status: fullVehicle.sale_status || 'N/A',
      current_bid: fullVehicle.current_bid || 'N/A',
      buy_it_now_price: fullVehicle.buy_it_now_price || 'N/A',
      estimated_retail_value: fullVehicle.estimated_retail_value || 'N/A',

      location: fullVehicle.location || 'N/A',
      auction_date: fullVehicle.auction_date || 'N/A',

      // Media
      imageUrl: primaryImage,
      images_gallery: gallery,
      images: gallery,
      image_count: gallery.length,
      engine_video: fullVehicle.engine_video || 'N/A',

      highlights: fullVehicle.highlights?.slice(0, 5) || [],

      copart_url: fullVehicle.copart_url || `https://www.copart.com/lot/${fullVehicle.lot_number}`,
    };
  }

  /**
   * Map array of vehicles to API format
   */
  static toApiFormatArray(vehicles: (VehicleData | OptimizedVehicle)[]): OptimizedVehicle[] {
    return vehicles.map((v) => this.toApiFormat(v));
  }
}
