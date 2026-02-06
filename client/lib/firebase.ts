/**
 * Firebase Configuration
 *
 * This module initializes Firebase for phone authentication on mobile.
 * Firebase Auth is used alongside Supabase for phone-based authentication.
 *
 * IMPORTANT: Uses REST API approach for sendVerificationCode to bypass
 * the RecaptchaVerifier SDK bug with Identity Platform on localhost.
 * The Firebase SDK's RecaptchaVerifier.render() hangs indefinitely when
 * reCAPTCHA Enterprise is enabled (even in AUDIT mode).
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  PhoneAuthProvider,
  signInWithCredential,
  type Auth,
  type ConfirmationResult,
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

// reCAPTCHA v2 site key from environment
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || "";

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

// ─────────────────────────────────────────────────────────────────────────────
// Manual reCAPTCHA v2 (bypasses Firebase SDK's broken RecaptchaVerifier)
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    grecaptcha?: {
      render: (container: string | HTMLElement, params: Record<string, unknown>) => number;
      execute: (widgetId: number) => void;
      reset: (widgetId: number) => void;
      getResponse: (widgetId: number) => string;
      ready: (cb: () => void) => void;
    };
    __recaptchaCallback?: (token: string) => void;
    __recaptchaExpiredCallback?: () => void;
  }
}

let recaptchaScriptLoaded = false;
let recaptchaWidgetId: number | null = null;
let recaptchaWidgetContainerId: string | null = null;

/** Lock to prevent concurrent sendPhoneVerificationCode calls */
let sendCodeInProgress = false;

/**
 * Load the reCAPTCHA v2 script manually.
 * This works on localhost (we proved it), unlike the Firebase SDK's internal loader.
 */
let loadScriptPromise: Promise<void> | null = null;

function loadRecaptchaScript(): Promise<void> {
  if (recaptchaScriptLoaded && window.grecaptcha) {
    return Promise.resolve();
  }

  // Deduplicate concurrent calls
  if (loadScriptPromise) return loadScriptPromise;

  loadScriptPromise = new Promise((resolve, reject) => {
    // Check if already loaded by someone else
    if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
      recaptchaScriptLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
    script.async = true;
    script.defer = true;

    script.onload = () => {
      console.log("[Firebase] reCAPTCHA v2 script loaded manually");
      recaptchaScriptLoaded = true;
      // Wait for grecaptcha to be ready
      const checkReady = () => {
        if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    };

    script.onerror = () => {
      loadScriptPromise = null;
      reject(new Error("Failed to load reCAPTCHA script"));
    };

    document.head.appendChild(script);
  });

  return loadScriptPromise;
}

/**
 * Render the reCAPTCHA v2 checkbox widget in the given container.
 * Returns a promise that resolves with the token when the user checks the box.
 *
 * IMPORTANT: Only renders once per container. If the widget is already rendered,
 * it returns a promise that resolves when the user (re-)checks the box.
 */

/** Store the resolve/reject callbacks so we can re-wire them on subsequent calls */
let recaptchaResolve: ((token: string) => void) | null = null;
let recaptchaReject: ((err: Error) => void) | null = null;
let recaptchaTimeoutId: ReturnType<typeof setTimeout> | null = null;

async function getRecaptchaToken(containerId: string): Promise<string> {
  await loadRecaptchaScript();

  const grecaptcha = window.grecaptcha;
  if (!grecaptcha) {
    throw new Error("grecaptcha not available after loading script");
  }

  // If widget already exists, check for existing token first
  if (recaptchaWidgetId !== null && recaptchaWidgetContainerId === containerId) {
    const existingToken = grecaptcha.getResponse(recaptchaWidgetId);
    if (existingToken) {
      console.log("[Firebase] reCAPTCHA already has a valid token, reusing it");
      return existingToken;
    }

    // Widget exists but no token yet — return a new promise that will
    // resolve when the user checks the box (via the global callbacks)
    console.log("[Firebase] reCAPTCHA widget already rendered, waiting for user to check the box...");
    return new Promise<string>((resolve, reject) => {
      // Clear previous timeout if any
      if (recaptchaTimeoutId) clearTimeout(recaptchaTimeoutId);

      recaptchaResolve = resolve;
      recaptchaReject = reject;
      recaptchaTimeoutId = setTimeout(() => {
        reject(new Error("reCAPTCHA timeout (120s) — veuillez cocher la case reCAPTCHA"));
      }, 120_000);
    });
  }

  // No widget yet — render a fresh one
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`reCAPTCHA container '${containerId}' not found in DOM`);
  }

  // Clear container in case of leftover HTML
  container.innerHTML = "";

  return new Promise<string>((resolve, reject) => {
    recaptchaTimeoutId = setTimeout(() => {
      reject(new Error("reCAPTCHA timeout (120s) — veuillez cocher la case reCAPTCHA"));
    }, 120_000);

    recaptchaResolve = resolve;
    recaptchaReject = reject;

    const onSuccess = (token: string) => {
      if (recaptchaTimeoutId) clearTimeout(recaptchaTimeoutId);
      console.log("[Firebase] reCAPTCHA v2 token obtained (length:", token.length, ")");
      if (recaptchaResolve) recaptchaResolve(token);
    };

    const onExpired = () => {
      if (recaptchaTimeoutId) clearTimeout(recaptchaTimeoutId);
      if (recaptchaReject) recaptchaReject(new Error("reCAPTCHA token expired — veuillez réessayer"));
    };

    try {
      recaptchaWidgetId = grecaptcha.render(containerId, {
        sitekey: RECAPTCHA_SITE_KEY,
        size: "normal",
        callback: onSuccess,
        "expired-callback": onExpired,
      });
      recaptchaWidgetContainerId = containerId;

      console.log("[Firebase] reCAPTCHA checkbox widget rendered, id:", recaptchaWidgetId, "— waiting for user...");
    } catch (err) {
      if (recaptchaTimeoutId) clearTimeout(recaptchaTimeoutId);
      console.error("[Firebase] reCAPTCHA render error:", err);
      reject(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// REST API approach for sendVerificationCode
// ─────────────────────────────────────────────────────────────────────────────

/** Session info returned by the REST API, used to verify the code later */
let currentSessionInfo: string | null = null;

/**
 * Pre-render the reCAPTCHA checkbox widget in the given container.
 * Call this on component mount so the user can check the box before clicking "Send".
 * Returns a promise that resolves when the user completes the reCAPTCHA.
 */
let preRenderPromise: Promise<string> | null = null;

export async function preRenderRecaptcha(containerId: string): Promise<void> {
  // If already pre-rendering, don't start again (React Strict Mode guard)
  if (preRenderPromise) {
    console.log("[Firebase] preRenderRecaptcha: already in progress, skipping duplicate call");
    return;
  }

  // Start loading the script and rendering the widget
  // Store the promise so sendPhoneVerificationCode can await it
  preRenderPromise = getRecaptchaToken(containerId);
  // Don't await — let it render in the background. The user will check it.
  preRenderPromise.catch(() => {
    // Silently ignore — will be retried when sending
    preRenderPromise = null;
  });
}

/**
 * Send SMS verification code using the Identity Platform REST API directly.
 * This bypasses the Firebase SDK's broken RecaptchaVerifier entirely.
 *
 * Flow:
 * 1. Get reCAPTCHA v2 token (user must have checked the checkbox)
 * 2. Call POST identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode
 * 3. Return ConfirmationResult for code verification
 */
export async function sendPhoneVerificationCode(
  phoneNumber: string,
  containerId: string = "recaptcha-container"
): Promise<ConfirmationResult> {
  // Prevent concurrent calls (React Strict Mode double-fires)
  if (sendCodeInProgress) {
    console.warn("[Firebase] sendPhoneVerificationCode already in progress, ignoring duplicate call");
    return new Promise(() => {}); // Never resolves — the first call will handle it
  }
  sendCodeInProgress = true;

  const auth = getFirebaseAuth();
  if (!auth) {
    sendCodeInProgress = false;
    throw new Error("Firebase not configured");
  }

  const formattedPhone = formatPhoneNumber(phoneNumber);
  if (!isValidPhoneNumber(phoneNumber)) {
    sendCodeInProgress = false;
    throw new Error("Invalid phone number format");
  }

  console.log("[Firebase] Sending SMS to:", formattedPhone, "(REST API approach)");

  try {
    // Step 1: Get the reCAPTCHA token (user should have already checked the box)
    console.log("[Firebase] Step 1: Getting reCAPTCHA v2 token...");
    let recaptchaToken: string;

    // Check if we already have a token from the pre-rendered widget
    if (window.grecaptcha && recaptchaWidgetId !== null) {
      const existingToken = window.grecaptcha.getResponse(recaptchaWidgetId);
      if (existingToken) {
        console.log("[Firebase] Using existing reCAPTCHA token from checkbox");
        recaptchaToken = existingToken;
      } else if (preRenderPromise) {
        console.log("[Firebase] Waiting for user to complete reCAPTCHA checkbox...");
        recaptchaToken = await preRenderPromise;
      } else {
        recaptchaToken = await getRecaptchaToken(containerId);
      }
    } else if (preRenderPromise) {
      console.log("[Firebase] Waiting for pre-rendered reCAPTCHA...");
      recaptchaToken = await preRenderPromise;
    } else {
      recaptchaToken = await getRecaptchaToken(containerId);
    }

    // Step 2: Call the REST API
    console.log("[Firebase] Step 2: Calling sendVerificationCode REST API...");
    const apiKey = firebaseConfig.apiKey;
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Firebase-Locale": "fr",
      },
      body: JSON.stringify({
        phoneNumber: formattedPhone,
        recaptchaToken: recaptchaToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[Firebase] sendVerificationCode API error:", errorData);

      const errorMessage = errorData?.error?.message || response.statusText;

      if (errorMessage.includes("TOO_MANY_ATTEMPTS")) {
        throw { code: "auth/too-many-requests", message: "Trop de tentatives. Réessayez plus tard." };
      } else if (errorMessage.includes("INVALID_PHONE_NUMBER")) {
        throw { code: "auth/invalid-phone-number", message: "Numéro de téléphone invalide." };
      } else if (errorMessage.includes("CAPTCHA_CHECK_FAILED") || errorMessage.includes("RECAPTCHA")) {
        throw { code: "auth/captcha-check-failed", message: "Vérification reCAPTCHA échouée. Rechargez la page." };
      } else if (errorMessage.includes("BLOCKING_FUNCTION_ERROR")) {
        throw { code: "auth/blocking-function-error", message: errorMessage };
      } else {
        throw { code: "auth/unknown", message: `Erreur API: ${errorMessage}` };
      }
    }

    const data = await response.json();
    currentSessionInfo = data.sessionInfo;

    console.log("[Firebase] SMS sent successfully! sessionInfo obtained.");

    // Step 3: Return a ConfirmationResult-like object
    // that uses PhoneAuthProvider.credential + signInWithCredential
    const confirmationResult: ConfirmationResult = {
      verificationId: data.sessionInfo,
      confirm: async (verificationCode: string) => {
        console.log("[Firebase] Verifying code with PhoneAuthProvider.credential...");
        const credential = PhoneAuthProvider.credential(data.sessionInfo, verificationCode);
        const userCredential = await signInWithCredential(auth, credential);
        console.log("[Firebase] Phone auth sign-in successful!");
        return userCredential;
      },
    };

    return confirmationResult;
  } finally {
    sendCodeInProgress = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phone number utilities
// ─────────────────────────────────────────────────────────────────────────────

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
  // Clean up reCAPTCHA widget
  if (window.grecaptcha && recaptchaWidgetId !== null) {
    try {
      window.grecaptcha.reset(recaptchaWidgetId);
    } catch {
      // Ignore cleanup errors
    }
  }
  recaptchaWidgetId = null;
  currentSessionInfo = null;
}

/**
 * Clear the reCAPTCHA verifier (kept for backward compatibility)
 */
export function clearRecaptchaVerifier(): void {
  if (window.grecaptcha && recaptchaWidgetId !== null) {
    try {
      window.grecaptcha.reset(recaptchaWidgetId);
    } catch {
      // Ignore cleanup errors
    }
  }
  recaptchaWidgetId = null;
}

// Export types for external use
export type { ConfirmationResult, Auth };
