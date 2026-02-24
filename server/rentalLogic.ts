// =============================================================================
// RENTAL VEHICLES MODULE — Business Logic
// Search, availability, pricing, contract generation
// =============================================================================

import { getAdminSupabase } from "./supabaseAdmin";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("rentalLogic");
import type {
  RentalVehicle,
  RentalVehicleSpecs,
  RentalVehiclePricing,
  RentalSearchParams,
  RentalPriceQuote,
  RentalReservationStatus,
  RentalSelectedOption,
} from "../shared/rentalTypes";
import { RENTAL_OCCUPYING_STATUS_SET } from "../shared/rentalTypes";

// =============================================================================
// HELPERS
// =============================================================================

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 5 || day === 6 || day === 0; // Fri, Sat, Sun
}

function isInHighSeason(
  date: Date,
  highSeasonDates: Array<{ start: string; end: string }> | null,
): boolean {
  if (!highSeasonDates || highSeasonDates.length === 0) return false;
  const ts = date.getTime();
  return highSeasonDates.some((period) => {
    const s = new Date(period.start).getTime();
    const e = new Date(period.end).getTime();
    return ts >= s && ts <= e;
  });
}

export function generateBookingReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "LOC-";
  for (let i = 0; i < 8; i++) {
    ref += chars[Math.floor(Math.random() * chars.length)];
  }
  return ref;
}

// =============================================================================
// 1. GET RENTAL CITIES — Dynamic from active rental establishments
// =============================================================================

export async function getRentalCities(): Promise<string[]> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("establishments")
    .select("city")
    .eq("universe", "rentacar")
    .eq("status", "active")
    .not("city", "is", null);

  if (error || !data) return [];

  const cities = [...new Set((data as any[]).map((r) => r.city).filter(Boolean))];
  cities.sort((a, b) => a.localeCompare(b, "fr"));
  return cities;
}

// =============================================================================
// 2. SEARCH RENTAL VEHICLES
// =============================================================================

export interface RentalSearchResult {
  vehicles: Array<RentalVehicle & {
    establishment_name: string;
    establishment_city: string;
    establishment_logo?: string;
    establishment_rating?: number;
    establishment_review_count?: number;
    cancellation_policy?: string;
    price_per_day: number;
    total_price: number;
    rental_days: number;
  }>;
  total: number;
  page: number;
  per_page: number;
}

export async function searchRentalVehicles(
  params: RentalSearchParams,
): Promise<RentalSearchResult> {
  const supabase = getAdminSupabase();
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(50, Math.max(1, params.per_page || 20));
  const offset = (page - 1) * perPage;

  // Base query: active vehicles from active rentacar establishments
  let query = supabase
    .from("rental_vehicles")
    .select(
      `
      *,
      establishments!inner (
        id, name, city, logo_url, status, universe
      )
    `,
      { count: "exact" },
    )
    .eq("status", "active")
    .eq("establishments.status", "active")
    .eq("establishments.universe", "rentacar");

  // Establishment filter (for single-agency pages)
  if (params.establishment_id) {
    query = query.eq("establishment_id", params.establishment_id);
  }

  // City filter
  if (params.pickup_city) {
    query = query.ilike("establishments.city", `%${params.pickup_city}%`);
  }

  // Category filter
  if (params.category) {
    query = query.eq("category", params.category);
  }

  // Transmission filter (stored in specs jsonb)
  if (params.transmission) {
    query = query.contains("specs", { transmission: params.transmission });
  }

  // Fuel type filter
  if (params.fuel_type) {
    query = query.contains("specs", { fuel_type: params.fuel_type });
  }

  // AC filter
  if (params.ac !== undefined) {
    query = query.contains("specs", { ac: params.ac });
  }

  // Seats filter
  if (params.min_seats) {
    query = query.gte("specs->seats", params.min_seats);
  }

  // Doors filter
  if (params.doors) {
    query = query.eq("specs->doors", params.doors);
  }

  // Mileage policy
  if (params.mileage_policy) {
    query = query.eq("mileage_policy", params.mileage_policy);
  }

  // Sorting
  switch (params.sort_by) {
    case "price_asc":
      query = query.order("pricing->standard", { ascending: true });
      break;
    case "price_desc":
      query = query.order("pricing->standard", { ascending: false });
      break;
    case "rating":
      // Will sort client-side after enrichment
      break;
    default:
      query = query.order("sort_order", { ascending: true });
  }

  query = query.range(offset, offset + perPage - 1);

  const { data, error, count } = await query;

  if (error) {
    log.error({ err: error }, "searchRentalVehicles error");
    return { vehicles: [], total: 0, page, per_page: perPage };
  }

  const rentalDays = params.pickup_date && params.dropoff_date
    ? daysBetween(params.pickup_date, params.dropoff_date)
    : 1;

  // Enrich with pricing and establishment info
  const vehicles = (data || []).map((row: any) => {
    const est = row.establishments;
    const pricing = row.pricing as RentalVehiclePricing;
    const pricePerDay = pricing.standard || 0;

    // Calculate total price based on rental days
    let totalPrice = 0;
    if (params.pickup_date && params.dropoff_date) {
      totalPrice = calculateTotalBasePrice(
        pricing,
        params.pickup_date,
        params.dropoff_date,
        row.high_season_dates,
      );
    } else {
      totalPrice = pricePerDay * rentalDays;
    }

    return {
      ...row,
      establishments: undefined,
      establishment_name: est?.name ?? "",
      establishment_city: est?.city ?? "",
      establishment_logo: est?.logo_url ?? null,
      establishment_rating: null, // enriched later if needed
      establishment_review_count: 0,
      cancellation_policy: "moderate",
      price_per_day: pricePerDay,
      total_price: totalPrice,
      rental_days: rentalDays,
    };
  });

  // Price range filter (client-side after calculation)
  const filtered = vehicles.filter((v: any) => {
    if (params.min_price && v.price_per_day < params.min_price) return false;
    if (params.max_price && v.price_per_day > params.max_price) return false;
    return true;
  });

  return {
    vehicles: filtered,
    total: count ?? filtered.length,
    page,
    per_page: perPage,
  };
}

// =============================================================================
// 3. CALCULATE PRICE
// =============================================================================

function calculateTotalBasePrice(
  pricing: RentalVehiclePricing,
  pickupDate: string,
  dropoffDate: string,
  highSeasonDates: Array<{ start: string; end: string }> | null,
): number {
  const start = new Date(pickupDate);
  const end = new Date(dropoffDate);
  const totalDays = daysBetween(pickupDate, dropoffDate);
  let total = 0;
  let standardDays = 0;
  let weekendDays = 0;
  let highSeasonDays = 0;

  for (let i = 0; i < totalDays; i++) {
    const currentDate = new Date(start);
    currentDate.setDate(currentDate.getDate() + i);

    if (pricing.high_season && isInHighSeason(currentDate, highSeasonDates)) {
      total += pricing.high_season;
      highSeasonDays++;
    } else if (pricing.weekend && isWeekend(currentDate)) {
      total += pricing.weekend;
      weekendDays++;
    } else {
      total += pricing.standard;
      standardDays++;
    }
  }

  // Apply long duration discount
  if (pricing.long_duration_discount && totalDays >= pricing.long_duration_discount.min_days) {
    const discountPercent = pricing.long_duration_discount.discount_percent;
    total = total * (1 - discountPercent / 100);
  }

  return Math.round(total * 100) / 100;
}

export async function calculateRentalPrice(args: {
  vehicleId: string;
  pickupDate: string;
  dropoffDate: string;
  selectedOptions?: RentalSelectedOption[];
  insurancePlanId?: string | null;
}): Promise<RentalPriceQuote | null> {
  const supabase = getAdminSupabase();

  // Fetch vehicle
  const { data: vehicle, error: vErr } = await supabase
    .from("rental_vehicles")
    .select("*")
    .eq("id", args.vehicleId)
    .single();

  if (vErr || !vehicle) return null;

  const pricing = vehicle.pricing as RentalVehiclePricing;
  const totalDays = daysBetween(args.pickupDate, args.dropoffDate);
  const basePrice = calculateTotalBasePrice(
    pricing,
    args.pickupDate,
    args.dropoffDate,
    vehicle.high_season_dates,
  );

  // Calculate price breakdown
  let standardDays = 0;
  let weekendDays = 0;
  let highSeasonDays = 0;
  const start = new Date(args.pickupDate);
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (isInHighSeason(d, vehicle.high_season_dates)) highSeasonDays++;
    else if (isWeekend(d)) weekendDays++;
    else standardDays++;
  }

  // Calculate long duration discount
  let longDurationDiscount = 0;
  if (
    pricing.long_duration_discount &&
    totalDays >= pricing.long_duration_discount.min_days
  ) {
    const rawTotal = standardDays * pricing.standard +
      weekendDays * (pricing.weekend || pricing.standard) +
      highSeasonDays * (pricing.high_season || pricing.standard);
    longDurationDiscount = Math.round(
      rawTotal * (pricing.long_duration_discount.discount_percent / 100) * 100,
    ) / 100;
  }

  // Options total
  let optionsTotal = 0;
  if (args.selectedOptions) {
    for (const opt of args.selectedOptions) {
      if (opt.price_type === "per_day") {
        optionsTotal += opt.price * totalDays * opt.quantity;
      } else {
        optionsTotal += opt.price * opt.quantity;
      }
    }
  }

  // Insurance total
  let insuranceTotal = 0;
  let depositAmount = 5000; // default deposit
  if (args.insurancePlanId) {
    const { data: plan } = await supabase
      .from("rental_insurance_plans")
      .select("*")
      .eq("id", args.insurancePlanId)
      .single();

    if (plan) {
      insuranceTotal = (plan.price_per_day as number) * totalDays;
      depositAmount = plan.franchise as number;
    }
  }

  const totalPrice = basePrice + optionsTotal + insuranceTotal;

  return {
    vehicle_id: args.vehicleId,
    rental_days: totalDays,
    price_per_day: Math.round((basePrice / totalDays) * 100) / 100,
    base_price: basePrice,
    options_total: Math.round(optionsTotal * 100) / 100,
    insurance_total: Math.round(insuranceTotal * 100) / 100,
    deposit_amount: depositAmount,
    total_price: Math.round(totalPrice * 100) / 100,
    currency: "MAD",
    breakdown: {
      standard_days: standardDays,
      standard_rate: pricing.standard,
      weekend_days: weekendDays,
      weekend_rate: pricing.weekend || pricing.standard,
      high_season_days: highSeasonDays,
      high_season_rate: pricing.high_season || pricing.standard,
      long_duration_discount: longDurationDiscount,
    },
  };
}

// =============================================================================
// 4. AVAILABILITY CHECK
// =============================================================================

export async function checkVehicleAvailability(args: {
  vehicleId: string;
  pickupDate: string;
  dropoffDate: string;
  excludeReservationId?: string;
}): Promise<{ available: boolean; quantity: number; booked: number }> {
  const supabase = getAdminSupabase();

  // Get vehicle quantity
  const { data: vehicle } = await supabase
    .from("rental_vehicles")
    .select("quantity, status")
    .eq("id", args.vehicleId)
    .single();

  if (!vehicle || vehicle.status !== "active") {
    return { available: false, quantity: 0, booked: 0 };
  }

  const quantity = vehicle.quantity as number;

  // Check date blocks
  const { data: blocks } = await supabase
    .from("rental_vehicle_date_blocks")
    .select("id")
    .eq("vehicle_id", args.vehicleId)
    .lte("start_date", args.dropoffDate)
    .gte("end_date", args.pickupDate)
    .limit(1);

  if (blocks && blocks.length > 0) {
    return { available: false, quantity, booked: quantity };
  }

  // Count existing occupying reservations that overlap
  let resQuery = supabase
    .from("rental_reservations")
    .select("id", { count: "exact" })
    .eq("vehicle_id", args.vehicleId)
    .in("status", [...RENTAL_OCCUPYING_STATUS_SET])
    .lte("pickup_date", args.dropoffDate)
    .gte("dropoff_date", args.pickupDate);

  if (args.excludeReservationId) {
    resQuery = resQuery.neq("id", args.excludeReservationId);
  }

  const { count } = await resQuery;
  const booked = count ?? 0;

  return {
    available: booked < quantity,
    quantity,
    booked,
  };
}

// =============================================================================
// 5. DEPOSIT CALCULATION
// =============================================================================

export async function calculateDeposit(insurancePlanId: string | null): Promise<number> {
  if (!insurancePlanId) return 5000; // Default 5000 MAD

  const supabase = getAdminSupabase();
  const { data: plan } = await supabase
    .from("rental_insurance_plans")
    .select("franchise")
    .eq("id", insurancePlanId)
    .single();

  return plan ? (plan.franchise as number) : 5000;
}

// =============================================================================
// 6. CONTRACT PDF GENERATION (simple text-based)
// =============================================================================

export async function generateRentalContractData(reservationId: string): Promise<{
  rental: any;
  vehicle: any;
  establishment: any;
  user: any;
  insurance: any;
  kycDocs: any[];
} | null> {
  const supabase = getAdminSupabase();

  const { data: rental } = await supabase
    .from("rental_reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (!rental) return null;

  const [vehicleRes, estRes, insuranceRes, kycRes] = await Promise.all([
    supabase
      .from("rental_vehicles")
      .select("*")
      .eq("id", rental.vehicle_id)
      .single(),
    supabase
      .from("establishments")
      .select("name, city, address, phone, email")
      .eq("id", rental.establishment_id)
      .single(),
    rental.insurance_plan_id
      ? supabase
          .from("rental_insurance_plans")
          .select("*")
          .eq("id", rental.insurance_plan_id)
          .single()
      : { data: null },
    supabase
      .from("rental_kyc_documents")
      .select("*")
      .eq("reservation_id", reservationId),
  ]);

  // Fetch user basic info
  const { data: userData } = await supabase.auth.admin.getUserById(rental.user_id);

  return {
    rental,
    vehicle: vehicleRes.data,
    establishment: estRes.data,
    user: userData?.user
      ? { email: userData.user.email, phone: userData.user.phone }
      : null,
    insurance: insuranceRes.data,
    kycDocs: kycRes.data || [],
  };
}

// =============================================================================
// 7. GET VEHICLE DETAIL (public)
// =============================================================================

export async function getRentalVehicleDetail(vehicleId: string) {
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from("rental_vehicles")
    .select(
      `
      *,
      establishments!inner (
        id, name, city, address, phone, logo_url, hours,
        lat, lng, status, universe
      )
    `,
    )
    .eq("id", vehicleId)
    .eq("status", "active")
    .single();

  if (error || !data) return null;

  // Fetch options for this establishment
  const { data: options } = await supabase
    .from("rental_options")
    .select("*")
    .eq("establishment_id", (data as any).establishments.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return {
    ...data,
    rental_options: options || [],
  };
}
