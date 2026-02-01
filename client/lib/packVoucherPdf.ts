import { getBillingCompanyProfile } from "@/lib/publicApi";

export type PackVoucherPdfData = {
  purchaseId: string;
  packTitle: string;
  establishmentName?: string;
  universeLabel: string;
  quantity: number;
  unitMad: number;
  totalMad: number;
  purchasedAtIso: string;
  validFromIso: string;
  validUntilIso: string;
  qrCodeUrl: string;
};

function formatDateTime(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  return new Date(ts).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatMoneyMad(amount: number): string {
  const v = Math.round(Number(amount));
  if (!Number.isFinite(v)) return "—";
  return `${v} Dhs`;
}

export async function generatePackVoucherPDF(data: PackVoucherPdfData): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    alert("Veuillez autoriser les pop-ups pour exporter le PDF");
    return;
  }

  let brand = "Sortir Au Maroc";
  try {
    const issuer = await getBillingCompanyProfile();
    if (issuer.trade_name) brand = issuer.trade_name;
  } catch {
    // ignore
  }

  const title = (data.establishmentName ? `${data.establishmentName} · ` : "") + data.packTitle;

  const html = `
    <div style="text-align:center;margin-bottom:22px;border-bottom:3px solid #a3001d;padding-bottom:16px;">
      <h1 style="color:#a3001d;margin:0 0 6px 0;font-size:32px;">${brand}</h1>
      <p style="color:#666;margin:0;font-size:14px;">Bon d’achat / Pack</p>
    </div>

    <div style="background:#f6f6f6;border-radius:10px;padding:14px 16px;margin-bottom:18px;">
      <div style="color:#666;font-size:12px;text-transform:uppercase;font-weight:700;">Référence</div>
      <div style="color:#a3001d;font-family:'Courier New',monospace;font-weight:800;font-size:18px;">${data.purchaseId}</div>
    </div>

    <div style="display:flex;gap:16px;align-items:center;background:#fff;border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:16px;">
      <div style="flex:1;min-width:0;">
        <div style="color:#333;font-weight:800;font-size:18px;">${title}</div>
        <div style="margin-top:6px;color:#666;font-size:13px;">Catégorie: <strong>${data.universeLabel}</strong></div>
        <div style="margin-top:6px;color:#666;font-size:13px;">Acheté le: <strong>${formatDateTime(data.purchasedAtIso)}</strong></div>
      </div>
      <div style="text-align:center;">
        <div style="color:#666;font-size:12px;text-transform:uppercase;font-weight:700;margin-bottom:8px;">QR Code</div>
        <img src="${data.qrCodeUrl}" alt="QR Code" style="width:140px;height:140px;border:2px solid #ddd;border-radius:6px;" />
      </div>
    </div>

    <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:16px;">
      <div style="font-weight:800;color:#333;margin-bottom:8px;">Conditions d’utilisation</div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#666;"><strong>Valable du</strong></td>
          <td style="padding:8px 0;text-align:right;color:#333;">${formatDate(data.validFromIso)}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#666;"><strong>Jusqu’au</strong></td>
          <td style="padding:8px 0;text-align:right;color:#333;"><strong style="color:#a3001d;">${formatDate(data.validUntilIso)}</strong></td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#666;"><strong>Quantité</strong></td>
          <td style="padding:8px 0;text-align:right;color:#333;">${data.quantity}</td>
        </tr>
        <tr style="border-bottom:1px solid #eee;">
          <td style="padding:8px 0;color:#666;"><strong>Prix</strong></td>
          <td style="padding:8px 0;text-align:right;color:#333;">${formatMoneyMad(data.unitMad)} × ${data.quantity}</td>
        </tr>
        <tr>
          <td style="padding:10px 0;color:#666;"><strong>Total payé</strong></td>
          <td style="padding:10px 0;text-align:right;color:#333;"><strong style="font-size:16px;">${formatMoneyMad(data.totalMad)}</strong></td>
        </tr>
      </table>
    </div>

    <div style="background:#fff7f8;border:1px solid #ffd6dc;border-radius:12px;padding:14px;">
      <div style="font-weight:800;color:#a3001d;margin-bottom:8px;">À présenter sur place</div>
      <div style="color:#333;font-size:13px;line-height:1.5;">
        Présentez ce QR code à l’arrivée. Il contient la référence du pack et sa période de validité.
      </div>
    </div>

    <div style="margin-top:26px;padding-top:14px;border-top:1px solid #eee;text-align:center;color:#333;font-size:12px;">
      <div>🔒 Paiement sécurisé | ⚡ Géré par ${brand}</div>
      <div style="margin-top:6px;color:#666;">Document généré le ${new Date().toLocaleDateString("fr-FR")}</div>
    </div>
  `;

  printWindow.document.write("<!DOCTYPE html><html><head><meta charset=\"utf-8\" />");
  printWindow.document.write(`<title>Pack - ${data.purchaseId}</title>`);
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
