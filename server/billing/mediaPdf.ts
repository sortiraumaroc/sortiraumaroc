import PDFDocument from "pdfkit";

import type { BillingCompanyProfile } from "./companyProfile";

type MediaLineItem = {
  name_snapshot: string;
  description_snapshot?: string | null;
  quantity: number;
  unit_price_snapshot: number;
  tax_rate_snapshot: number;
  line_total: number;
};

type MediaParty = {
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  ice?: string | null;
};

type MediaQuoteLike = {
  quote_number: string;
  issued_at?: string | null;
  valid_until?: string | null;
  currency: string;
  payment_method?: string | null;
  notes?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  pro_profiles?: MediaParty | null;
  establishments?: { name?: string | null; city?: string | null } | null;
};

type MediaInvoiceLike = {
  invoice_number: string;
  issued_at?: string | null;
  due_at?: string | null;
  currency: string;
  payment_method?: string | null;
  notes?: string | null;
  subtotal_amount: number;
  tax_amount: number;
  total_amount: number;
  paid_amount?: number | null;
  pro_profiles?: MediaParty | null;
  establishments?: { name?: string | null; city?: string | null } | null;
};

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function roundMoney(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
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

function formatAmount(amount: unknown): string {
  const v = roundMoney(amount);
  const hasCents = Math.abs(v - Math.round(v)) > 1e-9;

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  }).format(v);
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

function resolveRecipient(args: {
  pro_profiles?: MediaParty | null;
  establishments?: { name?: string | null; city?: string | null } | null;
}): { companyName: string; city: string; ice: string } {
  const fromPro = args.pro_profiles ?? null;
  const est = args.establishments ?? null;

  const companyName =
    asString(fromPro?.company_name) || asString(est?.name) || "Client";
  const city = asString(fromPro?.city) || asString(est?.city) || "";
  const ice = asString(fromPro?.ice) || "";

  return { companyName, city, ice };
}

function drawTopBar(doc: PDFKit.PDFDocument, company: BillingCompanyProfile) {
  const h = 60;
  doc.save();
  doc.rect(0, 0, doc.page.width, h).fill("#111827");

  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(30)
    .text((company.trade_name || company.legal_name).toUpperCase(), 50, 16, {
      align: "right",
    });

  doc.restore();
}

function drawTitleAndMeta(args: {
  doc: PDFKit.PDFDocument;
  kind: "quote" | "invoice";
  docNumber: string;
  issuedAt: string;
  dueLabel: string;
  dueAt: string;
}) {
  const { doc, kind, docNumber, issuedAt, dueLabel, dueAt } = args;

  const title = kind === "quote" ? "DEVIS" : "FACTURE";
  const numberLabel = kind === "quote" ? "DEVIS N°" : "FACTURE N°";

  doc.fillColor("#111827");
  doc.font("Helvetica-Bold").fontSize(44).text(title, 50, 85);

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
  metaLine(`${dueLabel} :`, dueAt, topY + 30);
  metaLine(`${numberLabel} :`, docNumber, topY + 60);

  doc
    .moveTo(50, 160)
    .lineTo(doc.page.width - 50, 160)
    .strokeColor("#111827")
    .lineWidth(1)
    .stroke();
}

function drawRecipientBlock(args: {
  doc: PDFKit.PDFDocument;
  recipient: { companyName: string; city: string; ice: string };
}) {
  const { doc, recipient } = args;

  const x = 360;
  const y = 170;

  doc.fillColor("#111827");
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("DESTINATAIRE :", x, y, { width: 185, align: "right" });

  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .text(recipient.companyName, x, y + 16, { width: 185, align: "right" });
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
  items: MediaLineItem[];
  company: BillingCompanyProfile;
}): number {
  const { doc, items, company } = args;

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
    doc.text("Quantité :", col.qtyX, y, { width: col.qtyW, align: "right" });
    doc.text("Total :", col.totalX, y, { width: col.totalW, align: "right" });

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
    const name = asString(it.name_snapshot) || "—";
    const desc = asString(it.description_snapshot);

    const leftText = desc ? `${name}\n${desc}` : name;

    const leftHeight = doc.heightOfString(leftText, { width: col.descW });
    const rowHeight = Math.max(18, leftHeight);

    // Reserve footer space to keep totals block readable.
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

    doc.text(formatAmount(roundMoney(it.unit_price_snapshot)), col.unitX, y, {
      width: col.unitW,
      align: "right",
    });
    doc.text(
      String(Math.max(1, Math.floor(Number(it.quantity) || 1))),
      col.qtyX,
      y,
      { width: col.qtyW, align: "right" },
    );
    doc.text(formatAmount(roundMoney(it.line_total)), col.totalX, y, {
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
}) {
  const { doc, y, subtotal, tax, total } = args;

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

  line("TOTAL HT :", formatAmount(subtotal), y);
  line(`TVA ${rate ? `${rate}%` : ""} :`.trim(), formatAmount(tax), y + 18);
  line("REMISE :", "-", y + 36);

  doc
    .moveTo(xLeft, y + 58)
    .lineTo(xRight, y + 58)
    .strokeColor("#111827")
    .lineWidth(1)
    .stroke();

  line("TOTAL TTC :", formatAmount(total), y + 66, true);
}

function normalizePaymentMethod(v: unknown): "card" | "bank_transfer" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "card" || s === "cb" || s === "credit_card") return "card";
  if (s === "bank_transfer" || s === "virement" || s === "transfer")
    return "bank_transfer";
  return "bank_transfer";
}

function drawPaymentBlock(args: {
  doc: PDFKit.PDFDocument;
  y: number;
  company: BillingCompanyProfile;
  paymentMethod: "card" | "bank_transfer";
}) {
  const { doc, y, company, paymentMethod } = args;

  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#111827")
    .text("Paiement :", 50, y);

  doc.font("Helvetica").fontSize(9).fillColor("#111827");

  if (paymentMethod === "card") {
    doc.text(
      "Carte bancaire (lien de paiement fourni séparément).",
      50,
      y + 14,
      { width: 500 },
    );
    return;
  }

  doc.text("Virement bancaire", 50, y + 14, { width: 500 });

  const lines: string[] = [];
  if (company.bank_account_holder)
    lines.push(`Titulaire: ${company.bank_account_holder}`);
  if (company.bank_name) lines.push(`Banque: ${company.bank_name}`);
  if (company.rib) lines.push(`RIB: ${company.rib}`);
  if (company.iban) lines.push(`IBAN: ${company.iban}`);
  if (company.swift) lines.push(`SWIFT: ${company.swift}`);
  if (company.bank_instructions) lines.push(company.bank_instructions);

  if (!lines.length) return;

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor("#111827")
    .text(lines.join("\n"), 50, y + 30, { width: doc.page.width - 100 });
}

function drawFooter(doc: PDFKit.PDFDocument, company: BillingCompanyProfile) {
  const y = doc.page.height - 60;

  const lines = [
    `${company.legal_name} ${company.legal_form} · ICE: ${company.ice}`,
    `${company.address_line1}${company.address_line2 ? ` — ${company.address_line2}` : ""} — ${company.city}, ${company.country}`,
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

export async function generateMediaQuotePdfBuffer(args: {
  company: BillingCompanyProfile;
  quote: MediaQuoteLike;
  items: MediaLineItem[];
}): Promise<Buffer> {
  const { company, quote, items } = args;

  const doc = new PDFDocument({ size: "A4", margin: 0 });

  drawTopBar(doc, company);

  drawTitleAndMeta({
    doc,
    kind: "quote",
    docNumber: asString(quote.quote_number),
    issuedAt: formatDate(quote.issued_at, "fr-FR"),
    dueLabel: "ÉCHÉANCE",
    dueAt: formatDate(quote.valid_until, "fr-FR"),
  });

  drawRecipientBlock({ doc, recipient: resolveRecipient(quote) });

  const afterTableY = drawItemsTable({ doc, items, company });

  let totalsY = Math.max(afterTableY + 20, 560);
  if (totalsY > doc.page.height - 120) {
    doc.addPage({ size: "A4", margin: 0 });
    drawTopBar(doc, company);
    totalsY = 120;
  }

  drawTotalsBlock({
    doc,
    y: totalsY,
    subtotal: roundMoney(quote.subtotal_amount),
    tax: roundMoney(quote.tax_amount),
    total: roundMoney(quote.total_amount),
  });

  const paymentMethod = normalizePaymentMethod((quote as any).payment_method);

  const notes = asString(quote.notes);
  const notesY = Math.min(afterTableY + 20, totalsY - 36);
  let payY = Math.max(totalsY + 110, notes ? notesY + 70 : totalsY + 90);

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

  drawPaymentBlock({ doc, y: payY, company, paymentMethod });

  drawFooter(doc, company);

  return await docToBuffer(doc);
}

export async function generateMediaInvoicePdfBuffer(args: {
  company: BillingCompanyProfile;
  invoice: MediaInvoiceLike;
  items: MediaLineItem[];
}): Promise<Buffer> {
  const { company, invoice, items } = args;

  const doc = new PDFDocument({ size: "A4", margin: 0 });

  drawTopBar(doc, company);

  drawTitleAndMeta({
    doc,
    kind: "invoice",
    docNumber: asString(invoice.invoice_number),
    issuedAt: formatDate(invoice.issued_at, "fr-FR"),
    dueLabel: "ÉCHÉANCE",
    dueAt: formatDate(invoice.due_at, "fr-FR"),
  });

  drawRecipientBlock({ doc, recipient: resolveRecipient(invoice) });

  const afterTableY = drawItemsTable({ doc, items, company });

  let totalsY = Math.max(afterTableY + 20, 560);
  if (totalsY > doc.page.height - 120) {
    doc.addPage({ size: "A4", margin: 0 });
    drawTopBar(doc, company);
    totalsY = 120;
  }

  drawTotalsBlock({
    doc,
    y: totalsY,
    subtotal: roundMoney(invoice.subtotal_amount),
    tax: roundMoney(invoice.tax_amount),
    total: roundMoney(invoice.total_amount),
  });

  const paymentMethod = normalizePaymentMethod((invoice as any).payment_method);

  const notes = asString(invoice.notes);
  const notesY = Math.min(afterTableY + 20, totalsY - 36);
  let payY = Math.max(totalsY + 110, notes ? notesY + 70 : totalsY + 90);

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

  drawPaymentBlock({ doc, y: payY, company, paymentMethod });

  drawFooter(doc, company);

  return await docToBuffer(doc);
}
