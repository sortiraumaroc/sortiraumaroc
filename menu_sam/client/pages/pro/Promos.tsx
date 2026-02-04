import * as React from "react";
import { toast } from "sonner";

import { HelpTooltip } from "@/components/pro/help-tooltip";
import { ProShell } from "@/components/pro/pro-shell";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { useAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { Pause, Play, Trash2, Plus } from "lucide-react";

type Promo = {
  id: number;
  code: string;
  discountValue: number | string;
  discountType: "percent" | "amount" | string;
  status: number; // 1 active, 0 inactive
  description?: string | null;
  startsAt?: string | Date | null;
  expiresAt?: string | Date | null;
};

function formatDiscount(p: Promo) {
  const val =
    typeof p.discountValue === "string"
      ? Number.parseFloat(p.discountValue)
      : p.discountValue;

  if (!Number.isFinite(val)) return "—";
  return p.discountType === "percent" ? `${val}%` : `${val} Dhs`;
}

function statusBadge(status: number) {
  const active = status === 1;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        active
          ? "border-sam-success/25 bg-sam-success/10 text-sam-success"
          : "border-black/10 bg-black/5 text-black/60",
      )}
    >
      {active ? "Actif" : "Inactif"}
    </span>
  );
}

export default function ProPromos() {
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const accessToken = useAuthToken("client");

  const [promos, setPromos] = React.useState<Promo[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [code, setCode] = React.useState("");
  const [discountValue, setDiscountValue] = React.useState<number | "">("");
  const [discountType, setDiscountType] = React.useState<"percent" | "amount">("percent");

  const [creating, setCreating] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<number | null>(null);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);

  const loadPromos = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/mysql/promos/${selectedPlaceId}`);
      if (!response.ok) {
        toast.error("Impossible de charger les codes promo");
        setPromos([]);
        return;
      }
      const data = await response.json().catch(() => null);
      setPromos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error loading promos:", error);
      toast.error("Erreur lors du chargement des codes promo");
      setPromos([]);
    } finally {
      setLoading(false);
    }
  }, [selectedPlaceId]);

  React.useEffect(() => {
    void loadPromos();
  }, [loadPromos]);

  const addPromo = React.useCallback(async () => {
    if (!accessToken || !selectedPlaceId) return toast.error("Non authentifié");

    const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
    const d = typeof discountValue === "number" && Number.isFinite(discountValue) ? discountValue : null;

    if (!c || d === null) return toast.error("Code et réduction requis");

    setCreating(true);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

      const res = await fetch("/api/mysql/promos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          placeId: selectedPlaceId,
          code: c,
          discountType,
          discountValue: d,
          description: null,
          startsAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          minOrderAmount: 0,
        }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        toast.error(error.error || "Création impossible");
        return;
      }

      setCode("");
      setDiscountValue("");
      toast.success("Code promo créé");
      await loadPromos();
    } catch (error) {
      console.error("Error adding promo:", error);
      toast.error("Création impossible");
    } finally {
      setCreating(false);
    }
  }, [code, discountValue, discountType, accessToken, selectedPlaceId, loadPromos]);

  const togglePromo = React.useCallback(
    async (promo: Promo) => {
      if (!accessToken) return toast.error("Non authentifié");

      setTogglingId(promo.id);
      try {
        const res = await fetch(`/api/mysql/promos/${promo.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ status: promo.status === 1 ? 0 : 1 }),
        });

        if (!res.ok) {
          toast.error("Impossible de modifier ce code");
          return;
        }

        toast.success(promo.status === 1 ? "Code désactivé" : "Code activé", { duration: 1400 });
        await loadPromos();
      } catch (error) {
        console.error("Error toggling promo:", error);
        toast.error("Modification impossible");
      } finally {
        setTogglingId(null);
      }
    },
    [accessToken, loadPromos],
  );

  const deletePromo = React.useCallback(
    async (promoId: number) => {
      if (!accessToken) return toast.error("Non authentifié");

      setDeletingId(promoId);
      try {
        const res = await fetch(`/api/mysql/promos/${promoId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) {
          toast.error("Impossible de supprimer ce code");
          return;
        }

        toast.success("Code supprimé", { duration: 1400 });
        await loadPromos();
      } catch (error) {
        console.error("Error deleting promo:", error);
        toast.error("Suppression impossible");
      } finally {
        setDeletingId(null);
      }
    },
    [accessToken, loadPromos],
  );

  const email = state.status === "signedIn" ? state.email : null;

  const disabledCreate =
    creating ||
    !code.trim() ||
    typeof discountValue !== "number" ||
    !Number.isFinite(discountValue);

  return (
    <ProShell
      title="Codes promo"
      subtitle={email ? `Connecté : ${email}` : undefined}
      onSignOut={() => void signOut()}
    >
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-black">Gestion des codes promo</div>
          <HelpTooltip label="Aide codes promo">
            <>Créez et gérez les codes promo pour votre établissement.</>
          </HelpTooltip>

          <Button
            type="button"
            variant="outline"
            onClick={() => void loadPromos()}
            className="ml-auto h-9 rounded-xl border-black/10 bg-white text-black hover:bg-black/5"
          >
            Rafraîchir
          </Button>
        </div>

        {/* Create */}
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
          <div className="grid gap-2 sm:grid-cols-[1fr_200px_140px]">
            <Input
              value={code}
              onChange={(e) => {
                const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
                setCode(next);
              }}
              placeholder="CODEPROMO"
              maxLength={20}
              autoCapitalize="characters"
              spellCheck={false}
              className="h-10 rounded-xl border-black/10 bg-white font-mono text-black placeholder:text-black/40"
            />

            <div className="flex gap-2">
              <Input
                value={discountValue}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (!raw) return setDiscountValue("");
                  const num = Number.parseFloat(raw);
                  setDiscountValue(Number.isFinite(num) ? num : "");
                }}
                placeholder={discountType === "percent" ? "%" : "Dhs"}
                inputMode="decimal"
                className="h-10 rounded-xl border-black/10 bg-white text-black placeholder:text-black/40"
              />

              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm text-black hover:bg-black/5"
                aria-label="Type de réduction"
              >
                <option value="percent">%</option>
                <option value="amount">Dhs</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={() => void addPromo()}
              disabled={disabledCreate}
              className="h-10 rounded-xl bg-sam-red text-white hover:bg-sam-red/90 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              <span className="ml-2">Ajouter</span>
            </Button>
          </div>

          <div className="mt-2 text-xs text-black/60">
            Astuce : utilisez un code court (ex: <span className="font-mono">WELCOME10</span>) et évitez les espaces.
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-black/5 text-xs text-black/60">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Réduction</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-black/10">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-black/60">
                    Chargement…
                  </td>
                </tr>
              ) : promos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-black/60">
                    Aucun code promo
                  </td>
                </tr>
              ) : (
                promos.map((p) => {
                  const active = p.status === 1;
                  const busy = togglingId === p.id || deletingId === p.id;

                  return (
                    <tr key={p.id} className="hover:bg-black/[0.02] transition">
                      <td className="px-4 py-4 font-mono text-black whitespace-nowrap">{p.code}</td>

                      <td className="px-4 py-4 text-black/80">{formatDiscount(p)}</td>

                      <td className="px-4 py-4">{statusBadge(p.status)}</td>

                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void togglePromo(p)}
                            disabled={busy}
                            className={cn(
                              "h-9 rounded-xl border-black/10 bg-white text-black hover:bg-black/5",
                              !active && "text-black/60",
                            )}
                            aria-label={active ? "Désactiver" : "Activer"}
                            title={active ? "Désactiver" : "Activer"}
                          >
                            {active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            <span className="ml-2 text-xs">{active ? "Désactiver" : "Activer"}</span>
                          </Button>

                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => void deletePromo(p.id)}
                            disabled={busy}
                            className="h-9 w-9 rounded-xl p-0 text-black/60 hover:bg-sam-red/10 hover:text-sam-red disabled:opacity-50"
                            aria-label="Supprimer"
                            title="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ProShell>
  );
}
