import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import prisma from "../lib/prisma";
import { sendPasswordResetEmail } from "../lib/email";
import { verifySupabaseToken } from "../lib/supabase";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "your-refresh-secret-key";
const JWT_EXPIRY = "1d";
const REFRESH_EXPIRY = "7d";

export const authRouter = Router();

// Types
interface AuthPayload {
  id: number;
  email: string;
  type: "admin" | "client";
}

interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthPayload & { name?: string };
}

// Helper: Generate JWT tokens
function generateTokens(payload: AuthPayload): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_EXPIRY });
  return { accessToken, refreshToken };
}

// ============ ADMIN AUTHENTICATION ============

function getAuthErrorResponse(error: unknown): { status: number; body: { error: string; code?: string } } {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Environment variable not found: DATABASE_URL")) {
    return {
      status: 500,
      body: {
        code: "DATABASE_URL_MISSING",
        error: "Configuration serveur manquante: DATABASE_URL (connexion MySQL).",
      },
    };
  }

  if (message.includes("Can't reach database server") || message.includes("Can't reach database")) {
    return {
      status: 503,
      body: {
        code: "DB_UNREACHABLE",
        error: "Base de données indisponible. Vérifiez que MySQL est démarré et que DATABASE_URL est correct.",
      },
    };
  }

  return { status: 500, body: { error: "Login failed" } };
}

// Admin Login
authRouter.post("/admin/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const admin = await prisma.admin.findFirst({
      where: { email },
    });

    if (!admin) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password using bcrypt
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last_login
    await prisma.admin.update({
      where: { adminId: admin.adminId },
      data: { lastLogin: new Date() },
    });

    const payload: AuthPayload = {
      id: admin.adminId,
      email: admin.email,
      type: "admin",
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Store refresh token
    await prisma.admin.update({
      where: { adminId: admin.adminId },
      data: { refreshToken },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: admin.adminId,
        email: admin.email,
        type: "admin",
        name: admin.username,
      },
    } as TokenResponse);
  } catch (error) {
    console.error("Admin login error:", error);
    const response = getAuthErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});

// Admin Logout
authRouter.post("/admin/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    const decoded = jwt.decode(token) as any;
    if (!decoded?.id) {
      return res.status(400).json({ error: "Invalid token" });
    }

    await prisma.admin.update({
      where: { adminId: decoded.id },
      data: { refreshToken: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Admin logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// ============ CLIENT AUTHENTICATION ============

// Client Login
authRouter.post("/client/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const client = await prisma.client.findFirst({
      where: { email },
    });

    if (!client) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Verify password using bcrypt
    // Verify password using bcrypt
    const hash = client.password?.startsWith("$2y$")
      ? client.password.replace("$2y$", "$2b$")
      : client.password;

    const isPasswordValid = await bcrypt.compare(password, hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Update last_login
    await prisma.client.update({
      where: { clientId: client.clientId },
      data: { lastLogin: new Date() },
    });

    const payload: AuthPayload = {
      id: client.clientId,
      email: client.email,
      type: "client",
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Store refresh token
    await prisma.client.update({
      where: { clientId: client.clientId },
      data: { refreshToken },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: client.clientId,
        email: client.email,
        type: "client",
        name: `${client.nom} ${client.prenom}`,
      },
    } as TokenResponse);
  } catch (error) {
    console.error("Client login error:", error);
    const response = getAuthErrorResponse(error);
    res.status(response.status).json(response.body);
  }
});

// Client Logout
authRouter.post("/client/logout", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    const decoded = jwt.decode(token) as any;
    if (!decoded?.id) {
      return res.status(400).json({ error: "Invalid token" });
    }

    await prisma.client.update({
      where: { clientId: decoded.id },
      data: { refreshToken: null },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Client logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
});

// ============ REFRESH TOKEN ============

// Refresh Access Token (works for both admin and client)
authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token is required" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const { id, email, type } = decoded;

    if (!id || !type) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Verify refresh token matches what's stored in DB
    if (type === "admin") {
      const admin = await prisma.admin.findUnique({
        where: { adminId: id },
      });

      if (!admin || admin.refreshToken !== refreshToken) {
        return res.status(401).json({ error: "Refresh token mismatch" });
      }

      const payload: AuthPayload = { id, email, type: "admin" };
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(payload);

      await prisma.admin.update({
        where: { adminId: id },
        data: { refreshToken: newRefreshToken },
      });

      res.json({
        accessToken,
        refreshToken: newRefreshToken,
        user: { id, email, type: "admin", name: admin.username },
      });
    } else if (type === "client") {
      const client = await prisma.client.findUnique({
        where: { clientId: id },
      });

      if (!client || client.refreshToken !== refreshToken) {
        return res.status(401).json({ error: "Refresh token mismatch" });
      }

      const payload: AuthPayload = { id, email, type: "client" };
      const { accessToken, refreshToken: newRefreshToken } = generateTokens(payload);

      await prisma.client.update({
        where: { clientId: id },
        data: { refreshToken: newRefreshToken },
      });

      res.json({
        accessToken,
        refreshToken: newRefreshToken,
        user: { id, email, type: "client", name: `${client.nom} ${client.prenom}` },
      });
    } else {
      return res.status(401).json({ error: "Invalid user type" });
    }
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Token refresh failed" });
  }
});

// ============ VERIFY TOKEN ============

// Verify JWT Token
authRouter.post("/verify", (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    res.json({ valid: true, user: decoded });
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    res.status(401).json({ error: "Invalid token" });
  }
});

// ============ CHANGE PASSWORD ============

// Admin Change Password
authRouter.post("/admin/change-password", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    const decoded = jwt.decode(token) as any;
    if (!decoded?.id || decoded.type !== "admin") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords are required" });
    }

    const admin = await prisma.admin.findUnique({
      where: { adminId: decoded.id },
    });

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, admin.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({ error: "Incorrect old password" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.admin.update({
      where: { adminId: decoded.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// Client Change Password
authRouter.post("/client/change-password", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(400).json({ error: "No token provided" });
    }

    const decoded = jwt.decode(token) as any;
    if (!decoded?.id || decoded.type !== "client") {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "Old and new passwords are required" });
    }

    const client = await prisma.client.findUnique({
      where: { clientId: decoded.id },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    // Verify old password
    const isOldPasswordValid = await bcrypt.compare(oldPassword, client.password);
    if (!isOldPasswordValid) {
      return res.status(401).json({ error: "Incorrect old password" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.client.update({
      where: { clientId: decoded.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

// ============ PASSWORD RESET FLOW ============

// Forgot Password - Send Reset Email
authRouter.post("/forgot-password", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const normalized = String(email).trim().toLowerCase();
    const client = await prisma.client.findFirst({
      where: { email: normalized },
    });

    // Don't reveal whether email exists to prevent user enumeration
    if (!client) {
      return res.status(500).json({ success: false });
    }

    // Generate a reset code and store in codeActivation field
    const resetCode = uuidv4();

    await prisma.client.update({
      where: { clientId: client.clientId },
      data: { codeActivation: resetCode },
    });

    // Send reset email
    const sent = await sendPasswordResetEmail(
      client.email,
      resetCode,
      client.company || "Sortir Au Maroc"
    );

    if (!sent) {
      console.warn("Failed to send reset email to", client.email);
      // Still return success to prevent user enumeration
      return res.json({ success: true });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to process forgot password" });
  }
});

// Reset Password - Validate Code and Update Password
authRouter.post("/reset-password", async (req: Request, res: Response) => {
  try {
    const { code, newPassword } = req.body;

    if (!code || !newPassword) {
      return res.status(400).json({ error: "Code and newPassword are required" });
    }

    if (typeof newPassword !== "string" || newPassword.length < 10) {
      return res.status(400).json({ error: "Password must be at least 10 characters" });
    }

    const client = await prisma.client.findFirst({
      where: { codeActivation: String(code) },
    });

    if (!client) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear the reset code
    await prisma.client.update({
      where: { clientId: client.clientId },
      data: {
        password: hashedPassword,
        codeActivation: "", // Clear code after use
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ============ SSO WITH SORTIR AU MAROC ============

/**
 * SSO Login - Authenticate using Supabase token from SAM
 *
 * This endpoint allows pro users from SAM to login to menu_sam
 * using their existing Supabase session.
 */
authRouter.post("/sso/login", async (req: Request, res: Response) => {
  try {
    const { supabaseToken } = req.body;

    if (!supabaseToken) {
      return res.status(400).json({ error: "Supabase token is required" });
    }

    // Verify the Supabase token
    const supabaseUser = await verifySupabaseToken(supabaseToken);
    if (!supabaseUser) {
      return res.status(401).json({ error: "Invalid or expired Supabase token" });
    }

    // Find client by Supabase user ID or email
    let client = await prisma.client.findFirst({
      where: {
        OR: [
          { supabaseUserId: supabaseUser.userId },
          { email: supabaseUser.email },
        ],
      },
      include: {
        places: {
          take: 1,
          include: {
            subscriptions: {
              where: { status: "active" },
              orderBy: { expiresAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!client) {
      // Client doesn't exist - they need to purchase a subscription first
      return res.status(404).json({
        error: "no_subscription",
        message: "Vous n'avez pas encore d'abonnement Menu Digital. Veuillez souscrire depuis votre Espace Pro sur Sortir Au Maroc.",
      });
    }

    // Update supabaseUserId if not set (first SSO login)
    if (!client.supabaseUserId) {
      await prisma.client.update({
        where: { clientId: client.clientId },
        data: { supabaseUserId: supabaseUser.userId },
      });
    }

    // Check if client has an active subscription
    const place = client.places[0];
    const subscription = place?.subscriptions?.[0];

    if (!subscription) {
      return res.status(403).json({
        error: "subscription_expired",
        message: "Votre abonnement Menu Digital a expiré. Veuillez le renouveler depuis votre Espace Pro.",
      });
    }

    // Check if subscription is expired
    if (new Date(subscription.expiresAt) < new Date()) {
      // Mark subscription as expired
      await prisma.menuDigitalSubscription.update({
        where: { id: subscription.id },
        data: { status: "expired" },
      });

      return res.status(403).json({
        error: "subscription_expired",
        message: "Votre abonnement Menu Digital a expiré. Veuillez le renouveler depuis votre Espace Pro.",
        canView: true, // They can still view but not edit
      });
    }

    // Update last login
    await prisma.client.update({
      where: { clientId: client.clientId },
      data: { lastLogin: new Date() },
    });

    // Generate menu_sam JWT tokens
    const payload: AuthPayload = {
      id: client.clientId,
      email: client.email,
      type: "client",
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    // Store refresh token
    await prisma.client.update({
      where: { clientId: client.clientId },
      data: { refreshToken },
    });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: client.clientId,
        email: client.email,
        type: "client",
        name: client.company || `${client.nom} ${client.prenom}`,
      },
      place: place ? {
        id: place.placeId,
        name: place.name,
        slug: place.slug,
        menuUrl: place.slug ? `https://menu.sam.ma/${place.slug}` : null,
      } : null,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        features: {
          canManageMenu: subscription.canManageMenu,
          canManageTables: subscription.canManageTables,
          canReceiveCalls: subscription.canReceiveCalls,
          canViewReviews: subscription.canViewReviews,
          canManageOrders: subscription.canManageOrders,
          canManagePayments: subscription.canManagePayments,
          canManagePromos: subscription.canManagePromos,
          canAccessAdvanced: subscription.canAccessAdvanced,
        },
      },
    });
  } catch (error) {
    console.error("SSO login error:", error);
    res.status(500).json({ error: "SSO login failed" });
  }
});

/**
 * Get current subscription status
 */
authRouter.get("/subscription/status", async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }

    if (decoded.type !== "client") {
      return res.status(403).json({ error: "Not a client" });
    }

    const client = await prisma.client.findUnique({
      where: { clientId: decoded.id },
      include: {
        places: {
          take: 1,
          include: {
            subscriptions: {
              where: { status: "active" },
              orderBy: { expiresAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const place = client.places[0];
    const subscription = place?.subscriptions?.[0];

    // Check expiration
    const isExpired = subscription
      ? new Date(subscription.expiresAt) < new Date()
      : true;

    if (subscription && isExpired && subscription.status === "active") {
      // Mark as expired
      await prisma.menuDigitalSubscription.update({
        where: { id: subscription.id },
        data: { status: "expired" },
      });
    }

    res.json({
      hasSubscription: !!subscription,
      isExpired,
      subscription: subscription ? {
        plan: subscription.plan,
        status: isExpired ? "expired" : subscription.status,
        expiresAt: subscription.expiresAt,
        features: {
          canManageMenu: !isExpired && subscription.canManageMenu,
          canManageTables: !isExpired && subscription.canManageTables,
          canReceiveCalls: !isExpired && subscription.canReceiveCalls,
          canViewReviews: subscription.canViewReviews, // Always allow viewing
          canManageOrders: !isExpired && subscription.canManageOrders,
          canManagePayments: !isExpired && subscription.canManagePayments,
          canManagePromos: !isExpired && subscription.canManagePromos,
          canAccessAdvanced: !isExpired && subscription.canAccessAdvanced,
        },
      } : null,
    });
  } catch (error) {
    console.error("Subscription status error:", error);
    res.status(500).json({ error: "Failed to get subscription status" });
  }
});
