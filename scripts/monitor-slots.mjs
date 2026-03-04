#!/usr/bin/env node
/**
 * Monitor pro_slots deletions in real-time.
 * Uses Supabase Realtime to detect INSERT/DELETE/UPDATE events on pro_slots.
 * Also polls the count every 10 seconds as a backup.
 *
 * Usage: node scripts/monitor-slots.mjs
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { params: { eventsPerSecond: 10 } },
});

let lastCount = null;

async function getCount() {
  const { count, error } = await supabase
    .from("pro_slots")
    .select("id", { count: "exact", head: true })
    .eq("service_label", "Ftour");
  if (error) {
    console.error(`[POLL ERROR] ${error.message}`);
    return null;
  }
  return count;
}

function ts() {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

// === Realtime Subscription ===
console.log("═══════════════════════════════════════════════════════════");
console.log("  MONITORING PRO_SLOTS (Realtime + Polling)");
console.log("═══════════════════════════════════════════════════════════");
console.log(`  Started: ${ts()}`);
console.log(`  Supabase: ${SUPABASE_URL}`);
console.log("");

const channel = supabase
  .channel("pro_slots_monitor")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "pro_slots" },
    (payload) => {
      const event = payload.eventType;
      const record = payload.new || payload.old || {};
      const oldRecord = payload.old || {};

      const icon = event === "DELETE" ? "🔴 DELETE"
                 : event === "INSERT" ? "🟢 INSERT"
                 : "🟡 UPDATE";

      console.log(`\n${icon} [${ts()}]`);

      if (event === "DELETE") {
        console.log(`  Deleted row:`);
        console.log(`    id: ${oldRecord.id}`);
        console.log(`    establishment_id: ${oldRecord.establishment_id}`);
        console.log(`    service_label: ${oldRecord.service_label}`);
        console.log(`    starts_at: ${oldRecord.starts_at}`);
        console.log(`    moderation_status: ${oldRecord.moderation_status}`);
        console.log(`    created_at: ${oldRecord.created_at}`);
      } else if (event === "INSERT") {
        console.log(`  New row: id=${record.id?.substring(0, 8)}... est=${record.establishment_id?.substring(0, 8)}... label=${record.service_label}`);
      } else {
        console.log(`  Updated: id=${record.id?.substring(0, 8)}...`);
        // Show what changed
        for (const key of Object.keys(record)) {
          if (oldRecord[key] !== undefined && oldRecord[key] !== record[key]) {
            console.log(`    ${key}: ${oldRecord[key]} → ${record[key]}`);
          }
        }
      }
    }
  )
  .subscribe((status) => {
    console.log(`[REALTIME] Status: ${status}`);
  });

// === Polling backup ===
async function poll() {
  const count = await getCount();
  if (count === null) return;

  if (lastCount === null) {
    console.log(`[POLL ${ts()}] Initial Ftour count: ${count}`);
    lastCount = count;
  } else if (count !== lastCount) {
    const diff = count - lastCount;
    const icon = diff < 0 ? "⚠️ " : "  ";
    console.log(`\n${icon}[POLL ${ts()}] Ftour count: ${lastCount} → ${count} (${diff > 0 ? "+" : ""}${diff})`);
    lastCount = count;
  }
}

// Poll every 10 seconds
poll();
setInterval(poll, 10000);

// Keep alive
process.on("SIGINT", () => {
  console.log("\n\nStopping monitor...");
  supabase.removeChannel(channel);
  process.exit(0);
});

console.log("\nMonitoring... Press Ctrl+C to stop.\n");
