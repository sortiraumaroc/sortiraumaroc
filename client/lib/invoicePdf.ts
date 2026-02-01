import { formatMoneyMad } from "@/lib/billing";

import {
  getBillingCompanyProfile,
  type BillingCompanyProfile,
} from "@/lib/publicApi";

export type InvoicePdfData = {
  invoiceNumber: string;
  issuedAtIso: string;
  bookingReference: string;
  establishmentName: string;
  reservationDateIso: string;
  partySize: number;
  unitMad: number;
  totalMad: number;
  paymentMethodLabel: string;
};

function formatDate(dateString: string): string {
  const ts = Date.parse(dateString);
  if (!Number.isFinite(ts)) return dateString;
  return new Date(ts).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#39;";
  });
}

function issuerBlockHtml(issuer: BillingCompanyProfile): string {
  const address = [
    issuer.address_line1,
    issuer.address_line2,
    `${issuer.city}, ${issuer.country}`,
  ]
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => escapeHtml(String(v)))
    .join("<br />");

  return `
    <div style="text-align:center;margin-bottom:18px;border-bottom:3px solid #a3001d;padding-bottom:14px;">
      <div style="color:#a3001d;margin:0 0 4px 0;font-size:30px;font-weight:800;">${escapeHtml(issuer.trade_name)}</div>
      <div style="color:#111827;font-size:13px;font-weight:700;">(${escapeHtml(issuer.legal_name)})</div>
      <div style="color:#6b7280;margin-top:8px;font-size:12px;line-height:1.5;">
        ${escapeHtml(issuer.legal_form)} • ICE ${escapeHtml(issuer.ice)} • RC ${escapeHtml(issuer.rc_number)} — ${escapeHtml(issuer.rc_court)}<br />
        ${address}<br />
        Capital: ${escapeHtml(String(issuer.capital_mad))} MAD
      </div>
      <div style="color:#666;margin-top:10px;font-size:13px;">Facture de pré-réservation</div>
    </div>
  `;
}

export async function generateInvoicePDF(data: InvoicePdfData): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Veuillez autoriser les pop-ups pour télécharger la facture");
    return;
  }

  let issuer: BillingCompanyProfile;
  try {
    issuer = await getBillingCompanyProfile();
  } catch {
    // If the issuer profile can't be fetched, still render an invoice (but without full legal details).
    issuer = {
      legal_name: "",
      trade_name: "Sortir Au Maroc",
      legal_form: "",
      ice: "",
      rc_number: "",
      rc_court: "",
      address_line1: "",
      address_line2: null,
      city: "",
      country: "",
      capital_mad: 0,
      default_currency: "MAD",

      bank_name: null,
      rib: null,
      iban: null,
      swift: null,
      bank_account_holder: null,
      bank_instructions: null,

      updated_at: new Date().toISOString(),
    };
  }

  const htmlContent = `
    ${issuer.legal_name && issuer.ice ? issuerBlockHtml(issuer) : `<div style="text-align:center;margin-bottom:26px;border-bottom:3px solid #a3001d;padding-bottom:16px;"><h1 style="color:#a3001d;margin:0 0 5px 0;font-size:30px;">${escapeHtml(issuer.trade_name || "Sortir Au Maroc")}</h1><p style="color:#666;margin:0;font-size:13px;">Facture de pré-réservation</p></div>`}

    <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap;">
      <div style="flex:1;min-width:240px;background:#f5f5f5;padding:14px;border-radius:10px;">
        <div style="font-size:12px;color:#666;font-weight:bold;text-transform:uppercase;">Facture</div>
        <div style="font-size:18px;color:#a3001d;font-weight:800;margin-top:4px;">${data.invoiceNumber}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Émise le ${formatDate(data.issuedAtIso)}</div>
      </div>

      <div style="flex:1;min-width:240px;background:#fff;border:1px solid #e5e5e5;padding:14px;border-radius:10px;">
        <div style="font-size:12px;color:#666;font-weight:bold;text-transform:uppercase;">Réservation</div>
        <div style="font-size:14px;color:#333;font-weight:700;margin-top:4px;">${data.establishmentName}</div>
        <div style="font-size:12px;color:#666;margin-top:4px;">Réf. ${data.bookingReference}</div>
      </div>
    </div>

    <h3 style="color:#333;font-size:14px;margin:18px 0 10px 0;text-transform:uppercase;border-bottom:2px solid #a3001d;padding-bottom:8px;">Détails</h3>

    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 0;color:#666;"><strong>Date de réservation</strong></td>
        <td style="padding:10px 0;text-align:right;color:#333;">${formatDate(data.reservationDateIso)}</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 0;color:#666;"><strong>Pré-réservation</strong></td>
        <td style="padding:10px 0;text-align:right;color:#333;">${formatMoneyMad(data.unitMad)} × ${data.partySize} pers.</td>
      </tr>
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:10px 0;color:#666;"><strong>Total payé</strong></td>
        <td style="padding:10px 0;text-align:right;color:#a3001d;font-weight:800;">${formatMoneyMad(data.totalMad)}</td>
      </tr>
      <tr>
        <td style="padding:10px 0;color:#666;"><strong>Moyen de paiement</strong></td>
        <td style="padding:10px 0;text-align:right;color:#333;">${data.paymentMethodLabel}</td>
      </tr>
    </table>

    <div style="margin-top:22px;background:#f9f9f9;border:1px solid #e5e5e5;border-radius:10px;padding:14px;font-size:12px;color:#666;line-height:1.6;">
      <div style="font-weight:700;color:#333;margin-bottom:6px;">Informations</div>
      <div>• Cette facture correspond à la pré-réservation (déduite de l’addition finale, selon conditions de l’établissement).</div>
      <div>• Conservez ce document pour votre suivi comptable et vos échanges avec le support.</div>
    </div>

    <div style="margin-top:28px;padding-top:18px;border-top:2px solid #ddd;text-align:center;font-size:12px;color:#333;">
      <p style="margin:5px 0;">🔒 Paiement sécurisé | ⚡ Géré par ${escapeHtml(issuer.trade_name || "Sortir Au Maroc")}</p>
    </div>
  `;

  printWindow.document.write(
    "<!DOCTYPE html><html><head><meta charset='utf-8'>",
  );
  printWindow.document.write(`<title>Facture - ${data.invoiceNumber}</title>`);
  printWindow.document.write(
    "<style>@media print{body{margin:0;padding:0}*{-webkit-print-color-adjust:exact!important;color-adjust:exact!important}}body{margin:0;padding:20px;font-family:Arial,sans-serif;background:white}@page{margin:20mm}</style>",
  );
  printWindow.document.write("</head><body>");
  printWindow.document.write(htmlContent);
  printWindow.document.write("</body></html>");
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  setTimeout(() => {
    printWindow.print();
  }, 600);
}
