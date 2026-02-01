export type AdminReservationExportRow = {
  id: string;
  startsAt: string;
  bookingReference: string;
  status: string;
  paymentStatus: string;
  deposit: string;
  checkedInAt: string;
};

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

export function downloadAdminReservationsCsv(args: {
  rows: AdminReservationExportRow[];
  establishmentName?: string | null;
  establishmentId?: string | null;
  title?: string;
}): void {
  const rows = args.rows.slice();
  const sep = ";";

  const header = ["ID", "Date", "Référence", "Statut", "Paiement", "Acompte", "Check-in"].map(csvEscape).join(sep);

  const body = rows
    .map((r) => [r.id, r.startsAt, r.bookingReference, r.status, r.paymentStatus, r.deposit, r.checkedInAt].map(csvEscape).join(sep))
    .join("\n");

  const name = (args.establishmentName ?? "").trim();
  const estLabel = name || (args.establishmentId ?? "").trim() || "Établissement";

  const title = (args.title ?? `Réservations — ${estLabel}`).trim() || `Réservations — ${estLabel}`;
  const subtitle = `Total: ${rows.length}`;

  const content = `sep=${sep}\n${csvEscape(title)}\n${csvEscape(subtitle)}\n${header}\n${body}\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });

  downloadBlob({
    blob,
    filename: `${makeSafeName(estLabel) || "reservations"}_${formatLocalYmd(new Date())}.csv`,
  });
}
