import type { AppLocale } from "@/lib/i18n/types";

import { getConsumerAccessToken } from "@/lib/auth";

const STORAGE_KEY = "sam_blog_poll_session_id_v1";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getOptionalPollSessionId(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage.getItem(STORAGE_KEY) ?? "";
    if (existing && isUuid(existing)) return existing;

    const next = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    window.localStorage.setItem(STORAGE_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export type BlogPollResults = {
  total_votes: number;
  counts: Array<{ option_index: number; count: number; percent: number }>;
  my_vote: number | null;
};

export async function getPublicBlogPollResults(args: {
  slug: string;
  pollId: string;
  locale: AppLocale;
}): Promise<BlogPollResults> {
  const slug = String(args.slug ?? "").trim();
  const pollId = String(args.pollId ?? "").trim();
  if (!slug) throw new Error("missing_slug");
  if (!pollId) throw new Error("missing_pollId");

  const token = await getConsumerAccessToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`/api/public/blog/${encodeURIComponent(slug)}/polls/${encodeURIComponent(pollId)}/results`, {
    method: "POST",
    credentials: "omit",
    headers,
    body: JSON.stringify({}),
  });

  if (!res.ok) throw new Error(`Failed to load poll results (${res.status})`);

  const payload = (await res.json()) as any;
  return {
    total_votes: typeof payload?.total_votes === "number" && Number.isFinite(payload.total_votes) ? Math.max(0, Math.floor(payload.total_votes)) : 0,
    counts: Array.isArray(payload?.counts) ? (payload.counts as any[]) : [],
    my_vote: typeof payload?.my_vote === "number" && Number.isFinite(payload.my_vote) ? Math.max(0, Math.floor(payload.my_vote)) : null,
  };
}

export async function votePublicBlogPoll(args: {
  slug: string;
  pollId: string;
  optionIndex: number;
}): Promise<BlogPollResults & { already_voted: boolean }> {
  const slug = String(args.slug ?? "").trim();
  const pollId = String(args.pollId ?? "").trim();
  const optionIndex = typeof args.optionIndex === "number" && Number.isFinite(args.optionIndex) ? Math.max(0, Math.floor(args.optionIndex)) : NaN;

  if (!slug) throw new Error("missing_slug");
  if (!pollId) throw new Error("missing_pollId");
  if (!Number.isFinite(optionIndex)) throw new Error("missing_optionIndex");

  const token = await getConsumerAccessToken();
  if (!token) throw new Error("unauthorized");

  const sessionId = getOptionalPollSessionId();
  const body: Record<string, unknown> = { option_index: optionIndex };
  if (sessionId) body.session_id = sessionId;

  const res = await fetch(`/api/public/blog/${encodeURIComponent(slug)}/polls/${encodeURIComponent(pollId)}/vote`, {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Failed to vote (${res.status})`);

  const payload = (await res.json()) as any;
  return {
    already_voted: Boolean(payload?.already_voted),
    total_votes: typeof payload?.total_votes === "number" && Number.isFinite(payload.total_votes) ? Math.max(0, Math.floor(payload.total_votes)) : 0,
    counts: Array.isArray(payload?.counts) ? (payload.counts as any[]) : [],
    my_vote: typeof payload?.my_vote === "number" && Number.isFinite(payload.my_vote) ? Math.max(0, Math.floor(payload.my_vote)) : null,
  };
}
