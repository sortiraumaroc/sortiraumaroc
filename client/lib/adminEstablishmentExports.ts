type CsvDownloadRow = Record<string, string>;

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

function formatLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function csvEscape(value: string): string {
  const v = String(value ?? "");
  const escaped = v.replace(/"/g, '""');
  return `"${escaped}"`;
}

function downloadBlob(args: { blob: Blob; filename: string }) {
  const url = URL.createObjectURL(args.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = args.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function makeSafeName(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function downloadCsv(args: {
  rows: CsvDownloadRow[];
  filenamePrefix: string;
  title: string;
  subtitle?: string;
  columns: Array<{ key: string; label: string }>;
}): void {
  const rows = args.rows.slice();
  const sep = ";";

  const header = args.columns.map((c) => csvEscape(c.label)).join(sep);
  const body = rows
    .map((r) => args.columns.map((c) => csvEscape(r[c.key] ?? "")).join(sep))
    .join("\n");

  const title = (args.title ?? "").trim() || "Export";
  const subtitle = (args.subtitle ?? "").trim();

  const content = `sep=${sep}\n${csvEscape(title)}\n${subtitle ? `${csvEscape(subtitle)}\n` : ""}${header}\n${body}\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });

  downloadBlob({
    blob,
    filename: `${makeSafeName(args.filenamePrefix) || "export"}_${formatLocalYmd(new Date())}.csv`,
  });
}

export type AdminQrScanExportRow = {
  scannedAt: string;
  result: string;
  bookingReference: string;
  holderName: string;
};

export function downloadAdminQrScansCsv(args: {
  rows: AdminQrScanExportRow[];
  establishmentName?: string | null;
  establishmentId?: string | null;
  title?: string;
}): void {
  const label = (args.establishmentName ?? "").trim() || (args.establishmentId ?? "").trim() || "Établissement";
  downloadCsv({
    rows: args.rows,
    filenamePrefix: `${label}_qr_scans`,
    title: (args.title ?? `QR scans — ${label}`).trim() || `QR scans — ${label}`,
    subtitle: `Total: ${args.rows.length}`,
    columns: [
      { key: "scannedAt", label: "Date" },
      { key: "result", label: "Résultat" },
      { key: "bookingReference", label: "Référence" },
      { key: "holderName", label: "Porteur" },
    ],
  });
}

export type AdminPackPurchaseExportRow = {
  createdAt: string;
  packId: string;
  amount: string;
  status: string;
};

export function downloadAdminPackPurchasesCsv(args: {
  rows: AdminPackPurchaseExportRow[];
  establishmentName?: string | null;
  establishmentId?: string | null;
  title?: string;
}): void {
  const label = (args.establishmentName ?? "").trim() || (args.establishmentId ?? "").trim() || "Établissement";
  downloadCsv({
    rows: args.rows,
    filenamePrefix: `${label}_pack_purchases`,
    title: (args.title ?? `Packs achetés — ${label}`).trim() || `Packs achetés — ${label}`,
    subtitle: `Total: ${args.rows.length}`,
    columns: [
      { key: "createdAt", label: "Date" },
      { key: "packId", label: "Pack" },
      { key: "amount", label: "Montant" },
      { key: "status", label: "Statut" },
    ],
  });
}

export type AdminPackRedemptionExportRow = {
  redeemedAt: string;
  purchaseId: string;
  reservationId: string;
  count: string;
};

export function downloadAdminPackRedemptionsCsv(args: {
  rows: AdminPackRedemptionExportRow[];
  establishmentName?: string | null;
  establishmentId?: string | null;
  title?: string;
}): void {
  const label = (args.establishmentName ?? "").trim() || (args.establishmentId ?? "").trim() || "Établissement";
  downloadCsv({
    rows: args.rows,
    filenamePrefix: `${label}_pack_redemptions`,
    title: (args.title ?? `Packs consommés — ${label}`).trim() || `Packs consommés — ${label}`,
    subtitle: `Total: ${args.rows.length}`,
    columns: [
      { key: "redeemedAt", label: "Date" },
      { key: "purchaseId", label: "Achat" },
      { key: "reservationId", label: "Réservation" },
      { key: "count", label: "Nb" },
    ],
  });
}
