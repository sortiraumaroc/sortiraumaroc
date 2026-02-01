import { getBillingCompanyProfile, type BillingCompanyProfile } from "@/lib/publicApi";

export type PackInvoicePdfData = {
  invoiceNumber: string;
  issuedAtIso: string;
  purchaseId: string;
  packTitle: string;
  establishmentName?: string;
  quantity: number;
  unitMad: number;
  totalMad: number;
  paymentMethodLabel: string;
};

function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function formatMoneyMad(amount: number): string {
  const v = Math.round(Number(amount));
  if (!Number.isFinite(v)) return "—";
  return `${v} Dhs`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === "\"") return "&quot;";
    return "&#39;";
  });
}

function issuerInlineHtml(issuer: BillingCompanyProfile): string {
  const address = [issuer.address_line1, issuer.address_line2, `${issuer.city}, ${issuer.country}`]
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => escapeHtml(String(v)))
    .join("<br />");

  return `
    <div style="color:#111827;font-size:12px;line-height:1.5;margin-top:8px;">
      <strong>${escapeHtml(issuer.trade_name)}</strong> (${escapeHtml(issuer.legal_name)})<br />
      ${escapeHtml(issuer.legal_form)} • ICE ${escapeHtml(issuer.ice)} • RC ${escapeHtml(issuer.rc_number)} — ${escapeHtml(issuer.rc_court)}<br />
      ${address}
    </div>
  `;
}

export async function generatePackInvoicePDF(data: PackInvoicePdfData): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Veuillez autoriser les pop-ups pour exporter le PDF");
    return;
  }

  let issuer: BillingCompanyProfile | null = null;
  try {
    issuer = await getBillingCompanyProfile();
  } catch {
    issuer = null;
  }

  const title = data.establishmentName ? `${data.packTitle} — ${data.establishmentName}` : data.packTitle;

  const html = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #a3001d;padding-bottom:16px;margin-bottom:20px;">
      <div>
        <h1 style="color:#a3001d;margin:0 0 5px 0;font-size:30px;">${escapeHtml(issuer?.trade_name || "Sortir Au Maroc")}</h1>
        <p style="color:#666;margin:0;font-size:13px;">Facture d’achat de pack</p>
        ${issuer ? issuerInlineHtml(issuer) : ""}
      </div>
      <div style="text-align:right;">
        <div style="color:#666;font-size:12px;text-transform:uppercase;font-weight:700;">Facture</div>
        <div style="color:#333;font-weight:800;font-size:16px;">${escapeHtml(data.invoiceNumber)}</div>
        <div style="color:#666;font-size:12px;margin-top:4px;">Émise le ${formatDate(data.issuedAtIso)}</div>
      </div>
    </div>

    <div style="background:#f6f6f6;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
      <div style="display:flex;justify-content:space-between;gap:16px;">
        <div>
          <div style="color:#666;font-size:12px;text-transform:uppercase;font-weight:700;">Référence d’achat</div>
          <div style="color:#a3001d;font-family:'Courier New',monospace;font-weight:800;font-size:16px;">${data.purchaseId}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#666;font-size:12px;text-transform:uppercase;font-weight:700;">Moyen</div>
          <div style="color:#333;font-weight:700;font-size:13px;">${data.paymentMethodLabel}</div>
        </div>
      </div>
    </div>

    <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:18px;">
      <div style="font-weight:800;color:#333;margin-bottom:10px;">Détails</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 0;color:#666;"><strong>Pack</strong></td>
          <td style="padding:10px 0;text-align:right;color:#333;">${title}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:10px 0;color:#666;"><strong>Prix</strong></td>
          <td style="padding:10px 0;text-align:right;color:#333;">${formatMoneyMad(data.unitMad)} × ${data.quantity}</td>
        </tr>
        <tr>
          <td style="padding:12px 0;color:#666;"><strong>Total payé</strong></td>
          <td style="padding:12px 0;text-align:right;color:#333;"><strong style="font-size:16px;">${formatMoneyMad(data.totalMad)}</strong></td>
        </tr>
      </table>
    </div>

    <div style="background:#fff7f8;border:1px solid #ffd6dc;border-radius:12px;padding:14px;">
      <div style="font-weight:800;color:#a3001d;margin-bottom:8px;">Informations</div>
      <div style="color:#333;font-size:13px;line-height:1.6;">
        • Conservez ce document pour votre suivi comptable et vos échanges avec le support.<br />
        • Les packs sont valables selon la période indiquée sur le bon (PDF) associé.
      </div>
    </div>

    <div style="margin-top:26px;padding-top:14px;border-top:1px solid #eee;text-align:center;color:#333;font-size:12px;">
      <div>${escapeHtml(issuer?.trade_name || "Sortir Au Maroc")} — Reçu généré automatiquement</div>
    </div>
  `;

  printWindow.document.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\" />");
  printWindow.document.write(`<title>Facture - ${data.invoiceNumber}</title>`);
  printWindow.document.write("<style>@media print{body{margin:0}*{-webkit-print-color-adjust:exact!important;color-adjust:exact!important}}body{margin:0;padding:20px;font-family:Arial,sans-serif;background:white}@page{margin:18mm}</style>");
  printWindow.document.write("</head><body>");
  printWindow.document.write(html);
  printWindow.document.write("</body></html>");
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  setTimeout(() => {
    printWindow.print();
  }, 500);
}
