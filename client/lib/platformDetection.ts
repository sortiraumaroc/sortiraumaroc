/**
 * Platform detection utility for wallet support
 * Detects the device platform (iOS, Android, Desktop)
 */

export type Platform = 'iOS' | 'Android' | 'Desktop';

/**
 * Detect the current platform
 */
export const detectPlatform = (): Platform => {
  if (typeof window === 'undefined') return 'Desktop';

  const userAgent = navigator.userAgent.toLowerCase();

  // Check for iOS (iPhone, iPad, iPod)
  if (
    /iphone|ipad|ipod/.test(userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  ) {
    return 'iOS';
  }

  // Check for Android
  if (/android/.test(userAgent)) {
    return 'Android';
  }

  // Default to Desktop
  return 'Desktop';
};

/**
 * Check if Apple Wallet is supported on this platform
 */
export const isAppleWalletSupported = (): boolean => {
  const platform = detectPlatform();
  return platform === 'iOS';
};

/**
 * Check if Google Wallet is supported on this platform
 */
export const isGoogleWalletSupported = (): boolean => {
  const platform = detectPlatform();
  return platform === 'Android' || platform === 'Desktop';
};

/**
 * Get the current platform for debugging
 */
export const getCurrentPlatform = (): Platform => {
  return detectPlatform();
};
