/**
 * Type definitions for vehicle data structures
 * Eliminates 'any' types across the application
 */

// ============= Copart API Response Types =============

export interface CopartSearchResponse {
  data: CopartSearchData;
  returnCode: number;
}

export interface CopartSearchData {
  results?: {
    content: CopartVehicleRaw[];
    totalElements: number;
  };
  length?: number;
  [key: string]: unknown;
}

export interface CopartVehicleRaw {
  // Identification
  lotNumberStr?: string;
  lot_number?: string;
  lot_number_str?: string;
  ln?: string;
  fv?: string;
  vin?: string;

  // Vehicle basic info
  lcy?: number | string;
  year?: number | string;
  mkn?: string;
  make?: string;
  lmdn?: string;
  model?: string;
  trim?: string;

  // Auction info
  ess?: string;
  sale_status?: string;
  cb?: number;
  current_bid?: string;
  bn?: number;
  buy_it_now_price?: string;
  ad?: string | number;
  auction_date?: string;

  // Location
  yn?: string;
  sale_location?: string;
  location?: string;
  location_city?: string;
  location_state?: string;
  location_country?: string;

  // Odometer
  orr?: number;
  otu?: string;
  odometer?: string;
  odometer_status?: string;

  // Damage
  dd?: string;
  primary_damage?: string;
  sdd?: string;
  secondary_damage?: string;

  // Exterior
  bstl?: string;
  body_style?: string;
  doors?: number | string;
  clr?: string;
  color?: string;
  interior_color?: string;

  // Engine
  egn?: string;
  engine?: string;
  cylinders?: number | string;
  dvc?: string;
  drive?: string;
  tcn?: string;
  transmission?: string;
  ft?: string;
  fuel?: string;

  // Title
  dtc?: string;
  doc_type?: string;
  title_type?: string;
  is_clean_title?: string;
  has_keys?: string;
  engine_condition?: string;

  // Valuation
  erv?: number | string;
  estimated_retail_value?: string;

  // Media
  imageUrl?: string;
  i?: string[];
  images?: string[];
  images_thumbnail?: string[];
  images_gallery?: ImageGalleryItem[];
  engine_video?: string;

  // Features
  highlights?: string[];
  damage_details?: string[];

  [key: string]: unknown;
}

// ============= Internal Vehicle Data Types =============

export interface ImageGalleryItem {
  thumbnail: string;
  full: string;
  high_res: string;
}

export interface VehicleData {
  // Identification
  lot_number: string;
  vin: string;

  // Vehicle info
  year: string;
  make: string;
  vehicle_model: string;
  trim: string;

  // Auction info
  sale_status: string;
  current_bid: string;
  current_bid_value?: number;
  buy_it_now_price: string;
  buy_it_now_value?: number;
  auction_date: string;

  // Location
  location: string;
  location_city: string;
  location_state: string;
  location_country: string;

  // Odometer
  odometer: string;
  mileage_value?: number;
  mileage_unit?: string;
  odometer_status: string;

  // Damage
  primary_damage: string;
  secondary_damage: string;

  // Exterior specs
  body_style: string;
  doors: string;
  color: string;
  interior_color: string;

  // Engine specs
  engine: string;
  cylinders: string;
  drive: string;
  transmission: string;
  fuel: string;

  // Title and documents
  doc_type: string;
  title_type: string;
  is_clean_title: string;
  has_keys: string;

  // Engine condition
  engine_condition: string;

  // Valuation
  estimated_retail_value: string;

  // Media
  imageUrl: string;
  images: string[] | ImageGalleryItem[];
  images_gallery: ImageGalleryItem[];
  engine_video: string;

  // Features and details
  highlights: string[];
  damage_details: string[];

  // Extended details from AI extraction (optional)
  assessment?: {
    frontLeft?: string;
    frontRight?: string;
    rearLeft?: string;
    rearRight?: string;
    roofTop?: string;
    undercarriage?: string;
  };
  styles?: Array<{
    division?: string;
    subdivision?: string;
    series?: string;
    model?: string;
    trim?: string;
    body?: string;
    msrp?: number;
  }>;
  engines?: Array<{
    type?: string;
    displacement?: string;
    fuelTank?: string;
    horsepower?: string;
    transmission?: string;
    aspiration?: string;
    blockType?: string;
    cylinders?: string;
  }>;
  features?: string[] | VehicleFeatures; // Can be array or object
  safety?: string[];
  environment?: {
    epaRating?: string;
    emissions?: string;
  };

  // Link
  copart_url: string;
}

// ============= Optimized Vehicle for API Response =============

export interface OptimizedVehicle {
  // Core identification
  lot_number: string;
  vin: string;

  // Vehicle basics (header display)
  year: string;
  make: string;
  model: string;
  trim: string;
  body_style: string;

  // Allow additional dynamic properties
  [key: string]: unknown;

  // Key specifications (specs grid)
  odometer: string;
  odometer_status?: string;
  engine: string;
  cylinders: string;
  transmission: string;
  drive: string;
  fuel: string;

  // Colors
  exterior_color: string;
  interior_color: string;

  // Title and documents
  doc_type: string;
  title_type: string;
  has_keys: string;

  // Damage information
  primary_damage: string;
  secondary_damage: string;

  // Pricing and status
  sale_status: string;
  current_bid: string;
  current_bid_value?: number; // Raw numeric
  buy_it_now_price: string;
  buy_it_now_value?: number; // Raw numeric
  estimated_retail_value: string;
  estimated_retail_value_amount?: number; // Raw numeric

  // Location
  location: string;
  auction_date: string;

  // Media (optimized for gallery)
  imageUrl: string; // ⭐ Main image URL
  images_gallery: ImageGalleryItem[]; // ⭐ Full gallery
  images: ImageGalleryItem[];
  image_count: number;
  engine_video: string;

  // Highlights (top features only)
  highlights: string[];

  // Link
  copart_url: string;

  // ===== EXTENDED DATA =====

  // Odometer Details
  mileage_value?: number; // Raw numeric
  mileage_unit?: string; // 'mi' or 'km'

  // Seller information
  seller_name?: string;
  seller_title_code?: string;
  seller_title_description?: string;
  sale_name?: string;

  // Technical specifications (key ones for display)
  brake_system?: string;
  base_weight?: string;
  displacement?: string;
  wheelbase?: string;
  fuel_tank_capacity?: string;
  city_mpg?: string;
  highway_mpg?: string;
  passenger_capacity?: string;

  // Full specifications object
  specifications?: VehicleSpecifications;

  // Style information
  styles?: VehicleStyle[];

  // Engine details
  engines?: VehicleEngine[];

  // Features by category
  features?: VehicleFeatures;

  // Condition report
  condition_report?: VehicleConditionReport;

  // Additional info
  notes?: string;
  run_and_drive?: string;
}

// ============= API Request/Response Types =============

export interface ScraperApiRequest {
  query: string;
  count?: number;
  maxItems?: number;
  limit?: number;
  perPage?: number;
}

export interface ScraperApiResponse {
  success: boolean;
  source?: 'copart' | 'redis' | 'firestore';
  cached?: boolean;
  fresh?: boolean;
  query: string;
  page?: number;
  itemsPerPage?: number;
  requested: number;
  returned: number;
  maxItems: number;
  timestamp: string;
  vehicles: OptimizedVehicle[];
  pagination?: {
    currentPage: number;
    itemsPerPage: number;
    totalReturned: number;
    hasMore: boolean;
  };
}

export interface VehicleByLotResponse {
  success: boolean;
  lot: string;
  vehicle: OptimizedVehicle;
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
}

// ============= Scraper Internal Types =============

export interface ScraperOptions {
  maxItems?: number;
  onLog?: LogCallback;
}

export type LogCallback = (payload: LogPayload) => void;

export interface LogPayload {
  level: 'info' | 'error' | 'warn' | 'done';
  msg: string;
  count?: number;
  results?: unknown[];
}

export interface ParsedUrl {
  query: string;
  isSingleLot: boolean;
}

// ============= DOM Extraction Types =============

export interface ExtractedImages {
  images_gallery: ImageGalleryItem[];
  engine_video: string;
}

export interface ExtractedHighlights {
  highlights: string[];
}

// ============= Extended Vehicle Data Types =============

export interface VehicleSpecifications {
  // Brake system
  brake_system?: string;
  base_weight?: string;

  // Dimensions
  displacement?: string;
  axle_ratio?: string;
  front_brakes?: string;
  rear_brakes?: string;
  epa_classification?: string;

  // Spaces
  front_hip_room?: string;
  front_leg_room?: string;
  front_shoulder_room?: string;
  rear_hip_room?: string;
  rear_leg_room?: string;
  rear_shoulder_room?: string;
  rear_head_room?: string;

  // Tires and capacity
  front_tires?: string;
  rear_tires?: string;
  passenger_capacity?: string;
  passenger_volume?: string;
  cargo_volume?: string;

  // Suspension and handling
  front_suspension?: string;
  rear_suspension?: string;
  turning_diameter?: string;
  wheelbase?: string;

  // Transmission details
  transmission_description?: string;

  // Fuel economy
  city_mpg?: string;
  highway_mpg?: string;
  fuel_tank_capacity?: string;
}

export interface VehicleStyle {
  style_id?: string;
  division?: string;
  subdivision?: string;
  style?: string;
  model?: string;
  type?: string;
  code?: string;
}

export interface VehicleEngine {
  engine_type?: string;
  displacement?: string;
  fuel_type?: string;
  power?: string;
  city_fuel_economy?: string;
  highway_fuel_economy?: string;
  fuel_capacity?: string;
  torque?: string;
}

export interface VehicleFeatures {
  interior?: string[];
  safety?: string[];
  exterior?: string[];
  mechanical?: string[];
  entertainment?: string[];
}

export interface VehicleConditionReport {
  exterior?: VehicleConditionSection;
  interior?: VehicleConditionSection;
  mechanical?: VehicleConditionSection;
}

export interface VehicleConditionSection {
  items?: ConditionItem[];
  diagram?: ConditionDiagram;
}

export interface ConditionItem {
  area: string;
  description: string;
  severity?: string;
}

export interface ConditionDiagram {
  front_left?: string;
  front_right?: string;
  rear_left?: string;
  rear_right?: string;
  other?: string[];
}

export interface VehicleSeller {
  name?: string;
  title_code?: string;
  title_description?: string;
  sale_name?: string;
  sale_type?: string;
}

// Extended VehicleData with all additional fields
export interface ExtendedVehicleData extends VehicleData {
  // Seller information
  seller?: VehicleSeller;

  // Technical specifications
  specifications?: VehicleSpecifications;

  // Style information
  styles?: VehicleStyle[];

  // Engine details
  engines?: VehicleEngine[];

  // Features by category
  features?: VehicleFeatures;

  // Condition report
  condition_report?: VehicleConditionReport;

  // Additional fields
  sale_name?: string;
  notes?: string;
  run_and_drive?: string;
}
