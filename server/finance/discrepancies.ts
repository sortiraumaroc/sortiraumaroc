import { getAdminSupabase } from "../supabaseAdmin";
import { emitAdminNotification } from "../adminNotifications";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("financeDiscrepancies");

export async function openDiscrepancy(args: {
  entityType: string;
  entityId: string;
  kind: string;
  expectedAmountCents?: number | null;
  actualAmountCents?: number | null;
  currency?: string;
  severity?: "low" | "medium" | "high";
  metadata?: unknown;
}): Promise<void> {
  const supabase = getAdminSupabase();
  const currency = (args.currency ?? "MAD").trim() || "MAD";

  // Basic idempotency: avoid spamming identical open discrepancies
  const { data: existing, error: selErr } = await supabase
    .from("finance_reconciliation_discrepancies")
    .select("id")
    .eq("entity_type", args.entityType)
    .eq("entity_id", args.entityId)
    .eq("kind", args.kind)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (selErr) {
    log.error({ err: selErr }, "openDiscrepancy select failed");
    return;
  }

  if (existing) return;

  const { error } = await supabase.from("finance_reconciliation_discrepancies").insert({
    entity_type: args.entityType,
    entity_id: args.entityId,
    kind: args.kind,
    expected_amount_cents: args.expectedAmountCents ?? null,
    actual_amount_cents: args.actualAmountCents ?? null,
    currency,
    severity: args.severity ?? "high",
    status: "open",
    metadata: args.metadata ?? null,
  });

  if (error) {
    log.error({ err: error }, "openDiscrepancy insert failed");
    return;
  }

  const kindLower = (args.kind ?? "").toLowerCase();
  const title = kindLower.includes("payment") || kindLower.includes("payout") ? "Paiement échoué" : "Anomalie finance";
  const body = `${args.entityType} ${args.entityId} · ${args.kind}`;

  void emitAdminNotification({
    type: "finance_discrepancy",
    title,
    body,
    data: {
      entityType: args.entityType,
      entityId: args.entityId,
      kind: args.kind,
      severity: args.severity ?? "high",
    },
  });
}
