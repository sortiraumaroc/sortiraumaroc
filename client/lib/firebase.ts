/**
 * Firebase Configuration
 *
 * This module initializes Firebase for phone authentication on mobile.
 * Firebase Auth is used alongside Supabase for phone-based authentication.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  signInWithCredential,
  type Auth,
  type ConfirmationResult,
  type ApplicationVerifier,
} from "firebase/auth";

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}

// Initialize Firebase (singleton pattern)
let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;

  if (!firebaseApp) {
    const existingApps = getApps();
    firebaseApp = existingApps.length > 0 ? existingApps[0] : initializeApp(firebaseConfig);
  }

  return firebaseApp;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;

  if (!firebaseAuth) {
    firebaseAuth = getAuth(app);
    // Set language to French by default (Morocco)
    firebaseAuth.languageCode = "fr";
  }

  return firebaseAuth;
}

// RecaptchaVerifier instance (stored globally for reuse)
let recaptchaVerifier: RecaptchaVerifier | null = null;
let recaptchaContainerId: string | null = null;

/**
 * Initialize the reCAPTCHA verifier for phone authentication
 * @param containerId - The ID of the HTML element to render the reCAPTCHA
 * @param invisible - Whether to use invisible reCAPTCHA (default: true)
 */
export function initRecaptchaVerifier(
  containerId: string,
  invisible: boolean = true
): RecaptchaVerifier | null {
  const auth = getFirebaseAuth();
  if (!auth) return null;

  // Clean up existing verifier if container changed
  if (recaptchaVerifier && recaptchaContainerId !== containerId) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // Ignore cleanup errors
    }
    recaptchaVerifier = null;
  }

  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: invisible ? "invisible" : "normal",
      callback: () => {
        // reCAPTCHA solved - allow signInWithPhoneNumber
        console.log("[Firebase] reCAPTCHA verified");
      },
      "expired-callback": () => {
        // Reset reCAPTCHA if expired
        console.log("[Firebase] reCAPTCHA expired");
      },
    });
    recaptchaContainerId = containerId;
  }

  return recaptchaVerifier;
}

/**
 * Clear the reCAPTCHA verifier
 */
export function clearRecaptchaVerifier(): void {
  if (recaptchaVerifier) {
    try {
      recaptchaVerifier.clear();
    } catch {
      // Ignore cleanup errors
    }
    recaptchaVerifier = null;
    recaptchaContainerId = null;
  }
}

/**
 * Format phone number to E.164 format
 * Supports Moroccan phone numbers and international format
 */
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // If starts with 0, assume Moroccan number
  if (cleaned.startsWith("0")) {
    cleaned = "+212" + cleaned.slice(1);
  }

  // If doesn't start with +, assume Moroccan number without leading 0
  if (!cleaned.startsWith("+")) {
    // Check if it's a valid Moroccan number (6 or 7 followed by 8 digits)
    if (/^[67]\d{8}$/.test(cleaned)) {
      cleaned = "+212" + cleaned;
    } else {
      // Assume it's already in international format without +
      cleaned = "+" + cleaned;
    }
  }

  return cleaned;
}

/**
 * Validate phone number format
 */
export function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone);
  // E.164 format: + followed by 10-15 digits
  return /^\+\d{10,15}$/.test(formatted);
}

/**
 * Send SMS verification code
 * @returns ConfirmationResult to verify the code later
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  recaptchaContainerId: string = "recaptcha-container"
): Promise<ConfirmationResult> {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error("Firebase not configured");
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!isValidPhoneNumber(phoneNumber)) {
    throw new Error("Invalid phone number format");
  }

  // Initialize reCAPTCHA if not already done
  const verifier = initRecaptchaVerifier(recaptchaContainerId);
  if (!verifier) {
    throw new Error("Failed to initialize reCAPTCHA");
  }

  try {
    const confirmationResult = await signInWithPhoneNumber(auth, formattedPhone, verifier);
    return confirmationResult;
  } catch (error) {
    // Clear reCAPTCHA on error to allow retry
    clearRecaptchaVerifier();
    throw error;
  }
}

/**
 * Verify the SMS code and sign in
 * @returns The Firebase user credential
 */
export async function verifyPhoneCode(
  confirmationResult: ConfirmationResult,
  code: string
) {
  try {
    const credential = await confirmationResult.confirm(code);
    return credential;
  } catch (error) {
    throw error;
  }
}

/**
 * Get the Firebase ID token for the current user
 * This can be used to authenticate with your backend
 */
export async function getFirebaseIdToken(): Promise<string | null> {
  const auth = getFirebaseAuth();
  if (!auth || !auth.currentUser) return null;

  try {
    return await auth.currentUser.getIdToken();
  } catch {
    return null;
  }
}

/**
 * Sign out from Firebase
 */
export async function signOutFirebase(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) {
    await auth.signOut();
  }
  clearRecaptchaVerifier();
}

// Export types for external use
export type { ConfirmationResult, Auth };
