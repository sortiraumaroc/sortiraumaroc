/**
 * PDF generation for Visibility Order invoices
 * Used for username subscription invoices and other visibility orders
 */

import PDFDocument from "pdfkit";

import type { BillingCompanyProfile } from "./companyProfile";

export type VisibilityInvoiceLineItem = {
  title: string;
  description?: string | null;
  quantity: number;
  unit_price_cents: number;
  total_price_cents: number;
  tax_rate_bps: number;
};

export type VisibilityInvoiceData = {
  invoice_number: string;
  issued_at: string;
  due_at?: string | null;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes?: string | null;
  // Recipient info
  recipient_name: string;
  recipient_city?: string | null;
  recipient_ice?: string | null;
  // Items
  items: VisibilityInvoiceLineItem[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roundMoney(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function centsToMad(cents: number): number {
  return roundMoney(cents / 100);
}

function formatDate(
  iso: string | null | undefined,
  locale: "fr-FR" | "en-GB" = "fr-FR",
): string {
  const v = asString(iso);
  if (!v) return "";
  const ts = Date.parse(v);
  if (!Number.isFinite(ts)) return "";
  return new Date(ts).toLocaleDateString(locale);
}

function formatAmount(amount: number): string {
  const hasCents = Math.abs(amount - Math.round(amount)) > 1e-9;

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(amount);
}

function computeTaxRatePercent(subtotal: number, tax: number): number {
  const s = roundMoney(subtotal);
  const t = roundMoney(tax);
  if (!s) return 0;
  return Math.round((t / s) * 100 * 100) / 100;
}

function docToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err) => reject(err));
    doc.end();
  });
}

function drawTopBar(doc: PDFKit.PDFDocument, company: BillingCompanyProfile) {
  const h = 60;
  doc.save();
  doc.rect(0, 0, doc.page.width, h).fill("#a3001d"); // SAM red color

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(26)
    .text("SORTIR AU MAROC", 50, 20, {
      align: "right",
    });

  doc.restore();
}

function drawTitleAndMeta(args: {
  doc: PDFKit.PDFDocument;
  docNumber: string;
  issuedAt: string;
  dueAt: string;
}) {
  const { doc, docNumber, issuedAt, dueAt } = args;

  doc.fillColor("#111827");
  doc.font("Helvetica-Bold").fontSize(36).text("FACTURE", 50, 85);

  const rightX = 360;
  const topY = 90;

  const metaLine = (label: string, value: string, y: number) => {
    if (!value) return;
    doc
      .fontSize(9)
      .font("Helvetica-Bold")
      .text(label, rightX, y, { width: 185, align: "right" });
    doc
      .font("Helvetica")
      .text(value, rightX, y + 12, { width: 185, align: "right" });
  };

  metaLine("DATE :", issuedAt, topY);
  if (dueAt) metaLine("ECHEANCE :", dueAt, topY + 30);
  metaLine("FACTURE N° :", docNumber, topY + 60);

  doc
    .moveTo(50, 160)
    .lineTo(doc.page.width - 50, 160)
    .strokeColor("#111827")
    .lineWidth(1)
    .stroke();
}

function drawRecipientBlock(args: {
  doc: PDFKit.PDFDocument;
  recipient: { name: string; city: string | null; ice: string | null };
}) {
  const { doc, recipient } = args;

  const x = 360;
  const y = 170;

  doc.fillColor("#111827");
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("CLIENT :", x, y, { width: 185, align: "right" });

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(recipient.name, x, y + 16, { width: 185, align: "right" });
  if (recipient.city) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .text(recipient.city, x, y + 30, { width: 185, align: "right" });
  }
  if (recipient.ice) {
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`ICE : ${recipient.ice}`, x, y + 44, {
        width: 185,
        align: "right",
      });
  }
}

function drawItemsTable(args: {
  doc: PDFKit.PDFDocument;
  items: VisibilityInvoiceLineItem[];
  company: BillingCompanyProfile;
  currency: string;
}): number {
  const { doc, items, company, currency } = args;

  const col = {
    descX: 50,
    descW: 280,
    unitX: 340,
    unitW: 80,
    qtyX: 425,
    qtyW: 70,
    totalX: 500,
    totalW: 95,
  };

  const drawHeaderAt = (y: number) => {
    doc.fillColor("#111827");
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text("Description :", col.descX, y);
    doc.text("Prix Unitaire :", col.unitX, y, {
      width: col.unitW,
      align: "right",
    });
    doc.text("Qte :", col.qtyX, y, { width: col.qtyW, align: "right" });
    doc.text(`Total (${currency}) :`, col.totalX, y, { width: col.totalW, align: "right" });

    doc
      .moveTo(50, y + 16)
      .lineTo(doc.page.width - 50, y + 16)
      .strokeColor("#111827")
      .lineWidth(0.8)
      .stroke();

    return y + 26;
  };

  let y = drawHeaderAt(245);

  doc.font("Helvetica").fontSize(9).fillColor("#111827");

  for (const it of items) {
    const name = asString(it.title) || "—";
    const desc = asString(it.description);

    const leftText = desc ? `${name}\n${desc}` : name;

    const leftHeight = doc.heightOfString(leftText, { width: col.descW });
    const rowHeight = Math.max(18, leftHeight);

    // Reserve footer space
    const bottomLimit = doc.page.height - 170;
    if (y + rowHeight + 16 > bottomLimit) {
      doc.addPage({ size: "A4", margin: 0 });
      drawTopBar(doc, company);
      y = drawHeaderAt(90);
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .text(leftText, col.descX, y, { width: col.descW });

    doc.text(formatAmount(centsToMad(it.unit_price_cents)), col.unitX, y, {
      width: col.unitW,
      align: "right",
    });
    doc.text(
      String(Math.max(1, Math.floor(Number(it.quantity) || 1))),
      col.qtyX,
      y,
      { width: col.qtyW, align: "right" },
    );
    doc.text(formatAmount(centsToMad(it.total_price_cents)), col.totalX, y, {
      width: col.totalW,
      align: "right",
    });

    y += rowHeight + 10;
  }

  doc
    .moveTo(50, y)
    .lineTo(doc.page.width - 50, y)
    .strokeColor("#111827")
    .lineWidth(0.8)
    .stroke();

  return y + 12;
}

function drawTotalsBlock(args: {
  doc: PDFKit.PDFDocument;
  y: number;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
}) {
  const { doc, y, subtotal, tax, total, currency } = args;

  const rate = computeTaxRatePercent(subtotal, tax);

  const xLeft = 360;
  const xRight = doc.page.width - 50;

  const line = (
    label: string,
    value: string,
    yLine: number,
    bold?: boolean,
  ) => {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(11)
      .fillColor("#111827");
    doc.text(label, xLeft, yLine, { width: xRight - xLeft, align: "left" });
    doc.text(value, xLeft, yLine, { width: xRight - xLeft, align: "right" });
  };

  line("TOTAL HT :", `${formatAmount(subtotal)} ${currency}`, y);
  line(`TVA ${rate ? `${rate}%` : ""} :`.trim(), `${formatAmount(tax)} ${currency}`, y + 18);

  doc
    .moveTo(xLeft, y + 42)
    .lineTo(xRight, y + 42)
    .strokeColor("#111827")
    .lineWidth(1)
    .stroke();

  line("TOTAL TTC :", `${formatAmount(total)} ${currency}`, y + 50, true);
}

function drawPaymentBlock(args: {
  doc: PDFKit.PDFDocument;
  y: number;
  company: BillingCompanyProfile;
}) {
  const { doc, y, company } = args;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Paiement :", 50, y);

  doc.font("Helvetica").fontSize(9).fillColor("#111827");
  doc.text("Paiement effectue par carte bancaire.", 50, y + 14, { width: 500 });
}

function drawFooter(doc: PDFKit.PDFDocument, company: BillingCompanyProfile) {
  const y = doc.page.height - 60;

  const lines = [
    `${company.legal_name} ${company.legal_form} - ICE: ${company.ice}`,
    `${company.address_line1}${company.address_line2 ? ` - ${company.address_line2}` : ""} - ${company.city}, ${company.country}`,
  ];

  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#6b7280")
    .text(lines.join(" | "), 50, y, {
      width: doc.page.width - 100,
      align: "center",
    });

  doc.fillColor("#111827");
}

export async function generateVisibilityInvoicePdfBuffer(args: {
  company: BillingCompanyProfile;
  invoice: VisibilityInvoiceData;
}): Promise<Buffer> {
  const { company, invoice } = args;

  const doc = new PDFDocument({ size: "A4", margin: 0 });

  drawTopBar(doc, company);

  drawTitleAndMeta({
    doc,
    docNumber: asString(invoice.invoice_number),
    issuedAt: formatDate(invoice.issued_at, "fr-FR"),
    dueAt: formatDate(invoice.due_at, "fr-FR"),
  });

  drawRecipientBlock({
    doc,
    recipient: {
      name: invoice.recipient_name,
      city: invoice.recipient_city || null,
      ice: invoice.recipient_ice || null,
    },
  });

  const afterTableY = drawItemsTable({
    doc,
    items: invoice.items,
    company,
    currency: invoice.currency,
  });

  let totalsY = Math.max(afterTableY + 20, 480);
  if (totalsY > doc.page.height - 140) {
    doc.addPage({ size: "A4", margin: 0 });
    drawTopBar(doc, company);
    totalsY = 120;
  }

  drawTotalsBlock({
    doc,
    y: totalsY,
    subtotal: centsToMad(invoice.subtotal_cents),
    tax: centsToMad(invoice.tax_cents),
    total: centsToMad(invoice.total_cents),
    currency: invoice.currency,
  });

  const notes = asString(invoice.notes);
  const notesY = Math.min(afterTableY + 20, totalsY - 36);
  let payY = Math.max(totalsY + 90, notes ? notesY + 70 : totalsY + 70);

  if (payY > doc.page.height - 140) {
    doc.addPage({ size: "A4", margin: 0 });
    drawTopBar(doc, company);
    payY = 120;
  }

  if (notes && notesY > 260) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#111827")
      .text("Notes :", 50, notesY);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#111827")
      .text(notes, 50, notesY + 14, { width: 300 });
  }

  drawPaymentBlock({ doc, y: payY, company });

  drawFooter(doc, company);

  return await docToBuffer(doc);
}
