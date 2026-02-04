import * as React from "react";

import QRCode from "qrcode";
import { toast } from "sonner";
import { useParams } from "react-router-dom";

import { ProShell } from "@/components/pro/pro-shell";
import { QrTableDialog } from "@/components/pro/qr-table-dialog";
import { TableCreateDialog } from "@/components/pro/table-create-dialog";
import { useProSession } from "@/components/pro/use-pro-session";
import { useProPlace } from "@/contexts/pro-place-context";
import { useAuthToken } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { copyToClipboard, downloadDataUrl } from "@/lib/browser-actions";
import { getPublicAppOrigin } from "@/lib/public-app-url";
import { cn } from "@/lib/utils";

import { AlertTriangle, Copy, Download, ExternalLink, Plus, QrCode, Trash2 } from "lucide-react";

type QrTableRow = {
  id: string;
  tableNumber: number;
  isActive: boolean;
  createdAt: string;
};

type OpenOrderRow = {
  id: string;
  nbrTable: number;
  joinCode: string;
  status: string;
  dateCreation: string;
};

function buildTableUrl(tableNumber: number, slug?: string) {
  const { origin } = getPublicAppOrigin();
  if (!origin) {
    const basePath = slug ? `/${slug}` : "";
    return `${basePath}?table=${tableNumber}`;
  }
  const basePath = slug ? `/${slug}` : "";
  return new URL(`${basePath}?table=${tableNumber}`, origin).toString();
}

function statusBadge(isActive: boolean, openOrder: OpenOrderRow | null) {
  if (!isActive) {
    return { label: "Désactivée", className: "bg-gray-100 text-gray-600 border-gray-200" };
  }

  if (openOrder) {
    return { label: "Ouverte", className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }

  return { label: "Prête", className: "bg-blue-50 text-blue-700 border-blue-200" };
}

export default function ProTables() {
  const { slug: routeSlug } = useParams<{ slug?: string }>();
  const { state, signOut } = useProSession();
  const { selectedPlaceId } = useProPlace();
  const accessToken = useAuthToken("client");

  const [tables, setTables] = React.useState<QrTableRow[]>([]);
  const [openOrderByTableNumber, setOpenOrderByTableNumber] = React.useState<Record<number, OpenOrderRow>>({});
  const [loading, setLoading] = React.useState(true);
  const [placeSlug, setPlaceSlug] = React.useState<string | undefined>(routeSlug);

  const publicOrigin = React.useMemo(() => getPublicAppOrigin(), []);

  const [filter, setFilter] = React.useState("");
  const [qrPngByTableId, setQrPngByTableId] = React.useState<Record<string, string>>({});

  const [createOpen, setCreateOpen] = React.useState(false);
  const [dialogTableId, setDialogTableId] = React.useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = React.useState<QrTableRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // Fetch place slug on mount
  React.useEffect(() => {
    if (placeSlug || !selectedPlaceId) return; // Already have slug from route

    const loadPlaceSlug = async () => {
      try {
        const res = await fetch(`/api/mysql/places/${selectedPlaceId}`);
        if (res.ok) {
          const place = await res.json();
          if (place.slug) {
            setPlaceSlug(place.slug);
          }
        }
      } catch (error) {
        console.error("Error loading place slug:", error);
      }
    };

    void loadPlaceSlug();
  }, [placeSlug, selectedPlaceId]);

  const load = React.useCallback(async () => {
    if (!selectedPlaceId) return;

    setLoading(true);

    try {
      // Get QR tables
      const tablesRes = await fetch(`/api/mysql/qr-tables/${selectedPlaceId}`);

      if (!tablesRes.ok) {
        toast.error("Impossible de charger les tables");
        setTables([]);
        setOpenOrderByTableNumber({});
        setLoading(false);
        return;
      }

      const tablesData = await tablesRes.json();
      const nextTables: QrTableRow[] = (Array.isArray(tablesData) ? tablesData : []).map((t: any) => ({
        id: String(t.id),
        tableNumber: t.tableNumber || t.nbrTable || 0,
        isActive: t.isActive !== false,
        createdAt: t.createdAt || new Date().toISOString(),
      }));

      setTables(nextTables);

      // Get open orders
      const ordersRes = await fetch(`/api/mysql/orders/${selectedPlaceId}`);

      if (!ordersRes.ok) {
        setOpenOrderByTableNumber({});
        setLoading(false);
        return;
      }

      const ordersData = await ordersRes.json();
      const nextMap: Record<number, OpenOrderRow> = {};

      const openOrders = (Array.isArray(ordersData) ? ordersData : []).filter((o: any) => o.status === "open");

      for (const o of openOrders) {
        const tableNum = o.nbrTable || o.tableNumber || 0;
        if (tableNum && !nextMap[tableNum]) {
          nextMap[tableNum] = {
            id: String(o.id),
            nbrTable: tableNum,
            joinCode: o.joinCode || "",
            status: o.status,
            dateCreation: o.dateCreation || new Date().toISOString(),
          };
        }
      }

      setOpenOrderByTableNumber(nextMap);
      setLoading(false);
    } catch (error) {
      console.error("Error loading tables:", error);
      toast.error("Erreur lors du chargement des tables");
      setLoading(false);
    }
  }, [selectedPlaceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filteredTables = React.useMemo(() => {
    const t = filter.trim();
    if (!t) return tables;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return tables;
    return tables.filter((o) => o.tableNumber === n);
  }, [filter, tables]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      const missing = filteredTables.filter((t) => !qrPngByTableId[t.id]);
      if (missing.length === 0) return;

      try {
        const entries = await Promise.all(
          missing.map(async (t) => {
            const url = buildTableUrl(t.tableNumber, placeSlug);
            const dataUrl = await QRCode.toDataURL(url, {
              width: 512,
              margin: 1,
              color: {
                dark: "#B0001A",
                light: "#FFFFFF",
              },
            });
            return [t.id, dataUrl] as const;
          }),
        );

        if (cancelled) return;

        setQrPngByTableId((prev) => {
          const next = { ...prev };
          for (const [id, dataUrl] of entries) next[id] = dataUrl;
          return next;
        });
      } catch {
        // ignore generation errors
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [filteredTables, qrPngByTableId, placeSlug]);

  const dialogTable = React.useMemo(() => {
    if (!dialogTableId) return null;
    return tables.find((t) => t.id === dialogTableId) ?? null;
  }, [dialogTableId, tables]);

  const createTable = React.useCallback(
    async (tableNumber: number) => {
      if (!accessToken) {
        toast.error("Non authentifié");
        return;
      }

      try {
        // Generate QR code first
        const url = buildTableUrl(tableNumber, placeSlug);
        let qrCodeData = "";
        try {
          qrCodeData = await QRCode.toDataURL(url, {
            width: 512,
            margin: 1,
            color: {
              dark: "#B0001A",
              light: "#FFFFFF",
            },
          });
        } catch (qrError) {
          console.warn("Failed to generate QR code, continuing without it", qrError);
          qrCodeData = ""; // Continue with empty QR code
        }

        const res = await fetch("/api/mysql/qr-tables", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            placeId: selectedPlaceId,
            tableNumber,
            qrCode: qrCodeData,
            slug: placeSlug,
          }),
        });

        if (!res.ok) {
          const error = await res.json();
          const msg = error.error || "";
          if (msg.toLowerCase().includes("duplicate") || msg.includes("23505")) {
            toast.message("Cette table existe déjà.");
            return;
          }
          toast.error("Création impossible (droits insuffisants ?)");
          return;
        }

        toast.success("Table créée");
        void load();
      } catch (error) {
        console.error("Error creating table:", error);
        toast.error("Création impossible");
      }
    },
    [accessToken, load, placeSlug, selectedPlaceId],
  );

  const confirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    if (!accessToken) {
      toast.error("Non authentifié");
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/mysql/qr-tables/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        toast.error("Impossible de supprimer cette table");
        return;
      }

      toast.success("Table supprimée");
      setTables((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    } catch (error) {
      console.error("Error deleting table:", error);
      toast.error("Suppression impossible");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, accessToken]);

  const email = state.status === "signedIn" ? state.email : null;

  const dialogOpenOrder = dialogTable ? openOrderByTableNumber[dialogTable.tableNumber] ?? null : null;


  const [siteUrl, setSiteUrl] = React.useState("");
  const [siteQr, setSiteQr] = React.useState<string | null>(null);

  const siteDefaultUrl = React.useMemo(() => {
    const { origin } = getPublicAppOrigin();
    const basePath = placeSlug ? `/${placeSlug}` : "";
    if (!origin) return `${basePath}`; // fallback (preview)
    return new URL(basePath, origin).toString();
  }, [placeSlug]);

  React.useEffect(() => {
    // Remplir automatiquement le lien par défaut (site)
    setSiteUrl(siteDefaultUrl);
  }, [siteDefaultUrl]);

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!siteUrl) return;
      try {
        const dataUrl = await QRCode.toDataURL(siteUrl, {
          width: 512,
          margin: 1,
          color: { dark: "#B0001A", light: "#FFFFFF" },
        });
        if (!cancelled) setSiteQr(dataUrl);
      } catch {
        if (!cancelled) setSiteQr(null);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [siteUrl]);


  return (
    <ProShell title="Tables & QR" subtitle={email ? `Connecté : ${email}` : undefined} onSignOut={() => void signOut()}>
      {/* Light background wrapper */}
      <div className="bg-white text-black">

                {/* QR du site (au-dessus de la gestion des tables) */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 mb-2 pb-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Qr code général</div>
                <div className="mt-1 text-xs text-gray-600">
                  Lien par défaut : page publique du restaurant (/{placeSlug || "slug"}).
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border border-gray-200 bg-white text-black hover:bg-gray-50"
                  onClick={async () => {
                    const ok = await copyToClipboard(siteUrl);
                    if (ok) toast.success("Lien copié");
                    else toast.message("Copie impossible — copiez manuellement.");
                  }}
                >
                  <Copy className="h-4 w-4" />
                  <span className="ml-1">Copier lien</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl border border-gray-200 bg-white text-black hover:bg-gray-50"
                  onClick={() => window.open(siteUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="ml-1">Ouvrir</span>
                </Button>

                <Button
                  type="button"
                  className="h-10 rounded-xl bg-sam-red px-3 text-white hover:bg-sam-red/90"
                  disabled={!siteQr}
                  onClick={() => {
                    if (!siteQr) return;
                    downloadDataUrl(`site-${placeSlug || "restaurant"}-qr.png`, siteQr);
                  }}
                >
                  <Download className="h-4 w-4" />
                  <span className="ml-1">Télécharger PNG</span>
                </Button>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px] md:items-start">
              <Input
                value={siteUrl}
                disabled={true}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://…"
                className="h-10 rounded-xl border border-gray-200 bg-white text-black placeholder:text-gray-400"
              />

              <div className="grid place-items-center rounded-2xl border border-gray-200 bg-white p-2">
                {siteQr ? (
                  <img src={siteQr} alt="QR site" className="h-40 w-40" />
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center text-xs text-gray-500">
                    QR preview
                  </div>
                )}
              </div>
            </div>
          </div>
        <TableCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createTable} />

        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent className="w-[92vw] max-w-[460px] rounded-3xl border border-gray-200 bg-white p-5 text-black shadow-xl">
            <AlertDialogHeader className="text-left">
              <AlertDialogTitle className="text-base">Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription className="text-xs leading-snug text-gray-600">
                {deleteTarget ? `La table ${deleteTarget.tableNumber} sera supprimée. (Les anciennes commandes ne sont pas effacées.)` : null}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <AlertDialogFooter className="mt-3 gap-2 sm:gap-2">
              <AlertDialogCancel asChild>
                <Button type="button" variant="secondary" className="h-10 rounded-2xl" disabled={deleting}>
                  Annuler
                </Button>
              </AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button
                  type="button"
                  className="h-10 rounded-2xl bg-sam-red text-white hover:bg-sam-red/90"
                  disabled={deleting}
                  onClick={() => void confirmDelete()}
                >
                  Supprimer
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {dialogTable ? (
          <QrTableDialog
            open
            onOpenChange={(open) => setDialogTableId(open ? dialogTableId : null)}
            tableNumber={dialogTable.tableNumber}
            orderStatus={dialogOpenOrder ? "Ouverte" : null}
            joinCode={dialogOpenOrder?.joinCode ?? null}
            url={buildTableUrl(dialogTable.tableNumber, placeSlug)}
            qrPngDataUrl={qrPngByTableId[dialogTable.id] ?? null}
          />
        ) : null}

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 xl:grid-cols-1">
       

            <div className={cn("rounded-2xl border border-gray-200 bg-white p-4", publicOrigin.usedFallback ? "" : "xl:col-span-2")}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold">QR de tables</div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="grid h-6 w-6 place-items-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-black hover:bg-gray-50"
                          aria-label="Aide QR de tables"
                        >
                          ?
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side="bottom"
                        align="start"
                        className="max-w-[320px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs leading-snug text-gray-700 shadow-lg"
                      >
                        Chaque table a un QR qui ouvre la carte en mode table avec le slug du restaurant. En scannant, le client peut rejoindre la commande existante.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="h-10 rounded-xl bg-sam-red px-3 text-white hover:bg-sam-red/90"
                  >
                    <Plus className="h-4 w-4" />
                    Ajouter
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void load()}
                    variant="outline"
                    className="h-10 rounded-xl border border-gray-200 bg-white text-black hover:bg-gray-50"
                  >
                    Rafraîchir
                  </Button>
                </div>
              </div>

              <div className="mt-3">
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filtrer par numéro de table"
                  inputMode="numeric"
                  className="h-10 rounded-xl border border-gray-200 bg-white text-black placeholder:text-gray-400"
                />
              </div>
            </div>
          </div>






          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {loading ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Chargement…</div>
            ) : filteredTables.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Aucune table.</div>
            ) : (
              filteredTables.map((t) => {
                const qr = qrPngByTableId[t.id] ?? null;
                const url = buildTableUrl(t.tableNumber, placeSlug);
                const openOrder = openOrderByTableNumber[t.tableNumber] ?? null;
                const badge = statusBadge(t.isActive, openOrder);

                return (
                  <div key={t.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">Table {t.tableNumber}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs", badge.className)}>
                            {badge.label}
                          </span>
                          {openOrder?.joinCode ? <span className="font-mono text-xs text-gray-700">{openOrder.joinCode}</span> : null}
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setDialogTableId(t.id)}
                          className="grid h-16 w-16 place-items-center rounded-2xl border border-gray-200 bg-white p-1"
                          aria-label={`Voir le QR de la table ${t.tableNumber}`}
                          title="Voir le QR"
                        >
                          {qr ? <img src={qr} alt="QR" className="h-full w-full" /> : <QrCode className="h-5 w-5 text-gray-500" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeleteTarget(t)}
                          className="grid h-10 w-10 place-items-center rounded-2xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                          aria-label={`Supprimer la table ${t.tableNumber}`}
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-10 rounded-xl"
                        onClick={async () => {
                          const ok = await copyToClipboard(url);
                          if (ok) toast.success("Lien copié");
                          else toast.message("Copie impossible — sélectionnez et copiez manuellement.");
                        }}
                      >
                        <Copy className="h-4 w-4" />
                        Copier lien
                      </Button>

                      <Button
                        type="button"
                        className="h-10 rounded-xl bg-sam-red text-white hover:bg-sam-red/90"
                        disabled={!qr}
                        onClick={() => {
                          if (!qr) return;
                          downloadDataUrl(`table-${t.tableNumber}-qr.png`, qr);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Télécharger
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
              <div className="grid grid-cols-[160px_1fr_120px_360px] gap-0 bg-gray-50 px-4 py-3 text-xs text-gray-600 lg:grid-cols-[220px_1fr_140px_420px]">
                <div className="whitespace-nowrap">Table</div>
                <div>Code & lien</div>
                <div className="whitespace-nowrap">Statut</div>
                <div className="whitespace-nowrap">Actions</div>
              </div>

              {loading ? (
                <div className="px-4 py-4 text-sm text-gray-600">Chargement…</div>
              ) : filteredTables.length === 0 ? (
                <div className="px-4 py-4 text-sm text-gray-600">Aucune table.</div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {filteredTables.map((t) => {
                    const qr = qrPngByTableId[t.id] ?? null;
                    const url = buildTableUrl(t.tableNumber, placeSlug);
                    const openOrder = openOrderByTableNumber[t.tableNumber] ?? null;
                    const badge = statusBadge(t.isActive, openOrder);

                    return (
                      <div
                        key={t.id}
                        className="grid grid-cols-[160px_1fr_120px_360px] items-center gap-0 bg-white px-4 py-4 hover:bg-gray-50 lg:grid-cols-[220px_1fr_140px_420px]"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setDialogTableId(t.id)}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-white"
                              aria-label={`Voir le QR de la table ${t.tableNumber}`}
                              title="Voir le QR"
                            >
                              {qr ? <img src={qr} alt="QR" className="h-9 w-9" /> : <QrCode className="h-4 w-4 text-gray-500" />}
                            </button>

                            <div className="min-w-0">
                              <div className="text-base font-semibold leading-none">Table {t.tableNumber}</div>
                              <div className="mt-1 text-xs text-gray-600">Scan → ouvre le menu en mode table</div>
                            </div>
                          </div>
                        </div>

                        <div className="min-w-0 pr-3">
                          <div className="space-y-1">
                            <div className="font-mono text-xs text-gray-900">{openOrder?.joinCode ?? "—"}</div>
                            <div className="text-xs text-gray-600 break-all" title={url}>
                              {url}
                            </div>
                          </div>
                        </div>

                        <div className="pr-3">
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-xs", badge.className)}>
                            {badge.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-black hover:bg-gray-50"
                            onClick={async () => {
                              const ok = await copyToClipboard(url);
                              if (ok) toast.success("Lien copié");
                              else toast.message("Copie impossible — sélectionnez et copiez manuellement.");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                            <span className="ml-1">Lien</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-black hover:bg-gray-50"
                            onClick={() => {
                              window.open(url, "_blank", "noopener,noreferrer");
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                            <span className="ml-1">Ouvrir</span>
                          </Button>

                          <Button
                            type="button"
                            className="h-9 rounded-xl bg-sam-red px-3 text-white hover:bg-sam-red/90"
                            disabled={!qr}
                            onClick={() => {
                              if (!qr) return;
                              downloadDataUrl(`table-${t.tableNumber}-qr.png`, qr);
                            }}
                          >
                            <Download className="h-4 w-4" />
                            <span className="ml-1">PNG</span>
                          </Button>

                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-black hover:bg-gray-50"
                            onClick={() => setDeleteTarget(t)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="ml-1">Supprimer</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProShell>
  );
}
