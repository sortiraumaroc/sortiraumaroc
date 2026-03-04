/**
 * Seed Rental Demo Data — Auth Users, Memberships & Reservations
 * ==============================================================
 *
 * This script creates:
 *   1. 6 pro accounts (one per rental establishment)
 *   2. pro_profiles + pro_establishment_memberships
 *   3. 3 consumer test accounts
 *   4. ~25 rental reservations at various statuses
 *
 * Prerequisites:
 *   - Run server/migrations/20260219_rental_demo_seed.sql FIRST
 *     (creates establishments, vehicles, options, promo codes)
 *
 * Usage:
 *   npx tsx server/scripts/seed-rental-demo.ts
 *
 * Idempotent: handles "user already exists" gracefully.
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// =============================================================================
// CONSTANTS — Must match the SQL seed UUIDs
// =============================================================================

const ESTABLISHMENT_IDS = {
  hertz: "11111111-aaaa-bbbb-cccc-000000000001",
  saharacar: "11111111-aaaa-bbbb-cccc-000000000002",
  casarent: "11111111-aaaa-bbbb-cccc-000000000003",
  atlantic: "11111111-aaaa-bbbb-cccc-000000000004",
  prestige: "11111111-aaaa-bbbb-cccc-000000000005",
  fesauto: "11111111-aaaa-bbbb-cccc-000000000006",
};

// Vehicle IDs from SQL (first vehicle of each establishment for reservations)
const VEHICLE_IDS = {
  hertz_clio: "22222222-0001-0001-0001-000000000001",
  hertz_golf: "22222222-0001-0001-0001-000000000003",
  hertz_duster: "22222222-0001-0001-0001-000000000007",
  hertz_mercedes_e: "22222222-0001-0001-0001-000000000013",
  sahara_duster: "22222222-0002-0001-0001-000000000001",
  sahara_hilux: "22222222-0002-0001-0001-000000000002",
  sahara_prado: "22222222-0002-0001-0001-000000000003",
  casa_sandero: "22222222-0003-0001-0001-000000000001",
  casa_308: "22222222-0003-0001-0001-000000000003",
  casa_zoe: "22222222-0003-0001-0001-000000000010",
  atlantic_i10: "22222222-0004-0001-0001-000000000001",
  atlantic_sportage: "22222222-0004-0001-0001-000000000005",
  prestige_classe_s: "22222222-0005-0001-0001-000000000001",
  prestige_range_rover: "22222222-0005-0001-0001-000000000004",
  prestige_911: "22222222-0005-0001-0001-000000000007",
  fes_sandero: "22222222-0006-0001-0001-000000000001",
  fes_duster: "22222222-0006-0001-0001-000000000005",
};

const PRO_ACCOUNTS = [
  { email: "hertz@demo.sam.ma", company: "Hertz Location Maroc", establishmentId: ESTABLISHMENT_IDS.hertz, city: "Casablanca", contactName: "Mohammed Alaoui" },
  { email: "sahara@demo.sam.ma", company: "SaharaCar", establishmentId: ESTABLISHMENT_IDS.saharacar, city: "Marrakech", contactName: "Omar Benmoussa" },
  { email: "casa@demo.sam.ma", company: "CasaRent", establishmentId: ESTABLISHMENT_IDS.casarent, city: "Casablanca", contactName: "Fatima Zahra Idrissi" },
  { email: "atlantic@demo.sam.ma", company: "Atlantic Cars", establishmentId: ESTABLISHMENT_IDS.atlantic, city: "Tanger", contactName: "Karim Tazi" },
  { email: "prestige@demo.sam.ma", company: "Prestige Auto Maroc", establishmentId: ESTABLISHMENT_IDS.prestige, city: "Casablanca", contactName: "Amine El Fassi" },
  { email: "fes@demo.sam.ma", company: "Fès Auto Location", establishmentId: ESTABLISHMENT_IDS.fesauto, city: "Fès", contactName: "Hassan Berrada" },
];

const CONSUMER_ACCOUNTS = [
  { email: "user1@demo.sam.ma", name: "Youssef El Amrani", city: "Casablanca", country: "MA" },
  { email: "user2@demo.sam.ma", name: "Sarah Benali", city: "Marrakech", country: "MA" },
  { email: "user3@demo.sam.ma", name: "Pierre Martin", city: "Paris", country: "FR" },
];

const DEMO_PASSWORD = "Demo@2026";

// =============================================================================
// HELPERS
// =============================================================================

async function getOrCreateAuthUser(email: string, password: string): Promise<string> {
  // Try to create first
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error && data.user) {
    console.log(`  ✅ Created auth user: ${email} (${data.user.id})`);
    return data.user.id;
  }

  // If user already exists, find them
  if (error?.message?.includes("already been registered") || error?.message?.includes("already exists")) {
    const { data: listData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existing = listData?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      console.log(`  ℹ️  Auth user already exists: ${email} (${existing.id})`);
      return existing.id;
    }
  }

  console.error(`  ❌ Failed to create/find user ${email}:`, error?.message);
  throw new Error(`Cannot create or find user ${email}`);
}

function generateBookingRef(index: number): string {
  return `LOC-DEMO${String(index).padStart(4, "0")}`;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log("🚗 Rental Demo Seed — Starting...\n");

  // =========================================================================
  // STEP 1: Create pro accounts
  // =========================================================================
  console.log("📋 Step 1: Creating 6 pro accounts...");
  const proUserIds: Record<string, string> = {};

  for (const pro of PRO_ACCOUNTS) {
    const userId = await getOrCreateAuthUser(pro.email, DEMO_PASSWORD);
    proUserIds[pro.establishmentId] = userId;

    // Create pro_profile
    const { error: profileErr } = await supabase
      .from("pro_profiles")
      .upsert(
        {
          user_id: userId,
          client_type: "A",
          company_name: pro.company,
          contact_name: pro.contactName,
          email: pro.email,
          city: pro.city,
        },
        { onConflict: "user_id" },
      );
    if (profileErr) console.warn(`  ⚠️  pro_profile for ${pro.email}:`, profileErr.message);

    // Create membership
    const { error: memberErr } = await supabase
      .from("pro_establishment_memberships")
      .upsert(
        {
          establishment_id: pro.establishmentId,
          user_id: userId,
          role: "owner",
        },
        { onConflict: "establishment_id,user_id" },
      );
    if (memberErr) console.warn(`  ⚠️  membership for ${pro.email}:`, memberErr.message);

    // Update establishment.created_by
    await supabase
      .from("establishments")
      .update({ created_by: userId })
      .eq("id", pro.establishmentId);
  }

  console.log(`  → ${Object.keys(proUserIds).length} pro accounts ready.\n`);

  // =========================================================================
  // STEP 2: Create consumer accounts
  // =========================================================================
  console.log("👤 Step 2: Creating 3 consumer accounts...");
  const consumerUserIds: string[] = [];

  for (const consumer of CONSUMER_ACCOUNTS) {
    const userId = await getOrCreateAuthUser(consumer.email, DEMO_PASSWORD);
    consumerUserIds.push(userId);

    // Ensure consumer_users record exists
    const { error: consumerErr } = await supabase
      .from("consumer_users")
      .upsert(
        {
          id: userId,
          email: consumer.email,
          full_name: consumer.name,
          city: consumer.city,
          country: consumer.country,
        },
        { onConflict: "id" },
      );
    if (consumerErr) console.warn(`  ⚠️  consumer_users for ${consumer.email}:`, consumerErr.message);

    // Ensure consumer_user_stats record exists
    await supabase
      .from("consumer_user_stats")
      .upsert({ user_id: userId }, { onConflict: "user_id" });
  }

  console.log(`  → ${consumerUserIds.length} consumer accounts ready.\n`);

  // =========================================================================
  // STEP 3: Fetch insurance plan IDs
  // =========================================================================
  console.log("🛡️  Step 3: Fetching insurance plans...");
  const { data: plans } = await supabase
    .from("rental_insurance_plans")
    .select("id, name")
    .eq("is_active", true)
    .order("sort_order");

  const planIds: Record<string, string> = {};
  if (plans) {
    for (const p of plans) {
      planIds[p.name] = p.id;
    }
  }
  console.log(`  → Found ${Object.keys(planIds).length} plans: ${Object.keys(planIds).join(", ")}\n`);

  // =========================================================================
  // STEP 4: Create rental reservations
  // =========================================================================
  console.log("📅 Step 4: Creating ~25 rental reservations...");

  const [user1, user2, user3] = consumerUserIds;

  // Reservation definitions
  const reservations = [
    // --- 10 COMPLETED (past dates) ---
    { ref: 1, userId: user1, estId: ESTABLISHMENT_IDS.hertz, vehicleId: VEHICLE_IDS.hertz_clio, city: "Casablanca", pickupDate: "2026-01-05", dropoffDate: "2026-01-08", basePrice: 750, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Essentielle" },
    { ref: 2, userId: user2, estId: ESTABLISHMENT_IDS.saharacar, vehicleId: VEHICLE_IDS.sahara_hilux, city: "Marrakech", pickupDate: "2026-01-10", dropoffDate: "2026-01-14", basePrice: 3200, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Confort" },
    { ref: 3, userId: user3, estId: ESTABLISHMENT_IDS.prestige, vehicleId: VEHICLE_IDS.prestige_classe_s, city: "Casablanca", pickupDate: "2026-01-15", dropoffDate: "2026-01-18", basePrice: 7500, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Sérénité" },
    { ref: 4, userId: user1, estId: ESTABLISHMENT_IDS.casarent, vehicleId: VEHICLE_IDS.casa_sandero, city: "Casablanca", pickupDate: "2026-01-20", dropoffDate: "2026-01-27", basePrice: 1260, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Essentielle" },
    { ref: 5, userId: user2, estId: ESTABLISHMENT_IDS.atlantic, vehicleId: VEHICLE_IDS.atlantic_sportage, city: "Tanger", pickupDate: "2026-01-22", dropoffDate: "2026-01-25", basePrice: 1440, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Confort" },
    { ref: 6, userId: user3, estId: ESTABLISHMENT_IDS.fesauto, vehicleId: VEHICLE_IDS.fes_sandero, city: "Fès", pickupDate: "2026-02-01", dropoffDate: "2026-02-05", basePrice: 760, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Essentielle" },
    { ref: 7, userId: user1, estId: ESTABLISHMENT_IDS.hertz, vehicleId: VEHICLE_IDS.hertz_golf, city: "Casablanca", pickupDate: "2026-02-03", dropoffDate: "2026-02-06", basePrice: 1050, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Confort" },
    { ref: 8, userId: user2, estId: ESTABLISHMENT_IDS.saharacar, vehicleId: VEHICLE_IDS.sahara_prado, city: "Ouarzazate", pickupDate: "2026-02-05", dropoffDate: "2026-02-10", basePrice: 6500, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Sérénité" },
    { ref: 9, userId: user3, estId: ESTABLISHMENT_IDS.casarent, vehicleId: VEHICLE_IDS.casa_308, city: "Casablanca", pickupDate: "2026-02-08", dropoffDate: "2026-02-11", basePrice: 960, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Confort" },
    { ref: 10, userId: user1, estId: ESTABLISHMENT_IDS.prestige, vehicleId: VEHICLE_IDS.prestige_range_rover, city: "Marrakech", pickupDate: "2026-02-10", dropoffDate: "2026-02-14", basePrice: 12000, status: "completed", kycStatus: "validated", depositStatus: "released", insurance: "Sérénité" },

    // --- 5 CONFIRMED (future dates) ---
    { ref: 11, userId: user1, estId: ESTABLISHMENT_IDS.hertz, vehicleId: VEHICLE_IDS.hertz_duster, city: "Casablanca", pickupDate: "2026-03-05", dropoffDate: "2026-03-08", basePrice: 1050, status: "confirmed", kycStatus: "validated", depositStatus: "held", insurance: "Confort" },
    { ref: 12, userId: user2, estId: ESTABLISHMENT_IDS.saharacar, vehicleId: VEHICLE_IDS.sahara_duster, city: "Marrakech", pickupDate: "2026-03-10", dropoffDate: "2026-03-15", basePrice: 2000, status: "confirmed", kycStatus: "validated", depositStatus: "held", insurance: "Essentielle" },
    { ref: 13, userId: user3, estId: ESTABLISHMENT_IDS.atlantic, vehicleId: VEHICLE_IDS.atlantic_i10, city: "Tanger", pickupDate: "2026-03-12", dropoffDate: "2026-03-16", basePrice: 800, status: "confirmed", kycStatus: "validated", depositStatus: "held", insurance: "Essentielle" },
    { ref: 14, userId: user1, estId: ESTABLISHMENT_IDS.prestige, vehicleId: VEHICLE_IDS.prestige_911, city: "Casablanca", pickupDate: "2026-03-20", dropoffDate: "2026-03-22", basePrice: 8000, status: "confirmed", kycStatus: "validated", depositStatus: "held", insurance: "Sérénité" },
    { ref: 15, userId: user2, estId: ESTABLISHMENT_IDS.fesauto, vehicleId: VEHICLE_IDS.fes_duster, city: "Fès", pickupDate: "2026-03-15", dropoffDate: "2026-03-20", basePrice: 1600, status: "confirmed", kycStatus: "validated", depositStatus: "held", insurance: "Confort" },

    // --- 5 IN_PROGRESS (current period) ---
    { ref: 16, userId: user1, estId: ESTABLISHMENT_IDS.casarent, vehicleId: VEHICLE_IDS.casa_zoe, city: "Casablanca", pickupDate: "2026-02-16", dropoffDate: "2026-02-20", basePrice: 1200, status: "in_progress", kycStatus: "validated", depositStatus: "held", insurance: "Confort" },
    { ref: 17, userId: user2, estId: ESTABLISHMENT_IDS.hertz, vehicleId: VEHICLE_IDS.hertz_mercedes_e, city: "Casablanca", pickupDate: "2026-02-17", dropoffDate: "2026-02-22", basePrice: 5500, status: "in_progress", kycStatus: "validated", depositStatus: "held", insurance: "Sérénité" },
    { ref: 18, userId: user3, estId: ESTABLISHMENT_IDS.saharacar, vehicleId: VEHICLE_IDS.sahara_duster, city: "Marrakech", pickupDate: "2026-02-15", dropoffDate: "2026-02-21", basePrice: 2400, status: "in_progress", kycStatus: "validated", depositStatus: "held", insurance: "Essentielle" },
    { ref: 19, userId: user1, estId: ESTABLISHMENT_IDS.atlantic, vehicleId: VEHICLE_IDS.atlantic_sportage, city: "Rabat", pickupDate: "2026-02-16", dropoffDate: "2026-02-19", basePrice: 1440, status: "in_progress", kycStatus: "validated", depositStatus: "held", insurance: "Confort" },
    { ref: 20, userId: user2, estId: ESTABLISHMENT_IDS.fesauto, vehicleId: VEHICLE_IDS.fes_sandero, city: "Fès", pickupDate: "2026-02-17", dropoffDate: "2026-02-23", basePrice: 1140, status: "in_progress", kycStatus: "validated", depositStatus: "held", insurance: "Essentielle" },

    // --- 3 CANCELLED_USER ---
    { ref: 21, userId: user3, estId: ESTABLISHMENT_IDS.hertz, vehicleId: VEHICLE_IDS.hertz_clio, city: "Casablanca", pickupDate: "2026-02-25", dropoffDate: "2026-02-28", basePrice: 750, status: "cancelled_user", kycStatus: "validated", depositStatus: "released", insurance: "Essentielle" },
    { ref: 22, userId: user1, estId: ESTABLISHMENT_IDS.casarent, vehicleId: VEHICLE_IDS.casa_sandero, city: "Casablanca", pickupDate: "2026-03-01", dropoffDate: "2026-03-04", basePrice: 540, status: "cancelled_user", kycStatus: "validated", depositStatus: "released", insurance: "Essentielle" },
    { ref: 23, userId: user2, estId: ESTABLISHMENT_IDS.prestige, vehicleId: VEHICLE_IDS.prestige_classe_s, city: "Marrakech", pickupDate: "2026-03-05", dropoffDate: "2026-03-08", basePrice: 7500, status: "cancelled_user", kycStatus: "validated", depositStatus: "released", insurance: "Sérénité" },

    // --- 2 PENDING_KYC ---
    { ref: 24, userId: user3, estId: ESTABLISHMENT_IDS.saharacar, vehicleId: VEHICLE_IDS.sahara_hilux, city: "Errachidia", pickupDate: "2026-03-25", dropoffDate: "2026-03-30", basePrice: 4000, status: "pending_kyc", kycStatus: "pending", depositStatus: "pending", insurance: "Confort" },
    { ref: 25, userId: user1, estId: ESTABLISHMENT_IDS.fesauto, vehicleId: VEHICLE_IDS.fes_duster, city: "Ifrane", pickupDate: "2026-03-28", dropoffDate: "2026-04-02", basePrice: 1600, status: "pending_kyc", kycStatus: "pending", depositStatus: "pending", insurance: "Essentielle" },
  ];

  let created = 0;
  let skipped = 0;

  for (const r of reservations) {
    const bookingRef = generateBookingRef(r.ref);
    const insurancePlanId = planIds[r.insurance] || null;

    // Calculate insurance total based on days
    const pickupD = new Date(r.pickupDate);
    const dropoffD = new Date(r.dropoffDate);
    const days = Math.max(1, Math.round((dropoffD.getTime() - pickupD.getTime()) / (1000 * 60 * 60 * 24)));

    const insurancePricePerDay = r.insurance === "Sérénité" ? 150 : r.insurance === "Confort" ? 80 : 0;
    const insuranceTotal = insurancePricePerDay * days;
    const totalPrice = r.basePrice + insuranceTotal;
    const commissionPercent = 15;
    const commissionAmount = Math.round(totalPrice * commissionPercent) / 100;
    const depositAmount = r.insurance === "Sérénité" ? 0 : r.insurance === "Confort" ? 2000 : 5000;

    const { error } = await supabase.from("rental_reservations").upsert(
      {
        booking_reference: bookingRef,
        user_id: r.userId,
        establishment_id: r.estId,
        vehicle_id: r.vehicleId,
        pickup_city: r.city,
        pickup_date: r.pickupDate,
        pickup_time: "09:00",
        dropoff_city: r.city,
        dropoff_date: r.dropoffDate,
        dropoff_time: "18:00",
        selected_options: [],
        insurance_plan_id: insurancePlanId,
        deposit_amount: depositAmount,
        deposit_status: r.depositStatus,
        base_price: r.basePrice,
        options_total: 0,
        insurance_total: insuranceTotal,
        total_price: totalPrice,
        commission_percent: commissionPercent,
        commission_amount: commissionAmount,
        currency: "MAD",
        kyc_status: r.kycStatus,
        status: r.status,
        cancelled_at: r.status.startsWith("cancelled") ? new Date().toISOString() : null,
        cancellation_reason: r.status === "cancelled_user" ? "Changement de plans" : null,
      },
      { onConflict: "booking_reference" },
    );

    if (error) {
      console.warn(`  ⚠️  Reservation ${bookingRef}: ${error.message}`);
      skipped++;
    } else {
      created++;
    }
  }

  console.log(`  → ${created} reservations created, ${skipped} skipped.\n`);

  // =========================================================================
  // DONE
  // =========================================================================
  console.log("✅ Rental demo seed complete!");
  console.log("\n📋 Summary:");
  console.log("  • 6 pro accounts (password: Demo@2026)");
  console.log("  • 3 consumer accounts (password: Demo@2026)");
  console.log(`  • ${created} rental reservations`);
  console.log("\n🔗 Pro logins:");
  for (const pro of PRO_ACCOUNTS) {
    console.log(`  ${pro.company}: ${pro.email}`);
  }
  console.log("\n👤 Consumer logins:");
  for (const consumer of CONSUMER_ACCOUNTS) {
    console.log(`  ${consumer.name}: ${consumer.email}`);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
