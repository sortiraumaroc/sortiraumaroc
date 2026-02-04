/**
 * Filter taxonomy re-exports from the main taxonomy file
 * This file exists for backward compatibility and convenience
 */

export {
  // ============================================
  // RESTAURANTS
  // ============================================
  CUISINE_TYPES,
  type CuisineType,
  AMBIANCE_TYPES,
  type AmbianceType,
  PRICE_RANGES,
  type PriceRange,

  // ============================================
  // SPORT & BIEN-ÊTRE
  // ============================================
  SPORT_SPECIALTIES,
  type SportSpecialty,
  SPORT_AMENITIES,
  type SportAmenity,

  // ============================================
  // LOISIRS
  // ============================================
  LOISIRS_SPECIALTIES,
  type LoisirsSpecialty,
  LOISIRS_PUBLIC,
  type LoisirsPublic,

  // ============================================
  // HÉBERGEMENT
  // ============================================
  HEBERGEMENT_TYPES,
  type HebergementType,
  HOTEL_AMENITIES,
  type HotelAmenity,
  ROOM_TYPES,
  type RoomType,

  // ============================================
  // CULTURE
  // ============================================
  CULTURE_TYPES,
  type CultureType,
  CULTURE_PUBLIC,
  type CulturePublic,

  // ============================================
  // SHOPPING
  // ============================================
  SHOPPING_TYPES,
  type ShoppingType,
  SHOPPING_SERVICES,
  type ShoppingService,

  // ============================================
  // RENTACAR (SE DÉPLACER)
  // ============================================
  VEHICLE_TYPES,
  type VehicleType,
  FUEL_TYPES,
  type FuelType,
  TRANSMISSION_TYPES,
  type TransmissionType,
  VEHICLE_FEATURES,
  type VehicleFeature,
  RENTAL_SERVICES,
  type RentalService,
  VEHICLE_BRANDS,
  type VehicleBrand,

  // ============================================
  // HELPER FUNCTIONS
  // ============================================
  getUniverseFilterOptions,
  filterAvailableOptions,
} from "./taxonomy";
