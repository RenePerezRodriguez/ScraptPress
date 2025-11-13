/**
 * Extended details extractor for Copart - API-based version
 * Extracts data from Copart API responses (not HTML)
 */

import {
  VehicleSeller,
  VehicleSpecifications,
  VehicleStyle,
  VehicleEngine,
  VehicleFeatures,
  VehicleConditionReport,
  VehicleConditionSection,
  ConditionItem,
  ExtendedVehicleData
} from '../../../../../types/vehicle.types';
import { Logger } from '../../../../../config/logger';

const logger = Logger.getInstance();

/**
 * Extract seller information from API data
 */
export function extractSellerInfo(apiData: any): VehicleSeller {
  const seller: VehicleSeller = {};

  try {
    seller.name = apiData.seller_name || undefined;
    seller.title_code = apiData.title_code || undefined;
    seller.title_description = apiData.title_group_description || undefined;
    seller.sale_name = apiData.sale_name || undefined;
  } catch (error) {
    logger.error('Error extracting seller info:', error);
  }

  return seller;
}

/**
 * Extract technical specifications from build_sheet
 */
export function extractSpecifications(buildSheet: any): VehicleSpecifications {
  const specs: VehicleSpecifications = {};

  try {
    const tech = buildSheet?.technicalSpecification || {};
    
    specs.transmission_description = tech.transmissionDescription || undefined;
    specs.brake_system = tech.absSystem || undefined;
    specs.front_brakes = tech.frontBrakes || undefined;
    specs.rear_brakes = tech.rearBrakes || undefined;
    specs.base_weight = tech.baseWeight || undefined;
    specs.wheelbase = tech.wheelBase || undefined;
    specs.turning_diameter = tech.turningDiameter || undefined;
    specs.passenger_capacity = tech.passengerCapacity || undefined;
    specs.epa_classification = tech.epaClassification || undefined;
    specs.displacement = tech.displacement || undefined;
    specs.axle_ratio = tech.driveAxleRatio || undefined;
    
    // Interior dimensions
    specs.front_leg_room = tech.frontLegRoom || undefined;
    specs.front_shoulder_room = tech.frontShoulderRoom || undefined;
    specs.front_hip_room = tech.frontHipRoom || undefined;
    
    specs.rear_leg_room = tech.secondRowLegRoom || undefined;
    specs.rear_shoulder_room = tech.secondRowShoulderRoom || undefined;
    specs.rear_hip_room = tech.secondRowHipRoom || undefined;
    specs.rear_head_room = tech.secondRowHeadRoom || undefined;
    
    // Suspension
    specs.front_suspension = tech.suspensionTypeFront || undefined;
    specs.rear_suspension = tech.suspensionTypeRear || undefined;
    
    // Fuel economy
    specs.city_mpg = tech.fuelEconomyCity || undefined;
    specs.highway_mpg = tech.fuelEconomyHwy || undefined;
    
    // Tires
    specs.front_tires = tech.frontTires || undefined;
    specs.rear_tires = tech.rearTires || undefined;
    
    // Volume
    specs.passenger_volume = tech.passengerVolume || undefined;
    
  } catch (error) {
    logger.error('Error extracting specifications:', error);
  }

  return specs;
}

/**
 * Extract style information from build_sheet
 */
export function extractStyles(buildSheet: any): VehicleStyle[] {
  const styles: VehicleStyle[] = [];

  try {
    const stylesData = buildSheet?.styles || [];
    
    stylesData.forEach((style: any) => {
      styles.push({
        style_id: style.styleId?.toString(),
        division: style.make,
        subdivision: style.manufactureSubDivision,
        style: style.trim,
        model: style.modelName,
        type: style.vehicleType,
        code: style.manufactureModelCode
      });
    });
  } catch (error) {
    logger.error('Error extracting styles:', error);
  }

  return styles;
}

/**
 * Extract engine information from build_sheet
 */
export function extractEngines(buildSheet: any): VehicleEngine[] {
  const engines: VehicleEngine[] = [];

  try {
    const enginesData = buildSheet?.engines || [];
    
    enginesData.forEach((engine: any) => {
      engines.push({
        engine_type: engine.engineType,
        displacement: engine.displacement?.value ? `${engine.displacement.value} ${engine.displacement.uom}` : undefined,
        fuel_type: engine.fuel?.description,
        power: engine.netHorsePower,
        torque: engine.netTorque,
        fuel_capacity: engine.fuelTankCapacityHigh?.[0]?.value,
        city_fuel_economy: engine.fuelEconomyCityHigh?.[0]?.value,
        highway_fuel_economy: engine.fuelEconomyHwyHigh?.[0]?.value
      });
    });
  } catch (error) {
    logger.error('Error extracting engines:', error);
  }

  return engines;
}

/**
 * Extract features/equipment from build_sheet
 */
export function extractFeatures(buildSheet: any): VehicleFeatures {
  const features: VehicleFeatures = {};

  try {
    const equipment = buildSheet?.equipment?.standard || {};
    
    // Interior features
    if (equipment.INTERIOR) {
      features.interior = equipment.INTERIOR.map((item: any) => item.description);
    }
    
    // Safety features
    if (equipment.SAFETY) {
      features.safety = equipment.SAFETY.map((item: any) => item.description);
    }
    
    // Exterior features
    if (equipment.EXTERIOR) {
      features.exterior = equipment.EXTERIOR.map((item: any) => item.description);
    }
    
    // Mechanical features
    if (equipment.MECHANICAL) {
      features.mechanical = equipment.MECHANICAL.map((item: any) => item.description);
    }
    
    // Entertainment features
    if (equipment.ENTERTAINMENT) {
      features.entertainment = equipment.ENTERTAINMENT.map((item: any) => item.description);
    }
  } catch (error) {
    logger.error('Error extracting features:', error);
  }

  return features;
}

/**
 * Extract condition report/damage details from API data
 */
export function extractConditionReport(apiData: any): VehicleConditionReport | undefined {
  try {
    const damageDetails = apiData.damage_details || [];
    
    if (damageDetails.length === 0) {
      return undefined;
    }

    const report: VehicleConditionReport = {
      exterior: { items: [] },
      interior: { items: [] },
      mechanical: { items: [] }
    };

    // Group damages by area
    damageDetails.forEach((damage: any) => {
      const item: ConditionItem = {
        area: damage.damage_area || 'OTHER',
        description: damage.damageDescription || `${damage.aasc_item_description} - ${damage.aasc_damage_description}`,
        severity: damage.aasc_severity_description
      };

      const component = damage.aasc_item_description?.toLowerCase() || '';
      
      // Categorize by component type
      if (component.includes('seat') ||
          component.includes('interior') ||
          component.includes('dashboard')) {
        report.interior!.items!.push(item);
      } else if (component.includes('engine') ||
                 component.includes('transmission') ||
                 component.includes('brake')) {
        report.mechanical!.items!.push(item);
      } else {
        report.exterior!.items!.push(item);
      }
    });

    // Only include sections with items
    if (report.exterior?.items?.length === 0) delete report.exterior;
    if (report.interior?.items?.length === 0) delete report.interior;
    if (report.mechanical?.items?.length === 0) delete report.mechanical;

    return Object.keys(report).length > 0 ? report : undefined;
  } catch (error) {
    logger.error('Error extracting condition report:', error);
    return undefined;
  }
}

/**
 * Main function to extract all extended details from API data
 */
export function extractAllDetails(apiData: any): Partial<ExtendedVehicleData> {
  try {
    const buildSheet = apiData.build_sheet || {};
    
    return {
      seller: extractSellerInfo(apiData),
      specifications: extractSpecifications(buildSheet),
      styles: extractStyles(buildSheet),
      engines: extractEngines(buildSheet),
      features: extractFeatures(buildSheet),
      condition_report: extractConditionReport(apiData)
    };
  } catch (error) {
    logger.error('Error in extractAllDetails:', error);
    return {};
  }
}
