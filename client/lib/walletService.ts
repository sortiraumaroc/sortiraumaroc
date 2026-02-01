/**
 * Wallet Service
 * Handles Apple Wallet and Google Wallet integration
 */

export interface PassGenerationRequest {
  bookingReference: string;
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  qrCodeUrl: string;
  establishmentId?: string;
  address?: string;
}

interface AppleWalletResponse {
  success: boolean;
  demo?: boolean;
  passData?: string; // base64 encoded .pkpass
  passUrl?: string;
  url?: string;
  mimeType?: string;
  filename?: string;
  message?: string;
  setupInstructions?: Record<string, unknown>;
}

/**
 * Request Apple Wallet pass generation
 * Returns response with pass data or demo info
 */
export const requestAppleWalletPass = async (data: PassGenerationRequest): Promise<AppleWalletResponse | null> => {
  try {
    const response = await fetch('/api/wallet/apple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.warn('Apple Wallet: Backend error');
      return null;
    }

    const result = await response.json() as AppleWalletResponse;
    return result;
  } catch (error) {
    console.error('Error requesting Apple Wallet pass:', error);
    return null;
  }
};

interface GoogleWalletResponse {
  success: boolean;
  demo?: boolean;
  walletLink?: string;
  saveUrl?: string;
  url?: string;
  calendarUrl?: string;
  message?: string;
}

/**
 * Request Google Wallet pass generation
 * Returns Google Wallet "Add to Wallet" link or calendar fallback
 */
export const requestGoogleWalletPass = async (data: PassGenerationRequest): Promise<GoogleWalletResponse | null> => {
  try {
    const response = await fetch('/api/wallet/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.warn('Google Wallet: Backend not configured');
      return null;
    }

    const result = await response.json() as GoogleWalletResponse;
    return result;
  } catch (error) {
    console.error('Error requesting Google Wallet pass:', error);
    return null;
  }
};

/**
 * Handle Apple Wallet button click
 * Downloads .pkpass file or shows fallback
 */
export const handleAddToAppleWallet = async (data: PassGenerationRequest): Promise<void> => {
  try {
    const result = await requestAppleWalletPass(data);

    if (!result) {
      // Fallback: Copy booking reference to clipboard
      await navigator.clipboard.writeText(data.bookingReference);
      alert(`Référence copiée: ${data.bookingReference}\n\nL'intégration Apple Wallet sera bientôt disponible.`);
      return;
    }

    // Demo mode
    if (result.demo) {
      await navigator.clipboard.writeText(data.bookingReference);
      alert(`Référence copiée: ${data.bookingReference}\n\n${result.message || 'Apple Wallet sera bientôt disponible.'}`);
      return;
    }

    // Check if we have base64 pass data
    if (result.passData) {
      // Convert base64 to blob and trigger download
      const byteCharacters = atob(result.passData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: result.mimeType || 'application/vnd.apple.pkpass' });

      // Create download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename || `sam-${data.bookingReference}.pkpass`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    // Check if we have a URL
    const passUrl = result.passUrl || result.url;
    if (passUrl) {
      if (passUrl.startsWith('http')) {
        window.location.href = passUrl;
      } else if (passUrl.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = passUrl;
        a.download = `sam-${data.bookingReference}.pkpass`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      return;
    }

    // Fallback
    await navigator.clipboard.writeText(data.bookingReference);
    alert(`Référence copiée: ${data.bookingReference}`);
  } catch (error) {
    console.error('Error adding to Apple Wallet:', error);
    alert('Impossible d\'ajouter à Apple Wallet. Veuillez réessayer.');
  }
};

/**
 * Handle Google Wallet button click
 * Opens Google Wallet save link or falls back to calendar
 */
export const handleAddToGoogleWallet = async (data: PassGenerationRequest): Promise<void> => {
  try {
    const result = await requestGoogleWalletPass(data);

    if (!result) {
      // Fallback: Copy booking reference to clipboard
      await navigator.clipboard.writeText(data.bookingReference);
      alert(`📋 Référence copiée: ${data.bookingReference}\n\nL'intégration Google Wallet sera bientôt disponible.`);
      return;
    }

    // Check if we have a direct wallet link
    const walletLink = result.walletLink || result.saveUrl || result.url;

    if (walletLink) {
      // Open Google Wallet save link in new tab
      window.open(walletLink, '_blank', 'noopener,noreferrer');
      return;
    }

    // Demo mode: use calendar fallback
    if (result.demo && result.calendarUrl) {
      // Open Google Calendar as fallback
      window.open(result.calendarUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Ultimate fallback: copy reference
    await navigator.clipboard.writeText(data.bookingReference);
    alert(`📋 Référence copiée: ${data.bookingReference}\n\n${result.message || 'L\'intégration Google Wallet sera bientôt disponible.'}`);
  } catch (error) {
    console.error('Error adding to Google Wallet:', error);
    alert('Impossible d\'ajouter à Google Wallet. Veuillez réessayer.');
  }
};
