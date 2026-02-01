import { jsPDF } from "jspdf";

import { formatLocalYmd } from "@/lib/pro/reservationsExport";

export type QrScanLog = {
  id: string;
  scanned_at: string;
  result: string;
  reservation_id: string | null;
  booking_reference: string | null;
  holder_name: string | null;
  payload: string;
};

type ExportPeriod = { startYmd?: string; endYmd?: string };

type QrScanExportRow = {
  scannedAt: string;
  result: string;
  bookingReference: string;
  holderName: string;
  reason: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeJsonParse(value: string): unknown {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!(raw.startsWith("{") && raw.endsWith("}"))) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function extractReason(payload: string): string {
  const parsed = safeJsonParse(payload);
  if (isRecord(parsed)) return asTrimmedString(parsed.reason);
  return "";
}

function extractCode(payload: string): string {
  const parsed = safeJsonParse(payload);
  if (isRecord(parsed)) return asTrimmedString(parsed.code);
  return "";
}

function formatResultLabel(result: string): string {
  return result === "accepted" ? "Accepté" : result === "rejected" ? "Refusé" : result;
}

function formatScannedAt(iso: string, locale: string = "fr-MA"): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso ?? "");
  return d.toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

function scanLogToExportRow(l: QrScanLog, locale: string = "fr-MA"): QrScanExportRow {
  const codeFromPayload = extractCode(l.payload);
  const bookingReference =
    asTrimmedString(l.booking_reference) || codeFromPayload || (l.reservation_id ? l.reservation_id.slice(0, 8) : "");

  return {
    scannedAt: formatScannedAt(l.scanned_at, locale),
    result: formatResultLabel(l.result),
    bookingReference,
    holderName: asTrimmedString(l.holder_name) || "—",
    reason: extractReason(l.payload) || "—",
  };
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

function getPeriodLabel(period: ExportPeriod): string {
  const start = (period.startYmd ?? "").trim();
  const end = (period.endYmd ?? "").trim();

  if (start && end) return start === end ? start : `${start} → ${end}`;
  if (start) return `Depuis ${start}`;
  if (end) return `Jusqu’au ${end}`;
  return "Tous";
}

function makeSafeName(input: string): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function periodFileSuffix(period: ExportPeriod): string {
  const start = (period.startYmd ?? "").trim();
  const end = (period.endYmd ?? "").trim();
  if (start && end) return start === end ? start : `${start}_${end}`;
  if (start) return `from_${start}`;
  if (end) return `to_${end}`;
  return `all_${formatLocalYmd(new Date())}`;
}

export function downloadQrScanLogsCsv(args: {
  logs: QrScanLog[];
  period?: ExportPeriod;
  establishmentName?: string | null;
}): void {
  const rows = args.logs
    .slice()
    .sort((a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime())
    .map((l) => scanLogToExportRow(l));

  const sep = ";";
  const header = ["Date", "Résultat", "Référence", "Porteur", "Détail"].map(csvEscape).join(sep);

  const body = rows
    .map((r) => [r.scannedAt, r.result, r.bookingReference, r.holderName, r.reason].map(csvEscape).join(sep))
    .join("\n");

  const title = args.establishmentName ? `Historique des scans — ${args.establishmentName}` : "Historique des scans";
  const subtitle = `Période: ${getPeriodLabel(args.period ?? {})} — Total: ${rows.length}`;

  const content = `sep=${sep}\n${csvEscape(title)}\n${csvEscape(subtitle)}\n${header}\n${body}\n`;

  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const safeName = makeSafeName(args.establishmentName ?? "qr_scans");
  const suffix = periodFileSuffix(args.period ?? {});

  downloadBlob({ blob, filename: `${safeName || "qr_scans"}_${suffix}.csv` });
}

export function downloadQrScanLogsPdf(args: {
  logs: QrScanLog[];
  period?: ExportPeriod;
  establishmentName?: string | null;
}): void {
  const rows = args.logs
    .slice()
    .sort((a, b) => new Date(a.scanned_at).getTime() - new Date(b.scanned_at).getTime())
    .map((l) => scanLogToExportRow(l));

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const lineHeight = 12;

  const title = args.establishmentName ? `Scans QR — ${args.establishmentName}` : "Scans QR";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Période: ${getPeriodLabel(args.period ?? {})}`, margin, margin + 18);
  doc.text(`Total: ${rows.length}`, margin, margin + 34);

  const tableTop = margin + 56;

  const colDate = 90;
  const colResult = 60;
  const colRef = 120;
  const colHolder = 120;
  const colReason = pageWidth - margin * 2 - colDate - colResult - colRef - colHolder;

  const xDate = margin;
  const xResult = xDate + colDate;
  const xRef = xResult + colResult;
  const xHolder = xRef + colRef;
  const xReason = xHolder + colHolder;

  const renderHeader = (y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Date", xDate, y);
    doc.text("Résultat", xResult, y);
    doc.text("Référence", xRef, y);
    doc.text("Porteur", xHolder, y);
    doc.text("Détail", xReason, y);

    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  let y = tableTop;
  renderHeader(y);
  y += 18;

  for (const row of rows) {
    const reasonLines = doc.splitTextToSize(row.reason || "", colReason) as string[];
    const holderLines = doc.splitTextToSize(row.holderName || "", colHolder) as string[];
    const maxLines = Math.max(1, reasonLines.length, holderLines.length);
    const rowHeight = maxLines * lineHeight + 6;

    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      renderHeader(y);
      y += 18;
    }

    doc.text(row.scannedAt || "", xDate, y);
    doc.text(row.result || "", xResult, y);
    doc.text(row.bookingReference || "", xRef, y);

    if (holderLines.length) doc.text(holderLines, xHolder, y);
    if (reasonLines.length) doc.text(reasonLines, xReason, y);

    y += rowHeight;
    doc.setDrawColor(235);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  const safeName = makeSafeName(args.establishmentName ?? "qr_scans");
  const suffix = periodFileSuffix(args.period ?? {});

  doc.save(`${safeName || "qr_scans"}_${suffix}.pdf`);
}
