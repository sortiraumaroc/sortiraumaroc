import type { Reservation } from "@/lib/pro/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object";
}

function asTrimmedString(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

function getMetaString(meta: unknown, keys: string[]): string {
  if (!isRecord(meta)) return "";
  for (const key of keys) {
    const value = meta[key];
    const str = asTrimmedString(value);
    if (str) return str;
  }
  return "";
}

function pad2(v: number): string {
  return String(v).padStart(2, "0");
}

export function formatLocalYmd(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isSameLocalDay(iso: string, ymd: string): boolean {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return false;
  return formatLocalYmd(d) === ymd;
}

export type ReservationExportRow = {
  firstName: string;
  lastName: string;
  phone: string;
  time: string;
  comment: string;
};

export function reservationToExportRow(r: Reservation, locale: string = "fr-FR"): ReservationExportRow {
  const when = new Date(r.starts_at);

  const firstName = getMetaString(r.meta, [
    "guest_first_name",
    "first_name",
    "firstname",
    "prenom",
    "firstName",
  ]);

  const lastName = getMetaString(r.meta, [
    "guest_last_name",
    "last_name",
    "lastname",
    "nom",
    "lastName",
  ]);

  const phone = getMetaString(r.meta, [
    "guest_phone",
    "phone",
    "tel",
    "telephone",
    "contact",
  ]);

  const comment = getMetaString(r.meta, [
    "guest_comment",
    "comment",
    "message",
    "notes",
  ]);

  const time = Number.isFinite(when.getTime())
    ? when.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
    : "";

  return {
    firstName,
    lastName,
    phone,
    time,
    comment,
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

export function downloadReservationsCsv(args: {
  reservations: Reservation[];
  dayYmd: string;
  establishmentName?: string | null;
}): void {
  const rows = args.reservations
    .slice()
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((r) => reservationToExportRow(r));

  const sep = ";";
  const header = ["Prénom", "Nom", "Téléphone", "Heure", "Commentaire"]
    .map(csvEscape)
    .join(sep);

  const body = rows
    .map((r) => [r.firstName, r.lastName, r.phone, r.time, r.comment].map(csvEscape).join(sep))
    .join("\n");

  const title = args.establishmentName ? `${args.establishmentName} - ${args.dayYmd}` : args.dayYmd;
  const content = `sep=${sep}\n${csvEscape(title)}\n${header}\n${body}\n`;

  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const safeName = String(args.establishmentName ?? "reservations")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  downloadBlob({
    blob,
    filename: `${safeName || "reservations"}_${args.dayYmd}.csv`,
  });
}

export async function downloadReservationsPdf(args: {
  reservations: Reservation[];
  dayYmd: string;
  establishmentName?: string | null;
}): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const rows = args.reservations
    .slice()
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .map((r) => reservationToExportRow(r));

  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const lineHeight = 12;

  const title = args.establishmentName ? `Réservations — ${args.establishmentName}` : "Réservations";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Journée: ${args.dayYmd}`, margin, margin + 18);
  doc.text(`Total: ${rows.length}`, margin, margin + 34);

  const tableTop = margin + 56;

  const colFirst = 80;
  const colLast = 80;
  const colPhone = 110;
  const colTime = 60;
  const colComment = pageWidth - margin * 2 - colFirst - colLast - colPhone - colTime;

  const xFirst = margin;
  const xLast = xFirst + colFirst;
  const xPhone = xLast + colLast;
  const xTime = xPhone + colPhone;
  const xComment = xTime + colTime;

  const renderHeader = (y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Prénom", xFirst, y);
    doc.text("Nom", xLast, y);
    doc.text("Téléphone", xPhone, y);
    doc.text("Heure", xTime, y);
    doc.text("Commentaire", xComment, y);

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
    const commentLines = doc.splitTextToSize(row.comment || "", colComment) as string[];
    const rowLines = Math.max(1, commentLines.length);
    const rowHeight = rowLines * lineHeight + 6;

    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      renderHeader(y);
      y += 18;
    }

    doc.text(row.firstName || "", xFirst, y);
    doc.text(row.lastName || "", xLast, y);
    doc.text(row.phone || "", xPhone, y);
    doc.text(row.time || "", xTime, y);

    if (commentLines.length) {
      doc.text(commentLines, xComment, y);
    }

    y += rowHeight;
    doc.setDrawColor(235);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  const safeName = String(args.establishmentName ?? "reservations")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  doc.save(`${safeName || "reservations"}_${args.dayYmd}.pdf`);
}
