/**
 * Subscription Middleware
 *
 * Express middleware to enforce subscription-based access control.
 */

import { RequestHandler } from "express";
import { getSubscriptionStatus, SubscriptionFeature } from "../lib/subscription";

/**
 * Middleware to check if subscription is active
 */
export const requireActiveSubscription: RequestHandler = async (req, res, next) => {
  const placeId = parseInt(req.params.placeId || req.body.placeId, 10);

  if (!placeId || isNaN(placeId)) {
    return res.status(400).json({ error: "placeId is required" });
  }

  const status = await getSubscriptionStatus(placeId);

  if (!status.isActive) {
    if (status.isExpired) {
      return res.status(403).json({
        error: "subscription_expired",
        message: "Votre abonnement Menu Digital a expiré. Veuillez le renouveler pour continuer.",
        expiresAt: status.expiresAt,
        plan: status.plan,
      });
    }
    return res.status(403).json({
      error: "no_subscription",
      message: "Vous n'avez pas d'abonnement Menu Digital actif.",
    });
  }

  // Attach subscription status to request for downstream handlers
  (req as any).subscriptionStatus = status;
  next();
};

/**
 * Middleware factory to require a specific feature
 */
export function requireFeature(feature: SubscriptionFeature): RequestHandler {
  return async (req, res, next) => {
    const placeId = parseInt(req.params.placeId || req.body.placeId, 10);

    if (!placeId || isNaN(placeId)) {
      return res.status(400).json({ error: "placeId is required" });
    }

    const status = await getSubscriptionStatus(placeId);

    if (!status.isActive) {
      if (status.isExpired) {
        return res.status(403).json({
          error: "subscription_expired",
          message: "Votre abonnement Menu Digital a expiré.",
          expiresAt: status.expiresAt,
        });
      }
      return res.status(403).json({
        error: "no_subscription",
        message: "Aucun abonnement actif.",
      });
    }

    if (!status.features[feature]) {
      return res.status(403).json({
        error: "feature_not_available",
        message: getFeatureUpgradeMessage(feature),
        feature,
        currentPlan: status.plan,
        requiredPlan: "premium",
      });
    }

    (req as any).subscriptionStatus = status;
    next();
  };
}

/**
 * Middleware to require Premium plan
 */
export const requirePremium: RequestHandler = async (req, res, next) => {
  const placeId = parseInt(req.params.placeId || req.body.placeId, 10);

  if (!placeId || isNaN(placeId)) {
    return res.status(400).json({ error: "placeId is required" });
  }

  const status = await getSubscriptionStatus(placeId);

  if (!status.isActive) {
    return res.status(403).json({
      error: status.isExpired ? "subscription_expired" : "no_subscription",
      message: status.isExpired
        ? "Votre abonnement a expiré."
        : "Aucun abonnement actif.",
    });
  }

  if (status.plan !== "premium") {
    return res.status(403).json({
      error: "premium_required",
      message: "Cette fonctionnalité nécessite un abonnement Premium.",
      currentPlan: status.plan,
    });
  }

  (req as any).subscriptionStatus = status;
  next();
};

/**
 * Middleware to allow read-only access even if subscription expired
 * Useful for public menu viewing
 */
export const allowExpiredReadOnly: RequestHandler = async (req, res, next) => {
  const placeId = parseInt(req.params.placeId || req.query.placeId as string, 10);

  if (!placeId || isNaN(placeId)) {
    // Allow through if no placeId (might be a different route)
    return next();
  }

  const status = await getSubscriptionStatus(placeId);

  // Always allow read operations, just mark the subscription status
  (req as any).subscriptionStatus = status;
  (req as any).isReadOnly = status.readOnly;

  next();
};

/**
 * Get upgrade message for a feature
 */
function getFeatureUpgradeMessage(feature: SubscriptionFeature): string {
  const messages: Record<SubscriptionFeature, string> = {
    canManageMenu: "La gestion du menu nécessite un abonnement actif.",
    canManageTables: "La gestion des tables nécessite un abonnement actif.",
    canReceiveCalls: "Les appels serveur nécessitent un abonnement actif.",
    canViewReviews: "La consultation des avis nécessite un abonnement actif.",
    canManageOrders: "La commande à table est réservée au plan Premium. Passez à Premium pour activer cette fonctionnalité.",
    canManagePayments: "La gestion des paiements est réservée au plan Premium. Passez à Premium pour activer cette fonctionnalité.",
    canManagePromos: "Les codes promo sont réservés au plan Premium. Passez à Premium pour activer cette fonctionnalité.",
    canAccessAdvanced: "Les fonctionnalités avancées sont réservées au plan Premium. Passez à Premium pour les débloquer.",
  };

  return messages[feature] || "Cette fonctionnalité nécessite une mise à niveau de votre abonnement.";
}
