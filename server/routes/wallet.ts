/**
 * Wallet Routes
 * Handles Apple Wallet (.pkpass) and Google Wallet integration
 */

import type { Request, Response } from "express";
import { PKPass } from "passkit-generator";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

interface WalletPassRequest {
  bookingReference: string;
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  guestName: string;
  guestPhone: string;
  qrCodeUrl?: string;
  establishmentId?: string;
  address?: string;
}

// Cache for Apple WWDR certificate
let wwdrCertificate: Buffer | null = null;

/**
 * Get Apple WWDR (Worldwide Developer Relations) certificate
 * This is required to sign Apple Wallet passes
 */
async function getWWDRCertificate(): Promise<Buffer> {
  if (wwdrCertificate) {
    return wwdrCertificate;
  }

  // Try to load from local file first
  const localPath = process.env.APPLE_WALLET_WWDR_PATH;
  if (localPath && fs.existsSync(localPath)) {
    wwdrCertificate = fs.readFileSync(localPath);
    return wwdrCertificate;
  }

  // Download from Apple if not cached
  // Apple WWDR G4 certificate URL
  const wwdrUrl = "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer";

  try {
    const response = await fetch(wwdrUrl);
    if (!response.ok) {
      throw new Error(`Failed to download WWDR certificate: ${response.status}`);
    }
    wwdrCertificate = Buffer.from(await response.arrayBuffer());
    return wwdrCertificate;
  } catch (error) {
    console.error("[wallet] Failed to get WWDR certificate:", error);
    throw new Error("Could not obtain Apple WWDR certificate");
  }
}

/**
 * Generate Apple Wallet pass (.pkpass)
 * POST /api/wallet/apple
 */
export async function createAppleWalletPass(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const data = req.body as WalletPassRequest;

    if (!data.bookingReference || !data.restaurantName) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Check if Apple Wallet credentials are configured
    const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID;
    const teamId = process.env.APPLE_WALLET_TEAM_ID;
    const certPath = process.env.APPLE_WALLET_CERT_PATH;
    const certPassword = process.env.APPLE_WALLET_CERT_PASSWORD || "";

    if (!passTypeId || !teamId || !certPath) {
      console.log("[wallet] Apple Wallet credentials not configured, using demo mode");

      res.json({
        success: true,
        demo: true,
        message: "Apple Wallet integration en mode démo",
        setupInstructions: {
          step1: "Obtenir un compte Apple Developer",
          step2: "Créer un Pass Type ID (ex: pass.ma.sambooking.reservation)",
          step3: "Générer et exporter le certificat en .p12",
          step4: "Définir les variables d'environnement:",
          variables: [
            "APPLE_WALLET_PASS_TYPE_ID=pass.ma.sambooking.reservation",
            "APPLE_WALLET_TEAM_ID=VOTRE_TEAM_ID",
            "APPLE_WALLET_CERT_PATH=/chemin/vers/certificat.p12",
            "APPLE_WALLET_CERT_PASSWORD=mot_de_passe",
          ],
        },
      });
      return;
    }

    // Verify certificate file exists
    if (!fs.existsSync(certPath)) {
      console.error(`[wallet] Certificate file not found: ${certPath}`);
      res.status(500).json({ error: "Certificate configuration error" });
      return;
    }

    try {
      // Load certificates
      const signerCert = fs.readFileSync(certPath);
      const wwdrCert = await getWWDRCertificate();

      // Format date for display
      const formattedDate = formatDateFr(data.date);
      const formattedTime = data.time || "12:00";

      // Create the pass
      const pass = new PKPass(
        {},
        {
          wwdr: wwdrCert,
          signerCert: signerCert,
          signerKey: signerCert,
          signerKeyPassphrase: certPassword,
        },
        {
          formatVersion: 1,
          passTypeIdentifier: passTypeId,
          teamIdentifier: teamId,
          organizationName: "Sortir Au Maroc",
          description: `Réservation ${data.restaurantName}`,
          serialNumber: `SB-${data.bookingReference}-${Date.now()}`,
          backgroundColor: "rgb(163, 0, 29)",
          foregroundColor: "rgb(255, 255, 255)",
          labelColor: "rgb(255, 200, 200)",
          logoText: "Sortir Au Maroc",
        }
      );

      // Set pass type to generic
      pass.type = "generic";

      // Add primary fields
      pass.primaryFields.push({
        key: "restaurant",
        label: "RESTAURANT",
        value: data.restaurantName,
      });

      // Add secondary fields
      pass.secondaryFields.push(
        {
          key: "date",
          label: "DATE",
          value: formattedDate,
        },
        {
          key: "time",
          label: "HEURE",
          value: formattedTime,
        }
      );

      // Add auxiliary fields
      pass.auxiliaryFields.push(
        {
          key: "guests",
          label: "PERSONNES",
          value: String(data.partySize || 1),
        },
        {
          key: "reference",
          label: "RÉFÉRENCE",
          value: data.bookingReference,
        }
      );

      // Add back fields (visible when user taps "more info")
      pass.backFields.push(
        {
          key: "guestName",
          label: "Nom du client",
          value: data.guestName || "Non spécifié",
        },
        {
          key: "guestPhone",
          label: "Téléphone",
          value: data.guestPhone || "Non spécifié",
        },
        {
          key: "address",
          label: "Adresse",
          value: data.address || "Voir sur Sortir Au Maroc",
        },
        {
          key: "terms",
          label: "Conditions",
          value: "Merci d'arriver 10 minutes avant l'heure de votre réservation. En cas d'annulation, veuillez nous prévenir au moins 2 heures à l'avance.",
        },
        {
          key: "website",
          label: "Site web",
          value: "https://sortiraumaroc.ma",
        }
      );

      // Add QR code barcode
      pass.setBarcodes({
        format: "PKBarcodeFormatQR",
        message: data.bookingReference,
        messageEncoding: "iso-8859-1",
        altText: data.bookingReference,
      });

      // Add relevance (location-based notification if address available)
      if (data.address) {
        // Could add location-based relevance here if we have coordinates
      }

      // Add images (logo, icon)
      // These should be added as buffers
      const assetsPath = path.join(__dirname, "..", "wallet-assets");

      // Try to load custom images, fall back to generated ones
      try {
        if (fs.existsSync(path.join(assetsPath, "icon.png"))) {
          pass.addBuffer("icon.png", fs.readFileSync(path.join(assetsPath, "icon.png")));
        }
        if (fs.existsSync(path.join(assetsPath, "icon@2x.png"))) {
          pass.addBuffer("icon@2x.png", fs.readFileSync(path.join(assetsPath, "icon@2x.png")));
        }
        if (fs.existsSync(path.join(assetsPath, "logo.png"))) {
          pass.addBuffer("logo.png", fs.readFileSync(path.join(assetsPath, "logo.png")));
        }
        if (fs.existsSync(path.join(assetsPath, "logo@2x.png"))) {
          pass.addBuffer("logo@2x.png", fs.readFileSync(path.join(assetsPath, "logo@2x.png")));
        }
      } catch (imgError) {
        console.warn("[wallet] Could not load custom images:", imgError);
        // Pass will work without images, just won't have custom branding
      }

      // Generate the pass
      const passBuffer = pass.getAsBuffer();

      // Return as base64 for client to download
      const base64Pass = passBuffer.toString("base64");

      res.json({
        success: true,
        passData: base64Pass,
        mimeType: "application/vnd.apple.pkpass",
        filename: `sambooking-${data.bookingReference}.pkpass`,
      });

    } catch (signError) {
      console.error("[wallet] Error generating Apple Wallet pass:", signError);

      // Provide helpful error message
      const errorMessage = signError instanceof Error ? signError.message : "Unknown error";

      if (errorMessage.includes("password") || errorMessage.includes("decrypt")) {
        res.status(500).json({
          error: "Certificate password incorrect",
          hint: "Vérifiez APPLE_WALLET_CERT_PASSWORD"
        });
      } else if (errorMessage.includes("certificate") || errorMessage.includes("PKCS")) {
        res.status(500).json({
          error: "Invalid certificate format",
          hint: "Le certificat doit être au format .p12"
        });
      } else {
        res.status(500).json({ error: "Failed to generate wallet pass" });
      }
    }
  } catch (error) {
    console.error("[wallet] Error creating Apple Wallet pass:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Serve Apple Wallet pass as download
 * GET /api/wallet/apple/download/:token
 */
export async function downloadAppleWalletPass(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { token } = req.params;

    // In a real implementation, you would:
    // 1. Validate the token
    // 2. Retrieve pass data from cache/database
    // 3. Return the .pkpass file

    res.status(404).json({ error: "Pass not found" });
  } catch (error) {
    console.error("[wallet] Error downloading pass:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Generate Google Wallet pass
 * POST /api/wallet/google
 */
export async function createGoogleWalletPass(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const data = req.body as WalletPassRequest;

    if (!data.bookingReference || !data.restaurantName) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    // Format date and time for display
    const formattedDate = formatDateFr(data.date);
    const formattedTime = data.time || "12:00";

    // Google Wallet Generic Pass object
    const passObject = {
      id: `sambooking.reservation.${data.bookingReference}`,
      classId: `sam.reservation_class`,
      genericType: "GENERIC_TYPE_UNSPECIFIED",
      hexBackgroundColor: "#a3001d",
      logo: {
        sourceUri: {
          uri: "https://sortiraumaroc.ma/logo-white.png",
        },
      },
      cardTitle: {
        defaultValue: {
          language: "fr",
          value: "Sortir Au Maroc",
        },
      },
      subheader: {
        defaultValue: {
          language: "fr",
          value: "Réservation confirmée",
        },
      },
      header: {
        defaultValue: {
          language: "fr",
          value: data.restaurantName,
        },
      },
      textModulesData: [
        {
          id: "date",
          header: "Date",
          body: formattedDate,
        },
        {
          id: "time",
          header: "Heure",
          body: formattedTime,
        },
        {
          id: "guests",
          header: "Personnes",
          body: String(data.partySize || 1),
        },
        {
          id: "reference",
          header: "Référence",
          body: data.bookingReference,
        },
      ],
      barcode: {
        type: "QR_CODE",
        value: data.bookingReference,
        alternateText: data.bookingReference,
      },
    };

    // Check if Google Wallet credentials are configured
    const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    let serviceAccountKey = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY;

    // Try to load service account key from file if not in env
    if (!serviceAccountKey) {
      const keyFilePath = process.env.GOOGLE_WALLET_KEY_PATH || path.join(__dirname, "..", "certs", "google-wallet-key.json");
      if (fs.existsSync(keyFilePath)) {
        try {
          serviceAccountKey = fs.readFileSync(keyFilePath, "utf-8");
          console.log("[wallet] Loaded Google Wallet service account key from file");
        } catch (e) {
          console.warn("[wallet] Could not read Google Wallet key file:", e);
        }
      }
    }

    if (!issuerId || !serviceAccountKey) {
      console.log("[wallet] Google Wallet credentials not configured, using demo mode");

      // Create a demo "Add to Calendar" link as fallback
      const calendarUrl = createCalendarUrl(data);

      res.json({
        success: true,
        demo: true,
        message: "Google Wallet integration en mode démo",
        calendarUrl,
        passData: passObject,
        setupInstructions: {
          step1: "Créer un projet Google Cloud",
          step2: "Activer l'API Google Wallet",
          step3: "Créer un compte de service avec les permissions Wallet Issuer",
          step4: "Définir GOOGLE_WALLET_ISSUER_ID et GOOGLE_WALLET_SERVICE_ACCOUNT_KEY",
        },
      });
      return;
    }

    // Production mode: Generate signed JWT and return save URL
    try {
      const saveUrl = await generateGoogleWalletSaveUrl(
        issuerId,
        serviceAccountKey,
        passObject,
      );

      res.json({
        success: true,
        saveUrl,
        walletLink: saveUrl,
        url: saveUrl,
      });
    } catch (signError) {
      console.error("[wallet] Error signing Google Wallet pass:", signError);

      // Fallback to calendar
      const calendarUrl = createCalendarUrl(data);
      res.json({
        success: true,
        demo: true,
        calendarUrl,
        message: "Erreur de signature, utilisation du calendrier",
      });
    }
  } catch (error) {
    console.error("[wallet] Error creating Google Wallet pass:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Format ISO date string to French readable format
 */
function formatDateFr(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Create Google Calendar URL as fallback
 */
function createCalendarUrl(data: WalletPassRequest): string {
  const startDate = new Date(data.date);
  if (data.time) {
    const [hours, minutes] = data.time.split(":");
    startDate.setHours(parseInt(hours, 10), parseInt(minutes || "0", 10));
  }

  const endDate = new Date(startDate);
  endDate.setHours(endDate.getHours() + 2);

  const formatGoogleDate = (d: Date): string =>
    d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Réservation - ${data.restaurantName}`,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
    details: `Réservation pour ${data.partySize} personne(s)\nRéférence: ${data.bookingReference}\n\nRéservé sur Sortir Au Maroc`,
    location: data.address || data.restaurantName,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Google Wallet save URL with signed JWT
 */
async function generateGoogleWalletSaveUrl(
  issuerId: string,
  serviceAccountKeyJson: string,
  passObject: Record<string, unknown>,
): Promise<string> {
  try {
    // Parse service account key
    const serviceAccount = JSON.parse(serviceAccountKeyJson);

    // Create JWT header
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    // Create JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: serviceAccount.client_email,
      aud: "google",
      typ: "savetowallet",
      iat: now,
      origins: ["https://sortiraumaroc.ma"],
      payload: {
        genericObjects: [
          {
            ...passObject,
            id: `${issuerId}.${passObject.id}`,
            classId: `${issuerId}.${passObject.classId}`,
          },
        ],
      },
    };

    // Sign JWT
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signatureInput = `${encodedHeader}.${encodedPayload}`;

    const sign = crypto.createSign("RSA-SHA256");
    sign.update(signatureInput);
    const signature = sign.sign(serviceAccount.private_key, "base64url");

    const jwt = `${signatureInput}.${signature}`;

    // Return Google Wallet save URL
    return `https://pay.google.com/gp/v/save/${jwt}`;
  } catch (error) {
    console.error("[wallet] Error generating Google Wallet JWT:", error);
    throw error;
  }
}
