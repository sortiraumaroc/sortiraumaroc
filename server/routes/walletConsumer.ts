/**
 * Consumer Wallet — Portefeuille in-app pour consommateurs SAM.ma
 *
 * Endpoints :
 *   GET    /api/consumer/wallet                        — Mon wallet (auto-create)
 *   GET    /api/consumer/wallet/balance                — Solde rapide
 *   GET    /api/consumer/wallet/transactions            — Historique paginé
 *   GET    /api/consumer/wallet/transactions/:id        — Détail transaction
 *   POST   /api/consumer/wallet/send                    — Envoyer de l'argent
 *   POST   /api/consumer/wallet/recharge                — Initier recharge
 *   GET    /api/consumer/wallet/contacts                — Contacts récents
 *   GET    /api/consumer/wallet/contacts/search         — Rechercher utilisateur
 *   GET    /api/consumer/wallet/cards                   — Mes cartes
 *   POST   /api/consumer/wallet/cards                   — Ajouter carte
 *   DELETE /api/consumer/wallet/cards/:id               — Supprimer carte
 *   PUT    /api/consumer/wallet/cards/:id/default       — Carte par défaut
 *   POST   /api/consumer/wallet/pin                     — Définir/changer PIN
 */
import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zBody, zQuery, zParams } from "../lib/validate";
import {
  WalletTransactionsQuery,
  WalletTransactionParams,
  WalletSendBody,
  WalletRechargeBody,
  WalletContactSearchQuery,
  WalletAddCardBody,
  WalletCardParams,
  WalletPinBody,
} from "../schemas/walletConsumer";

const log = createModuleLogger("wallet-consumer");

// Rate limiters for sensitive financial endpoints
const walletSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives d'envoi, réessayez dans quelques minutes" },
  keyGenerator: (req) => (req as any).userId || req.ip || "unknown",
});

const walletRechargeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives de recharge, réessayez dans quelques minutes" },
  keyGenerator: (req) => (req as any).userId || req.ip || "unknown",
});

const walletPinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives PIN, réessayez dans quelques minutes" },
  keyGenerator: (req) => (req as any).userId || req.ip || "unknown",
});

// ============================================================================
// HELPERS
// ============================================================================

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/** Extract authenticated userId from Bearer token */
async function getAuthUserId(req: { header: (name: string) => string | undefined }): Promise<string | null> {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/** Ensure wallet exists for user — auto-create if missing */
async function ensureWallet(userId: string) {
  const supabase = getAdminSupabase();

  // Upsert: create if not exists
  const { data: existing } = await supabase
    .from("consumer_wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) return existing;

  // Create new wallet
  const { data: created, error } = await supabase
    .from("consumer_wallets")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (error) {
    // Race condition: another request created it
    const { data: retry } = await supabase
      .from("consumer_wallets")
      .select("*")
      .eq("user_id", userId)
      .single();
    return retry;
  }

  return created;
}

/** Get user display info from Supabase Auth */
async function getUserInfo(userId: string) {
  const supabase = getAdminSupabase();
  const { data } = await supabase.auth.admin.getUserById(userId);
  if (!data?.user) return null;
  const meta = data.user.user_metadata || {};
  return {
    id: data.user.id,
    name: [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.full_name || "Utilisateur",
    username: meta.username || null,
    phone: data.user.phone || meta.phone || null,
    avatar: meta.avatar_url || null,
  };
}

// ============================================================================
// GET MY WALLET (auto-create)
// ============================================================================

const getMyWallet: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const wallet = await ensureWallet(userId);
    if (!wallet) { res.status(500).json({ error: "Impossible de créer le wallet" }); return; }

    const supabase = getAdminSupabase();

    // Count cards
    const { count: cardsCount } = await supabase
      .from("consumer_wallet_cards")
      .select("id", { count: "exact", head: true })
      .eq("wallet_id", wallet.id);

    // Get user info for display
    const userInfo = await getUserInfo(userId);

    res.json({
      ok: true,
      wallet: {
        id: wallet.id,
        balance_cents: wallet.balance_cents,
        currency: wallet.currency,
        status: wallet.status,
        has_pin: !!wallet.pin_hash,
        cards_count: cardsCount ?? 0,
        user: userInfo,
      },
    });
  } catch (err) {
    log.error({ err }, "getMyWallet error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET BALANCE (quick)
// ============================================================================

const getBalance: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();
    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("balance_cents")
      .eq("user_id", userId)
      .maybeSingle();

    res.json({
      ok: true,
      balance_cents: wallet?.balance_cents ?? 0,
    });
  } catch (err) {
    log.error({ err }, "getBalance error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET TRANSACTIONS (paginated + filterable)
// ============================================================================

const getTransactions: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const page = safeInt(req.query.page, 1);
    const perPage = safeInt(req.query.per_page, 20);
    const offset = (page - 1) * perPage;

    const supabase = getAdminSupabase();

    // Get wallet
    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) {
      res.json({ ok: true, transactions: [], pagination: { page, per_page: perPage, total: 0 } });
      return;
    }

    // Build query
    let query = supabase
      .from("consumer_wallet_transactions")
      .select("*", { count: "exact" })
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false });

    // Filters
    const typeFilter = req.query.type as string | undefined;
    if (typeFilter) query = query.eq("type", typeFilter);

    const statusFilter = req.query.status as string | undefined;
    if (statusFilter) query = query.eq("status", statusFilter);

    // Pagination
    query = query.range(offset, offset + perPage - 1);

    const { data: transactions, error, count } = await query;

    if (error) {
      log.error({ err: error }, "getTransactions query failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({
      ok: true,
      transactions: transactions ?? [],
      pagination: {
        page,
        per_page: perPage,
        total: count ?? 0,
        has_more: offset + perPage < (count ?? 0),
      },
    });
  } catch (err) {
    log.error({ err }, "getTransactions error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET TRANSACTION DETAIL
// ============================================================================

const getTransactionDetail: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const txId = req.params.id;
    const supabase = getAdminSupabase();

    // Get wallet
    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) { res.status(404).json({ error: "Wallet introuvable" }); return; }

    const { data: tx } = await supabase
      .from("consumer_wallet_transactions")
      .select("*")
      .eq("id", txId)
      .eq("wallet_id", wallet.id)
      .maybeSingle();

    if (!tx) { res.status(404).json({ error: "Transaction introuvable" }); return; }

    // Enrich with counterpart info
    let counterpartInfo = null;
    if (tx.counterpart_user_id) {
      counterpartInfo = await getUserInfo(tx.counterpart_user_id);
    }

    res.json({
      ok: true,
      transaction: {
        ...tx,
        counterpart: counterpartInfo,
      },
    });
  } catch (err) {
    log.error({ err }, "getTransactionDetail error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// SEND MONEY (P2P transfer)
// ============================================================================

const sendMoney: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { recipientId, recipientUsername, recipientPhone, amount, note } = req.body;
    const amountCents = Math.round(amount * 100);

    if (amountCents <= 0) {
      res.status(400).json({ error: "Montant invalide" });
      return;
    }

    const supabase = getAdminSupabase();

    // Resolve recipient
    let recipientUserId: string | null = null;

    if (recipientId) {
      recipientUserId = recipientId;
    } else if (recipientUsername) {
      // Search by username in user metadata
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 50 });
      const match = users?.users?.find(
        (u: any) => u.user_metadata?.username?.toLowerCase() === recipientUsername.toLowerCase(),
      );
      recipientUserId = match?.id ?? null;
    } else if (recipientPhone) {
      // Search by phone
      const cleanPhone = recipientPhone.replace(/\s/g, "");
      const { data: users } = await supabase.auth.admin.listUsers({ perPage: 50 });
      const match = users?.users?.find(
        (u: any) => u.phone === cleanPhone || u.user_metadata?.phone === cleanPhone,
      );
      recipientUserId = match?.id ?? null;
    }

    if (!recipientUserId) {
      res.status(404).json({ error: "Destinataire introuvable" });
      return;
    }

    if (recipientUserId === userId) {
      res.status(400).json({ error: "Impossible d'envoyer à soi-même" });
      return;
    }

    // Ensure both wallets exist
    const senderWallet = await ensureWallet(userId);
    const receiverWallet = await ensureWallet(recipientUserId);

    if (!senderWallet || !receiverWallet) {
      res.status(500).json({ error: "Impossible de préparer les wallets" });
      return;
    }

    // Get display names
    const senderInfo = await getUserInfo(userId);
    const receiverInfo = await getUserInfo(recipientUserId);

    const senderLabel = `Envoi à ${receiverInfo?.name ?? "Utilisateur"}`;
    const receiverLabel = `Reçu de ${senderInfo?.name ?? "Utilisateur"}`;

    // Execute atomic transfer via RPC
    const { data: result, error: rpcError } = await supabase.rpc("transfer_consumer_wallet", {
      p_sender_wallet_id: senderWallet.id,
      p_receiver_wallet_id: receiverWallet.id,
      p_amount_cents: amountCents,
      p_sender_label: senderLabel,
      p_receiver_label: receiverLabel,
      p_description: note || null,
      p_sender_user_id: userId,
      p_receiver_user_id: recipientUserId,
    });

    if (rpcError) {
      const msg = rpcError.message || "";
      if (msg.includes("insufficient_funds")) {
        res.status(400).json({ error: "Solde insuffisant" });
        return;
      }
      if (msg.includes("sender_wallet_not_found_or_frozen")) {
        res.status(400).json({ error: "Votre wallet est inactif" });
        return;
      }
      if (msg.includes("receiver_wallet_not_found_or_frozen")) {
        res.status(400).json({ error: "Le wallet du destinataire est inactif" });
        return;
      }
      log.error({ err: rpcError }, "transfer_consumer_wallet RPC failed");
      res.status(500).json({ error: "Erreur lors du transfert" });
      return;
    }

    const row = Array.isArray(result) ? result[0] : result;

    res.json({
      ok: true,
      transactionId: row?.sender_tx_id,
      sender_balance_after: row?.sender_balance_after ?? 0,
      recipient: receiverInfo,
    });
  } catch (err) {
    log.error({ err }, "sendMoney error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// RECHARGE (initiate payment)
// ============================================================================

const initiateRecharge: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { amount } = req.body;
    const amountCents = Math.round(amount * 100);

    const wallet = await ensureWallet(userId);
    if (!wallet) { res.status(500).json({ error: "Impossible de créer le wallet" }); return; }

    const supabase = getAdminSupabase();

    // Create a pending transaction
    const { data: pendingTx, error: txError } = await supabase
      .from("consumer_wallet_transactions")
      .insert({
        wallet_id: wallet.id,
        type: "recharge",
        amount_cents: amountCents,
        balance_after_cents: wallet.balance_cents, // sera mis à jour par le webhook
        label: `Recharge ${amount} MAD`,
        status: "pending",
        reference: `CW_RECHARGE_${Date.now()}`,
      })
      .select("id, reference")
      .single();

    if (txError || !pendingTx) {
      log.error({ err: txError }, "Failed to create pending recharge tx");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // NOTE: L'intégration LaCaissePay sera connectée quand le module sera prêt.
    // Pour l'instant, on retourne la transaction pending et un placeholder URL.
    // Le webhook de paiement appellera credit_consumer_wallet pour confirmer.

    res.json({
      ok: true,
      transactionId: pendingTx.id,
      reference: pendingTx.reference,
      amount_cents: amountCents,
      // paymentUrl sera rempli quand LaCaissePay est intégré
      paymentUrl: null,
      message: "Recharge en attente de paiement",
    });
  } catch (err) {
    log.error({ err }, "initiateRecharge error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// GET RECENT CONTACTS (from transaction history)
// ============================================================================

const getRecentContacts: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();

    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) {
      res.json({ ok: true, contacts: [] });
      return;
    }

    // Get distinct counterpart user IDs from recent transactions
    const { data: txs } = await supabase
      .from("consumer_wallet_transactions")
      .select("counterpart_user_id, created_at")
      .eq("wallet_id", wallet.id)
      .not("counterpart_user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);

    // Unique user IDs, preserving recency order
    const seen = new Set<string>();
    const uniqueIds: string[] = [];
    for (const tx of txs ?? []) {
      if (tx.counterpart_user_id && !seen.has(tx.counterpart_user_id)) {
        seen.add(tx.counterpart_user_id);
        uniqueIds.push(tx.counterpart_user_id);
      }
    }

    // Fetch user info for each
    const contacts = [];
    for (const uid of uniqueIds.slice(0, 20)) {
      const info = await getUserInfo(uid);
      if (info) {
        contacts.push({ ...info, onSam: true });
      }
    }

    res.json({ ok: true, contacts });
  } catch (err) {
    log.error({ err }, "getRecentContacts error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// SEARCH CONTACTS
// ============================================================================

const searchContacts: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const q = (req.query.q as string).trim().toLowerCase();
    const supabase = getAdminSupabase();

    // Search users via admin API
    const { data: usersData } = await supabase.auth.admin.listUsers({ perPage: 100 });
    const allUsers = usersData?.users ?? [];

    const matches = allUsers
      .filter((u: any) => {
        if (u.id === userId) return false; // exclude self
        const meta = u.user_metadata || {};
        const fullName = [meta.first_name, meta.last_name].join(" ").toLowerCase();
        const username = (meta.username || "").toLowerCase();
        const phone = (u.phone || meta.phone || "").replace(/\s/g, "");
        return (
          fullName.includes(q) ||
          username.includes(q) ||
          phone.includes(q)
        );
      })
      .slice(0, 20)
      .map((u: any) => {
        const meta = u.user_metadata || {};
        return {
          id: u.id,
          name: [meta.first_name, meta.last_name].filter(Boolean).join(" ") || meta.full_name || "Utilisateur",
          username: meta.username || null,
          phone: u.phone || meta.phone || null,
          avatar: meta.avatar_url || null,
          onSam: true,
        };
      });

    res.json({ ok: true, contacts: matches });
  } catch (err) {
    log.error({ err }, "searchContacts error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// CARDS CRUD
// ============================================================================

const getCards: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();
    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) {
      res.json({ ok: true, cards: [] });
      return;
    }

    const { data: cards } = await supabase
      .from("consumer_wallet_cards")
      .select("id, last4, network, expiry, is_default, created_at")
      .eq("wallet_id", wallet.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    res.json({ ok: true, cards: cards ?? [] });
  } catch (err) {
    log.error({ err }, "getCards error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

const addCard: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const wallet = await ensureWallet(userId);
    if (!wallet) { res.status(500).json({ error: "Erreur wallet" }); return; }

    const { token, last4, network, expiry } = req.body;
    const supabase = getAdminSupabase();

    // Check if first card → set as default
    const { count } = await supabase
      .from("consumer_wallet_cards")
      .select("id", { count: "exact", head: true })
      .eq("wallet_id", wallet.id);

    const isDefault = (count ?? 0) === 0;

    const { data: card, error } = await supabase
      .from("consumer_wallet_cards")
      .insert({
        wallet_id: wallet.id,
        token,
        last4,
        network,
        expiry,
        is_default: isDefault,
      })
      .select("id, last4, network, expiry, is_default")
      .single();

    if (error) {
      log.error({ err: error }, "addCard insert failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true, card });
  } catch (err) {
    log.error({ err }, "addCard error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

const deleteCard: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const cardId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) { res.status(404).json({ error: "Wallet introuvable" }); return; }

    const { error } = await supabase
      .from("consumer_wallet_cards")
      .delete()
      .eq("id", cardId)
      .eq("wallet_id", wallet.id);

    if (error) {
      log.error({ err: error }, "deleteCard failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "deleteCard error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

const setDefaultCard: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const cardId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: wallet } = await supabase
      .from("consumer_wallets")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!wallet) { res.status(404).json({ error: "Wallet introuvable" }); return; }

    // Unset all defaults
    await supabase
      .from("consumer_wallet_cards")
      .update({ is_default: false })
      .eq("wallet_id", wallet.id);

    // Set this one
    const { error } = await supabase
      .from("consumer_wallet_cards")
      .update({ is_default: true })
      .eq("id", cardId)
      .eq("wallet_id", wallet.id);

    if (error) {
      log.error({ err: error }, "setDefaultCard failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "setDefaultCard error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// PIN
// ============================================================================

const setPin: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { new_pin } = req.body;
    const supabase = getAdminSupabase();

    // Simple hash (en production, utiliser bcrypt)
    // Pour l'instant on stocke un hash basique
    const pinHash = Buffer.from(new_pin).toString("base64");

    const { error } = await supabase
      .from("consumer_wallets")
      .update({ pin_hash: pinHash })
      .eq("user_id", userId);

    if (error) {
      log.error({ err: error }, "setPin failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "setPin error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// REGISTER ROUTES
// ============================================================================

export function registerWalletConsumerRoutes(app: Express) {
  // Wallet
  app.get("/api/consumer/wallet", getMyWallet);
  app.get("/api/consumer/wallet/balance", getBalance);

  // Transactions
  app.get(
    "/api/consumer/wallet/transactions",
    zQuery(WalletTransactionsQuery),
    getTransactions,
  );
  app.get(
    "/api/consumer/wallet/transactions/:id",
    zParams(WalletTransactionParams),
    getTransactionDetail,
  );

  // Send money (rate limited: 10/15min per user)
  app.post(
    "/api/consumer/wallet/send",
    walletSendLimiter,
    zBody(WalletSendBody),
    sendMoney,
  );

  // Recharge (rate limited: 5/15min per user)
  app.post(
    "/api/consumer/wallet/recharge",
    walletRechargeLimiter,
    zBody(WalletRechargeBody),
    initiateRecharge,
  );

  // Contacts
  app.get("/api/consumer/wallet/contacts", getRecentContacts);
  app.get(
    "/api/consumer/wallet/contacts/search",
    zQuery(WalletContactSearchQuery),
    searchContacts,
  );

  // Cards
  app.get("/api/consumer/wallet/cards", getCards);
  app.post(
    "/api/consumer/wallet/cards",
    zBody(WalletAddCardBody),
    addCard,
  );
  app.delete(
    "/api/consumer/wallet/cards/:id",
    zParams(WalletCardParams),
    deleteCard,
  );
  app.put(
    "/api/consumer/wallet/cards/:id/default",
    zParams(WalletCardParams),
    setDefaultCard,
  );

  // PIN (rate limited: 5/15min per user — brute-force protection)
  app.post(
    "/api/consumer/wallet/pin",
    walletPinLimiter,
    zBody(WalletPinBody),
    setPin,
  );

  log.info("Consumer wallet routes registered");
}
