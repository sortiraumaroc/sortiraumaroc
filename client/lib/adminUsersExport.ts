import { jsPDF } from "jspdf";

export type AdminUserExportRow = {
  id: string;
  name: string;
  email: string;
  statusLabel: string;
  city: string;
  country: string;
  reliabilityScore: number;
  reservations: number;
  noShows: number;
  createdAt: string;
  lastActivityAt: string;
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

export function downloadAdminUsersCsv(args: { users: AdminUserExportRow[]; title?: string }): void {
  const rows = args.users.slice();
  const sep = ";";

  const header = [
    "ID",
    "Nom",
    "Email",
    "Statut",
    "Ville",
    "Pays",
    "Score",
    "Réservations",
    "No-shows",
    "Création",
    "Dernière activité",
  ]
    .map(csvEscape)
    .join(sep);

  const body = rows
    .map((u) =>
      [
        u.id,
        u.name,
        u.email,
        u.statusLabel,
        u.city,
        u.country,
        String(u.reliabilityScore),
        String(u.reservations),
        String(u.noShows),
        u.createdAt,
        u.lastActivityAt,
      ]
        .map(csvEscape)
        .join(sep),
    )
    .join("\n");

  const title = (args.title ?? "Utilisateurs").trim() || "Utilisateurs";
  const subtitle = `Total: ${rows.length}`;

  const content = `sep=${sep}\n${csvEscape(title)}\n${csvEscape(subtitle)}\n${header}\n${body}\n`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });

  downloadBlob({
    blob,
    filename: `${makeSafeName(title) || "utilisateurs"}_${formatLocalYmd(new Date())}.csv`,
  });
}

export function downloadAdminUsersPdf(args: { users: AdminUserExportRow[]; title?: string }): void {
  const rows = args.users.slice();
  const title = (args.title ?? "Utilisateurs").trim() || "Utilisateurs";

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  const lineHeight = 11;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(title, margin, margin);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Total: ${rows.length}`, margin, margin + 18);

  const tableTop = margin + 46;

  const columns = [
    { key: "id", label: "ID", width: 78 },
    { key: "name", label: "Nom", width: 110 },
    { key: "email", label: "Email", width: 170 },
    { key: "statusLabel", label: "Statut", width: 60 },
    { key: "city", label: "Ville", width: 88 },
    { key: "country", label: "Pays", width: 60 },
    { key: "reliabilityScore", label: "Score", width: 48 },
    { key: "reservations", label: "Rés.", width: 52 },
    { key: "noShows", label: "No", width: 44 },
    { key: "createdAt", label: "Création", width: 70 },
    { key: "lastActivityAt", label: "Dernière", width: 76 },
  ] as const;

  const usableWidth = pageWidth - margin * 2;
  const baseWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = baseWidth > 0 ? Math.min(1, usableWidth / baseWidth) : 1;

  const scaled = columns.map((c) => ({ ...c, width: Math.floor(c.width * scale) }));
  const remainder = usableWidth - scaled.reduce((sum, c) => sum + c.width, 0);
  if (remainder > 0) scaled[2] = { ...scaled[2], width: scaled[2].width + remainder };

  const xs: number[] = [];
  let x = margin;
  for (const col of scaled) {
    xs.push(x);
    x += col.width;
  }

  const renderHeader = (y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    scaled.forEach((col, idx) => {
      doc.text(col.label, xs[idx], y);
    });

    doc.setDrawColor(180);
    doc.setLineWidth(0.5);
    doc.line(margin, y + 4, pageWidth - margin, y + 4);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
  };

  const getCell = (row: AdminUserExportRow, key: (typeof columns)[number]["key"]): string => {
    const value = row[key];
    if (typeof value === "number") return String(value);
    return String(value ?? "");
  };

  let y = tableTop;
  renderHeader(y);
  y += 16;

  for (const row of rows) {
    const cellLines = scaled.map((col) => doc.splitTextToSize(getCell(row, col.key), col.width - 6) as string[]);
    const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
    const rowHeight = maxLines * lineHeight + 6;

    if (y + rowHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
      renderHeader(y);
      y += 16;
    }

    scaled.forEach((col, idx) => {
      const lines = cellLines[idx];
      if (lines.length) doc.text(lines, xs[idx], y);
    });

    y += rowHeight;
    doc.setDrawColor(235);
    doc.line(margin, y - 2, pageWidth - margin, y - 2);
  }

  doc.save(`${makeSafeName(title) || "utilisateurs"}_${formatLocalYmd(new Date())}.pdf`);
}
