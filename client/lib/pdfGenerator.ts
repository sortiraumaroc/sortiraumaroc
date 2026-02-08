export interface ReservationPdfData {
  bookingReference: string;
  restaurantName: string;
  address: string;
  phone: string;
  date: string;
  time: string;
  service: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  reservationMode: "guaranteed" | "non-guaranteed";
  /** @deprecated QR code is no longer embedded in the PDF. Kept for backward compatibility. */
  qrCodeUrl?: string;
  unitPrepayMad?: number;
  totalPrepayMad?: number;
  message?: string;
}

/**
 * Generate a professional PDF for the reservation
 * Phase 1: Uses browser print-to-PDF functionality
 * Phase 2: Will use jsPDF + html2canvas for server-side generation
 */
export const generateReservationPDF = async (data: ReservationPdfData): Promise<void> => {
  try {
    // Create a temporary window for the PDF content
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Veuillez autoriser les pop-ups pour exporter le PDF');
      return;
    }

    // Create a temporary container for the PDF content
    const container = document.createElement('div');
    container.id = 'pdf-container';
    container.style.width = '100%';
    container.style.backgroundColor = 'white';
    container.style.padding = '40px';
    container.style.fontFamily = 'Arial, sans-serif';

    // Build the HTML content
    const formatDate = (dateString: string) => {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString('fr-FR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      } catch {
        return dateString;
      }
    };

    const htmlContent = `
      <div style="max-width: 500px; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif;">
        <!-- Header with gradient -->
        <div style="background: linear-gradient(135deg, #a3001d 0%, #7a0016 100%); color: white; padding: 24px 20px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 1px;">SORTIR AU MAROC</h1>
          <p style="margin: 4px 0 0 0; font-size: 11px; opacity: 0.9; letter-spacing: 0.5px;">CONFIRMATION DE RÉSERVATION</p>
        </div>

        <!-- Main content card -->
        <div style="background: white; border: 1px solid #e5e5e5; border-top: none; padding: 20px;">

          <!-- Restaurant & Details -->
          <div style="margin-bottom: 16px;">
              <div style="margin-bottom: 14px;">
                <p style="font-size: 10px; color: #888; margin: 0 0 2px 0; text-transform: uppercase; letter-spacing: 0.5px;">Restaurant</p>
                <p style="font-size: 14px; font-weight: 600; color: #1a1a1a; margin: 0;">${data.restaurantName}</p>
                <p style="font-size: 11px; color: #666; margin: 2px 0 0 0;">${data.address}</p>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div style="background: #f8f8f8; padding: 10px; border-radius: 6px;">
                  <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Date</p>
                  <p style="font-size: 12px; font-weight: 600; color: #1a1a1a; margin: 2px 0 0 0;">${formatDate(data.date)}</p>
                </div>
                <div style="background: #f8f8f8; padding: 10px; border-radius: 6px;">
                  <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Heure</p>
                  <p style="font-size: 12px; font-weight: 600; color: #1a1a1a; margin: 2px 0 0 0;">${data.time}</p>
                </div>
                <div style="background: #f8f8f8; padding: 10px; border-radius: 6px;">
                  <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Personnes</p>
                  <p style="font-size: 12px; font-weight: 600; color: #1a1a1a; margin: 2px 0 0 0;">${data.partySize}</p>
                </div>
                <div style="background: #f8f8f8; padding: 10px; border-radius: 6px;">
                  <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Service</p>
                  <p style="font-size: 12px; font-weight: 600; color: #1a1a1a; margin: 2px 0 0 0;">${data.service}</p>
                </div>
              </div>

              <!-- QR notice -->
              <div style="margin-top: 12px; background: #fff7f8; border: 1px solid #ffd6dc; border-radius: 8px; padding: 10px 14px; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #a3001d; font-weight: 600; line-height: 1.5;">
                  \u{1F4F1} Pr\u00e9sentez votre QR code personnel dans l\u2019application Sortir Au Maroc pour valider votre r\u00e9servation.
                </p>
              </div>
          </div>

          <!-- Reference badge -->
          <div style="background: linear-gradient(135deg, #a3001d 0%, #7a0016 100%); color: white; padding: 10px 14px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <span style="font-size: 10px; opacity: 0.9;">RÉFÉRENCE</span>
            <span style="font-size: 14px; font-weight: 700; font-family: 'Courier New', monospace; letter-spacing: 1px;">${data.bookingReference}</span>
          </div>

          <!-- Guest info row -->
          <div style="display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #eee; border-bottom: 1px solid #eee; margin-bottom: 12px;">
            <div style="flex: 1;">
              <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Nom</p>
              <p style="font-size: 12px; font-weight: 500; color: #1a1a1a; margin: 2px 0 0 0;">${data.guestName}</p>
            </div>
            ${data.guestPhone ? `
            <div style="flex: 1;">
              <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Téléphone</p>
              <p style="font-size: 12px; font-weight: 500; color: #1a1a1a; margin: 2px 0 0 0;">${data.guestPhone}</p>
            </div>
            ` : ''}
            ${data.guestEmail ? `
            <div style="flex: 1;">
              <p style="font-size: 9px; color: #888; margin: 0; text-transform: uppercase;">Email</p>
              <p style="font-size: 11px; font-weight: 500; color: #1a1a1a; margin: 2px 0 0 0; word-break: break-all;">${data.guestEmail}</p>
            </div>
            ` : ''}
          </div>

          <!-- Status & Payment -->
          <div style="display: flex; gap: 10px; margin-bottom: 12px;">
            <div style="flex: 1; background: ${data.reservationMode === 'guaranteed' ? '#e8f5e9' : '#fff8e1'}; padding: 10px; border-radius: 6px; border-left: 3px solid ${data.reservationMode === 'guaranteed' ? '#4caf50' : '#ff9800'};">
              <p style="font-size: 9px; color: #666; margin: 0;">STATUT</p>
              <p style="font-size: 11px; font-weight: 600; color: ${data.reservationMode === 'guaranteed' ? '#2e7d32' : '#e65100'}; margin: 2px 0 0 0;">
                ${data.reservationMode === 'guaranteed' ? 'Place Garantie' : 'En Attente'}
              </p>
            </div>
            ${typeof data.totalPrepayMad === 'number' && data.totalPrepayMad > 0 ? `
            <div style="flex: 1; background: #e3f2fd; padding: 10px; border-radius: 6px; border-left: 3px solid #2196f3;">
              <p style="font-size: 9px; color: #666; margin: 0;">PRÉ-PAIEMENT</p>
              <p style="font-size: 11px; font-weight: 600; color: #1565c0; margin: 2px 0 0 0;">
                ${Math.round(data.totalPrepayMad)} DH
              </p>
            </div>
            ` : ''}
          </div>

          ${data.message ? `
          <!-- Message -->
          <div style="background: #fafafa; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
            <p style="font-size: 9px; color: #888; margin: 0 0 4px 0; text-transform: uppercase;">Note</p>
            <p style="font-size: 11px; color: #333; margin: 0; line-height: 1.4;">${data.message}</p>
          </div>
          ` : ''}
        </div>

        <!-- Footer -->
        <div style="background: #1a1a1a; color: white; padding: 12px 20px; border-radius: 0 0 12px 12px; text-align: center;">
          <p style="margin: 0; font-size: 10px; opacity: 0.7;">
            www.sortiraumaroc.com • Réservation sécurisée • ${new Date().toLocaleDateString('fr-FR')}
          </p>
        </div>
      </div>
    `;

    container.innerHTML = htmlContent;

    // Write HTML to the print window
    printWindow.document.write('<!DOCTYPE html>');
    printWindow.document.write('<html>');
    printWindow.document.write('<head>');
    printWindow.document.write('<meta charset="utf-8">');
    printWindow.document.write('<title>Réservation - ' + data.bookingReference + '</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      @media print {
        body { margin: 0; padding: 0; }
        * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; print-color-adjust: exact !important; }
        .print-button { display: none !important; }
      }
      @page {
        size: A4;
        margin: 15mm;
      }
      body {
        margin: 0;
        padding: 20px;
        font-family: 'Segoe UI', Arial, sans-serif;
        background: #f5f5f5;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-height: 100vh;
      }
      .print-button {
        margin-bottom: 16px;
        padding: 10px 24px;
        background: linear-gradient(135deg, #a3001d 0%, #7a0016 100%);
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      .print-button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(163, 0, 29, 0.3);
      }
      .print-button svg {
        width: 18px;
        height: 18px;
      }
    `);
    printWindow.document.write('</style>');
    printWindow.document.write('</head>');
    printWindow.document.write('<body>');
    // Add print button at the top
    printWindow.document.write(`
      <button class="print-button" onclick="window.print()">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Imprimer / Enregistrer PDF
      </button>
    `);
    printWindow.document.write(htmlContent);
    printWindow.document.write('</body>');
    printWindow.document.write('</html>');
    printWindow.document.close();

    // No automatic print - user can click the print button if needed
  } catch (error) {
    console.error('Error generating PDF:', error);
    alert('Une erreur est survenue lors de la génération du PDF. Veuillez réessayer.');
  }
};
