/**
 * Subscription Management
 *
 * Utilities for checking subscription status and feature access
 * based on Silver/Premium plan levels.
 */

import { prisma } from "./prisma";

export type SubscriptionFeature =
  | "canManageMenu"
  | "canManageTables"
  | "canReceiveCalls"
  | "canViewReviews"
  | "canManageOrders"
  | "canManagePayments"
  | "canManagePromos"
  | "canAccessAdvanced";

export type SubscriptionStatus = {
  isActive: boolean;
  isExpired: boolean;
  plan: "silver" | "premium" | null;
  expiresAt: Date | null;
  daysRemaining: number | null;
  features: {
    canManageMenu: boolean;
    canManageTables: boolean;
    canReceiveCalls: boolean;
    canViewReviews: boolean;
    canManageOrders: boolean;
    canManagePayments: boolean;
    canManagePromos: boolean;
    canAccessAdvanced: boolean;
  };
  readOnly: boolean; // True if subscription expired (menu visible but not editable)
};

const DEFAULT_FEATURES = {
  canManageMenu: false,
  canManageTables: false,
  canReceiveCalls: false,
  canViewReviews: false,
  canManageOrders: false,
  canManagePayments: false,
  canManagePromos: false,
  canAccessAdvanced: false,
};

const EXPIRED_FEATURES = {
  // Expired subscription = read-only access to basic features
  canManageMenu: false,  // Can't edit menu
  canManageTables: false,  // Can't manage tables
  canReceiveCalls: false,  // Calls still work for customer experience
  canViewReviews: true,  // Can still view reviews
  canManageOrders: false,
  canManagePayments: false,
  canManagePromos: false,
  canAccessAdvanced: false,
};

/**
 * Get subscription status for a place
 */
export async function getSubscriptionStatus(placeId: number): Promise<SubscriptionStatus> {
  const subscription = await prisma.menuDigitalSubscription.findFirst({
    where: {
      placeId,
      status: "active",
    },
    orderBy: {
      expiresAt: "desc",
    },
  });

  if (!subscription) {
    return {
      isActive: false,
      isExpired: false,
      plan: null,
      expiresAt: null,
      daysRemaining: null,
      features: DEFAULT_FEATURES,
      readOnly: true,
    };
  }

  const now = new Date();
  const isExpired = subscription.expiresAt < now;
  const daysRemaining = Math.ceil(
    (subscription.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (isExpired) {
    // Update status to expired if not already
    if (subscription.status !== "expired") {
      await prisma.menuDigitalSubscription.update({
        where: { id: subscription.id },
        data: { status: "expired" },
      });
    }

    return {
      isActive: false,
      isExpired: true,
      plan: subscription.plan as "silver" | "premium",
      expiresAt: subscription.expiresAt,
      daysRemaining: daysRemaining,
      features: EXPIRED_FEATURES,
      readOnly: true,
    };
  }

  return {
    isActive: true,
    isExpired: false,
    plan: subscription.plan as "silver" | "premium",
    expiresAt: subscription.expiresAt,
    daysRemaining,
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
    readOnly: false,
  };
}

/**
 * Get subscription status by client
 */
export async function getClientSubscriptionStatus(clientId: number): Promise<SubscriptionStatus | null> {
  // Get the first place for this client
  const place = await prisma.place.findFirst({
    where: { clientId },
  });

  if (!place) {
    return null;
  }

  return getSubscriptionStatus(place.placeId);
}

/**
 * Check if a specific feature is enabled for a place
 */
export async function hasFeature(placeId: number, feature: SubscriptionFeature): Promise<boolean> {
  const status = await getSubscriptionStatus(placeId);
  return status.features[feature];
}

/**
 * Check if subscription allows orders (Premium only)
 */
export async function canPlaceOrders(placeId: number): Promise<boolean> {
  const status = await getSubscriptionStatus(placeId);
  return status.isActive && status.features.canManageOrders;
}

/**
 * Check if subscription is approaching expiration (within 7 days)
 */
export async function isExpirationWarning(placeId: number): Promise<boolean> {
  const status = await getSubscriptionStatus(placeId);
  return status.isActive && status.daysRemaining !== null && status.daysRemaining <= 7;
}

/**
 * Get subscription info for display
 */
export async function getSubscriptionDisplayInfo(placeId: number) {
  const status = await getSubscriptionStatus(placeId);

  return {
    plan: status.plan,
    planLabel: status.plan === "premium" ? "Premium" : status.plan === "silver" ? "Silver" : "Aucun",
    status: status.isActive ? "active" : status.isExpired ? "expired" : "none",
    statusLabel: status.isActive ? "Actif" : status.isExpired ? "Expiré" : "Aucun abonnement",
    expiresAt: status.expiresAt,
    daysRemaining: status.daysRemaining,
    readOnly: status.readOnly,
    features: {
      menu: status.features.canManageMenu,
      tables: status.features.canManageTables,
      calls: status.features.canReceiveCalls,
      reviews: status.features.canViewReviews,
      orders: status.features.canManageOrders,
      payments: status.features.canManagePayments,
      promos: status.features.canManagePromos,
      advanced: status.features.canAccessAdvanced,
    },
  };
}
