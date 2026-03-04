/**
 * Script to send test emails for all templates
 * Usage: npx tsx server/scripts/sendTestEmails.ts
 */

import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";
import { sendTemplateEmail } from "../emailService";

const TEST_EMAIL = "sortiraumaroc.agence@gmail.com";

// Sample variables for different template types
const sampleVariables: Record<string, Record<string, string>> = {
  // Consumer templates
  user_email_verification: {
    user_name: "Test User",
    code: "123456",
  },
  user_contact_received: {
    user_name: "Test User",
    message: "Ceci est un message de test pour le formulaire de contact.",
  },
  user_waitlist_joined: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
    guests: "4",
  },
  user_waitlist_expired: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_booking_reminder_h3: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
    booking_ref: "SAM-TEST-001",
  },
  user_referral_invitation: {
    referrer_name: "Ahmed",
    reward_amount: "50",
  },
  user_referral_reward_earned: {
    user_name: "Test User",
    referred_name: "Karim",
    reward_amount: "50",
    wallet_balance: "100",
  },
  user_referral_welcome_bonus: {
    user_name: "Test User",
    referrer_name: "Ahmed",
    reward_amount: "50",
  },
  user_direct_booking_confirmed: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
    booking_ref: "SAM-TEST-001",
  },
  user_welcome: {
    user_name: "Test User",
  },
  user_booking_confirmed: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
    amount: "500 MAD",
  },
  user_booking_updated: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    establishment: "Restaurant Le Test",
    date: "16 Février 2026",
  },
  user_booking_cancelled: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_waitlist_offer: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_booking_reminder_d1: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_review_request: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
  },
  user_social_signup: {
    user_name: "Test User",
  },
  user_password_reset: {
    user_name: "Test User",
  },
  user_presence_confirmed: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
  },
  user_no_show_notification: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_confirm_absence: {
    user_name: "Test User",
    establishment: "Restaurant Le Test",
    date: "15 Février 2026",
  },
  user_birthday: {
    user_name: "Test User",
  },
  user_reactivation: {
    user_name: "Test User",
  },

  // PRO templates
  pro_new_lead: {
    establishment: "Restaurant Le Test",
    lead_name: "Client Potentiel",
    lead_email: "client@test.com",
    lead_phone: "+212 6 00 00 00 00",
    lead_message: "Je souhaite organiser un événement pour 20 personnes.",
  },
  pro_bulk_import_welcome: {
    establishment: "Restaurant Le Test",
  },
  pro_visibility_order_created: {
    order_ref: "VIS-2026-001",
    establishment: "Restaurant Le Test",
    pack_name: "Pack Premium",
    amount: "5000",
  },
  pro_visibility_order_paid: {
    order_ref: "VIS-2026-001",
    establishment: "Restaurant Le Test",
    pack_name: "Pack Premium",
    amount: "5000",
  },
  pro_direct_booking_received: {
    booking_ref: "SAM-TEST-001",
    username: "letest",
    user_name: "Client Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
  },
  pro_menu_digital_activated: {
    establishment: "Restaurant Le Test",
    expires_at: "15 Février 2027",
  },
  pro_menu_digital_expiring: {
    establishment: "Restaurant Le Test",
    expires_at: "15 Mars 2026",
    days: "30",
  },
  pro_profile_update_approved: {
    establishment: "Restaurant Le Test",
  },
  pro_profile_update_rejected: {
    establishment: "Restaurant Le Test",
    rejection_reason: "Les photos fournies ne respectent pas nos standards de qualité.",
  },
  pro_weekly_stats: {
    establishment: "Restaurant Le Test",
    views_count: "1250",
    bookings_count: "45",
    guests_count: "180",
    reviews_count: "12",
    avg_rating: "4.5",
  },
  pro_welcome: {
    user_name: "Gérant Test",
    establishment: "Restaurant Le Test",
  },
  pro_new_booking: {
    booking_ref: "SAM-TEST-001",
    user_name: "Client Test",
    date: "15 Février 2026",
    amount: "500 MAD",
  },
  pro_customer_change_request: {
    booking_ref: "SAM-TEST-001",
    date: "15 Février 2026",
  },
  pro_customer_cancelled: {
    booking_ref: "SAM-TEST-001",
    date: "15 Février 2026",
  },
  pro_payment_received: {
    booking_ref: "SAM-TEST-001",
    amount: "500 MAD",
  },
  pro_invoice_available: {
    amount: "5000 MAD",
  },
  pro_visibility_activated: {
    establishment: "Restaurant Le Test",
  },
  pro_documents_reminder: {
    establishment: "Restaurant Le Test",
  },
  pro_monthly_summary: {
    establishment: "Restaurant Le Test",
    amount: "25000 MAD",
  },
  pro_confirm_presence_request: {
    user_name: "Client Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
  },
  pro_confirm_presence_reminder: {
    user_name: "Client Test",
    date: "15 Février 2026",
    time: "20:00",
  },
  pro_confirm_presence_final: {
    user_name: "Client Test",
    date: "15 Février 2026",
  },
  pro_presence_auto_confirmed: {
    user_name: "Client Test",
    date: "15 Février 2026",
  },
  pro_qrcode_scanned: {
    user_name: "Client Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
  },
  pro_no_show_alert: {
    user_name: "Client Test",
    date: "15 Février 2026",
    time: "20:00",
    guests: "4",
    booking_ref: "SAM-TEST-001",
  },
  pro_review_received: {
    user_name: "Client Test",
    rating: "5",
    comment: "Excellent restaurant, service impeccable !",
  },
  pro_review_response_reminder: {
    count: "3",
  },
  pro_payout_completed: {
    amount: "15000",
    payout_ref: "PAY-2026-001",
    date: "10 Février 2026",
  },
  pro_daily_briefing: {
    count: "8",
    reservations_summary: "- 12:30 : Ahmed (4 pers)\n- 13:00 : Karim (2 pers)\n- 19:30 : Sara (6 pers)",
    total_guests: "12",
  },

  // System templates
  pro_password_reset: {},
  pro_password_created: {},
  system_newsletter_subscribed: {},
  system_email_change: {
    user_name: "Test User",
  },
  system_security_alert: {
    user_name: "Test User",
  },
  system_account_closure: {
    user_name: "Test User",
  },
  system_data_deletion: {
    user_name: "Test User",
  },
  system_maintenance: {
    date: "20 Février 2026 de 02:00 à 04:00",
  },
  system_password_changed: {
    user_name: "Test User",
    date: "15 Février 2026 à 14:30",
    ip_address: "192.168.1.1",
  },

  // Marketing templates
  marketing_promo_code: {
    user_name: "Test User",
    promo_code: "SAMTEST50",
    discount_value: "50 MAD",
    expires_at: "28 Février 2026",
  },
  marketing_new_establishment: {
    user_name: "Test User",
    establishment: "Restaurant Le Nouveau",
    establishment_description: "Un nouveau restaurant gastronomique au coeur de Casablanca.",
    city: "Casablanca",
    category: "Restaurant",
  },

  // Finance templates
  finance_deposit_received: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    establishment: "Restaurant Le Test",
    deposit_amount: "200",
    remaining_amount: "300",
    date: "15 Février 2026",
  },
  finance_deposit_refunded: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    refund_amount: "200",
  },
  finance_wallet_credited: {
    user_name: "Test User",
    amount: "100",
    reason: "Bonus de parrainage",
    balance: "150",
  },
  finance_payment_confirmation: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    amount: "500 MAD",
  },
  finance_receipt: {
    user_name: "Test User",
    booking_ref: "SAM-TEST-001",
    amount: "500 MAD",
  },
  finance_invoice_to_pro: {
    amount: "5000 MAD",
  },
  finance_transfer_notice: {
    amount: "15000 MAD",
    date: "20 Février 2026",
  },
  finance_payment_rejected: {
    user_name: "Test User",
    amount: "500 MAD",
  },
  finance_invoice_request: {
    establishment: "Restaurant Le Test",
    date: "Janvier 2026",
  },
  finance_refund_processed: {
    user_name: "Test User",
    amount: "200",
    refund_ref: "REF-2026-001",
    booking_ref: "SAM-TEST-001",
  },
};

// Determine the fromKey based on template audience
function getFromKey(audience: string): "hello" | "support" | "pro" | "finance" | "noreply" {
  switch (audience) {
    case "pro":
      return "pro";
    case "finance":
      return "finance";
    case "system":
      return "noreply";
    case "marketing":
      return "hello";
    default:
      return "noreply";
  }
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get all enabled templates
  const { data: templates, error } = await supabase
    .from("email_templates")
    .select("key, audience, name, enabled")
    .eq("enabled", true)
    .order("audience")
    .order("key");

  if (error) {
    console.error("Error fetching templates:", error);
    process.exit(1);
  }

  console.log(`Found ${templates.length} enabled templates\n`);
  console.log(`Sending test emails to: ${TEST_EMAIL}\n`);
  console.log("=".repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const template of templates) {
    const variables = sampleVariables[template.key] || {};
    const fromKey = getFromKey(template.audience);

    console.log(`\n[${template.audience.toUpperCase()}] ${template.key}`);
    console.log(`  Name: ${template.name}`);
    console.log(`  From: ${fromKey}@sam.ma`);

    try {
      const result = await sendTemplateEmail({
        templateKey: template.key,
        lang: "fr",
        fromKey,
        to: [TEST_EMAIL],
        variables,
        ctaUrl: "https://sam.ma/test",
      });

      if (result.ok) {
        console.log(`  ✅ Sent! (ID: ${result.emailId})`);
        successCount++;
      } else {
        console.log(`  ❌ Failed: ${(result as any).error}`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err instanceof Error ? err.message : String(err)}`);
      failCount++;
    }

    // Small delay between emails to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log(`\nDone! Sent: ${successCount}, Failed: ${failCount}`);
}

main().catch(console.error);
