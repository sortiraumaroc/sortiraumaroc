export type EstablishmentLeadCategory = "Food" | "Loisirs" | "Sports" | "Bien-être" | "Tourisme";

export type EstablishmentLeadPayload = {
  full_name: string;
  establishment_name: string;
  city: string;
  phone: string;
  whatsapp: string;
  email: string;
  category: EstablishmentLeadCategory;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function submitEstablishmentLead(payload: EstablishmentLeadPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/leads/establishment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);

  if (res.ok) return { ok: true };

  const error = isRecord(data) && typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
  return { ok: false, error };
}
