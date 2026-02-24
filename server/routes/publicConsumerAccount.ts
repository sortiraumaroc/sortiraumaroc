import type { Request, Response } from "express";

import { createHash, randomBytes } from "crypto";
import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicConsumerAccount");

import {
  revokeAllTrustedDevices,
  listTrustedDevices,
  revokeTrustedDevice,
  revokeCurrentDevice,
} from "../trustedDeviceLogic";
import { sendTemplateEmail } from "../emailService";

import {
  getAdminSupabase,
  asString,
  asRecord,
  addDaysIso,
  getUserFromBearerToken,
  normalizeUserMetaString,
  loadConsumerReliabilitySnapshot,
  normalizeReasonCode,
  normalizeReasonText,
  insertConsumerAccountEvent,
  getRequestLang,
  getRequestBaseUrl,
  getRequestIp,
  type ConsumerMePayload,
} from "./publicHelpers";

// ---------------------------------------------------------------------------
// Consumer account handlers
// ---------------------------------------------------------------------------

export async function getConsumerMe(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const meta = (asRecord(userResult.user?.user_metadata) ?? {}) as Record<
    string,
    unknown
  >;

  const reliability = await loadConsumerReliabilitySnapshot({
    userId: userResult.userId,
  });

  // Fetch city, country, socio_professional_status from consumer_users table
  const supabase = getAdminSupabase();
  let consumerRow: Record<string, unknown> | null = null;
  {
    const { data, error: selErr } = await supabase
      .from("consumer_users")
      .select("city, country, socio_professional_status")
      .eq("id", userResult.userId)
      .maybeSingle();

    if (!selErr) {
      consumerRow = data as Record<string, unknown> | null;
    } else {
      // Fallback: column might not exist yet, try without socio_professional_status
      const { data: fallback } = await supabase
        .from("consumer_users")
        .select("city, country")
        .eq("id", userResult.userId)
        .maybeSingle();
      consumerRow = fallback as Record<string, unknown> | null;
    }
  }

  // Read city/country/socio from consumer_users first, fallback to user_metadata
  const cityValue = (typeof consumerRow?.city === "string" && consumerRow.city) ? consumerRow.city : normalizeUserMetaString(meta, "city");
  const countryValue = (typeof consumerRow?.country === "string" && consumerRow.country) ? consumerRow.country : normalizeUserMetaString(meta, "country");
  const socioValue = (typeof consumerRow?.socio_professional_status === "string" && consumerRow.socio_professional_status) ? consumerRow.socio_professional_status : normalizeUserMetaString(meta, "socio_professional_status");

  const payload: ConsumerMePayload = {
    id: userResult.userId,
    first_name: normalizeUserMetaString(meta, "first_name"),
    last_name: normalizeUserMetaString(meta, "last_name"),
    phone: normalizeUserMetaString(meta, "phone"),
    email: userResult.email,
    date_of_birth: normalizeUserMetaString(meta, "date_of_birth"),
    city: cityValue,
    country: countryValue,
    socio_professional_status: socioValue,
    reliability_score: reliability.score,
    reliability_level: reliability.level,
  };

  return res.status(200).json(payload);
}

export async function updateConsumerMe(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token);
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  const body = asRecord(req.body) ?? {};
  const firstName = asString(body.first_name) ?? asString(body.firstName);
  const lastName = asString(body.last_name) ?? asString(body.lastName);
  const phone = asString(body.phone);
  const emailInput = asString(body.email);
  const dateOfBirth = asString(body.date_of_birth) ?? asString(body.dateOfBirth);
  const city = asString(body.city);
  const country = asString(body.country);
  const socioProfessionalStatus = asString(body.socio_professional_status);

  // Normaliser l'email
  const email = emailInput?.trim().toLowerCase() || null;

  // ── Vérification unicité email ──
  if (email) {
    // Ignorer les emails synthétiques phone.sortiraumaroc.ma
    if (!email.endsWith("@phone.sortiraumaroc.ma")) {
      // Vérifier que cet email n'est pas déjà utilisé par un autre compte (paginated)
      let emailTaken = false;
      for (let page = 1; page <= 50; page++) {
        const { data: authUsers, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr || !authUsers?.users?.length) break;
        if (authUsers.users.some((u: any) => u.email?.toLowerCase() === email && u.id !== userResult.userId)) {
          emailTaken = true;
          break;
        }
        if (authUsers.users.length < 1000) break;
      }
      if (emailTaken) {
        return res.status(409).json({
          error: "Cette adresse email est déjà utilisée par un autre compte.",
        });
      }
    }
  }

  // ── Vérification unicité téléphone (paginated) ──
  if (phone && phone.trim()) {
    const normalizedPhone = phone.trim();
    // Vérifier que ce numéro n'est pas déjà utilisé par un autre compte
    let phoneTaken = false;
    for (let page = 1; page <= 50; page++) {
      const { data: authUsers, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr || !authUsers?.users?.length) break;
      const match = authUsers.users.find((u: any) => {
        if (u.id === userResult.userId) return false;
        // Vérifier dans auth.users.phone
        if (u.phone === normalizedPhone) return true;
        // Vérifier dans les métadonnées
        const meta = u.user_metadata as Record<string, unknown> | undefined;
        if (meta && String(meta.phone ?? "") === normalizedPhone) return true;
        return false;
      });
      if (match) {
        phoneTaken = true;
        break;
      }
      if (authUsers.users.length < 1000) break;
    }
    if (phoneTaken) {
      return res.status(409).json({
        error: "Ce numéro de téléphone est déjà utilisé par un autre compte.",
      });
    }
  }

  const nextMeta: Record<string, unknown> = {
    ...(asRecord(userResult.user?.user_metadata) ?? {}),
    ...(firstName != null ? { first_name: firstName } : {}),
    ...(lastName != null ? { last_name: lastName } : {}),
    ...(phone != null ? { phone } : {}),
    ...(dateOfBirth != null ? { date_of_birth: dateOfBirth } : {}),
    ...(city != null ? { city } : {}),
    ...(country != null ? { country } : {}),
    ...(socioProfessionalStatus != null ? { socio_professional_status: socioProfessionalStatus } : {}),
  };

  // Préparer les champs de mise à jour auth (metadata + éventuellement email)
  const authUpdate: Record<string, unknown> = { user_metadata: nextMeta };
  if (email && !email.endsWith("@phone.sortiraumaroc.ma")) {
    // Mettre à jour l'email dans auth.users
    authUpdate.email = email;
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    authUpdate,
  );
  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Update consumer_users table for city, country, socio_professional_status, full_name, and email
  const consumerUpdate: Record<string, unknown> = {};
  if (city != null) consumerUpdate.city = city;
  if (country != null) consumerUpdate.country = country;
  if (socioProfessionalStatus != null) consumerUpdate.socio_professional_status = socioProfessionalStatus;
  if (firstName != null || lastName != null) {
    consumerUpdate.full_name = [firstName, lastName].filter(Boolean).join(" ");
  }
  if (email && !email.endsWith("@phone.sortiraumaroc.ma")) {
    consumerUpdate.email = email;
  }
  if (Object.keys(consumerUpdate).length > 0) {
    // Use upsert so the row is created if it doesn't exist yet
    // (users who signed up via OAuth/Apple/Google may not have a consumer_users row)
    const upsertPayload = {
      id: userResult.userId,
      email: email || userResult.email || `unknown+${userResult.userId}@example.invalid`,
      ...consumerUpdate,
    };
    log.info({ userId: userResult.userId, fields: Object.keys(consumerUpdate) }, "updateConsumerMe upserting consumer_users");
    const { error: cuErr } = await supabase
      .from("consumer_users")
      .upsert(upsertPayload, { onConflict: "id" });

    if (cuErr) {
      log.error({ err: cuErr, code: cuErr.code, details: cuErr.details }, "updateConsumerMe consumer_users upsert error");

      // If socio_professional_status column doesn't exist yet, retry without it
      if (socioProfessionalStatus != null) {
        delete consumerUpdate.socio_professional_status;
        if (Object.keys(consumerUpdate).length > 0) {
          const retryPayload = {
            id: userResult.userId,
            email: email || userResult.email || `unknown+${userResult.userId}@example.invalid`,
            ...consumerUpdate,
          };
          log.info({ fields: Object.keys(consumerUpdate) }, "updateConsumerMe retrying without socio_professional_status");
          const { error: retryErr } = await supabase
            .from("consumer_users")
            .upsert(retryPayload, { onConflict: "id" });
          if (retryErr) {
            log.error({ err: retryErr, code: retryErr.code }, "updateConsumerMe retry also failed");
          }
        }
      }
    } else {
      log.info("updateConsumerMe consumer_users upsert success");
    }

    // Also ensure consumer_user_stats row exists
    await supabase
      .from("consumer_user_stats")
      .upsert({ user_id: userResult.userId }, { onConflict: "user_id" })
      .then(() => {});
  }

  const reliability = await loadConsumerReliabilitySnapshot({
    userId: userResult.userId,
  });

  // Read back consumer_users data (may have been updated above or earlier)
  let consumerRow: Record<string, unknown> | null = null;
  {
    const { data, error: selErr } = await supabase
      .from("consumer_users")
      .select("city, country, socio_professional_status")
      .eq("id", userResult.userId)
      .maybeSingle();

    if (!selErr) {
      consumerRow = data as Record<string, unknown> | null;
    } else {
      const { data: fallback } = await supabase
        .from("consumer_users")
        .select("city, country")
        .eq("id", userResult.userId)
        .maybeSingle();
      consumerRow = fallback as Record<string, unknown> | null;
    }
  }

  const payload: ConsumerMePayload = {
    id: userResult.userId,
    first_name: firstName ?? normalizeUserMetaString(nextMeta, "first_name"),
    last_name: lastName ?? normalizeUserMetaString(nextMeta, "last_name"),
    phone: phone ?? normalizeUserMetaString(nextMeta, "phone"),
    email: email ?? userResult.email,
    date_of_birth: dateOfBirth ?? normalizeUserMetaString(nextMeta, "date_of_birth"),
    city: city ?? (typeof consumerRow?.city === "string" && consumerRow.city ? consumerRow.city : null) ?? normalizeUserMetaString(nextMeta, "city"),
    country: country ?? (typeof consumerRow?.country === "string" && consumerRow.country ? consumerRow.country : null) ?? normalizeUserMetaString(nextMeta, "country"),
    socio_professional_status: socioProfessionalStatus ?? (typeof consumerRow?.socio_professional_status === "string" && consumerRow.socio_professional_status ? consumerRow.socio_professional_status : null) ?? normalizeUserMetaString(nextMeta, "socio_professional_status"),
    reliability_score: reliability.score,
    reliability_level: reliability.level,
  };

  return res.status(200).json(payload);
}

export async function deactivateConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const reasonCode = normalizeReasonCode(body.reason_code ?? body.reasonCode);
  const reasonText = normalizeReasonText(body.reason_text ?? body.reasonText);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "deactivated",
      deactivated_at: nowIso,
      deleted_at: null,
      account_reason_code: reasonCode,
      account_reason_text: reasonText,
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.deactivated",
    metadata: {
      reason_code: reasonCode,
      reason_text: reasonText,
      ip,
      user_agent: userAgent,
    },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_account_deactivated",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName },
      meta: {
        user_id: userResult.userId,
        action: "account.deactivated",
        reason_code: reasonCode,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

export async function reactivateConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const supabase = getAdminSupabase();

  // Check if account is already active - skip if so to avoid duplicate notifications
  const { data: currentUser } = await supabase
    .from("consumer_users")
    .select("account_status")
    .eq("id", userResult.userId)
    .single();

  if (currentUser?.account_status === "active") {
    return res.status(200).json({ ok: true, already_active: true });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "active",
      deactivated_at: null,
      account_reason_code: null,
      account_reason_text: null,
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.reactivated",
    metadata: { ip, user_agent: userAgent },
  });

  return res.status(200).json({ ok: true });
}

export async function deleteConsumerAccount(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const reasonCode = normalizeReasonCode(body.reason_code ?? body.reasonCode);
  const reasonText = normalizeReasonText(body.reason_text ?? body.reasonText);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const nowIso = new Date().toISOString();
  const placeholderEmail = `deleted+${userResult.userId}@example.invalid`;

  const supabase = getAdminSupabase();

  const { error: updateErr } = await supabase
    .from("consumer_users")
    .update({
      account_status: "deleted",
      deleted_at: nowIso,
      deactivated_at: null,
      account_reason_code: reasonCode,
      account_reason_text: reasonText,
      email: placeholderEmail,
      full_name: "",
      city: "",
      country: "",
    })
    .eq("id", userResult.userId);

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  // Security: invalidate any outstanding export links.
  // After deletion/anonymization, we don't want old emailed links to keep working.
  const { error: expireErr } = await supabase
    .from("consumer_data_export_requests")
    .update({ status: "expired", expires_at: nowIso })
    .eq("user_id", userResult.userId);

  if (expireErr) {
    log.error({ err: expireErr }, "deleteConsumerAccount expire exports failed");
  }

  try {
    await supabase.auth.admin.updateUserById(userResult.userId, {
      email: placeholderEmail,
      user_metadata: {},
    });
  } catch (err) {
    log.warn({ err }, "auth user cleanup on account deletion failed");
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.deleted",
    metadata: {
      reason_code: reasonCode,
      reason_text: reasonText,
      ip,
      user_agent: userAgent,
    },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_account_deleted",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName },
      meta: {
        user_id: userResult.userId,
        action: "account.deleted",
        reason_code: reasonCode,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

export async function requestConsumerDataExport(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: true,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const body = asRecord(req.body) ?? {};
  const formatRaw = asString(body.format) ?? "json";
  const format = formatRaw.toLowerCase() === "csv" ? "csv" : "json";

  const tokenRaw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");

  const now = new Date();
  const expiresAt = addDaysIso(now, 7);

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();

  const { error: insertErr } = await supabase
    .from("consumer_data_export_requests")
    .insert({
      user_id: userResult.userId,
      format,
      status: "ready",
      token_hash: tokenHash,
      expires_at: expiresAt,
      ip,
      user_agent: userAgent,
    });

  if (insertErr) return res.status(500).json({ error: insertErr.message });

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "account.export_requested",
    metadata: { format, ip, user_agent: userAgent },
  });

  const baseUrl = getRequestBaseUrl(req);
  const downloadUrl = baseUrl
    ? `${baseUrl}/api/consumer/account/export/download?token=${encodeURIComponent(tokenRaw)}`
    : `/api/consumer/account/export/download?token=${encodeURIComponent(tokenRaw)}`;

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  if (userResult.email) {
    void sendTemplateEmail({
      templateKey: "user_data_export_ready",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [userResult.email],
      variables: { user_name: userName, cta_url: downloadUrl },
      ctaUrl: downloadUrl,
      meta: {
        user_id: userResult.userId,
        action: "account.export_requested",
        format,
      },
    });
  }

  return res.status(200).json({ ok: true });
}

/**
 * Request a password reset - sends a new temporary password to the user's email.
 */
export async function requestConsumerPasswordReset(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  if (!userResult.email) {
    return res.status(400).json({ error: "no_email" });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  // Generate a secure temporary password
  const tempPassword = randomBytes(12).toString("base64url").slice(0, 12);

  const supabase = getAdminSupabase();

  // Update user's password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    { password: tempPassword },
  );

  if (updateErr) {
    log.error({ err: updateErr }, "requestConsumerPasswordReset updateUserById failed");
    return res.status(500).json({ error: "password_update_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.reset_requested",
    metadata: { ip, user_agent: userAgent },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Send email with temporary password
  void sendTemplateEmail({
    templateKey: "user_password_reset",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [userResult.email],
    variables: {
      user_name: userName,
      temp_password: tempPassword,
    },
    meta: {
      user_id: userResult.userId,
      action: "password.reset_requested",
    },
  });

  return res.status(200).json({ ok: true });
}

/**
 * Change the user's password. Requires current password for verification.
 */
export async function changeConsumerPassword(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  if (!userResult.email) {
    return res.status(400).json({ error: "no_email" });
  }

  const body = asRecord(req.body) ?? {};
  const currentPassword = asString(body.current_password) ?? "";
  const newPassword = asString(body.new_password) ?? "";

  if (!currentPassword.trim()) {
    return res.status(400).json({ error: "current_password_required" });
  }
  if (!newPassword.trim()) {
    return res.status(400).json({ error: "new_password_required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "password_too_short" });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;

  const supabase = getAdminSupabase();

  // Verify current password by attempting to sign in
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: userResult.email,
    password: currentPassword,
  });

  if (signInErr) {
    await insertConsumerAccountEvent({
      userId: userResult.userId,
      eventType: "password.change_failed",
      metadata: { ip, user_agent: userAgent, reason: "invalid_current_password" },
    });
    return res.status(400).json({ error: "invalid_current_password" });
  }

  // Update to new password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    userResult.userId,
    { password: newPassword },
  );

  if (updateErr) {
    log.error({ err: updateErr }, "changeConsumerPassword updateUserById failed");
    return res.status(500).json({ error: "password_update_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.changed",
    metadata: { ip, user_agent: userAgent },
  });

  // Revoke all trusted devices on password change (security measure)
  try {
    await revokeAllTrustedDevices(userResult.userId);
  } catch (err) {
    log.warn({ err }, "revokeAllTrustedDevices on password change failed");
  }

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Send confirmation email
  void sendTemplateEmail({
    templateKey: "user_password_changed",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [userResult.email],
    variables: { user_name: userName },
    meta: {
      user_id: userResult.userId,
      action: "password.changed",
    },
  });

  return res.status(200).json({ ok: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Trusted Devices Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List trusted devices for the current consumer user.
 * GET /api/consumer/account/trusted-devices
 */
export async function listConsumerTrustedDevices(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, { allowDeactivated: false });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const devices = await listTrustedDevices(req, userResult.userId);
  return res.json({ devices });
}

/**
 * Revoke a specific trusted device by ID.
 * POST /api/consumer/account/trusted-devices/:deviceId/revoke
 */
export async function revokeConsumerTrustedDevice(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, { allowDeactivated: false });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const deviceId = req.params.deviceId;
  if (!deviceId || typeof deviceId !== "string") {
    return res.status(400).json({ error: "missing_device_id" });
  }

  const success = await revokeTrustedDevice(userResult.userId, deviceId);
  if (!success) {
    return res.status(404).json({ error: "device_not_found" });
  }

  return res.json({ ok: true });
}

/**
 * Revoke ALL trusted devices for the current user.
 * POST /api/consumer/account/trusted-devices/revoke-all
 */
export async function revokeAllConsumerTrustedDevices(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, { allowDeactivated: false });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  const count = await revokeAllTrustedDevices(userResult.userId);

  // Also clear the current device cookie
  revokeCurrentDevice(req, res);

  return res.json({ ok: true, revoked: count });
}

/**
 * Request a password reset link - sends an email with a secure link to reset password.
 * Improvement over the temp password method - user creates their own new password.
 */
export async function requestConsumerPasswordResetLink(req: Request, res: Response) {
  const auth = String(req.headers.authorization ?? "");
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  const userResult = await getUserFromBearerToken(token, {
    allowDeactivated: false,
  });
  if (userResult.ok === false)
    return res.status(userResult.status).json({ error: userResult.error });

  // Check if user has email - phone-only users cannot use this flow
  const email = userResult.email;
  const isPhoneOnlyUser = email?.endsWith("@phone.sortiraumaroc.ma") ?? false;

  if (!email || isPhoneOnlyUser) {
    return res.status(400).json({ error: "no_email", phone_only: isPhoneOnlyUser });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  // Generate secure token
  const resetToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Store token in database
  const { error: insertErr } = await supabase
    .from("consumer_password_reset_tokens")
    .insert({
      user_id: userResult.userId,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
      ip_address: ip,
      user_agent: userAgent,
    });

  if (insertErr) {
    log.error({ err: insertErr }, "requestConsumerPasswordResetLink insert failed");
    return res.status(500).json({ error: "token_creation_failed" });
  }

  await insertConsumerAccountEvent({
    userId: userResult.userId,
    eventType: "password.reset_link_requested",
    metadata: { ip, user_agent: userAgent },
  });

  const userName = (() => {
    const meta = asRecord(userResult.user?.user_metadata) ?? {};
    const first =
      typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last =
      typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const full = `${first} ${last}`.trim();
    return full || "Utilisateur";
  })();

  // Build reset URL
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://sam.ma";
  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

  // Send email with reset link
  void sendTemplateEmail({
    templateKey: "user_password_reset_link",
    lang: getRequestLang(req),
    fromKey: "noreply",
    to: [email],
    variables: {
      user_name: userName,
      reset_url: resetUrl,
    },
    meta: {
      user_id: userResult.userId,
      action: "password.reset_link_requested",
    },
  });

  return res.status(200).json({ ok: true });
}

/**
 * Validate a password reset token - check if it's valid and not expired.
 * Returns user info (masked email) if valid.
 */
export async function validatePasswordResetToken(req: Request, res: Response) {
  const tokenRaw = typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });

  const supabase = getAdminSupabase();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("consumer_password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token", tokenRaw)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return res.status(404).json({ error: "invalid_token" });
  }

  // Check if already used
  if (tokenRow.used_at) {
    return res.status(410).json({ error: "token_already_used" });
  }

  // Check if expired
  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt <= new Date()) {
    return res.status(410).json({ error: "token_expired" });
  }

  // Get user email (masked)
  const { data: user } = await supabase.auth.admin.getUserById(tokenRow.user_id);
  const email = user?.user?.email ?? "";
  const maskedEmail = email ? maskEmail(email) : "";

  return res.status(200).json({
    ok: true,
    email: maskedEmail,
  });
}

/**
 * Complete password reset - set a new password using the reset token.
 */
export async function completePasswordReset(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const tokenRaw = asString(body.token) ?? "";
  const newPassword = asString(body.new_password) ?? "";

  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });
  if (!newPassword.trim()) return res.status(400).json({ error: "new_password_required" });
  if (newPassword.length < 8) return res.status(400).json({ error: "password_too_short" });

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  // Verify token
  const { data: tokenRow, error: tokenErr } = await supabase
    .from("consumer_password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token", tokenRaw)
    .maybeSingle();

  if (tokenErr || !tokenRow) {
    return res.status(404).json({ error: "invalid_token" });
  }

  if (tokenRow.used_at) {
    return res.status(410).json({ error: "token_already_used" });
  }

  const expiresAt = new Date(tokenRow.expires_at);
  if (expiresAt <= new Date()) {
    return res.status(410).json({ error: "token_expired" });
  }

  // Update password
  const { error: updateErr } = await supabase.auth.admin.updateUserById(
    tokenRow.user_id,
    { password: newPassword },
  );

  if (updateErr) {
    log.error({ err: updateErr }, "completePasswordReset updateUserById failed");
    return res.status(500).json({ error: "password_update_failed" });
  }

  // Mark token as used
  await supabase
    .from("consumer_password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  await insertConsumerAccountEvent({
    userId: tokenRow.user_id,
    eventType: "password.reset_completed",
    metadata: { ip, user_agent: userAgent },
  });

  // Revoke all trusted devices on password reset (security measure)
  try {
    await revokeAllTrustedDevices(tokenRow.user_id);
  } catch (err) {
    log.warn({ err }, "revokeAllTrustedDevices on password reset failed");
  }

  // Get user info for confirmation email
  const { data: user } = await supabase.auth.admin.getUserById(tokenRow.user_id);
  const email = user?.user?.email ?? "";
  const isPhoneEmail = email.endsWith("@phone.sortiraumaroc.ma");

  if (email && !isPhoneEmail) {
    const meta = asRecord(user?.user?.user_metadata) ?? {};
    const first = typeof meta.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta.last_name === "string" ? meta.last_name.trim() : "";
    const userName = `${first} ${last}`.trim() || "Utilisateur";

    void sendTemplateEmail({
      templateKey: "user_password_changed",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [email],
      variables: { user_name: userName },
      meta: {
        user_id: tokenRow.user_id,
        action: "password.reset_completed",
      },
    });
  }

  return res.status(200).json({ ok: true });
}

/**
 * PUBLIC: Request a password reset link - no auth required.
 * User provides email, server finds user, generates token, sends email.
 * Always returns 200 (even if email not found) to prevent enumeration.
 */
export async function requestPublicPasswordResetLink(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const emailRaw = asString(body.email) ?? "";
  const email = emailRaw.toLowerCase().trim();

  if (!email || !/.+@.+\..+/.test(email)) {
    // Still return 200 to prevent email enumeration
    return res.status(200).json({ ok: true });
  }

  const ip = getRequestIp(req);
  const userAgent = String(req.get("user-agent") ?? "").trim() || null;
  const supabase = getAdminSupabase();

  try {
    // Check if phone-only user
    if (email.endsWith("@phone.sortiraumaroc.ma")) {
      return res.status(200).json({ ok: true });
    }

    // Find user by email in consumer_users table
    const { data: consumerData } = await supabase
      .from("consumer_users")
      .select("id, email, full_name")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();

    if (!consumerData?.id) {
      // User not found - return 200 to prevent enumeration
      log.info({ email }, "PublicPasswordReset no user found");
      return res.status(200).json({ ok: true });
    }

    const userId = consumerData.id;

    // Generate secure token
    const resetToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    const { error: insertErr } = await supabase
      .from("consumer_password_reset_tokens")
      .insert({
        user_id: userId,
        token: resetToken,
        expires_at: expiresAt.toISOString(),
        ip_address: ip,
        user_agent: userAgent,
      });

    if (insertErr) {
      log.error({ err: insertErr }, "PublicPasswordReset insert failed");
      return res.status(200).json({ ok: true });
    }

    // Get user display name from auth metadata or consumer_users
    const userName = (() => {
      const fn = consumerData.full_name;
      if (fn && typeof fn === "string" && fn.trim()) return fn.trim();
      return "Utilisateur";
    })();

    // Build reset URL
    const baseUrl = process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || "https://sam.ma";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Send email with reset link (awaited so errors are caught)
    const emailResult = await sendTemplateEmail({
      templateKey: "user_password_reset_link",
      lang: getRequestLang(req),
      fromKey: "noreply",
      to: [email],
      variables: {
        user_name: userName,
        reset_url: resetUrl,
      },
      meta: {
        user_id: userId,
        action: "password.reset_link_requested_public",
      },
    });

    if (emailResult.ok === true) {
      log.info({ email }, "PublicPasswordReset reset link sent");
    } else {
      log.error({ email, detail: "error" in emailResult ? emailResult.error : "unknown" }, "PublicPasswordReset email send failed");
    }
  } catch (err) {
    log.error({ err }, "PublicPasswordReset error");
  }

  // Always return 200 to prevent enumeration
  return res.status(200).json({ ok: true });
}

/**
 * PUBLIC: Send welcome email after successful signup.
 * Called by the client after Supabase auth.signUp() succeeds.
 */
export async function sendWelcomeEmail(req: Request, res: Response) {
  const body = asRecord(req.body) ?? {};
  const userId = asString(body.user_id) ?? "";
  const email = asString(body.email) ?? "";

  if (!email || !/.+@.+\..+/.test(email.trim())) {
    return res.status(400).json({ error: "email_required" });
  }

  try {
    const userName = (() => {
      const name = asString(body.name) ?? "";
      return name || email.split("@")[0] || "Utilisateur";
    })();

    void sendTemplateEmail({
      templateKey: "user_welcome",
      lang: getRequestLang(req),
      fromKey: "hello",
      to: [email.trim().toLowerCase()],
      variables: {
        user_name: userName,
      },
      meta: {
        user_id: userId || null,
        action: "user.welcome",
      },
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    log.error({ err }, "WelcomeEmail error");
    return res.status(500).json({ error: "email_send_failed" });
  }
}

// ---------------------------------------------------------------------------
// Local helpers — exported for testing
// ---------------------------------------------------------------------------

/**
 * Helper to mask email for display (e.g., s***@gmail.com)
 * @internal — exported for testing
 */
export function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx <= 1) return email;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx);
  const masked = local[0] + "***" + (local.length > 1 ? local[local.length - 1] : "");
  return masked + domain;
}

/** @internal — exported for testing */
export function csvEscapeCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[\n\r",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function downloadConsumerDataExport(req: Request, res: Response) {
  const tokenRaw =
    typeof req.query.token === "string" ? req.query.token.trim() : "";
  if (!tokenRaw) return res.status(400).json({ error: "missing_token" });

  const tokenHash = createHash("sha256").update(tokenRaw).digest("hex");
  const supabase = getAdminSupabase();

  const nowIso = new Date().toISOString();

  const { data: requestRow, error: requestErr } = await supabase
    .from("consumer_data_export_requests")
    .select("id,user_id,format,expires_at,status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (requestErr || !requestRow)
    return res.status(404).json({ error: "not_found" });

  const expiresAtIso =
    typeof (requestRow as any).expires_at === "string"
      ? String((requestRow as any).expires_at)
      : "";
  if (expiresAtIso && Date.parse(expiresAtIso) <= Date.now()) {
    void supabase
      .from("consumer_data_export_requests")
      .update({ status: "expired" })
      .eq("id", (requestRow as any).id);
    return res.status(410).json({ error: "expired" });
  }

  const userId = String((requestRow as any).user_id ?? "");
  const format =
    String((requestRow as any).format ?? "json").toLowerCase() === "csv"
      ? "csv"
      : "json";

  const [userRowRes, reservationsRes, purchasesRes, eventsRes] =
    await Promise.all([
      supabase
        .from("consumer_users")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("reservations")
        .select(
          "id,booking_reference,kind,establishment_id,user_id,status,starts_at,ends_at,party_size,amount_total,amount_deposit,currency,meta,created_at,payment_status,checked_in_at,updated_at,refusal_reason_code,refusal_reason_custom,is_from_waitlist",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("consumer_purchases")
        .select(
          "id,user_id,currency,total_amount,status,purchased_at,items,metadata",
        )
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false })
        .limit(2000),
      supabase
        .from("consumer_user_events")
        .select("id,user_id,event_type,occurred_at,metadata")
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false })
        .limit(5000),
    ]);

  const userRow = userRowRes.error ? null : (userRowRes.data as any);
  const reservations = reservationsRes.error
    ? []
    : ((reservationsRes.data as any[]) ?? []);
  const purchases = purchasesRes.error
    ? []
    : ((purchasesRes.data as any[]) ?? []);
  const events = eventsRes.error ? [] : ((eventsRes.data as any[]) ?? []);

  void supabase
    .from("consumer_data_export_requests")
    .update({ status: "delivered", delivered_at: nowIso })
    .eq("id", (requestRow as any).id);

  if (format === "csv") {
    const rows: Array<{
      type: string;
      id: string;
      created_at: string;
      data: string;
    }> = [];

    if (userRow) {
      rows.push({
        type: "user",
        id: String(userRow.id ?? userId),
        created_at: String(userRow.updated_at ?? userRow.created_at ?? nowIso),
        data: JSON.stringify(userRow),
      });
    }

    for (const r of reservations) {
      rows.push({
        type: "reservation",
        id: String(r.id ?? ""),
        created_at: String(r.created_at ?? nowIso),
        data: JSON.stringify(r),
      });
    }

    for (const p of purchases) {
      rows.push({
        type: "purchase",
        id: String(p.id ?? ""),
        created_at: String(p.purchased_at ?? nowIso),
        data: JSON.stringify(p),
      });
    }

    for (const e of events) {
      rows.push({
        type: "event",
        id: String(e.id ?? ""),
        created_at: String(e.occurred_at ?? nowIso),
        data: JSON.stringify(e),
      });
    }

    const header = ["type", "id", "created_at", "data"].join(",");
    const csvBody = rows
      .map((r) =>
        [
          csvEscapeCell(r.type),
          csvEscapeCell(r.id),
          csvEscapeCell(r.created_at),
          csvEscapeCell(r.data),
        ].join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="sam-data-export-${userId}.csv"`,
    );
    return res.status(200).send([header, csvBody].join("\n"));
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="sam-data-export-${userId}.json"`,
  );
  return res.status(200).json({
    generated_at: nowIso,
    user: userRow,
    reservations,
    purchases,
    events,
  });
}
