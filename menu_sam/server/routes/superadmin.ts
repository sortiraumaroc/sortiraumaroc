import { Router } from "express";

import { getServerSupabaseClient, hasServerSupabaseServiceRole } from "../lib/supabase";

export const superadminRouter = Router();

type BootstrapResponse = { ok: boolean };

type PostgrestErrorLike = { message?: string } | null;

type AuthErrorLike = { message?: string; status?: number } | null;

function isAlreadyRegistered(error: AuthErrorLike | PostgrestErrorLike) {
  const msg = (error as any)?.message ?? "";
  return typeof msg === "string" && msg.toLowerCase().includes("already") && msg.toLowerCase().includes("registered");
}

superadminRouter.post("/bootstrap", async (_req, res) => {
  const email = process.env.SUPERADMIN_BOOTSTRAP_EMAIL ?? "";
  const password = process.env.SUPERADMIN_BOOTSTRAP_PASSWORD ?? "";

  // If not configured, don't block the UI.
  if (!email || !password) {
    const payload: BootstrapResponse = { ok: false };
    res.status(200).json(payload);
    return;
  }

  const supabase = getServerSupabaseClient();

  if (hasServerSupabaseServiceRole()) {
    const admin = supabase.auth.admin;
    const normalizedEmail = email.trim().toLowerCase();

    const userMeta = {
      role: "SUPERADMIN",
      must_change_password: true,
    };

    const listRes = await admin.listUsers({ page: 1, perPage: 200 });
    const users = ((listRes as any)?.data?.users ?? []) as any[];
    const existing = users.find((u) => (u?.email ?? "").toLowerCase() === normalizedEmail) ?? null;

    if (existing) {
      await admin.updateUserById(existing.id, {
        password,
        user_metadata: { ...(existing.user_metadata as any), ...userMeta },
        email_confirm: true,
      });

      const payload: BootstrapResponse = { ok: true };
      res.status(200).json(payload);
      return;
    }

    const createRes = await admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: userMeta,
    });

    if (createRes.error && !isAlreadyRegistered(createRes.error)) {
      const payload: BootstrapResponse = { ok: false };
      res.status(200).json(payload);
      return;
    }

    const payload: BootstrapResponse = { ok: true };
    res.status(200).json(payload);
    return;
  }

  // Fallback (no service role): user will require email confirmation depending on Supabase settings.
  const signUpRes = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "SUPERADMIN",
        must_change_password: true,
      },
    },
  });

  if (signUpRes.error && !isAlreadyRegistered(signUpRes.error)) {
    const payload: BootstrapResponse = { ok: false };
    res.status(200).json(payload);
    return;
  }

  const payload: BootstrapResponse = { ok: true };
  res.status(200).json(payload);
});
