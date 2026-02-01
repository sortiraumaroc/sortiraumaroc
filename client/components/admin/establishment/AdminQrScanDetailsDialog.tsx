import { Copy } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { QrScanLogAdmin } from "@/lib/adminApi";

function formatLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if (!t) return value;
  if (!(t.startsWith("{") || t.startsWith("["))) return value;
  try {
    return JSON.parse(t);
  } catch {
    return value;
  }
}

function pickFirstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function resultBadge(value: string | null | undefined): JSX.Element {
  const v = (value ?? "").toLowerCase();
  const cls =
    v.includes("ok") || v === "success" || v === "valid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : v.includes("fail") || v.includes("error") || v === "invalid"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-slate-50 text-slate-700 border-slate-200";

  return <Badge className={cls}>{value || "—"}</Badge>;
}

async function copyToClipboard(text: string): Promise<void> {
  const value = String(text ?? "").trim();
  if (!value) return;

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const el = document.createElement("textarea");
  el.value = value;
  el.style.position = "fixed";
  el.style.left = "-9999px";
  el.style.top = "-9999px";
  document.body.appendChild(el);
  el.focus();
  el.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(el);
  if (!ok) throw new Error("copy failed");
}

function extractNameFromPayload(payload: unknown): { firstName: string; lastName: string; fullName: string } {
  const parsed = tryParseJson(payload);
  const obj = isRecord(parsed) ? parsed : null;

  const firstName = obj ? pickFirstString(obj, ["first_name", "firstname", "given_name"]) : null;
  const lastName = obj ? pickFirstString(obj, ["last_name", "lastname", "family_name"]) : null;
  const fullName = obj ? pickFirstString(obj, ["full_name", "name", "holder_name"]) : null;

  const computed = fullName || `${firstName ?? ""} ${lastName ?? ""}`.trim();

  return {
    firstName: firstName ?? "—",
    lastName: lastName ?? "—",
    fullName: computed || "—",
  };
}

function InfoRow(props: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-1 sm:gap-3 py-2 border-b border-slate-100 last:border-b-0">
      <div className="text-xs font-semibold text-slate-500">{props.label}</div>
      <div className={props.mono ? "font-mono text-sm text-slate-900 break-all" : "text-sm text-slate-900 break-words"}>
        {props.value}
      </div>
    </div>
  );
}

export function AdminQrScanDetailsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  log: QrScanLogAdmin | null;
}) {
  const { toast } = useToast();

  const log = props.log;
  const payloadParsed = log ? tryParseJson(log.payload) : null;
  const payloadName = log ? extractNameFromPayload(log.payload) : null;

  const holderName = (log?.holder_name ?? "").trim();
  const displayName = holderName || payloadName?.fullName || "—";

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle>Détail scan QR</DialogTitle>
            {log ? (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => {
                  void (async () => {
                    try {
                      await copyToClipboard(log.id);
                      toast({ title: "Copié", description: log.id });
                    } catch {
                      toast({ title: "Impossible", description: "Copie non autorisée sur ce navigateur." });
                    }
                  })();
                }}
              >
                <Copy className="h-4 w-4" />
                Copier l’ID
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {!log ? (
          <div className="text-sm text-slate-600">Aucun scan sélectionné.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">Porteur</div>
                  <div className="text-sm text-slate-900 font-semibold break-words">{displayName}</div>
                </div>
                <div className="flex items-center gap-2">{resultBadge(log.result)}</div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-semibold text-slate-900">Utilisation</div>
              <div className="px-4">
                <InfoRow label="Date/heure" value={formatLocal(log.scanned_at)} />
                <InfoRow label="Référence" value={log.booking_reference ?? "—"} mono />
                <InfoRow label="Résultat" value={resultBadge(log.result)} />
              </div>
            </div>

            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">Payload</summary>
              <pre className="px-4 pb-4 text-xs text-slate-700 overflow-auto">{safeJson(payloadParsed)}</pre>
            </details>

            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">Données brutes</summary>
              <pre className="px-4 pb-4 text-xs text-slate-700 overflow-auto">{safeJson(log)}</pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
