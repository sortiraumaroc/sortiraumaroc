/**
 * Wheel Fraud Detection — Multi-account & abuse detection
 *
 * Detects suspicious patterns:
 *   - Same device_id winning on multiple accounts
 *   - Same IP address winning on multiple accounts
 *   - Threshold: 3+ winning accounts on same device/IP in 24h → admin alert
 */

import { getAdminSupabase } from "./supabaseAdmin";
import { emitAdminNotification } from "./adminNotifications";

// =============================================================================
// Types
// =============================================================================

export interface FraudCheckResult {
  suspicious: boolean;
  details?: {
    type: "device" | "ip" | "both";
    device_id?: string;
    ip_address?: string;
    accounts_count: number;
    winning_accounts: string[];
  };
}

interface SuspicionRow {
  user_id: string;
  device_id: string | null;
  ip_address: string | null;
  result: string;
}

// =============================================================================
// Main check
// =============================================================================

/**
 * Check if a user's spin context shows multi-account suspicion.
 * Called after each winning spin (real-time check).
 */
export async function checkMultiAccountSuspicion(
  userId: string,
  deviceId: string | null | undefined,
  ipAddress: string | null | undefined,
): Promise<FraudCheckResult> {
  if (!deviceId && !ipAddress) return { suspicious: false };

  const supabase = getAdminSupabase();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let deviceSuspicious = false;
  let ipSuspicious = false;
  let deviceAccounts: string[] = [];
  let ipAccounts: string[] = [];

  // Check by device_id
  if (deviceId) {
    const { data } = await supabase
      .from("wheel_spins")
      .select("user_id")
      .eq("device_id", deviceId)
      .eq("result", "won")
      .gte("created_at", oneDayAgo);

    if (data) {
      const uniqueUsers = [...new Set((data as { user_id: string }[]).map((r) => r.user_id))];
      deviceAccounts = uniqueUsers;
      if (uniqueUsers.length >= 3) {
        deviceSuspicious = true;
      }
    }
  }

  // Check by IP address
  if (ipAddress) {
    const { data } = await supabase
      .from("wheel_spins")
      .select("user_id")
      .eq("ip_address", ipAddress)
      .eq("result", "won")
      .gte("created_at", oneDayAgo);

    if (data) {
      const uniqueUsers = [...new Set((data as { user_id: string }[]).map((r) => r.user_id))];
      ipAccounts = uniqueUsers;
      if (uniqueUsers.length >= 3) {
        ipSuspicious = true;
      }
    }
  }

  const suspicious = deviceSuspicious || ipSuspicious;

  if (suspicious) {
    const allAccounts = [...new Set([...deviceAccounts, ...ipAccounts])];
    const type: "device" | "ip" | "both" = deviceSuspicious && ipSuspicious ? "both"
      : deviceSuspicious ? "device" : "ip";

    return {
      suspicious: true,
      details: {
        type,
        device_id: deviceId ?? undefined,
        ip_address: ipAddress ?? undefined,
        accounts_count: allAccounts.length,
        winning_accounts: allAccounts,
      },
    };
  }

  return { suspicious: false };
}

// =============================================================================
// Admin alert
// =============================================================================

/**
 * Send admin notification about fraud suspicion.
 */
export function alertAdminFraudSuspicion(details: FraudCheckResult["details"]): void {
  if (!details) return;

  const typeLabel = details.type === "both" ? "device + IP"
    : details.type === "device" ? "même device" : "même IP";

  void emitAdminNotification({
    type: "wheel_fraud_alert",
    title: "🚨 Roue — Suspicion multi-comptes",
    body: `${details.accounts_count} comptes gagnants détectés (${typeLabel}) en 24h. ${details.device_id ? `Device: ${details.device_id.substring(0, 20)}...` : ""} ${details.ip_address ? `IP: ${details.ip_address}` : ""}`,
    data: {
      type: details.type,
      device_id: details.device_id ?? null,
      ip_address: details.ip_address ?? null,
      accounts: details.winning_accounts,
    },
  });
}

// =============================================================================
// Batch detection (cron)
// =============================================================================

/**
 * Scan all recent spins for multi-account patterns.
 * Called by cron daily.
 */
export async function runFraudDetectionScan(): Promise<{ alerts: number }> {
  const supabase = getAdminSupabase();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let alerts = 0;

  // Get all winning spins from last 24h
  const { data: winningSpins } = await supabase
    .from("wheel_spins")
    .select("user_id, device_id, ip_address, result")
    .eq("result", "won")
    .gte("created_at", oneDayAgo);

  if (!winningSpins || winningSpins.length === 0) return { alerts: 0 };

  const rows = winningSpins as SuspicionRow[];

  // Group by device_id
  const deviceGroups = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.device_id) {
      if (!deviceGroups.has(row.device_id)) deviceGroups.set(row.device_id, new Set());
      deviceGroups.get(row.device_id)!.add(row.user_id);
    }
  }

  for (const [deviceId, users] of deviceGroups) {
    if (users.size >= 3) {
      alertAdminFraudSuspicion({
        type: "device",
        device_id: deviceId,
        accounts_count: users.size,
        winning_accounts: [...users],
      });
      alerts++;
    }
  }

  // Group by ip_address
  const ipGroups = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.ip_address) {
      if (!ipGroups.has(row.ip_address)) ipGroups.set(row.ip_address, new Set());
      ipGroups.get(row.ip_address)!.add(row.user_id);
    }
  }

  for (const [ip, users] of ipGroups) {
    if (users.size >= 3) {
      alertAdminFraudSuspicion({
        type: "ip",
        ip_address: ip,
        accounts_count: users.size,
        winning_accounts: [...users],
      });
      alerts++;
    }
  }

  if (alerts > 0) {
    console.log(`[WheelFraud] Detected ${alerts} suspicious patterns`);
  }

  return { alerts };
}
